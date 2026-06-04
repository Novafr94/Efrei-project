-- ============================================================
-- Timeless Radio — Database Schema
-- ============================================================

-- Tracks: the music library
CREATE TABLE IF NOT EXISTS tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  artist      TEXT    NOT NULL,
  year        INTEGER,
  duration    INTEGER NOT NULL, -- duration in seconds
  filename    TEXT    NOT NULL, -- e.g. "billie-holiday-summertime.mp3"
  time_slot   TEXT    NOT NULL DEFAULT 'all', -- energetic | calm | jazz | all
  category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  added_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Categories: admin-managed music groups
CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

-- Schedule sessions: time-window programming linked to a category
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

-- Radio settings: single-row control plane for playback and schedule
CREATE TABLE IF NOT EXISTS radio_settings (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  enabled    INTEGER NOT NULL DEFAULT 1,
  start_time TEXT    NOT NULL DEFAULT '06:00',
  end_time   TEXT    NOT NULL DEFAULT '23:00'
);
INSERT OR IGNORE INTO radio_settings (id, enabled, start_time, end_time) VALUES (1, 1, '06:00', '23:00');

-- Migrations: schema version tracking
CREATE TABLE IF NOT EXISTS migrations (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO migrations (id, version) VALUES (1, 0);

-- Messages: live chat history
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo     TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Anecdotes: musical facts shown on the radio page
CREATE TABLE IF NOT EXISTS anecdotes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  artist     TEXT,
  year       INTEGER,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Censor words: words blocked in the chat
CREATE TABLE IF NOT EXISTS censor_words (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE
);

-- Analytics: listener count over time
CREATE TABLE IF NOT EXISTS analytics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event      TEXT    NOT NULL, -- listener_joined | listener_left
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Users: reserved for Phase 2 (optional accounts)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Seed data — INSERT OR IGNORE keeps this idempotent
-- ============================================================


-- Default categories
INSERT OR IGNORE INTO categories (id, name) VALUES
  (1, 'Rock'),
  (2, 'Jazz'),
  (3, 'Classical');

-- Anecdotes
INSERT OR IGNORE INTO anecdotes (id, title, content, artist, year) VALUES
  (1, 'The birth of Jazz', 'Jazz emerged in New Orleans in the early 20th century, blending African rhythms with European harmonies to create an entirely new sound.', NULL, 1900),
  (2, 'Billie Holiday and Strange Fruit', 'In 1939, Billie Holiday recorded "Strange Fruit", a haunting protest song about racism. It was one of the first songs to directly address racial injustice.', 'Billie Holiday', 1939),
  (3, 'The invention of the electric guitar', 'The electric guitar, invented in the 1930s, revolutionized music by allowing guitarists to be heard over large orchestras and eventually became the symbol of rock and roll.', NULL, 1931),
  (4, 'Duke Ellington at Carnegie Hall', 'In 1943, Duke Ellington performed at Carnegie Hall — one of the first times a jazz musician performed at the prestigious venue, breaking cultural barriers.', 'Duke Ellington', 1943),
  (5, 'The golden age of vinyl', 'The 33⅓ RPM vinyl record was introduced by Columbia Records in 1948, allowing full albums to be pressed on a single disc for the first time.', NULL, 1948);

UPDATE anecdotes SET category_id = 2 WHERE id IN (1, 2, 4);
UPDATE anecdotes SET category_id = 1 WHERE id = 3;
UPDATE anecdotes SET category_id = 3 WHERE id = 5;

-- Default censor words
INSERT OR IGNORE INTO censor_words (id, word) VALUES
  (1, 'spam'),
  (2, 'scam'),
  (3, 'advertisement'),
  (4, 'buy now'),
  (5, 'click here');
