import { useEffect, useRef, useState } from 'react'

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v ?? fallback
  } catch { return fallback }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
}
const shuffle = <T,>(arr: T[]): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/* ---------- 共通：4択クイズ ---------- */
export interface QuizQ { q: string; choices: string[]; answer: number }
export function QuizGame({ questions, note }: { questions: QuizQ[]; note?: string }) {
  const [qs] = useState<QuizQ[]>(() => shuffle(questions))
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(-1)
  const [score, setScore] = useState(0)
  const done = idx >= qs.length
  const pick = (i: number) => {
    if (picked >= 0) return
    setPicked(i)
    if (i === qs[idx].answer) setScore((s) => s + 1)
  }
  const next = () => { setIdx((i) => i + 1); setPicked(-1) }
  if (done) return (
    <div className="sa-app">
      <div className="sa-center-col">
        <div className="sa-big">結果：{score} / {qs.length} 問正解</div>
        <p className="sa-note">{score === qs.length ? '全問正解！すごい！' : 'おつかれさまでした。もう一度挑戦してみよう。'}</p>
        <button className="btn accent" onClick={() => window.location.reload()}>もう一度</button>
      </div>
    </div>
  )
  const q = qs[idx]
  return (
    <div className="sa-app">
      <div className="sa-row"><b>{idx + 1} / {qs.length} 問目</b><span className="sa-note">スコア {score}</span></div>
      <div className="sa-big" style={{ fontSize: 19 }}>{q.q}</div>
      <div className="sa-log">
        {q.choices.map((c, i) => (
          <button key={i} className="btn" disabled={picked >= 0}
            style={picked >= 0 ? (i === q.answer ? { background: '#bbf7d0' } : i === picked ? { background: '#fecaca' } : undefined) : undefined}
            onClick={() => pick(i)}>{c}</button>
        ))}
      </div>
      {picked >= 0 && <button className="btn accent" onClick={next}>{idx + 1 >= qs.length ? '結果を見る' : '次の問題'}</button>}
      {note && <p className="sa-note">{note}</p>}
    </div>
  )
}

/* ---------- 10秒連打 ---------- */
export function Tap10() {
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle')
  const [left, setLeft] = useState(10)
  const [best, setBest] = useState(() => load('webx-tap10-best', 0))
  const countRef = useRef(0)
  const ivRef = useRef(0)
  useEffect(() => () => window.clearInterval(ivRef.current), [])
  const finish = () => {
    window.clearInterval(ivRef.current)
    setPhase('done')
    if (countRef.current > load('webx-tap10-best', 0)) { setBest(countRef.current); save('webx-tap10-best', countRef.current) }
  }
  const tap = () => {
    if (phase === 'done') return
    if (phase === 'idle') {
      setPhase('run')
      const t0 = Date.now()
      ivRef.current = window.setInterval(() => {
        const rem = 10 - (Date.now() - t0) / 1000
        setLeft(Math.max(0, rem))
        if (rem <= 0) finish()
      }, 50)
    }
    countRef.current += 1
    setCount(countRef.current)
  }
  const reset = () => { window.clearInterval(ivRef.current); countRef.current = 0; setCount(0); setLeft(10); setPhase('idle') }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>残り <b>{left.toFixed(1)}</b> 秒</span><span>ベスト <b>{best}</b> 回</span></div>
      <button className="btn accent" style={{ height: 150, fontSize: 30, fontWeight: 800 }} onClick={tap}>
        {phase === 'idle' ? 'タップでスタート！' : phase === 'run' ? `${count} 回` : `結果：${count} 回`}
      </button>
      {phase === 'done' && <button className="btn" onClick={reset}>もう一度</button>}
      <p className="sa-note">ボタンを押した瞬間から10秒間、どれだけ連打できるか競います。</p>
    </div>
  )
}

