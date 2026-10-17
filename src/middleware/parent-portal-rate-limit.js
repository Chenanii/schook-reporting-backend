const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;

export function createParentPortalRateLimit(maxRequests) {
  const requestsByIp = new Map();

  function removeExpired(now) {
    for (const [ip, window] of requestsByIp) {
      if (window.resetAt <= now) requestsByIp.delete(ip);
    }
  }

  const cleanupTimer = setInterval(() => removeExpired(Date.now()), 60_000);
  cleanupTimer.unref();

  return function parentPortalRateLimit(req, res, next) {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    let window = requestsByIp.get(ip);

    if (!window || window.resetAt <= now) {
      if (requestsByIp.size >= MAX_TRACKED_IPS) removeExpired(now);
      if (requestsByIp.size >= MAX_TRACKED_IPS && !window) {
        return res.status(503).json({
          success: false,
          error: { code: 'PORTAL_RATE_LIMIT_CAPACITY', message: 'Parent account setup is temporarily unavailable.' },
        });
      }
      window = { count: 0, resetAt: now + WINDOW_MS };
      requestsByIp.set(ip, window);
    }

    if (window.count >= maxRequests) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))));
      return res.status(429).json({
        success: false,
        error: { code: 'PORTAL_RATE_LIMITED', message: 'Too many setup attempts. Please try again later.' },
      });
    }

    window.count += 1;
    return next();
  };
}

export const parentPortalRateLimit = createParentPortalRateLimit(5);
export const parentPortalRegistrationRateLimit = createParentPortalRateLimit(10);
