#!/bin/sh
# 后端热更：沿用 server 的开发准备脚本（Prisma generate / SQLite 初始化），再以 ts-node-dev 监听源码。
set -eu
cd /app/server

node scripts/ensure-dev-prisma.cjs

POLL_FLAG=""
if [ "${CHOKIDAR_USEPOLLING:-false}" = "true" ]; then
  POLL_FLAG="--poll"
fi

exec pnpm exec ts-node-dev --respawn --transpile-only ${POLL_FLAG} src/app.ts
