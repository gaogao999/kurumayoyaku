'use strict';

const $ = (sel) => document.querySelector(sel);
const state = { categories: [], activeCategory: 'all', q: '' };

// --- Utilities -------------------------------------------------------------
const fmtSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
const fmtDate = (iso) => {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const iconFor = (name) => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'xls' || ext === 'xlsx') return '📗';
  if (ext === 'doc' || ext === 'docx') return '📘';
  return '📄';
};
const esc = (s) =>
  (s ?? '').toString().replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

async function api(path, opts) {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, ...opts });
  if (res.status === 401) {
    location.href = '/login.html';
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error (${res.status})`);
  return data;
}

// --- Categories ------------------------------------------------------------
async function loadCategories() {
  state.categories = await api('/api/categories');
  renderCategories();
  renderCategoryOptions();
}

function renderCategories() {
  const ul = $('#categoryList');
  const total = state.categories.reduce((s, c) => s + c.file_count, 0);
  const items = [
    { id: 'all', name: 'All', file_count: total, fixed: true },
    ...state.categories,
    { id: 'none', name: 'Uncategorized', file_count: -1, fixed: true },
  ];
  ul.innerHTML = items
    .map((c) => {
      const active = String(state.activeCategory) === String(c.id) ? ' active' : '';
      const count = c.file_count >= 0 ? `<span class="count">${c.file_count}</span>` : '';
      const del =
        c.fixed ? '' : `<button class="del-cat" data-id="${c.id}" title="Delete">×</button>`;
      return `<li class="cat-item${active}" data-id="${c.id}">
        <span class="cat-name">${esc(c.name)}</span>${count}${del}</li>`;
    })
    .join('');
}

function renderCategoryOptions() {
  $('#uploadCategory').innerHTML =
    '<option value="">Uncategorized</option>' +
    state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

// --- File list -------------------------------------------------------------
async function loadFiles() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.activeCategory !== 'all') params.set('category', state.activeCategory);
  const files = await api(`/api/files?${params.toString()}`);
  renderFiles(files);
}

function renderFiles(files) {
  $('#listInfo').textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
  const tbody = $('#fileRows');
  if (files.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No matching files</td></tr>`;
    return;
  }
  tbody.innerHTML = files
    .map(
      (f) => `<tr>
        <td class="icon">${iconFor(f.original_name)}</td>
        <td>
          <div class="file-title">${esc(f.title)}</div>
          ${f.description ? `<div class="file-desc">${esc(f.description)}</div>` : ''}
          <div class="file-orig">${esc(f.original_name)}</div>
        </td>
        <td>${f.category_name ? esc(f.category_name) : '<span class="muted">Uncategorized</span>'}</td>
        <td>${fmtSize(f.size)}</td>
        <td>${fmtDate(f.uploaded_at)}</td>
        <td>${esc(f.uploaded_by_name || '-')}</td>
        <td class="actions">
          <a class="btn-link" href="/api/files/${f.id}/download">⬇ Download</a>
          <button class="btn-link danger del-file" data-id="${f.id}">Delete</button>
        </td>
      </tr>`
    )
    .join('');
}

// --- Events ----------------------------------------------------------------
function bindEvents() {
  // Select / delete category (delegated)
  $('#categoryList').addEventListener('click', async (e) => {
    const del = e.target.closest('.del-cat');
    if (del) {
      e.stopPropagation();
      if (!confirm('Delete this category? Files in it will become Uncategorized.')) return;
      await api(`/api/categories/${del.dataset.id}`, { method: 'DELETE' });
      if (String(state.activeCategory) === del.dataset.id) state.activeCategory = 'all';
      await loadCategories();
      await loadFiles();
      return;
    }
    const item = e.target.closest('.cat-item');
    if (item) {
      state.activeCategory = item.dataset.id;
      renderCategories();
      loadFiles();
    }
  });

  // Add category
  $('#categoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#newCategory').value.trim();
    if (!name) return;
    try {
      await api('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      $('#newCategory').value = '';
      await loadCategories();
    } catch (err) {
      alert(err.message);
    }
  });

  // Search (as you type)
  let timer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(timer);
    state.q = e.target.value;
    timer = setTimeout(loadFiles, 250);
  });

  // Delete file (delegated)
  $('#fileRows').addEventListener('click', async (e) => {
    const del = e.target.closest('.del-file');
    if (!del) return;
    if (!confirm('Delete this file?')) return;
    await api(`/api/files/${del.dataset.id}`, { method: 'DELETE' });
    await loadFiles();
    await loadCategories();
  });

  // Upload modal
  const dialog = $('#uploadDialog');
  $('#uploadOpen').addEventListener('click', () => {
    $('#uploadForm').reset();
    $('#uploadError').hidden = true;
    // Preselect the currently active category
    if (state.activeCategory !== 'all' && state.activeCategory !== 'none') {
      $('#uploadCategory').value = state.activeCategory;
    }
    dialog.showModal();
  });
  $('#uploadCancel').addEventListener('click', () => dialog.close());

  $('#uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = $('#file');
    if (!fileInput.files.length) return;
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('title', $('#title').value);
    fd.append('description', $('#description').value);
    fd.append('category_id', $('#uploadCategory').value);
    try {
      await api('/api/files', { method: 'POST', body: fd });
      dialog.close();
      await loadFiles();
      await loadCategories();
    } catch (err) {
      const el = $('#uploadError');
      el.textContent = err.message;
      el.hidden = false;
    }
  });
}

// --- Bootstrap --------------------------------------------------------------
async function init() {
  try {
    const { user } = await api('/api/me');
    $('#me').textContent = user.display_name || user.username;
  } catch {
    return; // api() already redirected on 401
  }
  bindEvents();
  await loadCategories();
  await loadFiles();
}

init();
