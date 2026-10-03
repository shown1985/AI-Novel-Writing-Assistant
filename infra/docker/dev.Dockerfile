# 本地容器化开发镜像：只提供 Node/pnpm 与原生模块编译工具，源码通过 bind mount 挂载，
# 依赖安装在容器内的命名卷中，避免宿主机（macOS/Windows）的原生模块与 Linux 容器互相污染。
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:${PATH} \
    npm_config_store_dir=/pnpm/store \
    CI=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.6.0 --activate

WORKDIR /app
