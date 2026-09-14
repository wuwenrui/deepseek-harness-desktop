#!/usr/bin/env node
/** Explicit, hash-pinned public-source retrieval. Never installs or executes downloaded code. */
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../licenses')
const inputs = JSON.parse(await readFile(join(root, 'libvips/sources.json'), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function restore(input) {
  const target = resolve(root, input.path), rel = relative(root, target).replaceAll('\\', '/')
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || !rel.startsWith('libvips/sources/')) throw new Error('Invalid source destination')
  if (!/^[a-f0-9]{64}$/.test(input.sha256) || new URL(input.url).protocol !== 'https:') throw new Error('Invalid reviewed source metadata')
  try { if (hash(await readFile(target)) !== input.sha256) throw new Error(`Existing source differs: ${input.path}`); return }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const response = await fetch(input.url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Source download ${response.status}: ${input.path}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (hash(bytes) !== input.sha256) throw new Error(`Source checksum differs: ${input.path}`)
  await mkdir(dirname(target), { recursive: true })
  const temp = `${target}.${randomUUID()}.tmp`
  try { await writeFile(temp, bytes, { flag: 'wx' }); await rename(temp, target) }
  finally { await rm(temp, { force: true }) }
}
for (let i = 0; i < inputs.length; i += 4) await Promise.all(inputs.slice(i, i + 4).map(restore))
console.log(JSON.stringify({ verified: true, sourceInputs: inputs.length, policy: 'exact reviewed SHA-256; no install or execution' }))
