import { lstatSync, readlinkSync, readdirSync, unlinkSync as unlinkFallback, symlinkSync } from 'node:fs'
/** Product-owned profile preparation and command identities for the lawyer desktop. */
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runOwned, safeEnvironment } from '@lawyer-dsh/market/managed-process'
import { recoverManagedProfile } from '@lawyer-dsh/market/managed-engine'
import type { Command } from '@lawyer-dsh/market/managed-process'

const require = createRequire(import.meta.url)
export const PRODUCT_NAME = 'LawyerCopilot'
export const PRODUCT_PROFILE = 'lawyer'
export const PRODUCT_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@lawyer-dsh/lawyer-platform', '@lawyer-dsh/lawyer-brand', '@lawyer-dsh/market'] as const

/** Node subprocesses must use physical package files when the shell is in ASAR. */
export function physicalPackageFile(name: string, file: string): string {
  const manifest = require.resolve(name === 'pnpm' ? 'pnpm' : `${name}/package.json`)
  const path = join(dirname(manifest), file)
  if (app.isPackaged) {
    const unpacked = path.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
    if (!existsSync(unpacked)) throw new Error(`产品运行文件缺失：${name}/${file}`)
    return unpacked
  }
  return path
}

export function desktopCommands(): { pnpm: Command; launcher: Command } {
  const pnpmManifest = require('pnpm') as { bin: { pnpm: string } }
  return {
    pnpm: { file: process.execPath, args: [physicalPackageFile('pnpm', pnpmManifest.bin.pnpm)], nodeMode: true },
    launcher: { file: process.execPath, args: [fileURLToPath(new URL('./managed-cli.js', import.meta.url)).replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')], nodeMode: true },
  }
}

/** Prepare only the private managed profile. Existing case files and credentials are never copied or reset. */
export async function prepareManagedProduct(home: string): Promise<string> {
  const profile = join(home, 'profiles', PRODUCT_PROFILE)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  await recoverManagedProfile(profile)
  const pending = join(profile, '.lawyer-initializing')
  if (existsSync(join(profile, 'package.json'))) {
    if (existsSync(pending)) {
      validateManagedProfile(profile)
      const command = desktopCommands().pnpm
      await runOwned({ ...command, args: [...command.args, 'install', '--ignore-scripts', '--config.auto-install-peers=false'] }, profile, safeEnvironment())
      unlinkSync(pending)
    }
    return profile
  }
  const seed = app.isPackaged ? join(process.resourcesPath, 'lawyer-product') : fileURLToPath(new URL('../../vendor/lawyer-product/', import.meta.url))
  const cache = join(home, 'product-artifacts')
  mkdirSync(cache, { recursive: true, mode: 0o700 })
  const dependencies: Record<string, string> = {}
  for (const [name, archive] of [['@lawyer-dsh/lawyer-platform', 'platform.tgz'], ['@lawyer-dsh/lawyer-brand', 'brand.tgz'], ['@lawyer-dsh/market', 'market.tgz']] as const) {
    const bytes = readFileSync(join(seed, archive))
    const digest = createHash('sha256').update(bytes).digest('hex')
    const target = join(cache, `${digest}.tgz`)
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 })
    else if (createHash('sha256').update(readFileSync(target)).digest('hex') !== digest) throw new Error('产品内置插件校验失败')
    dependencies[name] = `file:${target}`
  }
  mkdirSync(profile, { recursive: true, mode: 0o700 })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'lawyer-desktop-managed-profile', private: true, dependencies, dsh: { profile: { bundles: PRODUCT_BUNDLES, patchReload: 'startup' } } }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n', { mode: 0o600 })
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), `autoInstallPeers: false\nallowBuilds: {}\nstoreDir: ${JSON.stringify(join(home, 'product-pnpm-store'))}\n`, { mode: 0o600 })
  writeFileSync(pending, 'initialization in progress\n', { mode: 0o600 })
  const command = desktopCommands().pnpm
  await runOwned({ ...command, args: [...command.args, 'install', '--ignore-scripts', '--config.auto-install-peers=false'] }, profile, safeEnvironment())
  unlinkSync(pending)
  return profile
}

/** Assert installed profile structure; recovery/import cannot substitute a different model or marketplace. */
export function validateManagedProfile(profile: string): string[] {
  const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: unknown; patchReload?: unknown } } }
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || manifest.dsh?.profile?.patchReload !== 'startup') throw new Error('无效的受管产品配置')
  for (let index = 0; index < PRODUCT_BUNDLES.length; index++) if (bundles[index] !== PRODUCT_BUNDLES[index]) throw new Error('不允许替换受管产品基础组件')
  // Dependencies may be product packages or plugins the managed market recorded.
  // Community plugins live under their authors' namespaces, so a name-prefix
  // rule would refuse to start after a legitimate install.
  const recorded = new Set<string>()
  try {
    const rows: unknown = JSON.parse(readFileSync(join(profile, '.lawyer-installations.json'), 'utf8'))
    if (Array.isArray(rows)) for (const row of rows) {
      if (row !== null && typeof row === 'object' && typeof (row as { packageName?: unknown }).packageName === 'string') {
        recorded.add((row as { packageName: string }).packageName)
      }
    }
  } catch { /* No install record yet: only the product packages are admitted. */ }
  const dependencies = Object.keys(manifest.dependencies ?? {})
  for (const name of dependencies) {
    if (!PRODUCT_BUNDLES.includes(name as typeof PRODUCT_BUNDLES[number]) && !recorded.has(name)) {
      throw new Error(`产品配置包含未经市场许可的软件包：${name}`)
    }
  }
  return dependencies
}

/** Never apply global environment provider overrides or remote-control settings. */
export function prepareProductEnvironment(home: string): void {
  process.env.DSH_HOME = resolve(home)
  process.env.DSH_TELEMETRY_DISABLED = '1'
  for (const name of ['DEEPSEEK_BASE_URL', 'DSHM_REGISTRY_URL', 'DSHM_GITHUB_PROXY', 'DSHM_NPM_MIRROR', 'DSH_PERMISSION_MODE', 'DSH_TOOLS_MODE']) delete process.env[name]
}

/** Preset health checks walk disk rather than import hooks. Keep fallback links on the shipped physical runtime. */
export function healPhysicalPresetFallback(home: string): void {
  if (!app.isPackaged) return
  const modules = join(home, 'profiles', 'node_modules')
  if (!existsSync(modules)) return
  const directories = readdirSync(modules, { withFileTypes: true }).flatMap(entry => {
    const path = join(modules, entry.name)
    return entry.name.startsWith('@') && entry.isDirectory()
      ? readdirSync(path).map(name => join(path, name)) : [path]
  })
  for (const path of directories) {
    if (!lstatSync(path).isSymbolicLink()) continue
    const target = readlinkSync(path)
    if (!target.startsWith(join(process.resourcesPath, 'app.asar', 'node_modules'))) continue
    const physical = target.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
    if (!existsSync(join(physical, 'package.json'))) throw new Error('预设依赖的实体运行包缺失：' + physical)
    unlinkFallback(path)
    symlinkSync(physical, path, process.platform === 'win32' ? 'junction' : 'dir')
  }
}
