// backend/routes/radio.js
const express = require('express');
const db      = require('../db');

module.exports = (io, autoDJ) => {
  const router = express.Router();

  router.get('/now-playing', (_req, res) => {
    const data = autoDJ.getNowPlaying();
    if (!data) {
      return res.status(404).json({ error: 'No tracks in library. Add tracks via /api/admin/tracks.' });
    }
    res.json(data);
  });

  router.get('/anecdotes', (_req, res) => {
    const anecdote = db.prepare(
      'SELECT * FROM anecdotes ORDER BY RANDOM() LIMIT 1'
    ).get();

    if (!anecdote) return res.status(404).json({ error: 'No anecdotes found.' });
    res.json(anecdote);
  });

  return router;
};
