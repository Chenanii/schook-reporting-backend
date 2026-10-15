const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 10_000;
const attemptsByIp = new Map();

function removeExpiredEntries(now) {
  for (const [ip, entry] of attemptsByIp) {
    if (entry.resetAt <= now) attemptsByIp.delete(ip);
  }
}

const cleanupTimer = setInterval(() => {
  removeExpiredEntries(Date.now());
}, 60_000);
cleanupTimer.unref();

export function loginRateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  let entry = attemptsByIp.get(ip);

  if (!entry || entry.resetAt <= now) {
    if (attemptsByIp.size >= MAX_TRACKED_IPS) removeExpiredEntries(now);
    if (attemptsByIp.size >= MAX_TRACKED_IPS && !entry) {
      res.set('Retry-After', '60');
      return res.status(503).json({
        success: false,
        error: {
          code: 'LOGIN_RATE_LIMIT_CAPACITY',
          message: 'Login is temporarily unavailable. Please try again shortly.'
        }
      });
    }
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attemptsByIp.set(ip, entry);
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: {
        code: 'LOGIN_RATE_LIMITED',
        message: 'Too many login attempts. Please try again later.'
      }
    });
  }

  entry.count += 1;
  res.once('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      entry.count = Math.max(0, entry.count - 1);
      if (entry.count === 0 && attemptsByIp.get(ip) === entry) {
        attemptsByIp.delete(ip);
      }
    }
  });

  return next();
}
