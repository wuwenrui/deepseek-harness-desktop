/** Verify the managed runtime source artifacts and inherited Desktop compatibility patches. */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const vendor=join(root,'vendor/lawyer-runtime')
const manifest=JSON.parse(readFileSync(join(vendor,'manifest.json'),'utf8'))
const packageJson=JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
const patches=JSON.parse(readFileSync(join(vendor,'desktop-patches.json'),'utf8'))
if(manifest.baseCommit!=='b0a7d2ce3b4c19d7452e364b2d7acbfa87e707ed'||manifest.buildProfile!=='official')throw new Error('unexpected managed runtime baseline')
if(!manifest.packages.some(item=>item.name==='@deepseek-ai/dsh-product-policy'))throw new Error('product policy package is absent')
for(const entry of manifest.packages){
 const bytes=readFileSync(join(vendor,entry.filename))
 if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('runtime tarball mismatch: '+entry.name)
 const resolution=packageJson.resolutions[entry.name+'@npm:'+entry.version]
 if(typeof resolution!=='string'||!resolution.includes('vendor/lawyer-runtime/'+entry.filename))throw new Error('runtime is not pinned to the verified artifact: '+entry.name)
 if(patches[entry.name]&&!resolution.endsWith('#./'+patches[entry.name]))throw new Error('Desktop compatibility patch omitted: '+entry.name)
}
for(const path of Object.values(patches))if(typeof path!=='string'||!existsSync(join(root,path)))throw new Error('missing compatibility patch')
console.log(JSON.stringify({managedRuntimePackages:manifest.packages.length,desktopCompatibilityPatches:Object.keys(patches).length,verified:true}))
