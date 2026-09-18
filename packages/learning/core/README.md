# packages/learning/core

实现职责与命令见仓库根 README 和 docs/engineering.md。源码在 src，lib 为构建产物。

## token 影响

核心、CLI与桥接不调用模型。扩展只在字幕翻译与用户划词时向已配置服务发送所需上下文；相同任务使用 SQLite 缓存。

## 已知限制

本机 SQLite 为单用户资料库。浏览器扩展依赖桌面 Chrome；跨平台安装仍需对应系统实机验证。
