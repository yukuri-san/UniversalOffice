import { useEffect, useRef, useState } from 'react'

/* ================= スペースシューター =================
 * 縦スクロールシューティングゲーム。
 * ・自機を矢印キー／WASD／ドラッグで動かし、自動連射で敵を倒す
 * ・敵は3種（直進ドローン／ジグザグ移動／弾を撃つガンナー）。ウェーブ制で
 *   5ウェーブごとにボス出現（HPバーつき、放射状の弾幕）
 * ・パワーアップ：P＝武器強化（最大3連射）、S＝シールド（1回防ぐ）、
 *   B＝ボム+1（Spaceで発動、敵弾を消して全敵にダメージ）
 * ・残機3。スコアと到達ウェーブを保存 */

const W = 360
const H = 480
const BEST_SCORE_KEY = 'webx-shooter-best'
const BEST_WAVE_KEY = 'webx-shooter-wave'

function beep(freq: number, dur = 0.08, vol = 0.05, type: OscillatorType = 'sine') {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    o.type = type
    g.gain.value = vol
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + dur)
    o.onended = () => void ctx.close()
  } catch { /* 音が出なくても遊べる */ }
}

type Phase = 'title' | 'playing' | 'clear' | 'done'
type EnemyKind = 'drone' | 'weaver' | 'gunner' | 'boss'

interface Enemy {
  kind: EnemyKind
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  r: number
  t: number
  score: number
  shootT: number
}

interface Bullet { x: number; y: number; vx: number; vy: number; r: number; foe: boolean }
interface PowerUp { x: number; y: number; kind: 'P' | 'S' | 'B' }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface Star { x: number; y: number; s: number }

interface GameState {
  player: { x: number; y: number }
  keys: Set<string>
  pointer: { x: number; y: number } | null
  bullets: Bullet[]
  foes: Bullet[]
  enemies: Enemy[]
  powerups: PowerUp[]
  parts: Particle[]
  stars: Star[]
  fireT: number
  spawnT: number
  spawnLeft: number
  boss: Enemy | null
  invT: number
  shake: number
}

function newStars(): Star[] {
  return Array.from({ length: 70 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: 0.5 + Math.random() * 1.5,
  }))
}

function freshGame(): GameState {
  return {
    player: { x: W / 2, y: H - 60 },
    keys: new Set(),
    pointer: null,
    bullets: [],
    foes: [],
    enemies: [],
    powerups: [],
    parts: [],
    stars: newStars(),
    fireT: 0,
    spawnT: 0,
    spawnLeft: 0,
    boss: null,
    invT: 0,
    shake: 0,
  }
}

function waveCount(wave: number): number {
  return 8 + wave * 2
}

