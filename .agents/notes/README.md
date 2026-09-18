# Agent Notes

保存决策理由，不充当 Issue 状态或工作日志。非平凡行为、架构、协议、流程或测试策略变化，在同一 PR 更新拥有该决策的 Note；纯机械/局部编辑可以在 PR 写 `Note: not-needed — 具体理由`，由评审确认。

路径为 `{proposed|implemented|rejected|archived}/YYYY-MM-DD-topic.md`，暂不增加分类目录。状态转移时移动文件并同步 Status；proposed 可以变成 implemented 或 rejected，implemented 被取代时进入 archived。归档补 `Archived: 日期；原因；替代文档或无替代`，保留必要解释，修正入链。

格式如下，各节必须有内容：

```markdown
# Agent Note: 主题

Status: implemented

## 为什么
动机。

## 决策
当前采用的方案。

## 放弃了什么
替代方案与原因。

## 怎么验证
实际验证方法及其边界。
```

implemented 描述当前决策；验证结果不代替 GitHub CI 和任务状态。合并相关 Note 时保留独有理由，删除重复事实。
