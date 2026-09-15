/** Test-only transport boundary, installed before app code and inherited by Node-mode children. */
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { appendFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
export function installNetworkGuard({ origin, log, childLog, preload }) {
  const loopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
  function deny(destination) {
    appendFileSync(log, JSON.stringify({ blocked: String(destination) }) + '\n')
    throw new Error('Native fixture blocked external transport: ' + destination)
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin === 'https://model.codingrui.work') {
      const target = new URL(url.pathname + url.search, origin)
      return originalFetch(input instanceof Request ? new Request(target, input) : target, init)
    }
    if (!loopback(url.hostname)) deny(url.origin)
    return originalFetch(input, init)
  }
  function checkHttp(input) {
    if (typeof input === 'string' || input instanceof URL) {
      const url = new URL(input); if (!loopback(url.hostname)) deny(url.origin)
    } else if (!input?.socketPath && !loopback(input?.hostname ?? input?.host ?? 'localhost')) deny(input?.hostname ?? input?.host)
  }
  for (const name of ['node:http', 'node:https']) {
    const module = require(name)
    for (const method of ['request', 'get']) {
      const original = module[method]
      module[method] = function (...args) { checkHttp(args[0]); return original.apply(this, args) }
    }
  }
  const net = require('node:net'), connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    const values = Array.isArray(args[0]) ? args[0] : args
    const options = values[0]
    const host = typeof options === 'object' ? options.host : typeof values[1] === 'string' ? values[1] : 'localhost'
    if (!(typeof options === 'object' && options.path) && host && !loopback(host)) deny(host)
    return connect.apply(this, args)
  }
  const cp = require('node:child_process'), spawn = cp.spawn
  cp.spawn = function (file, args, options) {
    if (options?.env?.ELECTRON_RUN_AS_NODE === '1') args = ['--import', preload, ...args]
    const child = spawn.call(this, file, args, options)
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', data => appendFileSync(childLog, data.toString().replace(/token=[^\s&]+/g, 'token=[redacted]')))
    return child
  }
  syncBuiltinESMExports()
  if (process.versions.electron && process.env.ELECTRON_RUN_AS_NODE !== '1') {
    const { app, session } = require('electron')
    const guarded = new WeakSet()
    const protect = target => {
      if (guarded.has(target)) return
      guarded.add(target)
      target.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url)
        if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && !loopback(url.hostname)) {
          appendFileSync(log, JSON.stringify({ blocked: url.origin, renderer: true }) + '\n')
          callback({ cancel: true })
        } else callback({})
      })
    }
    app.on('session-created', protect)
    void app.whenReady().then(() => protect(session.defaultSession))
  }
}
