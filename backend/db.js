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

module.exports = db;
