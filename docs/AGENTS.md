# 文档约束

每个事实只有一个主要位置，其余页面使用链接。根 AGENTS 只留常驻约束；README 负责安装入口；docs 负责工程与流程契约；包 README 负责接口、token 影响和已知限制；Agent Note 负责取舍理由。任务状态只在 GitHub。

所有非 Note 的 Markdown 文档都登记在 scripts/doc-budgets.json，预算单位为 Unicode 字符（含空白与 Markdown 标记），不是模型 token。doc-sync 拒绝未登记、超预算或残留条目。Notes 只检查格式与生命周期，不设总数配额；优先更新拥有该决策的 Note，避免同义重复。

超限依次考虑移到职责所在文档、压缩、再调整预算；调整预算在 PR 说明必要性，目标保留至少 5% 余量。新增文档必须说明它承载的独立事实，避免拆文件规避预算。文档预算是防增长检查，不是内容质量证明。
