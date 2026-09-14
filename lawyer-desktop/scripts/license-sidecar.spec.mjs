import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditInstalled, renderNotices, sha256 } from './license-audit.mjs'
import { auditArchive } from './license-archive.mjs'
import { verifySourceAttachments } from './license-sidecar.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'license-sidecar-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
  }
  const manifest = { name: 'dep', version: '1.2.3', license: 'MIT' }
  const original = 'Copyright fixture owner\nPermission fixture text\n'
  const entry = { ...manifest, manifestSha256: sha256(JSON.stringify(manifest)), documents: [
    { path: 'upstream/dep/LICENSE', sha256: sha256(original), url: 'https://example.invalid/exact/LICENSE', revision: 'commit-fixture' },
  ] }
  put('package.json', { dependencies: { dep: '1.2.3' } })
  put('node_modules/dep/package.json', manifest)
  put('node_modules/dep/NOTICE', 'Installed original retained too')
  put('licenses/upstream/dep/LICENSE', original)
  put('licenses/upstream-index.json', [entry])
  return { root, put, manifest, entry, original }
}

test('source attachments fail when inventory, bytes or provenance are missing', t => {
  const { root, put } = fixture(t)
  put('licenses/libvips-index.json', [])
  assert.match(verifySourceAttachments(root).failures.join('\n'), /inventory missing/)
  const source = { path: 'libvips/source.tar.gz', sha256: sha256('source-fixture'), url: 'https://example.invalid/source.tar.gz', revision: 'v1' }
  put('licenses/libvips/source.tar.gz', 'source-fixture')
  put('licenses/libvips/sources.json', [source])
  assert.deepEqual(verifySourceAttachments(root), { count: 1, failures: [] })
  put('licenses/libvips/source.tar.gz', 'tampered')
  assert.match(verifySourceAttachments(root).failures.join('\n'), /SHA-256 mismatch/)
  put('licenses/libvips/sources.json', [{ ...source, path: '../package.json' }])
  assert.match(verifySourceAttachments(root).failures.join('\n'), /escapes licenses/)
  put('licenses/libvips/sources.json', [{ ...source, revision: '' }])
  assert.match(verifySourceAttachments(root).failures.join('\n'), /provenance/)
})

test('exact reviewed sidecar supplies full text and provenance before installed originals', t => {
  const { root, original } = fixture(t)
  const audit = auditInstalled(root)
  assert.deepEqual(audit.failures, [])
  assert.equal(audit.packages[0].documents[0].sidecar, true)
  const output = renderNotices(audit)
  assert.match(output, /commit-fixture/)
  assert.match(output, /Installed original retained too/)
  assert.ok(output.includes(original.trim().split('\n').map(x => `    ${x}`).join('\n')))
  assert.equal(output, renderNotices(auditInstalled(root)))
})
test('tampered sidecar bytes fail closed', t => {
  const { root, put } = fixture(t)
  put('licenses/upstream/dep/LICENSE', 'generic replacement')
  assert.match(auditInstalled(root).failures.join('\n'), /sidecar hash mismatch/)
})
test('repacked manifest with same version fails closed', t => {
  const { root, put, manifest } = fixture(t)
  put('node_modules/dep/package.json', { ...manifest, description: 'repack' })
  assert.match(auditInstalled(root).failures.join('\n'), /manifest identity\/hash mismatch/)
})
test('sidecar approval does not cover another version or unknown license', t => {
  const { root, put, manifest, entry } = fixture(t)
  put('node_modules/dep/package.json', { ...manifest, version: '1.2.4' })
  assert.match(auditInstalled(root).failures.join('\n'), /no actual license/)
  const unknown = { ...manifest, license: 'UNLICENSED' }
  put('node_modules/dep/package.json', unknown)
  put('licenses/upstream-index.json', [{ ...entry, license: unknown.license, manifestSha256: sha256(JSON.stringify(unknown)) }])
  assert.match(auditInstalled(root).failures.join('\n'), /unreviewed license/)
})
test('sidecar README alone is not license text and cannot exploit licenses directory name', t => {
  const { root, put, entry } = fixture(t)
  put('licenses/upstream/dep/README.md', 'See license elsewhere')
  entry.documents = [{ ...entry.documents[0], path: 'upstream/dep/README.md', sha256: sha256('See license elsewhere') }]
  put('licenses/upstream-index.json', [entry])
  assert.match(auditInstalled(root).failures.join('\n'), /no actual license/)
})
test('path traversal and missing provenance fail closed', t => {
  const { root, put, entry } = fixture(t)
  entry.documents[0].path = '../package.json'
  put('licenses/upstream-index.json', [entry])
  assert.match(auditInstalled(root).failures.join('\n'), /escapes licenses/)
  entry.documents[0].path = 'upstream/dep/LICENSE'
  delete entry.documents[0].revision
  put('licenses/upstream-index.json', [entry])
  assert.match(auditInstalled(root).failures.join('\n'), /provenance missing/)
})
test('archive requires aggregate for sidecar, never a fictitious node_modules path', t => {
  const { root, manifest } = fixture(t)
  const audit = auditInstalled(root), notices = renderNotices(audit)
  const files = new Map([
    ['package.json', JSON.stringify({ dependencies: { dep: '1.2.3' } })],
    ['node_modules/dep/package.json', JSON.stringify(manifest)],
    ['node_modules/dep/NOTICE', 'Installed original retained too'],
    ['THIRD_PARTY_NOTICES.md', notices], ['DISTRIBUTION_LICENSES.md', 'distribution'],
  ])
  const asar = { listPackage: () => [...files.keys()], statFile: (_, p) => { assert.ok(files.has(p)); return {} }, extractFile: (_, p) => Buffer.from(files.get(p)) }
  const check = () => auditArchive('fixture', audit, notices, 'distribution', asar)
  assert.deepEqual(check().failures, [])
  assert.equal(check().reviewedSidecars.length, 1)
  assert.deepEqual(check().absent, [])
  files.set('node_modules/dep/package.json', JSON.stringify({ ...manifest, description: 'different artifact' }))
  assert.match(check().failures.join('\n'), /packaged manifest bytes differ/)
  files.set('node_modules/dep/package.json', JSON.stringify(manifest))
  files.set('THIRD_PARTY_NOTICES.md', 'stale')
  assert.match(check().failures.join('\n'), /sidecar texts require/)
})
