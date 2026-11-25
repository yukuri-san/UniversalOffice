// toho-engine.ts
// WebX専用の東方系レイヤー。danmaku-engine の上に構築する：
//  - ステージ脚本フォーマット（データ駆動のタイムラインイベント）
//  - ボスフレームワーク（フェイズ列＋実在スペルカードの「仕掛け」テンプレート）
//  - 自機フレームワーク（キャラ定義を差し替え可能、霊夢／魔理沙サンプル）
//  - 共通システム（残機・ボム・パワー・グレイズ・スコア・アイテム）
//  - キャラ描画ヘルパー（原作素材不使用、Canvasベクターのイラスト調フィギュア）
//
// 弾幕パターンやスペルの「仕掛け」（時止め・凍結・分身・回転レーザー・霧弾）は
// 仕組みとして再利用できるようパラメータ化してある。弾幕の具体的な数値・絵は自作前提。

import {
  DanmakuWorld,
  type Bullet,
  type Emitter,
  type EmitterEntry,
  type Laser,
  type LaserOpts,
  type SpawnOpts,
  ringVolley,
  fanVolley,
  aimedVolley,
} from './danmaku-engine'

// ============================================================
// 共通システム（スコア・残機・ボム・パワー・グレイズ）
// ============================================================

export interface GameStateOpts {
  startLives?: number
  startBombs?: number
  maxBombs?: number
  maxPower?: number
  /** エクステンド（残機アップ）のスコア閾値 */
  extendsAt?: number[]
}

export class GameState {
  score = 0
  hiScore = 0
  lives: number
  bombs: number
  /** パワー 0.00〜maxPower（整数部がオプション段階） */
  power = 0
  graze = 0
  readonly maxBombs: number
  readonly maxPower: number
  private readonly startLives: number
  private readonly startBombs: number
  private readonly extendsAt: number[]
  private extendIdx = 0

  constructor(opts: GameStateOpts = {}) {
    this.startLives = opts.startLives ?? 2
    this.lives = this.startLives
    this.startBombs = opts.startBombs ?? 3
    this.bombs = this.startBombs
    this.maxBombs = opts.maxBombs ?? 8
    this.maxPower = opts.maxPower ?? 4
    this.extendsAt = opts.extendsAt ?? [10_000_000, 30_000_000, 60_000_000]
  }

  get powerTier(): number {
    return Math.min(this.maxPower, Math.floor(this.power))
  }

  /** スコア加算。エクステンドに到達したら true（残機+1 済み） */
  addScore(n: number): boolean {
    this.score += n
    if (this.score > this.hiScore) this.hiScore = this.score
    let extended = false
    while (
      this.extendIdx < this.extendsAt.length &&
      this.score >= this.extendsAt[this.extendIdx]
    ) {
      this.extendIdx++
      this.lives++
      extended = true
    }
    return extended
  }

  addGraze(n = 1): void {
    this.graze += n
  }

  /** パワー加算（上限で止まる。溢れたら true） */
  addPower(amount: number): boolean {
    if (this.power >= this.maxPower) return true
    this.power = Math.min(this.maxPower, this.power + amount)
    return false
  }

  /** 被弾時のパワーダウン */
  powerDown(amount = 1): void {
    this.power = Math.max(0, this.power - amount)
  }

  addBomb(n = 1): void {
    this.bombs = Math.min(this.maxBombs, this.bombs + n)
  }

  addLife(n = 1): void {
    this.lives += n
  }

  /** ボム使用可否を確認して消費する */
  useBomb(): boolean {
    if (this.bombs <= 0) return false
    this.bombs--
    return true
  }

  /** ミス処理。ゲームオーバーなら true。ボムは初期値に戻る */
  miss(): boolean {
    this.lives--
    this.bombs = this.startBombs
    if (this.lives < 0) return true
    return false
  }

  reset(): void {
    this.score = 0
    this.lives = this.startLives
    this.bombs = this.startBombs
    this.power = 0
    this.graze = 0
    this.extendIdx = 0
  }
}

// ============================================================
// アイテム（P／点／残機／ボム）
// ============================================================

export type ItemKind = 'power' | 'point' | 'life' | 'bomb' | 'fullpower'

export interface Item {
  active: boolean
  kind: ItemKind
  x: number
  y: number
  vy: number
  t: number
  _slot: number
}

export interface ItemCollectInfo {
  kind: ItemKind
  x: number
  y: number
  /** 点アイテムの回収ライン（画面上部）で回収した＝満額 */
  fullValue: boolean
}

const ITEM_COLORS: Record<ItemKind, string> = {
  power: '#ff5b6a',
  point: '#4fc3f7',
  life: '#ff7ad9',
  bomb: '#7bed6a',
  fullpower: '#ffe066',
}
const ITEM_LABELS: Record<ItemKind, string> = {
  power: 'P', point: '点', life: '命', bomb: 'B', fullpower: 'F',
}

export class ItemPool {
  readonly items: Item[] = []
  readonly active: Item[] = []

  constructor(capacity = 256) {
    for (let i = 0; i < capacity; i++) {
      this.items.push({ active: false, kind: 'point', x: 0, y: 0, vy: 0, t: 0, _slot: -1 })
    }
  }

  get count(): number {
    return this.active.length
  }

  spawn(kind: ItemKind, x: number, y: number): Item | null {
    for (const it of this.items) {
      if (it.active) continue
      it.active = true
      it.kind = kind
      it.x = x
      it.y = y
      it.vy = -70
      it.t = 0
      it._slot = this.active.length
      this.active.push(it)
      return it
    }
    return null
  }

  private kill(it: Item): void {
    if (!it.active) return
    it.active = false
    const last = this.active[this.active.length - 1]
    this.active[it._slot] = last
    last._slot = it._slot
    this.active.pop()
    it._slot = -1
  }

  clear(): void {
    for (const it of this.active) {
      it.active = false
      it._slot = -1
    }
    this.active.length = 0
  }

  /**
   * 落下・吸着・回収。
   * attractAll=true（回収ライン到達時など）で全アイテムが自機へ吸着する。
   */
  update(
    dt: number,
    px: number, py: number,
    opts: {
      height: number
      magnetR?: number
      collectR?: number
      attractAll?: boolean
      onCollect?: (info: ItemCollectInfo) => void
    },
  ): void {
    const magnetR = opts.magnetR ?? 64
    const collectR = opts.collectR ?? 15
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i]
      it.t += dt
      it.vy = Math.min(it.vy + 300 * dt, 155)
      const dx = px - it.x
      const dy = py - it.y
      const d2 = dx * dx + dy * dy
      if (opts.attractAll || d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1
        const pull = opts.attractAll ? 620 : 380
        it.x += (dx / d) * pull * dt
        it.y += (dy / d) * pull * dt
        it.vy = 0
      } else {
        it.y += it.vy * dt
      }
      if (d2 < collectR * collectR) {
        if (opts.onCollect) {
          opts.onCollect({ kind: it.kind, x: it.x, y: it.y, fullValue: !!opts.attractAll })
        }
        this.kill(it)
        continue
      }
      if (it.y > opts.height + 24) this.kill(it)
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const it of this.active) {
      const c = ITEM_COLORS[it.kind]
      ctx.fillStyle = '#101018'
      ctx.strokeStyle = c
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.roundRect(it.x - 7, it.y - 7, 14, 14, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = c
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ITEM_LABELS[it.kind], it.x, it.y + 0.5)
    }
  }
}

/** アイテム効果を GameState へ適用する標準処理（点数体系は目安） */
export function applyItemEffect(
  state: GameState, info: ItemCollectInfo,
  scoreMul = 1,
): void {
  switch (info.kind) {
    case 'power':
      if (state.addPower(0.25)) state.addScore(5000 * scoreMul)
      else state.addScore(100 * scoreMul)
      break
    case 'fullpower':
      state.power = state.maxPower
      state.addScore(1000 * scoreMul)
      break
    case 'point':
      state.addScore((info.fullValue ? 10000 : 3000) * scoreMul)
      break
    case 'life':
      state.addLife(1)
      break
    case 'bomb':
      state.addBomb(1)
      break
  }
}

// ============================================================
// 敵（編隊）
// ============================================================

export type EnemyMoveKind = 'down' | 'side' | 'sine' | 'hover' | 'dart'

