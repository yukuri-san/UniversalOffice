import { useCallback, useEffect, useRef, useState } from 'react'

/* ================= ドミノ =================
 * CPU（ミオ）と対戦するドミノ（ドロー・ドミノ）。
 * ・28枚の牌から7枚ずつ配り、残りは山札
 * ・場の両端のどちらかと同じ数字の牌を出していく
 * ・出せる牌がなければ山札から引く。山札が空ならパス
 * ・手札を出し切るか、両方とも出せなくなればラウンド終了
 * ・勝者は相手の残りピップ数を得点。先に100点でマッチ勝利
 * ・難易度3段階（やさしい＝ランダム／ふつう＝高ピップ優先／つよい＝ダブル優先つき）
 * ・勝敗数を保存 */

type Tile = { id: number; a: number; b: number }
type Placed = { id: number; left: number; right: number }
type Difficulty = 'easy' | 'normal' | 'hard'
type Phase = 'idle' | 'playing' | 'over'
type Side = 'left' | 'right'

const TARGET = 100
const WINS_KEY = 'webx-domino-wins'
const LOSES_KEY = 'webx-domino-loses'
const GAMES_KEY = 'webx-domino-games'

const DIFFS: Record<Difficulty, { label: string }> = {
  easy: { label: 'やさしい' },
  normal: { label: 'ふつう' },
  hard: { label: 'つよい' },
}

const PIP_POS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

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