/* ---------- エイム練習 ---------- */
export function AimTrainer() {
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [size, setSize] = useState(52)
  const [hits, setHits] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle')
  const [left, setLeft] = useState(30)
  const [best, setBest] = useState(() => load('webx-aim-best', 0))
  const hitsRef = useRef(0)
  const ivRef = useRef(0)
  useEffect(() => () => window.clearInterval(ivRef.current), [])
  const move = () => { setPos({ x: 6 + Math.random() * 82, y: 8 + Math.random() * 76 }); setSize(34 + Math.floor(Math.random() * 30)) }
  const start = () => {
    hitsRef.current = 0; setHits(0); setPhase('run'); setLeft(30); move()
    const t0 = Date.now()
    window.clearInterval(ivRef.current)
    ivRef.current = window.setInterval(() => {
      const rem = 30 - (Date.now() - t0) / 1000
      setLeft(Math.max(0, rem))
      if (rem <= 0) {
        window.clearInterval(ivRef.current)
        setPhase('done')
        if (hitsRef.current > load('webx-aim-best', 0)) { setBest(hitsRef.current); save('webx-aim-best', hitsRef.current) }
      }
    }, 100)
  }
  const hit = () => { if (phase !== 'run') return; hitsRef.current += 1; setHits(hitsRef.current); move() }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>残り <b>{left.toFixed(0)}</b> 秒</span><span>ヒット <b>{hits}</b></span><span>ベスト <b>{best}</b></span></div>
      <div style={{ position: 'relative', height: 260, background: '#0f172a', borderRadius: 12, overflow: 'hidden' }}>
        {phase === 'run' && (
          <button onClick={hit} aria-label="的"
            style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, width: size, height: size, borderRadius: '50%', border: '3px solid #fff', background: 'radial-gradient(circle, #fda4af 0 30%, #ef4444 32% 62%, #f8fafc 64%)', transform: 'translate(-50%,-50%)', cursor: 'pointer', padding: 0 }} />
        )}
        {phase !== 'run' && (
          <div className="sa-center-col" style={{ height: '100%', color: '#fff' }}>
            <div className="sa-big">{phase === 'done' ? `結果：${hits} ヒット` : '30秒で的を何回当てられる？'}</div>
            <button className="btn accent" onClick={start}>{phase === 'done' ? 'もう一度' : 'スタート'}</button>
          </div>
        )}
      </div>
      <p className="sa-note">現れた的をすばやくタップ。当てるたびに別の場所へ移動します。</p>
    </div>
  )
}

