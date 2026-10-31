// concurrencyLimiter.js
// Semaphore to limit concurrent request handling with bounded queue, AbortSignal, and timeout support.

let maxConcurrent = parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 5;
let maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE, 10) || 50;
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

    if (queue.length >= maxQueueSize) {
      const err = new Error('EQUEUEFULL: Server request queue is full');
      err.code = 'QUEUE_FULL';
      err.status = 503;
      return reject(err);
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
      settled: false,
      resolve: () => {
        if (entry.settled) return false;
        entry.settled = true;
        cleanup();
        resolve();
        return true;
      },
      reject: (err) => {
        if (entry.settled) return false;
        entry.settled = true;
        cleanup();
        reject(err);
        return true;
      }
    };

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) {
          queue.splice(idx, 1);
        }
        const err = new Error('ETIMEDOUT');
        entry.reject(err);
      }, timeoutMs);
    }

    if (signal) {
      onAbort = () => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) {
          queue.splice(idx, 1);
        }
        const err = new Error('Request aborted');
        err.name = 'AbortError';
        entry.reject(err);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    queue.push(entry);
  });
}

function release() {
  while (queue.length > 0) {
    const next = queue.shift();
    if (next && !next.settled) {
      try {
        const handedOver = next.resolve();
        if (handedOver) {
          return;
        }
      } catch (_) {
        // Ignore handler error and try next queued request so queue is never corrupted
      }
    }
  }
  currentCount = Math.max(0, currentCount - 1);
}

function clearQueue() {
  let count = 0;
  while (queue.length > 0) {
    const entry = queue.shift();
    if (entry && !entry.settled) {
      const err = new Error('Request cancelled: queue cleared');
      err.name = 'AbortError';
      if (entry.reject(err)) {
        count++;
      }
    }
  }
  return count;
}

function setLimit(newLimit) {
  maxConcurrent = Math.max(1, parseInt(newLimit, 10) || 5);
}

function setMaxQueueSize(newMax) {
  const parsed = parseInt(newMax, 10);
  maxQueueSize = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
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

function getMaxQueueSize() {
  return maxQueueSize;
}

module.exports = {
  acquire,
  release,
  clearQueue,
  setLimit,
  setMaxQueueSize,
  getCurrentCount,
  getQueueLength,
  getMaxConcurrent,
  getMaxQueueSize
};
