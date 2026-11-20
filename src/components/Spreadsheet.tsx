import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { downloadText, escapeHtml, printHtml } from '../lib/files'
import Backstage from './Backstage'

const SAMPLE: string[][] = [
  ['名前', '個数', '単価', 'メモ'],
  ['りんご', '3', '150', ''],
  ['みかん', '5', '100', ''],
  ['', '', '', ''],
]

function colName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

export default function Spreadsheet({ onSwitch }: { onSwitch: (app: 'word' | 'sheet') => void }) {
  const [grid, setGrid] = useState<string[][]>(SAMPLE)
  const [filename, setFilename] = useState('sheet.csv')
  const [homeOpen, setHomeOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const setCell = (r: number, c: number, value: string) => {
    setGrid((prev) => prev.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row)))
  }

  const addRow = () => setGrid((prev) => [...prev, Array(prev[0]?.length ?? 1).fill('')])
  const removeRow = () => setGrid((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  const addCol = () => setGrid((prev) => prev.map((row) => [...row, '']))
  const removeCol = () => setGrid((prev) => (prev[0].length > 1 ? prev.map((row) => row.slice(0, -1)) : prev))
  const clear = () => setGrid((prev) => prev.map((row) => row.map(() => '')))

  const openCsv = async (file: File) => {
    const text = await file.text()
    const result = Papa.parse<string[]>(text, { skipEmptyLines: false })
    const rows = (result.data as unknown[][]).map((row) => row.map((v) => String(v ?? '')))
    if (rows.length > 0) {
      const width = Math.max(...rows.map((r) => r.length))
      setGrid(rows.map((r) => [...r, ...Array(width - r.length).fill('')]))
      setFilename(file.name)
    }
  }

  const saveCsv = () => {
    downloadText(filename || 'sheet.csv', Papa.unparse(grid), 'text/csv;charset=utf-8')
  }

  const printSheet = () => {
    const head = grid[0]?.map((c) => `<th>${escapeHtml(c)}</th>`).join('') ?? ''
    const body = grid
      .slice(1)
      .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
      .join('')
    printHtml(filename.replace(/\.csv$/i, ''), `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
  }

  return (
    <section>
      <Backstage
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        current="sheet"
        onSwitch={onSwitch}
        actions={[
          { label: '開く (.csv)', onClick: () => fileRef.current?.click() },
          { label: '保存 (.csv)', onClick: saveCsv },
          { label: '印刷 / PDF', onClick: printSheet },
          { label: 'クリア', hint: 'すべてのセルを空にする', onClick: clear },
        ]}
      />
      <div className="titlebar sheet-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>ホーム</button>
        <input className="title-input" value={filename} onChange={(e) => setFilename(e.target.value)} aria-label="ファイル名" />
        <span className="titlebar-app">スプレッドシート</span>
      </div>
      <div className="toolbar">
        <button onClick={() => fileRef.current?.click()}>開く (.csv)</button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openCsv(f)
            e.target.value = ''
          }}
        />
        <button onClick={saveCsv}>保存 (.csv)</button>
        <button onClick={printSheet}>PDF出力（印刷）</button>
        <button onClick={addRow}>行を追加</button>
        <button onClick={removeRow}>行を削除</button>
        <button onClick={addCol}>列を追加</button>
        <button onClick={removeCol}>列を削除</button>
        <button onClick={clear}>クリア</button>
        <span className="meta">{grid.length} 行 × {grid[0]?.length ?? 0} 列</span>
      </div>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="corner" />
              {grid[0]?.map((_, c) => <th key={c}>{colName(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r}>
                <th>{r + 1}</th>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input value={cell} onChange={(e) => setCell(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">CSV で保存・読み込みできます。数式（Excel 関数の計算）は今後の対応予定です。</p>
    </section>
  )
}
