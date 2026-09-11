import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { PRODUCT_BUNDLES, prepareProductEnvironment, validateManagedProfile, desktopCommands } from '../src/managed-product.ts'
let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'lawyer-desktop-policy-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs() })
function profile(change: (data: { dependencies: Record<string, string>; dsh: { profile: { bundles: string[]; patchReload: string } } }) => void = () => {}) {
  const data = { dependencies: { '@lawyer-dsh/lawyer-platform': 'file:platform.tgz', '@lawyer-dsh/market': 'file:market.tgz', '@lawyer-dsh/lawyer-brand': 'file:brand.tgz' }, dsh: { profile: { bundles: [...PRODUCT_BUNDLES], patchReload: 'startup' } } }
  change(data)
  const path = join(root, 'profiles/lawyer'); mkdirSync(path, { recursive: true }); writeFileSync(join(path, 'package.json'), JSON.stringify(data))
  return path
}
describe('managed Desktop identity and profile admission', () => {
  it('retains the reviewed infrastructure in one fixed composition', () => {
    expect(validateManagedProfile(profile())).toEqual(expect.arrayContaining(['@lawyer-dsh/lawyer-brand', '@lawyer-dsh/market']))
  })
  it.each(['@lawyer-dsh/lawyer-platform', '@lawyer-dsh/market', '@lawyer-dsh/lawyer-brand'])('does not let restore remove %s', name => {
    expect(() => validateManagedProfile(profile(data => { data.dsh.profile.bundles = data.dsh.profile.bundles.filter(p => p !== name) }))).toThrow()
  })
  it('rejects live arbitrary recomposition and an unrecorded dependency', () => {
    expect(() => validateManagedProfile(profile(data => { data.dsh.profile.patchReload = 'live' }))).toThrow()
    expect(() => validateManagedProfile(profile(data => { data.dependencies['dshmarket'] = 'latest' }))).toThrow()
  })
  it('starts after the market records a community plugin under its author namespace', () => {
    const path = profile(data => {
      data.dependencies['@community/fixture-plugin'] = 'file:fixture.tgz'
      data.dsh.profile.bundles = [...PRODUCT_BUNDLES, '@community/fixture-plugin']
    })
    expect(() => validateManagedProfile(path)).toThrow(/未经市场许可/)
    writeFileSync(join(path, '.lawyer-installations.json'), JSON.stringify([{ id: 'fixture-plugin', packageName: '@community/fixture-plugin', version: '1.2.0', source: 'community', sha256: 'x', installedAt: '2026-09-09T00:00:00Z' }]))
    expect(validateManagedProfile(path)).toContain('@community/fixture-plugin')
  })
  it('clears inherited source/provider overrides and never touches unrelated settings', () => {
    for (const name of ['DSH_HOME', 'DSH_TELEMETRY_DISABLED', 'DEEPSEEK_BASE_URL', 'DSHM_REGISTRY_URL', 'DSHM_GITHUB_PROXY', 'DSHM_NPM_MIRROR', 'DSH_PERMISSION_MODE', 'DSH_TOOLS_MODE']) vi.stubEnv(name, 'untrusted')
    prepareProductEnvironment(root)
    expect(process.env.DSH_HOME).toBe(root)
    expect(process.env.DSH_TELEMETRY_DISABLED).toBe('1')
    expect(process.env.DEEPSEEK_BASE_URL).toBeUndefined()
    expect(process.env.DSHM_REGISTRY_URL).toBeUndefined()
    expect(process.env.DSH_PERMISSION_MODE).toBeUndefined()
  })
  it('uses Electron Node mode and the private managed CLI for subprocesses', () => {
    const commands = desktopCommands()
    expect(commands.pnpm.file).toBe(process.execPath)
    expect(commands.launcher.nodeMode).toBe(true)
    expect(commands.pnpm.nodeMode).toBe(true)
    expect(commands.launcher.args[0]).toMatch(/managed-cli\.js$/)
  })
})
