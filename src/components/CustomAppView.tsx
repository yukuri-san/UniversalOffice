import { loadCustomApps } from '../lib/customApps'

/** マイApp（ユーザーが作ったHTMLアプリ）をサンドボックス内で実行するビュー */
export default function CustomAppView({ id }: { id: string }) {
  const app = loadCustomApps().find((a) => a.id === id)
  if (!app) {
    return <div className="wxapp"><p className="wxapp-empty">このアプリは削除されています。</p></div>
  }
  return (
    <iframe
      title={app.name}
      className="custom-app-frame"
      sandbox="allow-scripts allow-modals allow-popups"
      srcDoc={app.html}
    />
  )
}
