// backend/routes/chat.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/chat/messages — last 50 messages in chronological order
router.get('/messages', (_req, res) => {
  const messages = db.prepare(
    `SELECT id, pseudo, content, created_at
     FROM messages
     ORDER BY created_at DESC
     LIMIT 50`
  ).all().reverse();

  res.json(messages);
});

module.exports = router;
