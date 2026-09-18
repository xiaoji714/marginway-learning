# Marginway · 语境

**从内容出发，让思考延续。**

Marginway 将内容旁的词汇、想法与讨论，连接成可以回溯和继续的学习过程。

在网页与视频的原文旁学习：划词翻译、收藏词条、记录想法，以及带着完整语境与 Agent 继续讨论。

这是独立的 Chrome Manifest V3 扩展、本机 SQLite 服务和 Agent CLI。运行或构建无需安装任何其他浏览器扩展。没有开发者托管的后端。

## 功能

- 视频下方与侧边栏同步显示双语字幕，按时间回到原文。
- 在网页或字幕划词后打开学习卡片，自动显示语境释义。卡片内的词条与来源固定，只有「我的想法」可编辑。
- 收藏只保存选中词，整句与来源作为语境关联；笔记、词汇、复习按资源组织。
- 「在 Agent 中讨论」复制原文、来源、笔记和问题；Agent 可用 CLI 带身份追加结论。

## 从源码安装

需要 Node.js **22.23.2**、pnpm **11.22.0**、桌面版 Chrome。

```sh
pnpm install --frozen-lockfile
pnpm run ci
```

1. 解压 `dist/marginway-learning-0.2.0.zip` 到你选择的长期保留目录。
2. 打开 `chrome://extensions`，开启开发者模式，点「加载已解压的扩展程序」，选择刚才的 **extension** 文件夹。
3. 复制 Chrome 显示的扩展 ID，再运行解压包内的安装器：

```sh
node runtime/install.js --extension-id <扩展ID> --extension-dir <刚才选择的extension文件夹的完整路径>
```

安装器使用你明确提供的目录，不猜测安装位置。macOS 与 Linux 的 CLI 安装到 `~/.local/bin/learning`；Windows 安装到 `%USERPROFILE%\.local\bin\learning.cmd`，将该目录加入 PATH。本机桥接使用安装时的 Node 可执行文件，请保留该 Node 安装。

建议给 Marginway 使用自己的长期目录，例如 macOS/Linux 的 `~/Documents/marginway-learning`，或 Windows 的 `%USERPROFILE%\Documents\marginway-learning`。若采用这个布局，将发布包 `extension/` 内的文件复制到该目录，确保 `manifest.json` 直接位于目录根部；Chrome 与安装器的 `--extension-dir` 必须指向同一目录。不要借用其他扩展的安装目录。

迁移已安装版本时，先保留 API Key 配置，再卸载旧扩展并加载新目录。目录变化可能改变扩展 ID，必须用 Chrome 显示的新 ID 重新运行安装器并重新配置密钥。SQLite 资料库独立保存在本机，卸载扩展不会删除它。

4. 打开扩展设置，填写自己的 Supadata 与 DeepSeek API Key。没有原生字幕的视频暂不支持；不自动付费生成字幕。
5. 重新加载扩展并刷新已有视频页。点击 Chrome 扩展按钮打开侧边栏。

桌面 Chrome 支持；手机 Chrome 不支持加载桌面扩展。macOS 已验证本机安装；Linux/Windows 的安装路径与脚本已有实现，尚需对应系统实机验证。

## Agent CLI

```sh
learning capabilities
learning resources.list
learning notes.append --actor Codex --model <实际模型名> --json '{"anchorId":"<ID>","text":"讨论结论","operationId":"<唯一ID>"}'
```

CLI 与浏览器访问同一个 SQLite 数据库。`--actor`、`--model` 是客户端自报身份，数据库保留来源与修订历史。使用说明见 [Agent Skill](skills/SKILL.md)。

## 开发

| 命令 | 用途 |
|---|---|
| `pnpm run build` | tsc 编译核心/CLI/桥接，esbuild 编译 MV3 浏览器入口 |
| `pnpm run typecheck` | 全包严格类型检查 |
| `pnpm test` | Vitest 聚合测试 |
| `pnpm run test:coverage` | SQLite 核心逐文件四项 100% + 报告完整性门禁 |
| `pnpm run test:skills` | CLI Skill 契约校验 |
| `pnpm run doc-sync` | 文档预算、Agent Note 格式校验 |
| `pnpm run package` | 独立可解压发布包与 SHA-256 |
| `pnpm run ci` | 完整本地门禁 |

目录与约束见 [工程约定](docs/engineering.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。构建产物不入库；发布包只包含运行产物、文档与许可证。SQLite 默认位于 `~/.local/share/learning-companion/learning.sqlite`，可用 `LC_DATA_DIR` 更换；升级不会删除旧资料库。

## 隐私与授权

[隐私说明](PRIVACY.md) · [安全说明](SECURITY.md) · [第三方许可](THIRD_PARTY_NOTICES.md)

MIT。第三方服务按其条款独立计费，API Key 不进入源代码、笔记导出或发布包。
