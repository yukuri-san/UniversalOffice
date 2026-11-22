// WebX エンジン：鉄道（BVE基準）
// 路線生成・線路/架線・駅・列車モデル・編成配置・運転物理・走行音
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export interface RailFrame {
  x: number; y: number; z: number
  tx: number; tz: number // 進行方向（単位）
  rx: number; rz: number // 右方向（単位）
  curve: number // 符号つき曲率 (rad/m)
  grade: number // 勾配 (dy/ds)
}
export interface RailRoute {
  frames: RailFrame[]
  length: number
  spacing: number
  frameAt: (s: number) => RailFrame
  limitAt: (s: number) => number // km/h
  posAt: (s: number, lat: number, up: number) => THREE.Vector3
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function buildRailRoute(ctrl: [number, number, number][], baseLimit = 95): RailRoute {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.5)
  const length = curve.getLength()
  const spacing = 2
  const n = Math.max(16, Math.round(length / spacing))
  const pts = curve.getSpacedPoints(n)
  const frames: RailFrame[] = pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)]
    let tx = next.x - prev.x, tz = next.z - prev.z
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l
    return { x: p.x, y: p.y, z: p.z, tx, tz, rx: tz, rz: -tx, curve: 0, grade: 0 }
  })
  for (let i = 0; i < frames.length; i++) {
    const a = frames[Math.max(0, i - 1)], b = frames[Math.min(frames.length - 1, i + 1)]
    const angA = Math.atan2(a.tx, a.tz), angB = Math.atan2(b.tx, b.tz)
    let d = angB - angA
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    frames[i].curve = d / (spacing * 2)
    frames[i].grade = (b.y - a.y) / (spacing * 2)
  }
  const frameAt = (s: number): RailFrame => {
    const f = clamp(s / spacing, 0, frames.length - 1)
    const i = Math.floor(f), t = f - i
    const a = frames[i], b = frames[Math.min(frames.length - 1, i + 1)]
    if (t === 0 || i >= frames.length - 1) return a
    let tx = lerp(a.tx, b.tx, t), tz = lerp(a.tz, b.tz, t)
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l
    return {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
      tx, tz, rx: tz, rz: -tx,
      curve: lerp(a.curve, b.curve, t), grade: lerp(a.grade, b.grade, t),
    }
  }
  const limitAt = (s: number): number => {
    const c = Math.abs(frameAt(s).curve)
    if (c < 1e-5) return baseLimit
    const R = 1 / c
    return Math.round(clamp(Math.sqrt(R) * 3.1, 38, baseLimit))
  }
  const posAt = (s: number, lat: number, up: number): THREE.Vector3 => {
    const f = frameAt(s)
    return new THREE.Vector3(f.x + f.rx * lat, f.y + up, f.z + f.rz * lat)
  }
  return { frames, length, spacing, frameAt, limitAt, posAt }
}

