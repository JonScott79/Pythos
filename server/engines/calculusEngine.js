/**
 * server/engines/calculusEngine.js
 *
 * Pythos Dedicated Calculus Engine (SymPy 1.14.0 Backend)
 *
 * Architecture (MEDIUM-04 Hardened Worker Pool):
 * - Isolated worker subprocess pool with strict 1-task-per-worker concurrency model.
 * - Eliminates shared-pipe contention and cross-talk desynchronization.
 * - Per-task timeout isolation: a slow or hanging task terminates only its assigned worker,
 *   leaving all concurrent requests running unaffected on other workers.
 * - Automatic worker recycling and crash recovery.
 * - Bounded queue size, bounded execution time, and safe fail-closed behavior.
 * - Graceful startup, shutdown, and exit process hooks to ensure zero orphaned processes.
 *
 * Operations:
 * - differentiate(expression, { variable, order, point, timeoutMs })
 * - tangentLine(expression, { variable, point, timeoutMs })
 * - integrate(expression, { variable, isDefinite, lowerLimit, upperLimit, timeoutMs })
 * - limit(expression, { variable, target, direction, timeoutMs })
 * - optimize(expression, { variable, domainStart, domainEnd, timeoutMs })
 */

const { spawn } = require('child_process');
const path = require('path');
const { StringDecoder } = require('string_decoder');
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

// -------------------------------------------------------------
// Managed Worker Subprocess
// -------------------------------------------------------------

class CalculusWorker {
  constructor(id, onAvailable, onCrash) {
    this.id = id;
    this.onAvailable = onAvailable;
    this.onCrash = onCrash;
    this.proc = null;
    this.busy = false;
    this.currentTask = null;
    this.buffer = '';
    this.decoder = new StringDecoder('utf8');
    this.isDead = false;
  }