export default function SpaceShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const g = useRef<GameState>(freshGame())
  const rafRef = useRef(0)
  const lastRef = useRef(0)

  const [phase, setPhase] = useState<Phase>('title')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [wave, setWave] = useState(1)
  const [bombs, setBombs] = useState(1)
  const [weapon, setWeapon] = useState(1)
  const [shield, setShield] = useState(false)
  const [bossHp, setBossHp] = useState(0)
  const [bossMax, setBossMax] = useState(0)
  const [message, setMessage] = useState('敵を倒してウェーブを進めよう！')
  const [bestScore, setBestScore] = useState(() => {
    try { return Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0) || 0 } catch { return 0 }
  })
  const [bestWave, setBestWave] = useState(() => {
    try { return Number(localStorage.getItem(BEST_WAVE_KEY) ?? 0) || 0 } catch { return 0 }
  })

  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const scoreRef = useRef(score)
  scoreRef.current = score
  const livesRef = useRef(lives)
  livesRef.current = lives
  const waveRef = useRef(wave)
  waveRef.current = wave
  const bombsRef = useRef(bombs)
  bombsRef.current = bombs
  const weaponRef = useRef(weapon)
  weaponRef.current = weapon
  const shieldRef = useRef(shield)
  shieldRef.current = shield

  const saveBest = (s: number, wv: number) => {
    if (s > bestScore) {
      setBestScore(s)
      try { localStorage.setItem(BEST_SCORE_KEY, String(s)) } catch { /* 保存できなくても遊べる */ }
    }
    if (wv > bestWave) {
      setBestWave(wv)
      try { localStorage.setItem(BEST_WAVE_KEY, String(wv)) } catch { /* 保存できなくても遊べる */ }
    }
  }

  function addScore(n: number) {
    const s = scoreRef.current + n
    scoreRef.current = s
    setScore(s)
  }

  function explode(x: number, y: number, color: string, n = 12) {
    const st = g.current
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 40 + Math.random() * 120
      st.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color })
    }
  }

  function spawnEnemy(wv: number) {
    const st = g.current
    const roll = Math.random()
    const x = 24 + Math.random() * (W - 48)
    if (roll < 0.5) {
      st.enemies.push({ kind: 'drone', x, y: -20, vx: 0, vy: 70 + wv * 4, hp: 1, maxHp: 1, r: 12, t: 0, score: 100, shootT: 0 })
    } else if (roll < 0.8) {
      st.enemies.push({ kind: 'weaver', x, y: -20, vx: (Math.random() < 0.5 ? -1 : 1) * (50 + wv * 3), vy: 55 + wv * 3, hp: 2, maxHp: 2, r: 13, t: Math.random() * 6, score: 150, shootT: 0 })
    } else {
      st.enemies.push({ kind: 'gunner', x, y: -20, vx: 0, vy: 38, hp: 3, maxHp: 3, r: 14, t: 0, score: 200, shootT: 1 + Math.random() })
    }
  }

  function spawnBoss(wv: number) {
    const hp = 40 + wv * 6
    const boss: Enemy = { kind: 'boss', x: W / 2, y: -50, vx: 60, vy: 30, hp, maxHp: hp, r: 34, t: 0, score: 1000, shootT: 2 }
    g.current.boss = boss
    g.current.enemies.push(boss)
    setBossHp(hp)
    setBossMax(hp)
    setMessage('⚠️ ボス出現！ 弾幕をかわして倒そう！')
    beep(180, 0.4, 0.07, 'sawtooth')
  }

  function startWave(wv: number) {
    const st = freshGame()
    st.stars = g.current.stars
    g.current = st
    setWave(wv)
    waveRef.current = wv
    if (wv % 5 === 0) {
      spawnBoss(wv)
    } else {
      g.current.spawnLeft = waveCount(wv)
      g.current.spawnT = 0.5
    }
    setPhase('playing')
    setMessage(wv % 5 === 0 ? 'ボス戦！' : `ウェーブ${wv}：敵${waveCount(wv)}機を倒そう！`)
  }

  function startGame() {
    setScore(0)
    scoreRef.current = 0
    setLives(3)
    livesRef.current = 3
    setBombs(1)
    bombsRef.current = 1
    setWeapon(1)
    weaponRef.current = 1
    setShield(false)
    shieldRef.current = false
    setBossHp(0)
    startWave(1)
  }

  function waveClear() {
    const bonus = 300 + waveRef.current * 100
    addScore(bonus)
    saveBest(scoreRef.current, waveRef.current)
    setPhase('clear')
    setMessage(`ウェーブ${waveRef.current}クリア！ ボーナス ${bonus}点`)
    ;[523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.15, 0.06), i * 100))
  }

  function gameOver() {
    saveBest(scoreRef.current, waveRef.current)
    setPhase('done')
    const s = scoreRef.current
    setMessage(
      s > bestScore
        ? `ゲームオーバー！ ${s}点でベスト更新！ ウェーブ${waveRef.current}まで到達`
        : `ゲームオーバー！ ${s}点（ベスト ${bestScore}点）。ウェーブ${waveRef.current}まで到達`,
    )
    ;[392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.2, 0.06), i * 130))
  }

  function playerHit() {
    const st = g.current
    if (st.invT > 0 || phaseRef.current !== 'playing') return
    if (shieldRef.current) {
      setShield(false)
      shieldRef.current = false
      st.invT = 1.2
      explode(st.player.x, st.player.y, '#60a5fa', 16)
      beep(300, 0.2, 0.07, 'square')
      setMessage('シールドが弾を防いだ！')
      return
    }
    const lv = livesRef.current - 1
    livesRef.current = lv
    setLives(lv)
    st.invT = 2
    st.shake = 0.3
    explode(st.player.x, st.player.y, '#f87171', 24)
    beep(160, 0.35, 0.08, 'sawtooth')
    if (lv <= 0) {
      gameOver()
    } else {
      setMessage(`やられた！ 残機${lv}`)
    }
  }

  function useBomb() {
    const st = g.current
    if (phaseRef.current !== 'playing' || bombsRef.current <= 0) return
    const b = bombsRef.current - 1
    bombsRef.current = b
    setBombs(b)
    st.foes = []
    for (const e of [...st.enemies]) {
      e.hp -= 5
      explode(e.x, e.y, '#fbbf24', 8)
      if (e.hp <= 0) killEnemy(e)
    }
    if (st.boss) setBossHp(Math.max(0, st.boss.hp))
    st.shake = 0.25
    beep(90, 0.4, 0.09, 'sawtooth')
    setMessage('ボム発動！ 敵弾を消し飛ばした！')
  }

  function killEnemy(e: Enemy) {
    const st = g.current
    st.enemies = st.enemies.filter((x) => x !== e)
    addScore(e.score)
    explode(e.x, e.y, e.kind === 'boss' ? '#f97316' : '#fb923c', e.kind === 'boss' ? 40 : 12)
    beep(e.kind === 'boss' ? 120 : 220, 0.15, 0.06, 'square')
    if (e.kind === 'boss') {
      st.boss = null
      setBossHp(0)
      addScore(500)
      for (let i = 0; i < 3; i++) {
        st.powerups.push({ x: e.x + (i - 1) * 40, y: e.y, kind: i === 0 ? 'P' : i === 1 ? 'S' : 'B' })
      }
      return
    }
    if (Math.random() < 0.1) {
      const kind = (['P', 'S', 'B'] as const)[Math.floor(Math.random() * 3)]
      st.powerups.push({ x: e.x, y: e.y, kind })
    }
  }

  function firePlayer() {
    const st = g.current
    const p = st.player
    const wv = weaponRef.current
    const mk = (dx: number) => st.bullets.push({ x: p.x + dx, y: p.y - 14, vx: dx * 18, vy: -420, r: 4, foe: false })
    if (wv === 1) mk(0)
    else if (wv === 2) { mk(-8); mk(8) }
    else { mk(0); mk(-12); mk(12) }
    beep(880, 0.04, 0.02, 'square')
  }

  function step(dt: number) {
    const st = g.current
    // 星空スクロール
    for (const s of st.stars) {
      s.y += s.s * 40 * dt
      if (s.y > H) { s.y = 0; s.x = Math.random() * W }
    }
    if (phaseRef.current !== 'playing') return
    const p = st.player
    // 自機の移動（キー）
    const sp = 260
    if (st.keys.has('arrowleft') || st.keys.has('a')) p.x -= sp * dt
    if (st.keys.has('arrowright') || st.keys.has('d')) p.x += sp * dt
    if (st.keys.has('arrowup') || st.keys.has('w')) p.y -= sp * dt
    if (st.keys.has('arrowdown') || st.keys.has('s')) p.y += sp * dt
    // ドラッグ追従
    if (st.pointer) {
      p.x += (st.pointer.x - p.x) * Math.min(1, dt * 14)
      p.y += (st.pointer.y - p.y) * Math.min(1, dt * 14)
    }
    p.x = Math.max(14, Math.min(W - 14, p.x))
    p.y = Math.max(H / 2, Math.min(H - 14, p.y))
    if (st.invT > 0) st.invT -= dt
    if (st.shake > 0) st.shake -= dt

    // 自動連射
    st.fireT -= dt
    if (st.fireT <= 0) {
      firePlayer()
      st.fireT = 0.18
    }

    // 敵の出現
    if (st.spawnLeft > 0) {
      st.spawnT -= dt
      if (st.spawnT <= 0) {
        spawnEnemy(waveRef.current)
        st.spawnLeft -= 1
        st.spawnT = Math.max(0.35, 0.9 - waveRef.current * 0.03)
      }
    }

    // 敵の移動と攻撃
    for (const e of st.enemies) {
      e.t += dt
      if (e.kind === 'drone') {
        e.y += e.vy * dt
      } else if (e.kind === 'weaver') {
        e.y += e.vy * dt
        e.x += Math.sin(e.t * 3) * 90 * dt
      } else if (e.kind === 'gunner') {
        e.y += e.vy * dt
        if (e.y > 90) e.vy = 0
        e.shootT -= dt
        if (e.shootT <= 0 && e.y > 0 && e.y < H * 0.6) {
          const dx = p.x - e.x
          const dy = p.y - e.y
          const len = Math.hypot(dx, dy) || 1
          st.foes.push({ x: e.x, y: e.y + 12, vx: (dx / len) * 170, vy: (dy / len) * 170, r: 5, foe: true })
          e.shootT = 1.6 + Math.random() * 0.8
          beep(300, 0.06, 0.03, 'square')
        }
      } else if (e.kind === 'boss') {
        if (e.y < 80) e.y += e.vy * dt
        else {
          e.x += e.vx * dt
          if (e.x < 50 || e.x > W - 50) e.vx *= -1
        }
        e.shootT -= dt
        if (e.shootT <= 0 && e.y > 0) {
          const n = 8 + Math.min(6, Math.floor(waveRef.current / 5))
          for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + e.t
            st.foes.push({ x: e.x, y: e.y + 20, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 + 40, r: 5, foe: true })
          }
          e.shootT = 1.4
          beep(200, 0.12, 0.04, 'sawtooth')
        }
      }
    }
    // 画面外の敵は消す（ボス以外）
    st.enemies = st.enemies.filter((e) => e.kind === 'boss' || e.y < H + 40)

    // 自機の弾
    for (const b of st.bullets) {
      b.x += b.vx * dt
      b.y += b.vy * dt
    }
    st.bullets = st.bullets.filter((b) => b.y > -10 && b.x > -10 && b.x < W + 10)
    // 敵弾
    for (const b of st.foes) {
      b.x += b.vx * dt
      b.y += b.vy * dt
    }
    st.foes = st.foes.filter((b) => b.y > -10 && b.y < H + 10 && b.x > -10 && b.x < W + 10)

    // 自弾と敵の当たり判定
    for (const b of [...st.bullets]) {
      for (const e of [...st.enemies]) {
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          st.bullets = st.bullets.filter((x) => x !== b)
          e.hp -= 1
          explode(b.x, b.y, '#fde68a', 4)
          if (e.kind === 'boss') setBossHp(Math.max(0, e.hp))
          if (e.hp <= 0) killEnemy(e)
          break
        }
      }
    }

    // 敵弾・敵と自機の当たり判定
    for (const b of [...st.foes]) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 11) {
        st.foes = st.foes.filter((x) => x !== b)
        playerHit()
        break
      }
    }
    for (const e of [...st.enemies]) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 12) {
        e.hp -= 3
        if (e.kind === 'boss') setBossHp(Math.max(0, e.hp))
        if (e.hp <= 0) killEnemy(e)
        playerHit()
        break
      }
    }

    // パワーアップ
    for (const pu of st.powerups) pu.y += 70 * dt
    st.powerups = st.powerups.filter((pu) => pu.y < H + 20)
    for (const pu of [...st.powerups]) {
      if (Math.hypot(pu.x - p.x, pu.y - p.y) < 22) {
        st.powerups = st.powerups.filter((x) => x !== pu)
        if (pu.kind === 'P') {
          const w = Math.min(3, weaponRef.current + 1)
          weaponRef.current = w
          setWeapon(w)
          setMessage('武器パワーアップ！ 連射数が増えた！')
        } else if (pu.kind === 'S') {
          setShield(true)
          shieldRef.current = true
          setMessage('シールド獲得！ 1回だけ攻撃を防げる！')
        } else {
          const b = Math.min(3, bombsRef.current + 1)
          bombsRef.current = b
          setBombs(b)
          setMessage('ボム+1！ Spaceキーで使えるよ')
        }
        ;[660, 880].forEach((f, i) => setTimeout(() => beep(f, 0.1, 0.05), i * 90))
      }
    }

    // 爆発パーティクル
    for (const pt of st.parts) {
      pt.x += pt.vx * dt
      pt.y += pt.vy * dt
      pt.life -= dt
    }
    st.parts = st.parts.filter((pt) => pt.life > 0)

    // ウェーブクリア判定
    if (st.spawnLeft === 0 && st.enemies.length === 0 && !st.boss) {
      waveClear()
    }
  }

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const st = g.current
    ctx.save()
    if (st.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8)
    }
    ctx.fillStyle = '#0b1026'
    ctx.fillRect(-10, -10, W + 20, H + 20)
    // 星空
    ctx.fillStyle = '#ffffff'
    for (const s of st.stars) {
      ctx.globalAlpha = 0.4 + s.s * 0.3
      ctx.fillRect(s.x, s.y, s.s, s.s)
    }
    ctx.globalAlpha = 1
    const p = st.player
    // パワーアップ
    for (const pu of st.powerups) {
      ctx.fillStyle = pu.kind === 'P' ? '#f59e0b' : pu.kind === 'S' ? '#60a5fa' : '#a78bfa'
      ctx.beginPath()
      ctx.arc(pu.x, pu.y, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pu.kind, pu.x, pu.y + 0.5)
    }
    // 敵
    for (const e of st.enemies) {
      if (e.kind === 'drone') {
        ctx.fillStyle = '#f87171'
        ctx.beginPath()
        ctx.moveTo(e.x, e.y + 12)
        ctx.lineTo(e.x - 11, e.y - 9)
        ctx.lineTo(e.x + 11, e.y - 9)
        ctx.closePath()
        ctx.fill()
      } else if (e.kind === 'weaver') {
        ctx.fillStyle = '#fb923c'
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#7c2d12'
        ctx.beginPath()
        ctx.arc(e.x - 4, e.y - 2, 2.5, 0, Math.PI * 2)
        ctx.arc(e.x + 4, e.y - 2, 2.5, 0, Math.PI * 2)
        ctx.fill()
      } else if (e.kind === 'gunner') {
        ctx.fillStyle = '#c084fc'
        ctx.fillRect(e.x - 13, e.y - 11, 26, 22)
        ctx.fillStyle = '#581c87'
        ctx.beginPath()
        ctx.arc(e.x, e.y + 4, 5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // ボス
        ctx.fillStyle = '#dc2626'
        ctx.beginPath()
        ctx.moveTo(e.x, e.y + 30)
        ctx.lineTo(e.x - 32, e.y - 18)
        ctx.lineTo(e.x - 16, e.y - 28)
        ctx.lineTo(e.x + 16, e.y - 28)
        ctx.lineTo(e.x + 32, e.y - 18)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#fca5a5'
        ctx.beginPath()
        ctx.arc(e.x, e.y - 4, 8, 0, Math.PI * 2)
        ctx.fill()
      }
      // HPバー（ガンナー・ボス以外は1なので表示しない）
      if (e.kind !== 'drone' && e.kind !== 'boss') {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fillRect(e.x - 12, e.y - e.r - 8, 24, 3)
        ctx.fillStyle = '#4ade80'
        ctx.fillRect(e.x - 12, e.y - e.r - 8, 24 * (e.hp / e.maxHp), 3)
      }
    }
    // 自機の弾
    ctx.fillStyle = '#fde047'
    for (const b of st.bullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
    }
    // 敵弾
    ctx.fillStyle = '#f472b6'
    for (const b of st.foes) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()
    }
    // パーティクル
    for (const pt of st.parts) {
      ctx.globalAlpha = Math.max(0, pt.life * 2)
      ctx.fillStyle = pt.color
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // 自機（点滅＝無敵中）
    if (phaseRef.current === 'playing' || phaseRef.current === 'clear') {
      if (st.invT <= 0 || Math.floor(st.invT * 10) % 2 === 0) {
        ctx.fillStyle = '#38bdf8'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - 16)
        ctx.lineTo(p.x - 12, p.y + 10)
        ctx.lineTo(p.x, p.y + 4)
        ctx.lineTo(p.x + 12, p.y + 10)
        ctx.closePath()
        ctx.fill()
        // エンジン炎
        ctx.fillStyle = '#fb923c'
        ctx.beginPath()
        ctx.moveTo(p.x - 4, p.y + 10)
        ctx.lineTo(p.x, p.y + 18 + Math.random() * 6)
        ctx.lineTo(p.x + 4, p.y + 10)
        ctx.closePath()
        ctx.fill()
        if (shieldRef.current) {
          ctx.strokeStyle = 'rgba(96,165,250,0.8)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, 22, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    ctx.restore()
  }

  // メインループ
  useEffect(() => {
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - lastRef.current) / 1000 || 0.016)
      lastRef.current = t
      step(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const k = e.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
    if (k === ' ') {
      if (phaseRef.current === 'playing') useBomb()
      else if (phaseRef.current === 'title' || phaseRef.current === 'done') startGame()
      else if (phaseRef.current === 'clear') startWave(waveRef.current + 1)
      return
    }
    g.current.keys.add(k)
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    g.current.keys.delete(e.key.toLowerCase())
  }

  function pointerPos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: W / 2, y: H - 60 }
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  return (
    <div className="shooter" tabIndex={0} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <div className="shooter-head">
        <span>スコア <b>{score}</b></span>
        <span>ベスト {bestScore}</span>
        <span>ウェーブ <b>{wave}</b>（最高{bestWave}）</span>
        <span>残機 {'🚀'.repeat(Math.max(0, lives)) || '—'}</span>
        <span>ボム 💣×{bombs}</span>
        <span>武器 Lv{weapon}{shield ? ' 🛡️' : ''}</span>
      </div>
      {bossHp > 0 && (
        <div className="shooter-boss">
          <span>BOSS</span>
          <div className="shooter-boss-bar"><div style={{ width: `${(bossHp / bossMax) * 100}%` }} /></div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="shooter-canvas"
        width={W}
        height={H}
        onPointerDown={(e) => { g.current.pointer = pointerPos(e); (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
        onPointerMove={(e) => { if (g.current.pointer) g.current.pointer = pointerPos(e) }}
        onPointerUp={() => { g.current.pointer = null }}
        onPointerCancel={() => { g.current.pointer = null }}
      />
      <p className="shooter-msg">{message}</p>
      {phase === 'playing' && (
        <div className="shooter-btns">
          <button onClick={useBomb} disabled={bombs <= 0}>💣 ボム（Space）残り{bombs}</button>
        </div>
      )}
      {phase === 'title' && (
        <div className="shooter-btns">
          <button onClick={startGame}>出撃する</button>
        </div>
      )}
      {phase === 'clear' && (
        <div className="shooter-btns">
          <button onClick={() => startWave(wave + 1)}>次のウェーブへ</button>
        </div>
      )}
      {phase === 'done' && (
        <div className="shooter-btns">
          <button onClick={startGame}>もう一度</button>
          <button onClick={() => setPhase('title')}>タイトルへ</button>
        </div>
      )}
      <p className="shooter-help">自機は矢印キー／WASD／ドラッグで移動、弾は自動で連射するよ。P＝武器強化、S＝シールド、B＝ボムを拾えるよ。Spaceキーでボム発動（敵弾を消して全敵にダメージ）。5ウェーブごとにボスが出るよ。</p>
    </div>
  )
}
