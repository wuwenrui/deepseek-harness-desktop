#!/usr/bin/env node
/** Prove a recipient can replace the unpacked LGPL library in a COPY of the final unsigned app. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const app = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(root, 'dist/mac-arm64/LawyerDesk.app'))
const productIndex = process.argv.indexOf('--product-root')
const productRoot = productIndex < 0 ? resolve(root, '../..') : resolve(process.argv[productIndex + 1])
const scratch = mkdtempSync(join(tmpdir(), 'lawyer-recipient-library-'))
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function library(application) {
  const dir = join(application, 'Contents/Resources/app.asar.unpacked/node_modules/@img/sharp-libvips-darwin-arm64/lib')
  const names = readdirSync(dir).filter(name => /^libvips-cpp.*\.dylib$/.test(name))
  assert.equal(names.length, 1)
  return join(dir, names[0])
}
function exercise(application) {
  const resources = join(application, 'Contents/Resources/app.asar.unpacked')
  const code = `const sharp=require(${JSON.stringify(join(resources, 'node_modules/sharp'))});(async()=>{const result=await sharp({create:{width:2,height:2,channels:4,background:'#ff0000'}}).png().toBuffer({resolveWithObject:true});console.log(JSON.stringify({info:result.info,sha256:require('node:crypto').createHash('sha256').update(result.data).digest('hex'),vips:sharp.versions.vips,loaded:process.report.getReport().sharedObjects.filter(path=>path.includes('libvips'))}))})().catch(e=>{console.error(e.message);process.exitCode=1})`
  const result = execFileSync(join(application, 'Contents/MacOS/LawyerDesk'), ['-e', code], { encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, ELECTRON_RUN_AS_NODE: '1' } })
  return JSON.parse(result.trim())
}
try {
  const originalLibrary = library(app), originalHash = sha(originalLibrary)
  const origin = JSON.parse(readFileSync(join(root, 'licenses/libvips/evidence/npm-origin.json'))).find(item => item.name === '@img/sharp-libvips-darwin-arm64' && item.version === '1.3.2')
  assert.equal(originalHash, origin?.installedBinarySha256, 'release library must match the source-reviewed upstream binary')
  const baseline = exercise(app)
  const copy = join(scratch, 'LawyerDesk.app')
  execFileSync('ditto', [app, copy])
  const replacement = library(copy)
  // Change actual Mach-O bytes while retaining the ABI. Only this recipient-owned copy is modified.
  execFileSync('install_name_tool', ['-id', '@rpath/modified-vips.dylib', replacement])
  execFileSync('codesign', ['--force', '--sign', '-', replacement], { stdio: ['ignore', 'pipe', 'pipe'] })
  const modifiedHash = sha(replacement)
  assert.notEqual(modifiedHash, originalHash)
  const result = exercise(copy)
  assert.equal(result.info.format, 'png'); assert.equal(result.info.width, 2); assert.equal(result.info.height, 2)
  assert.equal(result.sha256, baseline.sha256)
  assert.ok(result.loaded.some(path => realpathSync(path) === realpathSync(replacement)), 'the replaced dylib must actually be loaded')
  const boot = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/test-builtin-packaged.mjs'), '--product-root', productRoot, '--app', copy], { encoding: 'utf8', timeout: 180000 }).trim())
  assert.equal(boot.verified, true)
  assert.equal(sha(replacement), modifiedHash, 'normal startup must not restore the modified library')
  assert.equal(sha(originalLibrary), originalHash, 'the release app must remain untouched')
  const evidence = { verified: true, kind: 'recipient-byte-modified-ABI-compatible-shared-library', app, originalHash, modifiedHash, result, normalManagedStartup: boot, boundary: 'Checks replacement/loading/image processing in a copied unsigned app; not a full native source rebuild or quarantined Finder-install test.' }
  writeFileSync(join(root, 'dist/modified-libvips-verification.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence))
} finally { rmSync(scratch, { recursive: true, force: true }) }
