import { useEffect, useRef, useState } from 'react'

/* ================= ハングマン =================
 * カタカナ単語を当てるワードゲーム。
 * ・画面のカナキーボード（タップ）＋物理キーボード（ローマ字入力）で1文字ずつ予想
 * ・はずれるとハングマンが1パーツずつ描かれ、6回はずれるとゲームオーバー
 * ・難易度でお題の文字数が変わる（やさしい＝4文字／ふつう＝5文字／むずかしい＝6文字）
 * ・ヒントボタンでお題のカテゴリが1回だけ分かる
 * ・プレイ数・勝利数・連勝数・最少ミス数を保存 */

type Difficulty = 'easy' | 'medium' | 'hard'
type Phase = 'idle' | 'playing' | 'won' | 'lost'

type WordEntry = { w: string[]; cat: string }

const WORDS_EASY: WordEntry[] = [
  { w: ['ラ', 'イ', 'オ', 'ン'], cat: '動物' },
  { w: ['キ', 'リ', 'ン'], cat: '動物' },
  { w: ['パ', 'ン', 'ダ'], cat: '動物' },
  { w: ['コ', 'ア', 'ラ'], cat: '動物' },
  { w: ['ク', 'ジ', 'ラ'], cat: '動物' },
  { w: ['イ', 'ル', 'カ'], cat: '動物' },
  { w: ['ウ', 'サ', 'ギ'], cat: '動物' },
  { w: ['リ', 'ン', 'ゴ'], cat: '食べもの' },
  { w: ['バ', 'ナ', 'ナ'], cat: '食べもの' },
  { w: ['ミ', 'カ', 'ン'], cat: '食べもの' },
  { w: ['ブ', 'ド', 'ウ'], cat: '食べもの' },
  { w: ['ス', 'イ', 'カ'], cat: '食べもの' },
  { w: ['メ', 'ロ', 'ン'], cat: '食べもの' },
  { w: ['ト', 'マ', 'ト'], cat: '食べもの' },
  { w: ['ニ', 'ン', 'ジ', 'ン'], cat: '食べもの' },
  { w: ['タ', 'マ', 'ゴ'], cat: '食べもの' },
  { w: ['サ', 'ク', 'ラ'], cat: '植物' },
  { w: ['ヒ', 'マ', 'ワ', 'リ'], cat: '植物' },
  { w: ['サ', 'ッ', 'カ', 'ー'], cat: 'スポーツ' },
  { w: ['テ', 'ニ', 'ス'], cat: 'スポーツ' },
  { w: ['ヤ', 'キュ', 'ウ'], cat: 'スポーツ' },
  { w: ['ラ', 'グ', 'ビ', 'ー'], cat: 'スポーツ' },
  { w: ['ゴ', 'ル', 'フ'], cat: 'スポーツ' },
  { w: ['カ', 'メ', 'ラ'], cat: '道具' },
  { w: ['テ', 'レ', 'ビ'], cat: '道具' },
  { w: ['ラ', 'ジ', 'オ'], cat: '道具' },
  { w: ['デ', 'ン', 'シャ'], cat: '乗りもの' },
  { w: ['ヒ', 'コ', 'ウ', 'キ'], cat: '乗りもの' },
  { w: ['ガ', 'ッ', 'コ', 'ウ'], cat: 'その他' },
  { w: ['カ', 'ラ', 'オ', 'ケ'], cat: 'その他' },
  { w: ['マ', 'ラ', 'ソ', 'ン'], cat: 'スポーツ' },
  { w: ['ス', 'ケ', 'ー', 'ト'], cat: 'スポーツ' },
  { w: ['ジャ', 'ガ', 'イ', 'モ'], cat: '食べもの' },
  { w: ['ハ', 'ロ', 'ウィ', 'ン'], cat: 'その他' },
  { w: ['ペ', 'ン', 'ギ', 'ン'], cat: '動物' },
]

