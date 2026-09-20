# R1-S2H Sprint 承诺：实况模型来源可见

## Sprint Goal

作者在实况窗口中能看懂本次模型调用的预计选择、实际采用结果和备用链；读取证据不会改变配置、任务或生成结果。

- 基线：`codex/r1-s2h-model-provenance-ui` 从 `beta@92a39f5b` 创建。
- 承诺：`S2-04c1`，3 点。
- Stretch：无。
- 当前结果：代码与自动化验证完成，但 Computer Use 因 macOS 锁屏阻塞；Story 保持 User Acceptance，Sprint 完成点数 `0/3`，不得标记 Done。
- 容量依据：上一窗口虽完成 8 点，但本卡首次增加 public DTO、HTTP read adapter 与 UI 接线；为防止调用历史、任务投影和全局组件膨胀，本 Sprint 只承诺一个 3 点垂直切片。
- 产品边界：只接 `LiveExecutionDialog`；Task Center、任务抽屉、全局历史查询、S3 与 RC 全部不进入本 Sprint。

## Definition of Ready

- Story ID、Release/Epic、用户价值、3 点估算、范围/非范围、依赖、AC、owner/file 边界和最窄验证已写入 [S2-04c1 合同](./s2-04c1-live-model-provenance-contract.md)。
- `S2-04b4` 已 Done，内部 read projection 的 found/not_found/error 与 attributionStatus 语义已通过 Terra 验收。
- 公共 endpoint、DTO 白名单、live requestId 显式传播和唯一 UI 接入点已冻结；内部 projection 不直接序列化。
- 不需要 schema/migration、任务状态写入或新的模型调用。
- 单一 Luna xhigh 全栈 Agent owner 串行修改本卡代码；根 Agent 只做 PO/Scrum/QA 与集成。QC 使用 Terra medium。

## 执行 Wave

### Wave 1：公共只读边界

- shared DTO 与 `LlmLiveContext.requestId`。
- server public mapper/GET route。
- mapper、route、零模型/零写入及显式 requestId 传播测试。

退出门：服务端能以 requestId 返回脱敏 found/not_found/error，且失败不泄漏内部错误；没有任何 UI 或业务写入可掩盖服务端缺口。

### Wave 2：实况展示

- client read API、只读来源组件与 `LiveExecutionDialog` 接线。
- 预计/实际/备用/未知/error 文案和低边框详情。
- stale response、切任务/session/requestId、脱敏行为测试。

退出门：shared/server/client 聚焦检查通过，并由 Terra 进行代码级验收。

### Wave 3：用户验收与收口

- Computer Use 在隔离运行目录验收成功与 fallback/fixture 场景、详情展开和切换隔离。
- 处理验收缺陷；不顺手接任务抽屉或运行记录。
- Review/Retrospective、Wiki 判断与用户可见 release notes/README 更新；阶段提交后再进入 beta 组合验证。

## Sprint 验收门

- 自动化：shared/server/client build/typecheck 与合同列出的聚焦行为测试 PASS。
- 行为：实际模型来自持久 adopted attempt，不来自当前设置或 live label；fallback lineage 有序且脱敏。
- 只读：查询计数可证明零模型调用、零配置/attempt/task 写入。
- 隔离：两个 request/task/session 切换不串线，迟到响应不能覆盖当前显示。
- UI：Computer Use PASS；若 UI 尚未验收，Story 保持 User Acceptance，不得 Done。

当前验收证据：shared/server/client build/typecheck PASS；server 聚焦 `5/5`、client 最终 `4/4`，Terra QC 已修复预计文案 P1 并复验 PASS。Computer Use 真实尝试因 macOS 锁屏 FAIL/blocked；未使用真实库或付费模型，隔离 fixture 已移除，相关服务已停止。

## 明确不承诺

- 原 `S2-04c` 父范围中的 Task Center、`NovelTaskDrawer`、全局历史读取和按 novel/task 反查 request；这些保持 Refinement，后续另行估点。
- S3-03～06、原 S3-02b 其余旧入口、R1-RC01～04。
- schema/migration、旧记录回填、真实模型质量抽样、付费 fallback 验收。
- 配置写入、生成/重试/恢复/取消动作或 Task Center 操作面。

## Review 与 Retrospective 出口

- Review：逐条记录 7 项 AC、自动化结果、Computer Use 场景、未覆盖入口和 beta 组合验证状态。
- Retrospective：记录承诺/完成点数、carryover 原因、返修与最多两项流程改进。
- 当前验收状态：代码切片完成，用户验收未完成；承诺/完成 `0/3`。Sprint 尚未关闭，Computer Use 环境阻塞是当前未完成原因，不提前记为 carryover。完成 `S2-04c1` 只代表实况窗口切片完成，不代表原 `S2-04c` 父范围、Release 1 或发布门通过，也不自动启动下一 Story。
