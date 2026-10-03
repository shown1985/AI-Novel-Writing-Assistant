# 世界 Prompt 模块边界

## 背景

世界能力最初集中在 `world.prompts.ts`。随着资产增加，单文件同时承担灵感提炼、结构生成、维护审校、导入和展示抽取，超过项目的硬性文件长度阈值，也让后续世界维护链难以确认修改范围。

## 决策

`world.prompts.ts` 仅作为稳定兼容门面。业务服务和 Prompt Registry 继续从门面导入；资产实现按能力责任放入以下目录：

- `inspiration/`：参考作品拆解、概念卡及属性选项。
- `generation/`：根据本书主题生成世界种子。
- `structure/`：分层生成、本地化、分区补全和世界公理。
- `maintenance/`：深化问题、一致性审校和既有结构回填。
- `transfer/`：外部世界文本导入抽取。
- `presentation/`：只面向可视化展示的数据抽取。

`world.promptTypes.ts` 与 `world.promptSchemas.ts` 保持为世界 Prompt 的共享输入和输出合同；`worldDraft.prompts.ts` 属于独立草稿链，不在此门面内迁移。

## 当前规则

1. 新增或迁移世界 Prompt 时，先选择明确能力目录，不向门面堆实现。
2. 产品级 Prompt 仍必须通过 Prompt Registry 注册，资产 `id`、`version`、`taskType`、`mode`、`contextPolicy` 与结构化 `outputSchema` 都是稳定合同。
3. 服务只能通过 `world.prompts.ts` 门面消费这些资产；不得跨能力目录深度导入内部实现。
4. 能力拆分不得改变 Prompt 文本、Runner、预算、遥测、JSON repair 或业务 Runtime 行为。
5. 仅被单一能力使用的后处理规则留在对应能力模块，不建立无所有权的 `helpers` 或 `utils`。

## 失败模式

- 服务直接导入子目录会把文件布局变成跨模块合同，后续移动资产时造成大范围修改。
- 同一资产在多个目录重复声明会让 Registry 元数据和运行时实际加载对象分叉。
- 为了缩短文件而把后处理函数放进通用 helper，会掩盖规则真正属于哪个 Prompt 能力。
- 修改目录时顺手调整 Prompt 文本或 schema，会让纯架构迁移失去等价性证据。

## 相关模块

- 兼容门面：`world.prompts.ts`
- 共享输入：`world.promptTypes.ts`
- 共享输出：`world.promptSchemas.ts`
- Registry 加载：`../../registry/promptAssetLoaderEntries.ts`
