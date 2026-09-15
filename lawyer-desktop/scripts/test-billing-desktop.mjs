#!/usr/bin/env node
/** Real Electron billing acceptance; product Web assertions run against the native carrier.
 * Explicit layout: <product-root>/{lawyer-harness,dsh-market}. No shared checkout fallback.
 * All site traffic is redirected before the source entry loads; other remote fetches fail closed.
 */
import assert from 'node:assert/strict'
import { prepareBillingInstallation, inspectNativeCarrier } from './billing-test-installation.mjs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packaged = process.argv.includes('--packaged')
const output = join(root, 'dist', packaged ? 'billing-packaged' : 'billing-source'); mkdirSync(output, { recursive: true })
rmSync(join(output, 'report.json'), { force: true })
const index = process.argv.indexOf('--product-root')
assert.ok(index >= 0 && process.argv[index + 1], 'Pass --product-root <isolated reviewed layout>')
const productRoot = resolve(process.argv[index + 1])
const { _electron: electron } = await import(pathToFileURL(join(productRoot, 'dsh-market/node_modules/playwright/index.mjs')))
const { createBillingFixture, checkBilling } = await import(pathToFileURL(join(productRoot, 'lawyer-harness/tests/managed/billing-checks.mjs')))
const require = createRequire(join(root, 'package.json'))
const home = mkdtempSync(join(tmpdir(), 'lawyer-native-billing-'))
console.log('Native billing fixture home: ' + home)
function requiredOption(name) { const i = process.argv.indexOf(name); assert.ok(i >= 0 && process.argv[i + 1], `Pass ${name}`); return resolve(process.argv[i + 1]) }
const testTrust = requiredOption('--test-trust')
const dependencyStore = requiredOption('--dependency-store')
const material = join(home, 'case-materials'); mkdirSync(material)
writeFileSync(join(material, '验收合同.txt'), '本地费用核对验收；不发送真实材料，不创建真实订单。\n')
const central = requiredOption('--catalog-dir')
const fixture = await createBillingFixture(), chatBodies = [], traffic = [], pageErrors = [], fixtureErrors = []
let bootstrapConversation = true
const server = createServer(async (req, res) => {
  try {
    traffic.push({ method: req.method, path: req.url })
    if (await fixture.handle(req, res)) return
    if (req.url === '/lawyer-market/catalog.json') { res.setHeader('content-type', 'application/json'); res.end(readFileSync(join(central, 'catalog.json'))); return }
    const artifact = /^\/lawyer-market\/artifacts\/([a-f0-9]{64}\.tgz)$/.exec(req.url ?? '')
    if (artifact) { res.end(readFileSync(join(central, 'artifacts', artifact[1]))); return }
    if (req.url === '/v1/models') {
      assert.equal(req.headers.authorization, 'Bearer integration-only-token')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: [{ id: 'deepseek-v4-flash', name: '本地费用验收模型', context_window: 32768, max_tokens: 4096 }] })); return
    }
    if (req.url === '/v1/chat/completions') {
      assert.equal(req.headers.authorization, 'Bearer integration-only-token')
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks)); chatBodies.push(body)
      const base = { id: 'native-billing', object: 'chat.completion.chunk', created: 1, model: body.model }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: bootstrapConversation ? '桌面会话已就绪。' : '费用核对后的模型回复。' }, finish_reason: null }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 } })}\n\n`)
      res.end('data: [DONE]\n\n'); return
    }
    throw new Error('Unexpected fixture route: ' + req.url)
  } catch (error) { fixtureErrors.push(String(error)); res.writeHead(500); res.end('fixture assertion failed') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const local = `http://127.0.0.1:${server.address().port}`