/* ---------- ライツアウト ---------- */
const LO_N = 5
function loToggle(board: boolean[], r: number, c: number): boolean[] {
  const b = board.slice()
  const flip = (rr: number, cc: number) => { if (rr >= 0 && rr < LO_N && cc >= 0 && cc < LO_N) b[rr * LO_N + cc] = !b[rr * LO_N + cc] }
  flip(r, c); flip(r - 1, c); flip(r + 1, c); flip(r, c - 1); flip(r, c + 1)
  return b
}
function loNew(): boolean[] {
  let b: boolean[] = Array(LO_N * LO_N).fill(false)
  for (let i = 0; i < 14; i++) b = loToggle(b, Math.floor(Math.random() * LO_N), Math.floor(Math.random() * LO_N))
  return b.every((v) => !v) ? loNew() : b
}
export function LightsOut() {
  const [board, setBoard] = useState<boolean[]>(loNew)
  const [moves, setMoves] = useState(0)
  const won = board.every((v) => !v)
  const press = (i: number) => { if (won) return; setBoard(loToggle(board, Math.floor(i / LO_N), i % LO_N)); setMoves((m) => m + 1) }
  const reset = () => { setBoard(loNew()); setMoves(0) }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>手数 <b>{moves}</b></span>{won && <b style={{ color: '#16a34a' }}>🎉 全部消えた！クリア！</b>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LO_N}, 1fr)`, gap: 6, maxWidth: 300, margin: '0 auto', width: '100%' }}>
        {board.map((on, i) => (
          <button key={i} onClick={() => press(i)} aria-label={`セル${i + 1}`}
            style={{ aspectRatio: '1', borderRadius: 10, border: '1px solid #cbd5e1', background: on ? 'linear-gradient(135deg,#fde047,#f59e0b)' : '#1e293b', cursor: 'pointer' }} />
        ))}
      </div>
      <button className="btn" onClick={reset}>新しい問題</button>
      <p className="sa-note">マスを押すと、そのマスと上下左右の明暗が反転します。全部消せばクリアです。</p>
    </div>
  )
}

/* ---------- マスターマインド ---------- */
const MM_COLORS = ['🔴', '🟢', '🔵', '🟡', '🟣', '⚫']
function mmFeedback(secret: string[], guess: string[]): { black: number; white: number } {
  let black = 0
  const sRest: string[] = []
  const gRest: string[] = []
  secret.forEach((s, i) => { if (s === guess[i]) black++; else { sRest.push(s); gRest.push(guess[i]) } })
  let white = 0
  gRest.forEach((g) => { const idx = sRest.indexOf(g); if (idx >= 0) { white++; sRest.splice(idx, 1) } })
  return { black, white }
}
export function Mastermind() {
  const [secret] = useState<string[]>(() => Array.from({ length: 4 }, () => MM_COLORS[Math.floor(Math.random() * MM_COLORS.length)]))
  const [cur, setCur] = useState<string[]>([])
  const [history, setHistory] = useState<{ guess: string[]; black: number; white: number }[]>([])
  const won = history.length > 0 && history[history.length - 1].black === 4
  const lost = !won && history.length >= 10
  const add = (c: string) => { if (cur.length < 4 && !won && !lost) setCur([...cur, c]) }
  const submit = () => {
    if (cur.length !== 4) return
    const f = mmFeedback(secret, cur)
    setHistory([...history, { guess: cur, black: f.black, white: f.white }])
    setCur([])
  }
  return (
    <div className="sa-app">
      <div className="sa-note">コンピュータが選んだ4つの色（重複あり）を当てよう。●＝色も位置も一致、○＝色だけ一致。10回まで挑戦できます。</div>
      <div className="sa-log">
        {history.map((h, i) => (
          <div key={i} className="sa-cardrow">
            <span style={{ fontSize: 20 }}>{h.guess.join(' ')}</span>
            <span>{'●'.repeat(h.black)}{'○'.repeat(h.white)}{h.black + h.white === 0 ? '―' : ''}</span>
          </div>
        ))}
        {history.length === 0 && <p className="sa-note">まだ回答がありません。</p>}
      </div>
      {(won || lost) ? (
        <div className="sa-center-col">
          <div className="sa-big">{won ? `🎉 ${history.length}回で正解！` : `残念…正解は ${secret.join(' ')}`}</div>
          <button className="btn accent" onClick={() => window.location.reload()}>もう一度</button>
        </div>
      ) : (
        <>
          <div className="sa-row">
            <span className="sa-note">あなたの回答：</span>
            <span style={{ fontSize: 24 }}>{cur.join(' ') || '（色を選んでね）'}</span>
            <button className="btn small" onClick={() => setCur(cur.slice(0, -1))} disabled={cur.length === 0}>1つ消す</button>
          </div>
          <div className="sa-row">
            {MM_COLORS.map((c) => <button key={c} className="btn" style={{ fontSize: 20 }} onClick={() => add(c)}>{c}</button>)}
          </div>
          <button className="btn accent" onClick={submit} disabled={cur.length !== 4}>回答する（{history.length + 1}回目）</button>
        </>
      )}
    </div>
  )
}

/* ---------- 雑学クイズ ---------- */
const TRIVIA_DATA: QuizQ[] = [
  { q: '日本で一番高い山は？', choices: ['富士山', '北岳', '槍ヶ岳', '白馬岳'], answer: 0 },
  { q: 'パンダの主食は？', choices: ['笹（竹）', 'りんご', 'にんじん', '魚'], answer: 0 },
  { q: '1年は何週間あるでしょう（約）？', choices: ['48週', '50週', '52週', '54週'], answer: 2 },
  { q: '将棋の駒で、成ると「と金」になるのは？', choices: ['歩', '角', '飛車', '香車'], answer: 0 },
  { q: '人間の体で一番大きな臓器は？', choices: ['心臓', '肝臓', '皮膚', '肺'], answer: 2 },
  { q: 'オリンピックの五輪の色に含まれないのは？', choices: ['赤', '緑', '紫', '黒'], answer: 2 },
  { q: '寿司の「シャリ」とは何のこと？', choices: ['酢飯', 'ネタ', '海苔', 'わさび'], answer: 0 },
  { q: '日本最長の川は？', choices: ['利根川', '信濃川', '石狩川', '淀川'], answer: 1 },
  { q: 'チェスの駒で最初から一番多いのは？', choices: ['ポーン', 'ナイト', 'ルーク', 'ビショップ'], answer: 0 },
  { q: '「三寒四温」が使われる季節は？', choices: ['春先', '梅雨', '秋', '真冬'], answer: 0 },
  { q: 'タコの心臓はいくつある？', choices: ['1つ', '2つ', '3つ', '4つ'], answer: 2 },
  { q: '日本の都道府県で一番面積が小さいのは？', choices: ['香川県', '大阪府', '東京都', '沖縄県'], answer: 0 },
]
export function Trivia() {
  return <QuizGame questions={TRIVIA_DATA} note="いろいろなジャンルの雑学クイズです。" />
}

/* ---------- 国旗クイズ ---------- */
const FLAG_DATA: { flag: string; name: string }[] = [
  { flag: '🇯🇵', name: '日本' }, { flag: '🇺🇸', name: 'アメリカ' }, { flag: '🇬🇧', name: 'イギリス' },
  { flag: '🇫🇷', name: 'フランス' }, { flag: '🇩🇪', name: 'ドイツ' }, { flag: '🇮🇹', name: 'イタリア' },
  { flag: '🇨🇦', name: 'カナダ' }, { flag: '🇦🇺', name: 'オーストラリア' }, { flag: '🇰🇷', name: '韓国' },
  { flag: '🇨🇳', name: '中国' }, { flag: '🇧🇷', name: 'ブラジル' }, { flag: '🇮🇳', name: 'インド' },
  { flag: '🇪🇸', name: 'スペイン' }, { flag: '🇨🇭', name: 'スイス' }, { flag: '🇸🇪', name: 'スウェーデン' },
  { flag: '🇳🇿', name: 'ニュージーランド' }, { flag: '🇹🇭', name: 'タイ' }, { flag: '🇻🇳', name: 'ベトナム' },
]
function flagQuestions(): QuizQ[] {
  return shuffle(FLAG_DATA).slice(0, 10).map((f) => {
    const others = shuffle(FLAG_DATA.filter((x) => x.name !== f.name)).slice(0, 3).map((x) => x.name)
    const choices = shuffle([f.name, ...others])
    return { q: `${f.flag}　この国旗の国はどこ？`, choices, answer: choices.indexOf(f.name) }
  })
}
export function FlagQuiz() {
  const [qs] = useState<QuizQ[]>(flagQuestions)
  return <QuizGame questions={qs} note="国旗を見て国名を当てるクイズです。" />
}

/* ---------- 数字記憶 ---------- */
export function NumMemory() {
  const [level, setLevel] = useState(3)
  const [num, setNum] = useState('')
  const [phase, setPhase] = useState<'ready' | 'show' | 'input' | 'over'>('ready')
  const [input, setInput] = useState('')
  const [best, setBest] = useState(() => load('webx-nummem-best', 0))
  const toRef = useRef(0)
  useEffect(() => () => window.clearTimeout(toRef.current), [])
  const start = (lv: number) => {
    const n = Array.from({ length: lv }, () => Math.floor(Math.random() * 10)).join('')
    setNum(n); setInput(''); setPhase('show')
    toRef.current = window.setTimeout(() => setPhase('input'), 600 + lv * 450)
  }
  const check = () => {
    if (input.trim() === num) {
      const next = level + 1
      setLevel(next)
      start(next)
    } else {
      setPhase('over')
      if (level - 1 > load('webx-nummem-best', 0)) { setBest(level - 1); save('webx-nummem-best', level - 1) }
    }
  }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>レベル（桁数）<b>{level}</b></span><span>ベスト <b>{best}</b> 桁</span></div>
      {phase === 'ready' && <button className="btn accent" onClick={() => start(level)}>スタート</button>}
      {phase === 'show' && <div className="sa-center-col"><div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6 }}>{num}</div><p className="sa-note">覚えて…！</p></div>}
      {phase === 'input' && (
        <>
          <div className="sa-row">
            <input type="text" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="見た数字を入力" style={{ flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') check() }} />
            <button className="btn accent" onClick={check}>答える</button>
          </div>
          <p className="sa-note">数字が消えました。思い出して入力しよう。</p>
        </>
      )}
      {phase === 'over' && (
        <div className="sa-center-col">
          <div className="sa-big">ゲームオーバー</div>
          <p className="sa-note">正解は {num} でした。{level - 1} 桁まで覚えられました。</p>
          <button className="btn accent" onClick={() => { setLevel(3); setPhase('ready') }}>最初から</button>
        </div>
      )}
      <p className="sa-note">一瞬表示される数字を覚えて入力。正解するたびに1桁増えます。</p>
    </div>
  )
}

/* ---------- 色マッチ ---------- */
const CM_COLORS = [
  { name: 'あか', code: '#ef4444' }, { name: 'あお', code: '#3b82f6' }, { name: 'みどり', code: '#22c55e' },
  { name: 'きいろ', code: '#eab308' }, { name: 'むらさき', code: '#a855f7' },
]
export function ColorMatch() {
  const [word, setWord] = useState(0)
  const [ink, setInk] = useState(1)
  const [score, setScore] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle')
  const [left, setLeft] = useState(30)
  const [best, setBest] = useState(() => load('webx-colormatch-best', 0))
  const scoreRef = useRef(0)
  const ivRef = useRef(0)
  useEffect(() => () => window.clearInterval(ivRef.current), [])
  const nextQ = () => { setWord(Math.floor(Math.random() * CM_COLORS.length)); setInk(Math.floor(Math.random() * CM_COLORS.length)) }
  const start = () => {
    scoreRef.current = 0; setScore(0); setPhase('run'); setLeft(30); nextQ()
    const t0 = Date.now()
    window.clearInterval(ivRef.current)
    ivRef.current = window.setInterval(() => {
      const rem = 30 - (Date.now() - t0) / 1000
      setLeft(Math.max(0, rem))
      if (rem <= 0) {
        window.clearInterval(ivRef.current)
        setPhase('done')
        if (scoreRef.current > load('webx-colormatch-best', 0)) { setBest(scoreRef.current); save('webx-colormatch-best', scoreRef.current) }
      }
    }, 100)
  }
  const pick = (i: number) => {
    if (phase !== 'run') return
    if (i === ink) { scoreRef.current += 1; setScore(scoreRef.current) }
    nextQ()
  }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>残り <b>{left.toFixed(0)}</b> 秒</span><span>スコア <b>{score}</b></span><span>ベスト <b>{best}</b></span></div>
      {phase === 'run' ? (
        <>
          <div className="sa-center-col"><div style={{ fontSize: 52, fontWeight: 800, color: CM_COLORS[ink].code }}>{CM_COLORS[word].name}</div></div>
          <div className="sa-row sa-center">
            {CM_COLORS.map((c, i) => <button key={c.name} className="btn" onClick={() => pick(i)}>{c.name}</button>)}
          </div>
        </>
      ) : (
        <div className="sa-center-col">
          <div className="sa-big">{phase === 'done' ? `結果：${score} 点` : '文字の「色」を答えよう'}</div>
          <button className="btn accent" onClick={start}>{phase === 'done' ? 'もう一度' : 'スタート'}</button>
        </div>
      )}
      <p className="sa-note">文字の意味ではなく、文字に付いている色を選んでください（ストループテスト）。30秒で何問正解できる？</p>
    </div>
  )
}

/* ---------- 風船割り ---------- */
const BP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']
export function BalloonPop() {
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [color, setColor] = useState(BP_COLORS[0])
  const [pops, setPops] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle')
  const [left, setLeft] = useState(30)
  const [best, setBest] = useState(() => load('webx-balloon-best', 0))
  const popsRef = useRef(0)
  const ivRef = useRef(0)
  useEffect(() => () => window.clearInterval(ivRef.current), [])
  const move = () => { setPos({ x: 8 + Math.random() * 80, y: 10 + Math.random() * 74 }); setColor(BP_COLORS[Math.floor(Math.random() * BP_COLORS.length)]) }
  const start = () => {
    popsRef.current = 0; setPops(0); setPhase('run'); setLeft(30); move()
    const t0 = Date.now()
    window.clearInterval(ivRef.current)
    ivRef.current = window.setInterval(() => {
      const rem = 30 - (Date.now() - t0) / 1000
      setLeft(Math.max(0, rem))
      if (rem <= 0) {
        window.clearInterval(ivRef.current)
        setPhase('done')
        if (popsRef.current > load('webx-balloon-best', 0)) { setBest(popsRef.current); save('webx-balloon-best', popsRef.current) }
      }
    }, 100)
  }
  const pop = () => { if (phase !== 'run') return; popsRef.current += 1; setPops(popsRef.current); move() }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>残り <b>{left.toFixed(0)}</b> 秒</span><span>割った数 <b>{pops}</b></span><span>ベスト <b>{best}</b></span></div>
      <div style={{ position: 'relative', height: 260, background: 'linear-gradient(180deg,#bae6fd,#e0f2fe)', borderRadius: 12, overflow: 'hidden' }}>
        {phase === 'run' && (
          <button onClick={pop} aria-label="風船"
            style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, width: 54, height: 66, borderRadius: '50% 50% 50% 50% / 55% 55% 45% 45%', border: '2px solid rgba(0,0,0,.15)', background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.75), ${color} 55%)`, transform: 'translate(-50%,-50%)', cursor: 'pointer', padding: 0 }} />
        )}
        {phase !== 'run' && (
          <div className="sa-center-col" style={{ height: '100%' }}>
            <div className="sa-big">{phase === 'done' ? `結果：${pops} 個` : '30秒で風船を割りまくろう'}</div>
            <button className="btn accent" onClick={start}>{phase === 'done' ? 'もう一度' : 'スタート'}</button>
          </div>
        )}
      </div>
      <p className="sa-note">風船をタップして割るだけのシンプルゲーム。割るたびに別の場所に現れます。</p>
    </div>
  )
}

