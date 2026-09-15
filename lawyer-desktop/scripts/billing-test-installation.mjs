/** Disposable native-test carriers. Never alter the release app, seeds or production trust. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, readdirSync, lstatSync, readlinkSync, realpathSync, constants } from 'node:fs'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const copy = (from, to) => cpSync(from, to, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function treeHash(root) {
  const hash = createHash('sha256')
  for (const name of readdirSync(root, { recursive: true }).sort()) {
    const path = join(root, name), stat = lstatSync(path)
    hash.update(name + '\0')
    if (stat.isSymbolicLink()) hash.update('link:' + readlinkSync(path))
    else if (stat.isFile()) hash.update(readFileSync(path))
  }
  return hash.digest('hex')
}
export async function inspectNativeCarrier(instance, { packaged, executablePath, scratch }) {
  const identity = await instance.evaluate(({ app }) => ({ packaged: app.isPackaged, executable: process.execPath, appPath: app.getAppPath(), resources: process.resourcesPath }))
  assert.equal(identity.packaged, packaged, 'native carrier kind does not match requested acceptance')
  assert.equal(realpathSync(identity.executable), realpathSync(executablePath), 'wrong Electron executable loaded')
  if (packaged) assert.ok(realpathSync(identity.resources).startsWith(realpathSync(scratch) + sep), 'packaged runtime resources must come from disposable copied app')
  return identity
}
export async function prepareBillingInstallation({ root, scratch, packaged, testTrust, require, bootstrap, dependencyStore, origin = 'http://127.0.0.1:1' }) {
  const trust = JSON.parse(readFileSync(testTrust, 'utf8'))
  assert.ok(trust && typeof trust === 'object', 'explicit test trust is required')
  const immutableFiles = [join(root, 'node_modules/@lawyer-dsh/lawyer-platform/trust.json'), ...['platform.tgz', 'brand.tgz', 'market.tgz', 'genui.tgz', 'materials.tgz', 'builtin-plugins.json'].map(name => join(root, '../vendor/lawyerDesk', name))]
  const originals = immutableFiles.map(path => [path, sha(readFileSync(path))])
  const copyRoot = join(scratch, 'installation'); mkdirSync(copyRoot)
  if (dependencyStore) copy(dependencyStore, join(scratch, 'product-pnpm-store'))
  const networkLog = join(scratch, 'blocked-network.jsonl'), preload = join(scratch, 'network-preload.mjs')
  writeFileSync(networkLog, '')
  writeFileSync(preload, `import {installNetworkGuard} from ${JSON.stringify(new URL('./native-test-network.mjs', import.meta.url).href)};\ninstallNetworkGuard(${JSON.stringify({ origin, log: networkLog, childLog: join(scratch, 'child-process.log'), preload: pathToFileURL(preload).href })});\n`)
  const boot = (entry, appPath) => `import ${JSON.stringify(pathToFileURL(preload).href)};\n${bootstrap(entry, appPath)}`
  const writeTestTrust = path => {
    assert.ok(realpathSync(path).startsWith(realpathSync(scratch) + sep), 'test trust must stay inside disposable scratch')
    writeFileSync(path, JSON.stringify(trust, null, 2) + '\n')
  }
  let appRoot, seed, executablePath, args, originalApp, originalHash
  const replaceSeedTrust = directory => {
    const unpack = join(scratch, 'platform-seed'); mkdirSync(unpack)
    execFileSync('tar', ['-xzf', join(directory, 'platform.tgz'), '-C', unpack])
    writeTestTrust(join(unpack, 'package/trust.json'))
    execFileSync('tar', ['-czf', join(directory, 'platform.tgz'), '-C', unpack, 'package'])
  }
  const assertOriginalUnchanged = () => {
    for (const [path, digest] of originals) assert.equal(sha(readFileSync(path)), digest, 'production seed/trust changed during test: ' + path)
    if (originalApp && originalHash) assert.equal(treeHash(originalApp), originalHash, 'release app bytes changed during test')
  }
  try {
  if (packaged) {
    originalApp = join(root, 'dist/mac-arm64/LawyerDesk.app')
    originalHash = treeHash(originalApp)
    const copiedApp = join(copyRoot, 'LawyerDesk.app'); copy(originalApp, copiedApp)
    for (const name of readdirSync(copiedApp, { recursive: true })) {
      const path = join(copiedApp, name)
      if (lstatSync(path).isSymbolicLink()) assert.ok(realpathSync(path).startsWith(realpathSync(copiedApp) + sep), 'copied app symlink escapes into original installation: ' + name)
    }
    const resources = join(copiedApp, 'Contents/Resources')
    const asar = require('@electron/asar')
    appRoot = join(scratch, 'extracted-app'); asar.extractAll(join(resources, 'app.asar'), appRoot)
    seed = join(resources, 'lawyerDesk'); replaceSeedTrust(seed)
    writeTestTrust(join(appRoot, 'node_modules/@lawyer-dsh/lawyer-platform/trust.json'))
    const manifest = JSON.parse(readFileSync(join(appRoot, 'package.json')))
    const originalMain = manifest.main
    manifest.main = 'billing-test-bootstrap.mjs'
    writeFileSync(join(appRoot, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(appRoot, manifest.main), boot(`./${originalMain}`))
    const unpack = JSON.parse(readFileSync(join(root, 'package.json'))).build.mac.asarUnpack
    await asar.createPackageWithOptions(appRoot, join(resources, 'app.asar'), { unpack: `{${unpack.map(pattern => join(appRoot, pattern)).join(',')}}` })
    const plist = require('plist'), plistPath = join(copiedApp, 'Contents/Info.plist')
    const info = plist.parse(readFileSync(plistPath, 'utf8'))
    const integrity = info.ElectronAsarIntegrity
    assert.ok(integrity?.['Resources/app.asar'], 'packaged integrity metadata missing')
    integrity['Resources/app.asar'].hash = sha(asar.getRawHeader(join(resources, 'app.asar')).headerString)
    writeFileSync(plistPath, plist.build(info))
    executablePath = join(copiedApp, 'Contents/MacOS/LawyerDesk'); args = []
  } else {
    appRoot = join(copyRoot, 'lawyer-desktop')
    cpSync(root, appRoot, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE, filter: path => !path.startsWith(join(root, 'dist')) })
    symlinkSync(join(root, '../node_modules'), join(copyRoot, 'node_modules'))
    seed = join(copyRoot, 'vendor/lawyerDesk'); copy(join(root, '../vendor/lawyerDesk'), seed)
    replaceSeedTrust(seed)
    writeTestTrust(join(appRoot, 'node_modules/@lawyer-dsh/lawyer-platform/trust.json'))
    const entry = join(appRoot, 'billing-test-bootstrap.mjs')
    writeFileSync(entry, boot('./lib/main.js', appRoot))
    executablePath = require('electron'); args = [entry]
  }
  return { executablePath, args, appRoot, seed, assertOriginalUnchanged,
    assertNoExternalAttempts() { assert.equal(readFileSync(networkLog, 'utf8').trim(), '', 'unexpected external transport attempt; see ' + networkLog) }
  }
  } finally { assertOriginalUnchanged() }
}
