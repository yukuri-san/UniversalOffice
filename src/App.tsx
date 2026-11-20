import { useState } from 'react'
import WordProcessor from './components/WordProcessor'
import Spreadsheet from './components/Spreadsheet'

type Mode = 'word' | 'sheet'

export default function App() {
  const [mode, setMode] = useState<Mode>('word')

  return (
    <div className="app">
      <main>
        {mode === 'word'
          ? <WordProcessor onSwitch={setMode} />
          : <Spreadsheet onSwitch={setMode} />}
      </main>
      <footer>
        <small>UniversalOffice v0.3.2 — ファイルはブラウザから直接読み書きします（サーバーに送信されません）。</small>
      </footer>
    </div>
  )
}