  start() {
    this.terminate();
    this.isDead = false;
    this.buffer = '';
    this.decoder = new StringDecoder('utf8');

    const pythonBin = resolvePython();
    const scriptPath = path.join(__dirname, 'calculus_worker.py');

    try {
      this.proc = spawn(pythonBin, [scriptPath, '--daemon'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
    } catch (spawnErr) {
      this.isDead = true;
      this.proc = null;
      if (this.currentTask) {
        const task = this.currentTask;
        this.currentTask = null;
        this.busy = false;
        task.resolve({
          status: 'FAILED',
          error: `Failed to spawn Python process (${pythonBin}): ${spawnErr.message}`
        });
      }
      return false;
    }

    this.proc.stdout.on('data', (chunk) => this._handleStdout(chunk));

    this.proc.on('error', (err) => {
      this._handleProcessFailure(`Calculus worker process error: ${err.message}`);
    });

    this.proc.on('close', (code, signal) => {
      this._handleProcessFailure(`Calculus worker exited (code=${code}, signal=${signal})`);
    });

    return true;
  }

  _handleStdout(chunk) {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    let nlIndex;
    while ((nlIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nlIndex).trim();
      this.buffer = this.buffer.slice(nlIndex + 1);
      if (!line) continue;

      if (!this.currentTask) continue;

      const task = this.currentTask;
      clearTimeout(task.timer);
      this.currentTask = null;
      this.busy = false;

      try {
        const parsed = JSON.parse(line);
        if (parsed && (parsed.status === 'VERIFIED' || parsed.status === 'SUCCESS')) {
          cacheSet(task.cacheKey, parsed);
        }
        task.resolve(parsed);
      } catch (parseErr) {
        task.resolve({
          status: 'FAILED',
          error: `Failed to parse calculus worker output: ${parseErr.message}`,
          rawOutput: line
        });
      }

      this.onAvailable(this);
    }
  }

  _handleProcessFailure(reason) {
    if (this.isDead) return;
    this.isDead = true;

    if (this.currentTask) {
      const task = this.currentTask;
      clearTimeout(task.timer);
      this.currentTask = null;
      this.busy = false;
      task.resolve({ status: 'FAILED', error: reason });
    }

    this.terminate();
    this.onCrash(this);
  }

  execute(task) {
    if (this.busy || !this.proc || this.isDead) {
      return false;
    }

    this.busy = true;
    this.currentTask = task;

    task.timer = setTimeout(() => {
      // Timeout isolation: ONLY THIS worker is terminated. Other concurrent tasks are untouched.
      this._handleTimeout(task);
    }, task.timeoutMs);

    try {
      const payloadWithId = { ...task.payload, _id: task.id };
      this.proc.stdin.write(JSON.stringify(payloadWithId) + '\n');
      return true;
    } catch (writeErr) {
      clearTimeout(task.timer);
      this.currentTask = null;
      this.busy = false;
      task.resolve({
        status: 'FAILED',
        error: `Failed to write to calculus worker stdin: ${writeErr.message}`
      });
      this.terminate();
      this.onCrash(this);
      return false;
    }
  }

  _handleTimeout(task) {
    this.currentTask = null;
    this.busy = false;
    this.terminate();
    task.resolve({
      status: 'FAILED',
      error: `Calculus worker timed out after ${task.timeoutMs}ms`
    });
    this.onCrash(this);
  }

  isAlive() {
    return Boolean(this.proc && !this.isDead && !this.proc.killed);
  }

  terminate() {
    this.isDead = true;
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      p.removeAllListeners('error');
      p.removeAllListeners('close');
      if (p.stdout) p.stdout.removeAllListeners('data');
      try { p.kill('SIGTERM'); } catch (_) {}
      try { p.kill('SIGKILL'); } catch (_) {}
    }
  }
}

// -------------------------------------------------------------
// Managed Worker Pool & Dispatcher
// -------------------------------------------------------------

const DEFAULT_POOL_SIZE = process.env.CALCULUS_MAX_WORKERS
  ? parseInt(process.env.CALCULUS_MAX_WORKERS, 10)
  : 2;
const MAX_QUEUE_SIZE = process.env.CALCULUS_MAX_QUEUE_SIZE
  ? parseInt(process.env.CALCULUS_MAX_QUEUE_SIZE, 10)
  : 50;

let pool = [];
let taskCounter = 0;
const taskQueue = [];
let isShuttingDown = false;

function initCalculusDaemon(poolSize = DEFAULT_POOL_SIZE) {
  if (isShuttingDown) return;
  if (pool.length > 0) return;

  const targetSize = Math.max(1, Math.min(poolSize, 8));
  for (let i = 1; i <= targetSize; i++) {
    const worker = new CalculusWorker(
      i,
      () => dispatchNext(),
      (w) => onWorkerCrash(w)
    );
    worker.start();
    pool.push(worker);
  }
}

function onWorkerCrash(crashedWorker) {
  if (isShuttingDown) return;
  // Automatically replace crashed worker to keep capacity stable
  crashedWorker.start();
  dispatchNext();
}

function dispatchNext() {
  if (isShuttingDown || taskQueue.length === 0) return;

  const idleWorker = pool.find(w => !w.busy && w.isAlive());
  if (!idleWorker) return;

  const task = taskQueue.shift();
  if (!task) return;
  clearTimeout(task.queueTimer);

  const ok = idleWorker.execute(task);
  if (!ok) {
    // If worker couldn't execute, re-queue and try next
    taskQueue.unshift(task);
  }
}

function runCalculusWorker(payload, timeoutMs = 8000) {
  const cacheKey = JSON.stringify(payload);
  if (calculusCache.has(cacheKey)) {
    return Promise.resolve(calculusCache.get(cacheKey));
  }

  if (isShuttingDown) {
    return Promise.resolve({
      status: 'FAILED',
      error: 'Calculus daemon is shut down'
    });
  }

  if (pool.length === 0) {
    initCalculusDaemon();
  }

  return new Promise((resolve) => {
    const taskId = ++taskCounter;
    const task = {
      id: taskId,
      payload,
      cacheKey,
      timeoutMs,
      resolve
    };

    // Check for an immediately available idle worker
    const idleWorker = pool.find(w => !w.busy && w.isAlive());
    if (idleWorker) {
      idleWorker.execute(task);
      return;
    }

    // Queue capacity guardrail (Fail closed)
    if (taskQueue.length >= MAX_QUEUE_SIZE) {
      return resolve({
        status: 'FAILED',
        error: `Calculus engine queue saturated (${taskQueue.length}/${MAX_QUEUE_SIZE} tasks pending)`
      });
    }

    // Enforce bounded waiting time in queue
    task.queueTimer = setTimeout(() => {
      const idx = taskQueue.indexOf(task);
      if (idx !== -1) {
        taskQueue.splice(idx, 1);
        resolve({
          status: 'FAILED',
          error: `Calculus task timed out in queue after ${timeoutMs}ms`
        });
      }
    }, timeoutMs);

    taskQueue.push(task);
  });
}

function getPoolStatus() {
  return {
    totalWorkers: pool.length,
    busyWorkers: pool.filter(w => w.busy).length,
    idleWorkers: pool.filter(w => !w.busy && w.isAlive()).length,
    queuedTasks: taskQueue.length,
    isShuttingDown
  };
}

function closeCalculusDaemon() {
  isShuttingDown = true;

  // Drain task queue safely
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    clearTimeout(task.queueTimer);
    task.resolve({ status: 'FAILED', error: 'Calculus daemon closed' });
  }

  // Terminate all worker subprocesses
  for (const worker of pool) {
    worker.terminate();
  }
  pool = [];
  isShuttingDown = false;
}

// Clean up child processes on process exit
process.once('exit', () => {
  closeCalculusDaemon();
});

// -------------------------------------------------------------
// Mathematical Operations
// -------------------------------------------------------------

/**
 * 1. SYMBOLIC DIFFERENTIATION
 */
async function differentiate(expression, options = {}) {
  const { variable = 'x', order = 1, point = null, timeoutMs = 8000 } = options;
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
  const { variable = 'x', point, timeoutMs = 8000 } = options;
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
    timeoutMs = 8000
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

module.exports = {
  differentiate,
  tangentLine,
  integrate,
  limit,
  optimize,
  runCalculusWorker,
  resolvePython,
  initCalculusDaemon,
  closeCalculusDaemon,
  getPoolStatus
};
