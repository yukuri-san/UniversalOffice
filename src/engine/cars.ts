import * as THREE from 'three'

/**
 * WebX ゲームエンジン：車両
 * 車種スペック（変速比・最終減速比・レッドライン等）と、
 * プロシージャル生成の詳細 3D モデル、変速機つき縦方向物理（Vehicle）を提供する。
 * モデルは実車の「雰囲気」を再現するもので、実在の商標・ロゴは使わない。
 */

export interface CarSpec {
  id: string
  name: string
  sub: string
  gears: number[]
  finalDrive: number
  redline: number
  idle: number
  tireCirc: number
  accelBase: number
  vmax: number
  grip: number
  driftiness: number
  powerPs: number
  weightKg: number
  drive: string
}

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'hachiroku', name: 'ハチロク', sub: 'AE86風 2ドアクーペ（FR）',
    gears: [3.587, 2.022, 1.384, 1.0, 0.861], finalDrive: 4.3,
    redline: 7500, idle: 900, tireCirc: 1.9,
    accelBase: 8.2, vmax: 47, grip: 0.92, driftiness: 1.25,
    powerPs: 130, weightKg: 940, drive: 'FR',
  },
  {
    id: 'gtr34', name: 'GT-R 34', sub: 'R34風 2ドアクーペ（AWD）',
    gears: [3.827, 2.36, 1.685, 1.312, 1.0, 0.793], finalDrive: 3.545,
    redline: 8000, idle: 950, tireCirc: 2.0,
    accelBase: 10.4, vmax: 69, grip: 1.12, driftiness: 0.8,
    powerPs: 280, weightKg: 1560, drive: 'AWD',
  },
]

export type GearState = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 // -1:R, 0:N
export type TransMode = 'MT' | 'AT'

/** 変速機つき縦方向物理。横方向（ドリフト等）はゲーム側で扱う。 */
export class Vehicle {
  spec: CarSpec
  mode: TransMode = 'AT'
  gear: GearState = 0
  speed = 0 // m/s（符号つき）
  rpm: number
  private shiftTimer = 0
  private atReverse = false
  private prevBrake = false
  private dragK: number

  constructor(spec: CarSpec) {
    this.spec = spec
    this.rpm = spec.idle
    const topRatio = spec.gears[spec.gears.length - 1] * spec.finalDrive
    const firstRatio = spec.gears[0] * spec.finalDrive
    const aTop = spec.accelBase * Math.pow(topRatio / firstRatio, 0.72) * 1.08
    this.dragK = aTop / (spec.vmax * spec.vmax)
  }

  get topGear(): number { return this.spec.gears.length }
  get gearLabel(): string {
    if (this.mode === 'AT') return this.atReverse ? 'R' : this.gear === 0 ? 'N' : 'D'
    return this.gear === -1 ? 'R' : this.gear === 0 ? 'N' : String(this.gear)
  }
  get atGearNum(): number { return Math.max(1, this.gear) }

  private ratioOf(g: GearState): number {
    if (g === -1) return this.spec.gears[0] * 1.02
    if (g === 0) return 0
    return this.spec.gears[g - 1]
  }

  private torqueCurve(rpm: number): number {
    const x = rpm / this.spec.redline
    if (x >= 1) return 0
    const bump = 0.72 + 0.5 * Math.exp(-Math.pow(x - 0.66, 2) / (2 * 0.19 * 0.19))
    return Math.min(1.12, bump * Math.min(1, 0.45 + x * 0.95))
  }

  shiftUp() {
    if (this.mode !== 'MT' || this.shiftTimer > 0) return
    if (this.gear < this.topGear) { this.gear = (this.gear + 1) as GearState; this.shiftTimer = 0.13 }
  }
  shiftDown() {
    if (this.mode !== 'MT' || this.shiftTimer > 0) return
    if (this.gear > 1) { this.gear = (this.gear - 1) as GearState; this.shiftTimer = 0.13 }
    else if (this.gear === 1) { this.gear = 0; this.shiftTimer = 0.1 }
    else if (this.gear === 0 && Math.abs(this.speed) < 1.5) { this.gear = -1; this.shiftTimer = 0.1 }
    else if (this.gear === -1) { this.gear = 0; this.shiftTimer = 0.1 }
  }
  toNeutral() {
    if (this.mode === 'MT') this.gear = 0
  }
  setMode(mode: TransMode) {
    this.mode = mode
    if (mode === 'AT') { this.atReverse = false; if (this.gear < 1) this.gear = 1 }
    if (mode === 'MT' && this.gear < 0) this.gear = 0
  }

