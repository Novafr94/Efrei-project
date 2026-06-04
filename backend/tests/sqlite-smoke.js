const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeless-radio-sqlite-'));
const dbPath = path.join(tempDir, 'smoke-test.db');
const schemaPath = path.join(__dirname, '../../database/schema.sql');

let db;

try {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db = new DatabaseSync(dbPath);
  db.exec(schema);
  db.exec('PRAGMA foreign_keys = ON');

  const tables = ['tracks', 'categories', 'radio_settings', 'migrations'];
  for (const tableName of tables) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
    assert.ok(row.count >= 0, `${tableName} should exist`);
  }

  const sessionTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schedule_sessions'").get();
  const anecdoteColumns = db.prepare('PRAGMA table_info(anecdotes)').all().map(column => column.name);

  assert.ok(sessionTable, 'schedule_sessions should exist');
  assert.ok(anecdoteColumns.includes('category_id'), 'anecdotes.category_id should exist');

  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  const migrationRow = db.prepare('SELECT version FROM migrations WHERE id = 1').get();
  const radioSettingsRow = db.prepare('SELECT enabled, start_time, end_time FROM radio_settings WHERE id = 1').get();
  const anecdoteRow = db.prepare('SELECT title, category_id FROM anecdotes WHERE id = 1').get();

  assert.ok(categoryCount >= 3, 'Expected seeded categories to be inserted');
  assert.ok(migrationRow, 'Expected migrations row to exist');
  assert.equal(migrationRow.version, 0, 'Expected initial migration version to be 0');
  assert.ok(radioSettingsRow, 'Expected radio settings row to exist');
  assert.ok(anecdoteRow, 'Expected anecdotes to be seeded');

  db.prepare('INSERT INTO tracks (title, artist, duration, filename, time_slot, category_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run('Smoke Test Track', 'Test Artist', 180, 'smoke-test.mp3', 'all', 2);
  const trackRow = db.prepare('SELECT title, category_id FROM tracks WHERE filename = ?').get('smoke-test.mp3');
  assert.equal(trackRow.title, 'Smoke Test Track', 'Expected track insert/select round-trip to work');

  db.prepare('INSERT INTO schedule_sessions (name, category_id, start_time, end_time, enabled) VALUES (?, ?, ?, ?, ?)')
    .run('Smoke Test Session', 2, '06:00', '10:00', 1);
  const sessionRow = db.prepare('SELECT name, category_id FROM schedule_sessions WHERE name = ?').get('Smoke Test Session');
  assert.equal(sessionRow.category_id, 2, 'Expected session insert/select round-trip to work');

  db.prepare('INSERT INTO censor_words (word) VALUES (?)').run('smoke-test-word');
  const insertedWord = db.prepare('SELECT word FROM censor_words WHERE word = ?').get('smoke-test-word');
  assert.equal(insertedWord.word, 'smoke-test-word', 'Expected insert/select round-trip to work');

  console.log('SQLite smoke test passed. Database opened, schema loaded, and queries succeeded.');
} finally {
  if (db) {
    db.close();
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
}
