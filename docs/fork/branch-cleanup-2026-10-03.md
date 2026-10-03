# 分支与本地临时文件整理

## 授权与范围

Owner 要求整理全部分支，合并有效成果，清理不再使用的分支与本地临时文件。基线为已验证的 `main` / `beta`：`3dcac245`。

盘点 6 个本地分支、27 个自有 `fork` 分支、41 个上游 `origin` 分支（不含符号 HEAD）。全部本地及 fork 功能分支均为本地主线祖先，没有独立成果需要再次合并。上游历史分叉保留，不为清理重新引入已被后续架构替代的代码。

## 备份与保护

私有恢复目录：`/Users/shawn/.codex/backups/AI-Novel-Writing-Assistant/cleanup-20261003-214849`。

- `all-refs.bundle` 保存 150 个 refs 及历史，45,398,459 bytes；bundle 校验通过，已在 `restore-check.git` 实际恢复并核对主线 SHA。
- `retired-files.tar.gz` 保存旧工作区、旧打包目录、历史日志及本次整合证据，913,799,535 bytes；逐文件核验 108,742 个文件，原始文件逻辑大小 2,403,784,412 bytes。
- `diagnostic-temporary-files.tar.gz` 另存 6 项诊断夹具文件，内容校验通过。详细路径、原始校验值及清理记录分别保存在该目录的 manifest、verification 与 actions 文件。
- 主目录的用户库、测试库、历史备份与配置保留；受保护的 11 个现有文件清理前后大小和 SHA-256 完全一致。
- 当前 `node_modules`、各 workspace 构建输出、今天的日志及开发启动准备信息保留。归档含数据库或配置，禁止将恢复目录上传到 GitHub 或公开附件。

## 本地清理

- 删除已合并分支：`codex/idea-input-dialog`、`codex/reasoning-setting-entry`、`codex/r1-s3i-single-attempt`、`codex/windows-installer-20261003`；本地只保留 `main` / `beta`。
- 退休 `r1-s3a-refinement` 与 `windows-installer` 工作区；后者使用应用归档工具，保留恢复入口。工作区所有文件已单独完成备份，包含数据库、日志和被 Git 忽略的内容。
- 清理旧 macOS 打包 staging、今天之前的日志、冲突比较快照、整合临时库与验证日志、诊断夹具、空测试目录和 Finder 元数据。没有整目录清空 `server/tmp`，没有执行数据库重置或迁移。
- 生成时的整合日志路径已归档到恢复目录中的 `integration-evidence` 条目；原工作区路径随退役不再作为交付入口。

## 安装包保存

盘点发现原工作区 ZIP 为 `1dcfa8b8` 的失败候选，但旁边独立 manifest 已被后续成功下载覆盖为 `d8226b3f`。两者不能混用。

- 成功包重新从已存在的 Actions run `37095959639` / artifact `11264123048` 下载到固定目录，没有重新编译。
- 目录：`/Users/shawn/Downloads/Biz-Novel-Studio/windows-d8226b3f`；EXE SHA-256 为 `3d96c418765e20729fc4c3fd50f44bb3f09dc1d8fb281cf8212240d644357c54`。
- ZIP SHA-256 为 `2ddfd2b49283d55497b197a658582d6c8fb2063a3a31083b630d04afcf85a253`，与 Actions 摘要一致；包内提交与成功安装验证状态匹配。
- 失败候选移到上述私有恢复目录的 `windows-1dcfa8b8-failed-verification`，并保留在工作区恢复档案中，不能当作可交付成功包。
- 成功包仍来自旧源码 `d8226b3f`，不包含当前主线全部改动；页面和真实模型验收仍由 Owner 完成。

## 远端清理事务

仅操作自有仓库 `shown1985/AI-Novel-Writing-Assistant`（remote `fork`）。将本地 main/beta 同步与 25 个功能分支删除放在同一次原子推送；推送前逐项检查远端 SHA 未变化、全部待删除头均已进入本地主线。无开放 PR。保留上游所有分支和现有 tags，不执行 force、rebase、公开 tag 或安装包发布。

清理分支清单：

```text
claude/confident-cori-w3ctnw
codex/agent-runtime-control-plane
codex/desktop-native-isolation
codex/llm-selection-hydration
codex/macos-runtime-acceptance
codex/macos-wgr-acceptance
codex/opencode-glm-thinking-toggle
codex/opencode-header-transport-test
codex/server-authoritative-task-selection
codex/windows-installer-20261003
codex/world-assessment-score-contract
codex/world-generation-budget-observability
codex/world-generation-budget-runtime
codex/world-generation-opencode-capability
codex/world-generation-opencode-session
codex/world-location-prompt-contract
codex/world-presentation-context-contract
fix/world-generation-adaptive-retry
fix/world-generation-budget-preflight
fix/world-generation-budget-telemetry
fix/world-generation-checkpoints
fix/world-generation-prisma-harness
fix/world-generation-runtime
fix/world-generation-staged
mac
```

8 个非祖先上游分支保留：`Chapter-Management`、`Writing-Formula`、`chore/snapshot-20260302`、`codex/history-main-20260316`、`new_edit_novel`、`work_fix` 属于旧架构；`codex/desktop-dev` 的净分叉是旧文档；`codex/pr30-stability-slice` 是早期稳定性切片，不能直接重新覆盖当前模块。

## 验证与 Review

本次仅增加维护记录及 Wiki，产品代码与 `3dcac245` 完全相同。复用该整合阶段的构建、运行契约测试和独立 QA，不重复全量构建或桌面打包。文档 manifest 与 Git 差异检查通过；远端事务完成后核对只剩 main/beta、头提交一致，实际结果写入恢复目录的 `remote-after.txt`。

本地 main 的跟踪目标统一为 `fork/main`，默认推送 remote 为 `fork`；上游更新继续显式读取 `origin/main` 并走同步分支，避免将独立发行版的日常推送误发上游。

收尾提交使用 `[skip ci]`，避免此次仓库整理触发与任务无关的介绍网站部署；依据 [GitHub 的 push 工作流跳过规则](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)。没有添加新的 CI 例外或改变 workflow。当前差异属于内部维护，无额外用户发布说明；稳定退役规则沉淀到分叉整合 Wiki。
