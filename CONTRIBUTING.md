# 贡献指南

使用 Node 22.23.2 与 pnpm 11.22.0，从 lockfile 安装依赖。所有源码使用 TypeScript。

先用简短 Issue 说明用户遇到的问题，再从独立分支/worktree 提交 PR。PR 描述最终行为、验证方式和限制；非平凡改动附 Agent Note。main 不直接提交。Issue 状态、标签、评审与合并规则见 [开发流程](docs/development-process.md)。

提交前运行 `pnpm run ci`。API Key 只在浏览器设置中输入，任何 PR、日志、截图、测试 fixture 都不得包含真实密钥或学习记录。

测试使用临时 SQLite；不要把开发者本机数据库纳入测试。不降低覆盖率门禁，不靠排除文件掩盖漏测。
