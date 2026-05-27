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
  added_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

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

-- Tracks (public domain / royalty-free placeholders)
INSERT OR IGNORE INTO tracks (id, title, artist, year, duration, filename, time_slot) VALUES
  (1, 'Summertime',          'Various Artists', 1935, 180, 'summertime.mp3',        'energetic'),
  (2, 'Moonlight Serenade',  'Various Artists', 1939, 210, 'moonlight-serenade.mp3','calm'),
  (3, 'Take Five',           'Various Artists', 1959, 324, 'take-five.mp3',         'all'),
  (4, 'Round Midnight',      'Various Artists', 1944, 252, 'round-midnight.mp3',    'jazz'),
  (5, 'Blue Bossa',          'Various Artists', 1963, 276, 'blue-bossa.mp3',        'all'),
  (6, 'Autumn Leaves',       'Various Artists', 1945, 198, 'autumn-leaves.mp3',     'calm'),
  (7, 'So What',             'Various Artists', 1959, 558, 'so-what.mp3',           'all');

-- Anecdotes
INSERT OR IGNORE INTO anecdotes (id, title, content, artist, year) VALUES
  (1, 'The birth of Jazz', 'Jazz emerged in New Orleans in the early 20th century, blending African rhythms with European harmonies to create an entirely new sound.', NULL, 1900),
  (2, 'Billie Holiday and Strange Fruit', 'In 1939, Billie Holiday recorded "Strange Fruit", a haunting protest song about racism. It was one of the first songs to directly address racial injustice.', 'Billie Holiday', 1939),
  (3, 'The invention of the electric guitar', 'The electric guitar, invented in the 1930s, revolutionized music by allowing guitarists to be heard over large orchestras and eventually became the symbol of rock and roll.', NULL, 1931),
  (4, 'Duke Ellington at Carnegie Hall', 'In 1943, Duke Ellington performed at Carnegie Hall — one of the first times a jazz musician performed at the prestigious venue, breaking cultural barriers.', 'Duke Ellington', 1943),
  (5, 'The golden age of vinyl', 'The 33⅓ RPM vinyl record was introduced by Columbia Records in 1948, allowing full albums to be pressed on a single disc for the first time.', NULL, 1948);

-- Default censor words
INSERT OR IGNORE INTO censor_words (id, word) VALUES
  (1, 'spam'),
  (2, 'scam'),
  (3, 'advertisement'),
  (4, 'buy now'),
  (5, 'click here');