export interface EnemyDef {
  hp: number
  radius: number
  score?: number
  move: EnemyMoveKind
  /** 移動速度 px/s */
  speed?: number
  /** hover: 停止する y 座標 */
  stopY?: number
  /** hover: 停止してから退場するまでの秒数 */
  stayTime?: number
  /** 射撃間隔（秒、0/未指定で撃たない） */
  fireInterval?: number
  /** カスタム射撃（world と敵自身を受け取る） */
  fire?: (w: DanmakuWorld, e: Enemy) => void
  /** 撃破時ドロップ */
  drop?: ItemKind[]
  /** 描画識別子（ゲーム側の描画関数と対応） */
  sprite?: string
}

export class Enemy {
  active = false
  def!: EnemyDef
  x = 0
  y = 0
  hp = 1
  maxHp = 1
  t = 0
  dir = 1
  seed = 0
  fireT = 0
  state = 0 // 0:移動中 1:hover中 2:退場中
  stateT = 0
  _slot = -1
}

export class EnemyPool {
  readonly enemies: Enemy[] = []
  readonly active: Enemy[] = []

  constructor(capacity = 96) {
    for (let i = 0; i < capacity; i++) this.enemies.push(new Enemy())
  }

  get count(): number {
    return this.active.length
  }

  spawn(def: EnemyDef, x: number, y: number, dir = 1): Enemy | null {
    for (const e of this.enemies) {
      if (e.active) continue
      e.active = true
      e.def = def
      e.x = x
      e.y = y
      e.hp = def.hp
      e.maxHp = def.hp
      e.t = 0
      e.dir = dir
      e.seed = Math.random() * Math.PI * 2
      e.fireT = def.fireInterval ? def.fireInterval * (0.5 + Math.random() * 0.5) : 0
      e.state = 0
      e.stateT = 0
      e._slot = this.active.length
      this.active.push(e)
      return e
    }
    return null
  }

  kill(e: Enemy): void {
    if (!e.active) return
    e.active = false
    const last = this.active[this.active.length - 1]
    this.active[e._slot] = last
    last._slot = e._slot
    this.active.pop()
    e._slot = -1
  }

  clear(): void {
    for (const e of this.active) {
      e.active = false
      e._slot = -1
    }
    this.active.length = 0
  }

  /** ダメージを与える。撃破したら true */
  damage(e: Enemy, dmg: number): boolean {
    if (!e.active) return false
    e.hp -= dmg
    if (e.hp <= 0) {
      this.kill(e)
      return true
    }
    return false
  }

  update(dt: number, w: DanmakuWorld, bounds: { width: number; height: number }): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i]
      const def = e.def
      e.t += dt
      const spd = def.speed ?? 68
      switch (def.move) {
        case 'down':
          e.y += spd * dt
          break
        case 'side':
          e.x += spd * e.dir * dt
          e.y += spd * 0.24 * dt
          break
        case 'sine':
          e.y += spd * dt
          e.x += Math.sin(e.t * 2.4 + e.seed) * 56 * dt
          break
        case 'dart':
          e.x += spd * e.dir * 0.72 * dt
          e.y += spd * 0.72 * dt
          break
        case 'hover': {
          const stopY = def.stopY ?? 110
          if (e.state === 0) {
            e.y += spd * dt
            if (e.y >= stopY) {
              e.state = 1
              e.stateT = 0
            }
          } else if (e.state === 1) {
            e.stateT += dt
            e.x += Math.sin(e.t * 1.6 + e.seed) * 22 * dt
            if (e.stateT >= (def.stayTime ?? 4)) e.state = 2
          } else {
            e.y -= spd * 1.5 * dt
            e.x += e.dir * spd * 0.5 * dt
          }
          break
        }
      }
      // 射撃
      if (def.fire && def.fireInterval && def.fireInterval > 0) {
        e.fireT -= dt
        if (e.fireT <= 0) {
          e.fireT += def.fireInterval
          def.fire(w, e)
        }
      }
      if (
        e.x < -48 || e.x > bounds.width + 48 ||
        e.y < -56 || e.y > bounds.height + 48
      ) {
        this.kill(e)
      }
    }
  }
}

// ============================================================
// 自機フレームワーク
// ============================================================

export type PlayerBulletKind = 'orb' | 'talisman' | 'missile' | 'laser'

export interface ShotSpawn {
  /** 自機位置からのオフセット */
  dx: number
  dy: number
  /** 発射角 rad（-PI/2 が真上） */
  angle: number
  speed: number
  dmg: number
  kind: PlayerBulletKind
  /** 誘導の旋回速度 rad/s（0で直進） */
  homing?: number
}

export interface BombDef {
  name: string
  /** 効果時間（秒） */
  duration: number
  /** 秒間ダメージ */
  dps: number
  /** 全画面ボムか前方ボムか */
  scope: 'full' | 'front'
}

export interface PlayerCharaDef {
  id: string
  name: string
  /** 通常移動速度 px/s */
  speed: number
  /** 低速（集中）移動速度 px/s */
  focusSpeed: number
  /** 当たり判定半径 */
  hitR: number
  /** グレイズ半径 */
  grazeR: number
  /** ショット間隔（秒） */
  shotInterval: number
  /** パワー段階（0〜4）と集中状態に応じたショット構成 */
  shots: (powerTier: number, focused: boolean) => ShotSpawn[]
  bomb: BombDef
}

const UP = -Math.PI / 2

/** 霊夢タイプ：広角＋誘導札 */
export const REIMU_DEF: PlayerCharaDef = {
  id: 'reimu',
  name: '博麗霊夢',
  speed: 268,
  focusSpeed: 118,
  hitR: 2.5,
  grazeR: 26,
  shotInterval: 0.075,
  bomb: { name: '霊符「夢想封印」', duration: 3.2, dps: 260, scope: 'full' },
  shots: (tier, focused) => {
    const out: ShotSpawn[] = []
    const spread = focused ? 0.05 : 0.11
    out.push({ dx: -5, dy: -10, angle: UP - spread * 0.4, speed: 640, dmg: 9, kind: 'orb' })
    out.push({ dx: 5, dy: -10, angle: UP + spread * 0.4, speed: 640, dmg: 9, kind: 'orb' })
    if (tier >= 1) {
      out.push({ dx: -13, dy: -4, angle: UP - spread, speed: 600, dmg: 6, kind: 'orb' })
      out.push({ dx: 13, dy: -4, angle: UP + spread, speed: 600, dmg: 6, kind: 'orb' })
    }
    if (tier >= 2) {
      out.push({ dx: -19, dy: 2, angle: UP - 0.04, speed: 520, dmg: 7, kind: 'talisman', homing: 4.2 })
      out.push({ dx: 19, dy: 2, angle: UP + 0.04, speed: 520, dmg: 7, kind: 'talisman', homing: 4.2 })
    }
    if (tier >= 3) {
      out.push({ dx: 0, dy: -14, angle: UP, speed: 680, dmg: 10, kind: 'orb' })
    }
    if (tier >= 4) {
      out.push({ dx: -25, dy: 4, angle: UP - 0.08, speed: 520, dmg: 7, kind: 'talisman', homing: 4.6 })
      out.push({ dx: 25, dy: 4, angle: UP + 0.08, speed: 520, dmg: 7, kind: 'talisman', homing: 4.6 })
    }
    return out
  },
}

/** 魔理沙タイプ：前方集中＋高速 */
export const MARISA_DEF: PlayerCharaDef = {
  id: 'marisa',
  name: '霧雨魔理沙',
  speed: 292,
  focusSpeed: 132,
  hitR: 2.5,
  grazeR: 26,
  shotInterval: 0.07,
  bomb: { name: '恋符「マスタースパーク」', duration: 2.6, dps: 340, scope: 'front' },
  shots: (tier, focused) => {
    const out: ShotSpawn[] = []
    out.push({ dx: -4, dy: -10, angle: UP, speed: 700, dmg: 10, kind: 'laser' })
    out.push({ dx: 4, dy: -10, angle: UP, speed: 700, dmg: 10, kind: 'laser' })
    if (tier >= 1) {
      out.push({ dx: -11, dy: -6, angle: UP, speed: 660, dmg: 7, kind: 'orb' })
      out.push({ dx: 11, dy: -6, angle: UP, speed: 660, dmg: 7, kind: 'orb' })
    }
    if (tier >= 2) {
      out.push({ dx: -17, dy: 0, angle: UP - 0.03, speed: 560, dmg: 8, kind: 'missile', homing: 1.4 })
      out.push({ dx: 17, dy: 0, angle: UP + 0.03, speed: 560, dmg: 8, kind: 'missile', homing: 1.4 })
    }
    if (tier >= 3) {
      out.push({ dx: 0, dy: -14, angle: UP, speed: 720, dmg: 11, kind: 'laser' })
    }
    if (tier >= 4) {
      out.push({ dx: -23, dy: 2, angle: UP - 0.05, speed: 560, dmg: 8, kind: 'missile', homing: 1.8 })
      out.push({ dx: 23, dy: 2, angle: UP + 0.05, speed: 560, dmg: 8, kind: 'missile', homing: 1.8 })
    }
    return out
  },
}

