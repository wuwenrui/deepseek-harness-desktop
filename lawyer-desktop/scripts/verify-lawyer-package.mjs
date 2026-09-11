/** Headless product artifact checks for the managed LawyerDesk variant. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const asar=require('@electron/asar')
export default async function verify(context) {
  const resources=context.electronPlatformName==='darwin' ? join(context.appOutDir,'LawyerDesk.app','Contents','Resources') : join(context.appOutDir,'resources')
  const archive=join(resources,'app.asar'), physical=archive+'.unpacked'
  if(!existsSync(archive))throw new Error('packaged app.asar missing')
  const pkg=JSON.parse(asar.extractFile(archive,'package.json'))
  if(pkg.name!=='lawyer-dsh-desktop'||pkg.main!=='lib/main.js')throw new Error('wrong managed desktop entry')
  const main=asar.extractFile(archive,'lib/main.js').toString()
  for(const marker of ['enableLawyerPolicy','prepareManagedProduct','PRODUCT_PROFILE'])if(!main.includes(marker))throw new Error('managed launcher missing '+marker)
  for(const file of ['lib/managed-cli.js','package.json','node_modules/@deepseek-ai/dsh/lib/bin.js','node_modules/@deepseek-ai/dsh-product-policy/lib/index.js','node_modules/@lawyer-dsh/market/lib/managed/engine.js','node_modules/pnpm/bin/pnpm.mjs'])if(!existsSync(join(physical,file)))throw new Error('physical product runtime missing '+file)
  const policy=readFileSync(join(physical,'node_modules/@deepseek-ai/dsh-product-policy/lib/index.js'),'utf8')
  if(!policy.includes('https://model.codingrui.work/v1'))throw new Error('managed model endpoint not sealed in runtime')
  for(const file of ['platform.tgz','brand.tgz','market.tgz']) {
    const packaged=join(resources,'lawyer-product',file), source=join(context.packager.projectDir,'../vendor/lawyer-product',file)
    if(!existsSync(packaged))throw new Error('missing first-run seed '+file)
    const sha=b=>createHash('sha256').update(b).digest('hex')
    if(sha(readFileSync(packaged))!==sha(readFileSync(source)))throw new Error('seed artifact mismatch '+file)
  }
  const files=asar.listPackage(archive)
  if(files.some(file=>/\/(?:\.secrets|\.credentials\.yaml|lawyer-market-signing\.pem)(?:\/|$)/.test(file)))throw new Error('private data must not be packaged')
  console.log('LawyerDesk packaged entry, managed runtime, physical Node files and exact seed artifacts verified')
}
