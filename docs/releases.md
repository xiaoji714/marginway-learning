# 版本与发布

根 package.json 的 version 是唯一版本来源。各包和 Chrome manifest 版本由脚本同步检查。只支持 Chrome 可接受的稳定三段版本，各段 0..65535；数据库 schema 版本独立管理。

## 准备版本

1. 从 main 建分支，运行 `pnpm run version:set <新版本>`，必须高于当前版本。
2. 更新 CHANGELOG，将已交付内容归入该版本，并运行 `pnpm run ci`。
3. 提交 PR，等待 Linux、macOS、Windows 三个平台通过，再合入 main。

`pnpm run version:check` 阻止版本漂移。`pnpm run package` 从该版本生成 ZIP 和 SHA-256，包内 build-info.json 记录 Git commit、dirty 状态、Node 与构建平台。安装包不包含依赖目录或数据库；仍需要兼容的外部 Node，尚非免运行时的原生安装包。

从 [Releases](https://github.com/xiaoji714/marginway-learning/releases/latest) 下载 ZIP 和 SHA-256，按[安装指南](installation.md)校验并加载解压后的 extension 目录。

## 创建发布草稿

在 GitHub Actions 手动运行 **Draft release**，选择 main，输入已合入的版本。流程先在 GitHub-hosted 三平台 runner 执行完整 CI，再下载该运行的 Linux 构建产物、校验 SHA-256 和版本，生成 Release 草稿，不自动发布、不覆盖同名旧版本。

草稿使用该次运行的 commit 作为 tag 目标。正式发布前核对版本、commit、变更说明和产物，再人工发布。不要事先把同名 tag 指到另一 commit。日常 push/PR 只上传 CI artifacts，不创建 Release。

## 验证边界

CI 在22.13.0、24.0.0、26.0.0验证 Linux 构建包，独立于开发依赖版本；不代表全部未来版本已验证。CI 包含真实 ZIP 解压、隔离目录安装、重新安装删除过时文件，以及移除安装介质后 CLI 数据仍可读取。Windows 烟测通过 `--skip-registration` 避免改写实际 Chrome 注册表，不代表真实 Chrome 注册和 UI 跨平台验收。

扩展 UI 已有隔离 Chrome 端到端与视觉回归；真实 YouTube 兼容性仍单独验收，详见[测试契约](testing.md)。每次 schema 改变需要单独提供旧版本 fixture 与升级/恢复验证，本轮 schema 保持 v1。

## 历史清理后的升级

2026-09-22 清理了分支/标签中的旧素材及作者邮箱，旧 Release 已撤下；从 0.2.3 获取新包。普通用户沿用原目录和扩展 ID 升级即可。开发者先备份未提交工作，再全新克隆；不要合并或推回旧分支/标签，以免重新引入旧对象。既有评审中的旧 SHA 仅为历史证据，不代表新提交已获评审。