// ---------- 自機弾プール ----------

export interface PlayerBullet {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  dmg: number
  kind: PlayerBulletKind
  homing: number
  _slot: number
}

export class PlayerBulletPool {
  readonly bullets: PlayerBullet[] = []
  readonly active: PlayerBullet[] = []

  constructor(capacity = 320) {
    for (let i = 0; i < capacity; i++) {
      this.bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, kind: 'orb', homing: 0, _slot: -1 })
    }
  }

  get count(): number {
    return this.active.length
  }

  spawn(x: number, y: number, s: ShotSpawn): PlayerBullet | null {
    for (const b of this.bullets) {
      if (b.active) continue
      b.active = true
      b.x = x + s.dx
      b.y = y + s.dy
      b.vx = Math.cos(s.angle) * s.speed
      b.vy = Math.sin(s.angle) * s.speed
      b.dmg = s.dmg
      b.kind = s.kind
      b.homing = s.homing ?? 0
      b._slot = this.active.length
      this.active.push(b)
      return b
    }
    return null
  }

  private kill(b: PlayerBullet): void {
    if (!b.active) return
    b.active = false
    const last = this.active[this.active.length - 1]
    this.active[b._slot] = last
    last._slot = b._slot
    this.active.pop()
    b._slot = -1
  }

  clear(): void {
    for (const b of this.active) {
      b.active = false
      b._slot = -1
    }
    this.active.length = 0
  }

  /**
   * 移動・誘導・命中処理。
   * findTarget: 誘導先（なければ null）
   * hitTest: (x, y, dmg) => 命中して消費されたら true
   */
  update(
    dt: number,
    bounds: { width: number; height: number },
    findTarget: (x: number, y: number) => { x: number; y: number } | null,
    hitTest: (x: number, y: number, dmg: number) => boolean,
  ): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i]
      if (b.homing > 0) {
        const tg = findTarget(b.x, b.y)
        if (tg) {
          const sp = Math.hypot(b.vx, b.vy) || 400
          const cur = Math.atan2(b.vy, b.vx)
          const want = Math.atan2(tg.y - b.y, tg.x - b.x)
          let diff = want - cur
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          const turn = Math.max(-b.homing * dt, Math.min(b.homing * dt, diff))
          const na = cur + turn
          b.vx = Math.cos(na) * sp
          b.vy = Math.sin(na) * sp
        }
      }
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (hitTest(b.x, b.y, b.dmg)) {
        this.kill(b)
        continue
      }
      if (b.x < -24 || b.x > bounds.width + 24 || b.y < -32 || b.y > bounds.height + 24) {
        this.kill(b)
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const b of this.active) {
      if (b.kind === 'laser') {
        ctx.fillStyle = '#b8f4ff'
        ctx.fillRect(b.x - 1.6, b.y - 11, 3.2, 20)
        ctx.fillStyle = 'rgba(120,220,255,0.4)'
        ctx.fillRect(b.x - 3.4, b.y - 9, 6.8, 16)
      } else if (b.kind === 'talisman') {
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2)
        ctx.fillStyle = '#fdf6e3'
        ctx.strokeStyle = '#d8404a'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(-3.4, -6, 6.8, 12, 2)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      } else if (b.kind === 'missile') {
        ctx.fillStyle = '#ffe9a8'
        ctx.beginPath()
        ctx.arc(b.x, b.y, 3.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,190,80,0.45)'
        ctx.beginPath()
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#ffd7de'
        ctx.beginPath()
        ctx.ellipse(b.x, b.y, 2.6, 5.2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,120,150,0.4)'
        ctx.beginPath()
        ctx.ellipse(b.x, b.y, 4.6, 8, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

// ---------- 自機本体 ----------

export interface PlayerInput {
  /** -1..1 の移動入力（正規化は呼び出し側） */
  mx: number
  my: number
  focus: boolean
  shot: boolean
}

export class Player {
  def: PlayerCharaDef
  x: number
  y: number
  /** 無敵時間（秒） */
  invulnT = 0
  /** ボム持続の残り（秒）。>0 の間ボム効果中 */
  bombT = 0
  dead = false
  private shotT = 0

  constructor(def: PlayerCharaDef, x: number, y: number) {
    this.def = def
    this.x = x
    this.y = y
  }

  get bombing(): boolean {
    return this.bombT > 0
  }

  /** ボム発動を試みる（GameState の消費は呼び出し側で先に行う） */
  startBomb(): boolean {
    if (this.bombT > 0 || this.dead) return false
    this.bombT = this.def.bomb.duration
    if (this.invulnT < this.def.bomb.duration + 0.5) {
      this.invulnT = this.def.bomb.duration + 0.5
    }
    return true
  }

  respawn(x: number, y: number): void {
    this.x = x
    this.y = y
    this.dead = false
    this.invulnT = 3
    this.bombT = 0
    this.shotT = 0
  }

  /**
   * 移動と射撃。射撃は shots コールバックへ ShotSpawn 列を渡す。
   * フィールド境界でクランプする。
   */
  update(
    dt: number,
    input: PlayerInput,
    bounds: { width: number; height: number },
    powerTier: number,
    onShots: (shots: ShotSpawn[]) => void,
  ): void {
    if (this.invulnT > 0) this.invulnT -= dt
    if (this.bombT > 0) this.bombT -= dt
    if (this.dead) return
    const spd = input.focus ? this.def.focusSpeed : this.def.speed
    this.x += input.mx * spd * dt
    this.y += input.my * spd * dt
    this.x = Math.max(10, Math.min(bounds.width - 10, this.x))
    this.y = Math.max(14, Math.min(bounds.height - 10, this.y))
    this.shotT -= dt
    if (input.shot && this.shotT <= 0) {
      this.shotT = this.def.shotInterval
      onShots(this.def.shots(powerTier, input.focus))
    }
  }
}

// ============================================================
// ボスフレームワーク
// ============================================================

import {
  AimedEmitter,
  ScatterEmitter,
  SpiralEmitter,
  type BulletTemplate,
} from './danmaku-engine'

export interface DiffScale {
  /** 弾速倍率 */
  spd: number
  /** 弾数倍率 */
  den: number
}

export interface BossBody {
  x: number
  y: number
  /** 本物か（分身テンプレート用） */
  real: boolean
  radius: number
  visible: boolean
}

export interface BossContext {
  world: DanmakuWorld
  bossX: () => number
  bossY: () => number
  /** ボス本体の位置を直接指定する（move:'still' のフェイズで本体移動を脚本化する用。フィールド内にクランプされる） */
  setBossPos: (x: number, y: number) => void
  player: { x: number; y: number }
  diff: DiffScale
  /** フェイズ経過秒 */
  phaseTime: () => number
  spawn: (o: SpawnOpts) => Bullet | null
  /** 難易度倍率を適用したリング */
  ring: (count: number, o: BulletTemplate) => void
  /** 難易度倍率を適用した扇 */
  fan: (center: number, count: number, spread: number, o: BulletTemplate) => void
  /** 難易度倍率を適用した狙い撃ち */
  aimed: (count: number, spread: number, o: BulletTemplate) => void
  /** フェイズ終了時に自動で止まる Emitter を登録（ボス追従） */
  addEmitter: (e: Emitter) => EmitterEntry
  /** 任意位置の Emitter を登録 */
  addEmitterAt: (e: Emitter, getPos: () => { x: number; y: number }) => EmitterEntry
  /** フェイズ終了時に自動で消えるレーザーを登録 */
  addLaser: (o: LaserOpts) => Laser | null
  /** 分身などの当たり判定体を差し替える（空で本体のみに戻る） */
  setBodies: (bodies: BossBody[]) => void
  /** true の間、本物の分身以外へのダメージを無効化する */
  setRealOnlyDamage: (v: boolean) => void
}

export type BossMoveKind = 'still' | 'hover' | 'sine' | 'chase' | 'teleport' | 'drift'

export interface BossPhaseDef {
  /** スペル名（null = 通常攻撃） */
  name: string | null
  /** スペルカードか（name から自動判定もする） */
  spell?: boolean
  hp: number
  /** 制限時間（秒） */
  timeLimit: number
  move?: BossMoveKind
  moveRange?: number
  moveSpeed?: number
  /** 仕掛けテンプレートを使う場合 */
  template?: PhaseTemplateId
  /** テンプレート／カスタム処理へのパラメータ */
  params?: Record<string, number>
  /** スペルカードボーナスの基礎値 */
  bonusBase?: number
  /** スペルカードボーナスの残り時間1秒あたり加算 */
  bonusPerSec?: number
  setup?: (ctx: BossContext) => void
  update?: (ctx: BossContext, dt: number) => void
  teardown?: (ctx: BossContext) => void
}

export interface BossDef {
  id: string
  name: string
  epithet?: string
  radius: number
  /** キャラ描画用フィギュア定義（任意） */
  figure?: FigureDef
  phases: BossPhaseDef[]
}

export interface PhaseEndResult {
  index: number
  phase: BossPhaseDef
  /** スペルをノーミス・ノーボムで取得したか */
  captured: boolean
  bonus: number
  timeout: boolean
  last: boolean
}

/** スペルカードボーナス計算：基礎値＋残り時間ボーナス */
export function calcSpellBonus(phase: BossPhaseDef, timeLeft: number): number {
  const base = phase.bonusBase ?? 500_000
  const per = phase.bonusPerSec ?? 20_000
  return Math.round(base + per * Math.max(0, timeLeft))
}

// ---------- 仕掛けテンプレート ----------

export type PhaseTemplateId = 'timestop' | 'freeze' | 'clones' | 'laserSweep' | 'mist'

export interface PhaseTemplateInstance {
  update?: (ctx: BossContext, dt: number) => void
  teardown?: (ctx: BossContext) => void
}

export type PhaseTemplateFactory = (
  ctx: BossContext,
  params: Record<string, number>,
) => PhaseTemplateInstance

function num(p: Record<string, number>, key: string, def: number): number {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : def
}

/**
 * 実在スペルカードの「仕掛け」を再利用できるテンプレート群。
 * 名前はスペル名ではなく仕掛け名。数値はパラメータで調整する。
 */
export const PhaseTemplates: Record<PhaseTemplateId, PhaseTemplateFactory> = {
  /** 時止め：撃った弾が途中で止まり、一斉に自機方向へ再加速する */
  timestop: (ctx, p) => {
    const interval = num(p, 'interval', 1.7)
    const count = num(p, 'count', 26)
    const speed = num(p, 'speed', 155)
    const travel = num(p, 'travel', 0.55)
    const freeze = num(p, 'freeze', 1.15)
    const resumeSpeed = num(p, 'resumeSpeed', 100)
    const color = num(p, 'color', 4)
    let t = interval * 0.6
    let offset = 0
    return {
      update: (c, dt) => {
        t += dt
        if (t >= interval) {
          t -= interval
          offset += 0.23
          c.ring(count, {
            speed, color, kind: 'orb',
            freezeAt: travel, freezeTime: freeze,
            resume: 'aim', resumeSpeed,
            angle: offset,
          } as BulletTemplate)
          c.aimed(3, 0.16, {
            speed: speed * 0.9, color, kind: 'orb',
            freezeAt: travel * 1.25, freezeTime: freeze,
            resume: 'aim', resumeSpeed: resumeSpeed * 1.1,
          })
        }
      },
    }
  },

  /** 凍結：広がった弾が一時停止し、その後落下して再始動する */
  freeze: (ctx, p) => {
    const interval = num(p, 'interval', 2.3)
    const count = num(p, 'count', 34)
    const speed = num(p, 'speed', 165)
    const freezeAt = num(p, 'freezeAt', 0.5)
    const freezeTime = num(p, 'freezeTime', 0.85)
    const gravity = num(p, 'gravity', 330)
    const layers = Math.max(1, Math.round(num(p, 'layers', 2)))
    const color = num(p, 'color', 4)
    let t = interval * 0.5
    let offset = 0
    return {
      update: (c, dt) => {
        t += dt
        if (t >= interval) {
          t -= interval
          offset += 0.31
          for (let l = 0; l < layers; l++) {
            c.ring(count, {
              speed: speed * (1 - l * 0.22), color, kind: 'orb',
              freezeAt: freezeAt + l * 0.18, freezeTime,
              resume: 'fall', resumeGravity: gravity,
              angle: offset + l * 0.12,
            } as BulletTemplate)
          }
        }
      },
    }
  },

  /** 分身：複数体に分かれ、本物以外は薄い弾幕。本物判定つき */
  clones: (ctx, p) => {
    const count = Math.max(2, Math.round(num(p, 'count', 4)))
    const radius = num(p, 'radius', 76)
    const fireInterval = num(p, 'fireInterval', 0.16)
    const bulletSpeed = num(p, 'bulletSpeed', 108)
    const shuffle = num(p, 'shuffle', 5)
    const orbitSpeed = num(p, 'orbitSpeed', 0.45)
    const color = num(p, 'color', 6)
    const bodies: BossBody[] = []
    let realIdx = Math.floor(ctx.world.rng() * count)
    let orbitA = 0
    let shuffleT = 0
    for (let i = 0; i < count; i++) {
      const body: BossBody = {
        x: ctx.bossX(), y: ctx.bossY(), real: i === realIdx, radius: 20, visible: true,
      }
      bodies.push(body)
      const sp = new SpiralEmitter()
      sp.arms = 1
      sp.interval = fireInterval * (body.real ? 1 : 1.7)
      sp.angleVel = body.real ? 2.1 : 1.2
      sp.bullet = { speed: bulletSpeed, color, kind: 'orb', r: 4 }
      ctx.addEmitterAt(sp, () => ({ x: body.x, y: body.y }))
    }
    ctx.setBodies(bodies)
    ctx.setRealOnlyDamage(num(p, 'realOnlyDamage', 0) > 0)
    return {
      update: (c, dt) => {
        orbitA += orbitSpeed * dt
        shuffleT += dt
        if (shuffleT >= shuffle) {
          shuffleT = 0
          realIdx = Math.floor(c.world.rng() * count)
          bodies.forEach((b, i) => {
            b.real = i === realIdx
          })
        }
        const bx = c.bossX()
        const by = c.bossY()
        bodies.forEach((b, i) => {
          const a = orbitA + (i / count) * Math.PI * 2
          b.x = bx + Math.cos(a) * radius
          b.y = by + Math.sin(a) * radius * 0.62
        })
        c.setBodies(bodies)
      },
      teardown: (c) => {
        c.setBodies([])
        c.setRealOnlyDamage(false)
      },
    }
  },

  /** 回転レーザー薙ぎ払い：予告線→太いレーザーが往復で薙ぐ */
  laserSweep: (ctx, p) => {
    const count = Math.max(1, Math.round(num(p, 'count', 1)))
    const sweepAngle = num(p, 'sweepAngle', 0.85)
    const sweepSpeed = num(p, 'sweepSpeed', 0.85)
    const width = num(p, 'width', 30)
    const telegraph = num(p, 'telegraph', 0.9)
    const baseAngle = num(p, 'baseAngle', Math.PI / 2)
    const color = num(p, 'color', 0)
    const ringInterval = num(p, 'ringInterval', 2.8)
    const ringCount = num(p, 'ringCount', 16)
    const ringSpeed = num(p, 'ringSpeed', 82)
    for (let i = 0; i < count; i++) {
      const phase = (i / Math.max(1, count)) * Math.PI
      ctx.addLaser({
        x: ctx.bossX(), y: ctx.bossY(),
        angle: baseAngle, length: 660, width, color,
        telegraph, duration: -1, fade: 0.3,
        sweepAmp: sweepAngle, sweepSpeed, sweepPhase: phase,
        follow: () => ({ x: ctx.bossX(), y: ctx.bossY() }),
      })
    }
    let t = 0
    return {
      update: (c, dt) => {
        t += dt
        if (t >= ringInterval) {
          t -= ringInterval
          c.ring(ringCount, { speed: ringSpeed, color, kind: 'orb' })
        }
      },
    }
  },

  /** 霧弾：漂いながら膨らむ泡弾で画面を満たす */
  mist: (ctx, p) => {
    const interval = num(p, 'interval', 0.42)
    const per = Math.max(1, Math.round(num(p, 'count', 3)))
    const speed = num(p, 'speed', 38)
    const grow = num(p, 'grow', 7.5)
    const maxR = num(p, 'maxR', 17)
    const color = num(p, 'color', 5)
    const sc = new ScatterEmitter()
    sc.interval = interval
    sc.count = per
    sc.bullet = {
      speed, color, kind: 'bubble', r: 5,
      grow, maxR, drag: 0.22,
      swayAmp: 13, swayFreq: 0.7,
    }
    ctx.addEmitter(sc)
    const am = new AimedEmitter()
    am.interval = num(p, 'aimedInterval', 1.35)
    am.count = 1
    am.bullet = { speed: num(p, 'aimedSpeed', 74), color, kind: 'orb' }
    ctx.addEmitter(am)
    return {}
  },
}

// ---------- ボス制御 ----------

export interface BossControllerOpts {
  width?: number
  height?: number
  /** フェイズ終了時に全弾消去するか（既定 true） */
  clearBulletsOnPhaseEnd?: boolean
  diff?: DiffScale
}

export class BossController {
  def: BossDef | null = null
  x = 0
  y = 0
  homeX = 0
  homeY = 0
  phaseIndex = -1
  hp = 0
  maxHp = 0
  timeLeft = 0
  phaseTime = 0
  active = false
  finished = false
  /** 当たり判定体（通常は本体1つ。分身時は差し替わる） */
  bodies: BossBody[] = []
  realOnlyDamage = false
  spellMissed = false
  spellBombed = false

  onPhaseStart: ((index: number, phase: BossPhaseDef) => void) | null = null
  onPhaseEnd: ((result: PhaseEndResult) => void) | null = null
  onDefeat: (() => void) | null = null

  private readonly width: number
  private readonly height: number
  private readonly clearOnEnd: boolean
  private diff: DiffScale
  private world: DanmakuWorld | null = null
  private playerRef: { x: number; y: number } = { x: 0, y: 0 }
  private emitters: EmitterEntry[] = []
  private lasers: Laser[] = []
  private templateInst: PhaseTemplateInstance | null = null
  private moveT = 0
  private teleportT = 0
  private driftTx = 0
  private driftTy = 0
  private driftT = 0
  private ctx: BossContext | null = null

  constructor(opts: BossControllerOpts = {}) {
    this.width = opts.width ?? 384
    this.height = opts.height ?? 448
    this.clearOnEnd = opts.clearBulletsOnPhaseEnd ?? true
    this.diff = opts.diff ?? { spd: 1, den: 1 }
  }

  get phase(): BossPhaseDef | null {
    if (!this.def || this.phaseIndex < 0) return null
    return this.def.phases[this.phaseIndex] ?? null
  }

  get isSpell(): boolean {
    const p = this.phase
    return !!p && (p.spell ?? p.name !== null)
  }

  get radius(): number {
    return this.def?.radius ?? 20
  }

  setDiff(d: DiffScale): void {
    this.diff = d
  }

  private makeCtx(): BossContext {
    const self = this
    return {
      world: this.world as DanmakuWorld,
      bossX: () => self.x,
      bossY: () => self.y,
      setBossPos: (x, y) => {
        self.x = Math.max(18, Math.min(self.width - 18, x))
        self.y = Math.max(20, Math.min(self.height - 20, y))
      },
      player: this.playerRef,
      diff: this.diff,
      phaseTime: () => self.phaseTime,
      spawn: (o) => (self.world ? self.world.spawn(o) : null),
      ring: (count, o) => {
        if (!self.world) return
        const n = Math.max(1, Math.round(count * self.diff.den))
        ringVolley(self.world, self.x, self.y, n, {
          ...o, speed: (o.speed ?? 120) * self.diff.spd,
        })
      },
      fan: (center, count, spread, o) => {
        if (!self.world) return
        const n = Math.max(1, Math.round(count * self.diff.den))
        fanVolley(self.world, self.x, self.y, center, n, spread, {
          ...o, speed: (o.speed ?? 120) * self.diff.spd,
        })
      },
      aimed: (count, spread, o) => {
        if (!self.world) return
        const n = Math.max(1, Math.round(count * self.diff.den))
        aimedVolley(self.world, self.x, self.y, n, spread, {
          ...o, speed: (o.speed ?? 120) * self.diff.spd,
        })
      },
      addEmitter: (e) => {
        const entry = (self.world as DanmakuWorld).addEmitter(e, () => ({ x: self.x, y: self.y }))
        self.emitters.push(entry)
        return entry
      },
      addEmitterAt: (e, getPos) => {
        const entry = (self.world as DanmakuWorld).addEmitter(e, getPos)
        self.emitters.push(entry)
        return entry
      },
      addLaser: (o) => {
        if (!self.world) return null
        const l = self.world.addLaser(o)
        if (l) self.lasers.push(l)
        return l
      },
      setBodies: (bodies) => {
        self.bodies = bodies
      },
      setRealOnlyDamage: (v) => {
        self.realOnlyDamage = v
      },
    }
  }

  start(
    def: BossDef,
    world: DanmakuWorld,
    player: { x: number; y: number },
    x: number, y: number,
  ): void {
    this.def = def
    this.world = world
    this.playerRef = player
    this.x = x
    this.y = y
    this.homeX = x
    this.homeY = y
    this.active = true
    this.finished = false
    this.ctx = this.makeCtx()
    this.startPhase(0)
  }

  private startPhase(index: number): void {
    const def = this.def
    if (!def || !this.ctx) return
    this.phaseIndex = index
    const phase = def.phases[index]
    this.hp = phase.hp
    this.maxHp = phase.hp
    this.timeLeft = phase.timeLimit
    this.phaseTime = 0
    this.moveT = 0
    this.teleportT = 0
    this.driftT = 0
    this.driftTx = this.x
    this.driftTy = this.y
    this.spellMissed = false
    this.spellBombed = false
    this.realOnlyDamage = false
    this.bodies = [{ x: this.x, y: this.y, real: true, radius: def.radius, visible: true }]
    if (phase.template) {
      this.templateInst = PhaseTemplates[phase.template](this.ctx, phase.params ?? {})
    } else {
      this.templateInst = null
    }
    if (phase.setup) phase.setup(this.ctx)
    if (this.onPhaseStart) this.onPhaseStart(index, phase)
  }

  private cleanupPhase(): void {
    if (!this.world) return
    for (const e of this.emitters) this.world.removeEmitter(e)
    this.emitters = []
    for (const l of this.lasers) this.world.lasers.kill(l)
    this.lasers = []
  }

  private endPhase(byDamage: boolean): void {
    const def = this.def
    const phase = this.phase
    if (!def || !phase || !this.ctx) return
    const isSpell = this.isSpell
    const captured = isSpell && byDamage && !this.spellMissed && !this.spellBombed
    const bonus = captured ? calcSpellBonus(phase, this.timeLeft) : 0
    if (this.templateInst?.teardown) this.templateInst.teardown(this.ctx)
    this.templateInst = null
    if (phase.teardown) phase.teardown(this.ctx)
    this.cleanupPhase()
    if (this.clearOnEnd && this.world) this.world.clearBullets()
    const last = this.phaseIndex >= def.phases.length - 1
    const result: PhaseEndResult = {
      index: this.phaseIndex, phase, captured, bonus,
      timeout: !byDamage, last,
    }
    if (this.onPhaseEnd) this.onPhaseEnd(result)
    if (last) {
      this.active = false
      this.finished = true
      this.bodies = []
      if (this.onDefeat) this.onDefeat()
    } else {
      this.startPhase(this.phaseIndex + 1)
    }
  }

  /** ダメージを与える（本体ヒット時） */
  damage(amount: number): void {
    if (!this.active || this.finished) return
    this.hp -= amount
    if (this.hp <= 0) this.endPhase(true)
  }

  /** 分身など個別ボディへのヒット。本物限定モードでは偽物を弾く */
  hitBody(body: BossBody | null, amount: number): boolean {
    if (!this.active || this.finished) return false
    if (body && this.realOnlyDamage && !body.real) return false
    this.damage(amount)
    return true
  }

  /** スペル中に被弾したら呼ぶ（取得失敗の記録） */
  notifyMiss(): void {
    if (this.isSpell) this.spellMissed = true
  }

  /** スペル中にボムを使ったら呼ぶ（取得失敗の記録） */
  notifyBomb(): void {
    if (this.isSpell) this.spellBombed = true
  }

  private updateMove(dt: number, phase: BossPhaseDef): void {
    const kind = phase.move ?? 'hover'
    const range = phase.moveRange ?? 56
    const speed = phase.moveSpeed ?? 1
    this.moveT += dt
    switch (kind) {
      case 'still':
        break
      case 'hover':
        this.x = this.homeX + Math.sin(this.moveT * 0.7 * speed) * range
        this.y = this.homeY + Math.sin(this.moveT * 1.13 * speed) * range * 0.22
        break
      case 'sine':
        this.x = this.homeX + Math.sin(this.moveT * 0.9 * speed) * range
        break
      case 'chase': {
        const targetX = Math.max(36, Math.min(this.width - 36, this.playerRef.x))
        const dx = targetX - this.x
        const step = 42 * speed * dt
        this.x += Math.max(-step, Math.min(step, dx))
        this.y += (this.homeY - this.y) * Math.min(1, dt * 1.5)
        break
      }
      case 'teleport': {
        this.teleportT += dt
        const interval = phase.params?.interval ?? 2.6
        if (this.teleportT >= interval) {
          this.teleportT = 0
          const w = this.world
          const r = w ? w.rng() : Math.random()
          this.x = 52 + r * (this.width - 104)
          this.y = this.homeY + (r - 0.5) * 26
        }
        break
      }
      case 'drift': {
        this.driftT -= dt
        if (this.driftT <= 0) {
          this.driftT = 2.2 + (this.world ? this.world.rng() : Math.random()) * 1.6
          this.driftTx = 44 + (this.world ? this.world.rng() : Math.random()) * (this.width - 88)
          this.driftTy = this.homeY + ((this.world ? this.world.rng() : Math.random()) - 0.5) * 44
        }
        const k = Math.min(1, dt * 1.4 * speed)
        this.x += (this.driftTx - this.x) * k
        this.y += (this.driftTy - this.y) * k
        break
      }
    }
    // 本体ボディの同期（分身で差し替えられていない場合）
    if (this.bodies.length === 1 && this.bodies[0].real) {
      this.bodies[0].x = this.x
      this.bodies[0].y = this.y
    }
  }

  update(dt: number): void {
    if (!this.active || this.finished || !this.ctx) return
    const phase = this.phase
    if (!phase) return
    this.phaseTime += dt
    this.timeLeft -= dt
    this.updateMove(dt, phase)
    if (this.templateInst?.update) this.templateInst.update(this.ctx, dt)
    if (phase.update) phase.update(this.ctx, dt)
    if (this.timeLeft <= 0 && this.active && !this.finished) {
      this.endPhase(false)
    }
  }

  /** 強制終了（ステージ側の都合で戦闘を打ち切る） */
  abort(): void {
    if (this.templateInst?.teardown && this.ctx) this.templateInst.teardown(this.ctx)
    this.templateInst = null
    this.cleanupPhase()
    this.active = false
    this.bodies = []
  }
}

// ============================================================
// ステージ脚本フォーマット＋ランナー
// ============================================================

export interface DialogueLine {
  speaker: string
  text: string
  side?: 'left' | 'right'
}

export interface FormationDef {
  enemy: EnemyDef
  count: number
  /** 出現間隔（秒） */
  interval: number
  from: 'top' | 'left' | 'right'
  /** top: 中心x / left,right: y の開始位置 */
  x?: number
  y?: number
  /** 編隊の間隔 px */
  spacing?: number
}

export type StageEventDef =
  | { at: number; type: 'formation'; formation: FormationDef }
  | { at: number; type: 'midboss'; boss: BossDef }
  | { at: number; type: 'boss'; boss: BossDef }
  | { at: number; type: 'background'; bg: string }
  | { at: number; type: 'dialogue'; lines: DialogueLine[] }
  | { at: number; type: 'drop'; item: ItemKind; x?: number; y?: number }
  | { at: number; type: 'message'; text: string }
  | { at: number; type: 'call'; fn: (api: StageApi) => void }

export interface StageScript {
  id: string
  title: string
  subtitle?: string
  /** 背景識別子の初期値 */
  bg?: string
  events: StageEventDef[]
}

/** ゲームシェル側が実装するステージ実行API */
export interface StageApi {
  spawnEnemy: (def: EnemyDef, x: number, y: number, dir: number) => void
  startBoss: (def: BossDef, midboss: boolean) => void
  setBackground: (bg: string) => void
  dialogue: (lines: DialogueLine[]) => void
  dropItem: (kind: ItemKind, x: number, y: number) => void
  message: (text: string) => void
}

interface PendingSpawn {
  at: number
  def: EnemyDef
  x: number
  y: number
  dir: number
}

/**
 * ステージ脚本を時間軸で実行する。
 * ボス戦や会話の間は setPaused(true) で止める運用を想定。
 */
export class StageRunner {
  readonly script: StageScript
  t = 0
  paused = false
  private readonly api: StageApi
  private readonly width: number
  private readonly height: number
  private events: StageEventDef[]
  private idx = 0
  private pending: PendingSpawn[] = []

  constructor(
    script: StageScript,
    api: StageApi,
    opts: { width: number; height: number },
  ) {
    this.script = script
    this.api = api
    this.width = opts.width
    this.height = opts.height
    this.events = [...script.events].sort((a, b) => a.at - b.at)
  }

  get finished(): boolean {
    return this.idx >= this.events.length && this.pending.length === 0
  }

  setPaused(v: boolean): void {
    this.paused = v
  }

  reset(): void {
    this.t = 0
    this.idx = 0
    this.pending = []
    this.paused = false
  }

  private expandFormation(at: number, f: FormationDef): void {
    const spacing = f.spacing ?? 38
    for (let i = 0; i < f.count; i++) {
      const t = at + i * f.interval
      if (f.from === 'top') {
        const cx = f.x ?? this.width / 2
        this.pending.push({
          at: t, def: f.enemy,
          x: cx + (i - (f.count - 1) / 2) * spacing * (f.count > 1 ? 0.4 : 0),
          y: -26 - i * (f.count > 1 ? 6 : 0),
          dir: 1,
        })
      } else if (f.from === 'left') {
        this.pending.push({
          at: t, def: f.enemy, x: -26,
          y: (f.y ?? 72) + i * spacing * 0.6, dir: 1,
        })
      } else {
        this.pending.push({
          at: t, def: f.enemy, x: this.width + 26,
          y: (f.y ?? 72) + i * spacing * 0.6, dir: -1,
        })
      }
    }
    this.pending.sort((a, b) => a.at - b.at)
  }

  private fireEvent(e: StageEventDef): void {
    switch (e.type) {
      case 'formation':
        this.expandFormation(this.t, e.formation)
        break
      case 'midboss':
        this.api.startBoss(e.boss, true)
        break
      case 'boss':
        this.api.startBoss(e.boss, false)
        break
      case 'background':
        this.api.setBackground(e.bg)
        break
      case 'dialogue':
        this.api.dialogue(e.lines)
        break
      case 'drop':
        this.api.dropItem(e.item, e.x ?? this.width / 2, e.y ?? 60)
        break
      case 'message':
        this.api.message(e.text)
        break
      case 'call':
        e.fn(this.api)
        break
    }
  }

  update(dt: number): void {
    if (this.paused) return
    this.t += dt
    while (this.idx < this.events.length && this.events[this.idx].at <= this.t) {
      this.fireEvent(this.events[this.idx])
      this.idx++
    }
    while (this.pending.length > 0 && this.pending[0].at <= this.t) {
      const p = this.pending.shift() as PendingSpawn
      this.api.spawnEnemy(p.def, p.x, p.y, p.dir)
    }
  }
}

// ============================================================
// キャラ描画ヘルパー（Canvasベクターのイラスト調フィギュア）
// 原作素材は使わない。配色・衣装・小物は公式デザインを参考に
// パラメータ化し、レイヤー化したパスで自前描画する。
// ============================================================

export interface FigurePalette {
  skin: string
  skinShade: string
  hair: string
  hairShade: string
  eye: string
  /** ドレス／服の主色 */
  dress: string
  dressShade: string
  /** ブラウス／エプロン等の副色 */
  sub: string
  /** リボン等のアクセント色 */
  accent: string
}

export type HairStyle = 'long' | 'medium' | 'short' | 'twin'
export type FigureAccessory = 'ribbon' | 'bigRibbon' | 'witchHat' | 'none'
export type FigureWings = 'none' | 'bat' | 'crystal' | 'ice' | 'feather'

export interface FigureDef {
  palette: FigurePalette
  hairStyle: HairStyle
  accessory: FigureAccessory
  wings: FigureWings
  /** 背後に描くオーラ色（rgba文字列、任意） */
  aura?: string
}

export interface FigureDrawOpts {
  /** アニメーション時刻（揺れ等に使う） */
  t?: number
  scale?: number
  flip?: boolean
  alpha?: number
}

function grad(
  ctx: CanvasRenderingContext2D,
  y0: number, y1: number, c0: string, c1: string,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  return g
}

function drawWings(ctx: CanvasRenderingContext2D, def: FigureDef, t: number): void {
  const P = def.palette
  const flap = Math.sin(t * 3.1) * 2
  if (def.wings === 'bat') {
    ctx.fillStyle = grad(ctx, -18, 8, P.dressShade, '#0c0c12')
    ctx.strokeStyle = 'rgba(200,170,255,0.35)'
    ctx.lineWidth = 0.8
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * 5, -6)
      ctx.quadraticCurveTo(s * 20, -16 - flap, s * 27, -10 - flap)
      ctx.quadraticCurveTo(s * 21, -6, s * 22, 0)
      ctx.quadraticCurveTo(s * 16, -3, s * 14, 2)
      ctx.quadraticCurveTo(s * 9, -1, s * 6, 3)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  } else if (def.wings === 'crystal') {
    const gems = ['#ff6b81', '#ffa94d', '#ffe066', '#7bed6a', '#4fc3f7', '#b388ff', '#ff7ad9']
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#3a3a44'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(s * 4, -4)
      ctx.quadraticCurveTo(s * 16, -10 - flap * 0.5, s * 27, -8 - flap)
      ctx.stroke()
      for (let i = 0; i < 5; i++) {
        const gx = s * (10 + i * 4.4)
        const gy = -6 - Math.sin((i / 4) * Math.PI * 0.7) * 5 - flap * (0.4 + i * 0.15)
        ctx.save()
        ctx.translate(gx, gy)
        ctx.rotate(s * 0.5)
        ctx.fillStyle = gems[i % gems.length]
        ctx.fillRect(-2.1, -2.1, 4.2, 4.2)
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillRect(-2.1, -2.1, 2, 2)
        ctx.restore()
      }
    }
  } else if (def.wings === 'ice') {
    ctx.fillStyle = 'rgba(170,225,255,0.55)'
    ctx.strokeStyle = 'rgba(230,250,255,0.8)'
    ctx.lineWidth = 0.7
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const bx = s * (7 + i * 5.5)
        const by = -8 + i * 3.4 - flap * 0.4
        ctx.beginPath()
        ctx.moveTo(s * 4, -4)
        ctx.lineTo(bx + s * 3.4, by - 4.6)
        ctx.lineTo(bx + s * 1.2, by + 2.6)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }
  } else if (def.wings === 'feather') {
    ctx.fillStyle = grad(ctx, -14, 6, '#fdfdff', '#b9c4de')
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.ellipse(
          s * (12 + i * 5), -8 + i * 4.6 - flap * 0.4,
          8.5 - i * 1.4, 3.4, s * (0.5 - i * 0.16), 0, Math.PI * 2,
        )
        ctx.fill()
      }
    }
  }
}

