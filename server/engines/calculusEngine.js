/**
 * server/engines/calculusEngine.js
 *
 * Pythos Dedicated Calculus Engine
 * Interfaces with Python SymPy 1.14.0 worker (calculus_worker.py)
 * Operations:
 * - differentiate(expression, { variable, order, point })
 * - tangentLine(expression, { variable, point })
 * - integrate(expression, { variable, isDefinite, lowerLimit, upperLimit })
 * - limit(expression, { variable, target, direction })
 * - optimize(expression, { variable, domainStart, domainEnd })
 *
 * Guarantees:
 * - Independent verification check on all operations (FTC / differentiation cross-checks)
 * - Bounded timeouts and safe error handling
 * - Automatic resolution of Python interpreter on Windows/Linux
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let cachedPythonBin = null;
const calculusCache = new Map();
const MAX_CACHE_ENTRIES = 250;

function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  if (cachedPythonBin) return cachedPythonBin;

  if (process.platform === 'win32') {
    const directWin = 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
    if (fs.existsSync(directWin)) {
      cachedPythonBin = directWin;
      return cachedPythonBin;
    }
    const directWin2 = 'C:\\Users\\jonny\\AppData\\Local\\Python\\bin\\python.exe';
    if (fs.existsSync(directWin2)) {
      cachedPythonBin = directWin2;
      return cachedPythonBin;
    }
    cachedPythonBin = 'py';
  } else {
    const dockerVenv = '/opt/venv/bin/python3';
    if (fs.existsSync(dockerVenv)) {
      cachedPythonBin = dockerVenv;
      return cachedPythonBin;
    }
    cachedPythonBin = 'python3';
  }
  return cachedPythonBin;
}

function cacheSet(key, val) {
  if (calculusCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = calculusCache.keys().next().value;
    calculusCache.delete(oldestKey);
  }
  calculusCache.set(key, val);
}

let daemonProc = null;
const daemonPending = new Map();
let daemonReqCounter = 0;
let daemonBuffer = '';

function getDaemonProcess() {
  if (daemonProc && !daemonProc.killed) return daemonProc;
  const pythonBin = resolvePython();
  const scriptPath = path.join(__dirname, 'calculus_worker.py');
  try {
    daemonProc = spawn(pythonBin, [scriptPath, '--daemon'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    daemonProc.unref();
    daemonBuffer = '';
    daemonProc.stdout.on('data', (d) => {
      daemonBuffer += d.toString('utf8');
      let nlIndex;
      while ((nlIndex = daemonBuffer.indexOf('\n')) !== -1) {
        const line = daemonBuffer.slice(0, nlIndex).trim();
        daemonBuffer = daemonBuffer.slice(nlIndex + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          const reqId = parsed._id;
          if (reqId !== undefined && daemonPending.has(reqId)) {
            const task = daemonPending.get(reqId);
            daemonPending.delete(reqId);
            task.resolve(parsed);
          } else if (daemonPending.size > 0) {
            const firstKey = daemonPending.keys().next().value;
            const task = daemonPending.get(firstKey);
            daemonPending.delete(firstKey);
            task.resolve(parsed);
          }
        } catch (err) {
          if (daemonPending.size > 0) {
            const firstKey = daemonPending.keys().next().value;
            const task = daemonPending.get(firstKey);
            daemonPending.delete(firstKey);
            task.resolve({ status: 'FAILED', error: err.message });
          }
        }
      }
    });
    const thisProc = daemonProc;
    thisProc.on('error', (err) => {
      if (daemonProc === thisProc) {
        for (const [, task] of daemonPending.entries()) {
          task.resolve({ status: 'FAILED', error: err.message });
        }
        daemonPending.clear();
        daemonProc = null;
      }
    });
    thisProc.on('close', () => {
      if (daemonProc === thisProc) {
        for (const [, task] of daemonPending.entries()) {
          task.resolve({ status: 'FAILED', error: 'Calculus daemon closed' });
        }
        daemonPending.clear();
        daemonProc = null;
      }
    });
    return daemonProc;
  } catch (err) {
    return null;
  }
}

function runCalculusWorker(payload, timeoutMs = 8000) {
  const cacheKey = JSON.stringify(payload);
  if (calculusCache.has(cacheKey)) {
    return Promise.resolve(calculusCache.get(cacheKey));
  }

  const daemon = getDaemonProcess();
  if (daemon && daemon.stdin && daemon.stdin.writable) {
    return new Promise((resolve) => {
      const reqId = ++daemonReqCounter;
      const timer = setTimeout(() => {
        daemonPending.delete(reqId);
        if (daemonProc) {
          try { daemonProc.kill(); } catch (_) {}
          daemonProc = null;
        }
        resolve({
          status: 'FAILED',
          error: `Calculus daemon timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);

      daemonPending.set(reqId, {
        resolve: (res) => {
          clearTimeout(timer);
          if (res && (res.status === 'VERIFIED' || res.status === 'SUCCESS')) {
            cacheSet(cacheKey, res);
          }
          resolve(res);
        }
      });
      daemon.stdin.write(JSON.stringify({ ...payload, _id: reqId }) + '\n');
    });
  }

  return new Promise((resolve) => {
    const pythonBin = resolvePython();
    const scriptPath = path.join(__dirname, 'calculus_worker.py');

    let proc;
    try {
      proc = spawn(pythonBin, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
    } catch (spawnErr) {
      return resolve({
        status: 'FAILED',
        error: `Failed to spawn Python process (${pythonBin}): ${spawnErr.message}`
      });
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill(); } catch (_) {}
      resolve({
        status: 'FAILED',
        error: `Calculus worker timed out after ${timeoutMs}ms`
      });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        status: 'FAILED',
        error: `Calculus process error: ${err.message}`
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      if (code !== 0 && !stdout.trim()) {
        return resolve({
          status: 'FAILED',
          error: `Calculus worker exited with code ${code}: ${stderr.trim() || 'Unknown error'}`
        });
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed && (parsed.status === 'VERIFIED' || parsed.status === 'SUCCESS')) {
          cacheSet(cacheKey, parsed);
        }
        resolve(parsed);
      } catch (parseErr) {
        resolve({
          status: 'FAILED',
          error: `Failed to parse calculus worker output: ${parseErr.message}`,
          rawOutput: stdout.trim(),
          stderr: stderr.trim()
        });
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

/**
 * 1. SYMBOLIC DIFFERENTIATION
 */
