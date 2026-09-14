/** Packages license/source evidence only; never builds or publishes an app. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { auditInstalled, renderNotices, sha256 } from './license-audit.mjs'
import { verifySourceAttachments } from './license-sidecar.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const audit = auditInstalled(root), sources = verifySourceAttachments(root)
const failures = [...audit.failures, ...sources.failures]
if (readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8') !== renderNotices(audit)) failures.push('regenerate THIRD_PARTY_NOTICES.md first')
if (failures.length) throw new Error(failures.join('\n'))
const output = join(root, 'licenses/release')
mkdirSync(output, { recursive: true })
const name = 'LawyerDesk-license-source-materials.tar.gz'
const result = spawnSync('tar', ['-czf', join(output, name), '--exclude=licenses/release',
  '-C', root, 'THIRD_PARTY_NOTICES.md', 'DISTRIBUTION_LICENSES.md', 'licenses',
  'scripts/license-audit.mjs', 'scripts/license-archive.mjs', 'scripts/license-sidecar.mjs',
  'scripts/verify-licenses.mjs', 'scripts/package-license-materials.mjs', 'scripts/fetch-license-sources.mjs'], { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) throw new Error(`tar failed: ${result.status}`)
const digest = sha256(readFileSync(join(output, name)))
writeFileSync(join(output, 'SHA256SUMS.txt'), `${digest}  ${name}\n`)
console.log(`${name}: ${digest}; ${sources.count} verified source attachments. Publish alongside the binary; this does not verify LGPL replacement or publish anything.`)
