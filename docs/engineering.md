# 工程约定

## 结构

- `apps/extension`：MV3 浏览器入口、页面交互与服务适配器。
- `apps/cli`：Agent 与用户的 JSON CLI。
- `apps/native-host`：Chrome Native Messaging 进程，按安装 ID 校验来源。
- `packages/learning/core`：`domains/` 按资源、笔记、词汇复习、讨论、任务、备份划分；`repository.ts` 封装存储，`store.ts` 维护查询、事务和幂等分发，`capabilities.ts` 负责能力发现。
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

GitHub-hosted Linux/macOS/Windows 执行隔离安装烟测。Windows 烟测跳过真实注册表写入；自动化脚本通过不等于 Chrome UI 和桥接注册的跨平台实机验收。版本与草稿发布见 releases.md。

## 开发入口

源码获取和首次安装见 [安装说明](installation.md)。`pnpm run ci` 是完整门禁；日常使用 build、typecheck、test、test:coverage、doc-sync。升版与 package 见 [发布说明](releases.md)，不要把测试覆盖率作为面向新用户的产品承诺。

## 产品截图

`pnpm run build` 后运行 `pnpm exec tsx scripts/product-demo.ts`，打开输出的本机地址：`/card` 为现有语境卡片，`/library.html` 为现有资料库。只读演示使用临时 SQLite、合成文本和固定释义，Chrome RPC/供应商边界被替换，不连接个人库或服务；不是浏览器插件端到端验收。Ctrl+C 退出清理临时目录。

README 图片统一 `width="960"`，不指定高度，窄屏等比缩小。**同宽，不强制同高**：画布按内容确定，避免为凑比例增加留白。组件图宽 1120 CSS px，卡片视口 **1120×740**（下缘约留 88 px），资料库 **1120×840**；缩放 100%、浅色主题。PNG 输出需核对文件签名，不只改扩展名；不得拉伸或使用概念图代替真实界面。

合成资料截图：打开 `/card` 截取卡片；打开 `/library.html`，进入「全部资源 → 查看资源记录」，回到顶部并等待内容稳定。保存为 `docs/assets/product-card.png`、`product-library.png`。检查主要操作完整可见、README 同宽。组件更新时同步截图，不改变生产布局来凑图。

`product-video.png` 为维护者明确授权展示的运行截图，保留原始比例，README 标注视频来源；不作为测试 fixture，不放宽其他个人截图的提交规则。替换图优先用演示账号，检查无密钥、私人笔记及无关内容。

组件以 apps/extension 为唯一实现来源，截图不代替完整扩展验收。

## 决策与协作

协作、Issue 状态与 PR 门禁见 [开发流程](development-process.md)；文档与决策记录按各自职责维护。