async function differentiate(expression, options = {}) {
  const { variable = 'x', order = 1, point = null, timeoutMs = 5000 } = options;
  return await runCalculusWorker({
    operation: 'DIFFERENTIATION',
    expression,
    variable,
    order,
    point
  }, timeoutMs);
}

/**
 * 2. TANGENT LINE & INSTANTANEOUS SLOPE AT A POINT
 */
async function tangentLine(expression, options = {}) {
  const { variable = 'x', point, timeoutMs = 5000 } = options;
  return await runCalculusWorker({
    operation: 'TANGENT_LINE',
    expression,
    variable,
    point
  }, timeoutMs);
}

/**
 * 3. INDEFINITE & DEFINITE INTEGRATION
 */
async function integrate(expression, options = {}) {
  const {
    variable = 'x',
    isDefinite = false,
    lowerLimit = null,
    upperLimit = null,
    timeoutMs = 8000
  } = options;

  return await runCalculusWorker({
    operation: 'INTEGRATION',
    expression,
    variable,
    isDefinite,
    lowerLimit,
    upperLimit
  }, timeoutMs);
}

/**
 * 4. LIMITS
 */
async function limit(expression, options = {}) {
  const {
    variable = 'x',
    target = '0',
    direction = '+-',
    timeoutMs = 5000
  } = options;

  return await runCalculusWorker({
    operation: 'LIMIT',
    expression,
    variable,
    target,
    direction
  }, timeoutMs);
}

/**
 * 5. OPTIMIZATION & CRITICAL POINTS
 */
async function optimize(expression, options = {}) {
  const {
    variable = 'x',
    domainStart = null,
    domainEnd = null,
    timeoutMs = 8000
  } = options;

  return await runCalculusWorker({
    operation: 'OPTIMIZATION',
    expression,
    variable,
    domainStart,
    domainEnd
  }, timeoutMs);
}

function closeCalculusDaemon() {
  if (daemonProc) {
    const proc = daemonProc;
    daemonProc = null;
    proc.removeAllListeners('error');
    proc.removeAllListeners('close');
    if (proc.stdout) proc.stdout.removeAllListeners('data');
    try { proc.kill(); } catch (_) {}
    for (const [, task] of daemonPending.entries()) {
      task.resolve({ status: 'FAILED', error: 'Calculus daemon closed' });
    }
    daemonPending.clear();
    daemonBuffer = '';
  }
}

module.exports = {
  differentiate,
  tangentLine,
  integrate,
  limit,
  optimize,
  runCalculusWorker,
  resolvePython,
  closeCalculusDaemon
};
