import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// 'YYYY-MM-DD' 形式かどうかを判定
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// --- メンバー ---------------------------------------------------------------
app.get('/api/users', (req, res) => {
  res.json(db.prepare('SELECT id, name, color FROM users ORDER BY id').all());
});

// 名前・色の変更
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
// 期間内の予約一覧（メンバー名つき）
app.get('/api/reservations', (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) {
    return res.status(400).json({ error: 'from / to は YYYY-MM-DD 形式で指定してください' });
  }
  const rows = db.prepare(`
    SELECT r.id, r.date, r.user_id, r.note, u.name AS user_name, u.color AS user_color
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.date BETWEEN ? AND ?
    ORDER BY r.date
  `).all(from, to);
  res.json(rows);
});

// 予約する（1日1件まで。既に埋まっていれば 409）
app.post('/api/reservations', (req, res) => {
  const { date, user_id, note } = req.body;
  if (!isDate(date)) return res.status(400).json({ error: '日付が正しくありません' });

  // 日曜日（getUTCDay()===0）は予約不可。月〜土のみ。
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  if (day === 0) return res.status(400).json({ error: '日曜日は予約できません（月〜土のみ）' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(user_id));
  if (!user) return res.status(400).json({ error: 'メンバーが正しくありません' });

  const existing = db.prepare('SELECT id FROM reservations WHERE date = ?').get(date);
  if (existing) return res.status(409).json({ error: 'その日はすでに予約済みです' });

  db.prepare(
    'INSERT INTO reservations (date, user_id, note, created_at) VALUES (?, ?, ?, ?)'
  ).run(date, user.id, (note ?? '').toString().slice(0, 100), new Date().toISOString());

  res.status(201).json(db.prepare(`
    SELECT r.id, r.date, r.user_id, r.note, u.name AS user_name, u.color AS user_color
    FROM reservations r JOIN users u ON u.id = r.user_id WHERE r.date = ?
  `).get(date));
});

// 予約取消（取消できるのは予約した本人のみ）
app.delete('/api/reservations', (req, res) => {
  const { date, user_id } = req.body;
  if (!isDate(date)) return res.status(400).json({ error: '日付が正しくありません' });

  const row = db.prepare('SELECT * FROM reservations WHERE date = ?').get(date);
  if (!row) return res.status(404).json({ error: 'その日の予約はありません' });
  if (row.user_id !== Number(user_id)) {
    return res.status(403).json({ error: '取消できるのは予約した本人だけです' });
  }
  db.prepare('DELETE FROM reservations WHERE date = ?').run(date);
  res.json({ ok: true });
});

// 予約メモの編集（編集できるのは予約した本人のみ）
app.patch('/api/reservations', (req, res) => {
  const { date, user_id, note } = req.body;
  if (!isDate(date)) return res.status(400).json({ error: '日付が正しくありません' });

  const row = db.prepare('SELECT * FROM reservations WHERE date = ?').get(date);
  if (!row) return res.status(404).json({ error: 'その日の予約はありません' });
  if (row.user_id !== Number(user_id)) {
    return res.status(403).json({ error: 'メモを編集できるのは予約した本人だけです' });
  }
  db.prepare('UPDATE reservations SET note = ? WHERE date = ?')
    .run((note ?? '').toString().slice(0, 100), date);

  res.json(db.prepare(`
    SELECT r.id, r.date, r.user_id, r.note, u.name AS user_name, u.color AS user_color
    FROM reservations r JOIN users u ON u.id = r.user_id WHERE r.date = ?
  `).get(date));
});

// ヘルスチェック（ホスティング用）
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`車予約システム: http://localhost:${PORT}`);
});
