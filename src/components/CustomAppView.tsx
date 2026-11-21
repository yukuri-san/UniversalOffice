import { useMemo, useRef } from 'react'
import { loadCustomApps } from '../lib/customApps'
import { injectWebxSdk, useWebxApiBridge } from '../lib/webxApi'

/** マイApp（ユーザーが作ったHTMLアプリ）をサンドボックス内で実行するビュー。
 *  WebX API の SDK を自動注入し、アプリからのシステム関数呼び出しを仲介する */
export default function CustomAppView({ id, openApp }: { id: string; openApp?: (appId: string) => void }) {
  const app = loadCustomApps().find((a) => a.id === id)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const srcDoc = useMemo(() => (app ? injectWebxSdk(app.html) : ''), [app])
  useWebxApiBridge(id, frameRef, openApp)
  if (!app) {
    return <div className="wxapp"><p className="wxapp-empty">このアプリは削除されています。</p></div>
  }
  return (
    <iframe
      ref={frameRef}
      title={app.name}
      className="custom-app-frame"
      sandbox="allow-scripts allow-modals allow-popups"
      srcDoc={srcDoc}
    />
  )
}
