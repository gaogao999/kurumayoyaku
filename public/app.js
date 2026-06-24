'use strict';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

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
// その日を含む週の月曜日を返す
function mondayOf(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay();            // 0=日,1=月,...
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(r, diff);
}

// ---- 状態 ------------------------------------------------------------------
let users = [];
let weekOffset = 0;                  // 0=今週, +1=来週 ...
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
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---- 描画 ------------------------------------------------------------------
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

async function renderWeek() {
  const monday = addDays(mondayOf(new Date()), weekOffset * 7);
  const saturday = addDays(monday, 5);
  $('#week-label').textContent =
    `${monday.getMonth() + 1}/${monday.getDate()} 〜 ${saturday.getMonth() + 1}/${saturday.getDate()}`;

  const reservations = await api(
    `/api/reservations?from=${ymd(monday)}&to=${ymd(saturday)}`
  );
  const byDate = new Map(reservations.map((r) => [r.date, r]));

  const todayStr = ymd(new Date());
  const grid = $('#week-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 6; i++) {      // 月(0)〜土(5)
    const d = addDays(monday, i);
    const dateStr = ymd(d);
    const r = byDate.get(dateStr);

    const cell = document.createElement('div');
    cell.className = 'day';
    if (i === 5) cell.classList.add('sat');
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr < todayStr) cell.classList.add('past');

    const dow = document.createElement('div');
    dow.className = 'dow';
    dow.textContent = DOW[d.getDay()];

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = `${d.getMonth() + 1}/${d.getDate()}`;

    const status = document.createElement('div');
    status.className = 'status';
    if (r) {
      const badge = document.createElement('span');
      badge.className = 'badge' + (r.user_id === meId ? ' mine' : '');
      badge.style.background = r.user_color;
      badge.textContent = r.user_name;
      status.appendChild(badge);
    } else {
      status.classList.add('empty');
      status.textContent = '空き';
    }

    cell.append(dow, date, status);
    cell.addEventListener('click', () => onDayClick(dateStr, r));
    grid.appendChild(cell);
  }
}

// ---- 操作 ------------------------------------------------------------------
async function onDayClick(dateStr, reservation) {
  if (!meId) return toast('先に「わたしは」を選んでください');
  try {
    if (!reservation) {
      await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ date: dateStr, user_id: meId }),
      });
      toast('予約しました');
    } else if (reservation.user_id === meId) {
      await api('/api/reservations', {
        method: 'DELETE',
        body: JSON.stringify({ date: dateStr, user_id: meId }),
      });
      toast('予約を取消しました');
    } else {
      return toast(`その日は ${reservation.user_name} さんが予約済みです`);
    }
    await renderWeek();
  } catch (e) {
    toast(e.message);
    await renderWeek();
  }
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
      } catch (e) {
        toast(e.message);
      }
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
}

(async function init() {
  bindEvents();
  await loadUsers();
  renderMeSelect();
  await renderWeek();
})();
