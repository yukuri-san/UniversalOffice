import { useState } from 'react'

/**
 * 電卓Pro（Pro Edition 限定）：関数電卓。
 * sin/cos/tan・log/ln・√・累乗・π・e・括弧に対応。DEG/RAD切替つき。計算履歴を表示する。
 * 式は許可した文字だけに制限してから評価する。
 */

interface Hist { expr: string; result: string }

function evalExpr(expr: string, deg: boolean): number {
  let s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
  if (!/^[0-9+\-*/().,%^a-zA-Z ]*$/.test(s)) throw new Error('bad')
  const D = deg ? Math.PI / 180 : 1
  s = s.replace(/\bsin\(/g, `SIN(`).replace(/\bcos\(/g, `COS(`).replace(/\btan\(/g, `TAN(`)
  const js = s
    .replace(/SIN\(/g, `sd(`).replace(/COS\(/g, `cd(`).replace(/TAN\(/g, `td(`)
    .replace(/\blog\(/g, 'Math.log10(').replace(/\bln\(/g, 'Math.log(')
    .replace(/√\(/g, 'Math.sqrt(').replace(/\bpi\b|π/g, 'Math.PI').replace(/\be\b/g, 'Math.E')
    .replace(/\^/g, '**').replace(/%/g, '/100')
  const sd = (x: number) => Math.sin(x * D)
  const cd = (x: number) => Math.cos(x * D)
  const td = (x: number) => Math.tan(x * D)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('sd', 'cd', 'td', 'Math', `"use strict"; return (${js})`)
  const v = fn(sd, cd, td, Math) as number
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('nan')
  return v
}

const KEYS: { label: string; ins?: string; act?: 'eq' | 'clr' | 'del' }[] = [
  { label: 'sin(', ins: 'sin(' }, { label: 'cos(', ins: 'cos(' }, { label: 'tan(', ins: 'tan(' }, { label: '(', ins: '(' }, { label: ')', ins: ')' },
  { label: 'log(', ins: 'log(' }, { label: 'ln(', ins: 'ln(' }, { label: '√(', ins: '√(' }, { label: '^', ins: '^' }, { label: '%', ins: '%' },
  { label: '7', ins: '7' }, { label: '8', ins: '8' }, { label: '9', ins: '9' }, { label: '÷', ins: '÷' }, { label: '⌫', act: 'del' },
  { label: '4', ins: '4' }, { label: '5', ins: '5' }, { label: '6', ins: '6' }, { label: '×', ins: '×' }, { label: 'C', act: 'clr' },
  { label: '1', ins: '1' }, { label: '2', ins: '2' }, { label: '3', ins: '3' }, { label: '−', ins: '−' }, { label: 'π', ins: 'π' },
  { label: '0', ins: '0' }, { label: '.', ins: '.' }, { label: 'e', ins: 'e' }, { label: '+', ins: '+' }, { label: '=', act: 'eq' },
]

export default function CalcPro() {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState('')
  const [deg, setDeg] = useState(true)
  const [history, setHistory] = useState<Hist[]>([])

  const press = (k: (typeof KEYS)[number]) => {
    if (k.act === 'clr') { setExpr(''); setResult(''); return }
    if (k.act === 'del') { setExpr((v) => v.slice(0, -1)); return }
    if (k.act === 'eq') {
      if (!expr.trim()) return
      try {
        const v = evalExpr(expr, deg)
        const text = Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10)
        setResult(text)
        setHistory((h) => [{ expr, result: text }, ...h].slice(0, 20))
      } catch { setResult('エラー') }
      return
    }
    setExpr((v) => v + (k.ins ?? ''))
  }

  return (
    <div className="calcpro">
      <div className="calcpro-display">
        <div className="calcpro-expr">{expr || '0'}</div>
        <div className="calcpro-result">{result !== '' ? `= ${result}` : ' '}</div>
      </div>
      <div className="calcpro-modes">
        <button className={`chip ${deg ? 'on' : ''}`} onClick={() => setDeg(true)}>DEG（度）</button>
        <button className={`chip ${!deg ? 'on' : ''}`} onClick={() => setDeg(false)}>RAD（ラジアン）</button>
        {result !== '' && result !== 'エラー' && <button className="chip" onClick={() => { setExpr(result); setResult('') }}>答えを式へ</button>}
      </div>
      <div className="calcpro-keys">
        {KEYS.map((k) => (
          <button key={k.label} className={`calcpro-key ${k.act === 'eq' ? 'eq' : ''}`} onClick={() => press(k)}>{k.label}</button>
        ))}
      </div>
      {history.length > 0 && (
        <div className="calcpro-history">
          <div className="officepro-outhead">計算履歴</div>
          {history.map((h, i) => (
            <button key={i} className="calcpro-hist" onClick={() => { setExpr(h.expr); setResult(h.result) }}>{h.expr} = {h.result}</button>
          ))}
        </div>
      )}
    </div>
  )
}
