// danmaku-engine.ts
// 汎用弾幕エンジン（Canvas 2D）。性能最優先の設計：
//  - 弾は事前確保したオブジェクトプールで管理し、実行時の確保を最小化する
//  - 弾の見た目は色×形×サイズごとにオフスクリーンCanvasへ事前描画し、drawImage で blit する
//  - 論理更新は固定60Hz、描画と分離する（FixedLoop）
// 目標：敵弾3,000発同時表示で60fps（紅魔郷〜錦上京クラスの密度に耐える）
//
// このモジュールは DOM に依存しない部分（プール／更新／判定）だけでも動作する。
// スプライト生成は CanvasFactory を渡したときだけ有効になり、Node 上のベンチでも読み込める。

// ============================================================
// 基本型
// ============================================================

/** 弾の見た目種別 */
export type BulletKind =
  | 'orb'      // 丸弾
  | 'big'      // 大玉
  | 'dot'      // 小粒
  | 'bubble'   // 泡弾（半透明）
  | 'ellipse'  // 楕円弾（速度方向を向く）
  | 'knife'    // ナイフ（速度方向を向く）
  | 'talisman' // 札（速度方向を向く）
  | 'star'     // 星弾（自転する）

/** 凍結（時止め）後にどう再始動するか */
export type ResumeMode =
  | 'keep'  // 保存した速度そのまま
  | 'aim'   // 自機方向へ向き直す
  | 'speed' // 保存した方向のまま速度だけ変える
  | 'fall'  // その場から落下する（重力加速）

export interface Bullet {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  ax: number
  ay: number
  /** 描画角度（速度方向を向く弾・自転する弾で使う） */
  angle: number
  /** 速度ベクトルの角速度 rad/s（曲射） */
  curve: number
  /** 見た目の自転 rad/s */
  spin: number
  /** 当たり判定半径 */
  r: number
  /** 見た目倍率 */
  scale: number
  kind: BulletKind
  /** パレット番号（customColor を使う場合は -1） */
  color: number
  customColor: string
  grazed: boolean
  // --- 凍結ステートマシン（0:通常 1:出現待ち 2:凍結中） ---
  state: number
  delayLeft: number
  /** あと何秒移動したら凍結するか（負数で無効） */
  freezeAt: number
  freezeTime: number
  freezeLeft: number
  resume: ResumeMode
  resumeSpeed: number
  resumeGravity: number
  svx: number
  svy: number
  // --- 霧弾・揺れ ---
  /** 半径の増加量 /秒（0で無効） */
  grow: number
  maxR: number
  /** 速度減衰 /秒（指数減衰、0で無効） */
  drag: number
  swayAmp: number
  swayFreq: number
  swayPhase: number
  age: number
  // プール内部用
  _pool: number
  _slot: number
}

export interface SpawnOpts {
  x: number
  y: number
  /** 角度 rad（vx/vy を直接指定しない場合に使う） */
  angle?: number
  /** 速さ px/s */
  speed?: number
  vx?: number
  vy?: number
  ax?: number
  ay?: number
  kind?: BulletKind
  color?: number
  customColor?: string
  r?: number
  scale?: number
  curve?: number
  spin?: number
  /** 出現してから動き出すまでの時間（その間は静止・無判定ではない） */
  delay?: number
  /** 移動開始から何秒後に凍結するか */
  freezeAt?: number
  /** 凍結している時間 */
  freezeTime?: number
  resume?: ResumeMode
  resumeSpeed?: number
  resumeGravity?: number
  grow?: number
  maxR?: number
  drag?: number
  swayAmp?: number
  swayFreq?: number
  swayPhase?: number
}

/** 弾のテンプレート（Emitter／ボレーの共通パラメータ） */
export type BulletTemplate = Omit<SpawnOpts, 'x' | 'y'>

export const DEFAULT_PALETTE = [
  '#ff5b6a', '#ff9f43', '#ffe066', '#7bed6a',
  '#4fc3f7', '#b388ff', '#ff7ad9', '#f5f5f5',
]

const KIND_DEFAULT_R: Record<BulletKind, number> = {
  orb: 4, big: 9, dot: 2.5, bubble: 6, ellipse: 4, knife: 4, talisman: 4.5, star: 4.5,
}

/** 速度方向を向いて描く弾か */
const KIND_ROTATES: Record<BulletKind, boolean> = {
  orb: false, big: false, dot: false, bubble: false,
  ellipse: true, knife: true, talisman: true, star: false,
}

function newBullet(): Bullet {
  return {
    active: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
    angle: 0, curve: 0, spin: 0, r: 4, scale: 1,
    kind: 'orb', color: 0, customColor: '', grazed: false,
    state: 0, delayLeft: 0, freezeAt: -1, freezeTime: 0, freezeLeft: 0,
    resume: 'keep', resumeSpeed: 0, resumeGravity: 320, svx: 0, svy: 0,
    grow: 0, maxR: 0, drag: 0, swayAmp: 0, swayFreq: 0, swayPhase: 0,
    age: 0, _pool: -1, _slot: -1,
  }
}

// ============================================================
// 弾プール（事前確保＋フリーリスト＋稠密アクティブ配列）
// ============================================================

