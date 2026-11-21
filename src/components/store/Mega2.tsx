import { useState } from 'react'
import { QuizGame, type QuizQ } from './Mega1'

const shuffle = <T,>(arr: T[]): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
function makeQuiz(pairs: [string, string][], count: number, format: (q: string) => string): QuizQ[] {
  return shuffle(pairs).slice(0, count).map(([q, a]) => {
    const others = shuffle(pairs.filter((p) => p[1] !== a)).slice(0, 3).map((p) => p[1])
    const choices = shuffle([a, ...others])
    return { q: format(q), choices, answer: choices.indexOf(a) }
  })
}

/* ---------- 共通：入力式ドリル ---------- */
function InputDrill({ title, gen, note }: { title: string; gen: () => { text: string; answer: number }; note: string }) {
  const TOTAL = 10
  const [q, setQ] = useState(gen)
  const [input, setInput] = useState('')
  const [num, setNum] = useState(1)
  const [score, setScore] = useState(0)
  const [fb, setFb] = useState('')
  const [done, setDone] = useState(false)
  const [startAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const answer = () => {
    if (input.trim() === '') return
    const ok = Number(input) === q.answer
    if (ok) setScore((s) => s + 1)
    setFb(ok ? '⭕ 正解！' : `❌ 正解は ${q.answer}`)
    if (num >= TOTAL) {
      setElapsed(Math.round((Date.now() - startAt) / 1000))
      setDone(true)
    } else {
      window.setTimeout(() => { setQ(gen()); setInput(''); setNum((n) => n + 1); setFb('') }, ok ? 350 : 1100)
    }
  }
  if (done) return (
    <div className="sa-app">
      <div className="sa-center-col">
        <div className="sa-big">{title} 結果</div>
        <p>{TOTAL}問中 <b>{score}</b> 問正解／かかった時間 <b>{elapsed}</b> 秒</p>
        <p className="sa-note">{fb}</p>
        <button className="btn accent" onClick={() => window.location.reload()}>もう一度</button>
      </div>
    </div>
  )
  return (
    <div className="sa-app">
      <div className="sa-stats"><span>{num} / {TOTAL} 問目</span><span>正解 <b>{score}</b></span></div>
      <div className="sa-center-col"><div style={{ fontSize: 38, fontWeight: 800 }}>{q.text}</div></div>
      <div className="sa-row">
        <input type="text" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="答え" style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') answer() }} />
        <button className="btn accent" onClick={answer}>答える</button>
      </div>
      {fb && <p className="sa-note" style={{ fontSize: 14 }}>{fb}</p>}
      <p className="sa-note">{note}</p>
    </div>
  )
}

/* ---------- 九九れんしゅう ---------- */
export function Kuku() {
  return <InputDrill title="九九れんしゅう"
    gen={() => { const a = 2 + Math.floor(Math.random() * 8); const b = 2 + Math.floor(Math.random() * 8); return { text: `${a} × ${b} = ?`, answer: a * b } }}
    note="九九の問題が10問出ます。答えを入力して「答える」を押そう。" />
}

/* ---------- 計算ドリル ---------- */
export function Drill() {
  const [mode, setMode] = useState<'mix' | 'warizan'>('mix')
  const gen = (): { text: string; answer: number } => {
    if (mode === 'warizan') {
      const b = 2 + Math.floor(Math.random() * 8)
      const ans = 2 + Math.floor(Math.random() * 9)
      return { text: `${b * ans} ÷ ${b} = ?`, answer: ans }
    }
    const ops = ['+', '−', '×'] as const
    const op = ops[Math.floor(Math.random() * ops.length)]
    let a = 3 + Math.floor(Math.random() * 20)
    let b = 3 + Math.floor(Math.random() * 20)
    if (op === '−' && b > a) [a, b] = [b, a]
    return { text: `${a} ${op} ${b} = ?`, answer: op === '+' ? a + b : op === '−' ? a - b : a * b }
  }
  return (
    <div className="sa-app" style={{ gap: 0, padding: 0 }}>
      <div className="sa-row" style={{ padding: '12px 16px 0' }}>
        <button className={`btn ${mode === 'mix' ? 'accent' : ''}`} onClick={() => setMode('mix')}>たし算・ひき算・かけ算</button>
        <button className={`btn ${mode === 'warizan' ? 'accent' : ''}`} onClick={() => setMode('warizan')}>わり算</button>
      </div>
      <InputDrill key={mode} title="計算ドリル" gen={gen} note="モードを切り替えると最初から始まります。全10問。" />
    </div>
  )
}

/* ---------- 英単語クイズ ---------- */
const ENG_WORDS: [string, string][] = [
  ['apple', 'りんご'], ['dog', '犬'], ['cat', '猫'], ['bird', '鳥'], ['fish', '魚'],
  ['book', '本'], ['school', '学校'], ['teacher', '先生'], ['friend', '友達'], ['water', '水'],
  ['sun', '太陽'], ['moon', '月'], ['star', '星'], ['flower', '花'], ['tree', '木'],
  ['car', '車'], ['train', '電車'], ['sea', '海'], ['mountain', '山'], ['river', '川'],
]
export function EngQuiz() {
  const [qs] = useState<QuizQ[]>(() => makeQuiz(ENG_WORDS, 10, (q) => `「${q}」の意味は？`))
  return <QuizGame questions={qs} note="英単語の意味を当てる4択クイズです。" />
}

/* ---------- 都道府県クイズ ---------- */
const PREF_CAPITALS: [string, string][] = [
  ['北海道', '札幌市'], ['青森県', '青森市'], ['宮城県', '仙台市'], ['東京都', '新宿区（都庁所在地）'], ['神奈川県', '横浜市'],
  ['愛知県', '名古屋市'], ['京都府', '京都市'], ['大阪府', '大阪市'], ['兵庫県', '神戸市'], ['広島県', '広島市'],
  ['福岡県', '福岡市'], ['沖縄県', '那覇市'], ['静岡県', '静岡市'], ['新潟県', '新潟市'], ['長野県', '長野市'], ['熊本県', '熊本市'],
]
export function PrefQuiz() {
  const [qs] = useState<QuizQ[]>(() => makeQuiz(PREF_CAPITALS, 10, (q) => `${q}の県庁所在地は？`))
  return <QuizGame questions={qs} note="都道府県の県庁所在地を当てるクイズです。" />
}

/* ---------- 元素記号クイズ ---------- */
const ELEMENTS: [string, string][] = [
  ['H', '水素'], ['He', 'ヘリウム'], ['Li', 'リチウム'], ['C', '炭素'], ['N', '窒素'], ['O', '酸素'],
  ['Na', 'ナトリウム'], ['Mg', 'マグネシウム'], ['Al', 'アルミニウム'], ['Si', 'ケイ素'], ['P', 'リン'], ['S', '硫黄'],
  ['K', 'カリウム'], ['Ca', 'カルシウム'], ['Fe', '鉄'], ['Cu', '銅'], ['Zn', '亜鉛'], ['Ag', '銀'], ['Au', '金'], ['Hg', '水銀'],
]
export function Elements() {
  const [qs] = useState<QuizQ[]>(() => makeQuiz(ELEMENTS, 10, (q) => `元素記号「${q}」の元素名は？`))
  return <QuizGame questions={qs} note="元素記号から元素名を当てるクイズです。" />
}

/* ---------- 歴史年号クイズ ---------- */
const HISTORY: [string, string][] = [
  ['大化の改新', '645年'], ['平安京への遷都', '794年'], ['源頼朝が征夷大将軍に', '1192年'], ['応仁の乱', '1467年'],
  ['鉄砲伝来', '1543年'], ['本能寺の変', '1582年'], ['関ヶ原の戦い', '1600年'], ['江戸幕府が開かれる', '1603年'],
  ['ペリー来航', '1853年'], ['明治維新（明治元年）', '1868年'], ['第二次世界大戦の終戦', '1945年'], ['東京オリンピック（1回目）', '1964年'],
]
export function HistoryQuiz() {
  const [qs] = useState<QuizQ[]>(() => makeQuiz(HISTORY, 10, (q) => `「${q}」が起きた年は？`))
  return <QuizGame questions={qs} note="歴史の出来事の年号を当てるクイズです。" />
}

/* ---------- 漢字読みクイズ ---------- */
const KANJI: [string, string][] = [
  ['山', 'やま'], ['川', 'かわ'], ['田', 'た'], ['雨', 'あめ'], ['花', 'はな'], ['森', 'もり'],
  ['鳥', 'とり'], ['魚', 'さかな'], ['猫', 'ねこ'], ['犬', 'いぬ'], ['月', 'つき'], ['星', 'ほし'],
  ['空', 'そら'], ['海', 'うみ'], ['雪', 'ゆき'], ['雲', 'くも'],
]
export function KanjiQuiz() {
  const [qs] = useState<QuizQ[]>(() => makeQuiz(KANJI, 10, (q) => `漢字「${q}」の読み（訓読み）は？`))
  return <QuizGame questions={qs} note="漢字の読み方を当てるクイズです。" />
}

/* ---------- 首都クイズ ---------- */
const CAPITALS: [string, string][] = [
  ['日本', '東京'], ['アメリカ', 'ワシントンD.C.'], ['イギリス', 'ロンドン'], ['フランス', 'パリ'], ['ドイツ', 'ベルリン'],
  ['イタリア', 'ローマ'], ['スペイン', 'マドリード'], ['中国', '北京'], ['韓国', 'ソウル'], ['インド', 'ニューデリー'],
  ['ブラジル', 'ブラジリア'], ['オーストラリア', 'キャンベラ'], ['カナダ', 'オタワ'], ['ロシア', 'モスクワ'], ['エジプト', 'カイロ'], ['タイ', 'バンコク'],
]
export function Capitals() {
  const [qs] = useState<QuizQ[]>(() => makeQuiz(CAPITALS, 10, (q) => `${q}の首都は？`))
  return <QuizGame questions={qs} note="世界の国の首都を当てるクイズです。" />
}

/* ---------- 理科クイズ ---------- */
const SCIENCE: QuizQ[] = [
  { q: '水の化学式は？', choices: ['H2O', 'CO2', 'O2', 'NaCl'], answer: 0 },
  { q: '地球に一番近い恒星は？', choices: ['太陽', '月', '金星', '北極星'], answer: 0 },
  { q: '植物が光合成で出す気体は？', choices: ['酸素', '二酸化炭素', '窒素', '水素'], answer: 0 },
  { q: '水が沸騰する温度（1気圧）は？', choices: ['100℃', '90℃', '80℃', '120℃'], answer: 0 },
  { q: '太陽系で一番大きい惑星は？', choices: ['木星', '土星', '地球', '海王星'], answer: 0 },
  { q: '昆虫の足は何本？', choices: ['6本', '8本', '4本', '10本'], answer: 0 },
  { q: '電流の単位は？', choices: ['アンペア', 'ボルト', 'ワット', 'オーム'], answer: 0 },
  { q: '磁石が強く引きつける金属は？', choices: ['鉄', 'アルミ', '銅', '金'], answer: 0 },
  { q: '成人の骨の数はおよそ？', choices: ['約206本', '約106本', '約306本', '約56本'], answer: 0 },
  { q: 'リトマス紙で調べられるのは？', choices: ['酸性・アルカリ性', '温度', '重さ', '速さ'], answer: 0 },
  { q: '万有引力で有名な科学者は？', choices: ['ニュートン', 'エジソン', 'ダーウィン', 'ガリレオ'], answer: 0 },
  { q: '光の速さはおよそ？', choices: ['秒速30万km', '秒速340m', '秒速30km', '秒速3000km'], answer: 0 },
]
export function ScienceQuiz() {
  return <QuizGame questions={SCIENCE} note="理科の基礎知識クイズです。" />
}
