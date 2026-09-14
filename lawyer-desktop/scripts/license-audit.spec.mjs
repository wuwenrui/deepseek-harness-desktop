import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditInstalled, firstParty, licenseDocuments, policyFailure, renderNotices, sha256 } from './license-audit.mjs'
import { auditArchive } from './license-archive.mjs'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'lawyer-license-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = join(dir, 'app')
  mkdirSync(root)
  const put = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
  }
  return { root, put }
}
const mit = { path: 'LICENSE', text: 'Fixture license text', hash: sha256('Fixture license text') }

test('only exact private first-party identity is accepted as UNLICENSED', () => {
  const m = { name: '@lawyer-dsh/lawyer-platform', version: '0.1.6', private: true, license: 'UNLICENSED' }
  assert.equal(firstParty(m), true)
  assert.equal(policyFailure(m, []), undefined)
  for (const change of [{ name: '@lawyer-dsh/other' }, { version: '0.1.7' }, { private: false }, { license: 'MIT' }]) {
    assert.equal(firstParty({ ...m, ...change }), false)
    assert.ok(policyFailure({ ...m, ...change }, []))
  }
})
test('unknown, SEE LICENSE IN and absent expressions cannot pass from a filename', () => {
  for (const license of ['UNLICENSED', 'Custom', 'SEE LICENSE IN other.txt', undefined, '(MIT OR Custom)']) {
    assert.ok(policyFailure({ name: 'other', version: '1', license }, [mit]))
  }
  assert.ok(policyFailure({ license: 'MIT' }, []))
  assert.equal(policyFailure({ license: 'MIT' }, [mit]), undefined)
})
test('BlueOak requires reviewed version and exact reviewed bytes', () => {
  const m = { name: 'tar', version: '7.5.22', license: 'BlueOak-1.0.0' }
  const d = { path: 'LICENSE.md', hash: '8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004' }
  assert.equal(policyFailure(m, [d]), undefined)
  assert.ok(policyFailure({ ...m, version: '8' }, [d]))
  assert.ok(policyFailure({ ...m, name: 'other' }, [d]))
  assert.ok(policyFailure(m, [{ ...d, hash: sha256('truncated') }]))
  assert.ok(policyFailure(m, []))
})
test('BlueOak src tree is not covered by the reviewed distribution layout', t => {
  const { root, put } = fixture(t)
  put('package.json', { name: 'app', dependencies: { chownr: '3.0.0' } })
  put('node_modules/chownr/package.json', { name: 'chownr', version: '3.0.0', license: 'BlueOak-1.0.0' })
  put('node_modules/chownr/src/another-package/index.js', '// fixture')
  assert.match(auditInstalled(root).failures.join('\n'), /src\/ tree present/)
})
test('reviewed README text is identity and hash bound, not a generic license link exemption', () => {
  const m = { name: 'data-uri-to-buffer', version: '4.0.1', license: 'MIT' }
  const d = { path: 'README.md', text: 'fixture', hash: 'a7cc4332acfa1f9b6530e01aac77fefe74f2efa32579215fddaa473013f9a25c' }
  assert.equal(policyFailure(m, [d]), undefined)
  assert.ok(policyFailure({ ...m, name: 'other' }, [d]))
  assert.ok(policyFailure(m, [{ ...d, hash: 'changed' }]))
})
test('collector preserves nested notices and README evidence without crossing node_modules', t => {
  const { root, put } = fixture(t)
  put('LICENSE', 'license')
  put('native/NOTICE.txt', 'native notice')
  put('README.md', 'License: consult upstream')
  put('node_modules/other/LICENSE', 'not this package')
  assert.deepEqual(licenseDocuments(root).map(d => d.path), ['LICENSE', 'native/NOTICE.txt', 'README.md'])
  assert.ok(policyFailure({ license: 'MIT' }, licenseDocuments(root).filter(d => d.path === 'README.md')))
})
test('walk deduplicates by physical manifest, not name, and checks nested versions', t => {
  const { root, put } = fixture(t)
  put('package.json', { name: 'app', dependencies: { a: '1', b: '1' } })
  put('node_modules/a/package.json', { name: 'a', version: '1', license: 'MIT' })
  put('node_modules/a/LICENSE', 'A')
  put('node_modules/b/package.json', { name: 'b', version: '1', license: 'MIT', dependencies: { a: '2' } })
  put('node_modules/b/LICENSE', 'B')
  put('node_modules/b/node_modules/a/package.json', { name: 'a', version: '2', license: 'UNLICENSED' })
  const result = auditInstalled(root)
  assert.equal(result.packages.length, 3)
  assert.match(result.failures.join('\n'), /a@2/)
  const text = renderNotices(result)
  assert.equal(text, renderNotices(auditInstalled(root)))
  assert.ok(!text.includes(root))
  assert.match(text, /Retained legal texts/)
})
test('optional override may be absent but missing required dependencies fail', t => {
  const { root, put } = fixture(t)
  put('package.json', { name: 'app', dependencies: { optional: '1', required: '1' }, optionalDependencies: { optional: '1' } })
  assert.deepEqual(auditInstalled(root).failures, ['app -> required: missing required dependency'])
})

