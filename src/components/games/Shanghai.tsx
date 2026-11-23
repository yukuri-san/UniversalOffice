import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ================= 上海 =================
 * 麻雀牌を使ったソリティア（上海）。144枚の牌から、同じ絵柄の
 * 「取れる牌」（上に牌がなく、左右どちらかが空いている牌）のペアを
 * 取っていき、全部取ればクリア。
 * ・花牌（梅蘭菊竹）は花同士、季節牌（春夏秋冬）は季節同士で取れる
 * ・ヒント（取れるペアを光らせる）／シャッフル（残り3回）／戻す 付き
 * ・クリアタイムのベストを保存 */

type Phase = 'idle' | 'playing' | 'paused' | 'clear' | 'stuck'

type TileType = { key: string; top: string; sub: string; color: string }
type Pos = { c: number; r: number; z: number }
type Tile = { id: number; type: number; pos: number; removed: boolean }

const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

const TYPES: TileType[] = [
  ...KANJI.map((k, i) => ({ key: `man${i + 1}`, top: k, sub: '萬', color: '#b91c1c' })),
  ...KANJI.map((k, i) => ({ key: `pin${i + 1}`, top: k, sub: '筒', color: '#1d4ed8' })),
  ...KANJI.map((k, i) => ({ key: `sou${i + 1}`, top: k, sub: '索', color: '#15803d' })),
  { key: 'windE', top: '東', sub: '', color: '#1f2937' },
  { key: 'windS', top: '南', sub: '', color: '#1f2937' },
  { key: 'windW', top: '西', sub: '', color: '#1f2937' },
  { key: 'windN', top: '北', sub: '', color: '#1f2937' },
  { key: 'dragonW', top: '白', sub: '', color: '#1f2937' },
  { key: 'dragonG', top: '發', sub: '', color: '#15803d' },
  { key: 'dragonR', top: '中', sub: '', color: '#b91c1c' },
  { key: 'flower1', top: '梅', sub: '花', color: '#7e22ce' },
  { key: 'flower2', top: '蘭', sub: '花', color: '#7e22ce' },
  { key: 'flower3', top: '菊', sub: '花', color: '#7e22ce' },
  { key: 'flower4', top: '竹', sub: '花', color: '#7e22ce' },
  { key: 'season1', top: '春', sub: '季', color: '#c2410c' },
  { key: 'season2', top: '夏', sub: '季', color: '#c2410c' },
  { key: 'season3', top: '秋', sub: '季', color: '#c2410c' },
  { key: 'season4', top: '冬', sub: '季', color: '#c2410c' },
]

/* 花牌は花同士、季節牌は季節同士で取れる */
function matchKey(type: number): string {
  const k = TYPES[type].key
  if (k.startsWith('flower')) return 'flower'
  if (k.startsWith('season')) return 'season'
  return k
}

/* 144枚の配置（c: 列 -1〜12、r: 行 0〜7、z: 段 0〜3） */
function buildPositions(): Pos[] {
  const pos: Pos[] = []
  for (let r = 1; r <= 6; r++) for (let c = 0; c <= 11; c++) pos.push({ c, r, z: 0 })
  for (const r of [0, 7]) for (let c = 3; c <= 8; c++) pos.push({ c, r, z: 0 })
  pos.push({ c: -1, r: 3, z: 0 }, { c: 12, r: 3, z: 0 })
  for (let r = 2; r <= 5; r++) for (let c = 1; c <= 10; c++) pos.push({ c, r, z: 1 })
  for (const r of [1, 6]) for (let c = 4; c <= 7; c++) pos.push({ c, r, z: 1 })
  for (let r = 3; r <= 4; r++) for (let c = 4; c <= 7; c++) pos.push({ c, r, z: 2 })
  pos.push({ c: 5, r: 3, z: 3 }, { c: 6, r: 3, z: 3 })
  return pos
}
const POSITIONS = buildPositions()

const BEST_KEY = 'webx-shanghai-best'
const GAMES_KEY = 'webx-shanghai-games'
const SHUFFLES_PER_GAME = 3

