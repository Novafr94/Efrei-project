// frontend/js/admin.js

const socket = io();

// ── Auth ──────────────────────────────────────────────────────
let AUTH_TOKEN = sessionStorage.getItem('admin_token') || '';

async function checkAuth(token) {
  const res = await fetch('/api/admin/tracks', {
    headers: { Authorization: `Bearer ${token}` },
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
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('admin-panel').style.display = '';
  document.getElementById('skip-link').setAttribute('href', '#admin-panel');
  loadAll();
}

// ── Toast ─────────────────────────────────────────────────────
const toast = document.getElementById('toast');
let toastTimer;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Section toggles ──────────────────────────────────────────
function updateSectionToggle(section) {
  const toggle = section.querySelector('.section-toggle');
  const title = section.querySelector('.section-title')?.textContent.trim() || 'section';

  if (!toggle) return;

  const collapsed = section.classList.contains('is-collapsed');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title} section`);
}

function setupSectionToggles() {
  document.querySelectorAll('.admin-section').forEach((section) => {
    const toggle = section.querySelector('.section-toggle');

    if (!toggle) return;

    toggle.addEventListener('click', () => {
      section.classList.toggle('is-collapsed');
      updateSectionToggle(section);
    });

    updateSectionToggle(section);
  });
}

// ── API helpers ────────────────────────────────────────────────
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

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

// ── Shared state ───────────────────────────────────────────────
let categories = [];
let anecdotes = [];
let scheduleSessions = [];
let editingTrackId = null;
let editingCategoryId = null;
let editingAnecdoteId = null;
let editingSessionId = null;
let radioState = null;

let npInterval = null;
let npStartedAt = 0;
let npDuration = 0;

setupSectionToggles();

// ── Select helpers ─────────────────────────────────────────────
function populateCategorySelect(selectId, currentValue, options = {}) {
  const {
    allowBlank = false,
    blankLabel = '— No category —',
  } = options;

  const select = document.getElementById(selectId);
  if (!select) return;

  const previous = currentValue ?? select.value;
  const categoryOptions = categories.length > 0
    ? categories.map(category => `<option value="${category.id}">${esc(category.name)}</option>`).join('')
    : allowBlank
      ? '<option value="">No categories available</option>'
      : '<option value="1">General</option>';

  select.innerHTML = `${allowBlank ? `<option value="">${esc(blankLabel)}</option>` : ''}${categoryOptions}`;

  const hasPrevious = previous !== undefined && previous !== null && previous !== '';
  if (hasPrevious && [...select.options].some(option => option.value === String(previous))) {
    select.value = String(previous);
  } else if (allowBlank) {
    select.value = '';
  } else if (select.options.length) {
    select.value = select.options[0].value;
  }
}

function refreshCategorySelects() {
  populateCategorySelect('track-category');
  populateCategorySelect('upload-category');
  populateCategorySelect('anecdote-category', null, { allowBlank: true });
  populateCategorySelect('session-category');
}

// ── Radio control ──────────────────────────────────────────────
function updateRadioBadge(state) {
  const pill = document.getElementById('radio-status-pill');
  const message = document.getElementById('radio-status-message');
  const toggle = document.getElementById('radio-toggle-btn');

  if (!pill || !message || !toggle) return;

  const mode = state?.status || 'stopped';
  const enabled = Boolean(state?.enabled);

  pill.classList.remove('is-active', 'is-stopped', 'is-warning');

  if (mode === 'active') {
    pill.classList.add('is-active');
    pill.textContent = 'Radio active';
    toggle.textContent = 'Stop radio';
  } else if (mode === 'outside_schedule') {
    pill.classList.add('is-warning');
    pill.textContent = 'Outside schedule';
    toggle.textContent = enabled ? 'Stop radio' : 'Start radio';
  } else if (mode === 'invalid_schedule') {
    pill.classList.add('is-warning');
    pill.textContent = 'Invalid schedule';
    toggle.textContent = enabled ? 'Stop radio' : 'Start radio';
  } else {
    pill.classList.add('is-stopped');
    pill.textContent = 'Radio stopped';
    toggle.textContent = 'Start radio';
  }

  message.textContent = state?.message || '—';
  radioState = state || radioState;
}

async function loadRadioSettings() {
  const state = await apiFetch('/api/admin/radio-settings');
  document.getElementById('radio-start-time').value = state.start_time || '06:00';
  document.getElementById('radio-end-time').value = state.end_time || '23:00';
  updateRadioBadge(state);
}

document.getElementById('radio-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const state = await apiFetch('/api/admin/radio-settings', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: radioState ? Boolean(radioState.enabled) : true,
        start_time: document.getElementById('radio-start-time').value,
        end_time: document.getElementById('radio-end-time').value,
      }),
    });
    updateRadioBadge(state);
    showToast('Radio schedule saved.');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('radio-toggle-btn').addEventListener('click', async () => {
  try {
    const state = await apiFetch('/api/admin/radio-settings', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: !(radioState && radioState.enabled),
        start_time: document.getElementById('radio-start-time').value,
        end_time: document.getElementById('radio-end-time').value,
      }),
    });
    updateRadioBadge(state);
    showToast(state.enabled ? 'Radio enabled.' : 'Radio stopped.');
  } catch (err) {
    showToast(err.message);
  }
});

// ── Tracks ────────────────────────────────────────────────────
function resetTrackForm() {
  editingTrackId = null;
  const form = document.getElementById('track-form');
  const submitBtn = document.getElementById('track-submit-btn');
  const cancelBtn = document.getElementById('track-cancel-btn');
  form.reset();
  populateCategorySelect('track-category');
  submitBtn.textContent = 'Add track';
  cancelBtn.hidden = true;
  document.getElementById('track-form-details').open = false;
}

function beginTrackEdit(track) {
  editingTrackId = track.id;
  document.getElementById('track-title').value = track.title || '';
  document.getElementById('track-artist').value = track.artist || '';
  document.getElementById('track-year').value = track.year || '';
  document.getElementById('track-duration').value = track.duration || '';
  document.getElementById('track-filename').value = track.filename || '';
  document.getElementById('track-slot').value = track.time_slot || 'all';
  populateCategorySelect('track-category', track.category_id || '1');
  document.getElementById('track-submit-btn').textContent = 'Save changes';
  document.getElementById('track-cancel-btn').hidden = false;
  document.getElementById('track-form-details').open = true;
  document.getElementById('track-title').focus();
}

async function loadTracks() {
  const tracks = await apiFetch('/api/admin/tracks');
  document.getElementById('tracks-count').textContent = `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`;

  const list = document.getElementById('tracks-list');
  const queueSelect = document.getElementById('queue-track-select');

  if (queueSelect) {
    const current = queueSelect.value;
    queueSelect.innerHTML = '<option value="">— Select a track —</option>' + tracks.map(track => (
      `<option value="${track.id}">${esc(track.title)} — ${esc(track.artist)}</option>`
    )).join('');
    queueSelect.value = current;
  }

  if (!tracks.length) {
    list.innerHTML = '<p class="empty-state">No tracks yet.</p>';
    return;
  }

  list.innerHTML = tracks.map(track => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(track.title)}</div>
        <div class="item-meta">${esc(track.artist)} · ${track.year || '—'} · ${track.duration}s · ${esc(track.category_name || 'General')} · ${track.time_slot} · ${esc(track.filename)}</div>
      </div>
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
        <button class="btn btn-outline" data-action="edit-track" data-id="${track.id}" type="button">Edit</button>
        <button class="btn-delete" data-action="delete-track" data-id="${track.id}" aria-label="Delete ${esc(track.title)}" type="button">Delete</button>
      </div>
    </div>`).join('');
}

