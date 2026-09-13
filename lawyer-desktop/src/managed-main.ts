/** Managed LawyerDesk bootstrap over Anywhere Labs' Electron shell and DSH Web carrier. */
import { app, dialog } from 'electron'
import { Context } from '@deepseek-ai/cordis'
import { boot, composeEntries, healProfilesModuleFallback, loadLayeredEnv, loadOptionalPatches, loadOverlayPatches, loadProfile } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { assertLawyerComposition, claimLawyerProcess, enableLawyerPolicy, installLawyerFetchPolicy, protectLawyerFiles } from '@deepseek-ai/dsh-product-policy'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { ElectronDesktopRuntime } from './electron-runtime.ts'
import { createDesktopBrowserAccess } from './desktop-browser-access.ts'
import { DesktopLanHttpsRuntime } from './lan-https-runtime.ts'
import { installProfilePackageResolver } from './module-resolution.ts'
import { PRODUCT_NAME, PRODUCT_PROFILE, desktopCommands, prepareManagedProduct, prepareProductEnvironment, validateManagedProfile, healPhysicalPresetFallback } from './managed-product.ts'

const packageName = 'lawyer-dsh-desktop'
const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const home = process.env.LAWYER_DESKTOP_HOME ?? join(homedir(), '.lawyercopilot-managed-desktop')
mkdirSync(home, { recursive: true, mode: 0o700 })
app.setName(PRODUCT_NAME)
app.setPath('userData', join(home, 'desktop-shell'))
mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 })
app.setAppUserModelId('work.codingrui.lawyer.desktop')
prepareProductEnvironment(home)
enableLawyerPolicy()
installLawyerFetchPolicy()
protectLawyerFiles(home, installAnchor)

let ctx: Context | undefined
let releaseInstance: (() => void) | undefined
let shutdown: Promise<void> | undefined
let stopping = false
const runtime = new ElectronDesktopRuntime(async () => { app.relaunch(); await stop(0) })

/** Release the complete Host before Electron exits; restart never imports arbitrary recovery configuration. */
function stop(code: number): Promise<void> {
  if (shutdown !== undefined) return shutdown
  stopping = true
  runtime.prepareToQuit()
  shutdown = (async () => {
    try { await ctx?.fiber.dispose() } finally { releaseInstance?.(); app.exit(code) }
  })()
  return shutdown
}
app.on('before-quit', event => { if (!stopping) { event.preventDefault(); void stop(0) } })
process.once('SIGTERM', () => { void stop(0) })
process.once('SIGINT', () => { void stop(0) })
app.on('second-instance', () => runtime.show())
app.on('activate', () => runtime.show())

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) { app.exit(0); return }
  await app.whenReady()
  const directory = await prepareManagedProduct(home)
  releaseInstance = claimLawyerProcess(home)
  const dependencies = validateManagedProfile(directory)
  const profile = loadProfile(packageName, PRODUCT_PROFILE, installAnchor, home)
  const homePatches = loadOptionalPatches(packageName, join(home, 'cordis.patch.yml')) ?? []
  if (profile.patches.length > 0 || homePatches.length > 0) throw new Error('受管桌面版不允许用户或恢复配置覆盖产品基础组件')
  await healProfilesModuleFallback({ installAnchor, profile })
  healPhysicalPresetFallback(home)
  const baseUrl = pathToFileURL(join(directory, 'package.json')).href
  const releaseResolver = installProfilePackageResolver(baseUrl)
  const patches: PatchOptions[] = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...loadOverlayPatches(packageName, fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))),
    { id: 'webserver', disabled: true },
    { insert: [{ id: 'lawyer-desktop-webserver', name: `${packageName}/webserver`, config: { host: '127.0.0.1', port: 0 } }] },
  ]
  assertLawyerComposition(composeEntries([patches]), [...dependencies, packageName, `${packageName}/webserver`])
  writeFileSync(join(directory, 'cordis.yml'), '[]\n', { mode: 0o600 })
  const browserAccess = createDesktopBrowserAccess(false)
  const lan = new DesktopLanHttpsRuntime({ addresses: [], requestedPort: 0 })
  const callbacks = new Set<() => void>()
  let ready = false
  const appReady = { onReady(callback: () => void) { if (ready) callback(); else callbacks.add(callback); return () => { callbacks.delete(callback) } } }
  const environment = loadLayeredEnv(packageName)
  const commands = desktopCommands()
  try {
    ctx = await boot(packageName, join(directory, 'cordis.yml'), patches, host => {
      host.loader.internal = undefined
      host.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
      host.provide('desktopRuntime', runtime)
      host.provide('desktopBrowserAccess', browserAccess)
      host.provide('desktopLanHttps', lan)
      host.provide('lawyerDesktopRuntime', Object.freeze({ profileDirectory: directory, ...commands }))
      host.effect(() => releaseResolver, 'lawyer-desktop: package resolver')
      provideCmdline(host, { args: ['--port', '0', '--no-open'], exit: code => { void stop(code) }, ready: appReady })
    }, baseUrl)
  } catch (error) { releaseResolver(); throw error }
  ready = true
  for (const callback of callbacks) callback()
  callbacks.clear()
  const rendered = runtime.beginRendererBootMonitoring({ commitHealthy: async () => {} })
  const [, verdict] = await Promise.all([runtime.mountScheduled(), rendered])
  if ('failureReason' in verdict) throw new Error(`桌面界面启动失败：${verdict.failureReason}`)
  console.log(JSON.stringify({ event: 'lawyer-desktop-ready', home, profile: PRODUCT_PROFILE, port: ctx.webServer.port, product: PRODUCT_NAME }))
}

void main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`lawyer-desktop: ${message.replace(/token=\S+/g, 'token=[redacted]')}`)
  if (app.isReady()) await dialog.showMessageBox({ type: 'error', title: '律衡', message: '工作台未能完成启动', detail: message, buttons: ['关闭'] })
  await stop(1)
})
