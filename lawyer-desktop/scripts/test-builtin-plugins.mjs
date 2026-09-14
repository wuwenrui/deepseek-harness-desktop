#!/usr/bin/env node
/** Real LawyerDesk renderer smoke with a disposable home and a local-only model fixture. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
const args = process.argv.slice(2)
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const productRoot = resolve(option('--product-root', join(root, '../..')))
const { _electron: electron } = await import(pathToFileURL(join(productRoot, 'dsh-market/node_modules/playwright/index.mjs')))
const require = createRequire(join(root, 'package.json'))
const home = mkdtempSync(join(tmpdir(), 'lawyer-builtin-e2e-'))
const material = join(home, 'case-materials'); mkdirSync(material)
writeFileSync(join(material, '验收合同.txt'), '本地验收材料：服务费分两期支付，逾期责任待补充。\n')
writeFileSync(join(home, 'outside.txt'), 'outside-sentinel-never-readable')
symlinkSync(join(home, 'outside.txt'), join(material, '越界链接.txt'))
writeFileSync(join(material, '图片.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
const pdfStream = 'BT /F1 20 Tf 30 150 Td (LawyerDesk PDF fixture) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${pdfStream.length} >>\nstream\n${pdfStream}\nendstream`]
let pdf = '%PDF-1.4\n'; const offsets = [0]
for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` }
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
writeFileSync(join(material, '验收材料.pdf'), pdf)
const output = join(root, 'dist/builtin-plugins-e2e'); mkdirSync(output, { recursive: true })
const requests = [], errors = [], logs = [], traffic = []
const originalSpec = { title: '合同审查摘要', items: [{ type: 'table', columns: ['条款', '待核实事项'], rows: [['付款安排', '核对付款凭证']] }, { type: 'mermaid', code: 'flowchart LR\n A[材料核对] --> B[补充凭证]' }, { type: 'button', label: '补充分析', action: 'review_more' }] }
const updatedSpec = { title: '补充审查结果', items: [{ type: 'text', content: '已收到补充分析请求；未保存或发送任何材料。' }] }
const server = createServer(async (req, res) => {
  traffic.push(req.url)
  if (req.url === '/v1/models') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'deepseek-v4-flash', name: '本地验收模型' }] })); return }
  if (req.url === '/v1/chat/completions') {
    assert.equal(req.headers.authorization, 'Bearer builtin-test-token')
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks)); requests.push(body)
    const action = JSON.stringify(body.messages).includes('[genui-action]')
    const content = Array.isArray(body.tools) ? '```dsh-ui\n' + JSON.stringify(action ? updatedSpec : originalSpec) + '\n```' : '合同审查验收'
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const part of [content.slice(0, content.length / 2), content.slice(content.length / 2)]) {
      res.write(`data: ${JSON.stringify({ id: 'builtin-e2e', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: part }, finish_reason: null }] })}\n\n`)
    }
    res.write(`data: ${JSON.stringify({ id: 'builtin-e2e', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 40, total_tokens: 70 } })}\n\n`)
    res.end('data: [DONE]\n\n'); return
  }
  res.writeHead(404); res.end('fixture route not supplied')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const fixture = `http://127.0.0.1:${server.address().port}`
// Installed before the Electron entry runs: model/catalog traffic cannot reach production.
const preload = join(home, 'fixture-network.cjs')
writeFileSync(preload, `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(input instanceof Request?input.url:String(input));if(u.hostname==='model.codingrui.work'){const target=new URL(u.pathname+u.search,${JSON.stringify(fixture)});return original(input instanceof Request?new Request(target,input):target,init)}return original(input,init)};`)
const bootstrap = join(home, 'bootstrap.mjs')
writeFileSync(bootstrap, `import { createRequire } from 'node:module';const require=createRequire(process.execPath);require('electron').app.setAppPath(${JSON.stringify(root)});await import(${JSON.stringify(pathToFileURL(preload).href)});await import(${JSON.stringify(pathToFileURL(join(root, 'lib/main.js')).href)});`)
let instance, page
async function launch() {
  instance = await electron.launch({ executablePath: require('electron'), args: [bootstrap], env: { ...process.env, LAWYER_DESKTOP_HOME: home, ELECTRON_RUN_AS_NODE: '', NODE_OPTIONS: '' }, timeout: 90000 })
  let startupOutput = '', ready
  const healthy = new Promise(resolve => { ready = resolve })
  for (const stream of [instance.process().stdout, instance.process().stderr]) stream?.on('data', bytes => {
    const text = bytes.toString().replace(/token=\S+/g, 'token=[redacted]'); logs.push(text); startupOutput += text
    if (startupOutput.includes('"event":"lawyer-desktop-ready"')) ready()
  })
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) { page = instance.windows().find(p => p.url().startsWith('http://127.0.0.1:')); if (page) break; await new Promise(r => setTimeout(r, 200)) }
  assert.ok(page, 'real LawyerDesk WebContentsView not created')
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 30000 })
  let timer
  try { await Promise.race([healthy, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('desktop did not confirm healthy startup')), 30000) })]) }
  finally { clearTimeout(timer) }
}
async function close() {
  if (!instance) return
  const child = instance.process(); child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
  try { await instance.close() } finally { clearTimeout(timer); instance = undefined; page = undefined }
}
try {
  await launch()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '模型服务', exact: true }).click()
  await page.getByLabel('本站 API 令牌', { exact: true }).fill('builtin-test-token')
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
  const input = page.locator('[data-composer-input][contenteditable=true]').last()
  await input.waitFor({ timeout: 15000 }); await input.fill('请用合同审查摘要展示验收结果，不执行任何写入或发送操作。'); await input.press('Enter')
  await page.getByRole('button', { name: '补充分析', exact: true }).first().waitFor({ timeout: 30000 })
  assert.ok(requests.length)
  const conversationRequest = requests.find(request => Array.isArray(request.tools))
  assert.ok(conversationRequest, 'conversation request was not observed')
  const toolNames = conversationRequest.tools.map(tool => tool.function?.name ?? tool.name)
  for (const name of ['render_ui', 'validate_dsh_ui']) assert.ok(toolNames.includes(name), `missing ${name}`)
  assert.ok(!toolNames.some(name => name.startsWith('terminal_')))
  assert.ok(!JSON.stringify(conversationRequest.messages).includes('默认就该出 UI'))
  await page.locator('svg').filter({ hasText: '材料核对' }).first().waitFor({ timeout: 30000 })
  await page.screenshot({ path: join(output, 'genui-inline.png') })
  await page.getByRole('button', { name: '补充分析', exact: true }).first().click()
  await page.getByText('已收到补充分析请求；未保存或发送任何材料。', { exact: true }).first().waitFor({ timeout: 30000 })
  await page.screenshot({ path: join(output, 'genui-action.png') })
  const materialListResponse = page.waitForResponse(response => response.url().includes('/lawyer-materials/list?'))
  await page.locator('[data-sidebar-right-expand]').click()
  const shelf = page.locator('[data-lawyer-materials]')
  if (!(await shelf.isVisible())) await page.getByRole('button', { name: /本会话材料/ }).click()
  await shelf.getByRole('button', { name: /验收合同.txt/ }).click()
  await shelf.getByText('本地验收材料：服务费分两期支付，逾期责任待补充。', { exact: true }).waitFor()
  const listResponse = await materialListResponse
  const sessionId = new URL(listResponse.url()).searchParams.get('sessionId')
  assert.ok(!(await listResponse.json()).items.some(item => item.name === '越界链接.txt'))
  const protectedReads = await page.evaluate(async sessionId => {
    const request = (path, method = 'GET') => fetch(`/lawyer-materials/${path}`, { method }).then(response => response.status)
    const sid = `sessionId=${encodeURIComponent(sessionId)}`
    return Promise.all([request(`preview?${sid}&path=../outside.txt`), request(`preview?${sid}&path=${encodeURIComponent('越界链接.txt')}`), request(`list?${sid}`, 'POST'), request(`list?${sid}&cwd=/tmp`)])
  }, sessionId)
  assert.deepEqual(protectedReads, [403, 403, 405, 400])
  const beforeReference = requests.filter(request => Array.isArray(request.tools)).length
  await shelf.getByRole('button', { name: '引用到对话', exact: true }).click()
  await shelf.getByText('已引用到输入框，发送前可以继续补充问题。', { exact: true }).waitFor()
  assert.ok((await input.innerText()).includes('验收合同.txt'))
  assert.equal(requests.filter(request => Array.isArray(request.tools)).length, beforeReference, 'referencing a document must not send a model request')
  await page.screenshot({ path: join(output, 'materials-reference.png') })
  await shelf.getByRole('button', { name: /图片.png/ }).click()
  await shelf.locator('img').waitFor()
  await page.waitForFunction(() => document.querySelector('[data-lawyer-materials] img')?.naturalWidth === 1)
  await shelf.getByRole('button', { name: /验收材料.pdf/ }).click()
  await shelf.getByTitle('预览 验收材料.pdf').waitFor()
  // Chromium's PDF renderer is an out-of-process guest, not the outer Playwright iframe.
  let pdfRendered = false
  const pdfDeadline = Date.now() + 15000
  while (!pdfRendered && Date.now() < pdfDeadline) {
    pdfRendered = await instance.evaluate(async ({ webContents }) => {
      for (const frame of webContents.getAllWebContents().flatMap(contents => contents.mainFrame.framesInSubtree)) {
        if (!frame.url.startsWith('blob:')) continue
        const rendered = await frame.executeJavaScript(`Boolean(document.querySelector('embed[type="application/x-google-chrome-pdf"][javascript="block"]') && parseFloat(document.querySelector('#sizer')?.style.height) > 0)`).catch(() => false)
        if (rendered) return true
      }
      return false
    })
    if (!pdfRendered) await page.waitForTimeout(100)
  }
  assert.equal(pdfRendered, true, 'native PDF must have real page dimensions and blocked document JavaScript')
  await shelf.getByTitle('预览 验收材料.pdf').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(output, 'materials-pdf.png') })
  const unsafe = await page.evaluate(async () => {
    const result = {}
    for (const path of ['/sidebar/api', '/sidebar/terminal', '/lawyer-materials/fs.write', '/lawyer-materials/list?sessionId=missing']) {
      const r = await fetch(path, { method: path.includes('fs.write') ? 'POST' : 'GET' }); result[path] = r.status
    }
    return result
  })
  for (const [path, status] of Object.entries(unsafe)) assert.ok(status >= 400, `unsafe route succeeded: ${path}`)
  const manifestPath = join(home, 'profiles/lawyer/package.json')
  const current = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.ok(current.dependencies['@changfenhuang/dsh-genui']); assert.ok(current.dependencies['dsh-better-sidebar'])
  await close()
  // Simulate an old installation missing BOTH package dependencies, not only its bundle prefix.
  const legacy = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const name of ['@changfenhuang/dsh-genui', 'dsh-better-sidebar']) { delete legacy.dependencies[name]; legacy.dsh.profile.bundles = legacy.dsh.profile.bundles.filter(bundle => bundle !== name) }
  writeFileSync(manifestPath, JSON.stringify(legacy))
  await launch()
  const upgraded = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const name of ['@changfenhuang/dsh-genui', 'dsh-better-sidebar']) assert.ok(upgraded.dependencies[name])
  assert.deepEqual(errors, [])
  assert.equal(existsSync(join(home, 'product-artifacts/.upgrade/transaction.json')), false, 'renderer health must finalize the pending upgrade')
  writeFileSync(join(output, 'result.json'), JSON.stringify({ verified: true, home, modelCalls: requests.length, unsafe, errors }, null, 2))
  console.log(JSON.stringify({ verified: true, home, output, modelCalls: requests.length }))
} finally {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(output, 'last-page.png') }).catch(() => {})
    writeFileSync(join(output, 'last-page.txt'), await page.locator('body').innerText().catch(() => 'page closed'))
  }
  writeFileSync(join(output, 'traffic.json'), JSON.stringify(traffic))
  writeFileSync(join(output, 'runtime.log'), logs.join(''))
  await close(); await new Promise(resolve => server.close(resolve))
}