function drawBackHair(ctx: CanvasRenderingContext2D, def: FigureDef, t: number): void {
  const P = def.palette
  const sway = Math.sin(t * 2) * 1.1
  const g = grad(ctx, -24, 22, P.hair, P.hairShade)
  ctx.fillStyle = g
  if (def.hairStyle === 'twin') {
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(s * 6, -19)
      ctx.quadraticCurveTo(s * 14, -12, s * (12.5 + sway * 0.4), 8)
      ctx.quadraticCurveTo(s * 13.5, 17, s * 9.5, 19)
      ctx.quadraticCurveTo(s * 7.5, 8, s * 6.5, -6)
      ctx.closePath()
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, -13, 9.6, Math.PI, Math.PI * 2)
    ctx.fill()
    return
  }
  const len = def.hairStyle === 'long' ? 20 : def.hairStyle === 'medium' ? 9 : -3
  ctx.beginPath()
  ctx.moveTo(-9.4, -12)
  ctx.quadraticCurveTo(-10.6, 2, -9.2 + sway * 0.3, len)
  ctx.quadraticCurveTo(-4, len + 3.4, 0, len + 1.6)
  ctx.quadraticCurveTo(4, len + 3.4, 9.2 + sway * 0.3, len)
  ctx.quadraticCurveTo(10.6, 2, 9.4, -12)
  ctx.quadraticCurveTo(0, -25.5, -9.4, -12)
  ctx.closePath()
  ctx.fill()
}