// ---- 線路・路盤・架線 ----
export function buildTrackSet(route: RailRoute, offsets: number[], opts?: { tunnel?: [number, number]; bridge?: [number, number] }): THREE.Group {
  const g = new THREE.Group()
  const frames = route.frames
  const step = 2 // フレーム間隔 m
  const inRange = (s: number, r?: [number, number]) => !!r && s >= r[0] && s <= r[1]

  // 路盤（バラスト帯）
  {
    const minOff = Math.min(...offsets), maxOff = Math.max(...offsets)
    const width = (maxOff - minOff) + 5.4
    const center = (minOff + maxOff) / 2
    const verts: number[] = [], idx: number[] = []
    frames.forEach((f, i) => {
      if (i % 1 !== 0) return
      const s = i * step
      const y = f.y - 0.12 - (inRange(s, opts?.bridge) ? 0.55 : 0)
      verts.push(
        f.x + f.rx * (center - width / 2), y, f.z + f.rz * (center - width / 2),
        f.x + f.rx * (center + width / 2), y, f.z + f.rz * (center + width / 2),
      )
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
    geo.setIndex(idx); geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 }))
    mesh.receiveShadow = true
    g.add(mesh)
  }
  // 枕木（インスタンス）
  {
    const per = Math.floor(route.length / 1.05)
    const geo = new THREE.BoxGeometry(2.3, 0.12, 0.24)
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 1 })
    const total = per * offsets.length
    const inst = new THREE.InstancedMesh(geo, mat, total)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    let k = 0
    for (let i = 0; i < per; i++) {
      const s = i * 1.05
      const f = route.frameAt(s)
      q.setFromAxisAngle(up, Math.atan2(f.tx, f.tz))
      for (const off of offsets) {
        m4.compose(new THREE.Vector3(f.x + f.rx * off, f.y - 0.02, f.z + f.rz * off), q, one)
        inst.setMatrixAt(k++, m4)
      }
    }
    inst.count = k
    g.add(inst)
  }
  // レール（2本×各軌道、リボン）
  {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.32, metalness: 0.95 })
    for (const off of offsets) {
      for (const side of [-0.7175, 0.7175]) {
        const verts: number[] = [], idx: number[] = []
        frames.forEach((f, i) => {
          const lat = off + side
          verts.push(f.x + f.rx * (lat - 0.035), f.y + 0.1, f.z + f.rz * (lat - 0.035), f.x + f.rx * (lat + 0.035), f.y + 0.1, f.z + f.rz * (lat + 0.035))
          if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
        })
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
        geo.setIndex(idx); geo.computeVertexNormals()
        g.add(new THREE.Mesh(geo, railMat))
      }
    }
  }
  // 架線柱＋架線
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.6, metalness: 0.6 })
    const spots: number[] = []
    for (let s = 20; s < route.length - 10; s += 46) spots.push(s)
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6)
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length)
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 3.4)
    const arms = new THREE.InstancedMesh(armGeo, poleMat, spots.length)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    const midOff = offsets.reduce((a, b) => a + b, 0) / offsets.length
    spots.forEach((s, i) => {
      const f = route.frameAt(s)
      const sideLat = midOff + (i % 2 === 0 ? 3.6 : -3.6)
      q.setFromAxisAngle(up, Math.atan2(f.tx, f.tz))
      m4.compose(new THREE.Vector3(f.x + f.rx * sideLat, f.y + 3.2, f.z + f.rz * sideLat), q, one)
      poles.setMatrixAt(i, m4)
      const armLat = midOff + (i % 2 === 0 ? 1.8 : -1.8)
      m4.compose(new THREE.Vector3(f.x + f.rx * armLat, f.y + 6.15, f.z + f.rz * armLat), q, one)
      arms.setMatrixAt(i, m4)
    })
    g.add(poles, arms)
    const wireMat = new THREE.LineBasicMaterial({ color: 0x22262c })
    for (const off of offsets) {
      const pts: THREE.Vector3[] = []
      for (let s = 0; s <= route.length; s += 12) pts.push(route.posAt(s, off, 5.7))
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat))
    }
  }
  // トンネル（区間を覆うアーチセグメント）
  if (opts?.tunnel) {
    const [s0, s1] = opts.tunnel
    const segLen = 4.4
    const count = Math.ceil((s1 - s0) / segLen)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 1 })
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 5.6, segLen + 0.3), wallMat, count * 2)
    const topInst = new THREE.InstancedMesh(new THREE.BoxGeometry(11.6, 0.5, segLen + 0.3), wallMat, count)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    let wi = 0, ti = 0
    for (let i = 0; i < count; i++) {
      const s = s0 + i * segLen + segLen / 2
      const f = route.frameAt(s)
      q.setFromAxisAngle(up, Math.atan2(f.tx, f.tz))
      for (const side of [-5.55, 5.55]) {
        m4.compose(new THREE.Vector3(f.x + f.rx * side, f.y + 2.7, f.z + f.rz * side), q, one)
        inst.setMatrixAt(wi++, m4)
      }
      m4.compose(new THREE.Vector3(f.x, f.y + 5.6, f.z), q, one)
      topInst.setMatrixAt(ti++, m4)
    }
    inst.count = wi; topInst.count = ti
    g.add(inst, topInst)
    // ポータル
    const portalMat = new THREE.MeshStandardMaterial({ color: 0x555a61, roughness: 0.9 })
    for (const s of [s0, s1]) {
      const f = route.frameAt(s)
      const p = new THREE.Mesh(new THREE.BoxGeometry(13, 7.6, 1.2), portalMat)
      p.position.set(f.x, f.y + 3.4, f.z)
      p.rotation.y = Math.atan2(f.tx, f.tz)
      g.add(p)
      const hole = new THREE.Mesh(new THREE.BoxGeometry(10.6, 5.4, 1.35), new THREE.MeshBasicMaterial({ color: 0x05070a }))
      hole.position.set(f.x, f.y + 2.45, f.z)
      hole.rotation.y = Math.atan2(f.tx, f.tz)
      g.add(hole)
    }
  }
  // 橋梁（桁＋橋脚）
  if (opts?.bridge) {
    const [s0, s1] = opts.bridge
    const steel = new THREE.MeshStandardMaterial({ color: 0x6e3b2a, roughness: 0.6, metalness: 0.5 })
    const conc = new THREE.MeshStandardMaterial({ color: 0x7d838a, roughness: 0.95 })
    for (let s = s0; s < s1; s += 44) {
      const f = route.frameAt(s + 22)
      const pier = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 1.6), conc)
      pier.position.set(f.x, f.y - 5.1, f.z)
      pier.rotation.y = Math.atan2(f.tx, f.tz)
      g.add(pier)
    }
    const segLen = 4.4, count = Math.ceil((s1 - s0) / segLen)
    const girder = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.1, segLen + 0.3), steel, count * 2)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1)
    let gi = 0
    for (let i = 0; i < count; i++) {
      const s = s0 + i * segLen + segLen / 2
      const f = route.frameAt(s)
      q.setFromAxisAngle(up, Math.atan2(f.tx, f.tz))
      for (const side of [-4.4, 4.4]) {
        m4.compose(new THREE.Vector3(f.x + f.rx * side, f.y - 0.75, f.z + f.rz * side), q, one)
        girder.setMatrixAt(gi++, m4)
      }
    }
    girder.count = gi
    g.add(girder)
  }
  return g
}

