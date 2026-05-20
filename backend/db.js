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

module.exports = db;
