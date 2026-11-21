import { useEffect, useRef, useState } from 'react'
import { ownUsageBytes, storageInfo } from '../lib/store'
import { APP_VERSION } from '../lib/version'
import { STORE_APPS } from '../lib/storeApps'
import { notifyOs } from '../lib/notify'
import { compareVersions, fetchLatestVersion } from '../lib/updateCheck'
import type { AppId } from './Backstage'

export type ShellApp = AppId | 'browser' | 'files' | 'settings' | 'youtube' | 'trash' | 'calculator' | 'clock' | 'paint' | 'terminal' | 'docs' | 'manual' | 'memodb'

const APP_NAMES: Record<string, string> = {
  word: 'ワードプロセッサ', sheet: 'スプレッドシート', note: 'メモ帳', calendar: 'カレンダー',
  browser: 'ブラウザ', youtube: 'YouTube', files: 'エクスプローラー', trash: 'ゴミ箱',
  settings: '設定', calculator: '電卓', clock: '時計', paint: 'ペイント', terminal: 'ターミナル', manual: '取扱説明書', memodb: 'メモDB',
  store: 'ストア', unit: '単位変換（ストア）',
  ...Object.fromEntries(STORE_APPS.filter((a) => a.id !== 'unit').map((a) => [a.id, `${a.name}（ストア）`])),
}

const THEME_IDS = ['light', 'dark', 'ipados', 'macos', 'win11', 'win7', 'winxp', 'win95', 'cyber', 'sakura', 'ocean', 'sunset']

/** 安全な四則演算（括弧・小数・% 対応、eval は使わない） */
function calcExpr(src: string): number {
  const tokens = src.replace(/\s+/g, '').match(/(\d+\.?\d*|\.\d+|[+\-*/%()])/g)
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) throw new Error('invalid')
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const parseExpr = (): number => {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') { const op = next(); const r = parseTerm(); v = op === '+' ? v + r : v - r }
    return v
  }
  const parseTerm = (): number => {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next(); const r = parseFactor()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  const parseFactor = (): number => {
    const tk = next()
    if (tk === '(') { const v = parseExpr(); if (next() !== ')') throw new Error('paren'); return v }
    if (tk === '-') return -parseFactor()
    if (tk === '+') return parseFactor()
    const n = Number(tk)
    if (Number.isNaN(n)) throw new Error('num')
    return n
  }
  const v = parseExpr()
  if (pos !== tokens.length) throw new Error('trail')
  return v
}

const HISTORY_KEY = 'webx-terminal-history'
const HISTORY_MAX = 100

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(-HISTORY_MAX) : []
  } catch {
    return []
  }
}

export default function Terminal({ openApp, onClose }: { openApp: (app: ShellApp) => void; onClose?: () => void }) {
  const [lines, setLines] = useState<string[]>([
    `WebX ターミナル v${APP_VERSION}`,
    'コマンド一覧は「help」と入力してください。',
  ])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>(loadHistory)
  const histIdx = useRef(-1) // -1 = 入力中（履歴をたどっていない）
  const draft = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const pushHistory = (cmd: string) => {
    setHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === cmd) return prev
      const next = [...prev, cmd].slice(-HISTORY_MAX)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // 保存できなくても履歴表示には影響しない
      }
      return next
    })
    histIdx.current = -1
    draft.current = ''
  }

  const onHistoryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (history.length === 0) return
    e.preventDefault()
    if (e.key === 'ArrowUp') {
      if (histIdx.current === -1) {
        draft.current = input
        histIdx.current = history.length - 1
      } else if (histIdx.current > 0) {
        histIdx.current -= 1
      }
      setInput(history[histIdx.current])
    } else {
      if (histIdx.current === -1) return
      if (histIdx.current < history.length - 1) {
        histIdx.current += 1
        setInput(history[histIdx.current])
      } else {
        histIdx.current = -1
        setInput(draft.current)
      }
    }
  }

  const run = async (raw: string) => {
    const cmd = raw.trim()
    if (cmd) pushHistory(cmd)
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
          'history         実行したコマンドの履歴',
          'calc <式>       計算する（例：calc (12+8)/4）',
          'games           ゲーム一覧',
          'theme [テーマ]  テーマ表示／変更（例：theme cyber）',
          'notify <文字>   通知を送る（テスト）',
          'update          更新があるか確認',
          'clear           画面を消す',
          'exit            ターミナルを閉じる',
          'about           WebX について',
        )
        break
      case 'history':
        out.push(
          history.length === 0
            ? '履歴はありません'
            : history.map((h, i) => `${String(i + 1).padStart(3, ' ')}  ${h}`).join('\n'),
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
      case 'calc': {
        const expr = args.join(' ')
        if (!expr) { out.push('使い方：calc (12+8)/4'); break }
        try {
          const v = calcExpr(expr)
          out.push(`${expr} = ${Math.round(v * 1e10) / 1e10}`)
        } catch { out.push(`計算できません：${expr}`) }
        break
      }
      case 'games':
        out.push(STORE_APPS.filter((a) => a.category === 'game').map((a) => `${a.id} = ${a.name}`).join('\n'))
        break
      case 'theme': {
        const id = args[0]
        if (!id) {
          out.push(`現在のテーマ：${localStorage.getItem('ykr-theme') || 'light'}`)
          out.push(`使えるテーマ：${THEME_IDS.join(' / ')}`)
        } else if (THEME_IDS.includes(id)) {
          window.dispatchEvent(new CustomEvent('webx-theme-set', { detail: id }))
          out.push(`テーマを ${id} に変更しました`)
        } else out.push(`テーマが見つかりません：${id}`)
        break
      }
      case 'notify':
        if (args.length) { notifyOs(args.join(' '), 'terminal'); out.push('通知を送りました') }
        else out.push('使い方：notify <文字>')
        break
      case 'update': {
        const latest = await fetchLatestVersion()
        if (!latest) out.push('更新情報を取得できませんでした')
        else if (compareVersions(latest, APP_VERSION) > 0) out.push(`新しいバージョン v${latest} があります（現在 v${APP_VERSION}）。ストアで更新できます`)
        else out.push(`最新です（v${APP_VERSION}）`)
        break
      }
      case 'exit':
        out.push('終了します')
        window.setTimeout(() => onClose?.(), 60)
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
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            histIdx.current = -1
            draft.current = e.target.value
            setInput(e.target.value)
          }}
          onKeyDown={onHistoryKey}
          autoFocus
          autoComplete="off"
        />
      </form>
    </div>
  )
}
