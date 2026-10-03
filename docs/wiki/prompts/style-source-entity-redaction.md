# 写法合同的原作实体脱敏

## 背景

写法引擎可以从拆书样本中提取写法特征。样本里的原作人名、地名、称号、书名如果随写法要求进入正文生成 Prompt，AI 容易把这些专有名词写进用户自己的小说，形成照搬风险。这是面向新手的产品底线：用户无法自行识别和清理这些名词。

2026-08 的一次上下文块迁移（`f056815b`）删除了旧的 `buildStyleEngineBlock()`。旧函数优先读取脱敏后的写作指导，新的 `style_contract` 上下文块改为直接读取 `compiledBlocks.contract`，而脱敏函数当时只生成旁路字段 `sanitizedGenerationProfile`，没有改写合同本身。结果是生成前的脱敏静默失效，只剩生成后的泄漏检测兜底。

## 决策

脱敏必须作用在下游真正读取的数据上，而不是生成一个需要各调用方主动选用的旁路字段。`sanitizeStyleContextForGeneration` 直接返回合同六个段落（narrative、character、language、rhythm、antiAi、selfCheck 的 summary、lines、text）都已隐去原作实体的 `compiledBlocks.contract`。

## 当前规则

- 任何把写法合同送入正文生成、验收、改写候选、改稿意图等 Prompt 的路径，都必须使用经过 `sanitizeStyleContextForGeneration` 处理后的上下文。
- 新增或迁移上下文块时，如果改变了写法内容的读取字段，必须确认新字段仍然经过脱敏；不得只依赖生成后的 `detectForbiddenStyleEntities` 泄漏检测。
- 脱敏属于确定性安全保护，允许使用固定实体列表替换；它不承担意图识别或写法判断。
- `StyleContract` 新增承载文本的段落时，要同步加入脱敏范围。

## 失败模式

- 表现：用户参考拆书写法生成的正文里出现原作角色名或地名。
- 排查：先确认写法上下文是否经过 `sanitizeStyleContextForGeneration`；再确认 Prompt 实际读取的是哪个字段，以及该字段是否在脱敏范围内。
- 守护测试：`server/tests/styleGenerationSanitizer.test.js` 通过 `buildWriterStyleContractText(sanitized.compiledBlocks.contract)` 断言原作实体不会出现在写作合同文本中。

## 相关模块

- `server/src/services/styleEngine/styleGenerationSanitizer.ts`
- `server/src/prompting/prompts/novel/context/chapterContextBlocks.ts`（`style_contract` 上下文块）
- `server/src/services/styleEngine/styleContractText.ts`（`buildWriterStyleContractText`）
- `shared/types/styleEngine.ts`（`StyleContract`、`StyleContractSection`）
