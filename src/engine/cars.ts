// WebX エンジン：車種スペック・変速機つき縦方向物理・詳細車両モデル
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

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
  power: string
  drive: string
}

export const CAR_SPECS: CarSpec[] = [
  {
    id: 'hachiroku', name: 'ハチロク', sub: 'AE86風・FR',
    gears: [3.587, 2.022, 1.384, 1.0, 0.861], finalDrive: 4.3,
    redline: 7500, idle: 900, tireCirc: 1.9,
    accelBase: 9.8, vmax: 47, grip: 0.92, driftiness: 1.3,
    power: '130ps / 940kg', drive: '5速 FR',
  },
  {
    id: 'gtr34', name: 'GT-R 34', sub: 'R34風・AWD',
    gears: [3.827, 2.36, 1.685, 1.312, 1.0, 0.793], finalDrive: 3.545,
    redline: 8000, idle: 950, tireCirc: 2.0,
    accelBase: 12.6, vmax: 69, grip: 1.14, driftiness: 0.8,
    power: '280ps / 1560kg', drive: '6速 AWD',
  },
]

export type GearState = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6
export type TransMode = 'MT' | 'AT'

// 縦方向の駆動モデル（ギア・回転数・トルクカーブ・変速機）
export class Vehicle {
  spec: CarSpec
  speed = 0
  rpm: number
  gear: GearState = 0
  mode: TransMode = 'AT'
  private shiftTimer = 0
  private atReverse = false
  private prevBrake = false

