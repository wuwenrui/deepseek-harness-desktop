#!/usr/bin/env node
/** Real packaged no-argument launch: Finder/Start-menu argv differs from a debugger launch. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const exe=join(root,'dist/mac-arm64/LawyerCopilot.app/Contents/MacOS/LawyerCopilot')
const home=mkdtempSync(join(tmpdir(),'lawyer-native-noargv-'))
const env={...process.env,LAWYER_DESKTOP_HOME:home}
for(const key of ['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH'])delete env[key]
const child=spawn(exe,[],{env,stdio:['ignore','pipe','pipe'],detached:true})
let log='',exitCode,ready
const exited=new Promise(resolve=>child.once('exit',code=>{exitCode=code;resolve(code)}))
const capture=chunk=>{log=(log+chunk.toString()).slice(-25000);for(const line of log.split('\n')){if(line.startsWith('{'))try{const event=JSON.parse(line);if(event.event==='lawyer-desktop-ready')ready=event}catch{}}}
child.stdout.on('data',capture);child.stderr.on('data',capture)
const out=join(root,'dist/e2e-packaged');mkdirSync(out,{recursive:true})
try{
 const deadline=Date.now()+90000
 while(!ready&&Date.now()<deadline){assert.equal(exitCode,undefined,'packaged process exited before native readiness');await new Promise(r=>setTimeout(r,100))}
 assert.ok(ready,'no-argument native launch did not become ready: '+log.replace(/token=\S+/g,'token=[redacted]'))
 assert.equal(ready.home,home);assert.equal(ready.profile,'lawyer')
 child.kill('SIGTERM')
 const code=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('native shutdown did not settle')),12000))])
 assert.equal(code,0)
 const report={ok:true,coldLaunch:true,noDebugArguments:true,executable:exe,home,ready,gracefulExitCode:code}
 writeFileSync(join(out,'cold-launch.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){writeFileSync(join(out,'cold-launch-failure.log'),String(error.stack??error)+'\n'+log.replace(/token=\S+/g,'token=[redacted]'));throw error}
finally{if(exitCode===undefined){child.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,1000))]);if(exitCode===undefined)try{process.kill(-child.pid,'SIGKILL')}catch{}}}