document.getElementById('track-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    title: document.getElementById('track-title').value.trim(),
    artist: document.getElementById('track-artist').value.trim(),
    year: document.getElementById('track-year').value || null,
    duration: document.getElementById('track-duration').value,
    filename: document.getElementById('track-filename').value.trim(),
    time_slot: document.getElementById('track-slot').value,
    category_id: Number(document.getElementById('track-category').value) || 1,
  };

  try {
    if (editingTrackId) {
      await apiFetch(`/api/admin/tracks/${editingTrackId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('Track updated.');
    } else {
      await apiFetch('/api/admin/tracks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Track added.');
    }

    resetTrackForm();
    await loadTracks();
    await loadQueue();
    await loadNowPlaying();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('track-cancel-btn').addEventListener('click', () => {
  resetTrackForm();
});

// ── Categories ─────────────────────────────────────────────────
function resetCategoryForm() {
  editingCategoryId = null;
  const form = document.getElementById('category-form');
  const submitBtn = document.getElementById('category-submit-btn');
  const cancelBtn = document.getElementById('category-cancel-btn');
  form.reset();
  submitBtn.textContent = 'Add category';
  cancelBtn.hidden = true;
}

function beginCategoryEdit(category) {
  editingCategoryId = category.id;
  document.getElementById('category-name-input').value = category.name || '';
  document.getElementById('category-submit-btn').textContent = 'Save changes';
  document.getElementById('category-cancel-btn').hidden = false;
  document.getElementById('category-name-input').focus();
}

async function loadCategories() {
  categories = await apiFetch('/api/admin/categories');
  document.getElementById('categories-count').textContent = `${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'}`;

  refreshCategorySelects();

  const list = document.getElementById('categories-list');
  if (!categories.length) {
    list.innerHTML = '<p class="empty-state">No categories yet.</p>';
    return;
  }

  list.innerHTML = categories.map(category => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(category.name)}</div>
        <div class="item-meta">${category.track_count} track${category.track_count === 1 ? '' : 's'}</div>
      </div>
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
        <button class="btn btn-outline" data-action="edit-category" data-id="${category.id}" type="button">Rename</button>
        <button class="btn-delete" data-action="delete-category" data-id="${category.id}" type="button" ${Number(category.track_count) > 0 ? 'title="Reassign tracks first"' : ''}>Delete</button>
      </div>
    </div>`).join('');
}

document.getElementById('category-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('category-name-input').value.trim();

  try {
    if (editingCategoryId) {
      await apiFetch(`/api/admin/categories/${editingCategoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      showToast('Category renamed.');
    } else {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      showToast('Category added.');
    }

    resetCategoryForm();
    await loadCategories();
    await loadTracks();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('category-cancel-btn').addEventListener('click', () => {
  resetCategoryForm();
});

// ── Anecdotes ─────────────────────────────────────────────────
async function loadAnecdotes() {
  anecdotes = await apiFetch('/api/admin/anecdotes');
  document.getElementById('anecdotes-count').textContent = `${anecdotes.length} anecdote${anecdotes.length !== 1 ? 's' : ''}`;
  const list = document.getElementById('anecdotes-list');

  if (!anecdotes.length) {
    list.innerHTML = '<p class="empty-state">No anecdotes yet.</p>';
    return;
  }

  list.innerHTML = anecdotes.map(a => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(a.title)}</div>
        <div class="item-meta">${[a.category_name ? esc(a.category_name) : '', `${esc(a.content.slice(0, 80))}${a.content.length > 80 ? '…' : ''}`].filter(Boolean).join(' · ')}</div>
      </div>
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
        <button class="btn btn-outline" data-action="edit-anecdote" data-id="${a.id}" type="button">Edit</button>
        <button class="btn-delete" data-action="delete-anecdote" data-id="${a.id}" aria-label="Delete ${esc(a.title)}" type="button">Delete</button>
      </div>
    </div>`).join('');
}

function resetAnecdoteForm() {
  editingAnecdoteId = null;
  const form = document.getElementById('anecdote-form');
  const submitBtn = document.getElementById('anecdote-submit-btn');
  const cancelBtn = document.getElementById('anecdote-cancel-btn');

  form.reset();
  populateCategorySelect('anecdote-category', null, { allowBlank: true });
  submitBtn.textContent = 'Add anecdote';
  cancelBtn.hidden = true;
}

function beginAnecdoteEdit(anecdote) {
  editingAnecdoteId = anecdote.id;
  document.getElementById('anecdote-title-input').value = anecdote.title || '';
  document.getElementById('anecdote-content').value = anecdote.content || '';
  document.getElementById('anecdote-artist').value = anecdote.artist || '';
  document.getElementById('anecdote-year').value = anecdote.year || '';
  populateCategorySelect('anecdote-category', anecdote.category_id || '', { allowBlank: true });
  document.getElementById('anecdote-submit-btn').textContent = 'Save changes';
  document.getElementById('anecdote-cancel-btn').hidden = false;
  document.getElementById('anecdote-title-input').focus();
}

document.getElementById('anecdote-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const categoryField = document.getElementById('anecdote-category');
  const categoryId = categoryField.value ? Number(categoryField.value) : null;

  try {
    const payload = {
      title: document.getElementById('anecdote-title-input').value.trim(),
      content: document.getElementById('anecdote-content').value.trim(),
      artist: document.getElementById('anecdote-artist').value.trim() || null,
      year: document.getElementById('anecdote-year').value || null,
      category_id: categoryId,
    };

    if (editingAnecdoteId) {
      await apiFetch(`/api/admin/anecdotes/${editingAnecdoteId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('Anecdote updated.');
    } else {
      await apiFetch('/api/admin/anecdotes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Anecdote added.');
    }

    resetAnecdoteForm();
    await loadAnecdotes();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('anecdote-cancel-btn').addEventListener('click', () => {
  resetAnecdoteForm();
});

// ── Schedule sessions ────────────────────────────────────────
async function loadSessions() {
  scheduleSessions = await apiFetch('/api/admin/sessions');
  document.getElementById('sessions-count').textContent = `${scheduleSessions.length} session${scheduleSessions.length !== 1 ? 's' : ''}`;
  const list = document.getElementById('sessions-list');

  if (!scheduleSessions.length) {
    list.innerHTML = '<p class="empty-state">No schedule sessions yet.</p>';
    return;
  }

  list.innerHTML = scheduleSessions.map(session => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(session.name)}</div>
        <div class="item-meta">${esc(session.category_name || 'Unassigned')} · ${esc(session.start_time)} - ${esc(session.end_time)} · ${session.enabled ? 'Enabled' : 'Disabled'}${session.active ? ' · Active now' : ''}</div>
      </div>
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
        <button class="btn btn-outline" data-action="edit-session" data-id="${session.id}" type="button">Edit</button>
        <button class="btn-delete" data-action="delete-session" data-id="${session.id}" aria-label="Delete ${esc(session.name)}" type="button">Delete</button>
      </div>
    </div>`).join('');
}

function resetSessionForm() {
  editingSessionId = null;
  const form = document.getElementById('session-form');
  const submitBtn = document.getElementById('session-submit-btn');
  const cancelBtn = document.getElementById('session-cancel-btn');

  form.reset();
  populateCategorySelect('session-category');
  document.getElementById('session-enabled').checked = true;
  submitBtn.textContent = 'Add session';
  cancelBtn.hidden = true;
}

function beginSessionEdit(session) {
  editingSessionId = session.id;
  document.getElementById('session-name').value = session.name || '';
  document.getElementById('session-start-time').value = session.start_time || '06:00';
  document.getElementById('session-end-time').value = session.end_time || '23:00';
  document.getElementById('session-enabled').checked = Boolean(session.enabled);
  populateCategorySelect('session-category', session.category_id || '');
  document.getElementById('session-submit-btn').textContent = 'Save changes';
  document.getElementById('session-cancel-btn').hidden = false;
  document.getElementById('session-name').focus();
}

document.getElementById('session-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const payload = {
      name: document.getElementById('session-name').value.trim(),
      category_id: Number(document.getElementById('session-category').value),
      start_time: document.getElementById('session-start-time').value,
      end_time: document.getElementById('session-end-time').value,
      enabled: document.getElementById('session-enabled').checked,
    };

    if (editingSessionId) {
      await apiFetch(`/api/admin/sessions/${editingSessionId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('Session updated.');
    } else {
      await apiFetch('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Session added.');
    }

    resetSessionForm();
    await loadSessions();
    await loadNowPlaying();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('session-cancel-btn').addEventListener('click', () => {
  resetSessionForm();
});

// ── Censor words ──────────────────────────────────────────────
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
      <button class="btn-delete" data-action="delete-censor" data-id="${w.id}" aria-label="Remove ${esc(w.word)}" type="button">Remove</button>
    </div>`).join('');
}

document.getElementById('censor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiFetch('/api/admin/censor', {
      method: 'POST',
      body: JSON.stringify({ word: document.getElementById('censor-word').value.trim() }),
    });
    e.target.reset();
    showToast('Word added.');
    loadCensor();
  } catch (err) {
    showToast(err.message);
  }
});

// ── Delete / edit event delegation ────────────────────────────
document.addEventListener('click', async (e) => {
  const actionButton = e.target.closest('[data-action]');
  if (!actionButton) return;

  const { action, id } = actionButton.dataset;

  try {
    if (action === 'edit-track') {
      const track = (await apiFetch('/api/admin/tracks')).find(item => item.id === Number(id));
      if (!track) return showToast('Track not found.');
      beginTrackEdit(track);
      return;
    }

    if (action === 'delete-track') {
      await apiFetch(`/api/admin/tracks/${id}`, { method: 'DELETE' });
      showToast('Track deleted.');
      await loadTracks();
      await loadQueue();
      await loadNowPlaying();
      return;
    }

    if (action === 'edit-category') {
      const category = categories.find(item => item.id === Number(id));
      if (!category) return showToast('Category not found.');
      beginCategoryEdit(category);
      return;
    }

    if (action === 'delete-category') {
      await apiFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
      showToast('Category deleted.');
      await loadCategories();
      await loadTracks();
      return;
    }

    if (action === 'delete-anecdote') {
      await apiFetch(`/api/admin/anecdotes/${id}`, { method: 'DELETE' });
      showToast('Deleted.');
      await loadAnecdotes();
      return;
    }

    if (action === 'edit-anecdote') {
      const anecdote = anecdotes.find(item => item.id === Number(id));
      if (!anecdote) return showToast('Anecdote not found.');
      beginAnecdoteEdit(anecdote);
      return;
    }

    if (action === 'edit-session') {
      const session = scheduleSessions.find(item => item.id === Number(id));
      if (!session) return showToast('Session not found.');
      beginSessionEdit(session);
      return;
    }

    if (action === 'delete-session') {
      await apiFetch(`/api/admin/sessions/${id}`, { method: 'DELETE' });
      showToast('Deleted.');
      await loadSessions();
      await loadNowPlaying();
      return;
    }

    if (action === 'delete-censor') {
      await apiFetch(`/api/admin/censor/${id}`, { method: 'DELETE' });
      showToast('Removed.');
      await loadCensor();
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ── Upload ────────────────────────────────────────────────────
const uploadZone = document.getElementById('upload-zone');
const uploadInput = document.getElementById('upload-input');
const btnUpload = document.getElementById('btn-upload');
const uploadFileList = document.getElementById('upload-file-list');
const uploadProgress = document.getElementById('upload-progress');
const uploadResults = document.getElementById('upload-results');

let selectedFiles = [];

uploadZone.addEventListener('click', () => uploadInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') uploadInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = 'var(--clr-copper)';
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.style.borderColor = 'var(--clr-border)';
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = 'var(--clr-border)';
  const files = Array.from(e.dataTransfer.files).filter(file => file.name.toLowerCase().endsWith('.mp3'));
  if (files.length) setUploadFiles(files);
});

uploadInput.addEventListener('change', () => {
  if (uploadInput.files.length) setUploadFiles(Array.from(uploadInput.files));
});

function setUploadFiles(files) {
  selectedFiles = files;
  uploadFileList.innerHTML = files.map(file =>
    `<div class="text-sm" style="color:var(--clr-text)">${esc(file.name)} <span class="text-muted">(${(file.size / 1024 / 1024).toFixed(1)} MB)</span></div>`
  ).join('');
  btnUpload.style.display = '';
  uploadResults.innerHTML = '';
}

btnUpload.addEventListener('click', () => {
  if (!selectedFiles.length) return;

  const formData = new FormData();
  selectedFiles.forEach(file => formData.append('files', file));
  formData.append('category_id', document.getElementById('upload-category').value || '1');

  btnUpload.disabled = true;
  btnUpload.textContent = 'Uploading...';
  uploadProgress.innerHTML = '<div style="height:4px;background:var(--clr-border);border-radius:2px;overflow:hidden"><div id="upload-bar" style="height:100%;width:0%;background:var(--clr-copper);transition:width 0.3s"></div></div>';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/admin/upload');
  xhr.setRequestHeader('Authorization', `Bearer ${AUTH_TOKEN}`);

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const bar = document.getElementById('upload-bar');
      if (bar) bar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
    }
  });

  xhr.addEventListener('load', async () => {
    btnUpload.disabled = false;
    btnUpload.textContent = 'Upload';
    btnUpload.style.display = 'none';
    uploadFileList.innerHTML = '';
    uploadProgress.innerHTML = '';
    selectedFiles = [];
    uploadInput.value = '';

    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      uploadResults.innerHTML = data.results.map(result => (
        result.success
          ? `<div class="text-sm" style="color:#27ae60">${esc(result.title)} — ${esc(result.artist)} (${result.duration}s)</div>`
          : `<div class="text-sm" style="color:#c0392b">${esc(result.originalName)}: ${esc(result.error)}</div>`
      )).join('');

      const ok = data.results.filter(result => result.success).length;
      showToast(`${ok} file(s) uploaded.`);
      await loadTracks();
      await loadQueue();
      await loadNowPlaying();
    } else {
      const err = JSON.parse(xhr.responseText || '{}');
      showToast(err.error || 'Upload failed.');
    }
  });

  xhr.addEventListener('error', () => {
    btnUpload.disabled = false;
    btnUpload.textContent = 'Upload';
    uploadProgress.innerHTML = '';
    showToast('Network error.');
  });

  xhr.send(formData);
});

// ── Now Playing & Queue ───────────────────────────────────────
let socketBound = false;

function renderNowPlaying(track, position, state, message) {
  const titleEl = document.getElementById('np-title');
  const metaEl = document.getElementById('np-meta');
  const timeEl = document.getElementById('np-time');
  const durEl = document.getElementById('np-duration');
  const progressEl = document.getElementById('np-progress');

  if (!track) {
    titleEl.textContent = state === 'stopped' ? 'Radio stopped' : 'No track';
    metaEl.textContent = message || 'The library is empty';
    timeEl.textContent = '0:00';
    durEl.textContent = '0:00';
    progressEl.style.width = '0%';
    npDuration = 0;
    if (npInterval) {
      clearInterval(npInterval);
      npInterval = null;
    }
    return;
  }

  titleEl.textContent = track.title;
  metaEl.textContent = `${track.artist} · ${track.year || '—'} · ${track.duration}s · ${track.filename}`;
  npDuration = track.duration;
  npStartedAt = Date.now() - (position * 1000);

  if (npInterval) clearInterval(npInterval);
  npInterval = setInterval(() => {
    const pos = Math.min(Math.floor((Date.now() - npStartedAt) / 1000), npDuration);
    timeEl.textContent = fmtTime(pos);
    durEl.textContent = fmtTime(npDuration);
    progressEl.style.width = npDuration > 0 ? `${(pos / npDuration) * 100}%` : '0%';
  }, 1000);
}

function renderQueue(queue) {
  const list = document.getElementById('queue-list');
  if (!queue || !queue.length) {
    list.innerHTML = '<p class="empty-state">Queue is empty — the auto-DJ picks tracks automatically.</p>';
    return;
  }

  list.innerHTML = queue.map((track, index) => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-title">${esc(track.title)}</div>
        <div class="item-meta">${esc(track.artist)} · ${track.duration}s</div>
      </div>
      <button class="btn-delete" data-queue-index="${index}" aria-label="Remove ${esc(track.title)}" type="button">Remove</button>
    </div>`).join('');
}

function populateQueueSelect(tracks) {
  const select = document.getElementById('queue-track-select');
  const current = select.value;
  select.innerHTML = '<option value="">— Select a track —</option>' + tracks.map(track => (
    `<option value="${track.id}">${esc(track.title)} — ${esc(track.artist)}</option>`
  )).join('');
  select.value = current;
}

async function loadQueue() {
  try {
    const data = await apiFetch('/api/admin/queue');
    renderNowPlaying(data.currentTrack, data.position || 0, radioState?.status, radioState?.message);
    renderQueue(data.queue);
  } catch {
    // ignore on initial load if the server is still booting
  }
}

async function loadNowPlaying() {
  try {
    const res = await fetch('/api/radio/now-playing');
    if (res.ok) {
      const data = await res.json();
      renderNowPlaying(data.track, data.position, data.state, data.message);
    }
  } catch {
    // ignore
  }
}

document.getElementById('btn-skip').addEventListener('click', async () => {
  try {
    await apiFetch('/api/admin/queue/skip', { method: 'POST', body: '{}' });
    showToast('Skipped to next track.');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('queue-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const trackId = Number(document.getElementById('queue-track-select').value);
  if (!trackId) return showToast('Please select a track.');

  try {
    await apiFetch('/api/admin/queue', {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    });
    showToast('Added to queue.');
  } catch (err) {
    showToast(err.message);
  }
});

socket.on('track_change', (data) => {
  renderNowPlaying(data.track, data.position || 0, radioState?.status, radioState?.message);
});

socket.on('queue_update', (data) => {
  renderNowPlaying(data.currentTrack, data.position || 0, radioState?.status, radioState?.message);
  renderQueue(data.queue);
});

socket.on('radio_state', (state) => {
  updateRadioBadge(state);
  if (!state.currentTrack) {
    renderNowPlaying(null, 0, state.status, state.message);
  }
});

// ── Load all ──────────────────────────────────────────────────
async function loadAll() {
  await loadRadioSettings();
  await loadCategories();
  await loadTracks();
  await loadAnecdotes();
  await loadSessions();
  await loadCensor();
  await loadNowPlaying();
  await loadQueue();
}

init();