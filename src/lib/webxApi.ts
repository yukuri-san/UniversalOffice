import { useEffect, useRef, type RefObject } from 'react'
import { APP_VERSION } from './version'
import { notifyOs } from './notify'

/**
 * WebX API（開発者用システム関数）
 *
 * マイApp（サンドボックス iframe 内の HTML アプリ）から WebX の機能を呼ぶための仕組み。
 * - iframe 側：srcDoc に SDK（window.WebX）を自動注入する（injectWebxSdk）。
 * - WebX 側：CustomAppView が postMessage を受けて処理し、結果を返す（useWebxApiBridge）。
 * 通信形式：
 *   呼び出し { __webxApi: 1, kind: 'call', reqId, method, args }
 *   応答     { __webxApi: 1, kind: 'result', reqId, ok, value?, error? }
 * 仕様は DEVELOPER.md に記載。
 */

export const WEBX_API_VERSION = 1

const SDK = `
(function () {
  if (window.WebX) return
  var seq = 0
  var pending = {}
  window.addEventListener('message', function (ev) {
    var d = ev.data
    if (!d || d.__webxApi !== 1 || d.kind !== 'result') return
    var p = pending[d.reqId]
    if (!p) return
    delete pending[d.reqId]
    if (d.ok) p.resolve(d.value)
    else p.reject(new Error(d.error || 'WebX API error'))
  })
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var reqId = 'r' + (++seq) + '-' + Date.now()
      pending[reqId] = { resolve: resolve, reject: reject }
      parent.postMessage({ __webxApi: 1, kind: 'call', reqId: reqId, method: method, args: args || [] }, '*')
      setTimeout(function () {
        if (pending[reqId]) { delete pending[reqId]; reject(new Error('WebX API timeout: ' + method)) }
      }, 10000)
    })
  }
  window.WebX = {
    apiVersion: ${WEBX_API_VERSION},
    notify: function (text) { return call('notify', [String(text)]) },
    openApp: function (id) { return call('openApp', [String(id)]) },
    storage: {
      get: function (key, fallback) {
        return call('storage.get', [String(key)]).then(function (v) { return v === null || v === undefined ? (fallback === undefined ? null : fallback) : v })
      },
      set: function (key, value) { return call('storage.set', [String(key), value]) },
      remove: function (key) { return call('storage.remove', [String(key)]) },
      keys: function () { return call('storage.keys', []) }
    },
    system: {
      info: function () { return call('system.info', []) },
      theme: function () { return call('system.info', []).then(function (i) { return i.theme }) },
      lang: function () { return call('system.info', []).then(function (i) { return i.lang }) },
      version: function () { return call('system.info', []).then(function (i) { return i.appVersion }) }
    },
    clipboard: {
      write: function (text) { return call('clipboard.write', [String(text)]) }
    }
  }
})()
`

/** マイApp の HTML に SDK を注入する（<head> の直後、無ければ先頭） */
export function injectWebxSdk(html: string): string {
  const tag = `<script>${SDK}</` + 'script>'
  const m = html.match(/<head[^>]*>/i)
  if (m && m.index !== undefined) {
    const at = m.index + m[0].length
    return html.slice(0, at) + tag + html.slice(at)
  }
  return tag + html
}

const APPDATA_PREFIX = 'webx-appdata:'
const MAX_VALUE_BYTES = 200 * 1024

function storageKey(appId: string, key: string): string {
  return `${APPDATA_PREFIX}${appId}:${key}`
}

export interface WebxSystemInfo {
  appVersion: string
  apiVersion: number
  theme: string | null
  lang: string | null
  uiMode: string | null
  platform: string
  userAgent: string
  screen: { width: number; height: number }
}

function systemInfo(): WebxSystemInfo {
  const root = document.querySelector('.os-root')
  return {
    appVersion: APP_VERSION,
    apiVersion: WEBX_API_VERSION,
    theme: root?.getAttribute('data-theme') ?? localStorage.getItem('ykr-theme'),
    lang: localStorage.getItem('ykr-lang'),
    uiMode: localStorage.getItem('webx-ui-mode'),
    platform: navigator.platform ?? '',
    userAgent: navigator.userAgent,
    screen: { width: window.screen.width, height: window.screen.height },
  }
}

/** WebX 側で API 呼び出しを処理する。未対応メソッドは例外にする */
export async function handleWebxApiCall(
  appId: string,
  method: string,
  args: unknown[],
  opts: { openApp?: (id: string) => void }
): Promise<unknown> {
  switch (method) {
    case 'notify': {
      const text = String(args[0] ?? '').slice(0, 300)
      if (!text) throw new Error('notify: text is empty')
      notifyOs(text, appId)
      return true
    }
    case 'openApp': {
      const id = String(args[0] ?? '')
      if (!id) throw new Error('openApp: id is empty')
      if (!opts.openApp) throw new Error('openApp is not available')
      opts.openApp(id)
      return true
    }
    case 'storage.get': {
      const raw = localStorage.getItem(storageKey(appId, String(args[0] ?? '')))
      if (raw === null) return null
      try { return JSON.parse(raw) } catch { return raw }
    }
    case 'storage.set': {
      const json = JSON.stringify(args[1] ?? null)
      if (new TextEncoder().encode(json).length > MAX_VALUE_BYTES) {
        throw new Error('storage.set: value too large (max 200KB)')
      }
      localStorage.setItem(storageKey(appId, String(args[0] ?? '')), json)
      return true
    }
    case 'storage.remove': {
      localStorage.removeItem(storageKey(appId, String(args[0] ?? '')))
      return true
    }
    case 'storage.keys': {
      const prefix = `${APPDATA_PREFIX}${appId}:`
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix)) keys.push(k.slice(prefix.length))
      }
      return keys
    }
    case 'system.info':
      return systemInfo()
    case 'clipboard.write': {
      const text = String(args[0] ?? '')
      await navigator.clipboard.writeText(text)
      return true
    }
    default:
      throw new Error(`unknown method: ${method}`)
  }
}

interface WebxApiCallMessage {
  __webxApi: 1
  kind: 'call'
  reqId: string
  method: string
  args?: unknown[]
}

/** CustomAppView 用：対象 iframe からの API 呼び出しだけを受け付けるブリッジ */
export function useWebxApiBridge(
  appId: string,
  iframeRef: RefObject<HTMLIFrameElement | null>,
  openApp?: (id: string) => void
): void {
  const openAppRef = useRef(openApp)
  openAppRef.current = openApp
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const frame = iframeRef.current
      if (!frame || ev.source !== frame.contentWindow) return
      const d = ev.data as WebxApiCallMessage | null
      if (!d || d.__webxApi !== 1 || d.kind !== 'call' || typeof d.method !== 'string') return
      const reqId = d.reqId
      void handleWebxApiCall(appId, d.method, Array.isArray(d.args) ? d.args : [], { openApp: openAppRef.current })
        .then((value) => {
          frame.contentWindow?.postMessage({ __webxApi: 1, kind: 'result', reqId, ok: true, value }, '*')
        })
        .catch((e: unknown) => {
          frame.contentWindow?.postMessage(
            { __webxApi: 1, kind: 'result', reqId, ok: false, error: e instanceof Error ? e.message : String(e) },
            '*'
          )
        })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [appId, iframeRef])
}
