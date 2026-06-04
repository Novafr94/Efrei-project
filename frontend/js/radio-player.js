// frontend/js/radio-player.js

// ── DOM refs ────────────────────────────────────────────────
function getRadioAudio() {
  return document.getElementById('audio') || document.querySelector('audio');
}

const radioAudio    = getRadioAudio();
const btnPlay       = document.getElementById('btn-play');
const iconPlay      = document.getElementById('icon-play');
const iconPause     = document.getElementById('icon-pause');
const trackTitle    = document.getElementById('track-title');
const trackArtist   = document.getElementById('track-artist');
const trackYear     = document.getElementById('track-year');
const progressFill  = document.getElementById('progress-fill');
const progressBar   = document.getElementById('progress-bar');
const timeCurrent   = document.getElementById('time-current');
const timeTotal     = document.getElementById('time-total');
const listenerCount = document.getElementById('listener-count');
const radioStatus   = document.getElementById('radio-status');
const volumeDrawer  = document.getElementById('volume-control');
const volumeToggle  = document.getElementById('volume-toggle');
const volumePanel   = document.getElementById('volume-panel');
const volumeSlider  = document.getElementById('volume-slider');
const volumeValue   = document.getElementById('volume-value');
const anecdoteTitle   = document.getElementById('anecdote-title');
const anecdoteContent = document.getElementById('anecdote-content');
const anecdoteMeta    = document.getElementById('anecdote-meta');
const toast         = document.getElementById('toast');

// ── State ───────────────────────────────────────────────────
let currentTrack  = null;
let isPlaying     = false;
let toastTimer    = null;
let pollTimer     = null;
let anecdoteTimer = null;
let radioState    = { status: 'stopped', message: 'Radio stopped.' };
const defaultVolume = 0.5;

// ── Utilities ────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function clampVolume(value) {
  return Math.min(1, Math.max(0, value));
}

function updateVolumeDisplay(volume) {
  if (!volumeSlider || !volumeValue) return;
  const percentage = Math.round(clampVolume(volume) * 100);
  volumeValue.textContent = `${percentage}%`;
  volumeSlider.value = String(percentage);
  volumeSlider.setAttribute('aria-valuetext', `${percentage}%`);
}

function setAudioVolume(volume) {
  if (!radioAudio) return;
  radioAudio.volume = clampVolume(volume);
  updateVolumeDisplay(radioAudio.volume);
}

function setVolumeDrawerOpen(isOpen) {
  if (!volumeDrawer || !volumeToggle || !volumePanel) return;
  volumeDrawer.classList.toggle('is-open', isOpen);
  volumeToggle.setAttribute('aria-expanded', String(isOpen));
  volumeToggle.setAttribute('aria-label', isOpen ? 'Close volume control' : 'Open volume control');
  volumePanel.setAttribute('aria-hidden', String(!isOpen));
}

function setRadioState(state) {
  radioState = { ...radioState, ...state };
  if (radioStatus) {
    if (radioState.status === 'active') {
      radioStatus.textContent = 'Radio active';
    } else if (radioState.status === 'outside_schedule') {
      radioStatus.textContent = 'Outside schedule';
    } else if (radioState.status === 'invalid_schedule') {
      radioStatus.textContent = 'Invalid schedule';
    } else {
      radioStatus.textContent = 'Radio stopped';
    }
  }
}

function stopPlayback(message) {
  if (radioAudio) {
    radioAudio.pause();
    radioAudio.removeAttribute('src');
    radioAudio.load();
  }
  currentTrack = null;
  timeCurrent.textContent = '0:00';
  timeTotal.textContent = '0:00';
  progressFill.style.width = '0%';
  progressBar.setAttribute('aria-valuenow', '0');
  setPlayState(false);
  if (message) showToast(message);
}