  constructor(spec: CarSpec) {
    this.spec = spec
    this.rpm = spec.idle
  }
  get topGear(): number { return this.spec.gears.length }
  get gearLabel(): string {
    if (this.mode === 'AT') {
      if (this.gear === -1) return 'R'
      if (this.gear === 0) return 'N'
      return 'D'
    }
    return this.gear === -1 ? 'R' : this.gear === 0 ? 'N' : String(this.gear)
  }
  get atGearNum(): number { return Math.max(1, this.gear) }
  setMode(mode: TransMode) {
    this.mode = mode
    if (mode === 'AT') { this.atReverse = false; if (this.gear < 1) this.gear = 1 }
  }
  toggleMode(): TransMode {
    this.setMode(this.mode === 'MT' ? 'AT' : 'MT')
    return this.mode
  }
  shiftUp() {
    if (this.mode !== 'MT' || this.shiftTimer > 0) return
    if (this.gear < this.topGear) { this.gear = (this.gear + 1) as GearState; this.shiftTimer = 0.13 }
  }
  shiftDown() {
    if (this.mode !== 'MT' || this.shiftTimer > 0) return
    if (this.gear > 1) { this.gear = (this.gear - 1) as GearState; this.shiftTimer = 0.13 }
    else if (this.gear === 1) { this.gear = 0; this.shiftTimer = 0.13 }
    else if (this.gear === 0 && Math.abs(this.speed) < 1.5) { this.gear = -1; this.shiftTimer = 0.13 }
    else if (this.gear === -1) { this.gear = 0; this.shiftTimer = 0.13 }
  }
  toNeutral() {
    if (this.mode === 'MT') this.gear = 0
  }
  private ratioOf(g: GearState): number {
    if (g === -1) return this.spec.gears[0] * 0.92
    if (g === 0) return 0
    return this.spec.gears[g - 1]
  }
  private torqueCurve(rpm: number): number {
    const x = rpm / this.spec.redline
    if (x < 0.66) return 0.62 + 0.38 * Math.sin((x / 0.66) * Math.PI * 0.5)
    return Math.max(0.55, 1 - (x - 0.66) * 0.9)
  }
  update(dt: number, throttle: boolean, brake: boolean, grade: number) {
    const sp = this.spec
    this.shiftTimer = Math.max(0, this.shiftTimer - dt)
    const wheelRpm = (this.speed / sp.tireCirc) * 60 / (2 * Math.PI)

    if (this.mode === 'AT') {
      if (Math.abs(this.speed) < 0.4 && brake && !this.prevBrake) this.atReverse = !this.atReverse
      if (this.atReverse) {
        this.gear = -1
      } else {
        if (this.gear < 1) this.gear = 1
        const cur = this.ratioOf(this.gear) * sp.finalDrive
        const rpmNow = wheelRpm * cur
        if (this.gear < this.topGear && rpmNow > sp.redline * (throttle ? 0.9 : 0.72) && this.shiftTimer <= 0) {
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
      const target = sp.idle + (throttle ? (sp.redline - sp.idle) * 0.94 : 0)
      this.rpm += (target - this.rpm) * Math.min(1, dt * (throttle ? 5.5 : 3.2))
    } else {
      const rpmFromSpeed = wheelRpm * ratio
      this.rpm = Math.max(sp.idle, Math.min(sp.redline + 350, rpmFromSpeed))
      if (this.shiftTimer <= 0 && throttle) {
        const dir = this.gear === -1 ? -1 : 1
        const alongSpeed = this.speed * dir
        const clutch = alongSpeed < 3.2 ? Math.max(0.35, Math.abs(this.speed) / 3.2) : 1
        const firstRatio = sp.gears[0] * sp.finalDrive
        const gearFactor = Math.pow(ratio / firstRatio, 0.72)
        const atFactor = this.mode === 'AT' ? 0.96 : 1
        drive = sp.accelBase * gearFactor * this.torqueCurve(Math.max(this.rpm, sp.idle + 600)) * atFactor * clutch
        if (dir === -1) drive = -drive * 0.55
      }
    }
    if (this.rpm >= sp.redline && this.gear >= 1) drive = Math.min(drive, 0)

    const dragK = (sp.accelBase * 1.0) / (sp.vmax * sp.vmax)
    let acc = drive - dragK * this.speed * Math.abs(this.speed) - grade * 9.8 * 0.55
    if (this.gear >= 1 && !throttle) acc -= 1.15 * Math.sign(this.speed)
    if (brake) {
      if (this.gear === -1 && this.speed < -0.3) acc += 9.5
      else if (this.speed > 0.3) acc -= 9.5
      else if (this.mode === 'MT' && this.gear >= 0 && Math.abs(this.speed) <= 0.3 && this.gear !== -1) acc += 0
    }
    this.speed += acc * dt
    if (this.gear === -1) this.speed = Math.max(this.speed, -9)
    if (this.gear >= 1 && this.speed < 0) this.speed = Math.max(this.speed, brake ? -0.001 : 0)
    if (Math.abs(this.speed) < 0.02 && !throttle) this.speed = 0
  }
}

// ---- 車両モデル ----
export interface BuiltCar {
  group: THREE.Group
  spins: THREE.Object3D[]
  frontPivots: THREE.Object3D[]
  brakeLightMat: THREE.Material
  paintMat: THREE.Material
}

const glassMat = () => new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5 })
const blackMat = () => new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6, metalness: 0.3 })
const chromeMat = () => new THREE.MeshStandardMaterial({ color: 0xd7dce2, roughness: 0.22, metalness: 1 })
function paintMat(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.15 })
}
function RB(w: number, h: number, d: number, r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}
function BX(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}
function makeWheel(r: number, w: number): { pivot: THREE.Group; spin: THREE.Group } {
  const pivot = new THREE.Group()
  const spin = new THREE.Group()
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.92 }))
  tire.rotation.z = Math.PI / 2
  tire.castShadow = true
  spin.add(tire)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.012, 12), chromeMat())
  rim.rotation.z = Math.PI / 2
  spin.add(rim)
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(w + 0.016, r * 0.2, r * 0.92), new THREE.MeshStandardMaterial({ color: 0xb9bfc7, roughness: 0.3, metalness: 0.9 }))
    spoke.rotation.x = (i / 5) * Math.PI
    spin.add(spoke)
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.42, w * 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.35, metalness: 0.9 }))
  disc.rotation.z = Math.PI / 2
  spin.add(disc)
  pivot.add(spin)
  return { pivot, spin }
}
interface WheelSet { spins: THREE.Object3D[]; frontPivots: THREE.Object3D[] }
function addWheels(g: THREE.Group, r: number, w: number, xs: number, zf: number, zr: number): WheelSet {
  const spins: THREE.Object3D[] = [], frontPivots: THREE.Object3D[] = []
  for (const [x, z, front] of [[-xs, zf, 1], [xs, zf, 1], [-xs, zr, 0], [xs, zr, 0]] as [number, number, number][]) {
    const { pivot, spin } = makeWheel(r, w)
    pivot.position.set(x, r, z)
    g.add(pivot)
    spins.push(spin)
    if (front) frontPivots.push(pivot)
  }
  return { spins, frontPivots }
}
function headlights(g: THREE.Group, w: number, y: number, z: number, gap: number) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, emissive: 0xbfd9ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.4 })
  for (const s of [-1, 1]) {
    const h = BX(gap, 0.11, 0.05, mat, s * w, y, z)
    g.add(h)
  }
  return mat
}

