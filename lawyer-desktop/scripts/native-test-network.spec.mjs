import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
test('main and Node-mode child business HTTP stays local; alternate transports fail closed', async t => {
  const scratch = mkdtempSync(join(tmpdir(), 'native-network-guard-'))
  t.after(() => rmSync(scratch, { recursive: true, force: true }))
  let requests = 0
  const server = createServer((req, res) => { requests++; assert.equal(req.url, '/api/test'); res.end('local-fixture') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const preload = join(scratch, 'preload.mjs'), log = join(scratch, 'network.jsonl')
  writeFileSync(log, '')
  const options = { origin: `http://127.0.0.1:${server.address().port}`, log, childLog: join(scratch, 'children.log'), preload: pathToFileURL(preload).href }
  writeFileSync(preload, `import {installNetworkGuard} from ${JSON.stringify(new URL('./native-test-network.mjs', import.meta.url).href)}; installNetworkGuard(${JSON.stringify(options)});`)
  const code = `
    import assert from 'node:assert/strict'; import http from 'node:http'; import net from 'node:net'; import {spawn} from 'node:child_process';
    assert.equal(await(await fetch('https://model.codingrui.work/api/test')).text(),'local-fixture');
    assert.throws(()=>fetch('https://example.invalid/'),/blocked external/);
    assert.throws(()=>http.get('http://example.invalid/'),/blocked external/);
    assert.throws(()=>net.connect({host:'example.invalid',port:443}),/blocked external/);
    const child=spawn(process.execPath,['--input-type=module','-e',"import assert from 'node:assert/strict';assert.equal(await(await fetch('https://model.codingrui.work/api/test')).text(),'local-fixture');assert.throws(()=>fetch('https://example.invalid/'),/blocked external/);"],{env:{ELECTRON_RUN_AS_NODE:'1',PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',b=>errors+=b);const status=await new Promise(resolve=>child.on('close',resolve));assert.equal(status,0,errors);
  `
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''; child.stderr.on('data', bytes => { errors += bytes })
  assert.equal(await new Promise(resolve => child.on('close', resolve)), 0, errors)
  assert.equal(requests, 2)
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 4)
})
