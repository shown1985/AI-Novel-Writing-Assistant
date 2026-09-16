# 本地首次管理员、MFA 与账号权限：Sprint 实施卡

> Release归属：**Release 2**。Release 1个人桌面保持SQLite、无需账号且仅允许回环访问；只有启用Release 2的LAN或协作服务时才执行本计划。

## 目标与安全解释

本计划实现以下体验：本地回环地址或显式开启的局域网服务首次启动时，不要求已有账号即可进入管理员设置；设置完成后持久化首位管理员并强制绑定 MFA 验证器；该管理员后续可以创建账号并选择权限。

“首次匿名”只表示没有已有账号，不表示第一个网络请求自动成为管理员。首次设置者必须持有服务器宿主机交付的一次性设置凭证。回环桌面由受控主进程交付；LAN 由宿主机终端或本机窗口展示短期设置码。不能使用 IP、Host、Origin、CORS 或请求先后顺序证明管理员身份。

默认管理员是首位持久 `Owner`，没有固定默认密码。用户在设置过程中选择登录名和密码；密码、TOTP 验证与恢复码确认全部成功后，才原子创建 active Owner、关闭初始化入口并签发正式会话。

## 多 Agent 讨论结论

三位独立审计 Agent 从 Runtime/数据、首次引导/产品、安全反方三个角度复核，结论为 3/3 一致：

| 议题 | 结论 | 原因 |
| --- | --- | --- |
| 本地或 LAN 第一个匿名请求直接成为管理员 | 否决 | 同 LAN 抢占、DNS rebinding、代理地址伪装和并发竞态均可导致实例被接管 |
| 无已有账号的首次设置 | 同意，但须一次性宿主机凭证 | 保留首次使用低门槛，同时证明设置者能接触安装主机 |
| 管理员何时创建 | MFA 与恢复方式确认后原子激活 | 避免留下可登录但未绑定 MFA 的半成品管理员 |
| LAN 认证 | 显式开启、精确接口/Origin、HTTPS | 明文 HTTP 会泄露密码、会话和 TOTP；`0.0.0.0` 不是安全域 |
| 首期账号权限 | 同实例共享内容的 capability RBAC | 当前 Novel/World/任务没有完整用户/工作区归属，不能宣称账号之间作品私有 |
| 前端保护 | 仅作体验，服务端中央默认拒绝 | 当前 `authMiddleware` 直接放行，约束必须覆盖 API、SSE、文件、worker 和回调 |

## 当前源码事实

- `server/src/middleware/auth.ts` 只有 `next()`，不是有效鉴权。
- 开发服务器默认可启用 LAN 并监听 `0.0.0.0`；当前 CORS 对数字 IPv4 Origin 和无 Origin 请求较宽松。
- 打包桌面服务固定 `127.0.0.1` 且关闭 LAN，这一默认边界保留。
- MySQL/SQLite目标schema尚没有统一的 User、Session、MFA、恢复码或安全审计模型；当前PostgreSQL路径只是迁移期兼容来源。
- 客户端请求尚未统一携带 HttpOnly Cookie，SSE/raw fetch 也需盘点。
- 后台导演/工作流任务没有完整 actorUserId 与授权来源。仅保护 HTTP 请求不足以保护异步执行。

## 状态机和产品合同

服务端持久状态是唯一事实源：

```text
uninitialized
  → claim_reserved
  → primary_credential_pending
  → mfa_enrollment_pending
  → recovery_ack_pending
  → ready
```

- `uninitialized`：只开放最小 health、bootstrap status/claim；业务 API 返回 `setup_required`，零数据读取。
- `claim_reserved`：一次性设置凭证通过原子条件更新取得短租约；其他设备只能等待或得到冲突。
- `primary_credential_pending`：同一 setup session 提交登录名、显示名和强密码；不签发业务会话。
- `mfa_enrollment_pending`：生成加密保存的 TOTP secret；QR/手动密钥仅通过 no-store 响应显示给当前设置会话，验证当前验证码。
- `recovery_ack_pending`：一次展示恢复码，数据库只保存逐个 hash；用户明确确认保存。
- `ready`：同一事务激活 Owner、MFA和恢复方式，撤销设置凭证并签发旋转后的正式 session。其他初始化页面转普通登录。

