# 安装与开始使用

当前是早期开发版：使用桌面 Chrome，从源码构建后加载扩展。没有 Chrome 商店安装入口或免 Node 安装器；手机 Chrome 不支持桌面扩展。macOS 已实测，Windows/Linux 通过隔离安装 CI，仍需真实 Chrome 验证。

## 准备与构建

需要 Git、Node.js **22.23.2**、pnpm **11.22.0**。请让协助安装的 Agent 先检查版本；已有正确版本时无需重复安装。仓库目前为私有，克隆需要已获授权的 GitHub 账号。

在自己选择的源码目录克隆仓库，再在仓库根目录执行：

```sh
git clone https://github.com/xiaoji714/marginway-learning.git
cd marginway-learning
pnpm install --frozen-lockfile
pnpm run package
```

若当前终端不在计划放源码的位置，先切换到你选的父目录。源码 checkout 与 Chrome 长期加载目录可以分开；后续运行不依赖源码目录。

## 选择长期目录并加载

1. 解压 `dist/marginway-learning-<版本>.zip`，保留 `extension/` 与 `runtime/`。
2. 明确选择 Chrome 要长期加载的目录。可以直接使用解压包的 `extension/`；也可将其中**全部内容**复制到自己的目录，确保根部有 `manifest.json`。
3. 打开 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择第 2 步的目录。复制页面显示的扩展 ID。
4. 在解压目录中运行下方命令，将占位符换成实际值，含空格路径保留引号：

```sh
node runtime/install.js --extension-id <扩展ID> --extension-dir "<Chrome加载目录的完整路径>"
```

安装器输出 Extension、CLI 和 Native host 的准确路径。核对 Extension 与 Chrome 的目录相同。需要位置建议时，可选 macOS/Linux 的 `~/Documents/marginway-learning` 或 Windows 的 `%USERPROFILE%\Documents\marginway-learning`，它们不是固定要求。

安装器将桥接与 CLI 复制到独立 runtime。请保留安装时使用的 Node：当前桥接仍引用它的可执行文件。CLI 默认位于 macOS/Linux 的 `~/.local/bin/learning`，Windows 的 `%USERPROFILE%\.local\bin\learning.cmd`；可以直接运行完整路径，不必先修改 PATH。

## 配置与第一条记录

1. 打开扩展设置，填写自己的 Supadata、DeepSeek API Key。第三方服务可能收费；Supadata 仅获取原生字幕，没有原生字幕的视频暂不支持。
2. 重新加载扩展并刷新已有网页。点击 Chrome 工具栏扩展按钮打开侧栏。
3. 打开有原生字幕的 YouTube 视频，查看视频下方和侧栏双语字幕；也可以在普通网页划词，收藏词条或记录想法。
4. 打开资料库，确认记录可见，并尝试回到原文。用安装器输出的 CLI 完整路径运行 `capabilities`、`status`，确认访问同一本机资料库。

密钥保存在当前 Chrome profile 的扩展配置中；学习数据独立存于 `~/.local/share/learning-companion/learning.sqlite`，`LC_DATA_DIR` 可覆盖数据目录。数据流与外部服务边界见 [隐私说明](../PRIVACY.md)。

## 升级与排错

升级先导出学习备份，用新的完整包重复第 4 步安装命令，保持目录与 ID 一致，再重新加载扩展。安装器会备份旧扩展文件；不会删除 SQLite。切换 Chrome 加载目录可能改变 ID，必须用新 ID 重装桥接；卸载扩展会清除该扩展的密钥配置，迁移前自行保留密钥。

无法连接时，核对 Node 仍存在、Chrome ID 与安装参数一致，然后用当前包重新运行安装器并重载扩展。请勿通过删除资料库解决连接问题。当前安装日志为人类文本；统一 JSON 诊断尚在[目标方案](runtime-installation-design.md)中，不能调用尚未实现的命令。
