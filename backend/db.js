// backend/db.js — shared SQLite instance
const path = require('path');
const fs   = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db     = new DatabaseSync(process.env.DB_PATH);
const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
