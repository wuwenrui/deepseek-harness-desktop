import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesReviewedManifest } from './license-archive.mjs'
import { sha256 } from './license-audit.mjs'
const manifest = { name: 'reviewed-package', version: '1.2.3', license: 'MIT', author: 'Original author', dependencies: { dependency: '2.0.0' }, scripts: { test: 'node test.js' }, keywords: ['original'] }
const original = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
const cleaned = { ...manifest }; delete cleaned.scripts; delete cleaned.keywords
const bytes = value => Buffer.from(JSON.stringify(value, null, 2))
test('archive permits original bytes and exact builder scripts/keywords cleanup', () => {
  assert.equal(matchesReviewedManifest(original, original, sha256(original)), true)
  assert.equal(matchesReviewedManifest(bytes(cleaned), original, sha256(original)), true)
})
test('archive rejects identity, copyright, dependency and unexpected metadata mutations', () => {
  for (const change of [{ version: '9.9.9' }, { license: 'UNLICENSED' }, { author: 'Changed' }, { dependencies: {} }, { extra: true }]) {
    assert.equal(matchesReviewedManifest(bytes({ ...cleaned, ...change }), original, sha256(original)), false)
  }
})
test('cleanup cannot substitute an unpinned original or arbitrary reserialization', () => {
  assert.equal(matchesReviewedManifest(bytes(cleaned), original, '0'.repeat(64)), false)
  assert.equal(matchesReviewedManifest(Buffer.from(JSON.stringify(cleaned)), original, sha256(original)), false)
})
