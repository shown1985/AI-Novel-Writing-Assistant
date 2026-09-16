# MySQL 中央主库存储：Sprint 与 Story 分解

## 目标与边界

本计划属于 **Release 2**。目标是让阿里云 RDS MySQL 成为多人协作服务的中央事务主库，同时保留 SQLite 作为 Release 1 和个人离线作品的本地存储。

截至2026-09-16，当前代码只识别 PostgreSQL/SQLite：非 `file:` URL 会进入 PostgreSQL adapter；Prisma 有 PostgreSQL/SQLite 两份 schema 和迁移；原生 SQL 中存在双引号标识符与 `ON CONFLICT`；大量正文和 JSON 字符串在 PostgreSQL 中默认是 `text`，不能直接按 MySQL 默认短字符串建表。因此 MySQL 是一次受控平台迁移，不是替换 `DATABASE_URL`。

截至2026-09-16的只读云审计显示，当前阿里云实例可用于隔离开发，但基础系列、1核1GB、10GB、无 SSL、无日志备份，不能通过生产门。本计划不授权修改云实例、创建数据库、迁移用户数据或关闭现有服务。

## 容量

共 12 张实施卡、54 点。

| 窗口 | 卡片 | 点数 | 结果 |
| --- | --- | --- | --- |
| DB-A 决策与运行底座 | DB-00～02 | 13 | provider、生产基线和连接适配冻结 |
| DB-B Schema 与 SQL 兼容 | DB-03～06 | 20 | MySQL schema、迁移、查询和行为一致 |
| DB-C 数据迁入与切换 | DB-07～09 | 13 | 可重复导出/导入、影子核对和安全切换 |
| DB-D 运维与兼容收束 | DB-10～11 | 8 | 备份恢复、监控和 PostgreSQL 兼容退场 |

## DB-A：决策与运行底座

### DB-00 中央数据库 ADR 与兼容清单（3 点）

- 用户价值：云端协作数据只有一个权威来源，桌面数据仍可离线使用。
- 状态/Owner/依赖：Backlog（允许只读Refinement）；根集成人/数据架构owner；Release 1数据边界稳定。
- 任务：冻结 `SQLite local / MySQL central / Qdrant vector / object storage binary`；盘点164个模型、枚举、索引、事务、原生SQL、迁移和备份合同；明确PostgreSQL退场条件。
- AC：不长期维护PostgreSQL+MySQL+SQLite三条中心路径；个人库不自动上传；身份表建立在最终MySQL合同上；所有不兼容项有Story归属。
- 检查：ADR、schema清单、21处原生查询和数据分类证据。
- 非范围：修改provider、schema、RDS或用户数据。

### DB-01 RDS 生产安全与容量基线（5 点）

- 用户价值：中央数据库故障或误操作时，作品可以恢复且凭据不会暴露。
- 状态/Owner/依赖：Backlog；云平台/安全owner；DB-00与用户对云变更的单独授权。
- 任务：定义高可用/多可用区、初始容量、TLS、VPC、白名单、最小权限账号、日志备份/PITR、监控告警、密钥托管和恢复目标。
- AC：基础系列不能进生产；公网不是默认应用链路；SSL与日志备份为发布硬门；云AK不作为应用数据库凭据；备份必须完成一次恢复验证。
- 检查：只读云配置审计、威胁模型和隔离实例恢复演练方案。
- 非范围：未经授权修改RDS或查看数据库明文密码。

### DB-02 MySQL Provider、Driver 与启动门（5 点）

- 用户价值：服务不会把MySQL连接串误当PostgreSQL，也不会在错误配置下写错数据库。
- 状态/Owner/依赖：Backlog；数据库平台owner；DB-00，库选型在开工时复核。
- 任务：扩展provider解析、Prisma配置、受维护MySQL adapter、连接池、TLS参数、health和矛盾配置失败；桌面SQLite路径保持不变。
- AC：`mysql://`只进入MySQL；`postgresql://`兼容期仍明确；`file:`仍解析真实桌面路径；生产缺TLS/凭据时fail-closed；日志不含连接密码。
- 检查：配置矩阵、mock adapter、启动/关闭/池耗尽测试和server typecheck。
- 非范围：创建生产库、导入作品或移除PostgreSQL。

