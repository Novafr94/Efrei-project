// backend/engine/autoDJ.js — stateful Auto-DJ engine (singleton)
const { getTracksForCurrentSlot } = require('../utils/mood');
const { getRadioStatus, normalizeTime, isWithinSchedule } = require('../utils/radioControl');

let db = null;
let io = null;

let currentTrack  = null;
let startedAt     = 0;
let manualQueue   = [];
let recentHistory = [];
let timer         = null;
let controlTimer  = null;

let radioEnabled = true;
let startTime    = '06:00';
let endTime      = '23:00';

const CONTROL_TICK_MS = 30_000;

function summarizeTrack(track) {
  if (!track) return null;

  return {
    id:          track.id,
    title:       track.title,
    artist:      track.artist,
    year:        track.year,
    filename:    track.filename,
    duration:    track.duration,
    category_id: track.category_id || null,
    category_name: track.category_name || null,
  };
}

function summarizeSession(session) {
  if (!session) return null;

  return {
    id: session.id,
    name: session.name,
    category_id: session.category_id,
    category_name: session.category_name || null,
    start_time: session.start_time,
    end_time: session.end_time,
    enabled: Boolean(session.enabled),
  };
}

function historyCapacity() {
  const total = db.prepare('SELECT COUNT(*) as c FROM tracks').get().c;
  return Math.min(20, Math.floor(total / 2));
}

function getActiveScheduleSession(date = new Date()) {
  const sessions = db.prepare(`
    SELECT s.*, c.name AS category_name
    FROM schedule_sessions s
    LEFT JOIN categories c ON c.id = s.category_id
    WHERE s.enabled = 1
    ORDER BY s.start_time ASC, s.id ASC
  `).all();

  return sessions.find(session => isWithinSchedule(date, session.start_time, session.end_time)) || null;
}

function selectTrackFromSession() {
  const session = getActiveScheduleSession();
  if (!session) return null;

  const track = db.prepare(`
    SELECT *
    FROM tracks
    WHERE category_id = ?
    ORDER BY RANDOM()
    LIMIT 1
  `).get(session.category_id);

  if (!track) return null;

  return { track, session };
}

function autoSelect() {
  const sessionSelection = selectTrackFromSession();
  if (sessionSelection) {
    return sessionSelection.track;
  }

  let pool = getTracksForCurrentSlot();
  let candidates = pool.filter(track => !recentHistory.includes(track.id));

  if (candidates.length === 0) candidates = pool;

  if (candidates.length === 0) {
    candidates = db.prepare('SELECT * FROM tracks ORDER BY id ASC').all();
  }

  if (candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getCurrentStatus(date = new Date()) {
  return getRadioStatus(date, radioEnabled, startTime, endTime);
}

function getControlState() {
  const status = getCurrentStatus();

  return {
    enabled: radioEnabled,
    start_time: startTime,
    end_time: endTime,
    status: status.mode,
    canPlay: status.canPlay,
    message: status.message,
    currentTrack: summarizeTrack(currentTrack),
    activeSession: summarizeSession(getActiveScheduleSession()),
    queueLength: manualQueue.length,
  };
}

function broadcastTrackChange() {
  if (!io) return;
  io.emit('track_change', {
    track: summarizeTrack(currentTrack),
    position: 0,
  });
}

function broadcastQueueUpdate() {
  if (!io) return;
  const position = currentTrack ? Math.min(Math.floor((Date.now() - startedAt) / 1000), currentTrack.duration) : 0;
  io.emit('queue_update', {
    currentTrack: summarizeTrack(currentTrack),
    position,
    queue: manualQueue.map(summarizeTrack),
  });
}

function broadcastRadioState() {
  if (!io) return;
  const status = getCurrentStatus();
  io.emit('radio_state', {
    ...getControlState(),
    status: status.mode,
    message: status.message,
  });
}

function broadcastAll() {
  broadcastTrackChange();
  broadcastQueueUpdate();
  broadcastRadioState();
}

function loadControlState() {
  const settings = db.prepare('SELECT enabled, start_time, end_time FROM radio_settings WHERE id = 1').get();
  radioEnabled = settings ? Boolean(settings.enabled) : true;
  startTime = normalizeTime(settings?.start_time) || '06:00';
  endTime = normalizeTime(settings?.end_time) || '23:00';
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (!currentTrack) return;

  const remaining = (currentTrack.duration * 1000) - (Date.now() - startedAt);
  timer = setTimeout(() => advance(), Math.max(remaining, 0));
}

function stopCurrentTrack() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  currentTrack = null;
  startedAt = 0;
  broadcastAll();
}

function trimHistory(trackId) {
  recentHistory.push(trackId);
  const cap = historyCapacity();
  if (recentHistory.length > cap) {
    recentHistory = recentHistory.slice(-cap);
  }
}

function advance() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (currentTrack) {
    trimHistory(currentTrack.id);
  }

  const status = getCurrentStatus();
  if (!status.canPlay) {
    stopCurrentTrack();
    return;
  }

  let next = null;
  if (manualQueue.length > 0) {
    next = manualQueue.shift();
  } else {
    next = autoSelect();
  }

  if (!next) {
    currentTrack = null;
    startedAt = 0;
    broadcastAll();
    return;
  }

  currentTrack = next;
  startedAt = Date.now();

  broadcastAll();
  scheduleNext();
}

