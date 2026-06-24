# 🚗 車の予約システム（kurumayoyaku）

3人で共有している車を、**各自がスマホ等から翌週以降の予定を入力できる**ようにする週次予約アプリです。
「毎週みんなの予定を聞いて表を作る」手間をなくすのが目的です。

## 特徴

- 週カレンダー（**月〜土**）で全員の予約がひと目で見える
- 予約の単位は **1日まるごと（曜日単位）**
- 車は1台なので **1日1人まで**（ダブルブッキングを仕組みで防止）
- 空いている日をタップ → 自分の名前で予約
- 自分の予約をタップ → **ひとことメモの編集・取消**（誤タップでの取消も防止）
- データは SQLite（`kurumayoyaku.db`）に保存される本物のDB
- メンバーの名前・色は画面から変更可能

## 仕組み（構成）

| 種類 | 技術 |
|------|------|
| サーバ | Node.js + Express |
| データベース | SQLite（better-sqlite3） |
| 画面 | HTML / CSS / バニラJS（ビルド不要） |

```
kurumayoyaku/
├─ server.js        … APIサーバ
├─ db.js            … DB接続・スキーマ・初期メンバー
├─ public/          … 画面（index.html / app.js / style.css）
└─ kurumayoyaku.db  … データ本体（初回起動時に自動生成・git管理外）
```

## 起動方法

```bash
npm install
npm start
```

起動後、ブラウザで http://localhost:3000 を開きます。
同じネットワーク内のスマホからは `http://<PCのIPアドレス>:3000` でアクセスできます。

ポートを変えたい場合・DBファイルの場所を変えたい場合：

```bash
PORT=8080 DB_PATH=/data/kurumayoyaku.db npm start
```

## 使い方

1. 画面上部「わたしは」で自分の名前を選ぶ（端末に記憶されます）
2. 「次の週 ▶」で予約したい週へ移動
3. 空いている日をタップ → 自分の名前で予約
4. 自分の予約をタップ → メモの編集・取消（編集・取消できるのは予約した本人だけ）
5. 名前や色は「名前を変更」から編集できます

## データベース仕様

**users**（メンバー）

| 列 | 型 | 説明 |
|----|----|----|
| id | INTEGER | 主キー |
| name | TEXT | 表示名 |
| color | TEXT | バッジ色（#RRGGBB） |

**reservations**（予約）

| 列 | 型 | 説明 |
|----|----|----|
| id | INTEGER | 主キー |
| date | TEXT | `YYYY-MM-DD`。**UNIQUE**＝1日1件のみ |
| user_id | INTEGER | 予約者（users.id） |
| note | TEXT | メモ（任意） |
| created_at | TEXT | 作成日時（ISO8601） |

## API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/users` | メンバー一覧 |
| PATCH | `/api/users/:id` | 名前・色の変更 |
| GET | `/api/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD` | 期間内の予約一覧 |
| POST | `/api/reservations` | 予約（`{date, user_id}`）。埋まっていれば409 |
| PATCH | `/api/reservations` | メモ編集（`{date, user_id, note}`）。本人のみ |
| DELETE | `/api/reservations` | 取消（`{date, user_id}`）。本人のみ |
| GET | `/healthz` | ヘルスチェック（ホスティング用） |

## 公開（ホスティング）について

3人がそれぞれ外出先のスマホから使うには、どこかに公開すると便利です。

### A. 家のPCで動かす（一番かんたん）
上記の起動方法のまま、同じWi-Fi内のスマホから `http://<PCのIP>:3000` で使えます。
外からは使えませんが、設定不要です。

### B. Render に無料デプロイ（外からも使える）
このリポジトリには `Dockerfile` と `render.yaml`（永続ディスク付き）を同梱しています。

1. https://render.com にGitHubでログイン
2. **New → Blueprint** を選び、このリポジトリを指定
3. `render.yaml` が読み込まれ、永続ディスク付きで公開されます
4. 発行されたURLを3人で共有すれば、どの端末からも同じ予約表を使えます

> SQLiteのデータは `/data`（永続ディスク）に保存されるため、再デプロイしても消えません。

### C. Docker で動かす
```bash
docker build -t kurumayoyaku .
docker run -p 3000:3000 -v $(pwd)/data:/data kurumayoyaku
```

> 公開する場合、誰でもアクセスできる状態になります。3人だけで使いたい場合は、
> URLを共有相手だけに渡す運用にするか、簡易パスワードの追加をご相談ください。
