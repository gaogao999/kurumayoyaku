'use strict';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const OPEN = '08:00';
const CLOSE = '22:00';

// ---- 時刻スロット（8:00〜22:00 を30分きざみ） -----------------------------
function buildSlots() {
  const slots = [];
  for (let m = 8 * 60; m <= 22 * 60; m += 30) {
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const mi = String(m % 60).padStart(2, '0');
    slots.push(`${h}:${mi}`);
  }
  return slots; // ['08:00', ..., '22:00']
}
const SLOTS = buildSlots();

// ---- 日付ユーティリティ（ローカル時刻ベース） -----------------------------
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function mondayOf(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(r, diff);
}

// ---- 状態 ------------------------------------------------------------------
let users = [];
let weekOffset = 0;
let meId = Number(localStorage.getItem('kurumayoyaku.meId')) || null;

const $ = (sel) => document.querySelector(sel);

// ---- 通信 ------------------------------------------------------------------
async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || '通信エラー');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---- メンバー選択 ----------------------------------------------------------
function renderMeSelect() {
  const sel = $('#me-select');
  sel.innerHTML = '';
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === meId) opt.selected = true;
    sel.appendChild(opt);
  }
  if (!meId && users.length) {
    meId = users[0].id;
    localStorage.setItem('kurumayoyaku.meId', meId);
  }
}

// ---- 週の描画 --------------------------------------------------------------
async function renderWeek() {
  const monday = addDays(mondayOf(new Date()), weekOffset * 7);
  const saturday = addDays(monday, 5);
  $('#week-label').textContent =
    `${monday.getMonth() + 1}/${monday.getDate()} 〜 ${saturday.getMonth() + 1}/${saturday.getDate()}`;

  const reservations = await api(
    `/api/reservations?from=${ymd(monday)}&to=${ymd(saturday)}`
  );
  const byDate = new Map();
  for (const r of reservations) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  const todayStr = ymd(new Date());
  const grid = $('#week-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 6; i++) {        // 月(0)〜土(5)
    const d = addDays(monday, i);
    const dateStr = ymd(d);
    const list = byDate.get(dateStr) || [];

    const card = document.createElement('section');
    card.className = 'day';
    if (i === 5) card.classList.add('sat');
    if (dateStr === todayStr) card.classList.add('today');
    if (dateStr < todayStr) card.classList.add('past');

    // 見出し行（曜日・日付・追加ボタン）
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML =
      `<span class="dow">${DOW[d.getDay()]}</span>` +
      `<span class="date">${d.getMonth() + 1}/${d.getDate()}</span>`;
    const addBtn = document.createElement('button');
    addBtn.className = 'add';
    addBtn.textContent = '＋ 追加';
    addBtn.addEventListener('click', () => openAddDialog(dateStr, d));
    head.appendChild(addBtn);
    card.appendChild(head);

    // 予約ブロック一覧
    const body = document.createElement('div');
    body.className = 'day-body';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '空き';
      body.appendChild(empty);
    } else {
      for (const r of list) {
        const block = document.createElement('div');
        block.className = 'res' + (r.user_id === meId ? ' mine' : '');
        block.style.borderLeftColor = r.user_color;
        const mine = r.user_id === meId;
        block.innerHTML =
          `<span class="time">${r.start_time}〜${r.end_time}</span>` +
          `<span class="who" style="color:${r.user_color}">${r.user_name}</span>` +
          (r.note ? `<span class="note">${escapeHtml(r.note)}</span>` : '') +
          (mine ? `<span class="edit">編集 ›</span>` : '');
        if (mine) block.addEventListener('click', () => openEditDialog(d, r));
        body.appendChild(block);
      }
    }
    card.appendChild(body);
    grid.appendChild(card);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 予約ダイアログ --------------------------------------------------------
function fillTimeSelect(sel, slots, selected) {
  sel.innerHTML = '';
  for (const t of slots) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === selected) opt.selected = true;
    sel.appendChild(opt);
  }
}

