# 📋 SOPファイル管理システム（sop-system）

SOP（標準作業手順書）の **PDF / Excel / Word** ファイルを、ログイン制でアップロード・カテゴリ別管理・検索・ダウンロードできる Web アプリです。

> このディレクトリは同リポジトリ内の「車予約システム」とは独立した別アプリです。

## 機能

- **ログイン**（`POST /checklogin` に `username` / `password` を form 送信、セッションは `connect.sid`）
- **ファイルのアップロード**（PDF / Excel(.xls/.xlsx) / Word(.doc/.docx)、最大 50MB）
- **カテゴリ別管理**（カテゴリの追加・削除、カテゴリで絞り込み）
- **検索**（タイトル・説明・元ファイル名の部分一致）
- **ファイル一覧・ダウンロード・削除**

## 構成

| 種類 | 技術 |
|------|------|
| サーバ | Node.js + Express |
| セッション | express-session（クッキー名 `connect.sid`） |
| 認証 | bcryptjs によるパスワードハッシュ |
| アップロード | multer（拡張子＋MIMEタイプを検証） |
| データベース | SQLite（better-sqlite3） |
| 画面 | HTML / CSS / バニラ JS（ビルド不要） |

```
sop-system/
├─ server.js          … APIサーバ（認証・アップロード・検索・ダウンロード）
├─ db.js              … DB接続・スキーマ・初期ユーザー/カテゴリ
├─ seed.js            … ユーザー追加スクリプト
├─ public/            … 画面（login.html / index.html / app.js / style.css）
├─ uploads/           … アップロードされた実ファイル（git管理外）
└─ data/sop.db        … データ本体（初回起動時に自動生成・git管理外）
```

## 起動方法

```bash
cd sop-system
npm install
npm start
```

起動後、ブラウザで http://localhost:3000 を開きます（未ログインならログイン画面へ）。

### 初期ログイン

初回起動時に管理ユーザーが自動作成されます（未設定なら **`admin` / `admin123`**）。
本番では必ず環境変数で変更してください。

```bash
ADMIN_USER=yourname ADMIN_PASS=strongpassword SESSION_SECRET=長いランダム文字列 npm start
```

### ユーザーの追加

```bash
node seed.js <username> <password> "表示名"
```

## 環境変数

| 変数 | 既定値 | 説明 |
|------|--------|------|
| `PORT` | `3000` | 待ち受けポート |
| `DB_PATH` | `data/sop.db` | SQLite ファイルのパス |
| `UPLOAD_DIR` | `uploads/` | アップロードファイルの保存先 |
| `SESSION_SECRET` | （開発用既定値） | セッション署名鍵。本番では必ず設定 |
| `ADMIN_USER` / `ADMIN_PASS` | `admin` / `admin123` | 初回作成する管理ユーザー |
| `NODE_ENV` / `TRUST_PROXY` | - | `production` かつ `TRUST_PROXY=1` で Secure クッキー＆プロキシ信頼 |

## API

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/checklogin` | ログイン（`username` / `password` を form 送信） |
| POST | `/logout` | ログアウト |
| GET | `/api/me` | ログイン中ユーザー |
| GET | `/api/categories` | カテゴリ一覧（ファイル数つき） |
| POST | `/api/categories` | カテゴリ追加（`{name}`） |
| DELETE | `/api/categories/:id` | カテゴリ削除（中のファイルは未分類になる） |
| GET | `/api/files?q=&category=` | ファイル一覧・検索 |
| POST | `/api/files` | アップロード（multipart: `file`, `title`, `description`, `category_id`） |
| GET | `/api/files/:id/download` | ダウンロード |
| DELETE | `/api/files/:id` | 削除 |
| GET | `/healthz` | ヘルスチェック |

`/api/*` は未ログイン時 `401` を返します。`/` は未ログイン時にログイン画面へリダイレクトします。

## セキュリティに関する注意

- パスワードは bcrypt でハッシュ化して保存します（平文保存はしません）。
- アップロードは拡張子と MIME タイプの両方で PDF / Excel / Word に制限しています。
- 本番公開時は `SESSION_SECRET` を必ず設定し、HTTPS（リバースプロキシ）配下で `TRUST_PROXY=1` を指定してください。