function fakeArchive({ omitLicense = false, notices = 'notices', changed = false, unpacked = false } = {}) {
  const files = new Map([
    ['package.json', JSON.stringify({ dependencies: { dep: '1' } })],
    ['node_modules/dep/package.json', JSON.stringify({ name: 'dep', version: '1', license: 'MIT' })],
    ['THIRD_PARTY_NOTICES.md', notices], ['DISTRIBUTION_LICENSES.md', 'distribution'],
  ])
  if (!omitLicense) files.set('node_modules/dep/LICENSE', changed ? 'changed' : mit.text)
  return {
    listPackage: () => [...files.keys()].map(p => '/' + p),
    statFile: (_, p) => { if (!files.has(p)) throw Error('missing'); return { unpacked: unpacked && p.endsWith('/LICENSE') } },
    extractFile: (_, p) => { if (!files.has(p)) throw Error('missing'); return Buffer.from(files.get(p)) },
  }
}
const audit = { packages: [{ name: 'dep', version: '1', license: 'MIT', documents: [mit] }], failures: [] }
const check = options => auditArchive('/not-a-real-app.asar', audit, 'notices', 'distribution', fakeArchive(options))
test('archive verifies real bytes and exact aggregate documents', () => {
  assert.deepEqual(check().failures, [])
  assert.equal(check().retained.length, 1)
  assert.match(check({ changed: true }).failures.join('\n'), /bytes changed/)
  assert.match(check({ notices: 'stale' }).failures.join('\n'), /missing\/stale/)
})
test('aggregate can retain stripped originals but never hides omissions', () => {
  const result = check({ omitLicense: true })
  assert.equal(result.absent.length, 1)
  assert.equal(result.aggregateRetained, true)
  assert.deepEqual(result.failures, [])
  assert.match(check({ omitLicense: true, notices: 'stale' }).failures.join('\n'), /original legal documents absent/)
})
test('unpacked header without physical sidecar is not counted as retained', () => {
  const result = check({ unpacked: true })
  assert.equal(result.retained.length, 0)
  assert.equal(result.absent.length, 1)
})
test('archive required closure and unknown packaged identities fail', () => {
  const fake = fakeArchive()
  const original = fake.extractFile
  fake.extractFile = (a, p) => p === 'package.json' ? Buffer.from(JSON.stringify({ dependencies: { missing: '1' } })) : original(a, p)
  assert.match(auditArchive('fake', audit, 'notices', 'distribution', fake).failures.join('\n'), /missing packaged required/)
  assert.match(auditArchive('fake', { packages: [] }, 'notices', 'distribution', fakeArchive()).failures.join('\n'), /no current reviewed/)
})