/* ---------- セイムゲーム ---------- */
const SG_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308']
const SG_ROWS = 8
const SG_COLS = 10
type SgGrid = (number | null)[][]
function sgNew(): SgGrid {
  return Array.from({ length: SG_ROWS }, () => Array.from({ length: SG_COLS }, () => Math.floor(Math.random() * SG_COLORS.length)))
}
function sgGroup(grid: SgGrid, r: number, c: number): [number, number][] {
  const v = grid[r][c]
  if (v === null) return []
  const seen = new Set<string>()
  const stack: [number, number][] = [[r, c]]
  const out: [number, number][] = []
  while (stack.length) {
    const [rr, cc] = stack.pop()!
    const key = `${rr},${cc}`
    if (seen.has(key) || rr < 0 || rr >= SG_ROWS || cc < 0 || cc >= SG_COLS || grid[rr][cc] !== v) continue
    seen.add(key); out.push([rr, cc])
    stack.push([rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1])
  }
  return out
}
function sgHasMove(grid: SgGrid): boolean {
  for (let r = 0; r < SG_ROWS; r++) for (let c = 0; c < SG_COLS; c++) if (grid[r][c] !== null && sgGroup(grid, r, c).length >= 2) return true
  return false
}
export function SameGame() {
  const [grid, setGrid] = useState<SgGrid>(sgNew)
  const [score, setScore] = useState(0)
  const remaining = grid.flat().filter((v) => v !== null).length
  const over = remaining === 0 || !sgHasMove(grid)
  const click = (r: number, c: number) => {
    const g = sgGroup(grid, r, c)
    if (g.length < 2) return
    const next: SgGrid = grid.map((row) => row.slice())
    g.forEach(([rr, cc]) => { next[rr][cc] = null })
    // 重力：各列を下に詰める
    for (let cc = 0; cc < SG_COLS; cc++) {
      const vals: (number | null)[] = []
      for (let rr = SG_ROWS - 1; rr >= 0; rr--) if (next[rr][cc] !== null) vals.push(next[rr][cc])
      for (let rr = SG_ROWS - 1; rr >= 0; rr--) next[rr][cc] = vals[SG_ROWS - 1 - rr] ?? null
    }
    // 空列を右へ寄せる
    const cols: (number | null)[][] = []
    for (let cc = 0; cc < SG_COLS; cc++) {
      const col = next.map((row) => row[cc])
      if (col.some((v) => v !== null)) cols.push(col)
    }
    while (cols.length < SG_COLS) cols.push(Array(SG_ROWS).fill(null))
    const final: SgGrid = Array.from({ length: SG_ROWS }, (_, rr) => cols.map((col) => col[rr]))
    setGrid(final)
    setScore((s) => s + g.length * (g.length - 1))
  }
  const reset = () => { setGrid(sgNew()); setScore(0) }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>スコア <b>{score}</b></span><span>残り <b>{remaining}</b> 個</span>{over && <b>{remaining === 0 ? '🎉 全消し！' : 'もう消せません'}</b>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SG_COLS}, 1fr)`, gap: 4, maxWidth: 380, margin: '0 auto', width: '100%' }}>
        {grid.map((row, r) => row.map((v, c) => (
          <button key={`${r}-${c}`} onClick={() => click(r, c)} aria-label={`セル${r}-${c}`}
            style={{ aspectRatio: '1', borderRadius: 6, border: '1px solid rgba(0,0,0,.12)', background: v === null ? 'transparent' : SG_COLORS[v], cursor: v === null ? 'default' : 'pointer', padding: 0 }} />
        )))}
      </div>
      <button className="btn" onClick={reset}>新しいゲーム</button>
      <p className="sa-note">同じ色が2つ以上つながっているところをタップすると消えます。たくさんつながっているほど高得点（n×(n-1)点）。</p>
    </div>
  )
}

/* ---------- 計算ダッシュ ---------- */
function mdQuestion(): { text: string; answer: number; choices: number[] } {
  const ops = ['+', '−', '×']
  const op = ops[Math.floor(Math.random() * ops.length)]
  let a = 2 + Math.floor(Math.random() * 11)
  let b = 2 + Math.floor(Math.random() * 11)
  if (op === '−' && b > a) [a, b] = [b, a]
  const answer = op === '+' ? a + b : op === '−' ? a - b : a * b
  const set = new Set<number>([answer])
  while (set.size < 4) set.add(answer + Math.floor(Math.random() * 11) - 5)
  return { text: `${a} ${op} ${b} = ?`, answer, choices: shuffle([...set]) }
}
export function MathDash() {
  const [q, setQ] = useState(mdQuestion)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle')
  const [left, setLeft] = useState(60)
  const [best, setBest] = useState(() => load('webx-mathdash-best', 0))
  const scoreRef = useRef(0)
  const ivRef = useRef(0)
  useEffect(() => () => window.clearInterval(ivRef.current), [])
  const start = () => {
    scoreRef.current = 0; setScore(0); setStreak(0); setQ(mdQuestion()); setPhase('run'); setLeft(60)
    const t0 = Date.now()
    window.clearInterval(ivRef.current)
    ivRef.current = window.setInterval(() => {
      const rem = 60 - (Date.now() - t0) / 1000
      setLeft(Math.max(0, rem))
      if (rem <= 0) {
        window.clearInterval(ivRef.current)
        setPhase('done')
        if (scoreRef.current > load('webx-mathdash-best', 0)) { setBest(scoreRef.current); save('webx-mathdash-best', scoreRef.current) }
      }
    }, 100)
  }
  const pick = (v: number) => {
    if (phase !== 'run') return
    if (v === q.answer) { scoreRef.current += 1; setScore(scoreRef.current); setStreak((s) => s + 1) } else setStreak(0)
    setQ(mdQuestion())
  }
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>残り <b>{left.toFixed(0)}</b> 秒</span><span>正解 <b>{score}</b></span><span>連続 <b>{streak}</b></span><span>ベスト <b>{best}</b></span></div>
      {phase === 'run' ? (
        <>
          <div className="sa-center-col"><div style={{ fontSize: 40, fontWeight: 800 }}>{q.text}</div></div>
          <div className="sa-row sa-center">
            {q.choices.map((c) => <button key={c} className="btn" style={{ minWidth: 64, fontSize: 18 }} onClick={() => pick(c)}>{c}</button>)}
          </div>
        </>
      ) : (
        <div className="sa-center-col">
          <div className="sa-big">{phase === 'done' ? `結果：${score} 問正解` : '60秒の計算スプリント'}</div>
          <button className="btn accent" onClick={start}>{phase === 'done' ? 'もう一度' : 'スタート'}</button>
        </div>
      )}
      <p className="sa-note">次々に出る計算問題に答え続ける60秒勝負です。</p>
    </div>
  )
}

/* ---------- しりとり判定 ---------- */
const SR_DICT = ['りんご', 'ごりら', 'らっぱ', 'ぱんだ', 'だんご', 'ごま', 'まくら', 'らいおん', 'すいか', 'かめ', 'めがね', 'ねこ', 'こあら', 'らくだ', 'だるま', 'まめ', 'めろん', 'んぼう', 'うさぎ', 'ぎたー', 'たぬき', 'きつね', 'ねずみ', 'みかん', 'かさ', 'さかな', 'なす', 'すずめ', 'めだか', 'かに', 'にわとり', 'りす', 'すもう', 'うま', 'まつり', 'りぼん', 'ぼうし', 'しか', 'かばん', 'ばなな', 'なっとう', 'うでどけい', 'いぬ', 'ぬりえ', 'えんぴつ', 'つくえ', 'えほん', 'ほん', 'とり', 'りんごあめ', 'めいろ', 'ろば', 'ばら', 'らんどせる', 'るびー', 'びーる', 'るーる', 'れもん', 'もも', 'もち', 'ちーず', 'ずぼん', 'ぼたん', 'たまご', 'ごはん', 'はな', 'なみ', 'みず', 'ずかん', 'かぜ', 'ぜりー', 'りかい', 'いちご', 'ごまあえ', 'えび', 'びわ', 'わに', 'にんじん', 'じしゃく', 'くま', 'まほう', 'うみ', 'みみ', 'みそ', 'そら', 'らっこ', 'こおり', 'りゆう']
const toKata = (s: string) => s.replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
const SMALL_MAP: Record<string, string> = { 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ッ': 'ツ', 'ヮ': 'ワ' }
function srLastKana(word: string): string {
  const k = toKata(word.trim())
  let last = k[k.length - 1]
  if (last === 'ー' && k.length >= 2) last = k[k.length - 2]
  return SMALL_MAP[last] ?? last
}
function srFirstKana(word: string): string {
  const k = toKata(word.trim())
  const f = k[0]
  return SMALL_MAP[f] ?? f
}
export function Shiritori() {
  const [log, setLog] = useState<{ who: 'you' | 'cpu'; word: string }[]>([])
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState('好きな言葉から始めてね。ひらがな・カタカナOK。')
  const [over, setOver] = useState(false)
  const used = new Set(log.map((l) => toKata(l.word)))
  const need = log.length ? srLastKana(log[log.length - 1].word) : ''
  const play = () => {
    const w = input.trim()
    if (!w || over) return
    if (!/^[ぁ-んァ-ヶー]+$/.test(w)) { setMsg('ひらがな・カタカナで入力してね。'); return }
    if (used.has(toKata(w))) { setMsg('その言葉はもう使われています。'); return }
    if (log.length && srFirstKana(w) !== need) { setMsg(`「${need}」から始まる言葉にしてね。`); return }
    const nextLog = [...log, { who: 'you' as const, word: w }]
    setInput('')
    if (srLastKana(w) === 'ン') { setLog(nextLog); setMsg(`「${w}」は「ん」で終わるので負け…！`); setOver(true); return }
    const needNext = srLastKana(w)
    const cand = SR_DICT.filter((d) => srFirstKana(d) === needNext && !used.has(toKata(d)) && toKata(d) !== toKata(w))
    if (cand.length === 0) { setLog(nextLog); setMsg('コンピュータは言葉が思いつかない…あなたの勝ち！🎉'); setOver(true); return }
    const cpuWord = cand[Math.floor(Math.random() * cand.length)]
    const withCpu = [...nextLog, { who: 'cpu' as const, word: cpuWord }]
    if (srLastKana(cpuWord) === 'ン') { setLog(withCpu); setMsg(`コンピュータの「${cpuWord}」は「ん」で終わり！あなたの勝ち！🎉`); setOver(true); return }
    setLog(withCpu)
    setMsg(`次は「${srLastKana(cpuWord)}」から始まる言葉だよ。`)
  }
  const reset = () => { setLog([]); setInput(''); setMsg('好きな言葉から始めてね。ひらがな・カタカナOK。'); setOver(false) }
  return (
    <div className="sa-app">
      <div className="sa-log" style={{ maxHeight: 220 }}>
        {log.map((l, i) => (
          <div key={i} className="sa-cardrow"><span>{l.who === 'you' ? '🙂 あなた' : '🤖 CPU'}</span><b>{l.word}</b></div>
        ))}
        {log.length === 0 && <p className="sa-note">まだ言葉がありません。</p>}
      </div>
      <p className="sa-note" style={{ color: over ? '#dc2626' : undefined, fontSize: 13 }}>{msg}</p>
      {!over ? (
        <div className="sa-row">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={need ? `「${need}」から始まる言葉` : '言葉を入力'} style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') play() }} />
          <button className="btn accent" onClick={play}>言う</button>
        </div>
      ) : (
        <button className="btn accent" onClick={reset}>もう一度</button>
      )}
      <p className="sa-note">ルール：前の言葉の最後の文字から始める／「ん」で終わると負け／同じ言葉は使えません。判定はこのアプリが行います。</p>
    </div>
  )
}
