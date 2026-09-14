import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { loadSidecars, reviewedDocuments } from './license-sidecar.mjs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense', 'MPL-2.0', 'CC0-1.0', 'Zlib', 'Python-2.0'])
// Existing conditional policy, not a declaration that notice retention alone satisfies LGPL/MPL.
const conditional = new Set(['LGPL-3.0-or-later', 'Apache-2.0 AND LGPL-3.0-or-later'])
const blueOak = new Map([
  ['tar@7.5.22', '8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004'],
  ['minipass@7.1.3', '8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004'],
  ['chownr@3.0.0', 'a49c9ba464796f65b59fca3f1e6ca40912df1e859f575383223f7ec6c5baae09'],
  ['yallist@5.0.0', 'a49c9ba464796f65b59fca3f1e6ca40912df1e859f575383223f7ec6c5baae09'],
])
const reviewedBrand = manifest => manifest.name === '@lawyer-dsh/lawyer-brand'
  && manifest.version === '0.1.1' && manifest.license === 'MIT'
  && sha256(JSON.stringify(manifest)) === '2d0694f6d7199abd9d6617cc72c2a10ea9212f8414cdefa273c4bbb121c752ec'
export const firstParty = manifest => (manifest.name === '@lawyer-dsh/lawyer-platform'
  && manifest.version === '0.1.6' && manifest.private === true && manifest.license === 'UNLICENSED') || reviewedBrand(manifest)
export function licenseExpression(manifest) {
  if (typeof manifest.license === 'string') return manifest.license
  if (typeof manifest.license?.type === 'string') return manifest.license.type
  if (Array.isArray(manifest.licenses)) return manifest.licenses.map(x => typeof x === 'string' ? x : x.type).filter(Boolean).join(' OR ')
  return undefined
}
export function policyFailure(manifest, documents) {
  const license = licenseExpression(manifest)
  if (reviewedBrand(manifest)) return documents.some(d => d.sidecar && d.hash === '0b4a1e9bd1243d0bfec7e261fb41e4ee91bf225daa025290e2cb6e15d68f2d4d')
    ? undefined : 'exact first-party brand distribution statement missing'
  if (firstParty(manifest)) return undefined
  if (license === 'BlueOak-1.0.0') {
    const expected = blueOak.get(`${manifest.name}@${manifest.version}`)
    return expected && documents.some(d => d.path === 'LICENSE.md' && d.hash === expected)
      ? undefined : 'BlueOak identity/text not reviewed (requires exact LICENSE.md SHA-256)'
  }
  if (!allowed.has(license) && !conditional.has(license)) return `unreviewed license ${JSON.stringify(license ?? 'missing')}`
  const reviewedReadme = manifest.name === 'data-uri-to-buffer' && manifest.version === '4.0.1'
    && documents.some(d => d.path === 'README.md' && d.hash === 'a7cc4332acfa1f9b6530e01aac77fefe74f2efa32579215fddaa473013f9a25c')
  if (!reviewedReadme && !documents.some(d => /(^|\/)(licen[cs]e|copying|copyright)([._-]|$)/i.test(d.path) && d.text.trim())) return 'no actual license/copyright text found'
  return undefined
}

