# Vercel ＋ Turso で公開する手順（完全無料）

3人がどこからでも使えて、予約データも消えない公開方法です。**費用は$0**（クレジットカード登録も不要）。

仕組み：
- **Vercel**… アプリ（画面とAPI）を無料でホスティング
- **Turso**… 予約データを保存するクラウドDB（SQLite互換・無料枠）

所要時間：約15分。必要なもの：GitHubアカウント、Vercelアカウント、Tursoアカウント（どれも無料）。

---

## ステップ1. Turso でデータベースを作る

### 方法A：ブラウザだけで（おすすめ）

1. https://turso.tech を開き、**GitHubでサインアップ**
2. ダッシュボードで **「Create Database」**（データベース作成）
   - 名前：`kurumayoyaku`（任意）／リージョン：日本に近い場所（例：`Tokyo`）
3. 作成したDBを開き、次の2つを控える：
   - **Database URL**（`libsql://xxxx.turso.io` のような文字列）
   - **トークン**：「Create Token」/「Generate Token」で作成して表示される長い文字列
4. この2つは次のステップでVercelに登録します（画面を開いたままにしておくと楽）

### 方法B：コマンドで（CLIに慣れている人向け）

```bash
curl -sSfL https://get.tur.so/install.sh | bash   # Turso CLI を入れる
turso auth signup                                  # サインアップ
turso db create kurumayoyaku                       # DB作成
turso db show kurumayoyaku --url                   # → Database URL
turso db tokens create kurumayoyaku                # → トークン
```

---

## ステップ2. Vercel にアプリを公開する

1. https://vercel.com を開き、**GitHubでサインアップ／ログイン**
2. **「Add New…」→「Project」** を選ぶ
3. リポジトリ一覧から **`gaogao999/kurumayoyaku`** を **Import**
   - 出てこない場合は「Adjust GitHub App Permissions」で対象リポジトリを許可
4. **Branch（ブランチ）** は `claude/hopeful-faraday-62k8iq` を選ぶ
   - ※ `main` に取り込み済みなら `main`
5. **「Environment Variables（環境変数）」** に、ステップ1で控えた値を2つ登録：

   | Name | Value |
   |------|-------|
   | `TURSO_DATABASE_URL` | `libsql://xxxx.turso.io`（控えたURL） |
   | `TURSO_AUTH_TOKEN` | 控えたトークン |

6. **「Deploy」** を押す
7. 1〜2分でビルドが終わり、URL（例：`https://kurumayoyaku.vercel.app`）が発行されます
8. そのURLを開いて画面が出ればOK（`/healthz` で `{"ok":true}` が返れば正常）

---

## ステップ3. 3人で使い始める

1. 発行された URL を3人に共有
2. 各自が画面上部の **「わたしは」** で自分を選ぶ（端末に記憶されます）
3. 必要なら **「名前を変更」** で「メンバー1/2/3」を実名に（誰か1人がやればOK）
4. あとは各日の **「＋ 追加」** から、翌週以降の予定を各自入力

---

## よくある質問

**Q. 本当にずっと無料？**
A. はい。Vercel の Hobby プラン（個人利用）と Turso の無料枠で、この規模（3人）なら余裕で収まります。クレカ登録も不要です。

**Q. 初回アクセスが少し遅いのはなぜ？**
A. サーバーレスのため、しばらく使われないと一時停止し、次のアクセスで起動します（コールドスタート）。数秒待てば普通に動きます。

**Q. URL を知っていれば誰でも見られる？**
A. はい。3人だけに URL を共有する運用が基本です。「合言葉（簡易パスワード）」を付けたい場合は対応できます。

**Q. データのバックアップは？**
A. Turso 側にデータが保持されます。ダッシュボードからエクスポートもできます。必要なら定期バックアップの仕組みも追加できます。

---

## 困ったときのチェック

- **画面は出るが「サーバエラー」になる／予約が保存されない**
  → Vercel の環境変数 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` が正しく設定されているか確認。
    変更したら Vercel で **Redeploy（再デプロイ）** が必要です。
- **ビルドが失敗する**
  → Vercel の「Deployments → Logs」を確認。ブランチ指定が正しいかも確認。
- **ローカルで試したい**
  → `npm install` のあと `npm start`（http://localhost:3000）。
    Turso の環境変数が無ければ、自動でローカルのファイルDB（`kurumayoyaku.db`）で動きます。
