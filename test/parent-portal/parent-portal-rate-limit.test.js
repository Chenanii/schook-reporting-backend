import test from 'node:test';
import assert from 'node:assert/strict';
import { createParentPortalRateLimit } from '../../src/middleware/parent-portal-rate-limit.js';

function invoke(limiter, ip) {
  let statusCode = 200;
  let payload;
  let retryAfter;
  let continued = false;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    set(name, value) {
      if (name === 'Retry-After') retryAfter = value;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    }
  };
  limiter({ ip, socket: {} }, response, () => { continued = true; });
  return { statusCode, payload, retryAfter, continued };
}

test('parent setup rate limiter allows its configured requests then returns a retry delay', () => {
  const limiter = createParentPortalRateLimit(2);
  assert.equal(invoke(limiter, '192.0.2.1').continued, true);
  assert.equal(invoke(limiter, '192.0.2.1').continued, true);
  const blocked = invoke(limiter, '192.0.2.1');
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.payload.error.code, 'PORTAL_RATE_LIMITED');
  assert.ok(Number(blocked.retryAfter) > 0);
  assert.equal(invoke(limiter, '192.0.2.2').continued, true);
});
