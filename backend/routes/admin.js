// backend/routes/admin.js
// All routes protected by authMiddleware (mounted in server.js)
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');
const { reloadBannedWords } = require('../middleware/censorMiddleware');
const { isValidSchedule, isWithinSchedule, normalizeTime } = require('../utils/radioControl');

const AUDIO_DIR = path.join(__dirname, '../../frontend/audio');
const FILENAME_REGEX = /^[\w\-]+\.(mp3|ogg|flac|wav|aac|m4a)$/i;

function parseInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function categoryExists(categoryId) {
  return db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return Boolean(value);
}

function getAnecdoteById(id) {
  return db.prepare(`
    SELECT a.*, c.name AS category_name
    FROM anecdotes a
    LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.id = ?
  `).get(id);
}

function getScheduleSessionById(id) {
  return db.prepare(`
    SELECT s.*, c.name AS category_name
    FROM schedule_sessions s
    LEFT JOIN categories c ON c.id = s.category_id
    WHERE s.id = ?
  `).get(id);
}

function getTrackById(id) {
  return db.prepare(`
    SELECT t.*, c.name AS category_name
    FROM tracks t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?
  `).get(id);
}

module.exports = (autoDJ) => {
  const router = express.Router();

  // ── Radio control ───────────────────────────────────────────

  router.get('/radio-settings', (_req, res) => {
    res.json(autoDJ.getRadioSettings());
  });

  router.put('/radio-settings', (req, res) => {
    const { enabled, start_time, end_time } = req.body;

    const nextEnabled = typeof enabled === 'boolean' ? enabled : Boolean(enabled);
    const normalizedStart = normalizeTime(start_time);
    const normalizedEnd = normalizeTime(end_time);

    if (!normalizedStart || !normalizedEnd) {
      return res.status(400).json({ error: 'start_time and end_time must use HH:MM format.' });
    }

    if (!isValidSchedule(normalizedStart, normalizedEnd)) {
      return res.status(400).json({ error: 'start_time and end_time must define a valid range.' });
    }

    const state = autoDJ.updateRadioSettings({
      enabled: nextEnabled,
      startTime: normalizedStart,
      endTime: normalizedEnd,
    });

    res.json(state);
  });

  // ── Tracks ────────────────────────────────────────────────────

  router.get('/tracks', (_req, res) => {
    res.json(db.prepare(`
      SELECT t.*, c.name AS category_name
      FROM tracks t
      LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.id ASC
    `).all());
  });

  router.post('/tracks', (req, res) => {
    const { title, artist, year, duration, filename, time_slot, category_id } = req.body;
    const nextCategoryId = parseInteger(category_id) || 1;
    const nextYear = parseInteger(year);
    const nextDuration = parseInteger(duration);

    if (!title || !artist || !nextDuration || !filename) {
      return res.status(400).json({ error: 'title, artist, duration and filename are required.' });
    }

    if (!FILENAME_REGEX.test(filename)) {
      return res.status(400).json({ error: 'filename must be a simple audio filename (e.g. summertime.mp3).' });
    }

    if (!categoryExists(nextCategoryId)) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    const validSlots = ['energetic', 'calm', 'jazz', 'all'];
    const slot = validSlots.includes(time_slot) ? time_slot : 'all';

    const stmt   = db.prepare(
      'INSERT INTO tracks (title, artist, year, duration, filename, time_slot, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(title.trim(), artist.trim(), nextYear, nextDuration, filename.trim(), slot, nextCategoryId);

    autoDJ.onTrackAdded();
    res.status(201).json(getTrackById(result.lastInsertRowid));
  });

  router.put('/tracks/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = getTrackById(id);
    if (!existing) return res.status(404).json({ error: 'Track not found.' });

    const { title, artist, year, duration, filename, time_slot, category_id } = req.body;
    const nextTitle = typeof title === 'string' ? title.trim() : '';
    const nextArtist = typeof artist === 'string' ? artist.trim() : '';
    const nextYear = parseInteger(year);
    const nextDuration = parseInteger(duration);
    const nextFilename = typeof filename === 'string' ? filename.trim() : '';
    const nextCategoryId = parseInteger(category_id) || existing.category_id || 1;

    if (!nextTitle || !nextArtist || !nextDuration || !nextFilename) {
      return res.status(400).json({ error: 'title, artist, duration and filename are required.' });
    }

    if (!FILENAME_REGEX.test(nextFilename)) {
      return res.status(400).json({ error: 'filename must be a simple audio filename (e.g. summertime.mp3).' });
    }

    if (!categoryExists(nextCategoryId)) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    const validSlots = ['energetic', 'calm', 'jazz', 'all'];
    const slot = validSlots.includes(time_slot) ? time_slot : 'all';

    db.prepare(`
      UPDATE tracks
      SET title = ?, artist = ?, year = ?, duration = ?, filename = ?, time_slot = ?, category_id = ?
      WHERE id = ?
    `).run(nextTitle, nextArtist, nextYear, nextDuration, nextFilename, slot, nextCategoryId, id);

    autoDJ.onTrackUpdated(id);
    res.json(getTrackById(id));
  });

  router.delete('/tracks/:id', (req, res) => {
    const id     = Number(req.params.id);
    const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Track not found.' });

    autoDJ.onTrackDeleted(id);
    res.json({ deleted: true });
  });

  // ── Categories ───────────────────────────────────────────────

  router.get('/categories', (_req, res) => {
    res.json(db.prepare(`
      SELECT c.id, c.name, COUNT(t.id) AS track_count
      FROM categories c
      LEFT JOIN tracks t ON t.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.name COLLATE NOCASE ASC
    `).all());
  });

  router.post('/categories', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    try {
      const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
      res.status(201).json(db.prepare('SELECT id, name FROM categories WHERE id = ?').get(result.lastInsertRowid));
    } catch {
      res.status(409).json({ error: 'Category already exists.' });
    }
  });

  router.put('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    try {
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
      res.json(db.prepare('SELECT id, name FROM categories WHERE id = ?').get(id));
    } catch {
      res.status(409).json({ error: 'Category already exists.' });
    }
  });

  router.delete('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const usage = db.prepare('SELECT COUNT(*) AS count FROM tracks WHERE category_id = ?').get(id);
    if (usage.count > 0) {
      return res.status(409).json({ error: 'Category is in use. Reassign its tracks before deleting it.' });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ deleted: true });
  });

  // ── Anecdotes ─────────────────────────────────────────────────

  router.get('/anecdotes', (_req, res) => {
    res.json(db.prepare(`
      SELECT a.*, c.name AS category_name
      FROM anecdotes a
      LEFT JOIN categories c ON c.id = a.category_id
      ORDER BY a.id ASC
    `).all());
  });

  router.post('/anecdotes', (req, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const artist = typeof req.body.artist === 'string' ? req.body.artist.trim() : '';
    const year = parseInteger(req.body.year);
    const categoryId = parseInteger(req.body.category_id);

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required.' });
    }

    if (req.body.category_id !== undefined && req.body.category_id !== null && req.body.category_id !== '' && !categoryId) {
      return res.status(400).json({ error: 'category_id must be a valid category id.' });
    }

    if (categoryId && !categoryExists(categoryId)) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    const stmt   = db.prepare(
      'INSERT INTO anecdotes (title, content, artist, year, category_id) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(title, content, artist || null, year, categoryId || null);

    res.status(201).json(getAnecdoteById(result.lastInsertRowid));
  });

  router.put('/anecdotes/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = getAnecdoteById(id);

    if (!existing) {
      return res.status(404).json({ error: 'Anecdote not found.' });
    }

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const artist = typeof req.body.artist === 'string' ? req.body.artist.trim() : '';
    const year = parseInteger(req.body.year);
    const hasCategoryField = req.body.category_id !== undefined;
    const categoryId = hasCategoryField ? parseInteger(req.body.category_id) : existing.category_id;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required.' });
    }

    if (hasCategoryField && req.body.category_id !== null && req.body.category_id !== '' && !categoryId) {
      return res.status(400).json({ error: 'category_id must be a valid category id.' });
    }

    if (categoryId && !categoryExists(categoryId)) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    db.prepare(`
      UPDATE anecdotes
      SET title = ?, content = ?, artist = ?, year = ?, category_id = ?
      WHERE id = ?
    `).run(title, content, artist || null, year, categoryId || null, id);

    res.json(getAnecdoteById(id));
  });

  router.delete('/anecdotes/:id', (req, res) => {
    const result = db.prepare('DELETE FROM anecdotes WHERE id = ?').run(Number(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: 'Anecdote not found.' });
    res.json({ deleted: true });
  });

  // ── Schedule sessions ──────────────────────────────────────

  router.get('/sessions', (_req, res) => {
    const sessions = db.prepare(`
      SELECT s.*, c.name AS category_name
      FROM schedule_sessions s
      LEFT JOIN categories c ON c.id = s.category_id
      ORDER BY s.start_time ASC, s.id ASC
    `).all().map(session => ({
      ...session,
      active: isWithinSchedule(new Date(), session.start_time, session.end_time),
    }));

    res.json(sessions);
  });

  router.post('/sessions', (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const categoryId = parseInteger(req.body.category_id);
    const startTime = normalizeTime(req.body.start_time);
    const endTime = normalizeTime(req.body.end_time);
    const enabled = parseBoolean(req.body.enabled);

    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    if (!categoryId) {
      return res.status(400).json({ error: 'category_id is required.' });
    }

    if (!categoryExists(categoryId)) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'start_time and end_time must use HH:MM format.' });
    }

    if (!isValidSchedule(startTime, endTime)) {
      return res.status(400).json({ error: 'start_time and end_time must define a valid range.' });
    }

    const result = db.prepare(`
      INSERT INTO schedule_sessions (name, category_id, start_time, end_time, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, categoryId, startTime, endTime, enabled ? 1 : 0);

    autoDJ.syncPlaybackState();
    res.status(201).json(getScheduleSessionById(result.lastInsertRowid));
  });

  router.put('/sessions/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = getScheduleSessionById(id);

    if (!existing) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const categoryId = parseInteger(req.body.category_id);
    const startTime = normalizeTime(req.body.start_time);
    const endTime = normalizeTime(req.body.end_time);
    const enabled = parseBoolean(req.body.enabled);

    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    if (!categoryId) {
      return res.status(400).json({ error: 'category_id is required.' });
    }

    if (!categoryExists(categoryId)) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'start_time and end_time must use HH:MM format.' });
    }

    if (!isValidSchedule(startTime, endTime)) {
      return res.status(400).json({ error: 'start_time and end_time must define a valid range.' });
    }

    db.prepare(`
      UPDATE schedule_sessions
      SET name = ?, category_id = ?, start_time = ?, end_time = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, categoryId, startTime, endTime, enabled ? 1 : 0, id);

    autoDJ.syncPlaybackState();
    res.json(getScheduleSessionById(id));
  });

  router.delete('/sessions/:id', (req, res) => {
    const id = Number(req.params.id);
    const result = db.prepare('DELETE FROM schedule_sessions WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    autoDJ.syncPlaybackState();
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

  return router;
};