const WORDS_MEDIUM: WordEntry[] = [
  { w: ['カ', 'ン', 'ガ', 'ル', 'ー'], cat: '動物' },
  { w: ['ハ', 'ム', 'ス', 'タ', 'ー'], cat: '動物' },
  { w: ['カ', 'メ', 'レ', 'オ', 'ン'], cat: '動物' },
  { w: ['フ', 'ラ', 'ミ', 'ン', 'ゴ'], cat: '動物' },
  { w: ['カ', 'タ', 'ツ', 'ム', 'リ'], cat: '動物' },
  { w: ['カ', 'ブ', 'ト', 'ム', 'シ'], cat: '動物' },
  { w: ['パ', 'ン', 'ケ', 'ー', 'キ'], cat: '食べもの' },
  { w: ['ハ', 'ン', 'バ', 'ー', 'グ'], cat: '食べもの' },
  { w: ['オ', 'ム', 'ラ', 'イ', 'ス'], cat: '食べもの' },
  { w: ['サ', 'ク', 'ラ', 'ン', 'ボ'], cat: '食べもの' },
  { w: ['マ', 'ヨ', 'ネ', 'ー', 'ズ'], cat: '食べもの' },
  { w: ['チョ', 'コ', 'レ', 'ー', 'ト'], cat: '食べもの' },
  { w: ['チュ', 'ー', 'リ', 'ッ', 'プ'], cat: '植物' },
  { w: ['バ', 'ス', 'ケ', 'ッ', 'ト'], cat: 'スポーツ' },
  { w: ['ボ', 'ウ', 'リ', 'ン', 'グ'], cat: 'スポーツ' },
  { w: ['ダ', 'イ', 'ビ', 'ン', 'グ'], cat: 'スポーツ' },
  { w: ['バ', 'イ', 'オ', 'リ', 'ン'], cat: '楽器' },
  { w: ['キ', 'ー', 'ボ', 'ー', 'ド'], cat: '道具' },
  { w: ['プ', 'リ', 'ン', 'タ', 'ー'], cat: '道具' },
  { w: ['カ', 'レ', 'ン', 'ダ', 'ー'], cat: 'その他' },
  { w: ['ス', 'ノ', 'ー', 'マ', 'ン'], cat: 'その他' },
  { w: ['ク', 'リ', 'ス', 'マ', 'ス'], cat: 'その他' },
  { w: ['ド', 'ラ', 'エ', 'モ', 'ン'], cat: 'その他' },
  { w: ['ス', 'パ', 'ゲ', 'ッ', 'ティ'], cat: '食べもの' },
]

const WORDS_HARD: WordEntry[] = [
  { w: ['カ', 'レ', 'ー', 'ラ', 'イ', 'ス'], cat: '食べもの' },
  { w: ['ハ', 'ン', 'バ', 'ー', 'ガ', 'ー'], cat: '食べもの' },
  { w: ['ホ', 'ッ', 'ト', 'ケ', 'ー', 'キ'], cat: '食べもの' },
  { w: ['サ', 'ン', 'ド', 'イ', 'ッ', 'チ'], cat: '食べもの' },
  { w: ['パ', 'イ', 'ナ', 'ッ', 'プ', 'ル'], cat: '食べもの' },
  { w: ['ス', 'ト', 'ロ', 'ベ', 'リ', 'ー'], cat: '食べもの' },
  { w: ['シ', 'ン', 'カ', 'ン', 'セ', 'ン'], cat: '乗りもの' },
  { w: ['バ', 'レ', 'ー', 'ボ', 'ー', 'ル'], cat: 'スポーツ' },
  { w: ['ト', 'ラ', 'ン', 'ペ', 'ッ', 'ト'], cat: '楽器' },
  { w: ['ク', 'ラ', 'リ', 'ネ', 'ッ', 'ト'], cat: '楽器' },
  { w: ['サ', 'イ', 'ク', 'リ', 'ン', 'グ'], cat: 'スポーツ' },
  { w: ['ス', 'ノ', 'ー', 'ボ', 'ー', 'ド'], cat: 'スポーツ' },
  { w: ['テ', 'ン', 'ト', 'ウ', 'ム', 'シ'], cat: '動物' },
  { w: ['エ', 'ア', 'ロ', 'ビ', 'ク', 'ス'], cat: 'スポーツ' },
  { w: ['バ', 'ド', 'ミ', 'ン', 'ト', 'ン'], cat: 'スポーツ' },
  { w: ['ソ', 'フ', 'ト', 'ボ', 'ー', 'ル'], cat: 'スポーツ' },
  { w: ['オ', 'リ', 'ン', 'ピ', 'ッ', 'ク'], cat: 'スポーツ' },
  { w: ['マ', 'ジ', 'ッ', 'ク', 'ショ', 'ー'], cat: 'その他' },
  { w: ['テ', 'レ', 'ビ', 'ゲ', 'ー', 'ム'], cat: 'その他' },
  { w: ['ビ', 'デ', 'オ', 'カ', 'メ', 'ラ'], cat: '道具' },
]

