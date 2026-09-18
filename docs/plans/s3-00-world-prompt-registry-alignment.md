# S3-00：世界 Prompt 静态登记一致性门

## Story 结果

- Story：S3-00，2 点，R1-S2C。
- 状态：Done。
- 用户价值：世界生成与其他既有 Prompt 使用唯一、可审计的真实版本；静态登记错误不能继续被 Registry 的运行时重绑定掩盖。
- Owner：根集成人；共享 Registry loader 与 Prompt 治理测试保持单一 owner。

## 范围与非范围

本卡只统一 `PromptAsset` 已声明版本、loader 静态 key 和既有消费者测试，并增加覆盖全部 loader entry 的静态一致性门。检查直接加载资产并比较 `buildPromptAssetKey(asset)`，同时拒绝重复声明，因此不依赖 Registry 的运行时容错才能通过。

本卡没有修改 Prompt 文案、schema、模型选择、Runner、repair 或 semantic retry 行为；没有拆分 `world.prompts.ts`、迁移 `worldDraft.prompts.ts`、补充 management/context 元数据或实现世界维护能力；没有调用真实模型或写入数据库。

## 对齐结果

全量检查除最初的世界主题版本漂移外，还发现 8 处已升级资产仍保留旧 loader key。所有方向均以资产源码中已经声明的版本为权威，没有降级资产：

| Prompt | 原 loader key | 资产真实 key / 统一结果 |
| --- | --- | --- |
| `novel.chapterHook.generate` | `v1` | `v2` |
| `novel.character.castOptions` | `v2` | `v3` |
| `novel.character.castAuto` | `v1` | `v2` |
| `novel.character.castAuto.members` | `v1` | `v2` |
| `novel.character.supplemental` | `v1` | `v2` |
| `novel.create.resource_recommendation` | `v1` | `v2` |
| `style.detection` | `v1` | `v2` |
| `style.rewrite` | `v1` | `v2` |
| `novel.world.generate_from_theme` | `v2` | `v3` |

世界主题资产的 `v3` 是加入战力体系决策后的有意升级。其模型选择、一次性 JSON 容量和零 repair attempt 行为保持不变；测试改为断言真实 `v3`。

## 验收证据

在本卡最终源码上执行：

```text
pnpm --filter @ai-novel/server build
PASS

node --test --test-name-pattern='prompt loader declarations match the assets they load and remain unique' server/tests/prompting-governance.test.js
1 passed, 0 failed

node --test server/tests/novelWorldModelSelection.test.js server/tests/prompting.test.js
55 tests: 53 passed, 2 skipped, 0 failed
```

验收覆盖：

- 所有 loader 声明 key 等于实际加载资产的 `id@version`；
- loader 声明全局唯一；
- 世界主题模型选择与 Prompt 容量合同继续成立；
- Registry 版本列表和直接按版本取资产的消费者测试使用真实版本；
- server build 通过。

## 发现但未换入 Sprint 的治理债

完整 `prompting-governance.test.js` 还报告既有 `server/src/services/comic/ComicFactService.ts` 直接构造 `SystemMessage` / `HumanMessage`，不属于本卡的版本对齐范围。它没有被顺手迁移，也不影响本卡新增静态 loader 检查的通过；应在后续 Refinement 中建立独立 PromptAsset / Runner 迁移 Story 后处理。

## 解锁结论

S3-01 的静态版本前置门已解除，可进入 Ready。其 3 点范围仍只拆分 `world.prompts.ts` 的 14 个资产、保持旧 named exports，并补齐既定 Registry/management/context 治理；`worldDraft.prompts.ts` 留在原位。S3-00 完成不代表 S3-01 或任何世界维护用户能力已经交付。
