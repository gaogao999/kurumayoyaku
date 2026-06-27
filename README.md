# 🚗 車の予約システム（kurumayoyaku）

3人で共有している車を、**各自がスマホ等から翌週以降の予定を入力できる**ようにする週次予約アプリです。
「毎週みんなの予定を聞いて表を作る」手間をなくすのが目的です。

## 特徴

- 週カレンダー（**月〜土**）で全員の予約がひと目で見える
- 予約の単位は **時間帯（30分きざみ・8:00〜22:00）**
- 車は1台なので、**時間が重なる予約はブロック**（同じ日でも時間が違えば複数人OK）
- 各日の「＋ 追加」から、開始・終了の時刻を選んで予約
- 自分の予約をタップ → **時間の変更・メモ編集・取消**（編集・取消は本人のみ）
- データは SQLite（`kurumayoyaku.db`）に保存される本物のDB
- メンバーの名前・色は画面から変更可能

## 仕組み（構成）

| 種類 | 技術 |
|------|------|
| サーバ | Node.js + Express（Vercel のサーバーレス関数として動作） |
| データベース | Turso（libSQL・SQLite互換）。ローカルでは file: のSQLite |
| 画面 | HTML / CSS / バニラJS（ビルド不要） |

```
kurumayoyaku/
├─ api/index.js     … APIサーバ本体（Vercelの関数／ローカルでも共用）
├─ lib/db.js        … DB接続（Turso/ローカル）・スキーマ・初期メンバー
├─ server.js        … ローカル開発用の起動スクリプト
├─ public/          … 画面（index.html / app.js / style.css）
└─ vercel.json      … Vercel のルーティング設定
```

## ローカルで動かす

```bash
npm install
npm start
```

起動後、ブラウザで http://localhost:3000 を開きます。
Turso の環境変数が無ければ、自動でローカルのファイルDB（`kurumayoyaku.db`）で動きます。

本番（Vercel）と同じ Turso を使いたい場合は、環境変数を設定してから起動します：

```bash
TURSO_DATABASE_URL=libsql://xxxx.turso.io TURSO_AUTH_TOKEN=xxxxx npm start
```

## 使い方

1. 画面上部「わたしは」で自分の名前を選ぶ（端末に記憶されます）
2. 「次の週 ▶」で予約したい週へ移動
3. 予約したい日の「＋ 追加」→ 開始・終了の時刻（30分きざみ）とメモを入れて予約
4. 自分の予約をタップ → 時間の変更・メモ編集・取消（変更・取消できるのは本人だけ）
5. 名前や色は「名前を変更」から編集できます

> 予約できる時間帯（8:00〜22:00）は `server.js` の `OPEN` / `CLOSE` と
> `public/app.js` の `OPEN` / `CLOSE` を合わせて変更できます。

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
| date | TEXT | `YYYY-MM-DD` |
| start_time | TEXT | 開始時刻 `HH:MM`（30分きざみ） |
| end_time | TEXT | 終了時刻 `HH:MM`（開始より後） |
| user_id | INTEGER | 予約者（users.id） |
| note | TEXT | メモ（任意） |
| created_at | TEXT | 作成日時（ISO8601） |

> 車は1台なので、同じ `date` 内で時間帯が重なる予約はサーバ側で拒否されます
> （重なり判定：`既存.start < 新.end かつ 新.start < 既存.end`）。

## API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/users` | メンバー一覧 |
| PATCH | `/api/users/:id` | 名前・色の変更 |
| GET | `/api/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD` | 期間内の予約一覧 |
| POST | `/api/reservations` | 予約（`{date, start, end, user_id, note}`）。時間が重なれば409 |
| PATCH | `/api/reservations/:id` | 時間・メモ変更（`{user_id, start, end, note}`）。本人のみ |
| DELETE | `/api/reservations/:id` | 取消（`{user_id}`）。本人のみ |
| GET | `/healthz` | ヘルスチェック（ホスティング用） |

## 公開（ホスティング）について

**Vercel ＋ Turso で完全無料で公開できます**（クレカ登録も不要）。
クリックだけで進められる詳しい手順は **[DEPLOY.md](./DEPLOY.md)** を参照してください。

おおまかな流れ：

1. **Turso**（https://turso.tech）でデータベースを作り、`Database URL` と `トークン` を控える
2. **Vercel**（https://vercel.com）にこのリポジトリを Import
3. 環境変数 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` を登録して Deploy
4. 発行されたURLを3人で共有すれば、どの端末からも同じ予約表を使えます

> - データは Turso に保存されるため、再デプロイやスリープ復帰でも**消えません**。
> - サーバーレスのため、しばらく使わないと一時停止し、次のアクセスで起動します
>   （初回が数秒遅いことがあります）。
> - 公開URLを知っていれば誰でもアクセスできます。3人だけに共有する運用が基本です。
>   「簡易パスワード」を付けたい場合は対応できます。
