/** Dependency preparation only: no app launch, model traffic, lifecycle scripts or production trust edits. */
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const index = process.argv.indexOf('--out')
const store = index >= 0 ? resolve(process.argv[index + 1]) : join(mkdtempSync(join(tmpdir(), 'lawyer-native-cache-')), 'store')
const input = mkdtempSync(join(tmpdir(), 'lawyer-native-cache-input-'))
try {
  const dependencies = {}
  for (const name of ['platform', 'brand', 'market', 'genui', 'materials']) {
    const path = resolve(root, '../vendor/lawyerDesk', name + '.tgz')
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', path, 'package/package.json']))
    dependencies[manifest.name] = 'file:' + path
  }
  writeFileSync(join(input, 'package.json'), JSON.stringify({ private: true, dependencies }, null, 2))
  execFileSync(require('electron'), [join(root, 'node_modules/pnpm/bin/pnpm.mjs'), 'install', '--store-dir', store, '--ignore-scripts', '--config.auto-install-peers=false'], {
    cwd: input, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CI: 'true', ELECTRON_RUN_AS_NODE: '1' },
  })
  console.log(JSON.stringify({ dependencyStore: store, applicationStarted: false, lifecycleScripts: false, preparationMayFetchPublicNpm: true }, null, 2))
} finally { rmSync(input, { recursive: true, force: true }) }
