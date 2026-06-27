import { createClient } from '@libsql/client';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 本番（Vercel）では Turso の環境変数を使う。
// ローカル開発では Turso が無くても file: のローカルSQLiteで動く。
const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.TURSO_DATABASE_URL || `file:${join(__dirname, '..', 'kurumayoyaku.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient(authToken ? { url, authToken } : { url });

// --- クエリ補助（libSQLは非同期） -----------------------------------------
export async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}
export async function one(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0] ?? null;
}
export async function run(sql, args = []) {
  const r = await db.execute({ sql, args });
  return {
    lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
    rowsAffected: r.rowsAffected,
  };
}

// --- スキーマ初期化（最初の1回だけ・冪等） ---------------------------------
let ready;
export function ensureSchema() {
  if (!ready) ready = init();
  return ready;
}

async function init() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
       id    INTEGER PRIMARY KEY AUTOINCREMENT,
       name  TEXT NOT NULL,
       color TEXT NOT NULL DEFAULT '#4f86c6'
     )`,
    `CREATE TABLE IF NOT EXISTS reservations (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       date       TEXT NOT NULL,
       start_time TEXT NOT NULL,
       end_time   TEXT NOT NULL,
       user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       note       TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date)`,
  ], 'write');

  const row = await one('SELECT COUNT(*) AS c FROM users');
  if (Number(row.c) === 0) {
    await db.batch([
      { sql: 'INSERT INTO users (name, color) VALUES (?, ?)', args: ['メンバー1', '#e57373'] },
      { sql: 'INSERT INTO users (name, color) VALUES (?, ?)', args: ['メンバー2', '#64b5f6'] },
      { sql: 'INSERT INTO users (name, color) VALUES (?, ?)', args: ['メンバー3', '#81c784'] },
    ], 'write');
  }
}