const WORDS: Record<Difficulty, WordEntry[]> = {
  easy: WORDS_EASY,
  medium: WORDS_MEDIUM,
  hard: WORDS_HARD,
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: 'やさしい（3〜4文字）',
  medium: 'ふつう（5文字）',
  hard: 'むずかしい（6文字）',
}

const MAX_MISS = 6

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

/* 五十音順（キーボードの並び）。お題に出てくる文字だけを表示する */
const KANA_ORDER = [
  'ア', 'イ', 'ウ', 'エ', 'オ',
  'カ', 'キ', 'ク', 'ケ', 'コ', 'ガ', 'ギ', 'グ', 'ゲ', 'ゴ',
  'サ', 'シ', 'ス', 'セ', 'ソ', 'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ',
  'タ', 'チ', 'ツ', 'テ', 'ト', 'ダ', 'ヂ', 'ヅ', 'デ', 'ド',
  'ナ', 'ニ', 'ヌ', 'ネ', 'ノ',
  'ハ', 'ヒ', 'フ', 'ヘ', 'ホ', 'バ', 'ビ', 'ブ', 'ベ', 'ボ', 'パ', 'ピ', 'プ', 'ペ', 'ポ',
  'マ', 'ミ', 'ム', 'メ', 'モ',
  'ヤ', 'ユ', 'ヨ',
  'ラ', 'リ', 'ル', 'レ', 'ロ',
  'ワ', 'ヲ', 'ン',
  'キャ', 'キュ', 'キョ', 'ギャ', 'ギュ', 'ギョ',
  'シャ', 'シュ', 'ショ', 'ジャ', 'ジュ', 'ジョ',
  'チャ', 'チュ', 'チョ', 'ニャ', 'ニュ', 'ニョ',
  'ヒャ', 'ヒュ', 'ヒョ', 'ビャ', 'ビュ', 'ビョ',
  'ピャ', 'ピュ', 'ピョ', 'ミャ', 'ミュ', 'ミョ',
  'リャ', 'リュ', 'リョ',
  'ファ', 'フィ', 'フェ', 'フォ', 'ティ', 'ディ', 'デュ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ャ', 'ュ', 'ョ', 'ッ', 'ー',
]

const ALL_WORDS = [...WORDS_EASY, ...WORDS_MEDIUM, ...WORDS_HARD]
const USED_KANA = new Set(ALL_WORDS.flatMap((e) => e.w))
const KEYBOARD = KANA_ORDER.filter((k) => USED_KANA.has(k))

const PLAYED_KEY = 'webx-hangman-played'
const WINS_KEY = 'webx-hangman-wins'
const STREAK_KEY = 'webx-hangman-streak'
const MAX_STREAK_KEY = 'webx-hangman-maxstreak'
const BEST_MISS_KEY = 'webx-hangman-bestmiss'

