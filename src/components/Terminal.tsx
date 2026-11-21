import { useEffect, useRef, useState } from 'react'
import { ownUsageBytes, storageInfo } from '../lib/store'
import { APP_VERSION } from '../lib/version'
import type { AppId } from './Backstage'

export type ShellApp = AppId | 'browser' | 'files' | 'settings' | 'youtube' | 'trash' | 'calculator' | 'clock' | 'paint' | 'terminal' | 'docs' | 'manual' | 'memodb'

const APP_NAMES: Record<string, string> = {
  word: 'ワードプロセッサ', sheet: 'スプレッドシート', note: 'メモ帳', calendar: 'カレンダー',
  browser: 'ブラウザ', youtube: 'YouTube', files: 'エクスプローラー', trash: 'ゴミ箱',
  settings: '設定', calculator: '電卓', clock: '時計', paint: 'ペイント', terminal: 'ターミナル', manual: '取扱説明書', memodb: 'メモDB',
  store: 'ストア', unit: '単位変換（ストア）',
}

export default function Terminal({ openApp }: { openApp: (app: ShellApp) => void }) {
  const [lines, setLines] = useState<string[]>([
    `WebX ターミナル v${APP_VERSION}`,
    'コマンド一覧は「help」と入力してください。',
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const run = async (raw: string) => {
    const cmd = raw.trim()
    const out: string[] = [`$ ${cmd}`]
    const [name, ...args] = cmd.split(/\s+/)
    switch (name.toLowerCase()) {
      case '':
        break
      case 'help':
        out.push(
          'help            この一覧',
          'apps            アプリ一覧',
          'open <アプリ名>  アプリを開く（例：open word）',
          'version         バージョン表示',
          'date            現在日時',
          'storage         ストレージ情報',
          'echo <文字>     そのまま表示',
          'clear           画面を消す',
          'about           WebX について',
        )
        break
      case 'apps':
        out.push(Object.entries(APP_NAMES).map(([id, n]) => `${id} = ${n}`).join('\n'))
        break
      case 'open': {
        const target = (args[0] ?? '') as ShellApp
        if (target in APP_NAMES) {
          openApp(target)
          out.push(`${APP_NAMES[target]} を開きました`)
        } else {
          out.push(`アプリが見つかりません：${args[0] ?? ''}（apps で一覧）`)
        }
        break
      }
      case 'version':
        out.push(`WebX v${APP_VERSION}`)
        break
      case 'date':
        out.push(new Date().toLocaleString('ja-JP'))
        break
      case 'storage': {
        const [info, own] = await Promise.all([storageInfo(), ownUsageBytes()])
        out.push(`保存方式：${info.backend} / WebX の使用量：${(own / 1024).toFixed(1)} KB / 永続化：${info.persisted ? '有効' : '未設定'}`)
        break
      }
      case 'echo':
        out.push(args.join(' '))
        break
      case 'clear':
        setLines([])
        setInput('')
        return
      case 'about':
        out.push('WebX はブラウザで動く OS 風スイートです。データはすべて端末内に保存されます。')
        break
      default:
        out.push(`コマンドが見つかりません：${name}（help で一覧）`)
    }
    setLines((prev) => [...prev, ...out])
    setInput('')
  }

  return (
    <div className="terminal-app" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-out">
        {lines.map((line, i) => (
          <pre key={i}>{line}</pre>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="terminal-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run(input)
        }}
      >
        <span>$</span>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} autoFocus autoComplete="off" />
      </form>
    </div>
  )
}
