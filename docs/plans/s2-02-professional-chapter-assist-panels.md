# S2-02：专业章节辅助区域按需展开

## Story 结论

- Release / Sprint：Release 1 / R1-S2A。
- Story：S2-02 专业章节辅助区域按需展开（3 点）。
- 用户价值：作者进入专业章节编辑器时先获得安静、完整的正文空间，需要参考资料或 AI 修改帮助时再展开对应区域。
- 当前状态：`Done`。行为检查、client typecheck 与隔离环境 Computer Use 验收均通过。

## 已实现边界

- 正文默认可见；“章节参考”和“AI 协作”是带 `aria-expanded` / `aria-controls` 的独立开关，宽屏可同时展开。
- 720px 窄屏一次只保留最近打开的一个辅助层；正文区域在辅助层打开时进入 `inert`，不会形成可见层之后仍可聚焦的第二操作层。
- 章节编辑 session 以 `novelId + chapterId` 为稳定身份，不再把 `updatedAt` 放进 React key。同章查询刷新不会因时间戳变化重挂载编辑器。
- 折叠或重开辅助区不重建正文编辑器，也不清除草稿、选区、修订指令、候选或当前候选身份。
- 章节诊断 workspace 属于可能调用模型的能力：页面挂载不请求；首次打开任一辅助区或显式发起修订时才按当前章节身份解锁。查询结果在该章节 session 内保持 fresh，折叠重开不重复生成；切章后必须重新显式打开。
- 仅选择正文只显示现有浮动修订入口，不发送请求；点击具体修订动作后才打开 AI 协作区并发送一次既有 preview 请求。
- 同章服务器正文变化时，干净且无待确认修订的编辑器可同步；存在脏稿、选区、修订指令、问题定位或候选时显示冲突，默认保留本地工作。作者可显式选择继续使用草稿或载入外部正文。
- 保存冲突未处理前不可直接覆盖；保存失败仍保留草稿并提供重试，预览失败仍保留原稿和“再生成 / 拒绝全部”。
- 未开放简易页改稿，未新增生成服务，未修改修订权限、审校判定或章节版本回退。

## 代码级证据

```text
node --experimental-strip-types --test \
  client/src/pages/novels/components/chapterEditor/chapterEditorSessionState.test.mjs \
  client/src/pages/novels/components/chapterEditor/chapterEditorUtils.test.mjs
结果：10/10 通过

pnpm --filter @ai-novel/client typecheck
结果：通过

git diff --check
结果：通过
```

行为检查覆盖：workspace 请求身份隔离、宽屏独立开关、窄屏互斥、同值刷新、干净外部同步、脏稿/修订冲突、选区请求精确范围、整章请求不携带旧选区，以及候选只替换目标片段。

## Computer Use 验收证据

- 日期：2026-09-17。
- 环境：当前功能分支源码；`127.0.0.1` 本地 client/server；独立临时 SQLite `/tmp/ai-novel-s2-02-ui.Hnfw3w/ui.db` 与独立 app-data，不读取或修改用户数据库。
- 1440px 宽屏初始只显示正文，两个辅助区均为 collapsed；两者可独立展开并同时存在。
- 输入未保存正文和修订指令后，键盘关闭/重开辅助区，草稿与指令保持；仅选择正文后服务端没有新增 HTTP 请求。
- 首次显式点击选区“AI 优化这段”后，AI 协作区自动展开；隔离环境没有可用本地模型，preview 明确失败，但原稿、失败说明和“再生成 / 拒绝全部”保持可见。
- 720px 窄屏先打开章节参考，再打开 AI 协作时，前者自动关闭；折叠重开后草稿与指令保持，页面 `scrollWidth=clientWidth=720`。当前辅助层打开时，正文不再出现在可访问树中。
- 从第一章切到第二章后，两个辅助区恢复关闭，前一章的草稿、指令和修订 session 不进入第二章。
- 修正按需查询后重新计数：页面首次加载没有 `editor/workspace` 请求；首次展开章节参考产生且只产生一次 workspace 请求；折叠重开与纯选区均为零新增请求；显式修订只产生一次既有 `ai-revision-preview` 请求，没有额外 workspace 请求。
- 浏览器 console `warn/error` 为 0。服务端记录的模型失败来自隔离环境未配置 DeepSeek、未运行本地 Ollama，是本次失败保持验收的预期条件；没有真实付费模型调用。

## Wiki 与发布判断

- 稳定的 session 身份、外部正文冲突和 AI workspace 按需调用边界已写入 [章节生产链路](../wiki/workflows/chapter-production-chain.md)。
- 本 Story 改变用户可见的章节编辑布局和操作时机，需要更新 Release Notes 与 README 最新更新。
- 本 Story 只完成 S2-02；不代表 R1-S2A、Release 1、beta 集成或公开发布完成。
