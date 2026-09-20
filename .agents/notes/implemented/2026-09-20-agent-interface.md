# Agent Note: Agent 接入与复习归属
Status: implemented

## 为什么
外部 Agent 需要独立于源码发现 Skill；用户在 Agent 对话中的真实复习不应遗漏统计。

## 决策
安装器复制 Skill 到 runtime，CLI 提供 skill/help/version。选项严格校验；能力声明 operationId 的写入在 CLI 强制提供，核心保留扩展兼容性。能力补齐分页与讨论参数，保持字段说明格式而不伪称完整 Schema。复习以 feedbackSource=user-confirmed 声明真实用户反馈，来源仍为 Agent，学习活动包含该类反馈。

## 放弃了什么
不自动写入各 Agent 客户端配置，不伪造模型认证，不迁移旧 Agent 记录为用户反馈；不在本轮引入通用 Schema 框架、语义搜索或新的复习算法。

## 怎么验证
隔离 CLI 场景覆盖错误选项、身份、幂等与复习统计；核心测试覆盖无效反馈声明。发布烟测删除解压包后仍能读取 Skill 和版本；完整 CI 检查覆盖率、文档预算与打包。外部 Agent 的实际 Skill 注册依照其自身机制，本轮不代表所有客户端实机验收。
