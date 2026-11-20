import { useState } from 'react'
import WordProcessor from './components/WordProcessor'
import Spreadsheet from './components/Spreadsheet'

type Mode = 'word' | 'sheet'

export default function App() {
  const [mode, setMode] = useState<Mode>('word')

  return (
    <div className="app">
      <header>
        <h1>UniversalOffice</h1>
        <p>Webベースのワードプロセッサ＆スプレッドシート。PCでもスマホでも同じものが動きます。</p>
        <nav>
          <button className={mode === 'word' ? 'active' : ''} onClick={() => setMode('word')}>
            ワードプロセッサ
          </button>
          <button className={mode === 'sheet' ? 'active' : ''} onClick={() => setMode('sheet')}>
            スプレッドシート
          </button>
        </nav>
      </header>
      <main>{mode === 'word' ? <WordProcessor /> : <Spreadsheet />}</main>
      <footer>
        <small>UniversalOffice v0.1 — ファイルはブラウザから直接読み書きします（サーバーに送信されません）。</small>
      </footer>
    </div>
  )
}
