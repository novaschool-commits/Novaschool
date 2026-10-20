// Baseline security headers (audit finding S13), without extra packages.
// A Content-Security-Policy is NOT set yet: the single-page frontend uses
// inline scripts and inline onclick handlers, which a strict policy would
// block. Moving those into files is tracked as a remaining risk.
function securityHeaders({ isProduction }) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), microphone=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

// CORS: the frontend is served from the same origin, so cross-origin calls are
// refused unless an origin is listed in ALLOWED_ORIGINS.
function corsAllowList(allowed) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    next();
  };
}

module.exports = { securityHeaders, corsAllowList };
