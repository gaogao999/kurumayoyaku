// ユーザー追加スクリプト:  node seed.js <username> <password> [display_name]
import bcrypt from 'bcryptjs';
import db from './db.js';

const [, , username, password, displayName = ''] = process.argv;

if (!username || !password) {
  console.error('使い方: node seed.js <username> <password> [表示名]');
  process.exit(1);
}

const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (exists) {
  console.error(`ユーザー "${username}" は既に存在します。`);
  process.exit(1);
}

db.prepare(
  'INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)'
).run(username, bcrypt.hashSync(password, 10), displayName, new Date().toISOString());

console.log(`ユーザー "${username}" を作成しました。`);
