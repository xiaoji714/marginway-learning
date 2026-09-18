# Agent Note: 轻量工程治理

Status: implemented

## 为什么

本地 PR 约定不能阻止 main 直推，文档预算仅覆盖三个文件；新增模块和决策记录需要随工程增长持续检查。

## 决策

使用 GitHub-hosted 三平台 CI、稳定 pr-gate 和独立 Issue policy。Issue 用标签承载开放状态，由 main 上的 lifecycle 工作流归一化和推导关闭终态。PR 关联同仓 Issue，区分引用与完成验收。文档预算覆盖全部非 Note Markdown，Note 按简单生命周期检查；每个包检查测试入口。非平凡 PR 独立 Agent 审查精确 HEAD。CI 构建与聚合测试各执行一次，独立开发命令保持自包含。

## 放弃了什么

不引入 Project PAT、自托管 runner、复杂 CI 路径裁剪、强制堆叠 PR 和六类 Note 目录。PR 不自动推导 Issue 状态，避免多 PR 关联时误操作。PR policy 是只读检查，治理逻辑变化由维护者审查，不把它宣称为抵御恶意策略篡改的信任边界。

## 怎么验证

策略测试覆盖缺失标签/关联/Note、状态回退和关闭原因、未登记/超预算文档及 Note 状态不一致。完整 CI 验证三平台构建、类型、覆盖率、文档与安装烟测；远端 ruleset 应用后读取实际分支规则，并在真实 Issue 上验证关闭及重新打开状态。远端结果记录于 PR，人工 Agent review 不是自动化门禁。
