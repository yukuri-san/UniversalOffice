import { useEffect, useRef, useState } from 'react'

/* ================= ワードル =================
 * 5文字のカタカナ単語を6回以内に当てるワードゲーム。
 * ・お題は毎日変わる「今日のお題」とランダム出題の2モード
 * ・緑＝位置も文字も正解、黄＝文字は含まれるが位置違い、灰＝含まれない
 * ・画面のカナキーボード＋物理キーボード（ローマ字入力）に対応
 * ・ヒントボタンでお題のカテゴリを表示（1回だけ）
 * ・プレイ数・勝利数・連勝数を保存 */

type Mark = 'hit' | 'present' | 'miss'

type WordEntry = { w: string[]; cat: string }

const WORDS: WordEntry[] = [
  { w: ['チュ', 'ー', 'リ', 'ッ', 'プ'], cat: 'その他' },
  { w: ['カ', 'ン', 'ガ', 'ル', 'ー'], cat: '動物' },
  { w: ['カ', 'メ', 'レ', 'オ', 'ン'], cat: '動物' },
  { w: ['ハ', 'ム', 'ス', 'タ', 'ー'], cat: '動物' },
  { w: ['モ', 'ル', 'モ', 'ッ', 'ト'], cat: '動物' },
  { w: ['ハ', 'ン', 'バ', 'ー', 'グ'], cat: '食べもの' },
  { w: ['パ', 'ン', 'ケ', 'ー', 'キ'], cat: '食べもの' },
  { w: ['エ', 'イ', 'ガ', 'カ', 'ン'], cat: 'その他' },
  { w: ['ユ', 'ウ', 'エ', 'ン', 'チ'], cat: 'その他' },
  { w: ['オ', 'ム', 'ラ', 'イ', 'ス'], cat: '食べもの' },
  { w: ['ス', 'パ', 'ゲ', 'ッ', 'ティ'], cat: '食べもの' },
  { w: ['チョ', 'コ', 'レ', 'ー', 'ト'], cat: '食べもの' },
  { w: ['マ', 'ヨ', 'ネ', 'ー', 'ズ'], cat: '食べもの' },
  { w: ['マ', 'ー', 'ガ', 'リ', 'ン'], cat: '食べもの' },
  { w: ['ヨ', 'ー', 'グ', 'ル', 'ト'], cat: '食べもの' },
  { w: ['サ', 'ツ', 'マ', 'イ', 'モ'], cat: '食べもの' },
  { w: ['エ', 'ノ', 'キ', 'ダ', 'ケ'], cat: '食べもの' },
  { w: ['ア', 'ー', 'モ', 'ン', 'ド'], cat: '食べもの' },
  { w: ['ピ', 'ー', 'ナ', 'ッ', 'ツ'], cat: '食べもの' },
  { w: ['ピ', 'ス', 'タ', 'チ', 'オ'], cat: '食べもの' },
  { w: ['コ', 'コ', 'ナ', 'ッ', 'ツ'], cat: '食べもの' },
  { w: ['ネ', 'ク', 'タ', 'リ', 'ン'], cat: '食べもの' },
  { w: ['ラ', 'ズ', 'ベ', 'リ', 'ー'], cat: '食べもの' },
  { w: ['ニ', 'ホ', 'ン', 'ザ', 'ル'], cat: '動物' },
  { w: ['ニ', 'ホ', 'ン', 'ジ', 'カ'], cat: '動物' },
  { w: ['ハ', 'リ', 'ネ', 'ズ', 'ミ'], cat: '動物' },
  { w: ['ヒ', 'ク', 'イ', 'ド', 'リ'], cat: '動物' },
  { w: ['フ', 'ラ', 'ミ', 'ン', 'ゴ'], cat: '動物' },
  { w: ['ア', 'ホ', 'ウ', 'ド', 'リ'], cat: '動物' },
  { w: ['ア', 'マ', 'ガ', 'エ', 'ル'], cat: '動物' },
  { w: ['ヒ', 'キ', 'ガ', 'エ', 'ル'], cat: '動物' },
  { w: ['ウ', 'シ', 'ガ', 'エ', 'ル'], cat: '動物' },
  { w: ['オ', 'ッ', 'ト', 'セ', 'イ'], cat: '動物' },
  { w: ['ド', 'ラ', 'エ', 'モ', 'ン'], cat: 'その他' },
  { w: ['ラ', 'ン', 'ド', 'セ', 'ル'], cat: '乗りもの・道具' },
  { w: ['ア', 'イ', 'キ', 'ド', 'ウ'], cat: 'スポーツ' },
  { w: ['ス', 'ケ', 'ル', 'ト', 'ン'], cat: 'スポーツ' },
  { w: ['ク', 'リ', 'ス', 'マ', 'ス'], cat: 'その他' },
  { w: ['テ', 'コ', 'ン', 'ド', 'ー'], cat: 'スポーツ' },
  { w: ['ス', 'プ', 'リ', 'ン', 'ト'], cat: 'スポーツ' },
  { w: ['ダ', 'ウ', 'ン', 'ヒ', 'ル'], cat: 'スポーツ' },
  { w: ['ス', 'ラ', 'ロ', 'ー', 'ム'], cat: 'スポーツ' },
  { w: ['カ', 'ー', 'リ', 'ン', 'グ'], cat: 'スポーツ' },
  { w: ['ボ', 'ブ', 'ス', 'レ', 'ー'], cat: 'スポーツ' },
  { w: ['ク', 'リ', 'ケ', 'ッ', 'ト'], cat: 'スポーツ' },
  { w: ['ト', 'ラ', 'ク', 'タ', 'ー'], cat: '乗りもの・道具' },
  { w: ['コ', 'ン', 'バ', 'イ', 'ン'], cat: '乗りもの・道具' },
  { w: ['タ', 'ン', 'バ', 'リ', 'ン'], cat: 'その他' },
  { w: ['ナ', 'シ', 'ゴ', 'レ', 'ン'], cat: '食べもの' },
  { w: ['ミ', 'ー', 'ゴ', 'レ', 'ン'], cat: '食べもの' },
  { w: ['タ', 'ッ', 'カ', 'ル', 'ビ'], cat: '食べもの' },
  { w: ['ド', 'ミ', 'ノ', 'ピ', 'ザ'], cat: '食べもの' },
  { w: ['ピ', 'ザ', 'ハ', 'ッ', 'ト'], cat: '食べもの' },
  { w: ['カ', 'ッ', 'パ', 'マ', 'キ'], cat: '食べもの' },
  { w: ['テ', 'ッ', 'カ', 'マ', 'キ'], cat: '食べもの' },
  { w: ['エ', 'ビ', 'フ', 'ラ', 'イ'], cat: '食べもの' },
  { w: ['カ', 'キ', 'フ', 'ラ', 'イ'], cat: '食べもの' },
  { w: ['ア', 'ジ', 'フ', 'ラ', 'イ'], cat: '食べもの' },
  { w: ['チ', 'キ', 'ン', 'カ', 'ツ'], cat: '食べもの' },
  { w: ['メ', 'ン', 'チ', 'カ', 'ツ'], cat: '食べもの' },
  { w: ['カ', 'レ', 'ー', 'パ', 'ン'], cat: '食べもの' },
  { w: ['メ', 'ロ', 'ン', 'パ', 'ン'], cat: '食べもの' },
  { w: ['チョ', 'コ', 'コ', 'ロ', 'ネ'], cat: '食べもの' },
  { w: ['モ', 'ン', 'ブ', 'ラ', 'ン'], cat: '食べもの' },
  { w: ['カ', 'プ', 'チ', 'ー', 'ノ'], cat: '食べもの' },
  { w: ['マ', 'キ', 'ア', 'ー', 'ト'], cat: '食べもの' },
  { w: ['ミ', 'ル', 'ク', 'ティ', 'ー'], cat: '食べもの' },
  { w: ['レ', 'モ', 'ン', 'ティ', 'ー'], cat: '食べもの' },
  { w: ['ハ', 'ー', 'ブ', 'ティ', 'ー'], cat: '食べもの' },
  { w: ['ウ', 'ー', 'ロ', 'ン', 'チャ'], cat: '食べもの' },
  { w: ['レ', 'モ', 'ネ', 'ー', 'ド'], cat: '食べもの' },
  { w: ['ダ', 'ン', 'プ', 'カ', 'ー'], cat: '乗りもの・道具' },
  { w: ['ス', 'ニ', 'ー', 'カ', 'ー'], cat: '乗りもの・道具' },
]