export function buildHachiroku(): BuiltCar {
  const g = new THREE.Group()
  const paint = paintMat(0xf2f3f0)
  const black = blackMat()
  const glass = glassMat()
  g.add(RB(1.76, 0.2, 4.18, 0.06, black, 0, 0.3, 0))
  g.add(RB(1.74, 0.52, 4.16, 0.09, paint, 0, 0.52, 0))
  const nose = RB(1.7, 0.34, 0.95, 0.08, paint, 0, 0.46, 1.72); nose.rotation.x = 0.05; g.add(nose)
  g.add(RB(1.78, 0.24, 0.3, 0.06, black, 0, 0.32, 2.04))
  g.add(RB(1.78, 0.24, 0.3, 0.06, black, 0, 0.32, -2.04))
  g.add(RB(1.6, 0.07, 1.2, 0.03, paint, 0, 0.81, 1.18))
  for (const s of [-1, 1]) {
    g.add(BX(0.44, 0.1, 0.52, paint, s * 0.56, 0.8, 1.6))
    g.add(BX(0.46, 0.03, 0.54, black, s * 0.56, 0.74, 1.6))
    const sig = new THREE.MeshStandardMaterial({ color: 0xcc5f14, emissive: 0xff7d1e, emissiveIntensity: 0.5 })
    g.add(BX(0.4, 0.06, 0.04, sig, s * 0.56, 0.5, 2.19))
    g.add(BX(0.05, 0.16, 0.34, black, s * 0.9, 0.98, 0.5))
    g.add(BX(0.16, 0.09, 0.05, black, s * 0.94, 1.0, 0.52))
    g.add(BX(0.02, 0.05, 0.3, black, s * 0.88, 0.66, 0.15))
    g.add(BX(0.02, 0.05, 0.3, black, s * 0.88, 0.66, -0.75))
  }
  headlights(g, 0.56, 0.62, 2.18, 0.4)
  g.add(RB(1.52, 0.48, 2.05, 0.13, glass, 0, 0.98, -0.18))
  g.add(RB(1.46, 0.07, 1.72, 0.03, paint, 0, 1.24, -0.24))
  const hatch = RB(1.48, 0.05, 0.85, 0.02, glass, 0, 1.02, -1.3); hatch.rotation.x = 0.52; g.add(hatch)
  g.add(RB(1.52, 0.05, 0.3, 0.02, black, 0, 0.9, -2.0))
  const brake = new THREE.MeshStandardMaterial({ color: 0x5c0d0d, emissive: 0xd21f1f, emissiveIntensity: 0.55, roughness: 0.3 })
  g.add(BX(1.62, 0.17, 0.06, brake, 0, 0.66, -2.14))
  g.add(BX(0.5, 0.13, 0.02, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }), 0, 0.42, -2.2))
  g.add(BX(0.5, 0.13, 0.02, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }), 0, 0.42, 2.2))
  const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.3, 10), chromeMat())
  exh.rotation.x = Math.PI / 2; exh.position.set(0.55, 0.2, -2.2); g.add(exh)
  g.add(BX(1.7, 0.09, 0.5, black, 0, 0.24, 1.35))
  g.add(BX(1.7, 0.09, 0.5, black, 0, 0.24, -1.35))
  const ws = addWheels(g, 0.31, 0.21, 0.8, 1.32, -1.32)
  return { group: g, spins: ws.spins, frontPivots: ws.frontPivots, brakeLightMat: brake, paintMat: paint }
}

