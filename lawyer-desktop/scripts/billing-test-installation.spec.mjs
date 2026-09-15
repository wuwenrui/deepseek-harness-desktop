import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareBillingInstallation } from './billing-test-installation.mjs'
const realRequire = createRequire(import.meta.url)
const asar = realRequire('@electron/asar')
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'billing-installation-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = join(dir, 'source/lawyer-desktop'), scratch = join(dir, 'scratch')
  const platform = join(root, 'node_modules/@lawyer-dsh/lawyer-platform')
  mkdirSync(platform, { recursive: true }); mkdirSync(scratch)
  mkdirSync(join(root, '../node_modules'))
  const production = '{"identity":"production-public-trust"}\n'
  writeFileSync(join(platform, 'trust.json'), production)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'test-desktop', main: 'lib/main.js', type: 'module', build: { mac: { asarUnpack: ['node_modules/**', 'package.json', 'lib/managed-cli.js'] } } }))
  mkdirSync(join(root, 'lib')); writeFileSync(join(root, 'lib/main.js'), 'export const fixture = true;\n')
  const seed = join(root, '../vendor/lawyerDesk'); mkdirSync(seed, { recursive: true })
  const input = join(dir, 'seed/package'); mkdirSync(input, { recursive: true })
  writeFileSync(join(input, 'trust.json'), production)
  execFileSync('tar', ['-czf', join(seed, 'platform.tgz'), '-C', join(dir, 'seed'), 'package'])
  for (const name of ['brand.tgz', 'market.tgz', 'genui.tgz', 'materials.tgz', 'builtin-plugins.json']) writeFileSync(join(seed, name), name)
  const testTrust = join(dir, 'test-trust.json'); writeFileSync(testTrust, '{"identity":"temporary-public-trust"}\n')
  return { root, scratch, seed, testTrust, production, require: name => name === 'electron' ? '/fixture/Electron' : realRequire(name), bootstrap: entry => `await import(${JSON.stringify(entry)});` }
}
test('source carrier changes only copied seed and copied installed trust', async t => {
  const options = fixture(t)
  const installed = await prepareBillingInstallation({ ...options, packaged: false })
  assert.equal(JSON.parse(readFileSync(join(installed.appRoot, 'node_modules/@lawyer-dsh/lawyer-platform/trust.json'))).identity, 'temporary-public-trust')
  assert.equal(JSON.parse(execFileSync('tar', ['-xOf', join(installed.seed, 'platform.tgz'), 'package/trust.json'])).identity, 'temporary-public-trust')
  assert.equal(readFileSync(join(options.root, 'node_modules/@lawyer-dsh/lawyer-platform/trust.json'), 'utf8'), options.production)
  installed.assertOriginalUnchanged()
  writeFileSync(join(options.seed, 'market.tgz'), 'unexpected production seed mutation')
  assert.throws(() => installed.assertOriginalUnchanged(), /production seed\/trust changed/)
})
test('packaged carrier retains unpack layout and integrity in a disposable copy', async t => {
  const options = fixture(t)
  const app = join(options.root, 'dist/mac-arm64/LawyerDesk.app')
  const resources = join(app, 'Contents/Resources'); mkdirSync(resources, { recursive: true })
  mkdirSync(join(app, 'Contents/MacOS')); writeFileSync(join(app, 'Contents/MacOS/LawyerDesk'), 'fixture binary')
  const framework = join(app, 'Contents/Frameworks/Test.framework')
  mkdirSync(join(framework, 'Versions/A'), { recursive: true })
  writeFileSync(join(framework, 'Versions/A/runtime'), 'fixture framework')
  symlinkSync('A', join(framework, 'Versions/Current'))
  symlinkSync('Versions/Current/runtime', join(framework, 'runtime'))
  cpSync(options.seed, join(resources, 'lawyerDesk'), { recursive: true })
  const content = join(options.scratch, 'archive-input'); mkdirSync(content)
  for (const name of ['package.json', 'node_modules', 'lib']) cpSync(join(options.root, name), join(content, name), { recursive: true })
  await asar.createPackageWithOptions(content, join(resources, 'app.asar'), { unpack: `{${join(content, 'node_modules/**')},${join(content, 'package.json')}}` })
  const plist = realRequire('plist')
  writeFileSync(join(app, 'Contents/Info.plist'), plist.build({ ElectronAsarIntegrity: { 'Resources/app.asar': { algorithm: 'SHA256', hash: 'original-header-placeholder' } } }))
  const installed = await prepareBillingInstallation({ ...options, packaged: true })
  const copiedResources = join(installed.executablePath, '../../Resources')
  assert.ok(realpathSync(join(copiedResources, '../Frameworks/Test.framework/runtime')).startsWith(realpathSync(join(options.scratch, 'installation'))))
  const actualManifest = JSON.parse(readFileSync(join(copiedResources, 'app.asar.unpacked/package.json')))
  assert.equal(actualManifest.main, 'billing-test-bootstrap.mjs')
  assert.equal(JSON.parse(readFileSync(join(copiedResources, 'app.asar.unpacked/node_modules/@lawyer-dsh/lawyer-platform/trust.json'))).identity, 'temporary-public-trust')
  assert.equal(asar.extractFile(join(resources, 'app.asar'), 'package.json').toString(), readFileSync(join(options.root, 'package.json'), 'utf8'))
  installed.assertOriginalUnchanged()
  writeFileSync(join(app, 'Contents/MacOS/LawyerDesk'), 'changed outside ASAR')
  assert.throws(() => installed.assertOriginalUnchanged(), /release app bytes changed/)
})