const MAX_TRIES = 6

const KEY_ROWS: string[][] = [
  ['ア', 'イ', 'ウ', 'エ', 'オ'],
  ['カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'ス', 'セ', 'ソ'],
  ['タ', 'チ', 'ツ', 'テ', 'ト', 'ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
  ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ', 'マ', 'ミ', 'ム', 'メ', 'モ'],
  ['ヤ', 'ユ', 'ヨ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ワ', 'ヲ', 'ン'],
  ['ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ッ', 'ー'],
]

/* ローマ字→カナ変換表（物理キーボード用） */
const ROMA: Record<string, string> = {
  a: 'ア', i: 'イ', u: 'ウ', e: 'エ', o: 'オ',
  ka: 'カ', ki: 'キ', ku: 'ク', ke: 'ケ', ko: 'コ',
  ga: 'ガ', gi: 'ギ', gu: 'グ', ge: 'ゲ', go: 'ゴ',
  sa: 'サ', shi: 'シ', si: 'シ', su: 'ス', se: 'セ', so: 'ソ',
  za: 'ザ', ji: 'ジ', zi: 'ジ', zu: 'ズ', ze: 'ゼ', zo: 'ゾ',
  ta: 'タ', chi: 'チ', ti: 'チ', tsu: 'ツ', tu: 'ツ', te: 'テ', to: 'ト',
  da: 'ダ', dji: 'ヂ', dzu: 'ヅ', de: 'デ', do: 'ド',
  na: 'ナ', ni: 'ニ', nu: 'ヌ', ne: 'ネ', no: 'ノ',
  ha: 'ハ', hi: 'ヒ', fu: 'フ', hu: 'フ', he: 'ヘ', ho: 'ホ',
  ba: 'バ', bi: 'ビ', bu: 'ブ', be: 'ベ', bo: 'ボ',
  pa: 'パ', pi: 'ピ', pu: 'プ', pe: 'ペ', po: 'ポ',
  ma: 'マ', mi: 'ミ', mu: 'ム', me: 'メ', mo: 'モ',
  ya: 'ヤ', yu: 'ユ', yo: 'ヨ',
  ra: 'ラ', ri: 'リ', ru: 'ル', re: 'レ', ro: 'ロ',
  wa: 'ワ', wi: 'ウィ', we: 'ウェ', wo: 'ヲ',
  n: 'ン',
  kya: 'キャ', kyu: 'キュ', kyo: 'キョ',
  gya: 'ギャ', gyu: 'ギュ', gyo: 'ギョ',
  sha: 'シャ', shu: 'シュ', sho: 'ショ',
  sya: 'シャ', syu: 'シュ', syo: 'ショ',
  ja: 'ジャ', ju: 'ジュ', jo: 'ジョ',
  jya: 'ジャ', jyu: 'ジュ', jyo: 'ジョ',
  cha: 'チャ', chu: 'チュ', cho: 'チョ',
  cya: 'チャ', cyu: 'チュ', cyo: 'チョ',
  tya: 'チャ', tyu: 'チュ', tyo: 'チョ',
  nya: 'ニャ', nyu: 'ニュ', nyo: 'ニョ',
  hya: 'ヒャ', hyu: 'ヒュ', hyo: 'ヒョ',
  bya: 'ビャ', byu: 'ビュ', byo: 'ビョ',
  pya: 'ピャ', pyu: 'ピュ', pyo: 'ピョ',
  mya: 'ミャ', myu: 'ミュ', myo: 'ミョ',
  rya: 'リャ', ryu: 'リュ', ryo: 'リョ',
  fa: 'ファ', fi: 'フィ', fe: 'フェ', fo: 'フォ',
  va: 'ヴァ', vi: 'ヴィ', vu: 'ヴ', ve: 'ヴェ', vo: 'ヴォ',
  thi: 'ティ', dhi: 'ディ', thu: 'テュ', dhu: 'デュ',
  la: 'ァ', li: 'ィ', lu: 'ゥ', le: 'ェ', lo: 'ォ',
  xa: 'ァ', xi: 'ィ', xu: 'ゥ', xe: 'ェ', xo: 'ォ',
  xya: 'ャ', xyu: 'ュ', xyo: 'ョ',
  xtu: 'ッ', xtsu: 'ッ', xwa: 'ヮ',
  '-': 'ー',
}

const PLAYED_KEY = 'webx-wordle-played'
const WINS_KEY = 'webx-wordle-wins'
const STREAK_KEY = 'webx-wordle-streak'
const MAX_STREAK_KEY = 'webx-wordle-maxstreak'

type Phase = 'idle' | 'playing' | 'won' | 'lost'
type Mode = 'daily' | 'random'

type GameState = {
  phase: Phase
  mode: Mode
  answer: string[]
  cat: string
  rows: string[][]
  marks: Mark[][]
  cur: string[]
  hintUsed: boolean
  message: string
}

function beep(freq: number, dur = 0.08, vol = 0.05) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    o.type = 'sine'
    g.gain.value = vol
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur)
    o.onended = () => void ctx.close()
  } catch { /* 音が出なくても遊べる */ }
}

