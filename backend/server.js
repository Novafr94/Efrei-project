// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');

const db = require('./db');

// ── App setup ─────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// CORS_ORIGIN supports comma-separated list or '*' (wildcard for dev)
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOrigin = allowedOrigins.length === 1 && allowedOrigins[0] === '*'
  ? '*'
  : allowedOrigins;

const io = new Server(server, { cors: { origin: corsOrigin } });

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // HSTS — ignored over plain HTTP, enforced by browsers once set over HTTPS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    // unsafe-inline removed from script-src — all page JS is now in external files
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; media-src 'self'; img-src 'self' data:"
  );
  next();
});

app.use(express.static(path.join(__dirname, '../frontend')));

// ── Page routes ───────────────────────────────────────────────
app.get('/',      (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/index.html')));
app.get('/radio', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/radio.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/login.html')));

// ── API routes ─────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/radio',  require('./routes/radio')(io));   // io injected to break circular dep
app.use('/api/chat',   require('./routes/chat'));
app.use('/api/admin',  require('./middleware/authMiddleware'), require('./routes/admin'));

// ── Socket.io ─────────────────────────────────────────────────
require('./socket/chat-socket')(io);

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3004;
server.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server running at http://localhost:${PORT}`);
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

module.exports = { io };
