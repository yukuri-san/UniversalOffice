import { useState } from 'react'
import { notifyOs } from '../lib/notify'

// Discordサポート：公式サポートサーバーへの案内アプリ（標準搭載のシステムアプリ）。
// 招待リンクを開くと、端末に Discord アプリがあればアプリで開き、無ければブラウザで開く。
const INVITE_URL = 'https://discord.gg/X9xTNthU6s'

export default function DiscordSupport() {
  const [copied, setCopied] = useState(false)

  const openDiscord = () => {
    window.open(INVITE_URL, '_blank', 'noopener,noreferrer')
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(INVITE_URL)
      setCopied(true)
      notifyOs('招待リンクをコピーしました', 'discord')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notifyOs('コピーできませんでした。リンクを長押し／右クリックでコピーしてください', 'discord')
    }
  }

  return (
    <div className="discord-window">
      <div className="discord-logo">💬</div>
      <h1>Discordサポート</h1>
      <p className="discord-lead">
        WebX 公式のサポートサーバーです。質問・不具合の報告・追加の要望は、
        サーバーで受け付けています。更新情報もこちらでお知らせします。
      </p>

      <div className="discord-channels">
        <div><strong># システム更新情報</strong><span>WebX 本体のアップデートのお知らせ</span></div>
        <div><strong># ストア情報</strong><span>ストアアプリの更新情報と、おすすめアプリの紹介</span></div>
      </div>

      <button className="btn accent discord-open" onClick={openDiscord}>💬 Discordで開く</button>
      <p className="hint" style={{ lineHeight: 1.7 }}>
        スマホ・タブレット・PC に Discord アプリが入っている場合は、そのままアプリで開きます。
        入っていない場合はブラウザで開きます。
      </p>

      <div className="discord-invite">
        <span>招待リンク</span>
        <code>{INVITE_URL}</code>
        <button className="btn" onClick={copyInvite}>{copied ? '✓ コピーしました' : 'コピー'}</button>
      </div>
    </div>
  )
}
