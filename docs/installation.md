# 安装与开始使用

将 [Marginway Skill](../skills/SKILL.md) 交给本机 Agent。

桌面 Chrome 早期版，优先使用发布包；无商店入口，不支持手机 Chrome。macOS 已实测，Windows/Linux 通过隔离安装 CI，仍需真实 Chrome 验证。

## 准备与构建

从 [Releases](https://github.com/xiaoji714/marginway-learning/releases/latest) 下载同一版本的 ZIP 与 `.sha256`，不要选择 GitHub 自动生成的 Source code。私有仓库需授权。核对 SHA-256（macOS：`shasum -a 256`；Linux：`sha256sum`；Windows：`Get-FileHash`），不一致则停止。发布包通过 Node 检查后跳到下一节。

**运行构建包**：Node **22.13.0+**，并通过下方 SQLite 检查。优先复用已有受维护的 LTS，不因小版本不同而重装。

**源码构建/测试**：另需 Git、pnpm **11.22.0**；Node 按根 package.json 的 engines。`.node-version` 是开发/CI 的固定基线，不是用户唯一可用版本。仓库需授权。

仅需开发或无可用发布包时，在选定的源码父目录执行：

```sh
git clone https://github.com/xiaoji714/marginway-learning.git
cd marginway-learning
pnpm install --frozen-lockfile
pnpm run package
```

## 选择长期目录并加载

1. 解压下载或构建的 `marginway-learning-<版本>.zip`，保留完整包（含 `extension/`、`runtime/`、`skills/`）。
2. 选择 Chrome 长期目录：使用 `extension/`，或将其**全部内容**复制到自选目录，根部须有 `manifest.json`。
3. 打开 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择第 2 步的目录。复制页面显示的扩展 ID。
4. 在解压目录执行，替换占位符并保留引号：

```sh
node runtime/install.js --extension-id <扩展ID> --extension-dir "<Chrome加载目录的完整路径>"
```

安装器输出绝对路径，核对 Extension 与 Chrome 目录一致。

安装器保存本机组件并绑定当前 Node 的绝对路径；保留该 Node，路径改变后重装桥接。CLI 用安装器输出的绝对路径；`learning skill` 返回 Skill 路径。Chrome 加载的目录必须保留；扩展另存后才可删除安装介质。

## 配置与第一条记录

1. 按[服务配置](configuration.md)填写 Supadata、DeepSeek API Key 并保存。
2. 点击 Chrome 工具栏扩展按钮打开侧栏；首次安装可直接验证。已有网页未出现功能时才刷新网页。
3. 打开有原生字幕的 YouTube 视频查看双语字幕，或在网页划词、记笔记。
4. 打开资料库，确认记录可见，并尝试回到原文。用安装器输出的 CLI 完整路径运行 `capabilities`、`status`，确认访问同一本机资料库。

密钥与学习数据的存储位置见[隐私说明](../PRIVACY.md)。

## 升级与排错

升级先导出学习备份，用新的完整包重复第 4 步安装命令，保持目录与 ID 一致，再重新加载扩展：在 `chrome://extensions` 开启开发者模式，点击 Marginway 卡片上的圆形箭头图标。安装器会备份旧扩展文件；不会删除 SQLite。切换 Chrome 加载目录可能改变 ID，必须用新 ID 重装桥接；卸载扩展会清除该扩展的密钥配置，迁移前自行保留密钥。

无法连接时，核对 Node 仍存在、Chrome ID 与安装参数一致，然后用当前包重新运行安装器并重载扩展。请勿通过删除资料库解决连接问题。

## Agent 诊断

CLI 启动前检查 Node 的 SQLite 能力：

```sh
node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const d=new DatabaseSync(':memory:'); d.exec('CREATE TABLE probe(id INTEGER)'); d.close(); console.log(process.version,process.execPath)"
```

失败才处理环境。随后执行 `learning doctor`，根据[诊断契约](https://github.com/xiaoji714/marginway-learning/blob/main/apps/cli/README.md#安装诊断)检查结果；未知项继续按本指南核对，不能宣布已就绪。
