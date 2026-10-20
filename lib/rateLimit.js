// Small fixed-window rate limiter with no dependencies (audit findings S2, S3).
//
// It keeps counters in this process's memory, which is correct for the
// current single Render instance. If NovaSchool ever runs several instances,
// replace the store with a shared one (Postgres or Redis); the interface
// below stays the same.

function createLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map(); // key -> { count, resetAt }

  function sweep(t) {
    if (hits.size < 5000) return;
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }

  return {
    // Records one hit. Returns { allowed, remaining, retryAfterSec }.
    hit(key) {
      const t = now();
      sweep(t);
      let e = hits.get(key);
      if (!e || e.resetAt <= t) { e = { count: 0, resetAt: t + windowMs }; hits.set(key, e); }
      e.count += 1;
      const allowed = e.count <= max;
      return { allowed, remaining: Math.max(0, max - e.count), retryAfterSec: allowed ? 0 : Math.ceil((e.resetAt - t) / 1000) };
    },
    // Looks without counting.
    peek(key) {
      const e = hits.get(key);
      const t = now();
      if (!e || e.resetAt <= t) return { blocked: false, retryAfterSec: 0 };
      return { blocked: e.count >= max, retryAfterSec: Math.ceil((e.resetAt - t) / 1000) };
    },
    reset(key) { hits.delete(key); },
    size() { return hits.size; }
  };
}

// The client address as Express resolves it with "trust proxy" set to one
// hop (app.js): the address Render's proxy saw, which a client cannot forge
// by sending its own X-Forwarded-For header.
function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Express middleware: limit by IP for one route group.
function limitByIp(limiter, message) {
  return (req, res, next) => {
    const r = limiter.hit(clientIp(req));
    if (!r.allowed) {
      res.set('Retry-After', String(r.retryAfterSec));
      return res.status(429).json({ error: message || 'Too many requests. Please wait and try again.' });
    }
    next();
  };
}

module.exports = { createLimiter, clientIp, limitByIp };
