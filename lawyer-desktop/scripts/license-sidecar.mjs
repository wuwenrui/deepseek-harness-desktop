import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const indexes = ['first-party-index.json', 'upstream-index.json', 'libvips-index.json']

// Sidecars supplement installed originals; they never replace contradictory bytes.
// Exact installed manifest hashes prevent a reviewed name/version being reused for
// a repacked or differently declared artifact. No network access in the gate.
export function loadSidecars(packageRoot) {
  const root = resolve(packageRoot, 'licenses'), entries = new Map()
  for (const file of indexes) {
    if (!existsSync(resolve(root, file))) continue
    const data = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
    if (!Array.isArray(data)) throw new Error(`${file}: expected an entry array`)
    for (const entry of data) {
      const key = `${entry.name}@${entry.version}`
      if (entries.has(key)) throw new Error(`${key}: duplicate reviewed sidecar`)
      entries.set(key, entry)
    }
  }
  return { root, entries }
}

export function verifySourceAttachments(packageRoot) {
  const root = resolve(packageRoot, 'licenses')
  if (!existsSync(resolve(root, 'libvips-index.json'))) return { count: 0, failures: [] }
  const failures = []
  let sources
  try {
    sources = JSON.parse(readFileSync(resolve(root, 'libvips/sources.json'), 'utf8'))
    if (!Array.isArray(sources) || !sources.length) throw new Error('expected nonempty source inventory')
  } catch (error) { return { count: 0, failures: [`libvips source inventory missing/invalid: ${error.message}`] } }
  for (const source of sources) {
    try {
      const path = resolve(root, source.path)
      if (!path.startsWith(root + sep) || !realpathSync(path).startsWith(realpathSync(root) + sep)) throw new Error('path escapes licenses')
      if (!source.url || !source.revision) throw new Error('missing source provenance')
      if (hash(readFileSync(path)) !== source.sha256) throw new Error('source SHA-256 mismatch')
    } catch (error) { failures.push(`${source.path}: ${error.message}`) }
  }
  return { count: sources.length, failures }
}

export function reviewedDocuments(sidecars, manifest, manifestBytes) {
  const entry = sidecars.entries.get(`${manifest.name}@${manifest.version}`)
  if (!entry) return []
  if (entry.license !== manifest.license || entry.manifestSha256 !== hash(manifestBytes)) {
    throw new Error('reviewed sidecar installed manifest identity/hash mismatch')
  }
  if (!entry.documents?.length) throw new Error('reviewed sidecar has no documents')
  return entry.documents.map(document => {
    const path = resolve(sidecars.root, document.path)
    if (!path.startsWith(sidecars.root + sep) || !realpathSync(path).startsWith(realpathSync(sidecars.root) + sep)) {
      throw new Error('reviewed sidecar document escapes licenses directory')
    }
    const bytes = readFileSync(path)
    if (!bytes.length || hash(bytes) !== document.sha256) throw new Error(`reviewed sidecar hash mismatch: ${document.path}`)
    if (!document.url || !document.revision) throw new Error(`reviewed sidecar provenance missing: ${document.path}`)
    return { path: `licenses/${document.path}`, hash: document.sha256, text: bytes.toString('utf8'),
      sidecar: true, url: document.url, revision: document.revision }
  })
}
