// backend/utils/mood.js
const db = require('../db');

function getCurrentSlot() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour <= 10)  return 'morning';
  if (hour >= 11 && hour <= 17) return 'daytime';
  return 'evening';
}

function getTracksForCurrentSlot() {
  const slot = getCurrentSlot();

  let tracks;
  if (slot === 'morning') {
    tracks = db.prepare("SELECT * FROM tracks WHERE time_slot IN ('energetic', 'all') ORDER BY id ASC").all();
  } else if (slot === 'evening') {
    tracks = db.prepare("SELECT * FROM tracks WHERE time_slot IN ('calm', 'jazz', 'all') ORDER BY id ASC").all();
  } else {
    tracks = db.prepare('SELECT * FROM tracks ORDER BY id ASC').all();
  }

  if (tracks.length === 0) {
    tracks = db.prepare('SELECT * FROM tracks ORDER BY id ASC').all();
  }

  return tracks;
}

module.exports = { getCurrentSlot, getTracksForCurrentSlot };