function syncPlaybackState() {
  const status = getCurrentStatus();

  if (!status.canPlay) {
    if (currentTrack) {
      stopCurrentTrack();
    } else {
      broadcastRadioState();
    }
    return;
  }

  if (!currentTrack) {
    advance();
    return;
  }

  scheduleNext();
  broadcastRadioState();
}

function init(database, socketIo) {
  db = database;
  io = socketIo;

  loadControlState();

  if (controlTimer) clearInterval(controlTimer);
  controlTimer = setInterval(syncPlaybackState, CONTROL_TICK_MS);
  controlTimer.unref?.();

  const status = getCurrentStatus();
  if (status.canPlay) {
    const first = autoSelect();
    if (first) {
      currentTrack = first;
      startedAt = Date.now();
      scheduleNext();
    }
  }

  broadcastAll();
}

function getNowPlaying() {
  const listeners = io ? io.engine.clientsCount : 0;
  const status = getCurrentStatus();
  const activeSession = summarizeSession(getActiveScheduleSession());

  if (!currentTrack) {
    return {
      track: null,
      position: 0,
      listeners,
      state: status.mode,
      radioEnabled,
      schedule: { startTime, endTime },
      message: status.message,
      activeSession,
    };
  }

  const position = Math.floor((Date.now() - startedAt) / 1000);

  return {
    track: summarizeTrack(currentTrack),
    position: Math.min(position, currentTrack.duration),
    listeners,
    state: status.mode,
    radioEnabled,
    schedule: { startTime, endTime },
    message: status.message,
    activeSession,
  };
}

function addToQueue(trackId) {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
  if (!track) return false;
  manualQueue.push(track);
  broadcastQueueUpdate();
  broadcastRadioState();
  return true;
}

function removeFromQueue(index) {
  if (index < 0 || index >= manualQueue.length) return false;
  manualQueue.splice(index, 1);
  broadcastQueueUpdate();
  broadcastRadioState();
  return true;
}

function reorderQueue(from, to) {
  if (from < 0 || from >= manualQueue.length) return false;
  if (to < 0 || to >= manualQueue.length) return false;
  const [item] = manualQueue.splice(from, 1);
  manualQueue.splice(to, 0, item);
  broadcastQueueUpdate();
  broadcastRadioState();
  return true;
}

function skip() {
  advance();
}

function getQueue() {
  return {
    currentTrack: summarizeTrack(currentTrack),
    position: currentTrack ? Math.min(Math.floor((Date.now() - startedAt) / 1000), currentTrack.duration) : 0,
    queue: manualQueue.map(summarizeTrack),
  };
}

function onTrackAdded() {
  if (!currentTrack && getCurrentStatus().canPlay) {
    const track = autoSelect();
    if (track) {
      currentTrack = track;
      startedAt = Date.now();
      broadcastAll();
      scheduleNext();
      return;
    }
  }

  broadcastRadioState();
}

function onTrackUpdated(trackId) {
  const updatedTrack = db.prepare('SELECT * FROM tracks WHERE id = ?').get(trackId);
  if (!updatedTrack) return;

  manualQueue = manualQueue.map(track => (track.id === trackId ? updatedTrack : track));

  if (currentTrack && currentTrack.id === trackId) {
    currentTrack = updatedTrack;
    broadcastTrackChange();
    scheduleNext();
  }

  broadcastQueueUpdate();
  broadcastRadioState();
}

function onTrackDeleted(id) {
  manualQueue = manualQueue.filter(track => track.id !== id);

  if (currentTrack && currentTrack.id === id) {
    if (getCurrentStatus().canPlay) {
      advance();
    } else {
      stopCurrentTrack();
    }
  } else {
    broadcastQueueUpdate();
    broadcastRadioState();
  }
}

function updateRadioSettings({ enabled, startTime: nextStartTime, endTime: nextEndTime }) {
  const normalizedStart = normalizeTime(nextStartTime) || startTime;
  const normalizedEnd = normalizeTime(nextEndTime) || endTime;
  const nextEnabled = typeof enabled === 'boolean' ? enabled : radioEnabled;

  db.prepare(
    'UPDATE radio_settings SET enabled = ?, start_time = ?, end_time = ? WHERE id = 1'
  ).run(nextEnabled ? 1 : 0, normalizedStart, normalizedEnd);

  loadControlState();
  syncPlaybackState();

  return getControlState();
}

function getRadioSettings() {
  return getControlState();
}

function stop(reason = 'manual') {
  if (currentTrack) {
    stopCurrentTrack();
  } else {
    broadcastRadioState();
  }

  return { stopped: true, reason };
}

function shutdown() {
  if (timer) clearTimeout(timer);
  if (controlTimer) clearInterval(controlTimer);
  timer = null;
  controlTimer = null;
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
  onTrackUpdated,
  onTrackDeleted,
  updateRadioSettings,
  getRadioSettings,
  syncPlaybackState,
  stop,
  shutdown,
};