// ---- 駅 ----
export function buildStation(route: RailRoute, s: number, name: string, platformLat: number): THREE.Group {
  const g = new THREE.Group()
  const f = route.frameAt(s)
  const yaw = Math.atan2(f.tx, f.tz)
  const base = new THREE.Group()
  base.position.set(f.x + f.rx * platformLat, f.y, f.z + f.rz * platformLat)
  base.rotation.y = yaw
  const conc = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.95 })
  const plat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 118), conc)
  plat.position.y = 0.42
  plat.castShadow = true; plat.receiveShadow = true
  base.add(plat)
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x37414d, roughness: 0.7, metalness: 0.3 })
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 76), roofMat)
  roof.position.set(0, 3.6, 0)
  base.add(roof)
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6)
  for (let dz = -34; dz <= 34; dz += 8.5) {
    const p = new THREE.Mesh(postGeo, roofMat)
    p.position.set(1.2, 2.3, dz)
    base.add(p)
  }
  // 駅名標
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#f2f4f6'; ctx.fillRect(0, 0, 512, 96)
  ctx.fillStyle = '#173a5e'; ctx.font = 'bold 52px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(name, 256, 52)
  const signTex = new THREE.CanvasTexture(cv)
  for (const dz of [-24, 0, 24]) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 3.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }))
    sign.position.set(0.6, 2.9, dz)
    sign.rotation.y = Math.PI / 2
    base.add(sign)
  }
  // ベンチ・自販機っぽい小物
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 })
  for (const dz of [-16, 10]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.4), benchMat)
    b.position.set(-0.7, 1.2, dz)
    base.add(b)
  }
  g.add(base)
  // 駅舎
  const bld = new THREE.Mesh(new THREE.BoxGeometry(10, 4.2, 16), new THREE.MeshStandardMaterial({ color: 0xb9b0a0, roughness: 0.9 }))
  const bf = route.frameAt(s)
  bld.position.set(bf.x + bf.rx * (platformLat + Math.sign(platformLat) * 6.4), bf.y + 2.1, bf.z + bf.rz * (platformLat + Math.sign(platformLat) * 6.4))
  bld.rotation.y = yaw
  bld.castShadow = true
  g.add(bld)
  return g
}

// ---- 列車 ----
export interface Livery { body: number; stripe: number; name: string }
export const LIVERIES: Record<string, Livery> = {
  blue: { body: 0xdfe3e6, stripe: 0x1c5fa8, name: '本線ブルー' },
  green: { body: 0xe8e8e2, stripe: 0x3f9e4d, name: '山線グリーン' },
  red: { body: 0xe6e1da, stripe: 0xc23b2a, name: 'ライバル レッド' },
  orange: { body: 0xededeb, stripe: 0xe07b24, name: '快速オレンジ' },
}
export interface Consist { group: THREE.Group; cars: THREE.Group[]; carLen: number; headLightMat: THREE.Material }

