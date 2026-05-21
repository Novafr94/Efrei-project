// backend/socket/chat-socket.js
const db = require('../db');
const { censorText } = require('../middleware/censorMiddleware');

const PSEUDO_REGEX    = /^[a-zA-Z0-9 _-]{1,20}$/;
const MAX_MSG_LENGTH  = 500;
const RATE_LIMIT_MAX  = 3;    // messages
const RATE_LIMIT_WINDOW = 5000; // ms

module.exports = (io) => {
  const activeUsers  = new Map(); // socketId → pseudo
  const rateLimiter  = new Map(); // socketId → { count, resetAt }

  function broadcastListenerCount() {
    io.emit('listener_count', { count: activeUsers.size });
  }

  io.on('connection', (socket) => {
    // ── Join ────────────────────────────────────────────────
    socket.on('join', ({ pseudo }) => {
      if (!pseudo || !PSEUDO_REGEX.test(pseudo)) {
        return socket.emit('error', { message: 'Invalid pseudo. Use 1-20 alphanumeric characters.' });
      }

      activeUsers.set(socket.id, pseudo);
      broadcastListenerCount();

      db.prepare("INSERT INTO analytics (event) VALUES ('listener_joined')").run();

      socket.emit('join_ok', { pseudo });
    });

    // ── Message ─────────────────────────────────────────────
    socket.on('message', ({ content }) => {
      const pseudo = activeUsers.get(socket.id);
      if (!pseudo) {
        return socket.emit('error', { message: 'Please join with a pseudo first.' });
      }

      if (!content || typeof content !== 'string' || !content.trim()) {
        return socket.emit('error', { message: 'Empty message.' });
      }

      if (content.length > MAX_MSG_LENGTH) {
        return socket.emit('error', { message: `Message too long (max ${MAX_MSG_LENGTH} chars).` });
      }

      // Rate limiting
      const now  = Date.now();
      const rl   = rateLimiter.get(socket.id) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
      if (now > rl.resetAt) {
        rl.count   = 0;
        rl.resetAt = now + RATE_LIMIT_WINDOW;
      }
      rl.count++;
      rateLimiter.set(socket.id, rl);

      if (rl.count > RATE_LIMIT_MAX) {
        return socket.emit('error', { message: 'Too many messages. Please wait a moment.' });
      }

      const clean      = censorText(content.trim());
      const created_at = new Date().toISOString();

      db.prepare('INSERT INTO messages (pseudo, content, created_at) VALUES (?, ?, ?)').run(pseudo, clean, created_at);

      io.emit('message', { pseudo, content: clean, created_at });
    });

    // ── Disconnect ──────────────────────────────────────────
    socket.on('disconnect', () => {
      // Always clean up rateLimiter regardless of whether the socket joined,
      // to prevent unbounded Map growth from unauthenticated connections.
      rateLimiter.delete(socket.id);

      if (activeUsers.has(socket.id)) {
        activeUsers.delete(socket.id);
        broadcastListenerCount();
        db.prepare("INSERT INTO analytics (event) VALUES ('listener_left')").run();
      }
    });
  });
};
