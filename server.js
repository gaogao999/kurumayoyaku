// ローカル開発用サーバ。
// Vercel本番では api/index.js が直接サーバーレス関数として動き、静的ファイルは
// vercel.json の設定で public/ から配信される。ローカルでは下記で両方を提供する。
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import app from './api/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// 静的ファイル（画面）を配信（ローカル開発時のみ）
app.use(express.static(join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`車予約システム: http://localhost:${PORT}`);
});
