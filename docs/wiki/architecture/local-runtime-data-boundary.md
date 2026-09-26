# Release 1 本机运行与数据边界

## Background

Release 1 的目标是让一位新手在一台电脑上完成、恢复和导出整本小说。系统尚未提供账号、MFA、工作区授权或跨租户隔离，因此监听局域网地址会让作品、模型密钥和创作命令暴露给同一网络中的其他设备。CORS 只约束浏览器，不能代替服务端访问控制。

Release 2 才会引入中央 MySQL、身份、授权和 LAN/在线访问。Release 2 的代码、数据库或初始化流程不得成为 Release 1 启动前置。

## Decision

Release 1 的桌面端、本机浏览器和开发服务器都只能监听回环地址。`ALLOW_LAN=true`、通配主机或私网主机属于矛盾配置，必须在数据库升级、后台恢复和业务服务启动前失败。

本地 SQLite 是作品事实源；Qdrant 只保存可重建的向量索引；图片和附件默认写入本地文件目录。打开应用、查看状态、阅读正文和浏览资产不得向外部服务发送作品内容。模型、Embedding、图片、语音、视频、市场数据或通知请求只能由用户明确发起的工作流，或由用户已明确启用的集成和先前授权任务恢复触发。

## Current Rule

### 运行模式

| 模式 | 监听与入口 | 数据库 | 规则 |
| --- | --- | --- | --- |
| 打包桌面 | 随机端口，`127.0.0.1`，受控 Electron 窗口 | 应用数据目录中的 SQLite | 主进程强制 `HOST=127.0.0.1`、`ALLOW_LAN=false`；关闭应用时停止托管服务。 |
| 工作区桌面开发 | 随机端口，`127.0.0.1` | 默认 SQLite；显式开发配置仍不得改变监听边界 | 桌面运行时注入回环配置，渲染器 API 地址固定回环。 |
| 本机网页开发 | Vite `127.0.0.1`，API `127.0.0.1:3000` | 默认 SQLite | 浏览器通过同源 `/api` 代理访问；不把 API 地址改写为页面所在的 LAN 主机。 |
| 测试 | 测试显式选择 `127.0.0.1`/`::1` 和临时端口 | mock 或临时隔离 SQLite | 不使用用户桌面库，不调用付费模型。 |
| LAN / 公网 | Release 1 不可用 | 不适用 | 必须进入 Release 2，先完成认证、TLS、工作区授权和中心存储门。 |

服务端允许的主机仅为 `127.0.0.1`、`localhost` 和 `::1`。`0.0.0.0`、`::`、私网 IP 和 `ALLOW_LAN=true` 均须拒绝。显式 `CORS_ORIGIN` 只控制被允许的本机前端来源，不能扩张监听范围。

### 数据权威与可恢复性

| 数据 | Release 1 权威来源 | 派生/外部副本规则 |
| --- | --- | --- |
| 小说、章节、规划、世界、人物、任务、设置 | 本地 SQLite | 不自动上传；升级只允许增量迁移，禁止 reset、删库或覆盖。 |
| RAG 文档元数据、索引任务和检索记录 | 本地 SQLite | Qdrant 只保存 chunk/vector 索引，可从本地事实重建，不能反向成为正文事实源。 |
| 生成图片与上传附件 | 默认本地 `storage/` 或桌面应用数据目录 | S3/MinIO 仅在用户显式配置存储驱动后启用；不得静默切换。 |
| API Key 与供应商设置 | 本地环境变量或本地 SQLite 配置 | 日志、HTTP 响应和诊断不得返回明文秘密。 |
| 导出文件 | 用户明确选择的本机目标 | 导出不改变正文事实，也不隐式上传。 |

桌面应用数据目录由主进程统一解析；便携版使用安装包旁的数据目录，普通安装使用操作系统应用数据目录。服务端、数据库、文件资产、日志和备份不得各自猜测另一套根目录。

### 外部调用边界

- LLM、Embedding、reranker、图片、TTS、视频和市场来源可以是远程服务，但必须来自用户明确配置并启动的功能。
- 自动导演或后台 worker 可以恢复同一项已授权任务；恢复必须沿用原任务身份和范围，不能把应用启动当作创建新模型任务的理由。
- Qdrant 默认地址是本机回环。配置远程 Qdrant 表示用户明确选择外部索引目标；仍只能发送索引所需片段，且 SQLite 保持权威。
- 企业微信、钉钉等通知只在用户保存并启用相应通道后发送；默认启动不发送通知。
- Release 1 不配置产品遥测上传器。运行日志和 usage 记录保存在本地；依赖包中存在 telemetry 接口不等于产品启用了远程上报。

### 升级与备份

- 任何真实用户库升级前必须有可验证备份；破坏性操作还需用户明确批准。
- 启动配置验证必须先于迁移和后台任务。矛盾的 LAN 配置不能在失败前改写数据库。
- SQLite 迁移目录是升级路径，Prisma schema 只是目标结构；两者必须通过空库、上一版本和部分迁移历史 fixture。
- Qdrant 与本地生成资产不是数据库备份。备份/恢复必须覆盖 SQLite 和无法重新生成的本地文件。

## Failure Modes

- 只关闭 CORS 但仍监听 `0.0.0.0`：非浏览器客户端仍能读取和修改业务数据。
- 开发模式默认开放 LAN：无账号环境会把模型密钥和作品暴露给同网段设备。
- 前端把 loopback API 自动替换成页面 LAN 主机：会绕过产品运行边界并制造“前端可见、后端不安全”的错误配置。
- 把 Qdrant 当正文来源：索引丢失、重建或远程不可用会损坏作品事实。
- 启动后才检查主机配置：迁移、恢复或后台 worker 可能已经产生写入和外部调用。
- 为未来多人功能提前要求账号或 MySQL：会直接阻塞 Release 1 的单机完成率。

## Related Modules

- `server/src/app.ts`
- `server/src/config/database.ts`
- `server/src/config/rag.ts`
- `server/src/config/imageStorage.ts`
- `server/src/db/runtimeMigrations.ts`
- `desktop/src/runtime/server.ts`
- `desktop/src/runtime/paths.ts`
- `client/vite.config.ts`
- `client/src/lib/constants.ts`

## Source Documents

- [独立发行版路线](../../fork/roadmap.md)
- [独立发行版 Sprint 记录](../../fork/history.md)（R1-01，原验收记录见 Git 历史）
- [作者与 Agent 的协作合同](../product/author-agent-collaboration.md)
- [数据库 Schema 与迁移漂移](../debugging/database-migration-drift.md)
