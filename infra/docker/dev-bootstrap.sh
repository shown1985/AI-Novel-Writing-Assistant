#!/bin/sh
# 一次性初始化：在容器卷中安装依赖，供 shared/api/web 三个热更服务复用。
# shared 的编译由 shared 服务的首次 watch 编译完成，api 等待其就绪后再启动。
set -eu
cd /app

echo "[dev-bootstrap] installing workspace dependencies into container volumes..."
pnpm install --frozen-lockfile

echo "[dev-bootstrap] done."
