/** Private Electron-Node carrier for the normal managed dsh CLI, with profile module resolution. */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installProfilePackageResolver } from './module-resolution.ts'

const home = process.env.DSH_HOME
if (home === undefined || home.length === 0) throw new Error('managed CLI requires an explicit DSH_HOME')
const args = process.argv.slice(2)
if (args[0] !== '--profile' || args[1] !== 'lawyer') throw new Error('managed desktop CLI only launches the lawyer profile')
const profile = join(home, 'profiles', 'lawyer')
const release = installProfilePackageResolver(pathToFileURL(join(profile, 'package.json')).href)
const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')
// The forwarded CLI keeps the invocation grammar and all product policy checks.
process.argv[1] = cli
process.once('exit', release)
const entry = await import(pathToFileURL(cli).href) as { runCli(): Promise<void> }
await entry.runCli()