## DB-B：Schema、迁移与查询兼容

### DB-03 长文本、JSON、枚举与索引分类（5 点）

- 用户价值：长篇正文、Prompt和结构化资产不会因字段过短而截断或保存失败。
- 状态/Owner/依赖：Backlog；schema分类owner；DB-00/02。
- 任务：逐模型分类ID/短标签/Text/MediumText/LongText/JSON/Bytes/时间；检查utf8mb4索引长度、唯一约束、大小写排序规则和时间精度。
- AC：正文、章节、Prompt、响应、快照和`*Json`有明确MySQL类型；不可用统一LongText掩盖索引需求；大小写敏感ID语义不漂移；分类可生成审计报告。
- 检查：最大长度fixture、中文/emoji、排序规则、唯一性和索引预算测试。
- 非范围：在本Story生成生产迁移或改写业务查询。

### DB-04 MySQL Schema 与基线迁移（5 点）

- 用户价值：新协作环境可以从空库稳定安装，升级有独立迁移历史。
- 状态/Owner/依赖：Backlog；Prisma schema/migration单一owner；DB-02/03。
- 任务：建立MySQL schema/migrations；保持共享模型语义；所有关系、级联、默认值和枚举显式；纳入包与生成脚本。
- AC：空MySQL可deploy；SQLite仍可generate/deploy；禁止对用户库`db push/reset`；迁移前后schema diff可审阅；认证表后续只接该基线。
- 检查：临时MySQL空库迁移、Prisma生成和schema drift检查。
- 非范围：修改现有用户库、认证模型或真实协作数据。

### DB-05 原生 SQL 与事务可移植化（5 点）

- 用户价值：世界、章节和任务在MySQL下不会因方言差异失效或重复写入。
- 状态/Owner/依赖：Backlog；repository/事务owner；DB-02/03，共享Prisma接线由根集成人负责。
- 任务：优先将原生查询收敛为Prisma API/owned repository；`ON CONFLICT`改幂等upsert；剩余方言通过明确adapter实现；验证隔离级别和锁语义。
- AC：不依赖MySQL `ANSI_QUOTES`偶然配置；竞争upsert只有一个结果；SQLite/MySQL均保持CAS、幂等和事务原子性；不得用先查后写制造竞态。
- 检查：21处原生调用归零或全部登记；并发、重放、死锁重试和故障注入测试。
- 非范围：顺带重构无关服务或改变世界/章节产品语义。

### DB-06 SQLite/MySQL 行为一致性套件（5 点）

- 用户价值：本地创作和云端协作不会因数据库不同产生不同作品事实。
- 状态/Owner/依赖：Backlog；数据库验证owner；DB-04/05。
- 任务：对ID、时间、枚举、null、长文本、事务、级联、排序、分页、并发和任务租约建立provider contract tests。
- AC：关键应用服务在两provider通过同一断言；差异必须由领域合同解释；不能用仅typecheck证明兼容；测试不接用户库。
- 检查：临时SQLite与隔离MySQL自动套件、失败矩阵和性能基线。
- 非范围：真实用户数据迁移、生产压测或用mock替代数据库行为。

## DB-C：数据迁入与切换

### DB-07 本地作品导出与迁入预检（3 点）

- 用户价值：用户在上传前知道哪些小说、资料、附件和任务会被复制。
- 状态/Owner/依赖：Backlog；迁移inventory owner；DB-06与C0资源范围草案。
- 任务：只读inventory、schema版本、引用完整性、容量、冲突、敏感配置和附件范围；生成不含密钥的manifest。
- AC：预检零写入；API Key/本地绝对路径不进入中心库；损坏引用明确阻塞或隔离；范围由用户确认。
- 检查：历史SQLite fixture、超长文本、缺附件和旧schema样本。
- 非范围：上传、转换或修复用户内容。