崩溃后持原设置凭证恢复同一个 pending ceremony，不创建第二个 Owner。claim 过期只能由宿主机重新生成凭证；匿名网络请求不能重置认证状态。

## 容量与验收窗口

共 13 张实施卡、57 相对点。点数用于 refinement，不代表日期承诺。

| 窗口 | 卡片 | 点数 | 退出门 |
| --- | --- | --- | --- |
| AUTH-A 安全边界与数据基础 | AUTH-00～02 | 13 | 运行域、中央门、双数据库模型冻结 |
| AUTH-B 首次设置与正式登录 | AUTH-03～05 | 15 | 原子 Owner、强制 MFA、服务端会话联通 |
| AUTH-C 客户端、权限与异步任务 | AUTH-06～09 | 16 | AuthShell、四权限预设、用户管理、worker署名 |
| AUTH-D 恢复、升级与发布门 | AUTH-10～12 | 13 | 恢复审计、旧库接管、完整安全回归 |

## AUTH-A：安全边界与数据基础

### AUTH-00 运行域、威胁模型与路由清单 Spike（3 点）

- 用户价值：本机、局域网和未来公网部署各有可理解且不会误判的登录规则。
- 状态/Owner：Ready（Spike）；根集成人，Runtime/UI/安全审计提供证据。
- 任务：冻结 `desktop_loopback / local_browser / lan_server / public_or_proxy`；枚举 API、SSE、下载、图片、回调、WebSocket和worker；固定TLS、Host/Origin、代理信任、setup code交付和共享实例权限语义。
- AC：IP/Origin/CORS不授予管理员；`0.0.0.0/::`视为所有接口；LAN必须显式配置且认证要求HTTPS；默认不信任代理头；桌面设备能力与人类账号分开；公开/签名回调逐项列白名单。
- 检查/证据：信任边界图、路由inventory、攻击时序、两数据库/桌面依赖和后续卡解锁清单。
- 非范围：生产鉴权、MFA库选型实现、用户数据库迁移。

### AUTH-01 中央默认拒绝、LAN 与浏览器边界（5 点）

- 用户价值：初始化前作品和模型密钥不会被局域网访客读取，完成后未登录访问全部受保护。
- 状态/Owner：待 AUTH-00；平台安全 Agent；`server/src/app.ts`与中央认证门同一 owner，根接路由。
- 任务：业务路由前安装 deny-by-default；最小匿名allowlist；区分 `setup_required / 401 / 403`；收紧CORS/Host/Origin/trust proxy；矛盾启动配置失败；外部callback使用独立签名主体。
- AC：遗漏某个router仍不会匿名通过；初始化状态零业务读取/写入；任意数字LAN Origin不再自动放行；无Origin只允许明确非浏览器/签名协议；LAN非TLS拒绝密码/TOTP/session；health仍满足桌面启动探活但不泄露配置。
- 检查/证据：自动路由覆盖、匿名读写、DNS rebinding、伪造forwarded header、CORS/CSRF边界和启动矩阵测试。
- 非范围：用户角色授权、业务资源私有隔离。

### AUTH-02 身份、MFA、会话与双数据库增量模型（5 点）

- 用户价值：账号、验证器和登录状态跨重启保存，升级不删除已有小说。
- 状态/Owner：待 DB-04/06与AUTH-00；身份数据 Agent；Prisma schema/migration由根独占接线。
- 任务：`AuthSystemState / AuthBootstrapCeremony / User / MfaAuthenticator / MfaRecoveryCode / AuthSession / SecurityAuditEvent`；固定角色/capability catalog；MySQL与SQLite唯一约束、条件更新和索引；secret encryption key版本。
- AC：双schema同步；claim单例和用户名唯一由数据库保证；session/recovery/setup token只存hash；TOTP secret只存带keyId的密文；旧内容零删除/零owner伪造；临时库迁移可回滚到原应用版本或明确只前进策略。
- 检查/证据：临时SQLite与隔离MySQL迁移、并发条件更新、历史库读取和密钥缺失fail-closed测试。
- 非范围：在用户桌面库执行迁移、实现页面、创建真实管理员。

