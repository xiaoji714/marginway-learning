# 开发流程

## Issue 与 PR

GitHub Issue 是任务及验收状态的唯一来源；本地文档只记录契约与决策。Issue 用中文行动句命名，有且只有一个 `type/bug|feature|task|research` 标签。PR 有且只有一个 `kind/fix|feature|maintenance|docs`，至少一个 `area/extension|core|agent|tooling|docs`。

PR 正文使用 `Refs #N` 关联同仓 Issue；仅完整满足 Issue 验收才使用 `Closes #N`（或 Fixes/Resolves）。部分实现用 Refs，发布/真实浏览器验收未完成的父事项保持打开。policy 校验关联对象确实是 Issue、类型和状态标签，但验收是否满足由评审判断。修改关联 Issue 后重新运行 PR 的 Issue policy 检查。

## 轻量状态机

使用 Issue 的唯一 `status/*` 标签，不引入 Project 或 PAT：

`inbox → ready → in-progress → in-review → done / no-action`

开放状态由维护者选择标签，可以退回任何开放状态表示重新规划或返工；Issue lifecycle 消除重复状态。关闭为 completed 自动得到 done，关闭为 not_planned 得到 no-action，重新打开回到 inbox。终态只由 Issue 的真实关闭状态决定，不能通过标签提前完成。

Issue lifecycle 是唯一自动写状态的工作流，基于最新 API 状态进行归一化，不复用事件中的旧快照。GitHub 可能合并排队事件；漏事件或失败时从 Actions 手动输入 Issue 编号重新同步。PR 开关不自动推导 Issue 状态，避免多个 PR 共用一个 Issue 时错误关闭或回退。开始工作和进入评审时由维护者更新对应标签。

## 交付门禁

每个 PR 使用独立分支/worktree；禁止直接修改 main，禁止 raw force push。GitHub-hosted 三平台 verify 后由 `pr-gate` 汇总，任何失败、取消或跳过均拒绝。另要求 Issue policy 和评审讨论解决。分支规则定义于 [.github/main-ruleset.json](../.github/main-ruleset.json)，修改后通过 GitHub API 应用并读回验证；文件本身不会自动改变远端保护。管理员先运行 `pnpm exec tsx scripts/setup-governance.ts labels`，确认 PR 上已产生两个检查后运行 `pnpm exec tsx scripts/setup-governance.ts rules`；脚本仅更新本仓同名规则集并读回有效规则，不覆盖其他规则集。

单人维护不要求其他 GitHub 账号审批。非平凡 PR 由实现会话派生只读 review subagent，审查最终 diff、测试与边界；记录精确 HEAD SHA 和结论。新增提交使旧结论失效，修复后复审再合并。此项是操作约束，当前不伪装成自动检测已完成的检查。

Issue policy 在 PR 上仅持有只读 token，不接触密钥或写权限；修改治理脚本和工作流必须在独立评审中特别检查，不能把 PR 内的策略检查当作防恶意贡献者的隔离边界。Issue lifecycle 只运行 main 的代码，不运行 PR 代码。所有仓库门禁的策略变更都须由维护者评审。

## 测试与运行成本

`pnpm run ci` 单次构建、类型检查、聚合覆盖率、文档/包入口检查及发布安装烟测。独立 typecheck/test:coverage/package 命令仍自行构建；`:built` 入口供已构建的 CI 使用。每个 workspace 包必须有 test 脚本和根 Vitest 可发现的 tests/*.spec.ts；这只防止漏接测试，不代表覆盖全部行为。新增包同步检查 Vitest 发现范围。

main 合并与发布分离，版本及草稿发布见 [releases.md](releases.md)。文档与 Note 规则见 [文档约束](AGENTS.md) 和 [Agent Notes](../.agents/notes/README.md)。
