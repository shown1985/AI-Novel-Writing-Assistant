# S2-04b2 Prompt execution 边界拆分完成证据

## 结论

S2-04b2 已完成。`promptRunner.ts` 保留原有公开 facade 与测试注入入口，context、text invoke/stream 和 structured parse/postValidate/semantic retry 已进入明确责任模块；本 Story 没有接入 attempt store，也没有改变模型选择、预算、重试、备用、repair、semantic retry、live 或 usage 规则。

UI 验收不适用：本 Story 是服务端内部等价拆分，没有新增或改变用户界面。

## 边界

- `promptRunner.ts`：稳定公开 facade、结构化 transport/stream 接线、请求预算、质量遥测和测试注入。
- `execution/promptExecutionContext.ts`：注册校验、上下文选择、slot overlay 和调用元数据。
- `execution/textPromptExecution.ts`：text invoke/stream、live session、reasoning 与 token usage 汇聚。
- `execution/structuredPromptExecution.ts`：流式结构化解析、空流 fallback、repair 阶段回调、postValidate 和 semantic retry。
- `execution/index.ts`：模块内 facade；业务调用方继续只从 `promptRunner.ts` 导入，当前不存在跨模块深导入。

非范围保持不变：没有引用 ModelAttempt repository/recorder，没有新增 Prompt，没有修改模型参数、错误分类、重试次数或 fallback 策略，也没有开始 S2-04b3。

## 验收证据

- `promptRunner.ts` 从 1348 行降至 668 行，低于 1300 行硬阈值。
- 拆分前后的 7 个公开导出一致：`preparePromptExecution`、四个 run/stream 入口与两个测试 setter。
- server TypeScript build 通过。
- Prompt runner、text/structured invoke/stream、semantic retry、live、usage、slot/template overlay 聚焦回归共 59 项：57 passed、2 skipped、0 failed；两项 skip 为原测试显式跳过，不是失败或降级隐藏。
- `git diff --check` 通过；Prompt execution 目录对 ModelAttempt/attempt store/recorder 的禁止引用扫描为 0。

执行命令：

```bash
pnpm --filter @ai-novel/server build
node --test server/tests/prompting.test.js server/tests/structuredOutputHint.test.js server/tests/novelWorldModelSelection.test.js server/tests/characterDialogue.test.js
```

## 已知基线与范围判断

补充运行 `node --test server/tests/structuredInvoke.test.js` 得到 20 passed、1 failed。失败项是既有 transport retry 基线：服务商 overload 异常被包装为 `empty_content` 后未进入同模型重试。`structuredInvoke.ts`、其 parser 与该测试相对 S2-04b2 开发基线均为零 diff，S2-04b2 的 runner 等价回归也全部通过，因此不把这项既有策略缺陷并入纯拆分 Story。

该缺陷已登记为 `R1-PROMPT01` Refinement，等待单独冻结错误分类与 retry/strategy 顺序后再排期。S2-04b2 不以顺手改策略的方式扩大范围。

## 文档与发布判断

- 稳定模块边界已写入 `server/src/prompting/README.md`，既有 Wiki 的 Prompt execution 分层规则继续有效。
- 本 Story 不改变用户可见能力或交互，README `最新更新` 与 release notes 无需修改。
