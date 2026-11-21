import { useEffect, useRef, useState } from 'react'

type Op = '+' | '-' | '×' | '÷'

function applyOp(a: number, b: number, op: Op): number {
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '×': return a * b
    case '÷': return b === 0 ? NaN : a / b
  }
}

function fmt(n: number): string {
  if (Number.isNaN(n)) return 'エラー'
  if (!Number.isFinite(n)) return '∞'
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

export default function Calculator() {
  const [display, setDisplay] = useState('0')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  // 起動時にフォーカスを当て、キーボード入力を受け取れるようにする
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const backspace = () => {
    setDisplay(display.length > 1 ? display.slice(0, -1) : '0')
  }

  // キーボード対応：電卓にフォーカスがあるときだけ受け取る
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    if (/^[0-9]$/.test(k)) {
      inputDigit(k)
    } else if (k === '.' || k === ',') {
      inputDot()
    } else if (k === '+') {
      chooseOp('+')
    } else if (k === '-') {
      chooseOp('-')
    } else if (k === '*' || k === 'x' || k === 'X') {
      chooseOp('×')
    } else if (k === '/') {
      e.preventDefault()
      chooseOp('÷')
    } else if (k === 'Enter' || k === '=') {
      // Enter はフォーカス中のボタンも押してしまうため既定動作を止める
      e.preventDefault()
      equals()
    } else if (k === 'Escape') {
      clearAll()
    } else if (k === 'Backspace') {
      backspace()
    } else if (k === '%') {
      setDisplay(fmt(parseFloat(display) / 100))
    }
  }

  const inputDigit = (d: string) => {
    if (waiting) {
      setDisplay(d)
      setWaiting(false)
    } else {
      setDisplay(display === '0' ? d : display.length < 16 ? display + d : display)
    }
  }

  const inputDot = () => {
    if (waiting) {
      setDisplay('0.')
      setWaiting(false)
    } else if (!display.includes('.')) {
      setDisplay(display + '.')
    }
  }

  const chooseOp = (next: Op) => {
    const value = parseFloat(display)
    if (acc !== null && op && !waiting) {
      const result = applyOp(acc, value, op)
      setHistory((h) => [`${fmt(acc)} ${op} ${fmt(value)} = ${fmt(result)}`, ...h].slice(0, 8))
      setAcc(result)
      setDisplay(fmt(result))
    } else {
      setAcc(value)
    }
    setOp(next)
    setWaiting(true)
  }

  const equals = () => {
    if (acc === null || !op) return
    const value = parseFloat(display)
    const result = applyOp(acc, value, op)
    setHistory((h) => [`${fmt(acc)} ${op} ${fmt(value)} = ${fmt(result)}`, ...h].slice(0, 8))
    setDisplay(fmt(result))
    setAcc(null)
    setOp(null)
    setWaiting(true)
  }

  const clearAll = () => {
    setDisplay('0')
    setAcc(null)
    setOp(null)
    setWaiting(false)
  }

  const keys: { label: string; action: () => void; cls?: string }[] = [
    { label: 'C', action: clearAll, cls: 'fn' },
    { label: '±', action: () => setDisplay(fmt(parseFloat(display) * -1)), cls: 'fn' },
    { label: '%', action: () => setDisplay(fmt(parseFloat(display) / 100)), cls: 'fn' },
    { label: '÷', action: () => chooseOp('÷'), cls: 'op' },
    { label: '7', action: () => inputDigit('7') },
    { label: '8', action: () => inputDigit('8') },
    { label: '9', action: () => inputDigit('9') },
    { label: '×', action: () => chooseOp('×'), cls: 'op' },
    { label: '4', action: () => inputDigit('4') },
    { label: '5', action: () => inputDigit('5') },
    { label: '6', action: () => inputDigit('6') },
    { label: '-', action: () => chooseOp('-'), cls: 'op' },
    { label: '1', action: () => inputDigit('1') },
    { label: '2', action: () => inputDigit('2') },
    { label: '3', action: () => inputDigit('3') },
    { label: '+', action: () => chooseOp('+'), cls: 'op' },
    { label: '⌫', action: backspace },
    { label: '0', action: () => inputDigit('0') },
    { label: '.', action: inputDot },
    { label: '=', action: equals, cls: 'op eq' },
  ]

  return (
    <div className="calc-app" tabIndex={0} ref={rootRef} onKeyDown={handleKey}>
      <div className="calc-display">
        <small>{acc !== null && op ? `${fmt(acc)} ${op}` : ''}</small>
        <strong>{display}</strong>
      </div>
      <div className="calc-keys">
        {keys.map((k) => (
          <button key={k.label} className={k.cls ?? ''} onClick={k.action}>{k.label}</button>
        ))}
      </div>
      <div className="calc-hint">キーボード：数字・+ - * / ／ Enter＝・Esc＝C・⌫＝削除</div>
      {history.length > 0 && (
        <ul className="calc-history">
          {history.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      )}
    </div>
  )
}