  /** dt 秒進める。grade は路面勾配（tan.y 相当、上りが正） */
  update(dt: number, throttle: boolean, brake: boolean, grade: number) {
    const sp = this.spec
    if (this.shiftTimer > 0) this.shiftTimer -= dt
    const wheelRpm = (Math.abs(this.speed) / sp.tireCirc) * 60

    if (this.mode === 'AT') {
      // 停止中にブレーキを踏み直すと R / D を切り替える
      if (Math.abs(this.speed) < 0.25 && brake && !this.prevBrake) this.atReverse = !this.atReverse
      if (this.atReverse) {
        this.gear = -1
      } else {
        if (this.gear < 1) this.gear = 1
        const cur = this.ratioOf(this.gear) * sp.finalDrive
        const rpmNow = wheelRpm * cur
        if (this.gear < this.topGear && rpmNow > sp.redline * (throttle ? 0.88 : 0.7) && this.shiftTimer <= 0) {
          this.gear = (this.gear + 1) as GearState
          this.shiftTimer = 0.22
        } else if (this.gear > 1 && rpmNow < 2100 && this.shiftTimer <= 0) {
          this.gear = (this.gear - 1) as GearState
          this.shiftTimer = 0.22
        }
      }
    }
    this.prevBrake = brake

    const ratio = this.ratioOf(this.gear) * sp.finalDrive
    let drive = 0
    if (this.gear === 0 || ratio === 0) {
      // ニュートラル：吹け上がりだけ
      const target = sp.idle + (throttle ? (sp.redline - sp.idle) * 0.94 : 0)
      this.rpm += (target - this.rpm) * Math.min(1, dt * (throttle ? 5.5 : 3.2))
    } else {
      const rpmFromSpeed = wheelRpm * ratio
      this.rpm = Math.max(sp.idle, Math.min(sp.redline + 350, rpmFromSpeed))
      if (this.shiftTimer <= 0 && throttle) {
        const dir = this.gear === -1 ? -1 : 1
        const alongSpeed = this.speed * dir
        const clutch = alongSpeed < 3.2 ? Math.max(0.3, Math.abs(this.speed) / 3.2) : 1
        const firstRatio = sp.gears[0] * sp.finalDrive
        const gearFactor = Math.pow(ratio / firstRatio, 0.72)
        const atFactor = this.mode === 'AT' ? 0.94 : 1
        drive = sp.accelBase * gearFactor * this.torqueCurve(Math.max(this.rpm, sp.idle + 600)) * atFactor * clutch
        if (dir === -1) drive = -drive * 0.55
      }
    }

    let acc = drive
    acc -= this.dragK * this.speed * Math.abs(this.speed)
    acc -= 0.32 * Math.sign(this.speed)
    acc -= grade * 6.8
    if (brake && this.gear !== -1) acc -= Math.sign(this.speed) * (Math.abs(this.speed) > 0.3 ? 9.5 : 0)
    if (brake && this.gear === -1 && this.speed < -0.3) acc += 9.5
    if (!throttle && this.gear !== 0) acc -= Math.sign(this.speed) * 0.55 // エンジンブレーキ
    this.speed += acc * dt
    if (!throttle && !brake && Math.abs(this.speed) < 0.12 && Math.abs(grade) < 0.05) this.speed = 0
    if (this.gear >= 1 && this.speed < 0) this.speed = Math.max(this.speed, brake ? -0.001 : 0)
    if (this.gear === -1 && this.speed > 0) this.speed = Math.min(this.speed, 0)
    this.speed = Math.max(-9, Math.min(sp.vmax + 6, this.speed))
  }
}

// ---------- 3D モデル ----------

export interface BuiltCar {
  group: THREE.Group
  spins: THREE.Object3D[]
  frontPivots: THREE.Object3D[]
  brakeLightMat: THREE.MeshStandardMaterial
  paintMat: THREE.MeshPhysicalMaterial
}

function paint(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.15 })
}
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0x0d1622, metalness: 0.3, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.4 })
const matteBlack = () => new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.85, metalness: 0.1 })
const chrome = () => new THREE.MeshStandardMaterial({ color: 0xd7dce2, roughness: 0.25, metalness: 0.95 })

function box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  if (rx) m.rotation.x = rx
  return m
}

function makeWheel(x: number, z: number, front: boolean, tireR: number, hubColor: number, spins: THREE.Object3D[], pivots: THREE.Object3D[]): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(x, tireR, z)
  const spin = new THREE.Group()
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(tireR, tireR, 0.24, 18), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95 }))
  tire.rotation.z = Math.PI / 2
  spin.add(tire)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(tireR * 0.58, tireR * 0.58, 0.25, 6), new THREE.MeshStandardMaterial({ color: hubColor, metalness: 0.75, roughness: 0.35 }))
  hub.rotation.z = Math.PI / 2
  spin.add(hub)
  pivot.add(spin)
  spins.push(spin)
  if (front) pivots.push(pivot)
  return pivot
}

