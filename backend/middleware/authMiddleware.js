// backend/middleware/authMiddleware.js
// Protects admin routes — expects: Authorization: Bearer <ADMIN_PASSWORD>

const crypto = require('crypto');

const RATE_WINDOW_MS  = 15 * 60 * 1000; // 15 minutes
const RATE_MAX        = 10;              // max failed attempts per window per IP
const CLEANUP_INTERVAL = 60 * 60 * 1000; // purge stale entries every hour

const attempts = new Map(); // ip → { count, resetAt }

// Prevent unbounded Map growth by removing entries whose window has expired
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of attempts) {
    if (now > rec.resetAt) attempts.delete(ip);
  }
}, CLEANUP_INTERVAL).unref();

function authMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  const header   = req.headers['authorization'] || '';
  const token    = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: 'Server misconfiguration: ADMIN_PASSWORD not set.' });
  }

  // Rate limit failed attempts per IP
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > rec.resetAt) {
    rec.count   = 0;
    rec.resetAt = now + RATE_WINDOW_MS;
  }

  if (rec.count >= RATE_MAX) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }

  // Constant-time comparison using crypto.timingSafeEqual to prevent timing attacks.
  // Pad both buffers to the same length so the comparison time does not leak the
  // expected password length via early exit.
  const tokenBuf    = Buffer.alloc(256);
  const expectedBuf = Buffer.alloc(256);
  tokenBuf.write(token);
  expectedBuf.write(expected);

  const match = token.length > 0 && crypto.timingSafeEqual(tokenBuf, expectedBuf)
    && token.length === expected.length;

  if (!match) {
    rec.count++;
    attempts.set(ip, rec);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Success — reset counter for this IP
  attempts.delete(ip);
  next();
}

module.exports = authMiddleware;
