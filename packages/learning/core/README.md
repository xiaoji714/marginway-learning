# 学习核心

`domains/resources.ts` 管理资源与位置；`notes.ts` 管理笔记；`vocabulary.ts` 管理词汇、出现记录和复习；`discussions.ts` 管理讨论创建；`jobs.ts` 管理任务与结果；`backup.ts` 管理恢复。

`repository.ts` 是 SQLite 存储层，`store.ts` 是统一命令入口，负责读取聚合、事务、幂等和路由。领域模块只通过传入的存储接口读写，共享错误/规范化逻辑在 `shared.ts`，能力定义在 `capabilities.ts`。`tests/store.spec.ts` 和 `tests/contracts.spec.ts` 从公共入口覆盖所有领域，避免测试绑定内部文件拆分。

## token 影响

核心不调用模型，任务执行由扩展承担。

## 已知限制

仍是单用户 SQLite，统一 objects 表未改为每领域独立表；查询聚合仍集中在入口，动态记录 payload 尚未全部改成具体类型。每个 src 文件四项覆盖率100%仅代表执行路径覆盖，不代表穷尽业务场景。
