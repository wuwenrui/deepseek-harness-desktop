import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, posix } from 'node:path'
import { firstParty, licenseExpression, sha256 } from './license-audit.mjs'

// electron-builder 26.15.7 fileTransformer removes these two non-identity fields.
// Do not normalize away license, version, dependencies, provenance or arbitrary metadata.
export function matchesReviewedManifest(packaged, original, expectedHash) {
  if (sha256(original) !== expectedHash) return false
  if (packaged.equals(original)) return true
  try {
    const cleaned = JSON.parse(original)
    delete cleaned.scripts
    delete cleaned.keywords
    return packaged.equals(Buffer.from(JSON.stringify(cleaned, null, 2)))
  } catch { return false }
}

// ASAR extraction also reads .unpacked entries from their physical sidecar.
// Never trust listPackage alone: an entry can exist while its sidecar is missing.
export function auditArchive(archive, audit, expectedNotices, distributionText, asar = createRequire(import.meta.url)('@electron/asar')) {
  const failures = [], retained = [], absent = [], reviewedSidecars = []
  const files = new Set(asar.listPackage(archive).map(p => p.replace(/^\//, '')))
  const read = path => {
    const info = asar.statFile(archive, path)
    return info.unpacked ? readFileSync(join(`${archive}.unpacked`, path)) : asar.extractFile(archive, path)
  }
  for (const [path, expected] of [['THIRD_PARTY_NOTICES.md', expectedNotices], ['DISTRIBUTION_LICENSES.md', distributionText]]) {
    try { if (!read(path).equals(Buffer.from(expected))) failures.push(`${path}: missing/stale packaged release document`) }
    catch { failures.push(`${path}: missing/unreadable packaged release document`) }
  }
  const installed = new Map(audit.packages.map(p => [`${p.name}@${p.version}`, p]))
  const manifests = new Map()
  for (const path of files) {
    if (path !== 'package.json' && !/(^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(path)) continue
    try { manifests.set(path, JSON.parse(read(path))) }
    catch { failures.push(`${path}: unreadable packaged manifest`) }
  }
  // Follow the actual archived graph, not the host's optional-platform installation.
  const queue = ['package.json'], seen = new Set()
  const resolveDependency = (name, parent) => {
    for (let dir = posix.dirname(parent); ; dir = posix.dirname(dir)) {
      const candidate = posix.join(dir, 'node_modules', name, 'package.json')
      if (manifests.has(candidate)) return candidate
      if (dir === '.') return undefined
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]
    if (seen.has(path)) continue
    seen.add(path)
    const m = manifests.get(path)
    if (!m) { failures.push(`${path}: missing archive root`); continue }
    if (path !== 'package.json') {
      const p = installed.get(`${m.name}@${m.version}`)
      if (!p) failures.push(`${path}: no current reviewed installed identity ${m.name}@${m.version}`)
      else {
        if (licenseExpression(m) !== p.license || Boolean(p.firstParty) !== firstParty(m)) failures.push(`${path}: license/private identity differs from reviewed installation`)
        if (p.documents.some(d => d.sidecar) && !matchesReviewedManifest(read(path), readFileSync(p.manifestPath), p.manifestSha256)) failures.push(`${path}: reviewed sidecar packaged manifest bytes differ beyond approved scripts/keywords cleanup`)
        for (const d of p.documents) {
          if (d.sidecar) { reviewedSidecars.push({ package: `${m.name}@${m.version}`, path: d.path, sha256: d.hash }); continue }
          const target = posix.join(posix.dirname(path), d.path)
          try {
            if (sha256(read(target)) !== d.hash) failures.push(`${target}: license/notice bytes changed`)
            else retained.push(target)
          } catch { absent.push(target) }
        }
      }
    }
    const optional = m.optionalDependencies ?? {}
    for (const name of Object.keys({ ...m.dependencies, ...optional }).sort()) {
      const target = resolveDependency(name, path)
      if (target) queue.push(target)
      else if (!(name in optional)) failures.push(`${path} -> ${name}: missing packaged required dependency`)
    }
  }
  // The exact full-text aggregate is an acceptable retention carrier when the
  // builder excludes individual documents, but the omission remains visible.
  let aggregateRetained = false
  try { aggregateRetained = read('THIRD_PARTY_NOTICES.md').equals(Buffer.from(expectedNotices)) } catch {}
  if (absent.length && !aggregateRetained) failures.push(`${absent.length} original legal documents absent and full-text aggregate not retained (includes README license evidence)`)
  if (reviewedSidecars.length && !aggregateRetained) failures.push('reviewed sidecar texts require the exact packaged full-text aggregate')
  return { failures, retained, absent, reviewedSidecars, aggregateRetained, packages: seen.size - 1,
    untraversedPackageManifests: [...manifests.keys()].filter(p => !seen.has(p)) }
}