function dialogDateTitle(d) {
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
}

function openAddDialog(dateStr, dateObj) {
  if (!meId) return toast('先に「わたしは」を選んでください');
  const dlg = $('#res-dialog');
  $('#res-title').textContent = `${dialogDateTitle(dateObj)} の予約を追加`;
  fillTimeSelect($('#res-start'), SLOTS.slice(0, -1), '09:00');   // 開始: 8:00〜21:30
  fillTimeSelect($('#res-end'), SLOTS.slice(1), '10:00');         // 終了: 8:30〜22:00
  $('#res-note').value = '';
  $('#res-delete').hidden = true;
  $('#res-save').textContent = '予約する';

  $('#res-save').onclick = async () => {
    try {
      await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          date: dateStr,
          start: $('#res-start').value,
          end: $('#res-end').value,
          user_id: meId,
          note: $('#res-note').value,
        }),
      });
      toast('予約しました');
      dlg.close();
      await renderWeek();
    } catch (e) { toast(e.message); }
  };
  dlg.showModal();
}

function openEditDialog(dateObj, r) {
  const dlg = $('#res-dialog');
  $('#res-title').textContent = `${dialogDateTitle(dateObj)} の予約を変更`;
  fillTimeSelect($('#res-start'), SLOTS.slice(0, -1), r.start_time);
  fillTimeSelect($('#res-end'), SLOTS.slice(1), r.end_time);
  $('#res-note').value = r.note || '';
  $('#res-delete').hidden = false;
  $('#res-save').textContent = '保存';

  $('#res-save').onclick = async () => {
    try {
      await api(`/api/reservations/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          user_id: meId,
          start: $('#res-start').value,
          end: $('#res-end').value,
          note: $('#res-note').value,
        }),
      });
      toast('保存しました');
      dlg.close();
      await renderWeek();
    } catch (e) { toast(e.message); }
  };
  $('#res-delete').onclick = async () => {
    try {
      await api(`/api/reservations/${r.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ user_id: meId }),
      });
      toast('予約を取消しました');
      dlg.close();
      await renderWeek();
    } catch (e) { toast(e.message); }
  };
  dlg.showModal();
}

// ---- 名前変更ダイアログ ----------------------------------------------------
function openNamesDialog() {
  const form = $('#names-form');
  form.innerHTML = '';
  for (const u of users) {
    const row = document.createElement('div');
    row.className = 'name-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = u.color;

    const name = document.createElement('input');
    name.type = 'text';
    name.value = u.name;
    name.maxLength = 20;

    const save = document.createElement('button');
    save.textContent = '保存';
    save.addEventListener('click', async () => {
      try {
        await api(`/api/users/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.value, color: color.value }),
        });
        await loadUsers();
        renderMeSelect();
        await renderWeek();
        toast('保存しました');
      } catch (e) { toast(e.message); }
    });

    row.append(color, name, save);
    form.appendChild(row);
  }
  $('#names-dialog').showModal();
}

// ---- 初期化 ----------------------------------------------------------------
async function loadUsers() {
  users = await api('/api/users');
}

function bindEvents() {
  $('#me-select').addEventListener('change', (e) => {
    meId = Number(e.target.value);
    localStorage.setItem('kurumayoyaku.meId', meId);
    renderWeek();
  });
  $('#prev-week').addEventListener('click', () => { weekOffset--; renderWeek(); });
  $('#next-week').addEventListener('click', () => { weekOffset++; renderWeek(); });
  $('#this-week').addEventListener('click', () => { weekOffset = 0; renderWeek(); });
  $('#edit-names').addEventListener('click', openNamesDialog);
  $('#names-close').addEventListener('click', () => $('#names-dialog').close());
  $('#res-close').addEventListener('click', () => $('#res-dialog').close());
}

(async function init() {
  bindEvents();
  await loadUsers();
  renderMeSelect();
  await renderWeek();
})();
