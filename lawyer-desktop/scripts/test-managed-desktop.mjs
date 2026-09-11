#!/usr/bin/env node
/** Real Electron and real packaged/source DSH; only external model/catalog HTTP is a fixture. */
import assert from 'node:assert/strict'
import { _electron as electron } from '../../../dsh-market/node_modules/playwright/index.mjs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
import { scanZstdFrames } from '../../../deepseek-harness/packages/session/session-persistence-jsonl/lib/types/zstd.js'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const workspace=resolve(root,'../..')
const require=createRequire(root+'/package.json')
const packaged=process.argv.includes('--packaged')
const executable=packaged?join(root,'dist/mac-arm64/LawyerDesk.app/Contents/MacOS/LawyerDesk'):require('electron')
const home=mkdtempSync(join(tmpdir(),'lawyer-native-e2e-'))
const out=join(root,'dist',packaged?'e2e-packaged':'e2e-source');mkdirSync(out,{recursive:true})
const material=join(home,'workspace');mkdirSync(material);writeFileSync(join(material,'测试合同.txt'),'服务合同：甲方委托乙方提供服务，约定分期支付费用。仅为桌面端集成验收材料。\n')
const central=join(workspace,'lawyer-harness/dist/central-market')
let modelCalls=0
const traffic=[]
const server=createServer(async(req,res)=>{
 traffic.push(req.url)
 if(req.url==='/lawyer-market/catalog.json'){res.setHeader('content-type','application/json');res.end(readFileSync(join(central,'catalog.json')));return}
 const match=/^\/lawyer-market\/artifacts\/([a-f0-9]{64}\.tgz)$/.exec(req.url??'')
 if(match){res.end(readFileSync(join(central,'artifacts',match[1])));return}
 if(req.url==='/v1/models'){assert.equal(req.headers.authorization,'Bearer desktop-test-token');res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'deepseek-v4-flash',name:'本站桌面验收模型',context_window:32768,max_tokens:4096}]}));return}
 if(req.url==='/v1/chat/completions'){
  assert.equal(req.headers.authorization,'Bearer desktop-test-token');modelCalls++
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.model,'deepseek-v4-flash')
  const base={id:'native-integration',object:'chat.completion.chunk',created:1,model:body.model}
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
  res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'桌面端已通过本站模型通路验收。'},finish_reason:null}]})}\n\n`)
  res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:40,completion_tokens:12,total_tokens:52}})}\n\n`)
  res.end('data: [DONE]\n\n');return
 }
 res.writeHead(404);res.end()
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const fixture=`http://127.0.0.1:${server.address().port}`
let instance,page,logs='',port
const errors=[]
async function launch(){
 logs=''
 instance=await electron.launch({executablePath:executable,args:packaged?[]:[root+'/lib/main.js'],env:{...process.env,LAWYER_DESKTOP_HOME:home,ELECTRON_RUN_AS_NODE:''},timeout:90000})
 for(const stream of [instance.process().stdout,instance.process().stderr])stream?.on('data',b=>{logs=(logs+b.toString().replace(/token=\S+/g,'token=[redacted]')).slice(-20000)})

 const deadline=Date.now()+90000
 while(Date.now()<deadline){page=instance.windows().find(p=>p.url().startsWith('http://127.0.0.1:'));if(page)break;await new Promise(r=>setTimeout(r,200))}
 assert.ok(page,'desktop did not create its real WebContentsView')
 page.on('pageerror',e=>errors.push(e.message))
 await page.getByRole('button',{name:'设置',exact:true}).waitFor({timeout:30000})
 await instance.evaluate((_electron,fixture)=>{
  const original=globalThis.fetch
  globalThis.fetch=(input,init)=>{
   const source=new URL(input instanceof Request?input.url:String(input))
   if(source.origin==='https://model.codingrui.work'){const url=new URL(source.pathname+source.search,fixture);return original(input instanceof Request?new Request(url,input):url,init)}
   return original(input,init)
  }
 },fixture)
 port=new URL(page.url()).port
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=img]')).some(el=>el.getAttribute('aria-label')==='律师工作台印章'))
}
async function close(){
 if(!instance)return
 const child=instance.process();let timer
 // Use the application's real SIGTERM shutdown on every launch. Playwright's
 // cached command-line require handle may bind before a warm ESM boot settles.
 child.kill('SIGTERM')
 try{await Promise.race([instance.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Electron test teardown timed out')),12000)})])}
 catch(error){try{process.kill(child.pid,'SIGTERM')}catch{};await new Promise(r=>setTimeout(r,800));try{process.kill(child.pid,'SIGKILL')}catch{};throw error}
 finally{clearTimeout(timer);instance=undefined;page=undefined}
}
async function request(path,body){return page.evaluate(async({path,body})=>{const r=await fetch('/dsh-market/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-lawyer-market':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,value:await r.json()}},{path,body})}
async function screenshot(name){
 await page.screenshot({path:join(out,name+'.png')})
 const chrome=instance.windows().find(p=>p.url().includes('compatibility-chrome.html'))
 if(chrome)await chrome.screenshot({path:join(out,name+'-chrome.png')})
}

async function palette(){return page.getByRole('button',{name:'设置',exact:true}).evaluate(el=>({base:getComputedStyle(el).getPropertyValue('--dsw-alias-bg-base').trim(),brand:getComputedStyle(el).getPropertyValue('--dsw-alias-brand-primary').trim()}))}
try{
 await launch()
 const isolation=await instance.evaluate(()=>{const {webContents}=process.getBuiltinModule('module').createRequire(process.execPath)('electron');return webContents.getAllWebContents().filter(w=>w.getURL().startsWith('http://127.0.0.1:')).map(w=>{const p=w.getLastWebPreferences();return{nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation,sandbox:p.sandbox}})})
 assert.ok(isolation.length>0);for(const p of isolation)assert.deepEqual(p,{nodeIntegration:false,contextIsolation:true,sandbox:true})
 await page.waitForTimeout(500);assert.deepEqual(await palette(),{base:'#f6f1e6',brand:'#a63a2a'});await screenshot('01-brand-light')
 await page.getByRole('button',{name:'设置',exact:true}).click()
 await page.getByRole('button',{name:'通用设置',exact:true}).click()
 await page.getByRole('button',{name:'深色',exact:true}).click()
 await page.keyboard.press('Escape')
 let dark
 for(let i=0;i<35;i++){dark=await palette();if(dark.base==='#1d2530')break;await page.waitForTimeout(100)}
 assert.deepEqual(dark,{base:'#1d2530',brand:'#db8d78'});await screenshot('02-brand-dark')
 await page.getByRole('button',{name:'设置',exact:true}).click()
 await page.getByRole('button',{name:'通用设置',exact:true}).click()
 await page.getByRole('button',{name:'浅色',exact:true}).click()
 await page.keyboard.press('Escape')
 const native=instance.windows().find(p=>p.url().includes('compatibility-chrome.html'));assert.ok(native)
 const blocked=await native.evaluate(async()=>{try{await window.desktopChrome.invoke('terminal');return false}catch{return true}});assert.equal(blocked,true)
 const denied=await fetch(`http://127.0.0.1:${port}/dsh-market/models`);assert.equal(denied.status,403,'ordinary browsers cannot use desktop-only carrier')
 const modes=['律师工作模式','标准模式','PTC 模式','极简模式','创造模式']
 await page.getByRole('button',{name:'律师工作模式',exact:true}).click()
 for(const mode of modes)await page.getByRole('menuitem',{name:new RegExp('^'+mode)}).first().waitFor()
 await screenshot('03-five-presets');await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'模型服务',exact:true}).click()
 await page.getByLabel('本站 API 令牌',{exact:true}).fill('desktop-test-token');await page.getByRole('button',{name:'保存令牌',exact:true}).click()
 await page.getByText('令牌已保存，可刷新可用模型。',{exact:true}).waitFor();await page.getByRole('button',{name:'刷新可用模型',exact:true}).click();await page.getByText('保存成功',{exact:true}).waitFor()
 assert.equal((await request('models')).value.configured,true)
 for(const path of ['restore','region','self-uninstall','approve-builds','api/v1/updates'])assert.equal((await request(path,{url:'https://evil.example',force:true})).status,403)
 assert.equal((await request('credential',{key:'unused',baseURL:'https://evil.example'})).status,403)
 await page.getByRole('button',{name:'律师能力',exact:true}).click();await page.getByRole('heading',{name:'立案材料与批次管理',exact:true}).waitFor({timeout:15000});await screenshot('04-managed-market')
 // A direct DOM confirm is still native Electron: the request below exercises the same
 // real host executor without needing to automate macOS's modal browser confirmation.
 const install=await request('install',{id:'lawyer-filing',version:'0.3.1'})
 assert.equal(install.status,200,JSON.stringify(install.value));assert.equal(install.value.restartRequired,true)
 const installed=await request('installed');assert.ok(installed.value.installed.some(p=>p.id==='lawyer-filing'))
 await close();await launch()
 const after=await request('installed');assert.ok(after.value.installed.some(p=>p.id==='lawyer-filing'));assert.equal((await request('models')).value.configured,true)
 const tools=await page.evaluate(async()=>{const r=await fetch('/lawyer-platform/ready');return(await r.json()).tools});assert.ok(tools.includes('filing_check_materials'))
 const mediation=await request('install',{id:'lawyer-mediation',version:'0.1.0'});assert.equal(mediation.status,200,JSON.stringify(mediation.value))
 await close();await launch()
 const allTools=await page.evaluate(async()=>{const r=await fetch('/lawyer-platform/ready');return(await r.json()).tools});assert.ok(allTools.includes('filing_check_materials'));assert.ok(allTools.includes('mediation_precheck'))
 await page.getByRole('textbox',{name:'选择工作区'}).click();const picker=page.getByRole('dialog',{name:'选择工作区目录'});await picker.getByRole('button',{name:'编辑路径'}).click();await picker.getByRole('textbox',{name:'编辑路径'}).fill(material);await picker.getByRole('textbox',{name:'编辑路径'}).press('Enter');await picker.getByRole('button',{name:'打开',exact:true}).click()
 const input=page.locator('[data-composer-input][contenteditable=true]').last();await input.waitFor({timeout:15000});await input.click();await input.pressSequentially('只验证桌面端的本站模型通路，不执行业务提交。');await input.press('Enter')
 await page.getByText('桌面端已通过本站模型通路验收。',{exact:false}).first().waitFor({timeout:30000});await screenshot('05-native-conversation');assert.ok(modelCalls>0)
 await close()
 const sessionDir=join(home,'sessions');const files=readdirSync(sessionDir,{recursive:true}).filter(name=>String(name).endsWith('.jsonl.zstd'));assert.ok(files.length>0)
 const text=files.map(file=>{const b=readFileSync(join(sessionDir,String(file)));return scanZstdFrames(b).frames.map(({start,end})=>zstdDecompressSync(b.subarray(start,end)).toString()).join('')}).join('\n')
 assert.ok(text.split('\n').filter(Boolean).map(JSON.parse).some(e=>e.type==='assistant/message'&&JSON.stringify(e.data).includes('桌面端已通过本站模型通路验收。')))
 assert.deepEqual(errors,[])
 const report={ok:true,packaged,executable,home,modes,brand:{light:'#f6f1e6',primary:'#a63a2a',dark:'#1d2530',darkPrimary:'#db8d78'},nativeIsolation:isolation,nativeTerminalBlocked:true,ordinaryBrowserDenied:true,realPluginInstall:['lawyer-filing@0.3.1','lawyer-mediation@0.1.0'],modelCalls,durableSessions:files.length,pageErrors:errors,remoteServices:'test HTTP fixtures only',productionModelCall:false}
 writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){writeFileSync(join(out,'failure.log'),String(error.stack??error)+'\n'+logs);if(page){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});writeFileSync(join(out,'failure-page.txt'),await page.locator('body').innerText().catch(()=>''))}console.error(error);console.error('Test evidence: '+out);process.exitCode=1}finally{await close();server.closeAllConnections();await new Promise(r=>server.close(r))}