function allTiles(): Tile[] {
  const tiles: Tile[] = []
  let id = 0
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push({ id: id++, a, b })
  return tiles
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

function pips(t: Tile): number {
  return t.a + t.b
}

function handPips(hand: Tile[]): number {
  return hand.reduce((s, t) => s + pips(t), 0)
}

function endsOf(chain: Placed[]): { left: number; right: number } | null {
  if (chain.length === 0) return null
  const first = chain[0]
  const last = chain[chain.length - 1]
  if (!first || !last) return null
  return { left: first.left, right: last.right }
}

function matchSides(t: Tile, chain: Placed[]): Side[] {
  const e = endsOf(chain)
  if (!e) return ['left', 'right']
  const sides: Side[] = []
  if (t.a === e.left || t.b === e.left) sides.push('left')
  if (t.a === e.right || t.b === e.right) sides.push('right')
  return sides
}

function canPlayAny(hand: Tile[], chain: Placed[]): boolean {
  return hand.some((t) => matchSides(t, chain).length > 0)
}

function placeTile(chain: Placed[], t: Tile, side: Side): Placed[] {
  if (chain.length === 0) return [{ id: t.id, left: t.a, right: t.b }]
  const e = endsOf(chain)
  if (!e) return chain
  if (side === 'left') {
    const placed: Placed = t.b === e.left ? { id: t.id, left: t.a, right: t.b } : { id: t.id, left: t.b, right: t.a }
    return [placed, ...chain]
  }
  const placed: Placed = t.a === e.right ? { id: t.id, left: t.a, right: t.b } : { id: t.id, left: t.b, right: t.a }
  return [...chain, placed]
}

type Game = {
  playerHand: Tile[]
  cpuHand: Tile[]
  boneyard: Tile[]
  chain: Placed[]
  turn: 'player' | 'cpu'
  scores: { p: number; c: number }
  round: number
  passes: number
  msg: string
  selectedId: number | null
  roundOver: string | null
  matchOver: boolean
}

function initialGame(): Game {
  return {
    playerHand: [],
    cpuHand: [],
    boneyard: [],
    chain: [],
    turn: 'player',
    scores: { p: 0, c: 0 },
    round: 1,
    passes: 0,
    msg: '',
    selectedId: null,
    roundOver: null,
    matchOver: false,
  }
}

function Half({ n }: { n: number }) {
  return (
    <div className="domino-half">
      {PIP_POS[n].map(([r, c], i) => (
        <span key={i} className="domino-pip" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
      ))}
    </div>
  )
}

function BoardTile({ p }: { p: Placed }) {
  const dbl = p.left === p.right
  return (
    <div className={`domino-tile-h${dbl ? ' domino-double' : ''}`}>
      <Half n={p.left} />
      <div className="domino-div-h" />
      <Half n={p.right} />
    </div>
  )
}

export default function Domino() {
  const [diff, setDiff] = useState<Difficulty>('normal')
  const [phase, setPhase] = useState<Phase>('idle')
  const [g, setG] = useState<Game>(initialGame)
  const [wins, setWins] = useState(() => Number(localStorage.getItem(WINS_KEY) ?? 0) || 0)
  const [loses, setLoses] = useState(() => Number(localStorage.getItem(LOSES_KEY) ?? 0) || 0)
  const [games, setGames] = useState(() => Number(localStorage.getItem(GAMES_KEY) ?? 0) || 0)

  const gRef = useRef(g)
  gRef.current = g
  const diffRef = useRef(diff)
  diffRef.current = diff
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const finishRound = useCallback(
    (base: Game, winner: 'player' | 'cpu' | 'draw', points: number, reason: string) => {
      const scores = { ...base.scores }
      if (winner === 'player') scores.p += points
      if (winner === 'cpu') scores.c += points
      const wmsg =
        winner === 'draw'
          ? '引き分け'
          : winner === 'player'
            ? `あなたの勝ち！ +${points}点`
            : `ミオの勝ち… +${points}点`
      const summary = `${reason} ${wmsg}（${scores.p} - ${scores.c}）`
      if (scores.p >= TARGET || scores.c >= TARGET) {
        const mw = scores.p >= TARGET ? 'player' : 'cpu'
        const ng = games + 1
        setGames(ng)
        localStorage.setItem(GAMES_KEY, String(ng))
        if (mw === 'player') {
          const nw = wins + 1
          setWins(nw)
          localStorage.setItem(WINS_KEY, String(nw))
        } else {
          const nl = loses + 1
          setLoses(nl)
          localStorage.setItem(LOSES_KEY, String(nl))
        }
        setG({ ...base, scores, roundOver: summary, matchOver: true })
        setPhase('over')
        beep(mw === 'player' ? 880 : 160, 0.3, 0.06)
      } else {
        setG({ ...base, scores, roundOver: summary, matchOver: false })
        beep(winner === 'player' ? 880 : 220, 0.15, 0.05)
      }
    },
    [games, wins, loses],
  )

  const startRound = useCallback((scores: { p: number; c: number }, round: number) => {
    const deck = shuffle(allTiles())
    const playerHand = deck.slice(0, 7)
    const cpuHand = deck.slice(7, 14)
    const boneyard = deck.slice(14)
    const bestDouble = (hand: Tile[]) =>
      hand
        .filter((t) => t.a === t.b)
        .sort((x, y) => y.a - x.a)[0]
    const pd = bestDouble(playerHand)
    const cd = bestDouble(cpuHand)
    let starter: 'player' | 'cpu'
    let startTile: Tile
    if (pd && (!cd || pd.a > cd.a)) {
      starter = 'player'
      startTile = pd
    } else if (cd) {
      starter = 'cpu'
      startTile = cd
    } else {
      const best = (hand: Tile[]) => [...hand].sort((x, y) => pips(y) - pips(x))[0] as Tile
      const pb = best(playerHand)
      const cb = best(cpuHand)
      if (pips(pb) >= pips(cb)) {
        starter = 'player'
        startTile = pb
      } else {
        starter = 'cpu'
        startTile = cb
      }
    }
    const chain: Placed[] = [{ id: startTile.id, left: startTile.a, right: startTile.b }]
    setG({
      playerHand: starter === 'player' ? playerHand.filter((t) => t.id !== startTile.id) : playerHand,
      cpuHand: starter === 'cpu' ? cpuHand.filter((t) => t.id !== startTile.id) : cpuHand,
      boneyard,
      chain,
      turn: starter === 'player' ? 'cpu' : 'player',
      scores,
      round,
      passes: 0,
      msg: `${starter === 'player' ? 'あなた' : 'ミオ'}の ${startTile.a}-${startTile.b} からスタート`,
      selectedId: null,
      roundOver: null,
      matchOver: false,
    })
    setPhase('playing')
    beep(660, 0.1, 0.05)
  }, [])

  const startMatch = useCallback(() => {
    startRound({ p: 0, c: 0 }, 1)
  }, [startRound])

  const playTile = useCallback(
    (tileId: number, side?: Side) => {
      const cur = gRef.current
      if (phaseRef.current !== 'playing' || cur.turn !== 'player' || cur.roundOver) return
      const t = cur.playerHand.find((x) => x.id === tileId)
      if (!t) return
      const sides = matchSides(t, cur.chain)
      if (sides.length === 0) return
      const s = side ?? sides[0]
      if (!s || !sides.includes(s)) return
      const chain = placeTile(cur.chain, t, s)
      const playerHand = cur.playerHand.filter((x) => x.id !== tileId)
      beep(700, 0.07, 0.05)
      if (playerHand.length === 0) {
        finishRound({ ...cur, chain, playerHand }, 'player', handPips(cur.cpuHand), '手札をすべて出し切った！')
        return
      }
      setG({ ...cur, chain, playerHand, turn: 'cpu', passes: 0, selectedId: null, msg: '' })
    },
    [finishRound],
  )

  const drawTile = useCallback(() => {
    const cur = gRef.current
    if (phaseRef.current !== 'playing' || cur.turn !== 'player' || cur.roundOver) return
    if (cur.boneyard.length === 0) return
    if (canPlayAny(cur.playerHand, cur.chain)) return
    const drawn = cur.boneyard[0]
    if (!drawn) return
    setG({
      ...cur,
      playerHand: [...cur.playerHand, drawn],
      boneyard: cur.boneyard.slice(1),
      msg: `${drawn.a}-${drawn.b} を引いた`,
    })
    beep(500, 0.06, 0.04)
  }, [])

  const passTurn = useCallback(() => {
    const cur = gRef.current
    if (phaseRef.current !== 'playing' || cur.turn !== 'player' || cur.roundOver) return
    if (canPlayAny(cur.playerHand, cur.chain) || cur.boneyard.length > 0) return
    const passes = cur.passes + 1
    if (passes >= 2) {
      const pp = handPips(cur.playerHand)
      const cp = handPips(cur.cpuHand)
      if (pp === cp) finishRound({ ...cur, passes }, 'draw', 0, '両方とも出せずブロック！ 残りピップが同じ')
      else if (pp < cp) finishRound({ ...cur, passes }, 'player', cp - pp, '両方とも出せずブロック！ 残りピップが少ない')
      else finishRound({ ...cur, passes }, 'cpu', pp - cp, '両方とも出せずブロック！ 残りピップが少ない')
      return
    }
    setG({ ...cur, passes, turn: 'cpu', msg: 'パスした' })
  }, [finishRound])

  // CPUの手番
  useEffect(() => {
    if (phase !== 'playing' || g.turn !== 'cpu' || g.roundOver) return
    const id = setTimeout(() => {
      const cur = gRef.current
      if (phaseRef.current !== 'playing' || cur.turn !== 'cpu' || cur.roundOver) return
      let { playerHand, cpuHand, boneyard, chain } = {
        playerHand: [...cur.playerHand],
        cpuHand: [...cur.cpuHand],
        boneyard: [...cur.boneyard],
        chain: [...cur.chain],
      }
      let passes = cur.passes
      for (;;) {
        const playable = cpuHand.filter((t) => matchSides(t, chain).length > 0)
        if (playable.length > 0) {
          let t: Tile
          const d = diffRef.current
          if (d === 'easy') {
            t = playable[Math.floor(Math.random() * playable.length)] as Tile
          } else {
            t = [...playable].sort(
              (x, y) => pips(y) - pips(x) || (d === 'hard' ? (y.a === y.b ? 1 : 0) - (x.a === x.b ? 1 : 0) : 0),
            )[0] as Tile
          }
          const sides = matchSides(t, chain)
          const side = sides.length === 1 ? sides[0] : Math.random() < 0.5 ? 'left' : 'right'
          if (!side) return
          chain = placeTile(chain, t, side)
          cpuHand = cpuHand.filter((x) => x.id !== t.id)
          beep(520, 0.07, 0.04)
          if (cpuHand.length === 0) {
            finishRound(
              { ...cur, playerHand, cpuHand, boneyard, chain, passes: 0 },
              'cpu',
              handPips(playerHand),
              'ミオが手札をすべて出し切った！',
            )
            return
          }
          setG({ ...cur, playerHand, cpuHand, boneyard, chain, turn: 'player', passes: 0, msg: `ミオが ${t.a}-${t.b} を出した`, selectedId: null })
          return
        }
        if (boneyard.length > 0) {
          const drawn = boneyard[0]
          if (!drawn) return
          boneyard = boneyard.slice(1)
          cpuHand = [...cpuHand, drawn]
          continue
        }
        passes += 1
        if (passes >= 2) {
          const pp = handPips(playerHand)
          const cp = handPips(cpuHand)
          if (pp === cp) finishRound({ ...cur, playerHand, cpuHand, boneyard, chain, passes }, 'draw', 0, '両方とも出せずブロック！ 残りピップが同じ')
          else if (pp < cp) finishRound({ ...cur, playerHand, cpuHand, boneyard, chain, passes }, 'player', cp - pp, '両方とも出せずブロック！ 残りピップが少ない')
          else finishRound({ ...cur, playerHand, cpuHand, boneyard, chain, passes }, 'cpu', pp - cp, '両方とも出せずブロック！ 残りピップが少ない')
          return
        }
        setG({ ...cur, playerHand, cpuHand, boneyard, chain, turn: 'player', passes, msg: 'ミオはパスした', selectedId: null })
        return
      }
    }, 800)
    return () => clearTimeout(id)
  }, [phase, g.turn, g.roundOver, finishRound])

  // キーボード操作
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'over') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          startMatch()
        }
        return
      }
      const cur = gRef.current
      if (cur.turn !== 'player' || cur.roundOver) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (cur.playerHand.length === 0) return
        const idx = cur.playerHand.findIndex((t) => t.id === cur.selectedId)
        const next =
          e.key === 'ArrowRight'
            ? (idx + 1) % cur.playerHand.length
            : (idx - 1 + cur.playerHand.length) % cur.playerHand.length
        const t = cur.playerHand[next]
        if (t) setG({ ...cur, selectedId: t.id })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const t = cur.playerHand.find((x) => x.id === cur.selectedId)
        if (!t) return
        const sides = matchSides(t, cur.chain)
        if (sides.length === 0) return
        playTile(t.id, e.shiftKey ? 'left' : sides.includes('right') ? 'right' : 'left')
      } else if (e.key === 'd' || e.key === 'D') {
        drawTile()
      } else if (e.key === 'p' || e.key === 'P') {
        passTurn()
      }
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  }, [startMatch, playTile, drawTile, passTurn])

  const ends = endsOf(g.chain)
  const selectedTile = g.playerHand.find((t) => t.id === g.selectedId)
  const selectedSides = selectedTile ? matchSides(selectedTile, g.chain) : []
  const playerCanPlay = canPlayAny(g.playerHand, g.chain)
  const canDraw = g.turn === 'player' && !g.roundOver && !playerCanPlay && g.boneyard.length > 0
  const canPass = g.turn === 'player' && !g.roundOver && !playerCanPlay && g.boneyard.length === 0

  return (
    <div className="domino">
      <h2>🁢 ドミノ</h2>
      <div className="domino-head">
        <span>
          あなた <b>{g.scores.p}</b>
        </span>
        <span>
          ミオ <b>{g.scores.c}</b>
        </span>
        <span>ラウンド {g.round}</span>
        <span>先に{TARGET}点</span>
        <span>
          通算 {wins}勝{loses}敗
        </span>
      </div>
      {g.msg && <div className="domino-msg">{g.msg}</div>}

      {phase === 'idle' && (
        <div className="domino-rules">
          <p>CPUのミオと対戦するドミノ。28枚の牌から7枚ずつ配り、残りは山札だよ。</p>
          <p>場の両端のどちらかと同じ数字の牌を出していこう。出せる牌がなければ山札から引くよ。山札が空ならパス。</p>
          <p>手札を出し切るか、両方とも出せなくなればラウンド終了。勝者は相手の残りピップ数を得点するよ。</p>
          <p>先に{TARGET}点取った方のマッチ勝利！</p>
          <p>操作：牌をタップして出す／両端に出せるときは◀ ▶ボタンで選ぶ／←→で牌を選んでEnterで出す（Shift+Enterで左）／Dで引く／Pでパス</p>
          <div className="domino-diff">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                className={diff === d ? 'domino-diff-on' : ''}
                onClick={() => {
                  setDiff(d)
                  diffRef.current = d
                }}
              >
                {DIFFS[d].label}
              </button>
            ))}
          </div>
          <div className="domino-start-row">
            <button className="domino-start" onClick={startMatch}>
              スタート
            </button>
          </div>
          <p className="domino-best">
            通算：{wins}勝{loses}敗 ／ マッチ数：{games}回
          </p>
        </div>
      )}

      {phase !== 'idle' && (
        <>
          <div className="domino-cpu">
            <span>ミオの手札</span>
            <div className="domino-backs">
              {g.cpuHand.map((t) => (
                <div key={t.id} className="domino-back">
                  🁢
                </div>
              ))}
            </div>
            <span>山札：{g.boneyard.length}枚</span>
          </div>

          <div className="domino-board-wrap">
            {ends && (
              <div className="domino-ends">
                <button
                  className="domino-end"
                  disabled={!selectedTile || !selectedSides.includes('left')}
                  onClick={() => selectedTile && playTile(selectedTile.id, 'left')}
                >
                  ◀ 左端 {ends.left}
                </button>
                <button
                  className="domino-end"
                  disabled={!selectedTile || !selectedSides.includes('right')}
                  onClick={() => selectedTile && playTile(selectedTile.id, 'right')}
                >
                  右端 {ends.right} ▶
                </button>
              </div>
            )}
            <div className="domino-board">
              {g.chain.map((p) => (
                <BoardTile key={p.id} p={p} />
              ))}
            </div>
            {g.turn === 'cpu' && !g.roundOver && <div className="domino-turn">ミオが考え中…</div>}
            {g.turn === 'player' && !g.roundOver && <div className="domino-turn">あなたの番だよ</div>}
          </div>

          {g.roundOver && (
            <div className="domino-roundover">
              {g.roundOver}
              <br />
              {g.matchOver ? (
                <button
                  onClick={() => {
                    setG(initialGame())
                    setPhase('idle')
                  }}
                >
                  タイトルへ戻る
                </button>
              ) : (
                <button onClick={() => startRound(g.scores, g.round + 1)}>次のラウンドへ</button>
              )}
            </div>
          )}

          <div className="domino-hand">
            {g.playerHand.map((t) => {
              const sides = matchSides(t, g.chain)
              const playable = sides.length > 0 && g.turn === 'player' && !g.roundOver
              return (
                <button
                  key={t.id}
                  className={`domino-tile-v${playable ? ' domino-playable' : ''}${g.selectedId === t.id ? ' domino-selected' : ''}`}
                  onClick={() => {
                    if (!playable) {
                      setG({ ...g, selectedId: t.id, msg: 'その牌は今の場には出せないよ' })
                      return
                    }
                    if (sides.length === 1) {
                      playTile(t.id, sides[0])
                    } else {
                      setG({ ...g, selectedId: t.id, msg: '出す端を選んでね（◀ 左端／右端 ▶）' })
                    }
                  }}
                >
                  <Half n={t.a} />
                  <div className="domino-div" />
                  <Half n={t.b} />
                </button>
              )
            })}
          </div>

          <div className="domino-actions">
            <button onClick={drawTile} disabled={!canDraw}>
              山札から引く（{g.boneyard.length}枚）
            </button>
            <button onClick={passTurn} disabled={!canPass}>
              パス
            </button>
          </div>
        </>
      )}
    </div>
  )
}
