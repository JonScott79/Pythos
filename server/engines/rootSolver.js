/**
 * server/engines/rootSolver.js
 *
 * Persistent-worker Node wrapper around server/engines/root_solver.py for
 * deterministic high-precision real root finding (polynomials & trig-polynomials).
 *
 * - Keeps a warm SymPy worker so subsequent uncached equations solve in ~10-185ms
 *   instead of paying ~1,250ms Python+SymPy cold-start per request.
 * - Serializes requests through a bounded FIFO queue (max 32) with per-task timeout
 *   isolation, crash recovery, and clean idle-unref / closeRootDaemon() shutdown.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { StringDecoder } = require('string_decoder');

let cachedPythonBin = null;
const rootCache = new Map();
const MAX_CACHE_ENTRIES = 150;
const MAX_QUEUE_SIZE = 32;

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

let rootTaskCounter = 0;

function cacheSet(key, val) {
  if (rootCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = rootCache.keys().next().value;
    rootCache.delete(oldestKey);
  }
  rootCache.set(key, val);
}

let daemonProc = null;
let daemonBuffer = '';
let daemonDecoder = new StringDecoder('utf8');
let activeTask = null;
const taskQueue = [];
let shuttingDown = false;

function setIdleUnref(proc, idle) {
  if (!proc) return;
  try {
    if (idle) {
      if (typeof proc.unref === 'function') proc.unref();
      if (proc.stdin && typeof proc.stdin.unref === 'function') proc.stdin.unref();
      if (proc.stdout && typeof proc.stdout.unref === 'function') proc.stdout.unref();
      if (proc.stderr && typeof proc.stderr.unref === 'function') proc.stderr.unref();
    } else {
      if (typeof proc.ref === 'function') proc.ref();
      if (proc.stdin && typeof proc.stdin.ref === 'function') proc.stdin.ref();
      if (proc.stdout && typeof proc.stdout.ref === 'function') proc.stdout.ref();
      if (proc.stderr && typeof proc.stderr.ref === 'function') proc.stderr.ref();
    }
  } catch (_) {}
}

function terminateDaemon() {
  if (daemonProc) {
    const p = daemonProc;
    daemonProc = null;
    p.removeAllListeners('error');
    p.removeAllListeners('close');
    if (p.stdout) p.stdout.removeAllListeners('data');
    if (p.stderr) p.stderr.removeAllListeners('data');
    if (p.stdin) p.stdin.removeAllListeners('error');
    try { if (p.stdin && !p.stdin.destroyed) p.stdin.destroy(); } catch (_) {}
    try { if (p.stdout && !p.stdout.destroyed) p.stdout.destroy(); } catch (_) {}
    try { if (p.stderr && !p.stderr.destroyed) p.stderr.destroy(); } catch (_) {}
    try {
      if (process.platform === 'win32') p.kill();
      else p.kill('SIGKILL');
    } catch (_) {}
  }
  daemonBuffer = '';
  daemonDecoder = new StringDecoder('utf8');
}

function ensureDaemon() {
  if (daemonProc && !daemonProc.killed) return daemonProc;
  const pythonBin = resolvePython();
  const scriptPath = path.join(__dirname, 'root_solver.py');
  daemonBuffer = '';
  daemonDecoder = new StringDecoder('utf8');

  const proc = spawn(pythonBin, [scriptPath, '--daemon'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  proc.stdout.on('data', (chunk) => {
    daemonBuffer += daemonDecoder.write(chunk);
    let nlIdx;
    while ((nlIdx = daemonBuffer.indexOf('\n')) !== -1) {
      const line = daemonBuffer.slice(0, nlIdx).trim();
      daemonBuffer = daemonBuffer.slice(nlIdx + 1);
      if (!line || !activeTask) continue;
      const task = activeTask;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        if (!task.settled) {
          task.settled = true;
          activeTask = null;
          clearTimeout(task.timer);
          task.resolve({ status: 'FAILED', error: `Invalid JSON from root_solver.py: ${err.message}` });
        }
        pumpQueue();
        continue;
      }

      if (parsed && parsed._id !== undefined && parsed._id !== task.id) {
        if (!task.settled) {
          task.settled = true;
          activeTask = null;
          clearTimeout(task.timer);
          task.resolve({ status: 'FAILED', error: `Root solver _id mismatch (expected ${task.id}, got ${parsed._id})` });
        }
        terminateDaemon();
        pumpQueue();
        continue;
      }

      if (!task.settled) {
        task.settled = true;
        activeTask = null;
        clearTimeout(task.timer);
        const cleanResult = (parsed && typeof parsed === 'object') ? { ...parsed } : parsed;
        if (cleanResult && '_id' in cleanResult) delete cleanResult._id;
        if (cleanResult && cleanResult.status === 'VERIFIED' && task.cacheKey) {
          cacheSet(task.cacheKey, cleanResult);
        }
        task.resolve(cleanResult);
      }
      pumpQueue();
    }
  });

  proc.stderr.on('data', () => {});

  const handleExit = (msg) => {
    if (daemonProc === proc) {
      daemonProc = null;
    }
    if (activeTask) {
      const task = activeTask;
      activeTask = null;
      clearTimeout(task.timer);
      if (!task.settled) {
        task.settled = true;
        task.resolve({ status: 'FAILED', error: msg });
      }
    }
    pumpQueue();
  };

  proc.on('error', (err) => handleExit(err.message));
  proc.on('close', (code) => handleExit(`Root solver worker exited with code ${code}`));
  if (proc.stdin) {
    proc.stdin.on('error', () => {});
  }

  daemonProc = proc;
  return proc;
}

function pumpQueue() {
  if (activeTask || shuttingDown) return;
  if (taskQueue.length === 0) {
    setIdleUnref(daemonProc, true);
    return;
  }

  const task = taskQueue.shift();
  const proc = ensureDaemon();
  setIdleUnref(proc, false);
  activeTask = task;

  task.timer = setTimeout(() => {
    if (activeTask === task) {
      activeTask = null;
      terminateDaemon();
      if (!task.settled) {
        task.settled = true;
        task.resolve({ status: 'FAILED', error: `Root solver timed out after ${task.timeoutMs}ms` });
      }
      pumpQueue();
    }
  }, task.timeoutMs);

  try {
    proc.stdin.write(JSON.stringify({ equation: task.equation, variable: task.variable, _id: task.id }) + '\n');
  } catch (err) {
    activeTask = null;
    clearTimeout(task.timer);
    terminateDaemon();
    if (!task.settled) {
      task.settled = true;
      task.resolve({ status: 'FAILED', error: err.message });
    }
    pumpQueue();
  }
}

/**
 * Solves an algebraic polynomial or trig-polynomial equation deterministically.
 * @param {string} equation - Equation string (e.g. "2*sin(x)^2 + csc(x) - 9 = 0")
 * @param {object} options - { variable?: string, timeoutMs?: number }
 * @returns {Promise<object>}
 */