function fanfare() {
  ;[523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => beep(f, 0.22, 0.07), i * 120))
}

function loadNum(key: string): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v >= 0 ? v : 0
  } catch {
    return 0
  }
}

function saveNum(key: string, v: number) {
  try { localStorage.setItem(key, String(v)) } catch { /* 保存できなくても遊べる */ }
}

/** 予想と答えを照合（重複文字は出現回数ぶんだけ判定） */
function evaluate(guess: string[], answer: string[]): Mark[] {
  const marks: Mark[] = Array(5).fill('miss')
  const rest = [...answer]
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = 'hit'
      rest[i] = ''
    }
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 'hit') continue
    const idx = rest.indexOf(guess[i])
    if (idx >= 0) {
      marks[i] = 'present'
      rest[idx] = ''
    }
  }
  return marks
}

function dailyIndex(): number {
  const d = new Date()
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  return seed % WORDS.length
}

const CONSONANTS = 'bcdfghjklmpqrstvwxz'

export default function Wordle() {
  const [g, setG] = useState<GameState | null>(null)
  const [played, setPlayed] = useState(() => loadNum(PLAYED_KEY))
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [streak, setStreak] = useState(() => loadNum(STREAK_KEY))
  const [maxStreak, setMaxStreak] = useState(() => loadNum(MAX_STREAK_KEY))
  const gRef = useRef<GameState | null>(null)
  const romaRef = useRef('')
  gRef.current = g

  const startGame = (mode: Mode) => {
    romaRef.current = ''
    const idx = mode === 'daily' ? dailyIndex() : Math.floor(Math.random() * WORDS.length)
    const entry = WORDS[idx]
    setG({
      phase: 'playing',
      mode,
      answer: entry.w,
      cat: entry.cat,
      rows: [],
      marks: [],
      cur: [],
      hintUsed: false,
      message: mode === 'daily' ? '今日のお題です。5文字のカタカナ単語を当てよう！' : 'ランダムのお題です。5文字のカタカナ単語を当てよう！',
    })
  }

  const recordResult = (won: boolean) => {
    setPlayed((p) => { const v = p + 1; saveNum(PLAYED_KEY, v); return v })
    if (won) {
      fanfare()
      setWins((w) => { const v = w + 1; saveNum(WINS_KEY, v); return v })
      setStreak((s) => {
        const v = s + 1
        saveNum(STREAK_KEY, v)
        setMaxStreak((m) => { const mv = Math.max(m, v); saveNum(MAX_STREAK_KEY, mv); return mv })
        return v
      })
    } else {
      beep(220, 0.3, 0.06)
      setStreak(0)
      saveNum(STREAK_KEY, 0)
    }
  }

  const submitRow = () => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing') return
    if (cur.cur.length < 5) {
      setG({ ...cur, message: '5文字そろえてください。' })
      return
    }
    const marks = evaluate(cur.cur, cur.answer)
    const rows = [...cur.rows, [...cur.cur]]
    const marksAll = [...cur.marks, marks]
    const won = marks.every((m) => m === 'hit')
    const lost = !won && rows.length >= MAX_TRIES
    if (won) {
      recordResult(true)
      setG({ ...cur, phase: 'won', rows, marks: marksAll, cur: [],
        message: `🎉 正解！${rows.length}回目で当てました！答えは「${cur.answer.join('')}」でした。` })
    } else if (lost) {
      recordResult(false)
      setG({ ...cur, phase: 'lost', rows, marks: marksAll, cur: [],
        message: `残念…答えは「${cur.answer.join('')}」でした。` })
    } else {
      beep(marks.some((m) => m === 'hit') ? 880 : 440, 0.08, 0.05)
      const hits = marks.filter((m) => m === 'hit').length
      const presents = marks.filter((m) => m === 'present').length
      setG({ ...cur, rows, marks: marksAll, cur: [],
        message: hits > 0 || presents > 0
          ? `🟩${hits}個 🟨${presents}個 あたり！残り${MAX_TRIES - rows.length}回です。`
          : `はずれ…残り${MAX_TRIES - rows.length}回です。` })
    }
  }

  const addKana = (k: string) => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing' || cur.cur.length >= 5) return
    beep(660, 0.04, 0.04)
    setG({ ...cur, cur: [...cur.cur, k] })
  }

  const delKana = () => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing' || cur.cur.length === 0) return
    setG({ ...cur, cur: cur.cur.slice(0, -1) })
  }

  const showHint = () => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing' || cur.hintUsed) return
    beep(990, 0.08, 0.05)
    setG({ ...cur, hintUsed: true, message: `💡 ヒント：カテゴリは「${cur.cat}」です。` })
  }

  /** ローマ字バッファに1文字足し、確定したカナを返す */
  const feedRoma = (ch: string): string[] => {
    let buf = romaRef.current + ch
    const out: string[] = []
    while (buf.length > 0) {
      // 子音の重なり（kk 等）→ ッ
      if (buf.length >= 2 && buf[0] === buf[1] && CONSONANTS.includes(buf[0])) {
        out.push('ッ')
        buf = buf.slice(1)
        continue
      }
      // n + 母音・y 以外 → ン
      if (buf[0] === 'n' && buf.length >= 2 && !'aiueoy'.includes(buf[1])) {
        out.push('ン')
        buf = buf.slice(1)
        continue
      }
      let done = false
      for (let len = Math.min(3, buf.length); len >= 1; len--) {
        const key = buf.slice(0, len)
        if (key === 'n' && len === 1 && buf.length === 1) {
          done = true // n 単体は次を待つ
          break
        }
        const kana = ROMA[key]
        if (kana) {
          out.push(kana)
          buf = buf.slice(len)
          done = true
          break
        }
      }
      if (done) {
        if (buf.length > 0 && buf[0] === 'n' && out.length === 0) break // n待ち
        if (buf.length === 0) break
        continue
      }
      // どの変換表の接頭辞でもなければ先頭を捨てる
      if (Object.keys(ROMA).some((k) => k.startsWith(buf))) break
      buf = buf.slice(1)
    }
    romaRef.current = buf
    return out
  }

  // キーボード：ローマ字入力・Enterで決定・Backspaceで削除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = gRef.current
      if (!cur || cur.phase !== 'playing') return
      if (e.key === 'Enter') {
        e.preventDefault()
        submitRow()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        romaRef.current = ''
        delKana()
        return
      }
      if (/^[a-z-]$/.test(e.key)) {
        const kanas = feedRoma(e.key)
        for (const k of kanas) addKana(k)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // キーボードの色（緑＞黄＞灰の優先度）
  const keyMark = (k: string): Mark | null => {
    if (!g) return null
    let best: Mark | null = null
    g.rows.forEach((row, ri) => {
      row.forEach((ch, ci) => {
        if (ch !== k) return
        const m = g.marks[ri][ci]
        if (m === 'hit') best = 'hit'
        else if (m === 'present' && best !== 'hit') best = 'present'
        else if (m === 'miss' && best === null) best = 'miss'
      })
    })
    return best
  }

  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0

  return (
    <div className="wordle">
      <h2>🔤 ワードル</h2>
      <div className="wordle-head">
        <span>🎮 {played}回 ／ 🏆 {wins}勝（{winRate}%）</span>
        <span>🔥 連勝 {streak} ／ 最多 {maxStreak}</span>
        {g && g.phase !== 'idle' && (
          <button onClick={() => startGame(g.mode)}>はじめから</button>
        )}
      </div>

      {!g && (
        <div className="wordle-rules">
          <p>5文字のカタカナ単語を6回以内に当てるゲームです。</p>
          <p>🟩 緑＝文字も位置も正解 ／ 🟨 黄＝文字はあるけど位置が違う ／ ⬜ 灰＝その文字は含まれない</p>
          <p>画面のカナキーボードをタップするか、物理キーボードでローマ字を打って入力できます（Enterで決定）。</p>
          <p>ヒントボタンでお題のカテゴリが1回だけ分かります。</p>
          <div className="wordle-start-row">
            <button className="wordle-start" onClick={() => startGame('daily')}>📅 今日のお題</button>
            <button className="wordle-start" onClick={() => startGame('random')}>🎲 ランダム</button>
          </div>
        </div>
      )}

      {g && (
        <>
          <div className="wordle-board">
            {Array.from({ length: MAX_TRIES }).map((_, ri) => {
              const row = ri < g.rows.length ? g.rows[ri] : ri === g.rows.length ? g.cur : []
              const marks = ri < g.marks.length ? g.marks[ri] : null
              return (
                <div key={ri} className="wordle-row">
                  {Array.from({ length: 5 }).map((_, ci) => {
                    const ch = row[ci] ?? ''
                    const mark = marks ? marks[ci] : null
                    return (
                      <div key={ci} className={`wordle-cell${mark ? ` ${mark}` : ''}${!marks && ch ? ' filled' : ''}`}>
                        {ch}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="wordle-msg">{g.message}</div>

          {g.phase === 'playing' && (
            <div className="wordle-actions">
              <button onClick={showHint} disabled={g.hintUsed}>
                {g.hintUsed ? `💡 カテゴリ：${g.cat}` : '💡 ヒント（カテゴリ）'}
              </button>
              <span className="wordle-tries">残り {MAX_TRIES - g.rows.length} 回</span>
            </div>
          )}

          {(g.phase === 'won' || g.phase === 'lost') && (
            <div className="wordle-result">
              <p>{g.phase === 'won' ? '🎉 クリア！' : '😢 ゲームオーバー'}</p>
              <p>答えは「{g.answer.join('')}」（{g.cat}）でした。</p>
              <div className="wordle-start-row">
                <button className="wordle-start" onClick={() => startGame('daily')}>📅 今日のお題</button>
                <button className="wordle-start" onClick={() => startGame('random')}>🎲 ランダム</button>
              </div>
            </div>
          )}

          {g.phase === 'playing' && (
            <div className="wordle-kb">
              {KEY_ROWS.map((row, ri) => (
                <div key={ri} className="wordle-kb-row">
                  {row.map((k) => {
                    const m = keyMark(k)
                    return (
                      <button key={k} className={`wordle-key${m ? ` ${m}` : ''}`} onClick={() => addKana(k)}>
                        {k}
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="wordle-kb-row">
                <button className="wordle-key wide" onClick={delKana}>⌫ 削除</button>
                <button className="wordle-key wide enter" onClick={submitRow}>決定 ⏎</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
