# Marginway 工程约束

- 本仓库承担开发职责：技术方案、实现、测试、打包和工程交付。产品与运营在独立的产品工作区维护；接收需求时将必要场景与验收条件写入工程 Issue/PR，不依赖私人工作区才能理解或构建工程。

- 所有产品与工程脚本源码使用 TypeScript；不提交 lib/dist/node_modules/coverage。
- pnpm workspace；Node 与 pnpm 版本以根 package.json 为准。
- apps 是入口，packages 是可复用核心；不引入企业参考工程的内部业务依赖。
- `pnpm run ci` 是交付门禁。测试真实入口，mock 只放外部边界；不删验证或放宽覆盖率来获得绿灯。
- API Key、学习数据库与个人截图不得提交；不得用真实笔记/复习记录做测试。
- 非平凡改动新增或更新 Agent Note，格式为 Status、为什么、决策、放弃了什么、怎么验证。
- main 只经 PR 更新。Issue 使用简短中文行动句；任务状态放 GitHub，不创建本地进度账本。尚未配置远程时不伪造 Issue/PR。
- 每个应用/包 README 说明 token 影响与已知限制。
- 遵守上游和图标许可证；去除运行依赖不等于抹除既有代码的版权归属。

- 协作与状态流转遵守 [开发流程](docs/development-process.md)；非平凡 PR 必须由实现会话派生只读 review subagent，复审最终 HEAD 后合并。
- 文档预算与事实归属见 [文档约束](docs/AGENTS.md)，决策记录见 [Agent Notes](.agents/notes/README.md)。
