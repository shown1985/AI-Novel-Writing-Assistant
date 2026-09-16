# R1-01：单机运行与数据边界验收

## Story 合同

- Release / Sprint：Release 1 / R1-S0。
- Story：R1-01 单机运行与数据边界冻结（3 点）。
- 用户价值：无需账号的单机版本只能从本机访问，作品和模型密钥不会因默认配置暴露到局域网或被隐式上传。
- 范围：服务端与前端监听边界、桌面托管入口、SQLite/Qdrant/文件权威、外部调用、升级和备份合同。
- 非范围：账号、MFA、MySQL、TLS/LAN 服务、公网部署、真实用户库迁移、公开包装。

## 基线审计

审计基线为 `codex/r1-s0-release-readiness@2e14c891`。审计发现：

- 打包和工作区桌面运行时已经强制 `HOST=127.0.0.1`、`ALLOW_LAN=false`，并把 API 固定到随机回环端口。
- 服务端独立开发模式原先把未配置的 `ALLOW_LAN` 解释为 `true`，默认监听 `0.0.0.0`。
- Vite 原先使用 `host:true`，会监听所有接口；客户端还会把显式 loopback API 改写为页面的 LAN hostname。
- CORS 原先允许任意数字 IPv4 Origin；这不能保护直接 HTTP、SSE、下载或设置接口。
- 默认数据库已是 SQLite；默认图片存储为本地文件；默认 Qdrant 地址为 `127.0.0.1`。PostgreSQL、S3/MinIO 和远程 Qdrant 都需要显式配置。
- 未发现产品主动启用的远程 telemetry exporter。外部网络能力集中在模型、Embedding/reranker、图片、TTS/视频、市场来源和通知适配器，并由相应功能或显式集成触发。

## 冻结结果

稳定架构规则见 [Release 1 本机运行与数据边界](../wiki/architecture/local-runtime-data-boundary.md)。本 Story 同步落实以下运行门：

1. 服务端默认 `127.0.0.1`，`ALLOW_LAN=false`。
2. `ALLOW_LAN=true`、`0.0.0.0`、`::` 和私网主机在任何迁移或后台恢复前失败。
3. Vite 只监听 `127.0.0.1`；开发客户端不再把 loopback API 改写为 LAN 地址。
4. README 和 env 示例只说明本机访问；LAN/在线访问明确进入 Release 2。
5. SQLite 是本地事务事实源；Qdrant 是可重建索引；文件资产默认本地；外部存储和远程供应商需要显式配置与动作。
6. Release 2 的认证、MySQL 和工作区代码不成为 Release 1 启动前置。

## 验收证据

| AC | 证据 |
| --- | --- |
| 无账号仍只能从本机访问 | `serverRuntimeBoundary.test.js` 覆盖默认 loopback、允许显式 loopback、拒绝 `ALLOW_LAN`、wildcard、私网主机与非回环 CORS Origin，并确认直接复用 `createApp()` 也不能绕过校验。 |
| 前端不开放 LAN | `runtimeBoundary.test.js` 解析 Vite 配置并断言 `server.host=127.0.0.1`；`constants.test.mjs` 断言 loopback API 不按 LAN 页面地址改写。 |
| 桌面受控入口 | `desktop/src/runtime/server.ts` 对工作区与打包子进程均注入回环配置；`paths.ts` 只生成回环 API。 |
| 本地事实源 | `databaseConfig.test.js` 验证默认 SQLite；`imageStorage.test.js` 验证默认本地文件；`rag.ts` 默认 Qdrant 回环且 Qdrant 只由 RAG 服务消费。 |
| 矛盾配置先失败 | `startServer` 在 `ensureRuntimeDatabaseReady`、兼容导入和 worker 初始化之前解析并拒绝运行配置。 |
| R2 不成为前置 | 启动链未引入 User/MFA/MySQL/Workspace；Roadmap 和运行 Wiki 明确分离两个 Release。 |

## 已知后续门

- v0.4.25 合流后的重叠视觉资产迁移历史仍使空库全迁移测试失败。它不改变 SQLite 的权威角色，但会阻断 R1-RC01；已进入 R1-03 验证矩阵输入，不能在本 Story 中用 reset 或删除迁移规避。
- 外部模型调用的“显式动作”需要在 S1-02/03 继续收紧：当前设置页和 RAG health 的隐式探测已由 R1-00 标为 `Not Ready`，不能因本机监听门通过而视为零外发全部完成。

## 验证命令

```text
pnpm --filter @ai-novel/server build
node --test server/tests/serverRuntimeBoundary.test.js
pnpm --filter @ai-novel/client typecheck
node --experimental-strip-types --test client/tests/runtimeBoundary.test.js client/src/lib/constants.test.mjs
node --test server/tests/databaseConfig.test.js server/tests/imageStorage.test.js
git diff --check
```

不运行浏览器、真实模型、远程 Qdrant/S3、用户数据库或桌面包装。桌面安装包行为留给 R1-03/R1-RC02 的平台矩阵与用户验收。