## AUTH-B：首次设置、MFA 与登录

### AUTH-03 一次性初始化凭证与原子 Ceremony（5 点）

- 用户价值：第一次使用不需要已有账号，但只有能接触安装主机的人可以设置管理员。
- 状态/Owner：待 AUTH-01/02；Auth Runtime Agent，独占 bootstrap application/infrastructure。
- 任务：宿主机生成高熵一次性claim；桌面IPC/终端安全交付；hash/过期/失败次数；数据库CAS租约；pending资料；重启恢复和新码轮换。
- AC：两个LAN客户端只能一个取得claim；GET状态不创建/续租；重放不产生第二管理员；旧码成功或过期后失效；无设置码不能阻塞他人；日志/URL/Referer不含明文；active后bootstrap永久关闭。
- 检查/证据：并发进程、响应丢失、crash、过期、DoS/限速和桌面IPC泄漏测试。
- 非范围：根据 `req.ip` 自动claim、固定admin密码、匿名网络重置。

### AUTH-04 密码、TOTP 绑定与恢复码激活（5 点）

- 用户价值：首位管理员持久受密码和验证器保护，丢手机时仍有一次性恢复方式。
- 状态/Owner：待 AUTH-03；同一 Auth Runtime owner串行；采用受维护密码hash/TOTP/AEAD库，开工时审查版本与许可证。
- 任务：Argon2id密码；pending TOTP secret加密；QR/手动密钥no-store；验证码确认、有限时间偏差与time-step重放保护；高熵恢复码一次显示/逐个hash；原子Owner激活。
- AC：密码已设但MFA未完成仍零业务权限；二维码/seed不进URL、日志、localStorage、trace；同一TOTP时间步并发仅一次成功；恢复码单次消费；Owner/MFA/recovery/bootstrap关闭/首session同事务；失败不留下无MFA active管理员。
- 检查/证据：fake clock、并发验证码、事务注入失败、加密key轮换/缺失、恢复码重放与no-store测试。
- 非范围：自写加密算法、短信MFA、微信扫码替代MFA。

### AUTH-05 密码登录、MFA挑战与服务端会话（5 点）

- 用户价值：后续启动使用管理员账号和验证器登录，可安全退出或撤销设备。
- 状态/Owner：待 AUTH-04；Auth Runtime owner。
- 任务：密码成功只生成短期pre-auth；TOTP/恢复码后旋转为opaque session；token hash、HttpOnly cookie、idle/absolute expiry、session version；CSRF、精确Origin、JSON content type和限速；单设备/全部登出。
- AC：密码阶段不能访问业务；MFA后session ID旋转；Cookie在LAN为HttpOnly+Secure且无Domain；写请求缺CSRF/Origin零写；账号/来源组合限速且错误不枚举用户；密码/MFA/角色变化撤销相关session；恢复码不能单独重置密码。
- 检查/证据：cookie属性、CSRF form、pre-auth越权、TOTP/恢复码、session撤销/过期、SSE握手行为测试。
- 非范围：长寿命JWT存localStorage、可信设备永久免MFA、微信账号登录。

## AUTH-C：客户端、权限与账号管理

### AUTH-06 AuthShell、首次引导与请求接线（5 点）

- 用户价值：新手按“创建管理员→添加验证器→保存恢复方式”完成设置，不会先触发创作查询。
- 状态/Owner：可先消费冻结mock，业务Done待 AUTH-03～05；UI Agent独占拟建 `client/src/pages/auth/`，共享router/API由根接线。
- 任务：启动先读bootstrap/session；独立AuthShell；setup code、管理员资料、MFA、恢复码、完成、登录页；axios/raw fetch/SSE统一凭据；站内returnTo；401/403/网络错误和多tab同步。
- AC：AuthShell不挂AppLayout、LLM或任务轮询；刷新从服务器恢复步骤；secret类字段不持久化；一tab完成后其他tab转登录；401停止流并登录后只重读任务、不重提任务；403不伪装空数据；二维码完成后不可重取明文secret。
- 检查/证据：状态机行为测试、所有request transport inventory、client typecheck和用户UI验收。
- 非范围：用localStorage保存role/session/MFA、视觉密集设置墙。

