---
name: marginway
description: 安装、配置和使用 Marginway（语境）；引导首次安装，查阅资源、词汇与笔记，围绕原文讨论、复习并以 Agent 身份写回。用户提到 Marginway、语境学习、安装配置、讨论 Prompt 或资源/锚点 ID 时使用。
---

# Marginway · 语境

这是安装前后统一的 Agent 入口。用户无需先安装 CLI 或了解命令。

仓库：https://github.com/xiaoji714/marginway-learning
稳定入口：https://github.com/xiaoji714/marginway-learning/blob/main/skills/SKILL.md

## 先判断本机状态

1. 检查当前 Agent 能否操作用户本机。纯云端环境不能代替用户本机安装；缺少本机能力时明确说明，提供简单的手动步骤，不声称已经安装。
2. 询问或沿用用户已提供的安装信息；检查已有安装和 CLI 路径，不因命令不在 PATH 就重装。未安装进入下一节，已安装但需要配置时只完成配置。
3. 仓库当前私有，使用用户已授权的 GitHub 访问。无法读取时说明需要仓库访问授权，停止依赖远程文档的安装操作；已有本机 Skill 仍可使用，不把 404 当作仓库不存在。

## 安装与配置

读取仓库最新 [安装指南](https://github.com/xiaoji714/marginway-learning/blob/main/docs/installation.md)，以它和 package.json 为版本、构建、安装与排错的依据；不要先要求用户执行尚未安装的 CLI。

确认用户选择的长期目录，沿用已选位置；给出建议不等于用户已选择。当前保留外部 Node，不要求自带运行时。CLI 尚不能运行时，先按指南区分运行与源码构建要求，检查 Node 版本、SQLite 能力及路径，复用兼容环境，不因与 .node-version 不同而重装；没有 Node 时不能依赖 doctor 自检。优先下载正式 Release 的完整 ZIP 与校验文件，核对 SHA-256；无包或需要开发才源码构建。按指南完成 Node 检查、Chrome 加载和桥接安装。Chrome 选择目录或确认需要用户操作时，说明具体步骤并等待结果。升级前备份，保留既有学习数据。

引导用户在本机扩展设置中填写服务密钥，不让密钥进入聊天、命令或日志。先运行 CLI 的 `doctor`，按安装指南解释诊断，再验证字幕、第一条记录和资料库连接；说明未完成项，不把部分成功当作全部完成。

安装后报告准确目录。安装器输出 Skill 路径；可让 Agent 直接读取，或用客户端支持的机制接入，不擅自猜测或改写其配置。

## 已安装后的学习

收到讨论交接时，短文本只是节选，ID 用于按需取回材料；讨论请求不等于安装或保存授权。无法读取私有仓库时可用已安装 Skill；纯聊天或无法访问本机资料时，先根据已提供节选讨论并说明限制，不声称已读取完整资料或写回。

读取本 Skill 内的 [学习操作与执行契约](references/usage.md)，然后检查 capabilities/status，按用户任务操作。CLI 是 Skill 的执行接口，不要求用户记忆命令。

在仓库浏览器中按相对链接读取；已安装或解压包中按本文件目录解析 references/usage.md。引用缺失时报告不完整安装，按安装指南修复，不凭空补造规则。不要仅复制本文件而漏掉 references 目录。
