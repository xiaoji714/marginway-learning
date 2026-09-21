# apps/cli

实现职责与命令见仓库根 README 和 docs/engineering.md。源码在 src，lib 为构建产物。

## Agent 入口
`learning --help` 给出格式，`--version` 返回版本，`skill` 返回持久 Skill 路径及正文。安装目录以安装器输出为准，不在 PATH 时直接使用完整路径。

`capabilities` 的 commands 是字段说明，transport 描述结果、分页和错误；不是完整 JSON Schema。声明 operationId 的命令由 CLI 强制非空 ID，重试保持参数和身份一致。未知、重复、缺值选项及同时使用 --input/--json 均报 INVALID_ARGUMENT。领域字段仍由核心校验。

复习中 feedbackSource=user-confirmed 表示转述用户实际反馈，保留 Agent 来源且计入学习活动；这是调用方声明，不是认证。旧 Agent 复习不自动改写。

## 安装诊断

CLI 无法启动时，按[安装指南](../../docs/installation.md)先核对 Node 版本及绝对路径。

运行 `learning doctor`（必要时用完整路径），默认 JSON；`--json` 是输入参数，不是输出开关。诊断不建库、不读密钥、不调用服务：

- DATABASE_MISSING：核对原数据目录与安装进度，不另建空库替代。
- DATABASE_UNREADABLE：检查权限、文件及备份，不删除库。
- HEARTBEAT_METADATA_INVALID：历史心跳损坏，重新连接扩展后复查，不据此判定数据库不可读。
- DATABASE_READABLE：只证明相关表可读，不证明完整性或可写性。

注册、实时连接和配置仍为 unknown：核对扩展 ID 与 Native manifest 的 allowed_origins/启动路径，再打开扩展检查连接、在设置填密钥。历史心跳不是实时握手；ok 只表示诊断成功，readiness=unknown 不能当作安装完成。自动修复仍见[目标方案](../../docs/runtime-installation-design.md)。

## token 影响

核心、CLI与桥接不调用模型。扩展只在字幕翻译与用户划词时向已配置服务发送所需上下文；相同任务使用 SQLite 缓存。

## 已知限制

本机 SQLite 为单用户资料库。浏览器扩展依赖桌面 Chrome；跨平台安装仍需对应系统实机验证。
