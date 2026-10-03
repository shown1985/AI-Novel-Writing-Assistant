#!/bin/sh
# shared 热更：tsc --watch 完成首次编译后写入就绪标记，api 依赖该标记再启动，
# 避免首次编译重写 shared/dist 时触发尚未启动完成的后端重启。
set -eu
cd /app
rm -f /tmp/shared-ready

pnpm --filter @ai-novel/shared dev 2>&1 | while IFS= read -r line; do
  printf '%s\n' "$line"
  case "$line" in
    *"Watching for file changes"*) touch /tmp/shared-ready ;;
  esac
done
