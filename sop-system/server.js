import express from 'express';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { mkdirSync, existsSync, unlinkSync, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Session (cookie name: connect.sid) ------------------------------------
// Sessions are stored in SQLite so logins survive restarts (e.g. free-tier sleep)
const SqliteStore = SqliteStoreFactory(session);
app.use(
  session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'sop-system-dev-secret-change-me',
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 1000 * 60 * 60 }, // hourly cleanup
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === '1',
    },
  })
);

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// --- Upload config (PDF / Excel / Word only) -------------------------------
const ALLOWED = {
  'application/pdf': ['.pdf'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};
const ALLOWED_EXT = new Set(['.pdf', '.xls', '.xlsx', '.doc', '.docx']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const okMime = Object.prototype.hasOwnProperty.call(ALLOWED, file.mimetype);
    if (ALLOWED_EXT.has(ext) && (okMime || file.mimetype === 'application/octet-stream')) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, Excel or Word files can be uploaded'));
  },
});

// --- Auth middleware -------------------------------------------------------
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  // API -> 401, pages -> sign-in
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign in required' });
  res.redirect('/login.html');
};

// --- Auth ------------------------------------------------------------------
// Sign in: POST /checklogin (username, password sent as a form)
app.post('/checklogin', (req, res) => {
  const { username, password } = req.body;
  const wantsJson = (req.get('accept') || '').includes('application/json');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get((username || '').toString().trim());

  if (!user || !bcrypt.compareSync((password || '').toString(), user.password_hash)) {
    if (wantsJson) return res.status(401).json({ error: 'Incorrect username or password' });
    return res.redirect('/login.html?error=1');
  }

  req.session.user = { id: user.id, username: user.username, display_name: user.display_name };
  if (wantsJson) return res.json({ ok: true, user: req.session.user });
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    if ((req.get('accept') || '').includes('application/json')) return res.json({ ok: true });
    res.redirect('/login.html');
  });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.session.user }));

// --- Static files ----------------------------------------------------------
// The sign-in page and static assets are served without auth
app.get('/login.html', (req, res) => res.sendFile(join(__dirname, 'public', 'login.html')));
app.use('/assets', express.static(join(__dirname, 'public')));

// The home page requires auth (redirects to sign-in if not logged in)
app.get('/', requireAuth, (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

// --- Category API ----------------------------------------------------------
app.get('/api/categories', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, COUNT(f.id) AS file_count
       FROM categories c
       LEFT JOIN sop_files f ON f.category_id = c.id
       GROUP BY c.id ORDER BY c.name`
    )
    .all();
  res.json(rows);
});

app.post('/api/categories', requireAuth, (req, res) => {
  const name = (req.body.name || '').toString().trim().slice(0, 50);
  if (!name) return res.status(400).json({ error: 'Please enter a category name' });
  const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (exists) return res.status(409).json({ error: 'A category with that name already exists' });
  const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.status(201).json({ id: info.lastInsertRowid, name, file_count: 0 });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  // Linked files become uncategorized (category_id = NULL) via ON DELETE SET NULL
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- File API --------------------------------------------------------------
const fileSelect = `
  SELECT f.id, f.title, f.description, f.category_id, c.name AS category_name,
         f.original_name, f.mimetype, f.size, f.uploaded_at,
         u.username AS uploaded_by_name
  FROM sop_files f
  LEFT JOIN categories c ON c.id = f.category_id
  LEFT JOIN users u ON u.id = f.uploaded_by
`;

// List + search (q: title/description/original name, category: category id)
app.get('/api/files', requireAuth, (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const category = req.query.category;
  const where = [];
  const params = [];

  if (q) {
    where.push('(f.title LIKE ? OR f.description LIKE ? OR f.original_name LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category === 'none') {
    where.push('f.category_id IS NULL');
  } else if (category !== undefined && category !== '' && category !== 'all') {
    where.push('f.category_id = ?');
    params.push(Number(category));
  }

  const sql = `${fileSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY f.uploaded_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Upload
app.post('/api/files', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Please choose a file' });

    const title = (req.body.title || req.file.originalname).toString().trim().slice(0, 200);
    const description = (req.body.description || '').toString().trim().slice(0, 1000);
    let categoryId = req.body.category_id ? Number(req.body.category_id) : null;
    if (categoryId && !db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) {
      categoryId = null;
    }

    const info = db
      .prepare(
        `INSERT INTO sop_files
          (title, description, category_id, stored_name, original_name, mimetype, size, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        description,
        categoryId,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.session.user.id,
        new Date().toISOString()
      );

    res.status(201).json(db.prepare(`${fileSelect} WHERE f.id = ?`).get(info.lastInsertRowid));
  });
});

// Download
app.get('/api/files/:id/download', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM sop_files WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'File not found' });
  const path = join(UPLOAD_DIR, row.stored_name);
  if (!existsSync(path)) return res.status(410).json({ error: 'The stored file no longer exists' });

  res.setHeader('Content-Type', row.mimetype || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`
  );
  createReadStream(path).pipe(res);
});

// Delete
app.delete('/api/files/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM sop_files WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'File not found' });
  db.prepare('DELETE FROM sop_files WHERE id = ?').run(row.id);
  const path = join(UPLOAD_DIR, row.stored_name);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* The DB row is already gone even if file removal fails; ignore */
  }
  res.json({ ok: true });
});

// Health check
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`SOP File Management System: http://localhost:${PORT}`);
});
