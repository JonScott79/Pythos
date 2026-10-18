/**
 * engines/calculusEngine.js
 *
 * Pythos Dedicated Calculus Engine
 * Interfaces with Python SymPy 1.14.0 worker (calculus_worker.py)
 * Operations:
 * - differentiate(expression, { variable, order })
 * - integrate(expression, { variable, isDefinite, lowerLimit, upperLimit })
 * - limit(expression, { variable, target, direction })
 * - optimize(expression, { variable, domainStart, domainEnd })
 *
 * Guarantees:
 * - Independent verification check on all operations (FTC / differentiation cross-checks)
 * - Safe fail-closed error handling
 * - Automatic resolution of Python interpreter on Windows/Linux
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let cachedPythonBin = null;
const calculusCache = new Map();

function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  if (cachedPythonBin) return cachedPythonBin;

  if (process.platform === 'win32') {
    const directWin = 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
    if (fs.existsSync(directWin)) {
      cachedPythonBin = directWin;
      return cachedPythonBin;
    }
    cachedPythonBin = 'py';
  } else {
    cachedPythonBin = 'python3';
  }
  return cachedPythonBin;
}

let daemonProc = null;
let daemonQueue = [];
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
        const currentTask = daemonQueue.shift();
        if (currentTask) {
          try {
            const parsed = JSON.parse(line);
            currentTask.resolve(parsed);
          } catch (err) {
            currentTask.resolve({ status: 'FAILED', error: err.message });
          }
        }
      }
    });
    daemonProc.on('error', (err) => {
      while (daemonQueue.length) {
        daemonQueue.shift().resolve({ status: 'FAILED', error: err.message });
      }
      daemonProc = null;
    });
    daemonProc.on('close', () => {
      while (daemonQueue.length) {
        daemonQueue.shift().resolve({ status: 'FAILED', error: 'Calculus daemon closed' });
      }
      daemonProc = null;
    });
    return daemonProc;
  } catch (err) {
    return null;
  }
}

function runCalculusWorker(payload, timeoutMs = 15000) {
  const cacheKey = JSON.stringify(payload);
  if (calculusCache.has(cacheKey)) {
    return Promise.resolve(calculusCache.get(cacheKey));
  }

  const daemon = getDaemonProcess();
  if (daemon && daemon.stdin && daemon.stdin.writable) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          status: 'FAILED',
          error: `Calculus daemon timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);

      daemonQueue.push({
        resolve: (res) => {
          clearTimeout(timer);
          if (res && (res.status === 'VERIFIED' || res.status === 'SUCCESS')) {
            calculusCache.set(cacheKey, res);
          }
          resolve(res);
        }
      });
      daemon.stdin.write(JSON.stringify(payload) + '\n');
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
          calculusCache.set(cacheKey, parsed);
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
  const { variable = 'x', order = 1, timeoutMs = 10000 } = options;
  return await runCalculusWorker({
    operation: 'DIFFERENTIATION',
    expression,
    variable,
    order
  }, timeoutMs);
}

/**
 * 2. INDEFINITE & DEFINITE INTEGRATION
 */
async function integrate(expression, options = {}) {
  const {
    variable = 'x',
    isDefinite = false,
    lowerLimit = null,
    upperLimit = null,
    timeoutMs = 15000
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
 * 3. LIMITS
 */
async function limit(expression, options = {}) {
  const {
    variable = 'x',
    target = '0',
    direction = '+-', // '+-', '+', '-'
    timeoutMs = 10000
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
 * 4. OPTIMIZATION & CRITICAL POINTS
 */
async function optimize(expression, options = {}) {
  const {
    variable = 'x',
    domainStart = null,
    domainEnd = null,
    timeoutMs = 15000
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
    try { daemonProc.kill(); } catch (_) {}
    daemonProc = null;
    daemonQueue = [];
    daemonBuffer = '';
  }
}

module.exports = {
  differentiate,
  integrate,
  limit,
  optimize,
  runCalculusWorker,
  resolvePython,
  closeCalculusDaemon
};