// Recurse within each package to preserve nested native/bundled legal documents,
// without accidentally attributing another node_modules package's license to it.
export function licenseDocuments(root) {
  const result = []
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.isSymbolicLink()) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && /^(licen[cs]e|notice|copying|copyright|readme)([._-]|$)/i.test(entry.name)) {
        if (/\.(?:[cm]?js|[cm]?ts|map|json|node|wasm)$/i.test(entry.name)) continue
        const bytes = readFileSync(path)
        if (/^readme/i.test(entry.name) && !/licen[cs]/i.test(bytes.toString('utf8'))) continue
        result.push({ path: relative(root, path).split(sep).join('/'), hash: sha256(bytes), text: bytes.toString('utf8') })
      }
    }
  }
  walk(root)
  return result
}
export function resolveManifest(name, from, boundary) {
  if (!/^(@[^/]+\/)?[^/.][^/]*$/.test(name)) return undefined
  for (let dir = dirname(from); dir === boundary || dir.startsWith(boundary + sep); dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(candidate)) return candidate
  }
  return undefined
}
export function auditInstalled(packageRoot) {
  packageRoot = resolve(packageRoot)
  const boundary = dirname(packageRoot)
  const sidecars = loadSidecars(packageRoot)
  const rootPath = join(packageRoot, 'package.json')
  const queue = [rootPath], seen = new Set(), packages = [], failures = []
  for (let i = 0; i < queue.length; i++) {
    const manifestPath = queue[i], identity = realpathSync(manifestPath)
    if (seen.has(identity)) continue
    seen.add(identity)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (i !== 0) {
      let reviewed = []
      try { reviewed = reviewedDocuments(sidecars, manifest, readFileSync(manifestPath)) }
      catch (error) { failures.push(`${manifest.name}@${manifest.version}: ${error.message}`) }
      const documents = [...reviewed, ...licenseDocuments(dirname(manifestPath))]
      const failure = manifest.license === 'BlueOak-1.0.0' && existsSync(join(dirname(manifestPath), 'src'))
        ? 'BlueOak src/ tree present: review subpackage-specific terms before approval'
        : policyFailure(manifest, documents)
      const entry = { name: manifest.name, version: manifest.version, license: licenseExpression(manifest), firstParty: firstParty(manifest), manifestPath, manifestSha256: sha256(readFileSync(manifestPath)), documents }
      packages.push(entry)
      if (failure) failures.push(`${entry.name}@${entry.version}: ${failure}`)
    }
    const optional = manifest.optionalDependencies ?? {}
    const dependencies = { ...manifest.dependencies, ...optional }
    for (const name of Object.keys(dependencies).sort()) {
      const found = resolveManifest(name, manifestPath, boundary)
      if (found) queue.push(found)
      else if (!(name in optional)) failures.push(`${manifest.name} -> ${name}: missing required dependency`)
    }
  }
  packages.sort((a, b) => `${a.name}@${a.version}:${relative(boundary, a.manifestPath)}`.localeCompare(`${b.name}@${b.version}:${relative(boundary, b.manifestPath)}`, 'en'))
  return { packages, failures }
}
export function renderNotices({ packages, failures }) {
  const documents = new Map()
  const lines = ['# Third-Party Notices', '', 'Generated by `node scripts/verify-licenses.mjs --notices THIRD_PARTY_NOTICES.md`.', '',
    'Scope: installed production dependency graph, including distinct installed versions and recursively discovered LICENSE/NOTICE/COPYING/COPYRIGHT files within each package. Optional packages reflect this installation, not every target platform. Dev-only bundled code, opaque binaries and vendored packages without dependency edges require separate release review; this is not a complete binary SBOM.', '',
    'First-party private distribution is described in DISTRIBUTION_LICENSES.md; UNLICENSED is not converted into an open-source license. Conditional LGPL/MPL obligations are not discharged merely by this document.', '',
    `Audit findings: ${failures.length}. A nonzero count blocks this gate; generating this document does not approve distribution.`, '', ...failures.map(x => `- ${x}`), '', '## Package inventory', '']
  for (const p of packages) {
    lines.push(`### ${p.name}@${p.version}`, '', `Declared license: ${p.license ?? 'MISSING'}${p.firstParty ? ' (first-party private component; see DISTRIBUTION_LICENSES.md)' : ''}`, '')
    if (!p.documents.length) lines.push(p.firstParty ? 'No third-party license asserted for this first-party component.' : '**MISSING license text — review required.**', '')
    for (const d of p.documents) {
      lines.push(`- ${d.path}: [SHA-256 ${d.hash}](#text-${d.hash})`)
      if (d.sidecar) lines.push(`  Reviewed sidecar source: ${d.url}; revision: ${d.revision}. Retained in this aggregate, not injected into node_modules.`)
      documents.set(d.hash, d.text)
    }
    lines.push('')
  }
  lines.push('## Retained legal texts', '')
  for (const [hash, text] of [...documents].sort(([a], [b]) => a.localeCompare(b))) {
    // Indentation keeps upstream Markdown/HTML inert. Display expands tabs and
    // trims trailing whitespace; hashes and archive checks use original bytes.
    lines.push(`<a id="text-${hash}"></a>`, '', `### SHA-256 ${hash}`, '', ...text.split('\n').map(line => line.trimEnd() ? `    ${line.trimEnd().replaceAll('\t', '    ')}` : ''), '')
  }
  return lines.join('\n').trimEnd() + '\n'
}