export class BulletPool {
  readonly capacity: number
  readonly bullets: Bullet[] = []
  /** 有効な弾だけを詰めた配列（反復はこちらを使う） */
  readonly active: Bullet[] = []
  private freeStack: number[] = []

  constructor(capacity = 4096) {
    this.capacity = capacity
    for (let i = 0; i < capacity; i++) {
      const b = newBullet()
      b._pool = i
      this.bullets.push(b)
      this.freeStack.push(capacity - 1 - i)
    }
  }

  get count(): number {
    return this.active.length
  }

  spawn(o: SpawnOpts): Bullet | null {
    const idx = this.freeStack.pop()
    if (idx === undefined) return null
    const b = this.bullets[idx]
    b.active = true
    b.x = o.x
    b.y = o.y
    if (o.vx !== undefined || o.vy !== undefined) {
      b.vx = o.vx ?? 0
      b.vy = o.vy ?? 0
    } else {
      const a = o.angle ?? 0
      const s = o.speed ?? 0
      b.vx = Math.cos(a) * s
      b.vy = Math.sin(a) * s
    }
    b.ax = o.ax ?? 0
    b.ay = o.ay ?? 0
    b.kind = o.kind ?? 'orb'
    b.color = o.customColor ? -1 : (o.color ?? 0)
    b.customColor = o.customColor ?? ''
    b.r = o.r ?? KIND_DEFAULT_R[b.kind]
    b.scale = o.scale ?? 1
    b.curve = o.curve ?? 0
    b.spin = o.spin ?? 0
    b.angle = Math.atan2(b.vy, b.vx)
    b.grazed = false
    b.age = 0
    b.delayLeft = o.delay ?? 0
    b.state = b.delayLeft > 0 ? 1 : 0
    b.freezeAt = o.freezeAt ?? -1
    b.freezeTime = o.freezeTime ?? 0
    b.freezeLeft = 0
    b.resume = o.resume ?? 'keep'
    b.resumeSpeed = o.resumeSpeed ?? 0
    b.resumeGravity = o.resumeGravity ?? 320
    b.svx = 0
    b.svy = 0
    b.grow = o.grow ?? 0
    b.maxR = o.maxR ?? b.r
    b.drag = o.drag ?? 0
    b.swayAmp = o.swayAmp ?? 0
    b.swayFreq = o.swayFreq ?? 0
    b.swayPhase = o.swayPhase ?? 0
    b._slot = this.active.length
    this.active.push(b)
    return b
  }

  kill(b: Bullet): void {
    if (!b.active) return
    b.active = false
    const slot = b._slot
    const last = this.active[this.active.length - 1]
    this.active[slot] = last
    last._slot = slot
    this.active.pop()
    b._slot = -1
    this.freeStack.push(b._pool)
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i]
      b.active = false
      b._slot = -1
      this.freeStack.push(b._pool)
    }
    this.active.length = 0
  }
}

// ============================================================
// レーザー（予告線→本照射、線分距離で判定）
// ============================================================

export interface Laser {
  active: boolean
  x: number
  y: number
  angle: number
  baseAngle: number
  /** 一定回転 rad/s（sweep と併用可） */
  angVel: number
  /** 往復の薙ぎ払い：angle = baseAngle + sin(age*sweepSpeed + sweepPhase) * sweepAmp */
  sweepAmp: number
  sweepSpeed: number
  sweepPhase: number
  length: number
  width: number
  color: number
  customColor: string
  /** 0:予告 1:照射 2:消散 */
  state: number
  t: number
  age: number
  telegraphTime: number
  activeTime: number
  fadeTime: number
  follow: (() => { x: number; y: number }) | null
  _slot: number
}

export interface LaserOpts {
  x: number
  y: number
  angle: number
  length?: number
  width?: number
  color?: number
  customColor?: string
  /** 予告線の時間 */
  telegraph?: number
  /** 照射時間（負数で無期限。フェイズ側で kill する） */
  duration?: number
  fade?: number
  angVel?: number
  sweepAmp?: number
  sweepSpeed?: number
  sweepPhase?: number
  follow?: () => { x: number; y: number }
}

function newLaser(): Laser {
  return {
    active: false, x: 0, y: 0, angle: 0, baseAngle: 0, angVel: 0,
    sweepAmp: 0, sweepSpeed: 0, sweepPhase: 0,
    length: 600, width: 26, color: 0, customColor: '',
    state: 0, t: 0, age: 0, telegraphTime: 0.7, activeTime: -1, fadeTime: 0.25,
    follow: null, _slot: -1,
  }
}

export class LaserPool {
  readonly lasers: Laser[] = []
  readonly active: Laser[] = []

  constructor(capacity = 32) {
    for (let i = 0; i < capacity; i++) this.lasers.push(newLaser())
  }

  get count(): number {
    return this.active.length
  }

