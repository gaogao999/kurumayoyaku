import express from 'express';
import { all, one, run, ensureSchema } from '../lib/db.js';

const app = express();
app.use(express.json());

// どのリクエストでも、最初にスキーマの存在を保証する
app.use(async (req, res, next) => {
  try { await ensureSchema(); next(); } catch (e) { next(e); }
});

// 予約できる時間帯（30分きざみ）
const OPEN = '08:00';
const CLOSE = '22:00';

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isSlotTime = (s) =>
  typeof s === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(s) && s >= OPEN && s <= CLOSE;

const RES_SELECT = `
  SELECT r.id, r.date, r.start_time, r.end_time, r.user_id, r.note,
         u.name AS user_name, u.color AS user_color
  FROM reservations r JOIN users u ON u.id = r.user_id
`;

// --- メンバー ---------------------------------------------------------------
app.get('/api/users', async (req, res, next) => {
  try {
    res.json(await all('SELECT id, name, color FROM users ORDER BY id'));
  } catch (e) { next(e); }
});

app.patch('/api/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await one('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'メンバーが見つかりません' });

    const name = (req.body.name ?? user.name).toString().trim().slice(0, 20);
    const color = (req.body.color ?? user.color).toString();
    if (!name) return res.status(400).json({ error: '名前を入力してください' });

    await run('UPDATE users SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    res.json(await one('SELECT id, name, color FROM users WHERE id = ?', [id]));
  } catch (e) { next(e); }
});

// --- 予約 -------------------------------------------------------------------
function validateReservation({ date, start, end }) {
  if (!isDate(date)) return '日付が正しくありません';
  if (new Date(date + 'T00:00:00Z').getUTCDay() === 0) return '日曜日は予約できません（月〜土のみ）';
  if (!isSlotTime(start) || !isSlotTime(end)) return '時刻は8:00〜22:00の30分きざみで指定してください';
  if (end <= start) return '終了時刻は開始時刻より後にしてください';
  return null;
}

async function findOverlap(date, start, end, excludeId = 0) {
  return one(`
    SELECT r.id, r.start_time, r.end_time, u.name AS user_name
    FROM reservations r JOIN users u ON u.id = r.user_id
    WHERE r.date = ? AND r.id != ? AND r.start_time < ? AND ? < r.end_time
    LIMIT 1
  `, [date, excludeId, end, start]);
}

app.get('/api/reservations', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to)) {
      return res.status(400).json({ error: 'from / to は YYYY-MM-DD 形式で指定してください' });
    }
    res.json(await all(
      `${RES_SELECT} WHERE r.date BETWEEN ? AND ? ORDER BY r.date, r.start_time`,
      [from, to]
    ));
  } catch (e) { next(e); }
});

app.post('/api/reservations', async (req, res, next) => {
  try {
    const { date, start, end, user_id, note } = req.body;
    const err = validateReservation({ date, start, end });
    if (err) return res.status(400).json({ error: err });

    const user = await one('SELECT id FROM users WHERE id = ?', [Number(user_id)]);
    if (!user) return res.status(400).json({ error: 'メンバーが正しくありません' });

    const clash = await findOverlap(date, start, end);
    if (clash) {
      return res.status(409).json({
        error: `その時間は ${clash.user_name} さんが予約済みです（${clash.start_time}〜${clash.end_time}）`,
      });
    }

    const { lastInsertRowid } = await run(
      `INSERT INTO reservations (date, start_time, end_time, user_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [date, start, end, user.id, (note ?? '').toString().slice(0, 100), new Date().toISOString()]
    );
    res.status(201).json(await one(`${RES_SELECT} WHERE r.id = ?`, [lastInsertRowid]));
  } catch (e) { next(e); }
});

app.patch('/api/reservations/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await one('SELECT * FROM reservations WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: '予約が見つかりません' });
    if (row.user_id !== Number(req.body.user_id)) {
      return res.status(403).json({ error: '変更できるのは予約した本人だけです' });
    }

    const start = req.body.start ?? row.start_time;
    const end = req.body.end ?? row.end_time;
    const err = validateReservation({ date: row.date, start, end });
    if (err) return res.status(400).json({ error: err });

    const clash = await findOverlap(row.date, start, end, id);
    if (clash) {
      return res.status(409).json({
        error: `その時間は ${clash.user_name} さんが予約済みです（${clash.start_time}〜${clash.end_time}）`,
      });
    }

    const note = (req.body.note ?? row.note).toString().slice(0, 100);
    await run('UPDATE reservations SET start_time = ?, end_time = ?, note = ? WHERE id = ?',
      [start, end, note, id]);
    res.json(await one(`${RES_SELECT} WHERE r.id = ?`, [id]));
  } catch (e) { next(e); }
});

app.delete('/api/reservations/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await one('SELECT * FROM reservations WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: '予約が見つかりません' });
    if (row.user_id !== Number(req.body.user_id)) {
      return res.status(403).json({ error: '取消できるのは予約した本人だけです' });
    }
    await run('DELETE FROM reservations WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// エラーハンドラ
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'サーバエラーが発生しました' });
});

export default app;
