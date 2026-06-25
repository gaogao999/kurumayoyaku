// Add-user script:  node seed.js <username> <password> [display_name]
import bcrypt from 'bcryptjs';
import db from './db.js';

const [, , username, password, displayName = ''] = process.argv;

if (!username || !password) {
  console.error('Usage: node seed.js <username> <password> [display_name]');
  process.exit(1);
}

const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (exists) {
  console.error(`User "${username}" already exists.`);
  process.exit(1);
}

db.prepare(
  'INSERT INTO users (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)'
).run(username, bcrypt.hashSync(password, 10), displayName, new Date().toISOString());

console.log(`Created user "${username}".`);
