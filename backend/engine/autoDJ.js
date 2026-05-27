// backend/engine/autoDJ.js — stateful Auto-DJ engine (singleton)
const { getTracksForCurrentSlot } = require('../utils/mood');

let db = null;
let io = null;

let currentTrack  = null;
let startedAt     = 0;
let manualQueue   = [];
let recentHistory = [];
let timer         = null;

function historyCapacity() {
  const total = db.prepare('SELECT COUNT(*) as c FROM tracks').get().c;
  return Math.min(20, Math.floor(total / 2));
}

function autoSelect() {
  let pool = getTracksForCurrentSlot();
  let candidates = pool.filter(t => !recentHistory.includes(t.id));

  if (candidates.length === 0) candidates = pool;

  if (candidates.length === 0) {
    candidates = db.prepare('SELECT * FROM tracks ORDER BY id ASC').all();
  }

  if (candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function broadcastTrackChange() {
  if (!io) return;
  io.emit('track_change', {
    track: currentTrack ? {
      id:       currentTrack.id,
      title:    currentTrack.title,
      artist:   currentTrack.artist,
      year:     currentTrack.year,
      filename: currentTrack.filename,
      duration: currentTrack.duration,
    } : null,
    position: 0,
  });
}

function broadcastQueueUpdate() {
  if (!io) return;
  io.emit('queue_update', {
    currentTrack: currentTrack ? {
      id:       currentTrack.id,
      title:    currentTrack.title,
      artist:   currentTrack.artist,
      year:     currentTrack.year,
      filename: currentTrack.filename,
      duration: currentTrack.duration,
    } : null,
    queue: manualQueue.map(t => ({
      id:       t.id,
      title:    t.title,
      artist:   t.artist,
      year:     t.year,
      filename: t.filename,
      duration: t.duration,
    })),
  });
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (!currentTrack) return;

  const remaining = (currentTrack.duration * 1000) - (Date.now() - startedAt);
  timer = setTimeout(() => advance(), Math.max(remaining, 0));
}

function advance() {
  if (timer) { clearTimeout(timer); timer = null; }

  if (currentTrack) {
    recentHistory.push(currentTrack.id);
    const cap = historyCapacity();
    if (recentHistory.length > cap) {
      recentHistory = recentHistory.slice(-cap);
    }
  }

  let next = null;
  if (manualQueue.length > 0) {
    next = manualQueue.shift();
  } else {
    next = autoSelect();
  }

  if (!next) {
    currentTrack = null;
    startedAt    = 0;
    broadcastTrackChange();
    broadcastQueueUpdate();
    return;
  }

  currentTrack = next;
  startedAt    = Date.now();

  broadcastTrackChange();
  broadcastQueueUpdate();
  scheduleNext();
}

function init(database, socketIo) {
  db = database;
  io = socketIo;

  const first = autoSelect();
  if (first) {
    currentTrack = first;
    startedAt    = Date.now();
    scheduleNext();
  }
}

function getNowPlaying() {
  if (!currentTrack) return null;

  const position  = Math.floor((Date.now() - startedAt) / 1000);
  const listeners = io ? io.engine.clientsCount : 0;

  return {
    track: {
      id:       currentTrack.id,
      title:    currentTrack.title,
      artist:   currentTrack.artist,
      year:     currentTrack.year,
      filename: currentTrack.filename,
      duration: currentTrack.duration,
    },
    position: Math.min(position, currentTrack.duration),
    listeners,
  };
}

function addToQueue(trackId) {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
  if (!track) return false;
  manualQueue.push(track);
  broadcastQueueUpdate();
  return true;
}

function removeFromQueue(index) {
  if (index < 0 || index >= manualQueue.length) return false;
  manualQueue.splice(index, 1);
  broadcastQueueUpdate();
  return true;
}

function reorderQueue(from, to) {
  if (from < 0 || from >= manualQueue.length) return false;
  if (to < 0 || to >= manualQueue.length) return false;
  const [item] = manualQueue.splice(from, 1);
  manualQueue.splice(to, 0, item);
  broadcastQueueUpdate();
  return true;
}

function skip() {
  advance();
}

function getQueue() {
  return {
    currentTrack: currentTrack ? {
      id:       currentTrack.id,
      title:    currentTrack.title,
      artist:   currentTrack.artist,
      year:     currentTrack.year,
      filename: currentTrack.filename,
      duration: currentTrack.duration,
    } : null,
    queue: manualQueue.map(t => ({
      id:       t.id,
      title:    t.title,
      artist:   t.artist,
      year:     t.year,
      filename: t.filename,
      duration: t.duration,
    })),
  };
}

function onTrackAdded() {
  if (!currentTrack) {
    const track = autoSelect();
    if (track) {
      currentTrack = track;
      startedAt    = Date.now();
      broadcastTrackChange();
      broadcastQueueUpdate();
      scheduleNext();
    }
  }
}

function onTrackDeleted(id) {
  manualQueue = manualQueue.filter(t => t.id !== id);

  if (currentTrack && currentTrack.id === id) {
    advance();
  } else {
    broadcastQueueUpdate();
  }
}

module.exports = {
  init,
  getNowPlaying,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  skip,
  getQueue,
  onTrackAdded,
  onTrackDeleted,
};