let installation, report, nativeCarrier
async function prepare() { installation = await prepareBillingInstallation({ root, scratch: home, packaged, testTrust, require, dependencyStore, origin: local,
  bootstrap: (entry, appPath) => `import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); ${appPath ? `require('electron').app.setAppPath(${JSON.stringify(appPath)});` : ''}
await import(${JSON.stringify(entry)});`
}) }
let instance, currentPage, logs = ''
// The product assertion suite retains its page object across restart; resolve it lazily.
const page = new Proxy({}, { get(_target, key) { const value = currentPage[key]; return typeof value === 'function' ? value.bind(currentPage) : value } })
async function launch() {
  const env = { ...process.env, LAWYER_DESKTOP_HOME: home, ELECTRON_RUN_AS_NODE: '', NODE_OPTIONS: '', NODE_PATH: '' }
  for (const key of ['NEW_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_BASE_URL']) delete env[key]
  instance = await electron.launch({ executablePath: installation.executablePath, args: installation.args, env, timeout: 120000 })
  let startup = ''
  for (const stream of [instance.process().stdout, instance.process().stderr]) stream?.on('data', b => { const text = b.toString().replace(/token=\S+/g, 'token=[redacted]'); logs += text; startup += text })
  await instance.context().route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ? route.abort('blockedbyclient') : route.continue()
  })
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (instance.process().exitCode != null || instance.process().signalCode != null) throw new Error('native startup exited: ' + startup)
    currentPage = instance.windows().find(p => p.url().startsWith('http://127.0.0.1:'))
    if (currentPage && startup.includes('"event":"lawyer-desktop-ready"')) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(currentPage && startup.includes('"event":"lawyer-desktop-ready"'), 'native healthy startup not confirmed: ' + startup)
  currentPage.on('pageerror', error => pageErrors.push(error.message))
  await page.getByRole('button', { name: '设置', exact: true }).waitFor()
  await currentPage.waitForFunction(() => document.readyState === 'complete' && Boolean(window.__DSH_BOOT__))
  nativeCarrier = await inspectNativeCarrier(instance, { packaged, executablePath: installation.executablePath, scratch: home })
}
async function close() {
  if (!instance) return
  const child = instance.process(); child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
  try { await instance.close() } finally { clearTimeout(timer); instance = undefined; currentPage = undefined }
}
async function api(path) {
  return page.evaluate(async path => { const r = await fetch('/dsh-market/' + path, { headers: { 'x-lawyer-market': '1' } }); return { status: r.status, body: await r.json() } }, path)
}
try {
  await prepare()
  await launch()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '模型服务', exact: true }).click()
  await page.getByLabel('本站 API 令牌', { exact: true }).fill('integration-only-token')
  await page.getByRole('button', { name: '保存令牌', exact: true }).click()
  await page.getByText('令牌已保存，可刷新可用模型。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '刷新可用模型', exact: true }).click()
  await page.getByText('保存成功', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('textbox', { name: '选择工作区' }).click()
  const picker = page.getByRole('dialog', { name: '选择工作区目录' })
  await picker.getByRole('button', { name: '编辑路径' }).click()
  await picker.getByRole('textbox', { name: '编辑路径' }).fill(material)
  await picker.getByRole('textbox', { name: '编辑路径' }).press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click()
  // The shared Web suite starts from an existing conversation. Create one through the
  // actual native composer before installing the optional billing plugin.
  const composer = page.locator('[data-composer-input][contenteditable=true]').last()
  await composer.fill('BOOTSTRAP_SESSION 仅创建本地验收会话。'); await composer.press('Enter')
  await page.getByText('桌面会话已就绪。', { exact: true }).last().waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden' })
  bootstrapConversation = false
  const origin = { toString: () => new URL(page.url()).origin }
  const billing = await checkBilling({ page, api, restart: async () => {
    const previous = new URL(page.url()); previous.searchParams.delete('token')
    await close(); await launch()
    await currentPage.goto(new URL(previous.pathname + previous.search + previous.hash, new URL(currentPage.url()).origin).href)
    // Native startup opens a fresh tab; resume the persisted conversation from its sidebar.
    await page.getByText('桌面会话已就绪。', { exact: true }).first().click()
  }, output, chatBodies, fixture, origin })
  await close()
  const manifest = join(home, 'profiles/lawyer/package.json')
  const before = JSON.parse(readFileSync(manifest))
  const originalBundles = [...before.dsh.profile.bundles]
  assert.ok(before.dsh.profile.bundles.includes('@lawyer-dsh/lawyer-billing'))
  before.dsh.profile.bundles = before.dsh.profile.bundles.filter(name => !['@changfenhuang/dsh-genui', 'dsh-better-sidebar', '@deepseek-ai/dsh-experimental-agent-team-profile', '@deepseek-ai/dsh-experimental-agent-team-web-profile'].includes(name))
  writeFileSync(manifest, JSON.stringify(before, null, 2) + '\n')
  await launch()
  const upgraded = JSON.parse(readFileSync(manifest))
  assert.deepEqual(upgraded.dsh.profile.bundles, originalBundles, 'upgrade must restore every mandatory layer in order and preserve optional billing')
  assert.ok((await api('installed')).body.installed.some(item => item.id === 'lawyer-billing'))
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '模型服务', exact: true }).click()
  await page.getByRole('button', { name: '账户与充值', exact: true }).click()
  await page.getByRole('dialog', { name: '费用与充值', exact: true }).getByTestId('billing-account-balance').getByText('¥112.00', { exact: true }).waitFor()
  assert.deepEqual(pageErrors, []); assert.deepEqual(fixtureErrors, [])
  report = { verified: true, kind: packaged ? 'real-packaged-electron-billing-disposable-copy' : 'real-source-electron-billing-disposable-copy', productRoot, central, testTrust, home, nativeCarrier, billing, upgradePreservedOptionalBilling: true, pageErrors, traffic, modelCalls: chatBodies.length, productionModelCalls: false, realOrders: false, realBark: false }
} catch (error) {
  writeFileSync(join(output, 'failure.log'), String(error.stack ?? error) + '\n' + logs)
  if (currentPage) { await currentPage.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); writeFileSync(join(output, 'failure-page.txt'), await currentPage.locator('body').innerText().catch(() => '')) }
  console.error(error); process.exitCode = 1
} finally {
  const settled = await Promise.allSettled([close(), (async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fixture.close?.() })()])
  try {
    installation?.assertOriginalUnchanged()
    installation?.assertNoExternalAttempts()
    for (const result of settled) if (result.status === 'rejected') throw result.reason
  } catch (error) { process.exitCode = 1; writeFileSync(join(output, 'failure.log'), String(error.stack ?? error)); console.error(error) }
  writeFileSync(join(output, 'runtime.log'), logs)
}
if (report && !process.exitCode) {
  report.originalAppAndTrustUnchanged = true; report.guardedExternalTransportAttempts = 0
  report.networkBoundary = 'Application fetch/http/socket, managed Electron-Node children and renderer sessions; not an OS-wide packet capture'
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
