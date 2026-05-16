// backend/middleware/authMiddleware.js
// Protects admin routes — expects: Authorization: Bearer <ADMIN_PASSWORD>

function authMiddleware(req, res, next) {
  const header   = req.headers['authorization'] || '';
  const token    = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = process.env.ADMIN_PASSWORD;

  // Constant-time comparison to prevent timing attacks
  if (!token || !expected || token.length !== expected.length) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  if (mismatch !== 0) return res.status(401).json({ error: 'Unauthorized' });

  next();
}

module.exports = authMiddleware;
