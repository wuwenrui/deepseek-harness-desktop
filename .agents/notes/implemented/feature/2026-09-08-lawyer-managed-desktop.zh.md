# Agent Note: Managed LawyerCopilot desktop variant

Status: implemented

[English](2026-09-08-lawyer-managed-desktop.md) | 中文

## Problem

法律产品需要原生桌面入口，但不能恢复开放式桌面的任意 profile、市场、包管理与配置恢复权限。固定模型站、审核目录和品牌已经存在于受管 Harness 组合中，只把页面放进 BrowserWindow 并不能验证原生运行时和打包后的安装路径。

## Decision

独立的 `lawyer-desktop` workspace 从 beta 派生，保持原 stable/beta 源码不变。受管入口复用 ElectronDesktopRuntime、窗口生命周期、renderer 认证与窗口策略，但不装载开放式管理服务。它运行经过校验的律师宿主和平台/市场/品牌 bundle，并在 Loader 装载前启用产品策略。

原桌面项目十份 alpha 兼容补丁重新适配到我们的 Harness 制品。编译后 chunk 文件名与原发行不同，因此补丁和制品摘要单独记录；固定的上游子模块只作参考。

Electron Node 模式下通过独立、无拆分 chunk 的私有 managed CLI 执行包管理检查，保留 profile 模块解析及普通 dsh 的产品策略。私有 helper 和 Node 依赖具有实体 ASAR-unpacked 路径。preset 发现需要磁盘存在性而不只是 import hook，因此受管 fallback 链接指向已校验的实体包，而不是虚拟 ASAR 子目录。

## Alternatives considered

**使用原版 Desktop runtime**会丢失我们的进程级模型与安装限制，因此产品固定使用自己的已校验运行时。

**同时装载两个社区市场**会产生其他安装入口，因此只保留签名目录市场，原生控件也不暴露其他包管理器和 profile 选择器。

**重新写壳只承载 Web 页面**会舍弃原项目的窗口、认证和生命周期实现，因此复用原生实现，只新增明确的产品入口和品牌原生栏。

**只测源码启动**会漏掉 ASAR 和原生 ABI 失败，因此当前平台打包后的 Electron 也执行相同的法律插件安装和会话持久化验收。

## Consequences

这是独立的受管产品分支/变体，不是对原稳定发行的透明替换，使用独立 App ID、home 和主题。不支持任意 profile 切换、社区自动更新、原生终端和恢复导入。公开公证发行、Windows/Universal 验收、线上目录与模型验收独立于当前 macOS ARM64 本地测试。首次依赖准备可能联网，制品不嵌入密钥。