function drawBody(ctx: CanvasRenderingContext2D, def: FigureDef): void {
  const P = def.palette
  // 腕（袖＋手）
  ctx.strokeStyle = P.sub
  ctx.lineWidth = 4.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-6, -4)
  ctx.lineTo(-11.5, 5)
  ctx.moveTo(6, -4)
  ctx.lineTo(11.5, 5)
  ctx.stroke()
  ctx.fillStyle = P.skin
  ctx.beginPath()
  ctx.arc(-11.8, 6, 2.1, 0, Math.PI * 2)
  ctx.arc(11.8, 6, 2.1, 0, Math.PI * 2)
  ctx.fill()
  // ドレス（肩→スカート、裾はフリル）
  const g = grad(ctx, -8, 21, P.dress, P.dressShade)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(-5.6, -7)
  ctx.quadraticCurveTo(0, -9.4, 5.6, -7)
  ctx.quadraticCurveTo(8.6, 2, 12.6, 15)
  for (let i = 0; i < 4; i++) {
    const x0 = 12.6 - i * 6.3
    ctx.quadraticCurveTo(x0 - 3.1, 19.6, x0 - 6.3, 15.4)
  }
  ctx.quadraticCurveTo(-8.6, 2, -5.6, -7)
  ctx.closePath()
  ctx.fill()
  // 前身頃（ブラウス／エプロン）
  ctx.fillStyle = P.sub
  ctx.beginPath()
  ctx.moveTo(-3.9, -6.8)
  ctx.quadraticCurveTo(0, -8.4, 3.9, -6.8)
  ctx.quadraticCurveTo(3.1, 0, 2.2, 5.4)
  ctx.quadraticCurveTo(0, 6.4, -2.2, 5.4)
  ctx.quadraticCurveTo(-3.1, 0, -3.9, -6.8)
  ctx.closePath()
  ctx.fill()
  // 首元のリボン
  ctx.fillStyle = P.accent
  ctx.beginPath()
  ctx.moveTo(0, -5.4)
  ctx.lineTo(-3.6, -7.6)
  ctx.lineTo(-3.4, -3.4)
  ctx.closePath()
  ctx.moveTo(0, -5.4)
  ctx.lineTo(3.6, -7.6)
  ctx.lineTo(3.4, -3.4)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, -5.4, 1.25, 0, Math.PI * 2)
  ctx.fill()
}

