const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const MAX_TRACKED_IPS = 10_000;
const requestsByIp = new Map();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestsByIp) {
    if (entry.resetAt <= now) requestsByIp.delete(ip);
  }
}, 60_000);
cleanupTimer.unref();

export function passwordResetRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = requestsByIp.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (requestsByIp.size >= MAX_TRACKED_IPS) {
      for (const [trackedIp, tracked] of requestsByIp) {
        if (tracked.resetAt <= now) requestsByIp.delete(trackedIp);
      }
    }
    if (requestsByIp.size >= MAX_TRACKED_IPS && !entry) {
      return res.status(503).json({
        success: false,
        error: { code: 'PASSWORD_RESET_UNAVAILABLE', message: 'Password reset is temporarily unavailable. Please try again shortly.' }
      });
    }
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requestsByIp.set(ip, entry);
  }
  if (entry.count >= MAX_REQUESTS) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return res.status(429).json({
      success: false,
      error: { code: 'PASSWORD_RESET_RATE_LIMITED', message: 'Too many password reset requests. Please try again later.' }
    });
  }
  entry.count += 1;
  return next();
}
