import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, 'kurumayoyaku.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- スキーマ ---------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#4f86c6'
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,                  -- 'YYYY-MM-DD'
    start_time TEXT NOT NULL,                  -- 'HH:MM'（30分きざみ）
    end_time   TEXT NOT NULL,                  -- 'HH:MM'（開始より後）
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
`);

// --- 旧スキーマ（1日まるごと方式）からの移行 -------------------------------
// 以前の reservations には start_time/end_time が無い。残っていれば作り直す。
const cols = db.prepare(`PRAGMA table_info(reservations)`).all().map((c) => c.name);
if (!cols.includes('start_time')) {
  console.log('旧スキーマを検出したため reservations を作り直します（時間帯対応）');
  db.exec(`
    DROP TABLE reservations;
    CREATE TABLE reservations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
  `);
}

// --- 初期メンバー（3人） ----------------------------------------------------
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const insert = db.prepare('INSERT INTO users (name, color) VALUES (?, ?)');
  insert.run('メンバー1', '#e57373');
  insert.run('メンバー2', '#64b5f6');
  insert.run('メンバー3', '#81c784');
}

export default db;