function solveEquationRoots(equation, options = {}) {
  const variable = options.variable || 'x';
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000;
  const cacheKey = `${variable}::${String(equation || '').trim()}`;
  if (rootCache.has(cacheKey)) {
    return Promise.resolve(rootCache.get(cacheKey));
  }
  if (shuttingDown) {
    return Promise.resolve({ status: 'FAILED', error: 'Root solver daemon is shutting down' });
  }
  if (taskQueue.length >= MAX_QUEUE_SIZE) {
    return Promise.resolve({ status: 'FAILED', error: 'ROOT_QUEUE_SATURATED' });
  }

  return new Promise((resolve) => {
    taskQueue.push({ id: ++rootTaskCounter, equation, variable, timeoutMs, cacheKey, resolve, timer: null, settled: false });
    pumpQueue();
  });
}

function closeRootDaemon() {
  shuttingDown = true;
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    if (task.timer) clearTimeout(task.timer);
    if (!task.settled) {
      task.settled = true;
      task.resolve({ status: 'FAILED', error: 'Root solver daemon closed' });
    }
  }
  if (activeTask) {
    if (activeTask.timer) clearTimeout(activeTask.timer);
    if (!activeTask.settled) {
      activeTask.settled = true;
      activeTask.resolve({ status: 'FAILED', error: 'Root solver daemon closed' });
    }
    activeTask = null;
  }
  terminateDaemon();
  shuttingDown = false;
}

process.once('exit', () => {
  closeRootDaemon();
});

module.exports = {
  solveEquationRoots,
  closeRootDaemon
};