function baseLights(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x550a0e, emissive: 0xff1a26, emissiveIntensity: 0.7 })
}

/** ハチロク風：白黒ツートンの角ばったハッチバッククーペ */
export function buildHachiroku(): BuiltCar {
  const g = new THREE.Group()
  const spins: THREE.Object3D[] = []
  const pivots: THREE.Object3D[] = []
  const paintMat = paint(0xf2f3f0)
  const black = matteBlack()
  const glass = glassMat()
  // 下部ボディ（黒の腰下ツートン）
  g.add(box(black, 1.78, 0.34, 4.4, 0, 0.38, 0))
  g.add(box(paintMat, 1.76, 0.4, 4.38, 0, 0.72, 0))
  // ボンネット（わずかに傾斜）とノーズ
  g.add(box(paintMat, 1.7, 0.16, 1.35, 0, 0.95, 1.45, -0.045))
  g.add(box(black, 1.8, 0.3, 0.35, 0, 0.42, 2.18)) // フロントバンパー
  g.add(box(black, 1.8, 0.32, 0.3, 0, 0.44, -2.2)) // リアバンパー
  // リトラクタブルライト（閉）＋ウインカー帯
  for (const sx of [-0.52, 0.52]) g.add(box(paintMat, 0.5, 0.07, 0.42, sx, 1.0, 1.98))
  const blinker = new THREE.MeshStandardMaterial({ color: 0x3a2403, emissive: 0xff9a1f, emissiveIntensity: 0.9 })
  g.add(box(blinker, 1.5, 0.09, 0.05, 0, 0.6, 2.36))
  // キャビン（ハッチバック：後部は寝たガラス）
  g.add(box(glass, 1.58, 0.52, 1.15, 0, 1.18, 0.28, 0.1))
  g.add(box(glass, 1.58, 0.55, 1.25, 0, 1.16, -0.95, -0.42))
  g.add(box(paintMat, 1.62, 0.07, 1.5, 0, 1.47, -0.3))
  for (const sx of [-0.78, 0.78]) {
    g.add(box(paintMat, 0.07, 0.5, 0.12, sx, 1.2, 0.82)) // Aピラー
    g.add(box(paintMat, 0.07, 0.52, 0.12, sx, 1.2, -0.42)) // Bピラー
  }
  for (const sx of [-0.9, 0.9]) g.add(box(black, 0.04, 0.1, 3.4, sx, 0.8, 0)) // サイドの黒帯
  // ハッチスポイラー
  g.add(box(black, 1.66, 0.06, 0.4, 0, 1.32, -1.72, -0.35))
  // テールランプ帯
  const brakeMat = baseLights()
  g.add(box(brakeMat, 1.56, 0.16, 0.05, 0, 0.78, -2.36))
  // ナンバープレート
  const plate = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 })
  g.add(box(plate, 0.44, 0.22, 0.03, 0, 0.52, 2.37))
  g.add(box(plate, 0.44, 0.22, 0.03, 0, 0.55, -2.37))
  // ミラー
  for (const sx of [-0.95, 0.95]) {
    g.add(box(black, 0.06, 0.06, 0.06, sx, 1.22, 0.8))
    g.add(box(black, 0.16, 0.11, 0.05, sx * 1.06, 1.26, 0.8))
  }
  // マフラー
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 10), chrome())
  ex.rotation.x = Math.PI / 2
  ex.position.set(0.55, 0.3, -2.3)
  g.add(ex)
  for (const [x, z, f] of [[-0.86, 1.42, true], [0.86, 1.42, true], [-0.86, -1.42, false], [0.86, -1.42, false]] as const) {
    g.add(makeWheel(x, z, f, 0.33, 0x8b9096, spins, pivots))
  }
  return { group: g, spins, frontPivots: pivots, brakeLightMat: brakeMat, paintMat }
}