  spawn(o: LaserOpts): Laser | null {
    for (const l of this.lasers) {
      if (l.active) continue
      l.active = true
      l.x = o.x
      l.y = o.y
      l.angle = o.angle
      l.baseAngle = o.angle
      l.angVel = o.angVel ?? 0
      l.sweepAmp = o.sweepAmp ?? 0
      l.sweepSpeed = o.sweepSpeed ?? 0
      l.sweepPhase = o.sweepPhase ?? 0
      l.length = o.length ?? 640
      l.width = o.width ?? 26
      l.color = o.customColor ? -1 : (o.color ?? 0)
      l.customColor = o.customColor ?? ''
      l.telegraphTime = o.telegraph ?? 0.7
      l.activeTime = o.duration ?? -1
      l.fadeTime = o.fade ?? 0.25
      l.state = l.telegraphTime > 0 ? 0 : 1
      l.t = 0
      l.age = 0
      l.follow = o.follow ?? null
      l._slot = this.active.length
      this.active.push(l)
      return l
    }
    return null
  }

  kill(l: Laser): void {
    if (!l.active) return
    l.active = false
    const slot = l._slot
    const last = this.active[this.active.length - 1]
    this.active[slot] = last
    last._slot = slot
    this.active.pop()
    l._slot = -1
  }

  clear(): void {
    for (const l of this.active) {
      l.active = false
      l._slot = -1
    }
    this.active.length = 0
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const l = this.active[i]
      l.age += dt
      l.t += dt
      if (l.follow) {
        const p = l.follow()
        l.x = p.x
        l.y = p.y
      }
      if (l.sweepAmp > 0) {
        l.angle = l.baseAngle + Math.sin(l.age * l.sweepSpeed + l.sweepPhase) * l.sweepAmp
      } else if (l.angVel !== 0) {
        l.angle += l.angVel * dt
      }
      if (l.state === 0 && l.t >= l.telegraphTime) {
        l.state = 1
        l.t = 0
      } else if (l.state === 1 && l.activeTime >= 0 && l.t >= l.activeTime) {
        l.state = 2
        l.t = 0
      } else if (l.state === 2 && l.t >= l.fadeTime) {
        this.kill(l)
      }
    }
  }

  /** 照射中のレーザーとの当たり判定（線分距離） */
  endX(l: Laser): number {
    return l.x + Math.cos(l.angle) * l.length
  }
  endY(l: Laser): number {
    return l.y + Math.sin(l.angle) * l.length
  }
}

/** 点と線分の最短距離 */
export function distPointSegment(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = x1 + dx * t
  const cy = y1 + dy * t
  return Math.hypot(px - cx, py - cy)
}

// ============================================================
// スプライトバンク（色×形×サイズを事前描画して blit）
// ============================================================

export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement

interface SpriteEntry {
  img: HTMLCanvasElement
  /** CSSピクセルでの一辺 */
  size: number
  half: number
}

/** 判定半径 r に対する見た目の半径 */
function visualRadius(kind: BulletKind, r: number): number {
  switch (kind) {
    case 'big': return r * 1.75
    case 'dot': return r * 2.1
    case 'bubble': return r * 1.7
    case 'ellipse': return r * 2.3
    case 'knife': return r * 3.4
    case 'talisman': return r * 2.7
    case 'star': return r * 2.1
    default: return r * 1.9 // orb
  }
}

function shade(hex: string, mul: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * mul))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * mul))
  const b = Math.min(255, Math.round((n & 255) * mul))
  return `rgb(${r},${g},${b})`
}

function drawBulletSprite(
  ctx: CanvasRenderingContext2D,
  kind: BulletKind,
  color: string,
  s: number,
): void {
  const c = s / 2
  const dark = shade(color, 0.55)
  const light = shade(color, 1.35)
  ctx.clearRect(0, 0, s, s)
  if (kind === 'orb' || kind === 'big' || kind === 'dot' || kind === 'bubble') {
    const vr = s * 0.46
    const g = ctx.createRadialGradient(c - vr * 0.25, c - vr * 0.25, vr * 0.1, c, c, vr)
    if (kind === 'bubble') {
      g.addColorStop(0, 'rgba(255,255,255,0.25)')
      g.addColorStop(0.7, color + '55')
      g.addColorStop(1, color + '22')
    } else {
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.35, light)
      g.addColorStop(0.8, color)
      g.addColorStop(1, dark)
    }
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(c, c, vr, 0, Math.PI * 2)
    ctx.fill()
    if (kind === 'bubble') {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = Math.max(1, s * 0.03)
      ctx.beginPath()
      ctx.arc(c, c, vr * 0.92, Math.PI * 1.05, Math.PI * 1.55)
      ctx.stroke()
    } else if (kind === 'big') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = Math.max(1, s * 0.025)
      ctx.beginPath()
      ctx.arc(c, c, vr * 0.82, 0, Math.PI * 2)
      ctx.stroke()
    }
    return
  }
  if (kind === 'ellipse') {
    const rx = s * 0.48
    const ry = s * 0.22
    const g = ctx.createRadialGradient(c, c, 1, c, c, rx)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.4, light)
    g.addColorStop(1, dark)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(c, c, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  if (kind === 'knife') {
    // +x 方向を向く刃
    const len = s * 0.5
    const wdt = s * 0.13
    const g = ctx.createLinearGradient(c - len, c, c + len, c)
    g.addColorStop(0, dark)
    g.addColorStop(0.45, color)
    g.addColorStop(0.75, '#ffffff')
    g.addColorStop(1, light)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(c + len, c)
    ctx.lineTo(c - len * 0.55, c - wdt)
    ctx.lineTo(c - len * 0.25, c)
    ctx.lineTo(c - len * 0.55, c + wdt)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = dark
    ctx.fillRect(c - len * 0.95, c - wdt * 0.45, len * 0.4, wdt * 0.9)
    return
  }
  if (kind === 'talisman') {
    // 縦長の札（描画時に速度方向へ回す）
    const wdt = s * 0.34
    const hgt = s * 0.5
    ctx.fillStyle = '#fdf6e3'
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1.5, s * 0.045)
    ctx.beginPath()
    ctx.roundRect(c - wdt / 2, c - hgt / 2, wdt, hgt, s * 0.05)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fillRect(c - wdt * 0.16, c - hgt * 0.3, wdt * 0.32, hgt * 0.16)
    ctx.fillRect(c - wdt * 0.16, c - hgt * 0.02, wdt * 0.32, hgt * 0.09)
    ctx.fillRect(c - wdt * 0.16, c + hgt * 0.14, wdt * 0.32, hgt * 0.09)
    return
  }
  // star
  const R = s * 0.48
  const r2 = R * 0.48
  const g = ctx.createRadialGradient(c, c, 1, c, c, R)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.5, light)
  g.addColorStop(1, color)
  ctx.fillStyle = g
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r2
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const px = c + Math.cos(a) * rad
    const py = c + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