function drawHead(ctx: CanvasRenderingContext2D, def: FigureDef): void {
  const P = def.palette
  // 顔
  const g = ctx.createRadialGradient(-2.5, -16, 2, 0, -12.5, 10.5)
  g.addColorStop(0, P.skin)
  g.addColorStop(1, P.skinShade)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, -12.6, 8.6, 0, Math.PI * 2)
  ctx.fill()
  // ほっぺ
  ctx.fillStyle = 'rgba(255,130,150,0.35)'
  ctx.beginPath()
  ctx.ellipse(-5.3, -9.6, 1.9, 1.15, 0, 0, Math.PI * 2)
  ctx.ellipse(5.3, -9.6, 1.9, 1.15, 0, 0, Math.PI * 2)
  ctx.fill()
  // 目
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(s * 3.3, -12.2, 1.65, 2.25, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = P.eye
    ctx.beginPath()
    ctx.ellipse(s * 3.3, -11.9, 1.15, 1.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a1218'
    ctx.beginPath()
    ctx.ellipse(s * 3.3, -11.7, 0.55, 0.95, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(s * 3.3 - 0.4, -12.8, 0.42, 0, Math.PI * 2)
    ctx.fill()
    // 眉
    ctx.strokeStyle = P.hairShade
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.arc(s * 3.3, -15.6, 1.7, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
  }
  // 口
  ctx.strokeStyle = '#b96a5e'
  ctx.lineWidth = 0.7
  ctx.beginPath()
  ctx.arc(0, -8.2, 1.05, Math.PI * 0.25, Math.PI * 0.75)
  ctx.stroke()
}

function drawFrontHair(ctx: CanvasRenderingContext2D, def: FigureDef, t: number): void {
  const P = def.palette
  const sway = Math.sin(t * 2 + 0.7) * 0.7
  const g = grad(ctx, -24, -6, P.hair, P.hairShade)
  ctx.fillStyle = g
  // 前髪（下端はギザギザ）
  ctx.beginPath()
  ctx.moveTo(-8.9, -13.4)
  ctx.quadraticCurveTo(-9.2, -22.5, 0, -23.4)
  ctx.quadraticCurveTo(9.2, -22.5, 8.9, -13.4)
  const fringe: [number, number][] = [
    [6.4, -15.6], [4.4, -13.2], [2.2, -15.9], [0, -13.6],
    [-2.2, -15.9], [-4.4, -13.2], [-6.4, -15.6],
  ]
  for (const [fx, fy] of fringe) ctx.lineTo(fx, fy)
  ctx.closePath()
  ctx.fill()
  // サイドの毛束
  const sideLen = def.hairStyle === 'short' ? 1 : def.hairStyle === 'medium' ? 5 : 10
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * 7.6, -17.5)
    ctx.quadraticCurveTo(s * 10.1, -10, s * (9.3 + sway * 0.3), sideLen - 6)
    ctx.quadraticCurveTo(s * 7.9, sideLen - 9.5, s * 7.3, -8)
    ctx.quadraticCurveTo(s * 7.1, -13, s * 7.6, -17.5)
    ctx.closePath()
    ctx.fill()
  }
}