// ── Radio player ─────────────────────────────────────────────
async function fetchNowPlaying() {
  try {
    const res  = await fetch('/api/radio/now-playing');
    const data = await res.json();

    setRadioState({
      status: data.state,
      message: data.message,
      enabled: data.radioEnabled,
    });
    listenerCount.textContent = data.listeners;

    if (!data.track) {
      stopPlayback(data.message || 'No track available.');
      trackTitle.textContent = data.state === 'stopped' ? 'Radio stopped' : 'No track available';
      trackArtist.textContent = '';
      trackYear.textContent = '';
      return;
    }

    // Only reload audio if track changed
    if (!currentTrack || currentTrack.id !== data.track.id) {
      currentTrack = data.track;
      renderTrack(data.track, data.position);
    } else {
      // Same track — just sync position if drift > 3s
      const drift = Math.abs(radioAudio.currentTime - data.position);
      if (drift > 3) radioAudio.currentTime = data.position;
    }
  } catch (err) {
    trackTitle.textContent  = 'No track available';
    trackArtist.textContent = '';
    trackYear.textContent   = '';
  }
}

function renderTrack(track, position) {
  trackTitle.textContent  = track.title;
  trackArtist.textContent = track.artist;
  trackYear.textContent   = track.year || '';
  setRadioState(radioState);

  timeTotal.textContent = formatTime(track.duration);
  progressBar.setAttribute('aria-valuemax', track.duration);

  // Set audio source — files served from /audio/
  if (!radioAudio) return;
  radioAudio.src         = `/audio/${track.filename}`;
  radioAudio.currentTime = position;

  if (isPlaying) radioAudio.play().catch(() => {});
}

function updateProgress() {
  if (!currentTrack || !radioAudio || !radioAudio.duration) return;
  const pos     = radioAudio.currentTime;
  const dur     = currentTrack.duration;
  const pct     = Math.min((pos / dur) * 100, 100);

  progressFill.style.width = `${pct}%`;
  timeCurrent.textContent  = formatTime(pos);
  progressBar.setAttribute('aria-valuenow', Math.round(pct));
}

function setPlayState(playing) {
  isPlaying = playing;
  btnPlay.setAttribute('aria-pressed', String(playing));
  btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  iconPlay.style.display  = playing ? 'none' : '';
  iconPause.style.display = playing ? ''     : 'none';
}

function handleVolumeInput() {
  if (!radioAudio || !volumeSlider) return;
  const sliderVolume = Number(volumeSlider.value) / 100;
  setAudioVolume(sliderVolume);
}

if (radioAudio) {
  setAudioVolume(defaultVolume);
} else if (volumeValue) {
  volumeValue.textContent = '—';
}

btnPlay.addEventListener('click', () => {
  if (!radioAudio || !currentTrack) {
    showToast(radioState.message || 'Radio is stopped.');
    return;
  }

  if (isPlaying) {
    radioAudio.pause();
    setPlayState(false);
  } else {
    radioAudio.play().catch(() => showToast('Unable to play audio. File may be missing.'));
    setPlayState(true);
  }
});

if (radioAudio) {
  radioAudio.addEventListener('timeupdate', updateProgress);
  radioAudio.addEventListener('ended', fetchNowPlaying);
  radioAudio.addEventListener('error', () => {
    if (currentTrack) showToast(`Audio file not found: ${currentTrack.filename}`);
  });
}

if (volumeSlider) {
  volumeSlider.addEventListener('input', handleVolumeInput);
}

if (volumeToggle) {
  volumeToggle.addEventListener('click', () => {
    const isOpen = !volumeDrawer.classList.contains('is-open');
    setVolumeDrawerOpen(isOpen);
  });
}

setVolumeDrawerOpen(false);

// ── Anecdotes ─────────────────────────────────────────────────
async function fetchAnecdote() {
  try {
    const res  = await fetch('/api/radio/anecdotes');
    if (!res.ok) return;
    const data = await res.json();

    anecdoteTitle.textContent   = data.title;
    anecdoteContent.textContent = data.content;
    anecdoteMeta.textContent    = [data.category_name, data.artist, data.year].filter(Boolean).join(' · ');
  } catch {}
}