export class SpriteBank {
  private cache = new Map<string, SpriteEntry>()
  private factory: CanvasFactory | null
  readonly palette: string[]
  /** スプライトのスーパーサンプリング倍率 */
  readonly ss = 2

  constructor(palette: string[] = DEFAULT_PALETTE, factory?: CanvasFactory) {
    this.palette = palette
    if (factory) {
      this.factory = factory
    } else if (typeof document !== 'undefined') {
      this.factory = (w, h) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        return c
      }
    } else {
      this.factory = null
    }
  }

  colorOf(b: Bullet): string {
    if (b.color >= 0 && b.color < this.palette.length) return this.palette[b.color]
    return b.customColor || this.palette[0]
  }

  get(b: Bullet): SpriteEntry | null {
    if (!this.factory) return null
    const vr = visualRadius(b.kind, b.r) * b.scale
    const sizeCss = Math.max(6, Math.round(vr * 2 + 6))
    const key = `${b.kind}|${this.colorOf(b)}|${sizeCss}`
    let e = this.cache.get(key)
    if (e) return e
    const px = sizeCss * this.ss
    const img = this.factory(px, px)
    const ctx = img.getContext('2d')
    if (!ctx) return null
    ctx.scale(this.ss, this.ss)
    drawBulletSprite(ctx, b.kind, this.colorOf(b), sizeCss)
    e = { img, size: sizeCss, half: sizeCss / 2 }
    this.cache.set(key, e)
    return e
  }

  clear(): void {
    this.cache.clear()
  }
}

// ============================================================
// ボレー（一斉射撃の部品）
// ============================================================

/** 全方位リング */
export function ringVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number, o: BulletTemplate & { angle?: number },
): number {
  const base = o.angle ?? 0
  let n = 0
  for (let i = 0; i < count; i++) {
    if (w.spawn({ ...o, x, y, angle: base + (i / count) * Math.PI * 2 })) n++
  }
  return n
}

/** 扇状（中心角 center、広がり spread rad） */
export function fanVolley(
  w: DanmakuWorld, x: number, y: number,
  center: number, count: number, spread: number, o: BulletTemplate,
): number {
  let n = 0
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? center : center + (i / (count - 1) - 0.5) * spread
    if (w.spawn({ ...o, x, y, angle: a })) n++
  }
  return n
}

/** 狙い撃ち（world.target 方向へ n-way） */
export function aimedVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number, spread: number, o: BulletTemplate,
): number {
  const base = Math.atan2(w.target.y - y, w.target.x - x)
  return fanVolley(w, x, y, base, count, spread, o)
}

/** ランダム散布（角度範囲・速度範囲） */
export function scatterVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number,
  o: BulletTemplate & { angleMin?: number; angleMax?: number; speedMin?: number; speedMax?: number },
): number {
  const aMin = o.angleMin ?? 0
  const aMax = o.angleMax ?? Math.PI * 2
  const sMin = o.speedMin ?? (o.speed ?? 100) * 0.7
  const sMax = o.speedMax ?? (o.speed ?? 100) * 1.3
  let n = 0
  for (let i = 0; i < count; i++) {
    const a = aMin + w.rng() * (aMax - aMin)
    const s = sMin + w.rng() * (sMax - sMin)
    if (w.spawn({ ...o, x, y, angle: a, speed: s })) n++
  }
  return n
}

// ============================================================
// Emitter（継続射撃の部品）
// ============================================================

export abstract class Emitter {
  /** 射撃間隔（秒） */
  interval = 0.1
  /** 開始までの遅延（秒） */
  delay = 0
  /** 稼働時間（秒、負数で無期限） */
  duration = -1
  /** 弾テンプレート */
  bullet: BulletTemplate = { speed: 120 }
  elapsed = 0
  active = true
  protected timer = 0

  /** 1回の発射 */
  protected abstract fire(w: DanmakuWorld, x: number, y: number): void

