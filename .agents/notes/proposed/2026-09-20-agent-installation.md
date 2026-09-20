# Agent Note: 安装控制面与独立 Runtime

Status: proposed

## 为什么

当前源码安装需要用户理解 Node、目录、扩展 ID 和桥接日志，Agent 也不能用确定的状态判断安装是否完成。

## 决策

目标架构、状态证据、JSON 命令、所有权与恢复语义归 docs/runtime-installation-design.md。选择随包 Node 与 TypeScript Runtime，而不为单文件形式更换技术栈；Windows 原生入口必须先完成无 Node/SQLite/真实 Chrome 协议 spike。正式商店 ID 与签名是发布条件，当前安装能力仍以 docs/installation.md 为准。

## 放弃了什么

不让目录存在或历史心跳代替本次握手，不用删除数据解决安装故障，不把设计命令加入当前 capabilities。不把通过 skip-registration 的烟测冒充 Windows Chrome 验收。

## 怎么验证

设计覆盖首次安装、重复 setup、中断恢复、损坏注册、版本不兼容、数据保留与卸载。实现门槛和平台验证矩阵在契约文档中；本 Note 保持 proposed，直到对应 Runtime 实现与真实平台验证交付。
