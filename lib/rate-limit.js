/**
 * In-memory rate limiter.
 *
 * Keyed by IP (or any string). Tracks failed attempts in a sliding window
 * and returns a decision of { ok, retryAfter }.
 *
 * Caveats for Vercel serverless:
 *   - Each warm lambda instance has its own Map, so across-instance sharing
 *     is best-effort. For a single-user admin this is adequate:
 *       a) login is rare,
 *       b) scrypt alone caps throughput (~100 ms per attempt per instance),
 *       c) concurrent instances to the same IP are rare in practice.
 *   - For stricter guarantees we could plug in Vercel KV or Upstash, but
 *     that adds a paid/third-party dependency which the brief rules out.
 *
 * Counters auto-expire via lazy cleanup — no timers required.
 */

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX = 10;                   // 10 failed attempts per window
const LOCKOUT_MS = 15 * 60 * 1000;        // lock for 15 min once exceeded

// Shared across all invocations of the same warm instance.
const store = new Map();

function nowMs() { return Date.now(); }

function cleanup(now) {
  // Cap the map size — sweep anything older than 2× windowMs
  if (store.size < 1000) return;
  for (const [k, entry] of store) {
    if (now - entry.firstAt > 2 * DEFAULT_WINDOW_MS && now > entry.lockedUntil) {
      store.delete(k);
    }
  }
}

/**
 * Check whether `key` (e.g. an IP) is allowed another attempt right now.
 * Does NOT record anything — call recordFailure() on auth failure and
 * reset() on success.
 */
export function checkLimit(key, { windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX } = {}) {
  const now = nowMs();
  cleanup(now);
  const entry = store.get(key);
  if (!entry) return { ok: true };

  if (now < entry.lockedUntil) {
    return {
      ok: false,
      retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  if (now - entry.firstAt > windowMs) {
    // Window expired — reset
    store.delete(key);
    return { ok: true };
  }

  if (entry.count >= max) {
    entry.lockedUntil = now + LOCKOUT_MS;
    return {
      ok: false,
      retryAfter: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  return { ok: true };
}

/**
 * Record a failed attempt. Returns the new state.
 */
export function recordFailure(key, { windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX } = {}) {
  const now = nowMs();
  let entry = store.get(key);
  if (!entry || now - entry.firstAt > windowMs) {
    entry = { firstAt: now, count: 0, lockedUntil: 0 };
    store.set(key, entry);
  }
  entry.count += 1;
  if (entry.count >= max) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  return entry;
}

/**
 * Reset on successful auth.
 */
export function reset(key) {
  store.delete(key);
}

/**
 * Extract a best-effort client IP from a Vercel request.
 * Prefers x-forwarded-for (first IP in chain), falls back to socket.
 */
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length) {
    return String(xff[0]).split(',')[0].trim();
  }
  return (
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}