function buildCar(livery: Livery, isHead: boolean, isTail: boolean): THREE.Group {
  const car = new THREE.Group()
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: livery.body, roughness: 0.3, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.1 })
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.85, 2.5, 19.4, 3, 0.16), bodyMat)
  body.position.y = 2.15
  body.castShadow = true
  car.add(body)
  const roof = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.5, 18.6, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.5, metalness: 0.4 }))
  roof.position.y = 3.55
  car.add(roof)
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.88, 0.5, 19.44), new THREE.MeshStandardMaterial({ color: livery.stripe, roughness: 0.35, metalness: 0.2 }))
  stripe.position.y = 1.78
  car.add(stripe)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x121a24, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5 })
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.88, 0.78, 18.9), winMat)
  win.position.y = 2.62
  car.add(win)
  // ドア
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.4, metalness: 0.5 })
  for (const sx of [-1.44, 1.44]) for (const dz of [-6.8, -2.3, 2.3, 6.8]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.95, 1.3), doorMat)
    d.position.set(sx, 1.85, dz)
    car.add(d)
  }
  // 台車
  const bogieMat = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.8 })
  for (const dz of [-7.2, 7.2]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 3.4), bogieMat)
    b.position.set(0, 0.5, dz)
    car.add(b)
    for (const wx of [-0.75, 0.75]) for (const wz of [-0.9, 0.9]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.15, 12), bogieMat)
      w.rotation.z = Math.PI / 2
      w.position.set(wx, 0.42, dz + wz)
      car.add(w)
    }
  }
  // パンタグラフ（中間車のみ）
  if (!isHead && !isTail) {
    const pMat = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.5, metalness: 0.7 })
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.8), pMat)
    base.position.y = 3.85; car.add(base)
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), pMat)
      arm.position.set(s * 0.5, 4.3, 0)
      arm.rotation.z = s * 0.6
      car.add(arm)
    }
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.3), pMat)
    shoe.position.y = 4.82; car.add(shoe)
  }
  if (isHead) {
    // 運転台：傾斜した前面＋窓
    const nose = new THREE.Mesh(new RoundedBoxGeometry(2.8, 2.3, 1.6, 2, 0.3), bodyMat)
    nose.position.set(0, 2.2, 10.2)
    nose.rotation.x = 0.1
    car.add(nose)
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 0.1), winMat)
    shield.position.set(0, 2.85, 10.95)
    shield.rotation.x = 0.1
    car.add(shield)
    const hl = new THREE.MeshStandardMaterial({ color: 0xf5f2da, emissive: 0xfff3b0, emissiveIntensity: 1.6 })
    for (const sx of [-0.95, 0.95]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.06), hl)
      h.position.set(sx, 1.55, 10.9)
      car.add(h)
    }
  }
  if (isTail) {
    const tl = new THREE.MeshStandardMaterial({ color: 0x5c0d0d, emissive: 0xe02020, emissiveIntensity: 1.2 })
    for (const sx of [-0.95, 0.95]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), tl)
      t.position.set(sx, 1.55, -9.75)
      car.add(t)
    }
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 0.08), winMat)
    shield.position.set(0, 2.85, -9.72)
    car.add(shield)
  }
  car.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true })
  return car
}

export function buildConsist(livery: Livery, carCount = 4): Consist {
  const group = new THREE.Group()
  const cars: THREE.Group[] = []
  for (let i = 0; i < carCount; i++) {
    const car = buildCar(livery, i === 0, i === carCount - 1)
    group.add(car)
    cars.push(car)
  }
  const headLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff })
  return { group, cars, carLen: 20.1, headLightMat }
}

