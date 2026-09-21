# 第三方许可与来源

## 历史上游

本项目早期原型源于 Zara Zhang 的 YouTube Digest（MIT）。当前运行时、服务适配器、设置与构建链已独立，不安装、不读取、不调用该项目。

对可能保留或改编的受版权保护部分，仍保留原 MIT 归属：见 `apps/extension/public/THIRD-PARTY-LICENSE`；该文件随扩展发布。法律归属不构成技术依赖，不能因品牌独立而删除。

## 图标

Phosphor Icons，MIT。许可见 `apps/extension/public/icons/PHOSPHOR-LICENSE`，随扩展发布。界面使用官方 regular 与 duotone SVG。

## 开发依赖

具体版本与依赖树以 pnpm-lock.yaml 为准。TypeScript、pnpm、Vitest、esbuild、jsdom、fflate、Lefthook 等按各自许可证使用；发布的 Node 业务入口无 npm 运行时依赖，SQLite 来自 Node。

## 产品运行截图

旧静态素材页的 `docs/assets/product-video.png` 由维护者提供，用于展示扩展在 YouTube 的运行方式。画面中的视频来自 [Dwarkesh Podcast](https://www.youtube.com/watch?v=6AgOfiZOWiY)；视频画面及 YouTube 标识的权利属于各自权利人，不由本项目 MIT 许可证重新授权。

README 与官网的 `product-youtube.png` 展示 Jeremy Howard 的 [A Hackers’ Guide to Language Models](https://www.youtube.com/watch?v=jkrNMKz9pWU)，视频采用 YouTube [CC BY](https://www.youtube.com/t/creative_commons) 许可。截图叠加本产品字幕、笔记界面与机器翻译，不代表原作者背书；YouTube 标识仍归其权利人。设置截图为测试环境的空白密钥界面。
