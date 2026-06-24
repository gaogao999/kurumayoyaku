FROM node:22-slim

WORKDIR /app

# 依存だけ先に入れてキャッシュを効かせる
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
# 永続ディスクを /data にマウントし、DBをそこに置く
ENV DB_PATH=/data/kurumayoyaku.db
EXPOSE 3000

CMD ["node", "server.js"]
