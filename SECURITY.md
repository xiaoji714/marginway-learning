# 安全说明

内容脚本只能访问当前主页面对应的资源，worker 校验浏览器真实 tab URL、frame 与资源/锚点归属。扩展页面与本机 CLI 拥有更完整的资料库权限。

Native Messaging 由安装时的扩展 ID allowlist 与运行时 origin 双重约束。桥接不监听网络端口；没有公网数据库服务。SQLite 默认文件权限为当前用户可读写。

网页、字幕和导入 Prompt 均视为引用数据，不作为系统指令执行。文本用 DOM textContent 输出。外部服务错误不得回显密钥。

## 报告漏洞

仓库公开并启用 GitHub Private vulnerability reporting 后，请通过 [Report a vulnerability](https://github.com/xiaoji714/marginway-learning/security/advisories/new) 私密提交复现步骤、影响版本与脱敏证据。

当前仓库私有，该入口尚不可用。入口不可用时，只在 [Issue](https://github.com/xiaoji714/marginway-learning/issues/new) 请求维护者提供私密联系渠道，不填写漏洞细节、密钥或个人学习记录；等待私密渠道确认后再传递材料。不承诺固定响应时限。

公开切换时维护者须启用该功能并验证入口可用，再更新本说明；不得把链接存在当作功能已开启。