  update(dt: number, w: DanmakuWorld, x: number, y: number): void {
    if (!this.active) return
    if (this.delay > 0) {
      this.delay -= dt
      return
    }
    this.elapsed += dt
    if (this.duration >= 0 && this.elapsed > this.duration) {
      this.active = false
      return
    }
    this.timer += dt
    let guard = 0
    while (this.timer >= this.interval && guard++ < 64) {
      this.timer -= this.interval
      this.fire(w, x, y)
    }
  }
}

/** 全方位リングを回転させながら撃つ */
export class RingEmitter extends Emitter {
  count = 16
  angle = 0
  /** 1射撃ごとの角度オフセット増分 rad */
  angleVel = 0
  fire(w: DanmakuWorld, x: number, y: number): void {
    ringVolley(w, x, y, this.count, { ...this.bullet, angle: this.angle })
    this.angle += this.angleVel
  }
}

/** 扇状（aim=true で自機方向を中心にする） */
export class FanEmitter extends Emitter {
  count = 5
  spread = 0.6
  angle = Math.PI / 2
  aim = false
  angleVel = 0
  fire(w: DanmakuWorld, x: number, y: number): void {
    const c = this.aim ? Math.atan2(w.target.y - y, w.target.x - x) : this.angle
    fanVolley(w, x, y, c, this.count, this.spread, this.bullet)
    this.angle += this.angleVel
  }
}

/** 狙い撃ち n-way */
export class AimedEmitter extends Emitter {
  count = 1
  spread = 0.18
  fire(w: DanmakuWorld, x: number, y: number): void {
    aimedVolley(w, x, y, this.count, this.spread, this.bullet)
  }
}

/** 多腕スパイラル（発射角が回り続ける） */
export class SpiralEmitter extends Emitter {
  arms = 2
  angle = 0
  /** 発射角の回転速度 rad/s */
  angleVel = 2.2
  /** 腕ごとの回転方向反転（渦の向きを腕で変える） */
  alternate = false
  update(dt: number, w: DanmakuWorld, x: number, y: number): void {
    this.angle += this.angleVel * dt
    super.update(dt, w, x, y)
  }
  fire(w: DanmakuWorld, x: number, y: number): void {
    for (let k = 0; k < this.arms; k++) {
      const a = this.angle + (k / this.arms) * Math.PI * 2
      w.spawn({ ...this.bullet, x, y, angle: this.alternate && k % 2 === 1 ? -a : a })
    }
  }
}

/** ランダム散布 */
export class ScatterEmitter extends Emitter {
  count = 6
  angleMin = 0
  angleMax = Math.PI * 2
  speedMin = 0
  speedMax = 0
  fire(w: DanmakuWorld, x: number, y: number): void {
    scatterVolley(w, x, y, this.count, {
      ...this.bullet,
      angleMin: this.angleMin, angleMax: this.angleMax,
      speedMin: this.speedMin || undefined, speedMax: this.speedMax || undefined,
    })
  }
}

/** 直線ストリーム（単発を一定間隔で撃ち続ける） */
export class StreamEmitter extends Emitter {
  angle = Math.PI / 2
  aim = true
  /** 交互に左右へずらす量 rad */
  zigzag = 0
  private sign = 1
  fire(w: DanmakuWorld, x: number, y: number): void {
    let a = this.aim ? Math.atan2(w.target.y - y, w.target.x - x) : this.angle
    if (this.zigzag > 0) {
      this.sign = -this.sign
      a += this.zigzag * this.sign
    }
    w.spawn({ ...this.bullet, x, y, angle: a })
  }
}

/** 波状（発射角がサインで揺れるストリーム） */
export class WaveEmitter extends Emitter {
  baseAngle = Math.PI / 2
  aim = false
  amp = 0.5
  freq = 1.6
  private t = 0
  update(dt: number, w: DanmakuWorld, x: number, y: number): void {
    this.t += dt
    super.update(dt, w, x, y)
  }
  fire(w: DanmakuWorld, x: number, y: number): void {
    const base = this.aim ? Math.atan2(w.target.y - y, w.target.x - x) : this.baseAngle
    const a = base + Math.sin(this.t * this.freq * Math.PI * 2) * this.amp
    w.spawn({ ...this.bullet, x, y, angle: a })
  }
}

/** 渦巻き（円周上の点から発射。発射点が回転する） */
export class VortexEmitter extends Emitter {
  radius = 46
  /** 発射点の回転速度 rad/s */
  rotVel = 1.8
  /** 'in' 中心方向 / 'out' 外向き / 'tangent' 接線方向 */
  mode: 'in' | 'out' | 'tangent' = 'tangent'
  angle = 0
  update(dt: number, w: DanmakuWorld, x: number, y: number): void {
    this.angle += this.rotVel * dt
    super.update(dt, w, x, y)
  }
  fire(w: DanmakuWorld, x: number, y: number): void {
    const sx = x + Math.cos(this.angle) * this.radius
    const sy = y + Math.sin(this.angle) * this.radius
    let a = this.angle
    if (this.mode === 'in') a = this.angle + Math.PI
    else if (this.mode === 'tangent') a = this.angle + Math.PI / 2
    w.spawn({ ...this.bullet, x: sx, y: sy, angle: a })
  }
}

// ============================================================
// タイムライン／スクリプト（フレーム駆動のキュー方式）
// ============================================================

export type TimelineFn = (w: DanmakuWorld) => void

