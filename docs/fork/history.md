# Release 1 已完成 Sprint

R1-S0～R1-S3L 共 22 个 Sprint，承诺/完成 153/153 点，没有 carryover。每个 Sprint 的完整合同、Story 证据与 Review/Retrospective 原文已从仓库删除，可在 Git 历史中查阅（删除前最后一个提交为 `af803b36`，原路径 `docs/plans/r1-*`、`s1-*`～`s3-*`、`agent-collaboration-sprint*.md`）。仍然有效的设计规则已写入 `docs/wiki/`。

| Sprint | 目标 | 点数 | 关键结果 | 返工与备注 |
| --- | --- | --- | --- | --- |
| R1-S0 | 路线重整：对账上游、冻结单机边界、建立验收基线 | 16/16 | R1-00 对账 69 张卡；R1-01 强制回环；R1-02 隔离 SQLite 十章基线；R1-03 验证矩阵与静态审计 | 发现视觉资产双迁移历史冲突、非标准 tag 可公开发布、缺 macOS job |
| R1-S1 | 解除 SQLite 升级阻断；阅读现场与世界归属安全 | 15/15 | R1-MIG01 双迁移历史兼容；S1-00 诊断合同；S1-04 书架阅读恢复；S1-05 跨世界零写入；S1-06 世界维护合同 | 无逸出；发布阻断全部被矩阵拦住 |
| R1-S2A | 查看 AI 状态零调用；单书以正文为中心 | 14/14 | S1-01 缺省数值；S1-02a 诊断后端；S2-01a 单书编排归属；S2-02 章节辅助区按需展开 | Goal 部分达成：模型设置页仍自动 POST，留给 S2B |
| R1-S2B | 诊断只读消费；单书装配收敛；模型来源合同 | 9/9 | S1-02b 自动 GET 零探测；S2-01b 装配收敛；S2-04a 字段级来源与脱敏 | S1-03 重估为 5 点退回 Refinement |
| R1-S2C | 冻结展示与调用证据合同；世界 Prompt 版本对齐 | 8/8 | S2-03a0 展示权威；S2-04b0 attempt 证据 ADR；S3-00 静态登记门 | 全量不变量检查一次多发现 8 处漂移 |
| R1-S2D | 单书唯一推荐动作；attempt store；Prompt 执行边界 | 9/9 | S2-03a 展示模型；S2-04b1 双库 attempt store；S2-04b2 promptRunner 拆分 | 发现 transport retry 基线缺陷，另立 R1-PROMPT01 |
| R1-S2E | 来源页执行推荐动作；世界 Prompt 边界；transport 重试 | 8/8 | R1-PROMPT01；S2-03b 来源页动作；S3-01 世界 Prompt 迁移 | — |
| R1-S2F | 每次物理模型调用可追溯；世界样本安全提交 | 8/8 | S2-04b3 真实 transport attempt；S3-02a 样本 CAS 与回执 | 评审中关闭 1 个 P1 |
| R1-S2G | 调用证据归属作品/任务；世界编辑 CAS | 8/8 | S2-04b4 三入口归因与内部读投影；S3-02b1 `updateWorld`/`updateAxioms` CAS | S2-04b4 由 3 点重估为 5 点 |
| R1-S2H | 实况窗口显示预计与实际模型 | 3/3 | S2-04c1 只读来源摘要与备用链 | QC 修复预计文案 P1 |
| R1-S3A | 本书世界实例内容版本 | 5/5 | S3-03a1 实例 revision、双库迁移、四个写入口 | — |
| R1-S3B | 世界切片只消费当前实例版本 | 5/5 | S3-03a2 缓存指纹、legacy 退出、晚到结果拒写 | QA 退回未测的竞态/legacy 分支 |
| R1-S3C | 世界结构手动保存 CAS | 5/5 | S3-02b2 两视图共用受保护 PUT，冲突/未知保留草稿 | 先做限时 Spike S3-02b2s |
| R1-S3D | AI 结构补全幂等与费用边界 Spike | 2/2 | S3-02b3s 冻结 claim→CAS→未知恢复合同 | 只证明原型可行 |
| R1-S3E | 公开发布严格标签门 | 3/3 | R1-G01a 严格 `vX.Y.Z` 等于包版本才上传 | QC 两次退回：审计漏判 OR 旁路和额外上传 job |
| R1-S3F | macOS arm64 候选包装 CI | 5/5 | R1-G01b 同 SHA 只读候选 job；静态门 `PASS=11 / REVIEW=1` | 真实 Actions 未运行 |
| R1-S3G | 结构补全持久 claim/result 仓库 | 5/5 | S3-02b3a 双连接只一方获调用权；lease 到期记 unknown | Sprint 内修复“结果不明须等 lease”P1 |
| R1-S3H | 结构补全结果 CAS 提交 | 5/5 | S3-02b3b1 恰好一次提交、冲突保留、回执重放 | 自测中锁等待误报 unknown，已修复 |
| R1-S3I | 结构补全单次物理调用门 | 3/3 | S3-02b3b2a 单次模式最多一次供应商调用 | 统一调用预算另立 R1-PROMPT02 |
| R1-S3J | 结构补全模型→持久结果编排 | 5/5 | S3-02b3b2b claim→`model_in_flight`→result/失败/未知 | DoR 返工 1 次；QA 阻断：新解析分类波及普通 Prompt（1→3 次调用），加一行守卫修复；另立 R1-PROMPT03 |
| R1-S3K | 独立发行版发布目标与版本线 | 7/7 | R1-G02a major≥1 与 tag 碰撞门；R1-G02b 发布/更新只指向 fork | DoR 返工 2 次；QA 跟进项另立 R1-G02g |
| R1-S3L | 结构补全提交编排与失败原因保存 | 5/5 | S3-02b3c1 `runBackfill`/`readRunOutcome`，失败类别持久化 | 测试夹具无法承受后续迁移，PO 修订边界；QA 补 2 处测试缺口 |

## 经验

1. **先盘点全部真实写入口和消费者，再定合同。** 替换响应或加版本保护前没有列全调用方，是评审返工的首要来源（S2A、S3A）。
2. **行为测试按验收条件建矩阵**，覆盖完整、部分、缺失和竞态分支；测试总数全绿不能证明关键分支有证据（S2C、S3B）。
3. **既有缺陷另立卡**：边界拆分中发现的基线失败或相邻问题登记 Backlog，不塞进当前改动（S2D、S3I、S3J）。
4. **改共享模块前先列绕过方式**：改解析器、审计器、workflow 时，先列出全部调用方和反例，不要等验收时才补漏（S3E、S3J、S3K）。
5. **迁移证据分层**：schema validate、SQLite 运行时迁移、PostgreSQL apply 分开记录；迁移夹具按真实升级顺序执行（S2F、S3L）。
6. **静态 PASS 不等于平台成功**：workflow 文本与审计通过后，仍要留存真实 runner 架构、包装与安装证据（S3F）。
