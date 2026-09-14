/** Headless license evidence gate; never builds or modifies the application. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditInstalled, renderNotices } from './license-audit.mjs'
import { auditArchive } from './license-archive.mjs'
import { verifySourceAttachments } from './license-sidecar.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2), options = {}
for (let i = 0; i < args.length; i++) {
  if (!['--notices', '--check-notices', '--asar'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('Usage: verify-licenses.mjs [--notices FILE] [--check-notices FILE] [--asar PATH] (paths relative to lawyer-desktop)')
  }
  options[args[i]] = resolve(packageRoot, args[++i])
}
const audit = auditInstalled(packageRoot)
const sources = verifySourceAttachments(packageRoot)
audit.failures.push(...sources.failures)
const notices = renderNotices(audit)
// Emit evidence even on failure so a reviewer can reproduce and resolve gaps.
if (options['--notices']) writeFileSync(options['--notices'], notices)
if (options['--check-notices']) {
  try {
    if (readFileSync(options['--check-notices'], 'utf8') !== notices) audit.failures.push('generated notices are stale')
  } catch { audit.failures.push('generated notices are missing') }
}
const distributionText = readFileSync(resolve(packageRoot, 'DISTRIBUTION_LICENSES.md'), 'utf8')
for (const identity of ['@lawyer-dsh/lawyer-platform@0.1.6', '@lawyer-dsh/lawyer-brand@0.1.1']) {
  if (!distributionText.includes(identity)) audit.failures.push(`first-party distribution explanation missing exact identity: ${identity}`)
}
if (options['--asar']) {
  const packaged = auditArchive(options['--asar'], audit, notices, distributionText)
  audit.failures.push(...packaged.failures)
  console.log(JSON.stringify({ archive: options['--asar'], ...packaged }, null, 2))
}
console.log(`verify-licenses: ${audit.packages.length} installed production package instances; ${sources.count} source attachments verified; ${audit.failures.length} findings. This is a license-evidence check, not complete legal/binary clearance.`)
for (const failure of audit.failures) console.error(`- ${failure}`)
if (audit.failures.length) process.exitCode = 1