type GameState = {
  phase: Phase
  diff: Difficulty
  answer: string[]
  cat: string
  guessed: string[]
  misses: number
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

const CONSONANTS = 'bcdfghjklmpqrstvwxz'

export default function Hangman() {
  const [g, setG] = useState<GameState | null>(null)
  const [played, setPlayed] = useState(() => loadNum(PLAYED_KEY))
  const [wins, setWins] = useState(() => loadNum(WINS_KEY))
  const [streak, setStreak] = useState(() => loadNum(STREAK_KEY))
  const [maxStreak, setMaxStreak] = useState(() => loadNum(MAX_STREAK_KEY))
  const [bestMiss, setBestMiss] = useState(() => loadNum(BEST_MISS_KEY))
  const gRef = useRef<GameState | null>(null)
  const romaRef = useRef('')
  gRef.current = g

  const startGame = (diff: Difficulty) => {
    romaRef.current = ''
    const list = WORDS[diff]
    const entry = list[Math.floor(Math.random() * list.length)]
    setG({
      phase: 'playing',
      diff,
      answer: entry.w,
      cat: entry.cat,
      guessed: [],
      misses: 0,
      hintUsed: false,
      message: `${DIFF_LABEL[diff]}のお題です。カナを1文字ずつ当てよう！`,
    })
  }

  const recordResult = (won: boolean, misses: number) => {
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
      setBestMiss((b) => {
        const v = b === 0 ? misses : Math.min(b, misses)
        saveNum(BEST_MISS_KEY, v)
        return v
      })
    } else {
      beep(220, 0.3, 0.06)
      setStreak(0)
      saveNum(STREAK_KEY, 0)
    }
  }

  const guessLetter = (k: string) => {
    const cur = gRef.current
    if (!cur || cur.phase !== 'playing') return
    if (cur.guessed.includes(k)) return
    const guessed = [...cur.guessed, k]
    const hit = cur.answer.includes(k)
    if (hit) {
      beep(880, 0.08, 0.05)
      const won = cur.answer.every((ch) => guessed.includes(ch))
      if (won) {
        recordResult(true, cur.misses)
        setG({ ...cur, phase: 'won', guessed,
          message: `🎉 正解！ミス${cur.misses}回で当てました！答えは「${cur.answer.join('')}」でした。` })
      } else {
        const rest = MAX_MISS - cur.misses
        setG({ ...cur, guessed, message: `⭕ あたり！「${k}」は入っています。残りミス ${rest} 回です。` })
      }
    } else {
      beep(196, 0.15, 0.06)
      const misses = cur.misses + 1
      if (misses >= MAX_MISS) {
        recordResult(false, misses)
        setG({ ...cur, phase: 'lost', guessed, misses,
          message: `残念…ハングマンが完成してしまいました。答えは「${cur.answer.join('')}」でした。` })
      } else {
        setG({ ...cur, guessed, misses, message: `❌ はずれ…「${k}」は入っていません。残りミス ${MAX_MISS - misses} 回です。` })
      }
    }
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
      if (buf.length >= 2 && buf[0] === buf[1] && CONSONANTS.includes(buf[0])) {
        out.push('ッ')
        buf = buf.slice(1)
        continue
      }
      if (buf[0] === 'n' && buf.length >= 2 && !'aiueoy'.includes(buf[1])) {
        out.push('ン')
        buf = buf.slice(1)
        continue
      }
      let done = false
      for (let len = Math.min(3, buf.length); len >= 1; len--) {
        const key = buf.slice(0, len)
        if (key === 'n' && len === 1 && buf.length === 1) {
          done = true
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
        if (buf.length > 0 && buf[0] === 'n' && out.length === 0) break
        if (buf.length === 0) break
        continue
      }
      if (Object.keys(ROMA).some((k) => k.startsWith(buf))) break
      buf = buf.slice(1)
    }
    romaRef.current = buf
    return out
  }

  // キーボード：ローマ字入力でカナを予想
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = gRef.current
      if (!cur || cur.phase !== 'playing') return
      // 末尾の n は Enter で「ン」として確定する
      if (e.key === 'Enter' && romaRef.current === 'n') {
        romaRef.current = ''
        guessLetter('ン')
        return
      }
      if (/^[a-z-]$/.test(e.key)) {
        const kanas = feedRoma(e.key)
        for (const k of kanas) guessLetter(k)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0

  return (
    <div className="hangman">
      <h2>🪢 ハングマン</h2>
      <div className="hangman-head">
        <span>🎮 {played}回 ／ 🏆 {wins}勝（{winRate}%）</span>
        <span>🔥 連勝 {streak} ／ 最多 {maxStreak}</span>
        <span>✨ 最少ミス {bestMiss === 0 ? '—' : `${bestMiss}回`}</span>
        {g && g.phase !== 'idle' && (
          <button onClick={() => startGame(g.diff)}>はじめから</button>
        )}
      </div>

      {!g && (
        <div className="hangman-rules">
          <p>カタカナ単語を1文字ずつ当てていくゲームです。</p>
          <p>はずれるたびにハングマンが1パーツずつ描かれ、6回はずれるとゲームオーバーです。</p>
          <p>画面のカナキーボードをタップするか、物理キーボードでローマ字を打って予想できます。</p>
          <p>ヒントボタンでお題のカテゴリが1回だけ分かります。</p>
          <div className="hangman-start-row">
            <button className="hangman-start" onClick={() => startGame('easy')}>😊 やさしい</button>
            <button className="hangman-start" onClick={() => startGame('medium')}>🙂 ふつう</button>
            <button className="hangman-start" onClick={() => startGame('hard')}>😤 むずかしい</button>
          </div>
        </div>
      )}

      {g && (
        <>
          <div className="hangman-top">
            <svg className="hangman-svg" viewBox="0 0 120 150" aria-label="ハングマン">
              {/* 絞首台 */}
              <line x1="10" y1="145" x2="70" y2="145" stroke="#8d6e63" strokeWidth="5" strokeLinecap="round" />
              <line x1="30" y1="145" x2="30" y2="10" stroke="#8d6e63" strokeWidth="5" strokeLinecap="round" />
              <line x1="30" y1="10" x2="90" y2="10" stroke="#8d6e63" strokeWidth="5" strokeLinecap="round" />
              <line x1="30" y1="30" x2="50" y2="10" stroke="#8d6e63" strokeWidth="4" strokeLinecap="round" />
              <line x1="90" y1="10" x2="90" y2="28" stroke="#8d6e63" strokeWidth="3" strokeLinecap="round" />
              {/* 1: 頭 */}
              {g.misses >= 1 && <circle cx="90" cy="42" r="14" fill="none" stroke="#37474f" strokeWidth="4" />}
              {/* 2: 体 */}
              {g.misses >= 2 && <line x1="90" y1="56" x2="90" y2="100" stroke="#37474f" strokeWidth="4" strokeLinecap="round" />}
              {/* 3: 左腕 */}
              {g.misses >= 3 && <line x1="90" y1="66" x2="66" y2="82" stroke="#37474f" strokeWidth="4" strokeLinecap="round" />}
              {/* 4: 右腕 */}
              {g.misses >= 4 && <line x1="90" y1="66" x2="114" y2="82" stroke="#37474f" strokeWidth="4" strokeLinecap="round" />}
              {/* 5: 左足 */}
              {g.misses >= 5 && <line x1="90" y1="100" x2="70" y2="128" stroke="#37474f" strokeWidth="4" strokeLinecap="round" />}
              {/* 6: 右足 */}
              {g.misses >= 6 && <line x1="90" y1="100" x2="110" y2="128" stroke="#37474f" strokeWidth="4" strokeLinecap="round" />}
            </svg>
            <div className="hangman-side">
              <div className="hangman-word">
                {g.answer.map((ch, i) => (
                  <span key={i} className={`hangman-cell${g.phase !== 'playing' && !g.guessed.includes(ch) ? ' unrevealed' : ''}`}>
                    {g.phase === 'playing' ? (g.guessed.includes(ch) ? ch : '') : ch}
                  </span>
                ))}
              </div>
              <div className="hangman-diff">{DIFF_LABEL[g.diff]} ／ {g.answer.length}文字</div>
              <div className="hangman-miss">❌ ミス {g.misses} / {MAX_MISS} 回</div>
              <div className="hangman-actions">
                <button onClick={showHint} disabled={g.hintUsed || g.phase !== 'playing'}>
                  {g.hintUsed ? `💡 カテゴリ：${g.cat}` : '💡 ヒント（カテゴリ）'}
                </button>
              </div>
            </div>
          </div>

          <div className="hangman-msg">{g.message}</div>

          {(g.phase === 'won' || g.phase === 'lost') && (
            <div className="hangman-result">
              <p>{g.phase === 'won' ? '🎉 クリア！' : '😢 ゲームオーバー'}</p>
              <p>答えは「{g.answer.join('')}」（{g.cat}）でした。</p>
              <div className="hangman-start-row">
                <button className="hangman-start" onClick={() => startGame('easy')}>😊 やさしい</button>
                <button className="hangman-start" onClick={() => startGame('medium')}>🙂 ふつう</button>
                <button className="hangman-start" onClick={() => startGame('hard')}>😤 むずかしい</button>
              </div>
            </div>
          )}

          {g.phase === 'playing' && (
            <div className="hangman-kb">
              {KEYBOARD.map((k) => {
                const guessed = g.guessed.includes(k)
                const hit = guessed && g.answer.includes(k)
                return (
                  <button
                    key={k}
                    className={`hangman-key${guessed ? (hit ? ' hit' : ' miss') : ''}`}
                    onClick={() => guessLetter(k)}
                    disabled={guessed}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
