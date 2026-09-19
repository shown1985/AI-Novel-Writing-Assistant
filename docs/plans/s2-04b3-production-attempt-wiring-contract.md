# S2-04b3：真实 transport attempt 接线合同

## Story 合同

- Release / Sprint：Release 1 / R1-S2F。
- 状态 / 点数：In Progress / 5 点。
- 用户价值：作者和后续诊断能力能区分一次请求中的重试、策略切换、修复、语义重试与备用模型，并知道最终采用了哪次真实结果。
- 依赖：S2-04a、S2-04b1、S2-04b2、R1-PROMPT01 已 Done。
- Owner：模型平台 Agent。根集成人只做计划、review、文档集成和阶段提交。

## 冻结决策

1. transport 终态与候选采用是两个维度。每次物理调用先完成 `succeeded / failed / cancelled`，只有 post-validate 或语义协调完成后才写 `adopted / not_adopted`；最终采用者唯一。
2. recorder 是 best-effort 旁路。内部执行结果携带 `evidenceStatus: complete | partial | missing` 和脱敏 issue；记录失败不得改变调用、返回值、重试或上层任务状态。
3. production ownership 覆盖 text invoke/stream、structured invoke/parser/repair、structured stream 和语义协调器中的真实 transport；不得只包裹测试 seam 或 facade。
4. 本卡只关联 S2-04a 已存在的 `provider / model / modelRoute / strategy` 来源证据，不实现字段级完整 provenance。
5. request scope 在一次业务执行内稳定；每次物理 transport 调用前分配递增 attempt index，并用 lineage role/parent 表达 `primary / transport_retry / strategy_retry / fallback / json_repair / semantic_retry`。

## 范围与非范围

范围：

- 建立 request context、recorder 和生产 repository provider。
- 接入 text invoke/stream 与 structured invoke/stream 的每次物理调用。
- 记录解析/修复/语义重试 lineage、实际 provider/model、终态、采用结果；usage 缺失可为 `null`。
- recorder start/finalize 失败降级为证据状态，不阻断业务。

非范围：

- 不做调用历史读取 API、UI 或来源页展示。
- 不做 04b4 的小说/章节/任务身份归属；未归属保持 `unattributed / legacy_unknown`。
- 不改变 retry、fallback、repair、semantic 策略或次数。
- 不修改 attempt schema、迁移、repository/store 语义，不保存 prompt 正文、密钥或未脱敏错误载荷。

## 验收标准

1. text invoke/stream 成功、失败、取消或提前停止都产生一条终态 attempt；usage 缺失不伪造数值。
2. transport retry、strategy retry、fallback、JSON repair 和 semantic retry 每次物理调用分别记录，角色与父子关系正确。
3. transport 成功但被校验拒绝的候选为 `succeeded + not_adopted`，最终候选为唯一 `adopted`。
4. recorder start/finalize/repository 故障不会改变模型调用次数、结果、原错误或工作流状态，内部证据状态准确降级。
5. 并发请求上下文隔离；持久证据不含 prompt 正文、API key 或未脱敏敏感错误。
6. 无模型调用的读取路径不创建 attempt。

## 最窄验证

- 聚焦测试覆盖 text success/null usage、stream complete/abort/early stop、strategy/transport/fallback、JSON repair、semantic retry、repair→semantic parent、recorder 两阶段故障、并发隔离、脱敏和零模型读取。
- 运行 attempt repository/prototype 回归与 server typecheck/build 中覆盖改动文件的最窄检查。
- 本卡无 UI，Computer Use 不适用。
