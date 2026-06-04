// backend/db.js — shared SQLite instance
const path = require('path');
const fs   = require('fs');
const { DatabaseSync } = require('node:sqlite');

if (!process.env.DB_PATH) {
  throw new Error('DB_PATH environment variable is not set. Copy .env.example to .env and configure it.');
}

const db     = new DatabaseSync(process.env.DB_PATH);
const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
db.exec(schema);
db.exec('PRAGMA foreign_keys = ON');

// ── Migrations ───────────────────────────────────────────────
const currentVersion = db.prepare('SELECT version FROM migrations WHERE id = 1').get().version;

if (currentVersion < 1) {
  db.exec(`
    UPDATE tracks SET time_slot = 'energetic' WHERE time_slot = 'morning';
    UPDATE tracks SET time_slot = 'all'       WHERE time_slot = 'afternoon';
    UPDATE tracks SET time_slot = 'calm'      WHERE time_slot = 'evening';
    UPDATE tracks SET time_slot = 'jazz'      WHERE time_slot = 'night';
    UPDATE migrations SET version = 1 WHERE id = 1;
  `);
}

if (currentVersion < 2) {
  const tracksColumns = db.prepare('PRAGMA table_info(tracks)').all().map(column => column.name);

  if (!tracksColumns.includes('category_id')) {
    db.exec('ALTER TABLE tracks ADD COLUMN category_id INTEGER');
  }

  db.exec(`
    INSERT OR IGNORE INTO categories (id, name) VALUES
      (1, 'General'),
      (2, 'Rap'),
      (3, 'Pop'),
      (4, 'Afro'),
      (5, 'Electronic'),
      (6, 'Jazz'),
      (7, 'Classical');

    INSERT OR IGNORE INTO radio_settings (id, enabled, start_time, end_time)
    VALUES (1, 1, '06:00', '23:00');

    UPDATE tracks SET category_id = 1 WHERE category_id IS NULL;
    UPDATE migrations SET version = 2 WHERE id = 1;
  `);
}

if (currentVersion < 3) {
  const anecdoteColumns = db.prepare('PRAGMA table_info(anecdotes)').all().map(column => column.name);

  if (!anecdoteColumns.includes('category_id')) {
    db.exec('ALTER TABLE anecdotes ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL');
  }

  db.exec(`
    UPDATE anecdotes SET category_id = 2 WHERE id IN (1, 2, 4);
    UPDATE anecdotes SET category_id = 1 WHERE id = 3;
    UPDATE anecdotes SET category_id = 3 WHERE id = 5;
    UPDATE migrations SET version = 3 WHERE id = 1;
  `);
}

if (currentVersion < 4) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      start_time  TEXT    NOT NULL,
      end_time    TEXT    NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    UPDATE migrations SET version = 4 WHERE id = 1;
  `);
}

module.exports = db;
