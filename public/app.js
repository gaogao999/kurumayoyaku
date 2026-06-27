'use strict';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const OPEN = '08:00';
const CLOSE = '22:00';
const START_MIN = 8 * 60;   // 8:00
const END_MIN = 22 * 60;    // 22:00
const HOUR_PX = 46;         // 1時間あたりの高さ(px)
const TOTAL_PX = ((END_MIN - START_MIN) / 60) * HOUR_PX;

// ---- 時刻スロット（8:00〜22:00 を30分きざみ） -----------------------------
function buildSlots() {
  const slots = [];
  for (let m = START_MIN; m <= END_MIN; m += 30) slots.push(minToTime(m));
  return slots; // ['08:00', ..., '22:00']
}
function minToTime(m) {
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const mi = String(m % 60).padStart(2, '0');
  return `${h}:${mi}`;
}
function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
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

// ---- 週カレンダーの描画（Googleカレンダー風タイムライン） ------------------
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

  const now = new Date();
  const todayStr = ymd(now);
  const root = $('#week-grid');
  root.innerHTML = '';

  // --- 曜日ヘッダー行 ---
  const head = document.createElement('div');
  head.className = 'cal-head';
  head.appendChild(document.createElement('div')); // 時間目盛り用の空白
  for (let i = 0; i < 6; i++) {
    const d = addDays(monday, i);
    const dh = document.createElement('div');
    dh.className = 'dh' + (ymd(d) === todayStr ? ' today' : '') + (i === 5 ? ' sat' : '');
    dh.innerHTML = `<span class="d">${DOW[d.getDay()]}</span><span class="n">${d.getMonth() + 1}/${d.getDate()}</span>`;
    head.appendChild(dh);
  }
  root.appendChild(head);

  // --- 本体（時間目盛り＋6列） ---
  const body = document.createElement('div');
  body.className = 'cal-body';

  // 時間目盛り列
  const gutter = document.createElement('div');
  gutter.className = 'gutter';
  gutter.style.height = TOTAL_PX + 'px';
  for (let m = START_MIN; m <= END_MIN; m += 60) {
    const hr = document.createElement('div');
    hr.className = 'hr';
    hr.style.top = ((m - START_MIN) / 60) * HOUR_PX + 'px';
    hr.textContent = minToTime(m);
    gutter.appendChild(hr);
  }
  body.appendChild(gutter);

  // 各曜日の列
  for (let i = 0; i < 6; i++) {
    const d = addDays(monday, i);
    const dateStr = ymd(d);
    const col = document.createElement('div');
    col.className = 'col' + (dateStr === todayStr ? ' today' : '');
    col.style.height = TOTAL_PX + 'px';

    // 空き部分のタップで「その時間から」予約追加
    col.addEventListener('click', (e) => {
      if (e.target.closest('.ev')) return;       // ブロックのタップは無視
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let m = START_MIN + Math.floor((y / HOUR_PX) * 60 / 30) * 30;
      m = Math.max(START_MIN, Math.min(END_MIN - 30, m));
      openAddDialog(dateStr, d, minToTime(m));
    });

    // 予約ブロック
    for (const r of (byDate.get(dateStr) || [])) {
      const s = timeToMin(r.start_time);
      const en = timeToMin(r.end_time);
      const ev = document.createElement('div');
      ev.className = 'ev' + (r.user_id === meId ? ' mine' : '');
      ev.style.top = ((s - START_MIN) / 60) * HOUR_PX + 'px';
      ev.style.height = Math.max(((en - s) / 60) * HOUR_PX - 2, 16) + 'px';
      ev.style.background = r.user_color;
      ev.innerHTML =
        `<span class="en">${escapeHtml(r.user_name)}</span>` +
        `<span class="et">${r.start_time}〜${r.end_time}</span>` +
        (r.note ? `<span class="eo">${escapeHtml(r.note)}</span>` : '');
      ev.addEventListener('click', (e) => {
        e.stopPropagation();
        if (r.user_id === meId) openEditDialog(d, r);
        else toast(`${r.user_name} さんが予約済みです（${r.start_time}〜${r.end_time}）`);
      });
      col.appendChild(ev);
    }

    // 「今」を示す赤い線（今週・今日・営業時間内のみ）
    if (dateStr === todayStr) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= START_MIN && nowMin <= END_MIN) {
        const line = document.createElement('div');
        line.className = 'nowline';
        line.style.top = ((nowMin - START_MIN) / 60) * HOUR_PX + 'px';
        col.appendChild(line);
      }
    }

    body.appendChild(col);
  }
  root.appendChild(body);
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

function openAddDialog(dateStr, dateObj, startPref) {
  if (!meId) return toast('先に「わたしは」を選んでください');
  const dlg = $('#res-dialog');
  $('#res-title').textContent = `${dialogDateTitle(dateObj)} の予約を追加`;

  const start = startPref && SLOTS.includes(startPref) ? startPref : '09:00';
  // 終了の初期値は開始の1時間後（範囲内に収める）
  let endDefault = minToTime(Math.min(timeToMin(start) + 60, END_MIN));
  fillTimeSelect($('#res-start'), SLOTS.slice(0, -1), start);
  fillTimeSelect($('#res-end'), SLOTS.slice(1), endDefault);
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
