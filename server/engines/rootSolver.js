/**
 * server/engines/rootSolver.js
 *
 * Thin Node wrapper around server/engines/root_solver.py for deterministic
 * high-precision real root finding (polynomials and trig-polynomial substitutions).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let cachedPythonBin = null;
const rootCache = new Map();
const MAX_CACHE_ENTRIES = 150;

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
  if (rootCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = rootCache.keys().next().value;
    rootCache.delete(oldestKey);
  }
  rootCache.set(key, val);
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
  const cacheKey = `${variable}::${equation}`;
  if (rootCache.has(cacheKey)) {
    return Promise.resolve(rootCache.get(cacheKey));
  }

  return new Promise((resolve) => {
    const pythonBin = resolvePython();
    const scriptPath = path.join(__dirname, 'root_solver.py');
    const payload = JSON.stringify({ equation, variable });

    let settled = false;
    let stdout = '';
    let stderr = '';
    let timer = null;

    const finish = (res) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(res);
    };

    try {
      const proc = spawn(pythonBin, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
        finish({ status: 'FAILED', error: `Root solver timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });

      proc.on('error', (err) => {
        finish({ status: 'FAILED', error: err.message });
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          finish({ status: 'FAILED', error: stderr.trim() || `Exited with code ${code}` });
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed && parsed.status === 'VERIFIED') {
            cacheSet(cacheKey, parsed);
          }
          finish(parsed);
        } catch (err) {
          finish({ status: 'FAILED', error: `Invalid JSON from root_solver.py: ${err.message}` });
        }
      });

      proc.stdin.write(payload);
      proc.stdin.end();
    } catch (err) {
      finish({ status: 'FAILED', error: err.message });
    }
  });
}

module.exports = {
  solveEquationRoots
};