function drawAccessory(ctx: CanvasRenderingContext2D, def: FigureDef): void {
  const P = def.palette
  if (def.accessory === 'ribbon' || def.accessory === 'bigRibbon') {
    const big = def.accessory === 'bigRibbon'
    const cx = big ? 0 : -5.6
    const cy = big ? -22.4 : -20.2
    const s = big ? 1.45 : 1
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(s, s)
    ctx.fillStyle = P.accent
    for (const m of [-1, 1]) {
      ctx.save()
      ctx.rotate(m * 0.55)
      ctx.beginPath()
      ctx.ellipse(m * 3.1, 0, 3.3, 1.85, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // リボンの垂れ
      ctx.beginPath()
      ctx.moveTo(m * 0.9, 0.8)
      ctx.lineTo(m * 2.5, 5.6)
      ctx.lineTo(m * 0.6, 5.9)
      ctx.lineTo(m * -0.4, 1.6)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = P.accent
    ctx.beginPath()
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  if (def.accessory === 'witchHat') {
    ctx.fillStyle = grad(ctx, -38, -14, P.dress, P.dressShade)
    ctx.beginPath()
    ctx.ellipse(0, -19.5, 12.6, 3.1, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-7.6, -20)
    ctx.quadraticCurveTo(-3.4, -31, 2.8, -37.5)
    ctx.quadraticCurveTo(4.4, -38.6, 4.9, -36.6)
    ctx.quadraticCurveTo(6.4, -28, 7.6, -20)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = P.accent
    ctx.fillRect(-6.9, -21.6, 13.8, 2.3)
  }
}

/**
 * フィギュアを描く。原点はキャラ中心、素の大きさは約 幅54×高さ46。
 * scale で拡縮、t は揺れアニメーション用。
 */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  def: FigureDef,
  x: number, y: number,
  opts: FigureDrawOpts = {},
): void {
  const t = opts.t ?? 0
  const scale = opts.scale ?? 1
  ctx.save()
  ctx.translate(x, y)
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha
  ctx.scale((opts.flip ? -1 : 1) * scale, scale)
  if (def.aura) {
    const g = ctx.createRadialGradient(0, -4, 4, 0, -4, 31)
    g.addColorStop(0, def.aura)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, -4, 31, 0, Math.PI * 2)
    ctx.fill()
  }
  drawWings(ctx, def, t)
  drawBackHair(ctx, def, t)
  drawBody(ctx, def)
  drawHead(ctx, def)
  drawFrontHair(ctx, def, t)
  drawAccessory(ctx, def)
  ctx.restore()
}

// ---------- キャラ別プリセット ----------

/**
 * ルーミア：金髪・赤い目・黒いドレスに白ブラウス、髪の赤リボン、闇のオーラ。
 * 公式デザインの配色・衣装・小物を参考にした自前ベクター描画。
 */
export const RUMIA_FIGURE: FigureDef = {
  palette: {
    skin: '#ffe7d6', skinShade: '#f2c9a4',
    hair: '#f6d67c', hairShade: '#d3a03a',
    eye: '#e5484d',
    dress: '#26262f', dressShade: '#131318',
    sub: '#f7f3ea',
    accent: '#d8404a',
  },
  hairStyle: 'medium',
  accessory: 'ribbon',
  wings: 'none',
  aura: 'rgba(26,12,52,0.5)',
}

export function drawRumia(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  t = 0, scale = 1,
): void {
  drawFigure(ctx, RUMIA_FIGURE, x, y, { t, scale })
}

/** 霊夢プリセット（紅白・大きなリボン） */
export const REIMU_FIGURE: FigureDef = {
  palette: {
    skin: '#ffe7d6', skinShade: '#f2c9a4',
    hair: '#4a3230', hairShade: '#2a1c1a',
    eye: '#c0392b',
    dress: '#d8404a', dressShade: '#a32431',
    sub: '#ffffff',
    accent: '#d8404a',
  },
  hairStyle: 'long',
  accessory: 'bigRibbon',
  wings: 'none',
}

/** 魔理沙プリセット（金髪・黒衣・とんがり帽子） */
export const MARISA_FIGURE: FigureDef = {
  palette: {
    skin: '#ffe7d6', skinShade: '#f2c9a4',
    hair: '#f6d67c', hairShade: '#d3a03a',
    eye: '#e8a33d',
    dress: '#23232e', dressShade: '#101016',
    sub: '#ffffff',
    accent: '#ffffff',
  },
  hairStyle: 'long',
  accessory: 'witchHat',
  wings: 'none',
}

/** フランドールプリセット（金髪・赤系ドレス・宝石の翼） */
export const FLANDRE_FIGURE: FigureDef = {
  palette: {
    skin: '#ffeee2', skinShade: '#f2cdb2',
    hair: '#f8dc8a', hairShade: '#dcab44',
    eye: '#e5484d',
    dress: '#c94f63', dressShade: '#93344a',
    sub: '#fdf3ee',
    accent: '#f2f2f2',
  },
  hairStyle: 'medium',
  accessory: 'ribbon',
  wings: 'crystal',
}

/** レミリアプリセット（銀青髪・ピンクドレス・蝙蝠翼） */
export const REMILIA_FIGURE: FigureDef = {
  palette: {
    skin: '#ffeee2', skinShade: '#f0cdb4',
    hair: '#b9c8f2', hairShade: '#8296cc',
    eye: '#e5484d',
    dress: '#f2b8c6', dressShade: '#cf8296',
    sub: '#ffffff',
    accent: '#d8404a',
  },
  hairStyle: 'medium',
  accessory: 'ribbon',
  wings: 'bat',
}

/** チルノプリセット（水色髪・青ドレス・氷の翼） */
export const CIRNO_FIGURE: FigureDef = {
  palette: {
    skin: '#ffe7d6', skinShade: '#f2c9a4',
    hair: '#9fd8f2', hairShade: '#5ea8cf',
    eye: '#3d7de0',
    dress: '#4a7dd4', dressShade: '#2f56a3',
    sub: '#ffffff',
    accent: '#7bed6a',
  },
  hairStyle: 'twin',
  accessory: 'ribbon',
  wings: 'ice',
}
