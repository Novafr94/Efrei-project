// backend/middleware/censorMiddleware.js
// Exports censorText(text) — used by chat-socket.js

const db = require('../db');

// Load banned words once at startup into memory
let bannedWords = [];

function loadBannedWords() {
  const rows = db.prepare('SELECT word FROM censor_words').all();
  bannedWords = rows.map(r => r.word.toLowerCase());
}

loadBannedWords();

// Replace banned words with *** (case-insensitive)
function censorText(text) {
  let result = text;
  for (const word of bannedWords) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, '***');
  }
  return result;
}

// Reload from DB (called by admin route after censor_words update)
function reloadBannedWords() {
  loadBannedWords();
}

module.exports = { censorText, reloadBannedWords };
