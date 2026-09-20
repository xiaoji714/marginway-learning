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

README 图片统一 `width="960"`，高度按内容确定，窄屏等比缩小。合成图使用浅色主题、100% 缩放：`/card` 视口1120×740；`/library.html` 进入「全部资源 → 查看资源记录」，视口1120×840。PNG 核对文件签名，不只改扩展名；检查文字、主要操作完整可见。

整体推广页为 [静态 HTML](product/index.html)，直接打开即可，无 JS、构建或运行时依赖；相对路径引用独立 `showcase.css` 与原始 `assets/product-video.png`。复用 `.mw-showcase` 标记与 CSS 时保持图片路径有效；页面背景是文档级样式，嵌入现有前端时由宿主决定。

推广图从该页截取：1120×940 视口、100% 缩放、等图片加载完成后截图，存 `assets/product-overview.png`。检查桌面/窄屏无横向溢出，原图及来源链接可打开；页面修改后更新推广图。保留按内容增长的高度，禁止为凑比例拉伸原图或增加大段留白。

`product-video.png` 为维护者明确授权展示的原始运行截图，来源见页面与 README，不作为测试 fixture；其他个人截图规则不变。卡片/资料库仍为合成资料；所有截图均不替代完整扩展验收。

## 决策与协作

协作、Issue 状态与 PR 门禁见 [开发流程](development-process.md)；文档与决策记录按各自职责维护。