export function buildGTR(): BuiltCar {
  const g = new THREE.Group()
  const paint = paintMat(0x1d4f9e)
  const black = blackMat()
  const glass = glassMat()
  g.add(RB(1.9, 0.56, 4.6, 0.1, paint, 0, 0.54, 0))
  const nose = RB(1.86, 0.36, 0.85, 0.08, paint, 0, 0.48, 1.98); nose.rotation.x = 0.04; g.add(nose)
  g.add(RB(1.92, 0.26, 0.36, 0.06, black, 0, 0.32, 2.24))
  g.add(RB(1.24, 0.26, 0.12, 0.04, black, 0, 0.4, 2.34))
  g.add(RB(1.62, 0.07, 1.3, 0.03, paint, 0, 0.86, 1.22))
  for (const s of [-1, 1]) {
    g.add(BX(0.36, 0.03, 0.55, black, s * 0.46, 0.9, 1.3))
    g.add(RB(0.2, 0.3, 1.15, 0.07, paint, s * 0.97, 0.56, 1.48))
    g.add(RB(0.2, 0.3, 1.15, 0.07, paint, s * 0.97, 0.56, -1.48))
    g.add(BX(0.05, 0.16, 0.36, black, s * 0.98, 1.02, 0.55))
    g.add(BX(0.17, 0.09, 0.05, black, s * 1.0, 1.04, 0.57))
    const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.3, 10), chromeMat())
    exh.rotation.x = Math.PI / 2; exh.position.set(s * 0.52, 0.22, -2.42); g.add(exh)
    g.add(BX(0.3, 0.05, 0.06, paint, s * 0.93, 1.06, -2.1))
  }
  headlights(g, 0.58, 0.66, 2.4, 0.42)
  g.add(RB(1.64, 0.5, 2.25, 0.13, glass, 0, 1.02, -0.22))
  g.add(RB(1.58, 0.07, 1.85, 0.03, paint, 0, 1.29, -0.28))
  g.add(RB(1.82, 0.36, 0.1, 0.03, black, 0, 0.72, -2.32))
  const brake = new THREE.MeshStandardMaterial({ color: 0x5c0d0d, emissive: 0xe02020, emissiveIntensity: 0.6, roughness: 0.25 })
  for (const sx of [-0.68, -0.4, 0.4, 0.68]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.05, 14), brake)
    t.rotation.x = Math.PI / 2; t.position.set(sx, 0.74, -2.38); g.add(t)
  }
  g.add(RB(1.62, 0.06, 0.36, 0.02, black, 0, 1.14, -2.18))
  g.add(BX(0.5, 0.13, 0.02, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }), 0, 0.44, -2.4))
  g.add(BX(1.86, 0.1, 0.55, black, 0, 0.26, 1.5))
  g.add(BX(1.86, 0.1, 0.55, black, 0, 0.26, -1.5))
  const ws = addWheels(g, 0.34, 0.26, 0.87, 1.5, -1.5)
  return { group: g, spins: ws.spins, frontPivots: ws.frontPivots, brakeLightMat: brake, paintMat: paint }
}

export function buildTrafficCar(color: number): BuiltCar {
  const g = new THREE.Group()
  const paint = paintMat(color)
  const glass = glassMat()
  g.add(RB(1.76, 0.55, 4.1, 0.1, paint, 0, 0.55, 0))
  g.add(RB(1.56, 0.48, 2.0, 0.13, glass, 0, 1.0, -0.15))
  g.add(RB(1.5, 0.06, 1.7, 0.03, paint, 0, 1.26, -0.2))
  const brake = new THREE.MeshStandardMaterial({ color: 0x5c0d0d, emissive: 0xd21f1f, emissiveIntensity: 0.5 })
  g.add(BX(1.5, 0.13, 0.05, brake, 0, 0.68, -2.06))
  headlights(g, 0.55, 0.64, 2.06, 0.38)
  const ws = addWheels(g, 0.31, 0.2, 0.79, 1.3, -1.3)
  return { group: g, spins: ws.spins, frontPivots: ws.frontPivots, brakeLightMat: brake, paintMat: paint }
}
