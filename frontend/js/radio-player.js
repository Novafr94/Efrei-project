// frontend/js/radio-player.js

// ── DOM refs ────────────────────────────────────────────────
const audio         = document.getElementById('audio');
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

// ── Radio player ─────────────────────────────────────────────
async function fetchNowPlaying() {
  try {
    const res  = await fetch('/api/radio/now-playing');
    if (!res.ok) throw new Error('No track available');
    const data = await res.json();

    listenerCount.textContent = data.listeners;

    // Only reload audio if track changed
    if (!currentTrack || currentTrack.id !== data.track.id) {
      currentTrack = data.track;
      renderTrack(data.track, data.position);
    } else {
      // Same track — just sync position if drift > 3s
      const drift = Math.abs(audio.currentTime - data.position);
      if (drift > 3) audio.currentTime = data.position;
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

  timeTotal.textContent = formatTime(track.duration);
  progressBar.setAttribute('aria-valuemax', track.duration);

  // Set audio source — files served from /audio/
  audio.src         = `/audio/${track.filename}`;
  audio.currentTime = position;

  if (isPlaying) audio.play().catch(() => {});
}

function updateProgress() {
  if (!currentTrack || !audio.duration) return;
  const pos     = audio.currentTime;
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

btnPlay.addEventListener('click', () => {
  if (!currentTrack) return;

  if (isPlaying) {
    audio.pause();
    setPlayState(false);
  } else {
    audio.play().catch(() => showToast('Unable to play audio. File may be missing.'));
    setPlayState(true);
  }
});

audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('ended', fetchNowPlaying);
audio.addEventListener('error', () => {
  if (currentTrack) showToast(`Audio file not found: ${currentTrack.filename}`);
});

// ── Anecdotes ─────────────────────────────────────────────────
async function fetchAnecdote() {
  try {
    const res  = await fetch('/api/radio/anecdotes');
    if (!res.ok) return;
    const data = await res.json();

    anecdoteTitle.textContent   = data.title;
    anecdoteContent.textContent = data.content;
    anecdoteMeta.textContent    = [data.artist, data.year].filter(Boolean).join(' · ');
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

// ── Init ──────────────────────────────────────────────────────
fetchNowPlaying();
fetchAnecdote();

// Poll now-playing every 30s to catch track changes
pollTimer = setInterval(fetchNowPlaying, 30_000);

// Refresh anecdote every 2 minutes
anecdoteTimer = setInterval(fetchAnecdote, 120_000);

// Autoplay if redirected from homepage
if (new URLSearchParams(location.search).get('autoplay') === '1') {
  audio.addEventListener('canplay', () => {
    audio.play().then(() => setPlayState(true)).catch(() => {});
  }, { once: true });
}