interface TlEvent {
  at: number
  fn: TimelineFn
  fired: boolean
}
interface TlRepeat {
  interval: number
  next: number
  left: number
  fn: TimelineFn
}

/** 絶対時刻イベント＋繰り返しを並べる簡易タイムライン */
export class Timeline {
  t = 0
  private events: TlEvent[] = []
  private repeats: TlRepeat[] = []
  private dirty = false

  at(time: number, fn: TimelineFn): this {
    this.events.push({ at: time, fn, fired: false })
    this.dirty = true
    return this
  }

  after(delay: number, fn: TimelineFn): this {
    return this.at(this.t + delay, fn)
  }

  every(interval: number, fn: TimelineFn, count = -1): this {
    this.repeats.push({ interval, next: this.t + interval, left: count, fn })
    return this
  }

  update(dt: number, w: DanmakuWorld): void {
    this.t += dt
    if (this.dirty) {
      this.events.sort((a, b) => a.at - b.at)
      this.dirty = false
    }
    for (const e of this.events) {
      if (!e.fired && this.t >= e.at) {
        e.fired = true
        e.fn(w)
      }
    }
    for (const r of this.repeats) {
      while (this.t >= r.next) {
        r.next += r.interval
        r.fn(w)
        if (r.left > 0) {
          r.left--
          if (r.left === 0) break
        }
      }
    }
    if (this.repeats.some((r) => r.left === 0)) {
      this.repeats = this.repeats.filter((r) => r.left !== 0)
    }
  }

  clear(): void {
    this.events.length = 0
    this.repeats.length = 0
    this.t = 0
  }

  get pending(): number {
    return this.events.filter((e) => !e.fired).length + this.repeats.length
  }
}

/** 順次ステップ（wait / do）を実行するスクリプトランナー */
export type ScriptStep =
  | { wait: number }
  | { do: TimelineFn }

export class ScriptRunner {
  private idx = 0
  private waitLeft = 0
  finished = false

  constructor(private steps: ScriptStep[]) {}

  reset(): void {
    this.idx = 0
    this.waitLeft = 0
    this.finished = false
  }

  update(dt: number, w: DanmakuWorld): void {
    if (this.finished) return
    let guard = 0
    while (guard++ < 256) {
      const step = this.steps[this.idx]
      if (!step) {
        this.finished = true
        return
      }
      if ('do' in step) {
        step.do(w)
        this.idx++
        continue
      }
      // wait
      if (this.waitLeft <= 0) this.waitLeft = step.wait
      this.waitLeft -= dt
      if (this.waitLeft > 0) return
      dt = -this.waitLeft
      this.waitLeft = 0
      this.idx++
    }
  }
}

// ============================================================
// ワールド（弾・レーザー・Emitter・タイムラインの統合）
// ============================================================

export interface EmitterEntry {
  emitter: Emitter
  getPos: (() => { x: number; y: number }) | null
  x: number
  y: number
  dead: boolean
}

export interface WorldOpts {
  width: number
  height: number
  bulletCap?: number
  laserCap?: number
  /** 画面外カリングの余白 px */
  margin?: number
  palette?: string[]
}

export interface CollideResult {
  hit: boolean
  grazed: number
}

export class DanmakuWorld {
  readonly width: number
  readonly height: number
  readonly margin: number
  readonly pool: BulletPool
  readonly lasers: LaserPool
  readonly timeline = new Timeline()
  readonly sprites: SpriteBank
  /** 狙い撃ち・再始動aimの基準点（=自機位置を毎フレーム入れる） */
  readonly target = { x: 0, y: 0 }
  rng: () => number = Math.random
  time = 0
  private emitterEntries: EmitterEntry[] = []

  constructor(opts: WorldOpts) {
    this.width = opts.width
    this.height = opts.height
    this.margin = opts.margin ?? 40
    this.pool = new BulletPool(opts.bulletCap ?? 4096)
    this.lasers = new LaserPool(opts.laserCap ?? 32)
    this.sprites = new SpriteBank(opts.palette ?? DEFAULT_PALETTE)
  }

  get bulletCount(): number {
    return this.pool.count
  }
  get laserCount(): number {
    return this.lasers.count
  }
  get emitterCount(): number {
    return this.emitterEntries.length
  }

  spawn(o: SpawnOpts): Bullet | null {
    return this.pool.spawn(o)
  }

  addLaser(o: LaserOpts): Laser | null {
    return this.lasers.spawn(o)
  }

  addEmitter(
    e: Emitter,
    pos?: { x: number; y: number } | (() => { x: number; y: number }),
  ): EmitterEntry {
    const entry: EmitterEntry = {
      emitter: e,
      getPos: typeof pos === 'function' ? pos : null,
      x: pos && typeof pos !== 'function' ? pos.x : 0,
      y: pos && typeof pos !== 'function' ? pos.y : 0,
      dead: false,
    }
    this.emitterEntries.push(entry)
    return entry
  }

  removeEmitter(entry: EmitterEntry): void {
    entry.dead = true
  }

  clearEmitters(): void {
    for (const e of this.emitterEntries) e.dead = true
  }

  /** 全弾消去。convert を渡すと消去前に弾ごとに呼ばれる（得点化など） */
  clearBullets(convert?: (b: Bullet) => void): void {
    if (convert) {
      for (const b of this.pool.active) convert(b)
    }
    this.pool.clear()
  }

