import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 予約できる時間帯（30分きざみ）
const OPEN = '08:00';
const CLOSE = '22:00';

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
// 8:00〜22:00 の 00分/30分のみ許可
const isSlotTime = (s) =>
  typeof s === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(s) && s >= OPEN && s <= CLOSE;

const reservationRow = db.prepare(`
  SELECT r.id, r.date, r.start_time, r.end_time, r.user_id, r.note,
         u.name AS user_name, u.color AS user_color
  FROM reservations r JOIN users u ON u.id = r.user_id
  WHERE r.id = ?
`);

// --- メンバー ---------------------------------------------------------------
app.get('/api/users', (req, res) => {
  res.json(db.prepare('SELECT id, name, color FROM users ORDER BY id').all());
});

app.patch('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'メンバーが見つかりません' });

  const name = (req.body.name ?? user.name).toString().trim().slice(0, 20);
  const color = (req.body.color ?? user.color).toString();
  if (!name) return res.status(400).json({ error: '名前を入力してください' });

  db.prepare('UPDATE users SET name = ?, color = ? WHERE id = ?').run(name, color, id);
  res.json(db.prepare('SELECT id, name, color FROM users WHERE id = ?').get(id));
});

// --- 予約 -------------------------------------------------------------------
// 入力チェック（共通）。問題なければ null、あればエラーメッセージを返す。
function validateReservation({ date, start, end }) {
  if (!isDate(date)) return '日付が正しくありません';
  // 日曜日は予約不可（月〜土のみ）
  if (new Date(date + 'T00:00:00Z').getUTCDay() === 0) return '日曜日は予約できません（月〜土のみ）';
  if (!isSlotTime(start) || !isSlotTime(end)) return '時刻は8:00〜22:00の30分きざみで指定してください';
  if (end <= start) return '終了時刻は開始時刻より後にしてください';
  return null;
}

// 時間が重なる予約があるか（excludeId は編集時に自分自身を除外）
function findOverlap(date, start, end, excludeId = 0) {
  return db.prepare(`
    SELECT r.id, r.start_time, r.end_time, u.name AS user_name
    FROM reservations r JOIN users u ON u.id = r.user_id
    WHERE r.date = ? AND r.id != ? AND r.start_time < ? AND ? < r.end_time
    LIMIT 1
  `).get(date, excludeId, end, start);
}

// 期間内の予約一覧
app.get('/api/reservations', (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) {
    return res.status(400).json({ error: 'from / to は YYYY-MM-DD 形式で指定してください' });
  }
  res.json(db.prepare(`
    SELECT r.id, r.date, r.start_time, r.end_time, r.user_id, r.note,
           u.name AS user_name, u.color AS user_color
    FROM reservations r JOIN users u ON u.id = r.user_id
    WHERE r.date BETWEEN ? AND ?
    ORDER BY r.date, r.start_time
  `).all(from, to));
});

// 予約する
app.post('/api/reservations', (req, res) => {
  const { date, start, end, user_id, note } = req.body;
  const err = validateReservation({ date, start, end });
  if (err) return res.status(400).json({ error: err });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(user_id));
  if (!user) return res.status(400).json({ error: 'メンバーが正しくありません' });

  const clash = findOverlap(date, start, end);
  if (clash) {
    return res.status(409).json({
      error: `その時間は ${clash.user_name} さんが予約済みです（${clash.start_time}〜${clash.end_time}）`,
    });
  }

  const info = db.prepare(`
    INSERT INTO reservations (date, start_time, end_time, user_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(date, start, end, user.id, (note ?? '').toString().slice(0, 100), new Date().toISOString());

  res.status(201).json(reservationRow.get(info.lastInsertRowid));
});

// 予約の変更（時間・メモ）。本人のみ。
app.patch('/api/reservations/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '予約が見つかりません' });
  if (row.user_id !== Number(req.body.user_id)) {
    return res.status(403).json({ error: '変更できるのは予約した本人だけです' });
  }

  const start = req.body.start ?? row.start_time;
  const end = req.body.end ?? row.end_time;
  const err = validateReservation({ date: row.date, start, end });
  if (err) return res.status(400).json({ error: err });

  const clash = findOverlap(row.date, start, end, id);
  if (clash) {
    return res.status(409).json({
      error: `その時間は ${clash.user_name} さんが予約済みです（${clash.start_time}〜${clash.end_time}）`,
    });
  }

  const note = (req.body.note ?? row.note).toString().slice(0, 100);
  db.prepare('UPDATE reservations SET start_time = ?, end_time = ?, note = ? WHERE id = ?')
    .run(start, end, note, id);
  res.json(reservationRow.get(id));
});

// 予約取消。本人のみ。
app.delete('/api/reservations/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '予約が見つかりません' });
  if (row.user_id !== Number(req.body.user_id)) {
    return res.status(403).json({ error: '取消できるのは予約した本人だけです' });
  }
  db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ヘルスチェック（ホスティング用）
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`車予約システム: http://localhost:${PORT}`);
});