### AUTH-07 权限目录与四个预设（3 点）

- 用户价值：管理员可以用容易理解的预设分配权限，同时敏感能力有明确边界。
- 状态/Owner：待 AUTH-02/05；RBAC Agent；根管理共享类型。
- 任务：固定 `Owner / 创作者 / 审阅者 / 只读访客`；映射 `users.manage / security.manage / model_settings.manage / secrets.manage / creative.write / production.execute / quality.resolve / assets.write / data.export / records.read` 等capability；形成操作矩阵。
- AC：Owner至少保留一人；创作者不能看模型密钥/用户安全；审阅决定属于显式写权限；只读默认不可导出；运行记录对所有角色只读且来源页动作另验权限；服务端使用capability，不按UI角色文本分支。
- 检查/证据：role×operation矩阵、预设版本与向后兼容合同。
- 非范围：首期自定义字段ACL、用户私有作品隔离。

### AUTH-08 用户创建、激活与权限管理（5 点）

- 用户价值：管理员能创建不同职责账号、停用访问并安全重置登录因素。
- 状态/Owner：待 AUTH-05/07；账号 Runtime + 设置UI串行；拟建“系统设置→成员与权限”。
- 任务：账号/显示名/预设；一次性短期激活码；用户首次设密码和MFA；停用/启用、改预设、撤销session、密码恢复、MFA重绑；敏感操作近期MFA。
- AC：管理员看不到用户密码/TOTP；激活码单次使用；普通用户不能提升自己；角色/停用立即撤销session；最后Owner不能停用/降级；MFA重置强制下次重绑且有审计；列表只显示必要状态和掩码信息。
- 检查/证据：创建/激活竞态、越权、最后Owner、近期MFA、session撤销和UI行为测试。
- 非范围：邮件服务假设、管理员代设永久密码、按昵称自动合并账号。

### AUTH-09 Worker 调用者、权限来源与回调主体（3 点）

- 用户价值：后台AI任务知道谁发起、按什么权限运行，不因离开网页变成匿名超级用户。
- 状态/Owner：待 AUTH-05/07；任务Runtime Agent；共享任务字段/迁移由根接线。
- 任务：入队保存 actorUserId、授权capability/version/scope、审计关联；worker service principal；禁用/撤权后的排队任务策略；外部callback签名主体；SSE读取范围。
- AC：客户端不能伪造actor；worker不持长期用户session；未开始高风险命令在撤权后拒绝；已开始任务按冻结/中止政策留证；回调不因无Cookie而匿名放行；运行记录仅展示/导航，不执行恢复。
- 检查/证据：入队/撤权竞态、worker重启、callback签名、跨账号任务读取测试。
- 非范围：重写自动导演队列、让局部质量债阻塞全书。

## AUTH-D：恢复、旧库接管与发布门

### AUTH-10 安全审计、恢复码与唯一 Owner 应急恢复（3 点）

- 用户价值：丢失验证器或密码时有可追溯恢复方式，不留网络万能后门。
- 状态/Owner：待 AUTH-04/05/08；安全 Runtime/运维 owner。
- 任务：登录/claim/MFA/用户/权限/session事件；恢复码使用与重生；另一Owner帮助重置；唯一Owner本机break-glass命令；撤销全session、强制改密/重绑。
- AC：审计不含秘密；恢复码单次原子消费；管理员帮助只签一次性恢复凭证；唯一Owner恢复要求宿主机访问、备份确认和显式命令；无匿名网页重置；高风险恢复后旧session全失效。
- 检查/证据：恢复竞态、审计脱敏、主机命令和失败恢复演练。
- 非范围：安全问题找回、仅微信昵称/邮箱证明身份、删除认证表重置。

### AUTH-11 现有匿名工作台接管与 LAN 运维（5 点）

