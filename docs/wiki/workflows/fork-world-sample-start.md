# 从世界样本开始创作

## Background

新手可能先对世界设定产生兴趣，再寻找人物与故事开局。如果必须先离开样本库、创建小说、再找世界选择器，会丢失创作来源，也增加重复选择。只把世界名称传给模型同样不足：名字不能表达规则代价、阵营压力和地点冲突。

## Decision

世界样本是自动导演的开书来源之一。列表上的“基于这个世界创作”进入既有自动导演创建页，并通过 `worldId` 带入参考样本。作者可先让 AI 提供开局灵感，也可写自己的想法，然后沿用方向候选与确认流程。打开页面不会自动发起模型调用。

## Current Rule

- 起始页展示实际选中的世界及手册入口，生成灵感沿用现有结构化 AI 能力；不另建世界开书生成链路。
- 无任务的新来源可以初始化世界选择；已有本地草稿（包括作者主动清除世界的选择）优先于来源参数。已创建任务的保存状态拥有最高优先级，不能被 URL 覆盖。
- 来源世界参与草稿隔离。不同样本与普通开书不可互相覆盖；无世界来源的历史草稿键继续兼容。
- 世界来源变化应重建页面状态，并使旧页面异步回调失活，避免旧任务创建响应导航回原来源。单纯创建任务并更新 `taskId` 不应重建页面，否则会打断候选生成；世界选择改变也要清空旧灵感并丢弃迟到响应。
- 开局灵感、故事星图与候选生成读取服务端样本内容，采用有长度边界的规划参考。外部名称不能代替服务端规则、势力、地点和冲突；生成失败后的重试和定向调整仍受同一世界约束。
- 指定的样本不可用时，应明确报错并让作者重新选择或清除世界，不能静默换成其他世界。
- 开书前的上下文读取只读样本，不创建本书世界、不写样本。确认小说后，沿用本书世界准备阶段建立独立副本与切片；章节生产继续使用 `WorldContextGateway`，不会直接依赖库中样本。

## Failure Modes

- 来源参数改变而页面状态未重置，会把样本 A 的想法保存到样本 B 的草稿中。
- 每次渲染强制使用 URL 世界，会覆盖作者换选或清除的选择，并污染任务恢复。
- 只在第一次灵感生成附加样本，后续候选或单项调整容易脱离原世界规则。
- 在规划读取时调用生产 Gateway，会提前创建副本和切片，导致“浏览/选方向”产生未确认的写入。

## Related Modules

- `client/src/pages/worlds/WorldList.tsx`
- `client/src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx`
- `client/src/pages/novels/autoDirector/draft/`
- `server/src/services/world/WorldService.ts`
- `server/src/services/novel/director/idea/`
- `server/src/services/novel/director/phases/novelDirectorCandidateStage.ts`
- [自动导演本书世界准备](./auto-director-world-setup.md)
