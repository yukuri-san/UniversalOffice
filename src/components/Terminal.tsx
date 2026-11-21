import { useEffect, useRef, useState } from 'react'
import { execCommand, type ShellState } from '../lib/shell'
import { APP_VERSION } from '../lib/version'
import { STORE_APPS } from '../lib/storeApps'
import { notifyOs } from '../lib/notify'

/* コマンドプロンプト（DOS / Windows CMD 風）
   実処理は lib/shell.ts のコマンド基盤に集約し、回復コンソールと共用する。 */

const CORE_APPS: [string, string][] = [
  ['word', 'ワードプロセッサ'], ['sheet', 'スプレッドシート'], ['note', 'メモ帳'], ['calendar', 'カレンダー'],
  ['browser', 'ブラウザ'], ['youtube', 'YouTube'], ['files', 'エクスプローラー'], ['trash', 'ゴミ箱'],
  ['clipboard', 'クリップボード'], ['settings', '設定'], ['calculator', '電卓'], ['clock', '時計'],
  ['paint', 'ペイント'], ['terminal', 'ターミナル'], ['manual', '取扱説明書'], ['memodb', 'メモDB'],
  ['store', 'ストア'], ['sysinfo', 'システム情報'], ['taskman', 'タスクマネージャー'], ['widgets', 'ウィジェット'],
  ['developer', '開発者'],
]
const APPS = [
  ...CORE_APPS.map(([id, name]) => ({ id, name })),
  ...STORE_APPS.map((a) => ({ id: a.id, name: `${a.name}（ストア）` })),
]
const HISTORY_KEY = 'webx-terminal-history'

interface Props {
  openApp: (app: string) => void
  onClose?: () => void
  setTheme?: (id: string) => void
  action?: (name: string) => void
}

export default function Terminal({ openApp, onClose, setTheme, action }: Props) {
  const [lines, setLines] = useState<string[]>([
    `WebX コマンドプロンプト [Version ${APP_VERSION}]`,
    '(c) yukuri-san. help でコマンド一覧を表示します。',
    '',
  ])
  const [state, setState] = useState<ShellState>({ cwd: '' })
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[] } catch { return [] }
  })
  const [histIdx, setHistIdx] = useState(-1)
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [lines])

  const prompt = `WebX:\\${state.cwd}>`

  const submit = async () => {
    const cmd = input
    setInput('')
    setHistIdx(-1)
    if (cmd.trim()) {
      const next = [...history, cmd].slice(-100)
      setHistory(next)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    }
    setLines((p) => [...p, `${prompt} ${cmd}`])
    if (!cmd.trim() || busy) return
    setBusy(true)
    try {
      const res = await execCommand(cmd, state, {
        apps: APPS,
        openApp,
        notify: (text) => notifyOs(text, 'terminal'),
        clear: () => setLines([]),
        exit: () => onClose?.(),
        setTheme: setTheme ? (id) => setTheme(id) : undefined,
        action,
      })
      setState(res.state)
      if (res.out.length > 0) setLines((p) => [...p, ...res.out, ''])
    } catch {
      setLines((p) => [...p, 'コマンドの実行中にエラーが発生しました', ''])
    }
    setBusy(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { void submit(); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(idx)
      setInput(history[idx])
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIdx < 0) return
      const idx = histIdx + 1
      if (idx >= history.length) { setHistIdx(-1); setInput('') } else { setHistIdx(idx); setInput(history[idx]) }
    }
  }

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-body" ref={bodyRef}>
        {lines.map((l, i) => <div key={i} className="terminal-line">{l || ' '}</div>)}
        <div className="terminal-input-row">
          <span className="terminal-prompt">{prompt}</span>
          <input
            ref={inputRef}
            className="terminal-input"
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            aria-label="コマンド入力"
          />
        </div>
      </div>
    </div>
  )
}
