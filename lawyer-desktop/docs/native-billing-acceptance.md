# 原生费用与充值验收

这组测试运行真正的 Electron，而不是把 Web 验收冒充桌面验收。`test-managed-desktop.mjs` 和 `test-billing-desktop.mjs` 均要求显式测试目录与临时公钥；不得替换安装中的生产信任锚。

## 准备

使用已构建、版本固定的产品/市场仓库生成测试签名目录。发布器必须显式指定 `--key <临时私钥>`、`--trust-file <临时公钥文件>`、`--out <测试目录>`。这些测试制品不能作为正式发布候选。产品源代码和对应测试目录必须配套，不能用新的断言验证旧插件制品。

在桌面仓库根目录运行：

```sh
node lawyer-desktop/scripts/prepare-native-test-store.mjs
```

记录输出的 `dependencyStore` 路径。此准备步骤可能下载公共 npm 依赖，使用 `--ignore-scripts`，不启动应用服务。产品使用每个 home 独立的 `product-pnpm-store`，因此仅预热全局 pnpm 缓存不够。测试复制准备好的内容缓存，不预先安装可选插件、不制造安装成功标记。

## 执行

```sh
node lawyer-desktop/scripts/test-billing-desktop.mjs \
  --product-root <含产品及内核仓库的目录> \
  --catalog-dir <测试签名目录> \
  --test-trust <临时公钥文件> \
  --dependency-store <准备好的内容缓存>
```

追加 `--packaged` 验证当前 `lawyer-desktop/dist/mac-arm64/LawyerDesk.app` 的一次性副本。同样的参数适用于 `test-managed-desktop.mjs`。不同原生测试按顺序运行。

受管测试必须从真实市场卡片点击安装、确认，观察对应卡片内进度；首个能力安装后不重启，继续安装另一个能力，再一次重启核对两个工具都可用。不得把这段替换成直接调用安装 API，也不得以旧种子下的历史成功报告证明新版通过。

## 隔离与证据边界

- 源代码测试复制应用源载体及产品种子，外层安装依赖仍只读共享。打包测试复制发行 app，并确认框架符号链接仍在副本内；执行的是真正复制的 `LawyerDesk` 可执行文件和随包运行时。
- 临时公钥只写入副本与副本种子。打包副本保留 ASAR unpack 布局，仅增加测试引导并更新副本的 ASAR 完整性元数据；不关闭 Electron fuses，不修改正式 app。每次启动记录并核对实际可执行文件、打包标识与 resources 路径。
- 测试引导在应用代码之前映射模型站到本地夹具，并约束应用 fetch/http/socket、实际受管 Electron Node 子进程及 renderer session 的出站请求。断言没有这些受保护通路的外部请求；这不是全操作系统抓包，不声称覆盖任意第三方外部进程。
- 测试使用独立 home、假令牌、合成图片和假申请，不扫描、不付款、不向生产提交订单/Bark 或模型请求。依赖准备与业务服务验收分开记录。
- 费用测试先创建并恢复真实原生会话，再复用产品的完整费用断言；保留原入口、顶栏面板、闲置输入框、余额/消耗、微信/支付宝、状态与到账区别、未知结果不自动重试、发送前确认/取消。升级模拟后按原顺序验证全部必装层与可选费用插件。
- 开始执行即清除旧成功报告。只有测试、清理、正式种子/信任锚/完整 app 字节保护检查全部通过后才写成功报告；失败不保留本轮假绿色结果。

报告与截图分别位于 `dist/billing-source`、`dist/billing-packaged`、`dist/e2e-source`、`dist/e2e-packaged`。最终原样发行 app 还须通过不注入测试公钥的 `test-builtin-packaged.mjs`；许可与 libvips 替换门禁独立执行。运行这些命令不会发布、上传、签名或公证发行版。