  clearLasers(): void {
    this.lasers.clear()
  }

  private resumeBullet(b: Bullet): void {
    switch (b.resume) {
      case 'aim': {
        const sp = b.resumeSpeed > 0 ? b.resumeSpeed : Math.hypot(b.svx, b.svy)
        const a = Math.atan2(this.target.y - b.y, this.target.x - b.x)
        b.vx = Math.cos(a) * sp
        b.vy = Math.sin(a) * sp
        break
      }
      case 'speed': {
        const sp = Math.hypot(b.svx, b.svy)
        if (sp > 0) {
          b.vx = (b.svx / sp) * b.resumeSpeed
          b.vy = (b.svy / sp) * b.resumeSpeed
        }
        break
      }
      case 'fall': {
        b.vx = 0
        b.vy = 0
        b.ax = 0
        b.ay = b.resumeGravity
        break
      }
      default: { // keep
        b.vx = b.svx
        b.vy = b.svy
      }
    }
    b.state = 0
    b.freezeAt = -1
  }

  private updateBullet(b: Bullet, dt: number): void {
    b.age += dt
    // --- 凍結ステートマシン ---
    if (b.state === 1) {
      b.delayLeft -= dt
      if (b.delayLeft > 0) return
      b.state = 0
    } else if (b.state === 2) {
      b.freezeLeft -= dt
      if (b.freezeLeft > 0) return
      this.resumeBullet(b)
    } else if (b.freezeAt >= 0) {
      b.freezeAt -= dt
      if (b.freezeAt <= 0) {
        b.svx = b.vx
        b.svy = b.vy
        b.vx = 0
        b.vy = 0
        b.state = 2
        b.freezeLeft = b.freezeTime
        return
      }
    }
    // --- 運動 ---
    if (b.ax !== 0 || b.ay !== 0) {
      b.vx += b.ax * dt
      b.vy += b.ay * dt
    }
    if (b.drag > 0) {
      const f = Math.exp(-b.drag * dt)
      b.vx *= f
      b.vy *= f
    }
    if (b.curve !== 0) {
      const sp = Math.hypot(b.vx, b.vy)
      if (sp > 0.001) {
        const a = Math.atan2(b.vy, b.vx) + b.curve * dt
        b.vx = Math.cos(a) * sp
        b.vy = Math.sin(a) * sp
      }
    }
    let mx = b.vx
    let my = b.vy
    if (b.swayAmp > 0) {
      const va = Math.atan2(b.vy, b.vx)
      const sway = Math.cos(b.age * b.swayFreq + b.swayPhase) * b.swayAmp * b.swayFreq
      mx += -Math.sin(va) * sway
      my += Math.cos(va) * sway
    }
    b.x += mx * dt
    b.y += my * dt
    if (b.grow > 0 && b.r < b.maxR) {
      b.r = Math.min(b.maxR, b.r + b.grow * dt)
    }
    // --- 描画角度 ---
    if (KIND_ROTATES[b.kind]) {
      if (b.vx !== 0 || b.vy !== 0) b.angle = Math.atan2(b.vy, b.vx)
    } else if (b.spin !== 0) {
      b.angle += b.spin * dt
    }
  }

  update(dt: number): void {
    this.time += dt
    this.timeline.update(dt, this)
    // Emitter
    for (const entry of this.emitterEntries) {
      if (entry.dead) continue
      if (entry.getPos) {
        const p = entry.getPos()
        entry.x = p.x
        entry.y = p.y
      }
      entry.emitter.update(dt, this, entry.x, entry.y)
      if (!entry.emitter.active) entry.dead = true
    }
    if (this.emitterEntries.some((e) => e.dead)) {
      this.emitterEntries = this.emitterEntries.filter((e) => !e.dead)
    }
    // 弾
    const m = this.margin
    const act = this.pool.active
    for (let i = act.length - 1; i >= 0; i--) {
      const b = act[i]
      this.updateBullet(b, dt)
      const mm = m + b.r
      if (b.x < -mm || b.x > this.width + mm || b.y < -mm || b.y > this.height + mm) {
        this.pool.kill(b)
      }
    }
    // レーザー
    this.lasers.update(dt)
  }

  /**
   * 自機判定点との当たり判定＋グレイズ。
   * hit した弾は消去される。onGraze/onHit は任意コールバック。
   */
  collide(
    px: number, py: number, hitR: number, grazeR: number,
    onGraze?: (b: Bullet) => void,
    onHit?: (b: Bullet) => void,
  ): CollideResult {
    const res: CollideResult = { hit: false, grazed: 0 }
    const graze2 = grazeR * grazeR
    const act = this.pool.active
    for (let i = act.length - 1; i >= 0; i--) {
      const b = act[i]
      const dx = b.x - px
      const dy = b.y - py
      const d2 = dx * dx + dy * dy
      const hr = b.r + hitR
      if (d2 < hr * hr) {
        this.pool.kill(b)
        res.hit = true
        if (onHit) onHit(b)
        break
      }
      if (!b.grazed && d2 < graze2) {
        b.grazed = true
        res.grazed++
        if (onGraze) onGraze(b)
      }
    }
    return res
  }