const _va = new THREE.Vector3(), _vb = new THREE.Vector3()
export function placeConsist(consist: Consist, route: RailRoute, headS: number, lat: number, dir: 1 | -1 = 1) {
  const { cars, carLen } = consist
  for (let i = 0; i < cars.length; i++) {
    const centerS = headS - dir * (carLen / 2 + i * carLen)
    const fF = route.frameAt(centerS + dir * 7.2)
    const fB = route.frameAt(centerS - dir * 7.2)
    _va.set(fF.x + fF.rx * lat, fF.y, fF.z + fF.rz * lat)
    _vb.set(fB.x + fB.rx * lat, fB.y, fB.z + fB.rz * lat)
    const car = cars[i]
    car.position.set((_va.x + _vb.x) / 2, (_va.y + _vb.y) / 2 + 0.32, (_va.z + _vb.z) / 2)
    car.rotation.order = 'YXZ'
    car.rotation.y = Math.atan2(_va.x - _vb.x, _va.z - _vb.z)
    car.rotation.x = -Math.atan2(_va.y - _vb.y, Math.hypot(_va.x - _vb.x, _va.z - _vb.z))
  }
}

// ---- 運転物理（BVE基準：ノッチ・勾配・ジャーク制限） ----
export class TrainSim {
  s = 0
  v = 0 // m/s
  a = 0
  lever = 0 // -9=EB, -8..-1=B, 0=N, 1..5=P
  update(dt: number, grade: number) {
    let target: number
    if (this.lever === -9) target = -1.35
    else if (this.lever < 0) target = -(0.3 + (-this.lever - 1) * 0.115)
    else if (this.lever > 0) target = (0.42 + this.lever * 0.115) * Math.max(0.22, 1 - this.v / 34)
    else target = 0
    target -= grade * 9.81
    target -= 0.0016 * this.v * Math.abs(this.v) + 0.02 * Math.sign(this.v)
    const maxDa = 0.75 * dt
    this.a += clamp(target - this.a, -maxDa, maxDa)
    this.v = Math.max(0, this.v + this.a * dt)
    if (this.v < 0.02 && this.lever <= 0) this.v = 0
    this.s += this.v * dt
  }
  get kmh() { return this.v * 3.6 }
  get leverLabel() {
    if (this.lever === -9) return 'EB'
    if (this.lever < 0) return `B${-this.lever}`
    if (this.lever > 0) return `P${this.lever}`
    return 'N'
  }
}

// ---- 走行音（WebAudio合成） ----
export class TrainAudio {
  private ctx: AudioContext | null = null
  private motor: OscillatorNode | null = null
  private motorGain: GainNode | null = null
  private noiseGain: GainNode | null = null
  muted = false
  private lastJointS = 0
  start() {
    if (this.ctx) { void this.ctx.resume(); return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 40
    const g = ctx.createGain(); g.gain.value = 0
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420
    osc.connect(filt); filt.connect(g); g.connect(ctx.destination)
    osc.start()
    this.motor = osc; this.motorGain = g
    const len = ctx.sampleRate * 1.2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.6
    const ng = ctx.createGain(); ng.gain.value = 0
    noise.connect(nf); nf.connect(ng); ng.connect(ctx.destination)
    noise.start()
    this.noiseGain = ng
  }
  private blip(freq: number, dur: number, vol: number, type: OscillatorType = 'square') {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    o.connect(g); g.connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + dur)
  }
  joint(s: number, v: number) {
    if (Math.abs(s - this.lastJointS) > 25) {
      this.lastJointS = s
      if (v > 2 && !this.muted) {
        const vol = Math.min(0.12, 0.03 + v * 0.003)
        this.blip(180, 0.05, vol, 'triangle')
        window.setTimeout(() => this.blip(150, 0.05, vol, 'triangle'), 90)
      }
    }
  }
  chime() {
    this.blip(880, 0.35, 0.06, 'sine')
    window.setTimeout(() => this.blip(659, 0.5, 0.06, 'sine'), 220)
  }
  beep() { this.blip(1250, 0.12, 0.05, 'square') }
  update(v: number, lever: number) {
    if (!this.ctx || !this.motor || !this.motorGain || !this.noiseGain) return
    const t = this.ctx.currentTime
    const powering = lever > 0
    this.motor.frequency.setTargetAtTime(38 + v * 6.5 + (powering ? 14 : 0), t, 0.08)
    this.motorGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.05, (powering ? 0.028 : 0.008) + v * 0.0009), t, 0.1)
    this.noiseGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.07, v * v * 0.00006), t, 0.15)
  }
  dispose() {
    if (this.ctx) void this.ctx.close()
    this.ctx = null
  }
}