// ── Panel toggle ──────────────────────────────────────────────
const panelAnecdotes = document.getElementById('panel-anecdotes');
const panelChat      = document.getElementById('panel-chat');

document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    const target = tab.dataset.panel;
    panelAnecdotes.style.display = target === 'anecdotes' ? '' : 'none';
    panelChat.style.display      = target === 'chat'      ? '' : 'none';
  });
});

// ── Chat ──────────────────────────────────────────────────────
const socket       = io();
const pseudoForm   = document.getElementById('pseudo-form');
const pseudoInput  = document.getElementById('pseudo-input');
const chatMessages = document.getElementById('chat-messages');
const inputArea    = document.getElementById('chat-input-area');
const messageInput = document.getElementById('message-input');

let pseudo = null;

// Load message history
async function loadHistory() {
  try {
    const res  = await fetch('/api/chat/messages');
    const msgs = await res.json();
    if (msgs.length === 0) return;
    chatMessages.innerHTML = '';
    msgs.forEach(appendMessage);
  } catch {}
}

function appendMessage({ pseudo: p, content, created_at }) {
  const time = new Date(created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const li   = document.createElement('li');
  li.className = 'chat-message';
  // Use textContent for p/span to prevent XSS
  const header  = document.createElement('div');
  header.className = 'chat-message-header';
  const nameEl  = document.createElement('span');
  nameEl.className  = 'chat-pseudo';
  nameEl.textContent = p;
  const timeEl  = document.createElement('span');
  timeEl.className  = 'chat-time';
  timeEl.textContent = time;
  header.append(nameEl, timeEl);

  const body = document.createElement('p');
  body.className   = 'chat-content';
  body.textContent = content;

  li.append(header, body);
  chatMessages.appendChild(li);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Join
pseudoForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = pseudoInput.value.trim();
  if (!name) return;
  socket.emit('join', { pseudo: name });
});

socket.on('join_ok', ({ pseudo: p }) => {
  pseudo = p;
  pseudoForm.classList.add('hidden');
  inputArea.classList.remove('hidden');
  loadHistory();
});

// Send message
inputArea.addEventListener('submit', e => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content) return;
  socket.emit('message', { content });
  messageInput.value = '';
});

// Receive messages
socket.on('message', (msg) => {
  // Clear empty state on first message
  const empty = chatMessages.querySelector('.chat-empty');
  if (empty) empty.remove();
  appendMessage(msg);
});

// Listener count updates
socket.on('listener_count', ({ count }) => {
  listenerCount.textContent = count;
});

// Server errors
socket.on('error', ({ message }) => showToast(message));

// Auto-DJ track changes (real-time sync)
socket.on('track_change', (data) => {
  if (data.track) {
    currentTrack = data.track;
    renderTrack(data.track, data.position || 0);
  } else {
    stopPlayback(radioState.message || 'Radio stopped.');
  }
});

socket.on('radio_state', (state) => {
  setRadioState(state);
  if (!state.currentTrack) {
    stopPlayback(state.message || 'Radio stopped.');
  }
});

// ── Init ──────────────────────────────────────────────────────
fetchNowPlaying();
fetchAnecdote();

// Poll now-playing every 30s to catch track changes
pollTimer = setInterval(fetchNowPlaying, 30_000);

// Refresh anecdote every 2 minutes
anecdoteTimer = setInterval(fetchAnecdote, 120_000);

// Autoplay if redirected from homepage
if (new URLSearchParams(location.search).get('autoplay') === '1') {
  if (radioAudio) {
    radioAudio.addEventListener('canplay', () => {
      radioAudio.play().then(() => setPlayState(true)).catch(() => {});
    }, { once: true });
  }
}
