# Agent Note: 首次完整版本发布

Status: implemented

## 为什么

已有构建流水线但用户没有正式下载入口，安装被迫从源码开始。

## 决策

以 0.2.1 发布首个完整 ZIP 和 SHA-256。通过受保护 PR 升版，再在 main 运行草稿发布工作流；核对目标提交、包内容与校验后正式发布。README、安装指南和 Skill 优先指向 Release，保留源码路径。私有仓库权限不变。

## 放弃了什么

不发布 npm/GitHub Packages 库，不打包 Node，不承诺 ZIP 拖入即装。用户已暂缓的独立会话首次安装验收不作为已完成能力宣传。

## 怎么验证

本地完整 CI 与远端三平台、Node 兼容及 Chrome 检查；正式发布前下载草稿资产核对 SHA-256、manifest、CLI 版本和 build-info 的干净 main 提交。安装烟测使用隔离数据，保留真实用户安装。
