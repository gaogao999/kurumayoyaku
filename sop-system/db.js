import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'sop.db');

// DB ファイルを置くディレクトリを用意（永続ディスク運用にも対応）
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- スキーマ ---------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS sop_files (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    stored_name   TEXT NOT NULL,          -- 実ファイル名（uploads/ 内）
    original_name TEXT NOT NULL,          -- アップロード時の元ファイル名
    mimetype      TEXT NOT NULL,
    size          INTEGER NOT NULL,
    uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sop_category ON sop_files(category_id);
  CREATE INDEX IF NOT EXISTS idx_sop_title    ON sop_files(title);
`);

// --- 初期データ -------------------------------------------------------------
// 初期管理ユーザー（環境変数で上書き可。未設定なら admin / admin123）
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASS || 'admin123';
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)'
  ).run(username, bcrypt.hashSync(password, 10), '管理者', new Date().toISOString());
  console.log(`初期ユーザーを作成しました: ${username} / ${password}（ログイン後に変更してください）`);
}

// 初期カテゴリ
const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
if (catCount === 0) {
  const insert = db.prepare('INSERT INTO categories (name) VALUES (?)');
  ['製造', '品質管理', '安全衛生', '一般'].forEach((n) => insert.run(n));
}

export default db;
