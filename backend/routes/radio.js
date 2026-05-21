// backend/routes/radio.js
const express = require('express');
const db      = require('../db');

// io is injected by server.js to avoid a circular dependency
module.exports = (io) => {
  const router = express.Router();

  // GET /api/radio/now-playing
  // Returns the currently playing track based on server time (stateless sync algorithm)
  router.get('/now-playing', (req, res) => {
    const tracks = db.prepare('SELECT * FROM tracks ORDER BY id ASC').all();

    if (tracks.length === 0) {
      return res.status(404).json({ error: 'No tracks in library. Add tracks via /api/admin/tracks.' });
    }

    const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
    const elapsed       = Math.floor(Date.now() / 1000) % totalDuration;

    let cumulative = 0;
    let current    = tracks[0];
    let position   = 0;

    for (const track of tracks) {
      if (elapsed < cumulative + track.duration) {
        current  = track;
        position = elapsed - cumulative;
        break;
      }
      cumulative += track.duration;
    }

    const listeners = io ? io.engine.clientsCount : 0;

    res.json({
      track: {
        id:       current.id,
        title:    current.title,
        artist:   current.artist,
        year:     current.year,
        filename: current.filename,
        duration: current.duration,
      },
      position,
      listeners,
    });
  });

  // GET /api/radio/anecdotes — random anecdote for the radio page
  router.get('/anecdotes', (_req, res) => {
    const anecdote = db.prepare(
      'SELECT * FROM anecdotes ORDER BY RANDOM() LIMIT 1'
    ).get();

    if (!anecdote) return res.status(404).json({ error: 'No anecdotes found.' });
    res.json(anecdote);
  });

  return router;
};
