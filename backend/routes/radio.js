// backend/routes/radio.js
const express = require('express');
const db      = require('../db');

module.exports = (io, autoDJ) => {
  const router = express.Router();

  router.get('/now-playing', (_req, res) => {
    res.json(autoDJ.getNowPlaying());
  });

  router.get('/status', (_req, res) => {
    res.json(autoDJ.getRadioSettings());
  });

  router.get('/anecdotes', (_req, res) => {
    const anecdote = db.prepare(
      `SELECT a.*, c.name AS category_name
       FROM anecdotes a
       LEFT JOIN categories c ON c.id = a.category_id
       ORDER BY RANDOM()
       LIMIT 1`
    ).get();

    if (!anecdote) return res.status(404).json({ error: 'No anecdotes found.' });
    res.json(anecdote);
  });

  return router;
};