- 用户价值：升级后原有小说仍在，首位管理员可安全接管共享工作台并决定是否开放LAN。
- 状态/Owner：待 AUTH-01～10；迁移/桌面/运维 owner，真实执行前必须备份并验证。
- 任务：旧库增量升级；bootstrap完成后归入实例共享工作区，不伪造逐条作者；开发默认LAN显式开启；具体私网/ULA绑定；TLS或受信反向代理；本机显示setup code；桌面loopback保持。
- AC：升级前备份门明确；未初始化业务fail-closed但数据不删除；接管事务失败可继续setup；原数据计数/引用一致；LAN明文认证拒绝；`HOST/ALLOW_LAN/TLS/trust proxy`矛盾启动失败；不自动上传桌面库。
- 检查/证据：临时旧SQLite与隔离MySQL升级/恢复、桌面启动、LAN配置矩阵和数据对账。
- 非范围：多主SQLite同步、作品私有分配、未经授权实际迁移。

### AUTH-12 全路由、双数据库与多角色安全验收（5 点）

- 用户价值：证明管理员设置、普通登录和不同权限账号可用且没有匿名旁路。
- 状态/Owner：待 AUTH-01～11；验证 Agent；UI由用户验收。
- 任务：匿名路由inventory、两客户端claim、MFA/恢复、四角色、SSE/文件/设置/密钥/任务、worker撤权、LAN TLS、重启和旧库升级长链。
- AC：匿名仅命中白名单；并发claim仅一人成功；无MFA Owner不存在；恢复码只用一次；前端改role/localStorage不能越权；四预设矩阵正确；登出不取消任务且重登不重复执行；日志零secret；SQLite/MySQL均通过关键行为。
- 检查/证据：mock transport、临时SQLite、隔离MySQL、fake clock和受控HTTPS fixture；不使用用户库或真实模型。
- 非范围：公网容量证明、专业渗透测试、直接晋级main。

## 多 Agent Wave 与文件所有权

1. Wave A0：根执行 AUTH-00，冻结主体、状态、错误、访问模式、schema与共享文件owner。
2. Wave A1：数据Agent做 AUTH-02；平台Agent做 AUTH-01；UI Agent只在固定mock上做 AUTH-06壳。根接 `app.ts`、schema、shared、router、API client。
3. Wave B：同一Auth Runtime owner串行做 AUTH-03→04→05；UI再接真实接口。Bootstrap、MFA、session不拆给多人并写。
4. Wave C：RBAC owner做 AUTH-07/08；任务owner做 AUTH-09；UI owner做成员页；根处理共享capability、任务字段和HTTP挂载。
5. Wave D：安全/运维做 AUTH-10/11，验证Agent做 AUTH-12；根统一build、迁移演练审阅、Wiki、发布记录和阶段提交。

共享 Prisma schema/migration、`shared/types`、`server/src/app.ts`、客户端router/API client、Wiki与发布记录只由根集成人修改。子Agent不执行用户库迁移、数据删除、分支切换、commit、beta/main晋级。

## 与真人协作及未来微信登录的边界

- AUTH 是 [真人多人协作计划](./human-collaboration-sprints.md) 的前置基础。首期所有账号共享同一实例内容；C0工作区/资源归属完成后才可承诺按作品隔离。
- `Owner/创作者/审阅者/只读访客` 是服务端能力预设；后续工作区 `owner/editor/commenter/viewer` 不能仅复用同名字符串绕过系统权限。
- 微信只能作为一种登录身份，不是管理员或角色来源。未来绑定需保存 `provider + appId + providerSubject`，已有账号绑定要求正式session与近期MFA；微信昵称、手机号或UnionID不能未经确认自动合并账号。
- 微信首次登录不能成为Owner、不能跳过本地MFA策略；只能进入管理员创建/邀请的普通账号激活流程。

## Done 与安全红线

每卡必须验证失败路径、并发、重放、secret脱敏和SQLite/MySQL差异。UI隐藏、CORS通过、类型检查或“请求来自内网”都不算鉴权。开发/测试不写用户数据库；真实旧库升级前必须获得明确授权、创建可验证备份。AUTH安全门未通过前，不得将服务器暴露给LAN用户使用账号和密码。
