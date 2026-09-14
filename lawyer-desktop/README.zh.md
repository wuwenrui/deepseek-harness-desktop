# LawyerDesk 受管桌面版

[English](README.md) | 中文

本产品基于 [Anywhere Labs DSH Desktop](https://github.com/anywhere-labs/dsh-desktop) 的 `8368da47c4a32e813dc6e0190b8d07447e55251b` 改造，保留 Anywhere Labs 和 DeepSeek 的 MIT 许可与署名。它是独立产品，不代表 DeepSeek 官方出品或背书。

## 运行结构

复用原项目的 Electron 窗口、托盘、原生栏、认证回环 WebContentsView 和 renderer 隔离。由 `managed-main.ts` 在插件加载前启用产品策略，固定启动 `lawyer` profile。运行时来自我们已校验的 Harness 构建，并重新应用原桌面项目的十份兼容补丁；不是直接换回未经改造的 npm 宿主。

默认数据目录为 `~/.lawyerdesk-managed-desktop`；已有安装若使用旧的 `~/.lawyercopilot-managed-desktop`，会自动继续使用旧目录。两者都与 `~/.dsh` 及此前 Web 产品的 `~/.lawyer-harness` 分离。不会复制、覆盖或静默导入旧数据。首次启动以 Electron Node 模式运行内置 pnpm，安装内容寻址的基础包；首次依赖准备可能需要联网，但用户无需另装 Node.js。

保留律师（默认）、标准、PTC、极简、创造五种 Agent 预设。这与原生**窗口呈现模式**不是一回事；当前产品固定兼容布局。未经审核的新动态插件仍不能绕过市场直接执行。

## 已移植能力

- 模型仅接入 `https://model.codingrui.work/v1`，本站令牌、模型发现与默认选择复用已有受管平台服务。
- 内置 `@lawyer-dsh/market`：**一份签名目录是唯一分发点**，同时承载自有能力和我们开放的社区能力；客户端只读这一个地址，社区目录只在发布时被读取。开放或关闭一条社区能力只需重新发布目录，用户刷新即可，不需要升级桌面端。不开放任意源、自卸载、配置恢复或构建放行入口。
- 社区插件只能 insert 自己的行，不能覆盖模型、预设、平台或市场配置；生命周期脚本永不执行，安装同样经过 staging、真实启动检查和切换前重新授权。
- 安装执行真实离线 staging，经私有 Node-mode CLI 启动真实 DSH 验证，切换前再次检查目录授权。重启后生效，失败保留活动环境。
- 桌面壳不暴露任意 `desktopPnpm`、profile 切换、原始终端、社区自动更新及恢复导入；原生重启仍回到受管产品。
- 内容 WebContentsView 保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`；本机 carrier 额外要求原生 renderer 的能力凭证，普通浏览器不能直接调用其私有接口。

## 品牌主题

独立的 `@lawyer-dsh/lawyer-brand` bundle 负责「律」字印章、侧栏/首页品牌和主题 token，不再混入模型路由。宣纸 `#f6f1e6`、朱砂 `#a63a2a`、藏青 `#26436e`、墨色 `#1d2530` 同步到原生栏、弹窗和应用图标。深色模式的主色采用更清晰的 `#db8d78`；保留浅色、深色、跟随系统选项。

## 构建与验收

在外层仓库执行：

```sh
corepack yarn install --immutable
node scripts/verify-lawyer-runtime.mjs
corepack yarn build:lawyer
corepack yarn workspace lawyer-dsh-desktop prepare:electron-native
```

使用 Yarn 4.18.0。如本机没有 Corepack，可用 `npm exec --yes --package=corepack@0.34.6 -- corepack yarn ...` 调用相同固定工具链，无需全局安装。

在 `lawyer-desktop/` 执行：

```sh
node lib/bin.js                              # 明确启动原生应用
node scripts/test-managed-desktop.mjs       # 真实 Electron，远端 HTTP 使用测试服务
node scripts/package-dir.mjs                # 当前宿主平台、本地未签名、不发布
node scripts/test-managed-desktop.mjs --packaged
```

macOS ARM64 目录产物为 `dist/mac-arm64/LawyerDesk.app`。制品检查覆盖受管入口、内置种子摘要、实体 Node 文件及最终二进制的 Electron fuses。真实桌面测试覆盖品牌明暗模式、五种预设、令牌与模型界面、原生及 HTTP 拒绝路径、实际法律插件安装、重启、模型流和压缩 Session 持久化；证据位于 `dist/e2e-source`、`dist/e2e-packaged`。

报告中的 `productionModelCall: false` 表明目录与模型 HTTP 为测试服务，不能作为生产联调通过。线上中央目录和用户授权的本站令牌仍需单独验证；测试不会真实提交法院或调解业务。

## 发行边界

当前本地验收目标是 macOS ARM64，不是已公证签名的公开发行、Windows 验收或 Universal 验收。不要用继承的 release 命令直接发版，签名、升级端点、平台原生组件与公开发布权限需要独立发行流程。原开放式主程序保留作参考，不是本变体构建出的 `lib/main.js`。
