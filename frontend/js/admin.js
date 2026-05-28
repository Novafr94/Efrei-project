// frontend/js/admin.js

// ── Auth ────────────────────────────────────────────────
let AUTH_TOKEN = sessionStorage.getItem('admin_token') || '';

async function checkAuth(token) {
  const res = await fetch('/api/admin/tracks', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}

async function init() {
  if (AUTH_TOKEN && await checkAuth(AUTH_TOKEN)) {
    showPanel();
  }
}

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('password-input').value;
  if (await checkAuth(pwd)) {
    AUTH_TOKEN = pwd;
    sessionStorage.setItem('admin_token', pwd);
    showPanel();
  } else {
    document.getElementById('auth-error').textContent = 'Incorrect password.';
  }
});

function showPanel() {
  document.getElementById('auth-gate').style.display   = 'none';
  document.getElementById('admin-panel').style.display = '';
  document.getElementById('skip-link').setAttribute('href', '#admin-panel');
  loadAll();
}

// ── Toast ───────────────────────────────────────────────
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── API helpers ─────────────────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` };
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

// XSS-safe escaping for innerHTML
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Tracks ──────────────────────────────────────────────
async function loadTracks() {
  const tracks = await apiFetch('/api/admin/tracks');
  document.getElementById('tracks-count').textContent = `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`;
  const list = document.getElementById('tracks-list');
  if (!tracks.length) {
    list.innerHTML = '<p class="empty-state">No tracks yet.</p>';
    return;
  }
  list.innerHTML = tracks.map(t => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(t.title)}</div>
        <div class="item-meta">${esc(t.artist)} · ${t.year || '—'} · ${t.duration}s · ${t.time_slot} · ${esc(t.filename)}</div>
      </div>
      <button class="btn-delete" data-id="${t.id}" data-type="track" aria-label="Delete ${esc(t.title)}">Delete</button>
    </div>`).join('');
}

document.getElementById('track-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/admin/tracks', {
      method: 'POST',
      body: JSON.stringify({
        title:     document.getElementById('track-title').value.trim(),
        artist:    document.getElementById('track-artist').value.trim(),
        year:      document.getElementById('track-year').value || null,
        duration:  document.getElementById('track-duration').value,
        filename:  document.getElementById('track-filename').value.trim(),
        time_slot: document.getElementById('track-slot').value,
      })
    });
    e.target.reset();
    showToast('Track added.');
    loadTracks();
  } catch (err) { showToast(err.message); }
});

// ── Anecdotes ───────────────────────────────────────────
async function loadAnecdotes() {
  const items = await apiFetch('/api/admin/anecdotes');
  document.getElementById('anecdotes-count').textContent = `${items.length} anecdote${items.length !== 1 ? 's' : ''}`;
  const list = document.getElementById('anecdotes-list');
  if (!items.length) {
    list.innerHTML = '<p class="empty-state">No anecdotes yet.</p>';
    return;
  }
  list.innerHTML = items.map(a => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(a.title)}</div>
        <div class="item-meta">${esc(a.content.slice(0, 80))}${a.content.length > 80 ? '…' : ''}</div>
      </div>
      <button class="btn-delete" data-id="${a.id}" data-type="anecdote" aria-label="Delete ${esc(a.title)}">Delete</button>
    </div>`).join('');
}

document.getElementById('anecdote-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/admin/anecdotes', {
      method: 'POST',
      body: JSON.stringify({
        title:   document.getElementById('anecdote-title-input').value.trim(),
        content: document.getElementById('anecdote-content').value.trim(),
        artist:  document.getElementById('anecdote-artist').value.trim() || null,
        year:    document.getElementById('anecdote-year').value || null,
      })
    });
    e.target.reset();
    showToast('Anecdote added.');
    loadAnecdotes();
  } catch (err) { showToast(err.message); }
});

// ── Censor words ────────────────────────────────────────
async function loadCensor() {
  const items = await apiFetch('/api/admin/censor');
  document.getElementById('censor-count').textContent = `${items.length} word${items.length !== 1 ? 's' : ''}`;
  const list = document.getElementById('censor-list');
  if (!items.length) {
    list.innerHTML = '<p class="empty-state">No banned words.</p>';
    return;
  }
  list.innerHTML = items.map(w => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(w.word)}</div>
      </div>
      <button class="btn-delete" data-id="${w.id}" data-type="censor" aria-label="Remove ${esc(w.word)}">Remove</button>
    </div>`).join('');
}

document.getElementById('censor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/admin/censor', {
      method: 'POST',
      body: JSON.stringify({ word: document.getElementById('censor-word').value.trim() })
    });
    e.target.reset();
    showToast('Word added.');
    loadCensor();
  } catch (err) { showToast(err.message); }
});

// ── Delete (event delegation) ───────────────────────────
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  const { id, type } = btn.dataset;
  const urlMap    = { track: 'tracks', anecdote: 'anecdotes', censor: 'censor' };
  const reloadMap = { track: loadTracks, anecdote: loadAnecdotes, censor: loadCensor };
  try {
    await apiFetch(`/api/admin/${urlMap[type]}/${id}`, { method: 'DELETE' });
    showToast('Deleted.');
    reloadMap[type]();
  } catch (err) { showToast(err.message); }
});

// ── Load all ────────────────────────────────────────────
function loadAll() {
  loadTracks();
  loadAnecdotes();
  loadCensor();
}

init();
