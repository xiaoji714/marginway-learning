# 工程约定

## 结构

- `apps/extension`：MV3 浏览器入口、页面交互与服务适配器。
- `apps/cli`：Agent 与用户的 JSON CLI。
- `apps/native-host`：Chrome Native Messaging 进程，按安装 ID 校验来源。
- `packages/learning/core`：SQLite、版本化记录、任务、复习与上下文导出。
- `scripts`：构建、发布、安装、门禁。
- `skills`：Agent 使用说明。

依赖方向：应用依赖核心，核心不依赖浏览器或外部模型。扩展通过 Native Messaging 访问 SQLite；网络调用只在扩展服务进程中执行。

## 与参考工程一致的基线

TypeScript 源码、pnpm workspace、Node 22.23.2、Vitest + V8、tsc、esbuild、Lefthook。`src/` 是源码，`lib/` 是不入 git 的机械产物。所有包启用 strict 与 noUncheckedIndexedAccess，不允许 ts-ignore/nocheck。动态 RPC 负载在运行时按命令校验，因此 RecordData 保留 JSON 字段扩展能力；这不代替边界验证。

核心/CLI/Native Host 使用 tsc 输出 ESM、声明与 source map；浏览器入口用 esbuild 输出 Chrome 116+ 可执行脚本。发布时将 Node 入口 bundle 成无需 workspace 的 ESM，SQLite 使用 Node 内置模块。未引入参考工程专属的 DSH、容器部署或企业服务依赖。

## 测试与门禁

- 根 Vitest 单次发现所有 `tests/*.spec.ts`；测试偏好真实 SQLite/CLI/Native Messaging，mock 限在 Chrome、网络、时钟边界。
- packages 源码逐文件 statements/branches/functions/lines 四项100%；应用入口另由协议、UI与发布烟测覆盖。覆盖率扫描检查源文件完整性，不允许漏文件或通过排除业务代码满足指标。
- 关键输入守卫、跨资源授权、幂等写入、备份回滚、选词冻结均必须有反事实回归断言。
- pre-commit：whitespace 与 note 格式；pre-push：typecheck；全量 CI 运行 coverage、skill、文档、打包及安装烟测。
- 测试临时目录必须清理，不使用开发者真实学习资料库。

## 发布边界

仅 stage 白名单运行产物；新 checkout 从 lockfile 安装后可构建。不包含 API Key、个人截图、数据库、机器路径、固定扩展 ID。安装目录与 ID 由用户明确提供，桥接与 CLI 被复制到稳定 runtime，不依赖源码目录继续存在。

macOS 具有自动安装烟测；Linux/Windows 支持安装路径分支但未完成对应系统实机验收。不把配置脚本通过当成跨平台验收。

## 决策与协作

非平凡变更在 `.agents/notes/implemented/` 说明为什么、放弃什么、怎么验证。任务状态未来放 GitHub Issue/Project，不用本地进度文件替代。PR 进入 main，分支/worktree 隔离并行任务，不直接改上游参考项目。