function beep(freq: number, dur = 0.08, vol = 0.05) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.value = freq
    g.gain.value = vol
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
    o.stop(ctx.currentTime + dur)
  } catch {
    /* 音が出なくても遊べる */
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function dealTiles(): Tile[] {
  /* 36種×4枚＝144枚。花牌・季節牌は各1枚ずつ（花同士・季節同士で取れる） */
  const types: number[] = []
  for (let t = 0; t < TYPES.length; t++) {
    const copies = TYPES[t].key.startsWith('flower') || TYPES[t].key.startsWith('season') ? 1 : 4
    for (let i = 0; i < copies; i++) types.push(t)
  }
  const shuffled = shuffle(types)
  return POSITIONS.map((_, i) => ({ id: i, type: shuffled[i], pos: i, removed: false }))
}

/** 取れる牌かどうか（上に牌がなく、左右どちらかが空いている） */
function isFree(tiles: Tile[], tile: Tile): boolean {
  if (tile.removed) return false
  const p = POSITIONS[tile.pos]
  const at = (c: number, r: number, z: number) =>
    tiles.find((t) => !t.removed && POSITIONS[t.pos].c === c && POSITIONS[t.pos].r === r && POSITIONS[t.pos].z === z)
  if (at(p.c, p.r, p.z + 1)) return false
  const left = at(p.c - 1, p.r, p.z)
  const right = at(p.c + 1, p.r, p.z)
  return !left || !right
}

function freeTiles(tiles: Tile[]): Tile[] {
  return tiles.filter((t) => isFree(tiles, t))
}

function findPair(tiles: Tile[]): [Tile, Tile] | null {
  const free = freeTiles(tiles)
  const byKey = new Map<string, Tile>()
  for (const t of free) {
    const k = matchKey(t.type)
    const prev = byKey.get(k)
    if (prev) return [prev, t]
    byKey.set(k, t)
  }
  return null
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const TILE_W = 44
const TILE_H = 58

export default function Shanghai() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [tiles, setTiles] = useState<Tile[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [hintPair, setHintPair] = useState<number[]>([])
  const [shufflesLeft, setShufflesLeft] = useState(SHUFFLES_PER_GAME)
  const [history, setHistory] = useState<[number, number][]>([])
  const [seconds, setSeconds] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [msg, setMsg] = useState('')
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)
  const timerRef = useRef<number | null>(null)

  const remaining = useMemo(() => tiles.filter((t) => !t.removed).length, [tiles])
  const free = useMemo(() => freeTiles(tiles), [tiles])

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startGame = useCallback(() => {
    stopTimer()
    /* 最初から1手は取れる配牌になるまで配り直す */
    let dealt = dealTiles()
    for (let i = 0; i < 50 && !findPair(dealt); i++) dealt = dealTiles()
    setTiles(dealt)
    setSelected(null)
    setHintPair([])
    setShufflesLeft(SHUFFLES_PER_GAME)
    setHistory([])
    setSeconds(0)
    setCursor(0)
    setMsg('')
    setPhase('playing')
    setGames((g) => {
      const n = g + 1
      localStorage.setItem(GAMES_KEY, String(n))
      return n
    })
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    beep(660)
  }, [stopTimer])

  useEffect(() => stopTimer, [stopTimer])

  const takePair = useCallback(
    (a: Tile, b: Tile) => {
      const next = tiles.map((t) => (t.id === a.id || t.id === b.id ? { ...t, removed: true } : t))
      setHistory((h) => [...h, [a.id, b.id]])
      setSelected(null)
      setHintPair([])
      setTiles(next)
      beep(880, 0.1)
      setTimeout(() => beep(1174, 0.1), 90)
      if (next.every((t) => t.removed)) {
        stopTimer()
        setPhase('clear')
        setBest((prev) => {
          if (prev === 0 || seconds < prev) {
            localStorage.setItem(BEST_KEY, String(seconds))
            return seconds
          }
          return prev
        })
        setMsg('🎉 クリア！')
        return
      }
      if (!findPair(next)) {
        setPhase('stuck')
        setMsg('手詰まりです。シャッフルするか、はじめからやり直しましょう。')
      }
    },
    [tiles, seconds, stopTimer],
  )

  const onTile = useCallback(
    (tile: Tile) => {
      if (phase !== 'playing') return
      if (!isFree(tiles, tile)) return
      setHintPair([])
      if (selected === null) {
        setSelected(tile.id)
        beep(520, 0.05)
        return
      }
      if (selected === tile.id) {
        setSelected(null)
        return
      }
      const sel = tiles.find((t) => t.id === selected)
      if (!sel) {
        setSelected(tile.id)
        return
      }
      if (matchKey(sel.type) === matchKey(tile.type)) {
        takePair(sel, tile)
      } else {
        setSelected(tile.id)
        beep(220, 0.08)
      }
    },
    [phase, tiles, selected, takePair],
  )

  const useHint = useCallback(() => {
    if (phase !== 'playing') return
    const pair = findPair(tiles)
    if (!pair) {
      setMsg('取れるペアがありません。')
      return
    }
    setHintPair([pair[0].id, pair[1].id])
    beep(990, 0.08)
    window.setTimeout(() => setHintPair([]), 3000)
  }, [phase, tiles])

  const doShuffle = useCallback(() => {
    if (phase !== 'playing' && phase !== 'stuck') return
    if (shufflesLeft <= 0) {
      setMsg('シャッフルは使い切りました。')
      return
    }
    const alive = tiles.filter((t) => !t.removed)
    let types = shuffle(alive.map((t) => t.type))
    let next = tiles.map((t) => {
      if (t.removed) return t
      const idx = alive.findIndex((a) => a.id === t.id)
      return { ...t, type: types[idx] }
    })
    for (let i = 0; i < 20 && !findPair(next); i++) {
      types = shuffle(alive.map((t) => t.type))
      next = tiles.map((t) => {
        if (t.removed) return t
        const idx = alive.findIndex((a) => a.id === t.id)
        return { ...t, type: types[idx] }
      })
    }
    setTiles(next)
    setSelected(null)
    setHintPair([])
    setShufflesLeft((n) => n - 1)
    setHistory([])
    if (phase === 'stuck') {
      setPhase('playing')
      setMsg('')
    }
    beep(740, 0.1)
  }, [phase, tiles, shufflesLeft])

  const undo = useCallback(() => {
    if (phase !== 'playing' && phase !== 'stuck') return
    const last = history[history.length - 1]
    if (!last) {
      setMsg('戻せる手がありません。')
      return
    }
    setTiles((ts) => ts.map((t) => (t.id === last[0] || t.id === last[1] ? { ...t, removed: false } : t)))
    setHistory((h) => h.slice(0, -1))
    setSelected(null)
    setHintPair([])
    if (phase === 'stuck') {
      setPhase('playing')
      setMsg('')
    }
    beep(440, 0.08)
  }, [phase, history])

  const togglePause = useCallback(() => {
    if (phase === 'playing') {
      stopTimer()
      setPhase('paused')
    } else if (phase === 'paused') {
      setPhase('playing')
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    }
  }, [phase, stopTimer])

  /* キーボード：←→で取れる牌を移動、Enter/Spaceで選択、Hヒント、U戻す、P一時停止 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'playing' && phase !== 'paused') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        if (free.length === 0) return
        setCursor((c) => {
          const d = e.key === 'ArrowRight' ? 1 : -1
          return (c + d + free.length) % free.length
        })
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (phase === 'playing' && free[cursor]) onTile(free[cursor])
      } else if (e.key === 'h' || e.key === 'H' || e.key === 'ｈ') {
        useHint()
      } else if (e.key === 'u' || e.key === 'U' || e.key === 'ｕ') {
        undo()
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'ｐ') {
        togglePause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, free, cursor, onTile, useHint, undo, togglePause])

  const cursorTile = phase === 'playing' ? free[cursor] : null

  return (
    <div className="shanghai" tabIndex={0}>
      <h2>🀄 上海</h2>
      <div className="shanghai-head">
        <span>残り {remaining}枚</span>
        <span>取ったペア {Math.floor((144 - remaining) / 2)}組</span>
        <span>⏱ {fmtTime(seconds)}</span>
        <span>ベスト {best > 0 ? fmtTime(best) : '—'}</span>
        <span>プレイ {games}回</span>
      </div>
      {msg && <div className="shanghai-msg">{msg}</div>}
      {phase === 'idle' ? (
        <>
          <div className="shanghai-rules">
            <p>🀄 麻雀牌のソリティア。144枚の牌から同じ絵柄のペアを取っていきます。</p>
            <p>取れるのは「上に牌がなく、左右どちらかが空いている牌」だけ。全部取ればクリア！</p>
            <p>🌸 花牌（梅・蘭・菊・竹）は花同士、🍂 季節牌（春・夏・秋・冬）は季節同士で取れます。</p>
            <p>手詰まりになったら「シャッフル」（1ゲーム3回まで）で残りの牌を配り直せます。</p>
            <p>⌨️ ←→で取れる牌を移動、Enterで選択、Hでヒント、Uで戻す、Pで一時停止。</p>
          </div>
          <div className="shanghai-start-row">
            <button className="shanghai-start" onClick={startGame}>▶ はじめる</button>
          </div>
        </>
      ) : (
        <>
          <div className="shanghai-board">
            {tiles
              .filter((t) => !t.removed)
              .map((t) => {
                const p = POSITIONS[t.pos]
                const type = TYPES[t.type]
                const freeNow = isFree(tiles, t)
                const isSel = selected === t.id
                const isHint = hintPair.includes(t.id)
                const isCursor = cursorTile?.id === t.id
                return (
                  <button
                    key={t.id}
                    className={`shanghai-tile${isSel ? ' shanghai-sel' : ''}${isHint ? ' shanghai-hint' : ''}${isCursor ? ' shanghai-cursor' : ''}${!freeNow ? ' shanghai-locked' : ''}`}
                    style={{
                      left: (p.c + 1) * (TILE_W + 2) + p.z * 7,
                      top: p.r * (TILE_H + 2) + (3 - p.z) * 8,
                      zIndex: p.z * 10 + p.r,
                      color: type.color,
                    }}
                    onClick={() => onTile(t)}
                    disabled={phase !== 'playing' || !freeNow}
                    aria-label={`${type.top}${type.sub}の牌`}
                  >
                    <span className="shanghai-top">{type.top}</span>
                    {type.sub && <span className="shanghai-sub">{type.sub}</span>}
                  </button>
                )
              })}
          </div>
          <div className="shanghai-ctrl">
            <button onClick={useHint} disabled={phase !== 'playing'}>💡 ヒント</button>
            <button onClick={doShuffle} disabled={(phase !== 'playing' && phase !== 'stuck') || shufflesLeft <= 0}>
              🔀 シャッフル（残り{shufflesLeft}回）
            </button>
            <button onClick={undo} disabled={(phase !== 'playing' && phase !== 'stuck') || history.length === 0}>↩ 戻す</button>
            <button onClick={togglePause} disabled={phase !== 'playing' && phase !== 'paused'}>
              {phase === 'paused' ? '▶ 再開' : '⏸ 一時停止'}
            </button>
            <button onClick={startGame}>🔄 はじめから</button>
          </div>
          {phase === 'paused' && <div className="shanghai-overlay">一時停止中（Pで再開）</div>}
          {phase === 'clear' && (
            <div className="shanghai-result">
              🎉 クリア！ タイム {fmtTime(seconds)}
              {best > 0 && seconds <= best ? '（ベスト更新！）' : ''}
              <br />
              <button onClick={startGame}>もう一度</button>
            </div>
          )}
          {phase === 'stuck' && (
            <div className="shanghai-result">
              😖 手詰まりです
              <br />
              <button onClick={doShuffle} disabled={shufflesLeft <= 0}>🔀 シャッフルする</button>{' '}
              <button onClick={startGame}>🔄 はじめから</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
