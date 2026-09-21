# Marginway · 语境

**从内容出发，让思考延续。**

在网页和 YouTube 视频旁理解一个词、记下一个想法，留下原文与位置，再带着上下文回顾或与 Agent 继续讨论。

[交给你的 Agent：安装、配置与学习](skills/SKILL.md)

## 在原文旁，留下理解

阅读网页，或观看带双语字幕的视频时，选中一个词，就能查看释义、收藏词汇、写下想法。句子和时间点一起保留，之后还找得到当时的语境。

<img src="docs/assets/product-card.png" width="960" alt="语境卡片：查看 context 的释义与原句、收藏词汇、记录想法，并在 Agent 中讨论">

## 看视频时，字幕就在视线旁

视频下方显示当前句的双语字幕，侧栏保留前后文并跟随播放。需要理解一个词或记下想法时，就从字幕开始；点击时间点回到原处，也可以重播当前句。

<img src="docs/assets/product-overview.png" width="960" alt="实际运行：YouTube 视频下方显示当前句双语字幕，右侧字幕列表跟随播放，提供划词、笔记和回溯入口">

<sub>[静态展示页源码](docs/product/index.html) · [查看原始截图](docs/assets/product-video.png)。视频：[Dwarkesh Podcast · OpenAI researcher on agent swarms & recursive self-improvement](https://www.youtube.com/watch?v=6AgOfiZOWiY)。</sub>

## 回到材料，继续学习

同一份资源下的词汇和笔记聚在一起。用分类和搜索找到材料，回到原文或视频时间点；通过词汇复习和学习热力图回看自己的积累。

<img src="docs/assets/product-library.png" width="960" alt="资料库：同一资源中的笔记、词汇及返回原文入口">

## 说出目标，让 Agent 操作 Marginway

我们提供 **Marginway Skill + CLI**：Skill 告诉 Agent 有哪些能力、怎样使用，CLI 让它实际查询资料、管理词汇与笔记、发起翻译、整理学习记录。你描述目标，Agent 按需组合产品功能，完成跨资源、跨时间的任务。

可以这样交给你的 Agent：

- **每周回顾**：「用 Marginway Skill 看看我这周都学了些什么，按主题整理词汇和笔记，并附上原文入口。」
- **学习频率对比**：「用 Marginway Skill 比较这周和上周的学习频率，看看活跃天数、词汇和笔记记录次数有什么变化。」
- **跨材料整理**：「用 Marginway Skill 找出我关于 AI Agent 的笔记，按主题归纳，列出值得继续追问的问题。」
- **语境复习**：「用 Marginway Skill 带我复习到期的词，结合原句提问，先别告诉我答案。」

学习频率按已保存的学习记录统计，不代表观看时长；本周未结束时比较相同天数。卡片中的「在 Agent 中讨论」也使用同一 Skill：复制简短指令，Agent 按需读取更多语境，按你的要求将结论写回原处，并标注 Agent 来源。

需要能操作本机的 Agent 与配套组件；保存、修改及收费服务按用户要求执行。纯聊天 Agent 可以根据节选讨论，但不能直接读写本机资料库。

**阅读 / 看视频 → 划词与想法 → 保留语境 → 资料库 → 回顾原文 → 延续讨论**

<sub>语境卡片和资料库图使用合成演示资料，视频图为实际运行截图；[截图规范与复现](docs/engineering.md#产品截图)。</sub>

## 开始与了解

当前为桌面 Chrome 早期开发版，需从源码安装并配置自己的服务密钥；仓库访问需授权。学习资料存于本机，字幕与翻译会调用第三方服务。手机 Chrome 暂不支持。

**开始前需要准备两项服务配置：**

| 服务 | 用途 | 在哪里配置 |
| --- | --- | --- |
| Supadata | 获取 YouTube 原生字幕 | 在扩展设置中填写自己的 API Key |
| DeepSeek | 双语字幕翻译与划词释义 | 在扩展设置中填写自己的 API Key |

第三方服务有各自的额度与费用，使用前请确认账户可用额度。当前仅支持有原生字幕的视频。密钥由你在本机扩展设置中填写，不需要发给 Agent 或粘贴到聊天里。

Agent 会按 Skill 检查运行环境、引导安装本机组件与 Chrome 扩展，再帮助检查连接；你完成 Chrome 确认和密钥填写即可。具体步骤见[安装指南](docs/installation.md)。

把下面这段话交给能操作本机的 Agent：

> 请读取 https://github.com/xiaoji714/marginway-learning/blob/main/skills/SKILL.md ，按 Skill 帮我安装、配置并验证 Marginway；已有安装请沿用，需要我操作时逐步引导。

[Marginway Skill](skills/SKILL.md) · [手动安装指南](docs/installation.md) · [隐私与数据](PRIVACY.md)

[开发与贡献](CONTRIBUTING.md) · [工程架构与测试](docs/engineering.md) · [版本与发布](docs/releases.md) · [安装体验设计](docs/runtime-installation-design.md)

[安全说明](SECURITY.md) · [第三方许可](THIRD_PARTY_NOTICES.md) · [MIT 许可证](LICENSE)