### DB-08 幂等导入与来源映射（5 点）

- 用户价值：迁移失败可重试，不会生成半本书或重复章节。
- 状态/Owner/依赖：Backlog；数据迁移owner；DB-06/07与C0工作区合同。
- 任务：operationId、旧ID到中心ID映射、批次事务、附件阶段、检查点、失败恢复和来源审计；原库只读。
- AC：重复请求不重复数据；任一批次失败有明确边界；成功前作品不对成员可见；原SQLite不修改；账号/工作区归属由授权命令提供。
- 检查：中断、响应丢失、重复提交、长文本和关系计数测试。
- 非范围：双向同步、自动上传或删除本地原件。

### DB-09 影子核对、切换与回退演练（5 点）

- 用户价值：正式切换前证明中心副本完整，异常时仍可回到本地作品。
- 状态/Owner/依赖：Backlog；根集成人/数据切换owner；DB-08与完整备份授权。
- 任务：表/关系/章节顺序/hash/关键投影核对；只读影子流量；切换窗口、写冻结、回退点和用户提示。
- AC：无核对报告不切换；切换不删除原库；回退不把中心新写静默覆盖本地；任何真实操作先获授权并完成可验证备份。
- 检查：隔离副本全链演练和恢复时间记录。
- 非范围：未经批准的生产切换、删库或双主写入。

## DB-D：运维与兼容收束

### DB-10 备份、恢复、监控与数据库运行手册（5 点）

- 用户价值：数据库容量、连接或节点异常时有明确恢复路径。
- 状态/Owner/依赖：Backlog；SRE/数据库owner；DB-01/06，贯穿Release 2 beta。
- 任务：PITR、全量恢复、连接池、慢查询、容量、错误率、证书到期、备份失败告警；维护窗口和责任人；定期恢复演练。
- AC：恢复演练有结果而非仅“已开启备份”；告警不含密钥/正文；Runbook区分应用降级和数据恢复；破坏性命令继续要求授权与备份。
- 检查：隔离实例restore drill、故障桌面演练和监控证据。
- 非范围：未经授权修改生产告警、备份或实例规格。

### DB-11 PostgreSQL 兼容退场与依赖收束（3 点）

- 用户价值：后续功能只需维护本地SQLite和中心MySQL，不因第三条数据库路径拖慢交付。
- 状态/Owner/依赖：Backlog；根集成人；DB-06/09/10与Release 2 beta通过。
- 任务：确认无生产PostgreSQL租户；冻结旧迁移；移除默认推断和无用adapter；保留必要导出工具/历史说明。
- AC：只能在MySQL beta通过且无活跃PostgreSQL数据后执行；移除前有inventory和回退点；不能删除用户数据库；依赖、文档和CI矩阵同步。
- 检查：依赖搜索、构建、两provider套件和beta数据核对。
- 非范围：删除PostgreSQL实例、数据库、备份或未确认的历史迁移。

## 依赖与并行 Wave

1. DB-00先行，冻结数据角色和PostgreSQL退场策略。
2. DB-01可与DB-02并行，但共享配置、依赖和云操作由根集成人管理。
3. DB-03完成后，DB-04/05分别由schema owner和repository owner推进；根负责共享Prisma配置与迁移接线。
4. DB-06通过后，AUTH数据模型和C0工作区模型才可建立在MySQL上。
5. DB-07→08→09严格串行；任何真实用户数据迁移不委托子Agent且必须另获授权。
6. DB-10贯穿beta；DB-11只能在Release 2候选稳定后执行。

## Done 与安全红线

每张卡必须同时说明SQLite和MySQL行为，验证长文本、并发、重放、失败恢复和secret脱敏。没有可验证备份、恢复证据或用户明确授权时，不执行真实迁移、删库、表清理、连接地址切换或RDS配置变更。当前阿里云实例只读审计结果不能代替生产验收。
