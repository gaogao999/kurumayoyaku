# 📋 SOP File Management System (sop-system)

A web app for managing **SOP (Standard Operating Procedure)** documents in **PDF / Excel / Word** format. Sign-in protected, with upload, category management, search and download.

> This directory is a standalone app, independent of the car-reservation system that also lives in this repository.

## Features

- **Sign in** (`POST /checklogin` with `username` / `password` sent as a form; session cookie is `connect.sid`)
- **File upload** (PDF / Excel `.xls`/`.xlsx` / Word `.doc`/`.docx`, up to 50 MB)
- **Category management** (add / delete categories, filter by category)
- **Search** (partial match on title, description and original file name)
- **File list, download and delete**

## Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express |
| Session | express-session + SQLite store (cookie name `connect.sid`, survives restarts) |
| Auth | bcryptjs password hashing |
| Upload | multer (validates extension + MIME type) |
| Database | SQLite (better-sqlite3) |
| UI | HTML / CSS / vanilla JS (no build step) |

```
sop-system/
├─ server.js          … API server (auth, upload, search, download)
├─ db.js              … DB connection, schema, initial user/categories
├─ seed.js            … add-user script
├─ public/            … UI (login.html / index.html / app.js / style.css)
├─ uploads/           … uploaded files (git-ignored)
└─ data/sop.db        … data file (auto-created on first run, git-ignored)
```

## Getting started

```bash
cd sop-system
npm install
npm start
```

Then open http://localhost:3000 (you are redirected to the sign-in page if not logged in).

### Initial login

An admin user is created automatically on first run (defaults to **`admin` / `admin123`**).
Always override this in production via environment variables.

```bash
ADMIN_USER=yourname ADMIN_PASS=strongpassword SESSION_SECRET=long-random-string npm start
```

### Adding users

```bash
node seed.js <username> <password> "Display Name"
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Listening port |
| `DB_PATH` | `data/sop.db` | SQLite file path |
| `UPLOAD_DIR` | `uploads/` | Where uploaded files are stored |
| `SESSION_SECRET` | (dev default) | Session signing key. Always set in production |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / `admin123` | Admin user created on first run |
| `NODE_ENV` / `TRUST_PROXY` | - | `production` + `TRUST_PROXY=1` enables Secure cookies & proxy trust |

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/checklogin` | Sign in (`username` / `password` as a form) |
| POST | `/logout` | Sign out |
| GET | `/api/me` | Current user |
| GET | `/api/categories` | Category list (with file counts) |
| POST | `/api/categories` | Add category (`{name}`) |
| DELETE | `/api/categories/:id` | Delete category (its files become uncategorized) |
| GET | `/api/files?q=&category=` | List / search files |
| POST | `/api/files` | Upload (multipart: `file`, `title`, `description`, `category_id`) |
| GET | `/api/files/:id/download` | Download |
| DELETE | `/api/files/:id` | Delete |
| GET | `/healthz` | Health check |

`/api/*` returns `401` when not signed in. `/` redirects to the sign-in page when not signed in.

## Deployment

The app is containerized (`Dockerfile`) and the DB + uploads live on a persistent
disk mounted at `/data`, so data and logins survive restarts.

### Render (free tier, public URL)

**Option A — Dashboard (recommended):**
1. Sign in to https://render.com with GitHub.
2. **New → Web Service**, select this repository.
3. Set **Root Directory** to `sop-system` and **Runtime** to `Docker`.
4. Add a **Disk**: mount path `/data`, size 1 GB.
5. Add environment variables: `ADMIN_USER`, `ADMIN_PASS`, and a long random
   `SESSION_SECRET` (Render can generate one). `DB_PATH` / `UPLOAD_DIR` are
   already baked into the Dockerfile.
6. Deploy — Render gives you a public `https://…onrender.com` URL.

**Option B — Blueprint:** copy `sop-system/render.yaml` to the repository root,
then **New → Blueprint** and select this repo. It provisions the service, disk
and env vars automatically (you'll be asked for `ADMIN_USER` / `ADMIN_PASS`).

### Docker (anywhere)

```bash
cd sop-system
docker build -t sop-system .
docker run -p 3000:3000 -v $(pwd)/data:/data \
  -e SESSION_SECRET=long-random-string -e ADMIN_USER=you -e ADMIN_PASS=secret \
  sop-system
```

> When public, anyone with the URL reaches the sign-in page. Always set a strong
> `ADMIN_PASS` and `SESSION_SECRET`.

## Security notes

- Passwords are stored hashed with bcrypt (never in plain text).
- Uploads are restricted to PDF / Excel / Word by checking both the file extension and the MIME type.
- In production, always set `SESSION_SECRET`, and run behind HTTPS (a reverse proxy) with `TRUST_PROXY=1`.
