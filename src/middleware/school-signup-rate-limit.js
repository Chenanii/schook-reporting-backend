const WINDOW_MS = 15 * 60 * 1000;
const MAX_SIGNUPS = 5;
const MAX_TRACKED_IPS = 5_000;
const requestsByIp = new Map();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestsByIp) {
    if (entry.resetAt <= now) requestsByIp.delete(ip);
  }
}, 60_000);
cleanupTimer.unref();

export function schoolSignupRateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let entry = requestsByIp.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (requestsByIp.size >= MAX_TRACKED_IPS) {
      for (const [knownIp, knownEntry] of requestsByIp) {
        if (knownEntry.resetAt <= now) requestsByIp.delete(knownIp);
      }
    }
    if (!entry && requestsByIp.size >= MAX_TRACKED_IPS) {
      res.set('Retry-After', '60');
      return res.status(503).json({
        success: false,
        error: { code: 'SIGNUP_RATE_LIMIT_CAPACITY', message: 'Signup is temporarily unavailable.' }
      });
    }
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requestsByIp.set(ip, entry);
  }
  if (entry.count >= MAX_SIGNUPS) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return res.status(429).json({
      success: false,
      error: {
        code: 'SIGNUP_RATE_LIMITED',
        message: 'Too many signup attempts. Please try again later.'
      }
    });
  }
  entry.count += 1;
  return next();
}
