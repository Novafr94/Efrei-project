// backend/middleware/authMiddleware.js
// Protects admin routes — expects: Authorization: Bearer <ADMIN_PASSWORD>

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX       = 10;              // max failed attempts per window per IP

const attempts = new Map(); // ip → { count, resetAt }

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

  // Constant-time comparison to prevent timing attacks
  if (!token || token.length !== expected.length) {
    rec.count++;
    attempts.set(ip, rec);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  if (mismatch !== 0) {
    rec.count++;
    attempts.set(ip, rec);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Success — reset counter for this IP
  attempts.delete(ip);
  next();
}

module.exports = authMiddleware;
