// backend/routes/admin.js
// All routes protected by authMiddleware (mounted in server.js)
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { reloadBannedWords } = require('../middleware/censorMiddleware');

// ── Tracks ────────────────────────────────────────────────────

router.get('/tracks', (_req, res) => {
  res.json(db.prepare('SELECT * FROM tracks ORDER BY id ASC').all());
});

const FILENAME_REGEX = /^[\w\-]+\.(mp3|ogg|flac|wav|aac|m4a)$/i;

router.post('/tracks', (req, res) => {
  const { title, artist, year, duration, filename, time_slot } = req.body;

  if (!title || !artist || !duration || !filename) {
    return res.status(400).json({ error: 'title, artist, duration and filename are required.' });
  }

  if (!FILENAME_REGEX.test(filename)) {
    return res.status(400).json({ error: 'filename must be a simple audio filename (e.g. summertime.mp3).' });
  }

  const validSlots = ['morning', 'afternoon', 'evening', 'night', 'all'];
  const slot = validSlots.includes(time_slot) ? time_slot : 'all';

  const stmt   = db.prepare(
    'INSERT INTO tracks (title, artist, year, duration, filename, time_slot) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(title, artist, year || null, Number(duration), filename, slot);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/tracks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Track not found.' });
  res.json({ deleted: true });
});

// ── Anecdotes ─────────────────────────────────────────────────

router.get('/anecdotes', (_req, res) => {
  res.json(db.prepare('SELECT * FROM anecdotes ORDER BY id ASC').all());
});

router.post('/anecdotes', (req, res) => {
  const { title, content, artist, year } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required.' });
  }

  const stmt   = db.prepare(
    'INSERT INTO anecdotes (title, content, artist, year) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(title, content, artist || null, year || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/anecdotes/:id', (req, res) => {
  const result = db.prepare('DELETE FROM anecdotes WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Anecdote not found.' });
  res.json({ deleted: true });
});

// ── Censor words ──────────────────────────────────────────────

router.get('/censor', (_req, res) => {
  res.json(db.prepare('SELECT * FROM censor_words ORDER BY id ASC').all());
});

router.post('/censor', (req, res) => {
  const { word } = req.body;
  if (!word || typeof word !== 'string' || !word.trim()) {
    return res.status(400).json({ error: 'word is required.' });
  }

  try {
    const result = db.prepare('INSERT INTO censor_words (word) VALUES (?)').run(word.trim().toLowerCase());
    reloadBannedWords();
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'Word already exists.' });
  }
});

router.delete('/censor/:id', (req, res) => {
  const result = db.prepare('DELETE FROM censor_words WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Word not found.' });
  reloadBannedWords();
  res.json({ deleted: true });
});

// ── Analytics ─────────────────────────────────────────────────

router.get('/analytics', (_req, res) => {
  const joined = db.prepare("SELECT COUNT(*) as count FROM analytics WHERE event = 'listener_joined'").get();
  const left   = db.prepare("SELECT COUNT(*) as count FROM analytics WHERE event = 'listener_left'").get();
  res.json({
    total_joins: joined.count,
    total_leaves: left.count,
    estimated_sessions: joined.count,
  });
});

module.exports = router;