/** R34 風：筋肉質クーペ、4連丸テール、大型 GT ウイング */
export function buildGTR(): BuiltCar {
  const g = new THREE.Group()
  const spins: THREE.Object3D[] = []
  const pivots: THREE.Object3D[] = []
  const paintMat = paint(0x1d4f9e)
  const black = matteBlack()
  const glass = glassMat()
  g.add(box(paintMat, 1.88, 0.5, 4.55, 0, 0.55, 0))
  g.add(box(paintMat, 1.8, 0.2, 1.5, 0, 0.88, 1.5, -0.03)) // ボンネット
  for (const sx of [-0.45, 0.45]) g.add(box(black, 0.34, 0.04, 0.5, sx, 1.0, 1.7)) // ボンネットベント
  // フェンダー
  for (const sx of [-0.95, 0.95]) {
    g.add(box(paintMat, 0.14, 0.34, 1.05, sx, 0.62, 1.42))
    g.add(box(paintMat, 0.14, 0.34, 1.05, sx, 0.62, -1.42))
    g.add(box(black, 0.05, 0.16, 2.2, sx * 1.02, 0.3, 0)) // サイドスカート
  }
  // フロントバンパー＋インテーク
  g.add(box(paintMat, 1.9, 0.42, 0.4, 0, 0.42, 2.28))
  g.add(box(black, 1.1, 0.22, 0.06, 0, 0.4, 2.49))
  g.add(box(black, 0.5, 0.16, 0.06, 0, 0.68, 2.49))
  // ヘッドライト（角型2灯ずつ）
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe9f5, emissive: 0xf4faff, emissiveIntensity: 1.6 })
  for (const sx of [-0.58, 0.58]) {
    g.add(box(headMat, 0.52, 0.16, 0.06, sx, 0.78, 2.47))
  }
  // キャビン
  g.add(box(glass, 1.66, 0.5, 1.35, 0, 1.12, 0.42, 0.16))
  g.add(box(glass, 1.66, 0.48, 1.1, 0, 1.12, -0.85, -0.3))
  g.add(box(paintMat, 1.7, 0.07, 1.35, 0, 1.4, -0.2))
  for (const sx of [-0.84, 0.84]) {
    g.add(box(paintMat, 0.07, 0.48, 0.12, sx, 1.14, 0.95))
    g.add(box(paintMat, 0.07, 0.5, 0.12, sx, 1.14, -0.3))
  }
  // GT ウイング
  for (const sx of [-0.62, 0.62]) g.add(box(black, 0.09, 0.42, 0.16, sx, 1.2, -2.05))
  g.add(box(paintMat, 1.95, 0.06, 0.48, 0, 1.45, -2.08, 0.06))
  // リアパネル＋4連丸テール
  g.add(box(black, 1.84, 0.44, 0.18, 0, 0.72, -2.3))
  const brakeMat = baseLights()
  for (const sx of [-0.62, -0.3, 0.3, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 16), brakeMat)
    lamp.rotation.x = Math.PI / 2
    lamp.position.set(sx, 0.78, -2.4)
    g.add(lamp)
  }
  const plate = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 })
  g.add(box(plate, 0.44, 0.22, 0.03, 0, 0.48, -2.41))
  for (const sx of [-1.0, 1.0]) {
    g.add(box(black, 0.06, 0.06, 0.06, sx, 1.18, 0.9))
    g.add(box(paintMat, 0.17, 0.11, 0.05, sx * 1.05, 1.22, 0.9))
  }
  // デュアルマフラー
  for (const sx of [-0.5, -0.28]) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.32, 10), chrome())
    ex.rotation.x = Math.PI / 2
    ex.position.set(sx, 0.28, -2.42)
    g.add(ex)
  }
  for (const [x, z, f] of [[-0.9, 1.45, true], [0.9, 1.45, true], [-0.9, -1.45, false], [0.9, -1.45, false]] as const) {
    g.add(makeWheel(x, z, f, 0.35, 0x6e6250, spins, pivots))
  }
  return { group: g, spins, frontPivots: pivots, brakeLightMat: brakeMat, paintMat }
}

/** 交通車両用の簡易モデル */
export function buildTrafficCar(color: number): BuiltCar {
  const g = new THREE.Group()
  const spins: THREE.Object3D[] = []
  const pivots: THREE.Object3D[] = []
  const paintMat = paint(color)
  const glass = glassMat()
  g.add(box(paintMat, 1.8, 0.55, 4.3, 0, 0.55, 0))
  g.add(box(glass, 1.6, 0.5, 2.0, 0, 1.05, -0.2))
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe9f5, emissive: 0xf4faff, emissiveIntensity: 1.4 })
  for (const sx of [-0.55, 0.55]) g.add(box(headMat, 0.44, 0.13, 0.05, sx, 0.66, 2.16))
  const brakeMat = baseLights()
  g.add(box(brakeMat, 1.5, 0.13, 0.05, 0, 0.7, -2.16))
  for (const [x, z, f] of [[-0.86, 1.4, true], [0.86, 1.4, true], [-0.86, -1.4, false], [0.86, -1.4, false]] as const) {
    g.add(makeWheel(x, z, f, 0.34, 0x777777, spins, pivots))
  }
  return { group: g, spins, frontPivots: pivots, brakeLightMat: brakeMat, paintMat }
}
