#!/usr/bin/env node
/** Real Electron and real packaged/source DSH; only external model/catalog HTTP is a fixture. */
import assert from 'node:assert/strict'
import { prepareBillingInstallation, inspectNativeCarrier } from './billing-test-installation.mjs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const packaged=process.argv.includes('--packaged')
const out=join(root,'dist',packaged?'e2e-packaged':'e2e-source');mkdirSync(out,{recursive:true});rmSync(join(out,'report.json'),{force:true})
const productRootIndex=process.argv.indexOf('--product-root')
const workspace=productRootIndex>=0?resolve(process.argv[productRootIndex+1]):resolve(root,'../..')
const { _electron: electron }=await import(pathToFileURL(join(workspace,'dsh-market/node_modules/playwright/index.mjs')))
const { scanZstdFrames }=await import(pathToFileURL(join(workspace,'deepseek-harness/packages/session/session-persistence-jsonl/lib/types/zstd.js')))
const require=createRequire(root+'/package.json')
const executable=packaged?join(root,'dist/mac-arm64/LawyerDesk.app/Contents/MacOS/LawyerDesk'):require('electron')
const home=mkdtempSync(join(tmpdir(),'lawyer-native-e2e-'))
const material=join(home,'workspace');mkdirSync(material);writeFileSync(join(material,'测试合同.txt'),'服务合同：甲方委托乙方提供服务，约定分期支付费用。仅为桌面端集成验收材料。\n')
function option(name) { const i=process.argv.indexOf(name); return i<0?undefined:process.argv[i+1] }
const testTrust=option('--test-trust'),dependencyStore=option('--dependency-store')
assert.ok(dependencyStore,'Pass --dependency-store with prepared public dependency cache')
assert.ok(testTrust&&option('--catalog-dir'),'Pass explicit --catalog-dir and --test-trust; production trust is never replaced for tests')
const central=resolve(option('--catalog-dir')??join(workspace,'lawyer-harness/dist/central-market'))
let modelCalls=0
const modelRequests=[]
const traffic=[],fixtureErrors=[]
const server=createServer(async(req,res)=>{try{
 traffic.push(req.url)
 if(req.url==='/lawyer-market/catalog.json'){res.setHeader('content-type','application/json');res.end(readFileSync(join(central,'catalog.json')));return}
 const match=/^\/lawyer-market\/artifacts\/([a-f0-9]{64}\.tgz)$/.exec(req.url??'')
 if(match){res.end(readFileSync(join(central,'artifacts',match[1])));return}
 if(req.url==='/v1/models'){assert.equal(req.headers.authorization,'Bearer desktop-test-token');res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'deepseek-v4-flash',name:'本站桌面验收模型',context_window:32768,max_tokens:4096}]}));return}
 if(req.url==='/v1/chat/completions'){
  assert.equal(req.headers.authorization,'Bearer desktop-test-token');modelCalls++
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));assert.equal(body.model,'deepseek-v4-flash')
  modelRequests.push({conv:JSON.stringify(body.messages??[]).includes('只验证桌面端的本站模型通路'),names:(body.tools??[]).map(tool=>tool?.function?.name??tool?.name).filter(name=>typeof name==='string')})
  const base={id:'native-integration',object:'chat.completion.chunk',created:1,model:body.model}
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
  res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'桌面端已通过本站模型通路验收。'},finish_reason:null}]})}\n\n`)
  res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:40,completion_tokens:12,total_tokens:52}})}\n\n`)
  res.end('data: [DONE]\n\n');return
 }
 res.writeHead(404);res.end()
}catch(error){fixtureErrors.push(String(error));if(!res.headersSent)res.writeHead(500);res.end('fixture assertion failed')}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const fixture=`http://127.0.0.1:${server.address().port}`
let installation,report,nativeCarrier
async function prepare(){installation=await prepareBillingInstallation({root,scratch:home,packaged,testTrust:resolve(testTrust),require,dependencyStore:resolve(dependencyStore),origin:fixture,bootstrap:(entry,appPath)=>`import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);${appPath?`require('electron').app.setAppPath(${JSON.stringify(appPath)});`:''}
await import(${JSON.stringify(entry)});`})}
let instance,page,logs='',port
const errors=[]
async function launch(){
 logs=''
 const env={...process.env,LAWYER_DESKTOP_HOME:home,ELECTRON_RUN_AS_NODE:'',NODE_OPTIONS:'',NODE_PATH:''}
 for(const key of ['NEW_API_KEY','DEEPSEEK_API_KEY','OPENAI_API_KEY','DEEPSEEK_BASE_URL'])delete env[key]
 instance=await electron.launch({executablePath:installation?.executablePath??executable,args:installation?.args??(packaged?[]:[root+'/lib/main.js']),env,timeout:90000})
 for(const stream of [instance.process().stdout,instance.process().stderr])stream?.on('data',b=>{logs=(logs+b.toString().replace(/token=\S+/g,'token=[redacted]')).slice(-20000)})

 const deadline=Date.now()+90000
 while(Date.now()<deadline){if(instance.process().exitCode!=null||instance.process().signalCode!=null)throw new Error('native startup exited: '+logs);page=instance.windows().find(p=>p.url().startsWith('http://127.0.0.1:'));if(page&&logs.includes('"event":"lawyer-desktop-ready"'))break;await new Promise(r=>setTimeout(r,200))}
 assert.ok(page&&logs.includes('"event":"lawyer-desktop-ready"'),'desktop did not complete real healthy startup: '+logs)
 page.on('pageerror',e=>errors.push(e.message))
 await page.getByRole('button',{name:'设置',exact:true}).waitFor({timeout:30000})
 await page.waitForFunction(()=>document.readyState==='complete'&&Boolean(window.__DSH_BOOT__))
 nativeCarrier=await inspectNativeCarrier(instance,{packaged,executablePath:installation.executablePath,scratch:home})
 port=new URL(page.url()).port
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=img]')).some(el=>el.getAttribute('aria-label')==='律衡印章'))
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
 await prepare()
 await launch()
 const isolation=await instance.evaluate(()=>{const {webContents}=process.getBuiltinModule('module').createRequire(process.execPath)('electron');return webContents.getAllWebContents().filter(w=>w.getURL().startsWith('http://127.0.0.1:')).map(w=>{const p=w.getLastWebPreferences();return{nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation,sandbox:p.sandbox}})})
 assert.ok(isolation.length>0);for(const p of isolation)assert.deepEqual(p,{nodeIntegration:false,contextIsolation:true,sandbox:true})
 await page.waitForTimeout(500);assert.deepEqual(await palette(),{base:'#f7f7f8',brand:'#a63a2a'});await screenshot('01-brand-light')
 await page.getByRole('button',{name:'设置',exact:true}).click()
 await page.getByRole('button',{name:'通用设置',exact:true}).click()
 await page.getByRole('button',{name:'深色',exact:true}).click()
 await page.keyboard.press('Escape')
 let dark
 for(let i=0;i<35;i++){dark=await palette();if(dark.base==='#101113')break;await page.waitForTimeout(100)}
 assert.deepEqual(dark,{base:'#101113',brand:'#c4695a'});await screenshot('02-brand-dark')
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
 // 在真实界面里走一遍：市场自绘的确认弹窗 → 卡片内进度 → 「重启后生效」提示。
 // 装完第一个之后**不重启**，直接装第二个：重启只负责让新能力生效，不是继续安装的前置条件。
 const filingCard=page.locator('article').filter({has:page.getByRole('heading',{name:'立案材料与批次管理',exact:true})})
 await filingCard.getByRole('button',{name:'安装',exact:true}).click()
 await page.getByRole('button',{name:'确认安装',exact:true}).click()
 await filingCard.getByRole('progressbar').waitFor({timeout:30000})
 assert.equal(await page.locator('[role="progressbar"]').count(),1,'进度只显示在正在安装的那张卡片上')
 await filingCard.getByRole('progressbar').waitFor({state:'detached',timeout:180000})
 await page.getByText('安装已完成，重启后生效',{exact:false}).waitFor({timeout:15000})
 const installed=await request('installed');assert.ok(installed.value.installed.some(p=>p.id==='lawyer-filing'));assert.equal(installed.value.restartRequired,true)
 const mediationCard=page.locator('article').filter({has:page.getByRole('heading',{name:'调解业务协作',exact:true})})
 const mediationInstall=mediationCard.getByRole('button',{name:'安装',exact:true})
 await mediationInstall.waitFor({timeout:15000})
 assert.equal(await mediationInstall.isDisabled(),false,'重启提示不能锁住下一个能力的安装')
 await mediationInstall.click()
 await page.getByRole('button',{name:'确认安装',exact:true}).click()
 await mediationCard.getByRole('progressbar').waitFor({timeout:30000})
 await mediationCard.getByRole('progressbar').waitFor({state:'detached',timeout:180000})
 const both=await request('installed');assert.ok(both.value.installed.some(p=>p.id==='lawyer-filing')&&both.value.installed.some(p=>p.id==='lawyer-mediation'))
 await screenshot('04b-two-installs-before-restart')
 await close();await launch()
 const after=await request('installed');assert.ok(after.value.installed.some(p=>p.id==='lawyer-filing'));assert.equal((await request('models')).value.configured,true)
 const tools=await page.evaluate(async()=>{const r=await fetch('/lawyer-platform/ready');return(await r.json()).tools});assert.ok(tools.includes('filing_check_materials'));assert.ok(tools.includes('mediation_precheck'),'一次重启后两个新能力必须都生效')
 await page.getByRole('textbox',{name:'选择工作区'}).click();const picker=page.getByRole('dialog',{name:'选择工作区目录'});await picker.getByRole('button',{name:'编辑路径'}).click();await picker.getByRole('textbox',{name:'编辑路径'}).fill(material);await picker.getByRole('textbox',{name:'编辑路径'}).press('Enter');await picker.getByRole('button',{name:'打开',exact:true}).click()
 const input=page.locator('[data-composer-input][contenteditable=true]').last();await input.waitFor({timeout:15000});await input.click();await input.pressSequentially('只验证桌面端的本站模型通路，不执行业务提交。');await input.press('Enter')
 await page.getByText('桌面端已通过本站模型通路验收。',{exact:false}).first().waitFor({timeout:30000});await screenshot('05-native-conversation');assert.ok(modelCalls>0)
 // Agent Teams is a default capability: the Lead session's model tool surface carries the Team
 // tools, and the shipped Web profile exposes the roster panel. Team tools are agent-scoped, so an
 // unscoped /lawyer-platform/ready probe legitimately cannot see them.
 const conversation=modelRequests.find(request=>request.conv)
 assert.ok(conversation,'the conversation turn never reached the model fixture: '+JSON.stringify(modelRequests.map(request=>({conv:request.conv,tools:request.names.length}))))
 for(const tool of ['spawn_teammate','send_message','list_agents','wait_agent','team_task_create','team_task_list'])assert.ok(conversation.names.includes(tool),'Agent Teams tool is missing from the Lead model tool surface: '+tool+' (received '+conversation.names.join(',')+')')
 const teamTrigger=page.getByRole('button',{name:'Agent Team',exact:true}).first();await teamTrigger.waitFor({timeout:15000});await teamTrigger.click()
 const teamPanel=page.getByRole('dialog',{name:'Agent Team'});await teamPanel.waitFor({timeout:15000})
 await teamPanel.getByText(new RegExp('^(成员|Members)$')).first().waitFor({timeout:15000});await screenshot('06-agent-team-panel')
 await teamPanel.getByRole('button',{name:'关闭',exact:true}).click()
 await close()
 // An installation created before Agent Teams shipped composes only the legacy product prefix;
 // the next start must move it onto the current prefix without dropping market-installed plugins.
 const profileManifest=join(home,'profiles/lawyer/package.json')
 const legacy=JSON.parse(readFileSync(profileManifest,'utf8'))
 const marketBundles=legacy.dsh.profile.bundles.filter(name=>name.startsWith('@lawyer-dsh/lawyer-filing')||name.startsWith('@lawyer-dsh/lawyer-mediation'))
 legacy.dsh.profile.bundles=['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@lawyer-dsh/lawyer-platform','@lawyer-dsh/lawyer-brand','@lawyer-dsh/market',...marketBundles]
 writeFileSync(profileManifest,JSON.stringify(legacy,null,2)+'\n')
 await launch()
 const migrated=JSON.parse(readFileSync(profileManifest,'utf8')).dsh.profile.bundles
 assert.deepEqual(migrated,['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@deepseek-ai/dsh-experimental-agent-team-profile','@deepseek-ai/dsh-experimental-agent-team-web-profile','@lawyer-dsh/lawyer-platform','@lawyer-dsh/lawyer-brand','@changfenhuang/dsh-genui','dsh-better-sidebar','@lawyer-dsh/market',...marketBundles])
 await close()
 const sessionDir=join(home,'sessions');const files=readdirSync(sessionDir,{recursive:true}).filter(name=>String(name).endsWith('.jsonl.zstd'));assert.ok(files.length>0)
 const text=files.map(file=>{const b=readFileSync(join(sessionDir,String(file)));return scanZstdFrames(b).frames.map(({start,end})=>zstdDecompressSync(b.subarray(start,end)).toString()).join('')}).join('\n')
 assert.ok(text.split('\n').filter(Boolean).map(JSON.parse).some(e=>e.type==='assistant/message'&&JSON.stringify(e.data).includes('桌面端已通过本站模型通路验收。')))
 assert.deepEqual(errors,[]);assert.deepEqual(fixtureErrors,[])
 report={ok:true,packaged,executable:installation?.executablePath??executable,disposableCopy:Boolean(installation),testTrust,central,home,nativeCarrier,modes,brand:{light:'#f7f7f8',primary:'#a63a2a',dark:'#101113',darkPrimary:'#c4695a'},nativeIsolation:isolation,nativeTerminalBlocked:true,ordinaryBrowserDenied:true,realPluginInstall:['lawyer-filing@0.3.1','lawyer-mediation@0.1.0'],agentTeam:{enabled:true,leadTools:['spawn_teammate','send_message','list_agents','wait_agent','team_task_create','team_task_list'].filter(name=>(modelRequests.find(request=>request.conv)?.names??[]).includes(name)),panelOpened:true,upgradeMigrated:true},modelCalls,durableSessions:files.length,pageErrors:errors,remoteServices:'test HTTP fixtures only',productionModelCall:false}

}catch(error){writeFileSync(join(out,'failure.log'),String(error.stack??error)+'\n'+logs);if(page){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});writeFileSync(join(out,'failure-page.txt'),await page.locator('body').innerText().catch(()=>''))}console.error(error);console.error('Test evidence: '+out);process.exitCode=1}finally{
 const settled=await Promise.allSettled([close(),(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))})()])
 try{installation?.assertOriginalUnchanged();installation?.assertNoExternalAttempts();for(const result of settled)if(result.status==='rejected')throw result.reason}
 catch(error){process.exitCode=1;writeFileSync(join(out,'failure.log'),String(error.stack??error));console.error(error)}
}
if(report&&!process.exitCode){report.originalAppAndTrustUnchanged=true;report.guardedExternalTransportAttempts=0;report.networkBoundary='Application fetch/http/socket, managed Electron-Node children and renderer sessions; not an OS-wide packet capture';writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
