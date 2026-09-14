import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
const build = resolve('build'); mkdirSync(build, { recursive: true })
const stamp = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="64" y="64" width="896" height="896" rx="208" fill="#a63a2a"/><text x="512" y="712" text-anchor="middle" fill="#ffffff" font-size="576" font-weight="600" font-family="-apple-system, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif">律</text></svg>`
writeFileSync(resolve(build,'lawyer-mark.svg'),stamp)
for(const name of ['app-icon.png','app-icon-mac.png']) await sharp(Buffer.from(stamp)).png().toFile(resolve(build,name))
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="5" fill="#000"/><path d="M8 9h16M11 7v18M8 15h16M18 7v18M8 21h16" fill="none" stroke="#fff" stroke-width="1.8"/></svg>`
writeFileSync(resolve(build,'tray-icon.svg'),tray)
for(const [file,size] of [['tray-iconTemplate.png',22],['tray-iconTemplate@2x.png',44],['tray-icon-blue.png',32],['tray-icon-blue@1.25x.png',40],['tray-icon-blue@1.5x.png',48],['tray-icon-blue@2x.png',64]]) await sharp(Buffer.from(tray)).resize(size,size).png().toFile(resolve(build,file))
console.log('Generated owned LawyerDesk seal and tray assets')
