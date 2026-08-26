// concurrencyLimiter.js
// Semaphore to limit concurrent request handling with AbortSignal and timeout support.

let maxConcurrent = parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 5;
let currentCount = 0;
const queue = [];

function acquire(signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      return reject(err);
    }

    if (currentCount < maxConcurrent) {
      currentCount++;
      return resolve();
    }

    let timer = null;
    let onAbort = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
        onAbort = null;
      }
    };

    const entry = {
      resolve: () => {
        cleanup();
        resolve();
      },
      reject: (err) => {
        cleanup();
        reject(err);
      }
    };

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) {
          queue.splice(idx, 1);
          const err = new Error('ETIMEDOUT');
          entry.reject(err);
        }
      }, timeoutMs);
    }

    if (signal) {
      onAbort = () => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) {
          queue.splice(idx, 1);
          const err = new Error('Request aborted');
          err.name = 'AbortError';
          entry.reject(err);
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    queue.push(entry);
  });
}

function release() {
  while (queue.length > 0) {
    const next = queue.shift();
    if (next) {
      // Hand over slot to the waiting request
      next.resolve();
      return;
    }
  }
  currentCount = Math.max(0, currentCount - 1);
}

function clearQueue() {
  let count = queue.length;
  while (queue.length > 0) {
    const entry = queue.shift();
    const err = new Error('Request cancelled: queue cleared');
    err.name = 'AbortError';
    entry.reject(err);
  }
  return count;
}

function setLimit(newLimit) {
  maxConcurrent = Math.max(1, parseInt(newLimit, 10) || 5);
}

function getCurrentCount() {
  return currentCount;
}

function getQueueLength() {
  return queue.length;
}

function getMaxConcurrent() {
  return maxConcurrent;
}

module.exports = {
  acquire,
  release,
  clearQueue,
  setLimit,
  getCurrentCount,
  getQueueLength,
  getMaxConcurrent
};
