#!/usr/bin/env node
/** Keyless boot of the exact unsigned app: no model credentials or test-code injection. */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const productRoot = process.argv[process.argv.indexOf('--product-root') + 1]
if (!process.argv.includes('--product-root')) throw new Error('Pass --product-root <lawyerDesk directory>')
const { _electron: electron } = await import(pathToFileURL(join(resolve(productRoot), 'dsh-market/node_modules/playwright/index.mjs')))
const appIndex = process.argv.indexOf('--app')
const application = appIndex < 0 ? join(root, 'dist/mac-arm64/LawyerDesk.app') : resolve(process.argv[appIndex + 1])
const executablePath = join(application, 'Contents/MacOS/LawyerDesk')
assert.ok(existsSync(executablePath), 'build the unsigned current-host directory package first')
const home = mkdtempSync(join(tmpdir(), 'lawyer-packaged-builtin-'))
const env = { ...process.env, LAWYER_DESKTOP_HOME: home, NODE_OPTIONS: '', NODE_PATH: '', ELECTRON_RUN_AS_NODE: '' }
for (const key of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_BASE_URL']) delete env[key]
let instance, page, logs = '', healthy = false
try {
  instance = await electron.launch({ executablePath, args: [], env, timeout: 120000 })
  for (const stream of [instance.process().stdout, instance.process().stderr]) stream?.on('data', bytes => { logs += bytes.toString().replace(/token=\S+/g, 'token=[redacted]'); healthy ||= logs.includes('"event":"lawyer-desktop-ready"') })
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    page = instance.windows().find(page => page.url().startsWith('http://127.0.0.1:'))
    if (page && healthy) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(page && healthy, logs || 'packaged app did not report healthy startup')
  await page.getByRole('button', { name: '设置', exact: true }).waitFor()
  const state = await page.evaluate(async () => {
    const response = await fetch('/lawyer-platform/ready')
    return { ready: await response.json(), materialsClient: !!document.querySelector('style[data-plugin="lawyer-materials"]') }
  })
  assert.ok(state.ready.tools.includes('render_ui') && state.ready.tools.includes('validate_dsh_ui'))
  assert.equal(state.materialsClient, true)
  const profile = JSON.parse(readFileSync(join(home, 'profiles/lawyer/package.json')))
  for (const name of ['@changfenhuang/dsh-genui', 'dsh-better-sidebar']) assert.ok(profile.dependencies[name] && profile.dsh.profile.bundles.includes(name))
  assert.equal(existsSync(join(home, 'product-artifacts/.upgrade/transaction.json')), false)
  await page.screenshot({ path: join(home, 'packaged-startup.png') })
  writeFileSync(join(home, 'result.json'), JSON.stringify({ verified: true, kind: 'exact-unsigned-app-keyless-startup', home, executablePath, state }, null, 2))
  console.log(JSON.stringify({ verified: true, home, executablePath }))
} finally {
  writeFileSync(join(home, 'runtime.log'), logs)
  if (instance) { const child = instance.process(); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 15000); try { await instance.close() } finally { clearTimeout(timer) } }
}