  /** 照射中レーザーとの当たり判定 */
  collideLasers(px: number, py: number, hitR: number): boolean {
    for (const l of this.lasers.active) {
      if (l.state !== 1) continue
      const d = distPointSegment(px, py, l.x, l.y, this.lasers.endX(l), this.lasers.endY(l))
      if (d < l.width / 2 + hitR) return true
    }
    return false
  }

  // ==========================================================
  // 描画
  // ==========================================================

  render(ctx: CanvasRenderingContext2D, bank: SpriteBank = this.sprites): void {
    this.renderLaserLayer(ctx, bank, true)
    // 弾
    for (const b of this.pool.active) {
      const spr = bank.get(b)
      if (!spr) {
        ctx.fillStyle = bank.colorOf(b)
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r * 1.6, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      if (KIND_ROTATES[b.kind] || b.kind === 'star') {
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(b.angle)
        ctx.drawImage(spr.img, -spr.half, -spr.half, spr.size, spr.size)
        ctx.restore()
      } else {
        ctx.drawImage(spr.img, b.x - spr.half, b.y - spr.half, spr.size, spr.size)
      }
    }
    this.renderLaserLayer(ctx, bank, false)
  }

  private renderLaserLayer(
    ctx: CanvasRenderingContext2D, bank: SpriteBank, telegraph: boolean,
  ): void {
    for (const l of this.lasers.active) {
      const color = l.color >= 0 && l.color < bank.palette.length
        ? bank.palette[l.color]
        : (l.customColor || bank.palette[0])
      const ex = this.lasers.endX(l)
      const ey = this.lasers.endY(l)
      if (telegraph) {
        if (l.state !== 0) continue
        const blink = 0.25 + 0.2 * Math.sin(l.age * 18)
        ctx.strokeStyle = color
        ctx.globalAlpha = blink
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(l.x, l.y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.globalAlpha = 1
        continue
      }
      if (l.state === 0) continue
      let alpha = 1
      if (l.state === 2) alpha = Math.max(0, 1 - l.t / Math.max(0.01, l.fadeTime))
      ctx.lineCap = 'round'
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.22 * alpha
      ctx.lineWidth = l.width
      ctx.beginPath()
      ctx.moveTo(l.x, l.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.globalAlpha = 0.5 * alpha
      ctx.lineWidth = l.width * 0.55
      ctx.beginPath()
      ctx.moveTo(l.x, l.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.globalAlpha = 0.9 * alpha
      ctx.lineWidth = l.width * 0.26
      ctx.beginPath()
      ctx.moveTo(l.x, l.y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }
}

// ============================================================
// FPS計測＋固定タイムステップループ
// ============================================================

export class FpsMeter {
  /** 直近の実測fps（0.5秒窓） */
  fps = 0
  /** フレーム時間の指数移動平均 ms */
  frameMs = 16.7
  private frames = 0
  private accMs = 0

  sample(dtMs: number): void {
    this.frames++
    this.accMs += dtMs
    this.frameMs += (dtMs - this.frameMs) * 0.05
    if (this.accMs >= 500) {
      this.fps = Math.round((this.frames * 1000) / this.accMs)
      this.frames = 0
      this.accMs = 0
    }
  }
}

export interface FixedLoopOpts {
  /** 論理ステップ秒（既定 1/60） */
  step?: number
  /** 1フレームで進める実時間の上限（秒） */
  maxFrame?: number
  /** 1フレームの最大ステップ数（スパイラル防止） */
  maxSteps?: number
  update: (dt: number) => void
  render?: (alpha: number) => void
}

export class FixedLoop {
  readonly meter = new FpsMeter()
  private readonly step: number
  private readonly maxFrame: number
  private readonly maxSteps: number
  private readonly updateFn: (dt: number) => void
  private readonly renderFn?: (alpha: number) => void
  private acc = 0
  private last = -1
  /** 直近フレームで実行したステップ数 */
  lastSteps = 0

  constructor(opts: FixedLoopOpts) {
    this.step = opts.step ?? 1 / 60
    this.maxFrame = opts.maxFrame ?? 0.25
    this.maxSteps = opts.maxSteps ?? 5
    this.updateFn = opts.update
    this.renderFn = opts.render
  }

  get fps(): number {
    return this.meter.fps
  }
  get frameMs(): number {
    return this.meter.frameMs
  }

  reset(): void {
    this.acc = 0
    this.last = -1
  }

  /** requestAnimationFrame の timestamp を渡して駆動する */
  frame(nowMs: number): void {
    if (this.last < 0) {
      this.last = nowMs
      if (this.renderFn) this.renderFn(0)
      return
    }
    let dt = (nowMs - this.last) / 1000
    this.last = nowMs
    if (dt < 0) dt = 0
    this.meter.sample(dt * 1000)
    if (dt > this.maxFrame) dt = this.maxFrame
    this.acc += dt
    let steps = 0
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.updateFn(this.step)
      this.acc -= this.step
      steps++
    }
    if (steps >= this.maxSteps && this.acc >= this.step) {
      this.acc = 0 // 遅延の累積を捨ててスパイラルを防ぐ
    }
    this.lastSteps = steps
    if (this.renderFn) this.renderFn(this.acc / this.step)
  }
}
