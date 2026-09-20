# 学习核心

`domains/resources.ts` 管理资源与位置；`notes.ts` 管理笔记；`vocabulary.ts` 管理词汇、出现记录和复习；`discussions.ts` 管理讨论创建；`jobs.ts` 管理任务与结果；`backup.ts` 管理备份恢复，`trash.ts` 管理删除恢复。

`repository.ts` 是 SQLite 存储层，`store.ts` 是统一命令入口，负责读取聚合、事务、幂等和路由。领域模块只通过传入的存储接口读写，共享错误/规范化逻辑在 `shared.ts`，能力定义在 `capabilities.ts`。`tests/store.spec.ts` 和 `tests/contracts.spec.ts` 从公共入口覆盖所有领域，避免测试绑定内部文件拆分。

## 编辑契约

`resources.update` 修改标题/分类，`notes.update` 修改笔记；`vocabulary.update` 修正词条及关联出现记录的词面，稳定 ID、复习计划和原文不变，同语言重名拒绝合并。`occurrences.update` 只修改一处语境的释义。均要求 expectedRevision，保留创建身份/时间并记录编辑身份和历史。收藏按当前词面查重，旧哈希已占用时分配新 ID。参数见 capabilities。

## 删除契约

`records.setDeleted` 对资源/词条/笔记/语境设置 deleted（修订号必填），`trash.list` 列出直接删除项。默认查询按资源/词条父级删除状态过滤，恢复父级不恢复直接删除的子项。资源删除取消未完成任务；全局词条保留，原始语境与历史不抹除。重新采集不会自动恢复，删除不等于数据擦除。

## token 影响

核心不调用模型，任务执行由扩展承担。`context.export.context` 保留结构化数据，`prompt` 仅含有预算的节选、稳定引用与 Skill 入口；不携带历史笔记、身份元数据和命令手册。讨论可关联 noteId，创建/导出都校验位置与删除状态。交接总预算 2000 字符，异常引用超限时拒绝而非截断 ID；备份导入 ID 最长 128 字符。

## 已知限制

仍是单用户 SQLite，统一 objects 表未改为每领域独立表；查询聚合仍集中在入口，动态记录 payload 尚未全部改成具体类型。每个 src 文件四项覆盖率100%仅代表执行路径覆盖，不代表穷尽业务场景。
