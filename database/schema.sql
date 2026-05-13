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
  time_slot   TEXT    NOT NULL DEFAULT 'all', -- morning | afternoon | evening | night | all
  added_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

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
