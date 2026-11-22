// WebX エンジン：オープンワールド生成
// 道路ネットワーク（市街地グリッド／環状高速／峠）＋地形＋建物・コリジョン・交通ルート
import * as THREE from 'three'

export type RoadKind = 'city' | 'highway' | 'touge'
export interface RouteFrame { x: number; y: number; z: number; hx: number; hz: number }
export interface Route { frames: RouteFrame[]; length: number; at: (s: number) => RouteFrame }
export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number }
export interface WorldData {
  group: THREE.Group
  heightAt: (x: number, z: number) => number
  roadInfo: (x: number, z: number) => { dist: number; kind: RoadKind | 'offroad' }
  colliders: Collider[]
  routes: Route[]
  checkpoints: { x: number; z: number }[]
  start: { x: number; z: number; heading: number }
  minimapRoads: [number, number][][]
  update: (t: number) => void
}

interface RoadDef { pts: [number, number][]; width: number; kind: RoadKind; closed?: boolean; smooth?: boolean }

const CITY_V = [-160, -80, 0, 80, 160]
const CITY_H = [0, 80, 160]
const HIGHWAY: [number, number][] = [[200, -60], [300, -10], [325, 120], [300, 250], [170, 325], [0, 345], [-170, 325], [-295, 230], [-310, 90], [-250, -30], [-90, -85], [60, -100]]
const TOUGE: [number, number][] = [[-300, 15], [-345, -55], [-295, -125], [-375, -195], [-305, -265], [-385, -335], [-320, -405], [-345, -465]]

const ROADS: RoadDef[] = [
  ...CITY_V.map((x): RoadDef => ({ pts: [[x, -40], [x, 200]], width: 11, kind: 'city' })),
  ...CITY_H.map((z): RoadDef => ({ pts: [[-200, z], [200, z]], width: 11, kind: 'city' })),
  { pts: [[200, 0], [200, -60]], width: 11, kind: 'city' },
  { pts: [[-200, 80], [-262, 84], [-308, 90]], width: 11, kind: 'city' },
  { pts: [[40, 200], [50, 290], [62, 342]], width: 11, kind: 'city' },
  { pts: HIGHWAY, width: 16, kind: 'highway', closed: true, smooth: true },
  { pts: TOUGE, width: 8.5, kind: 'touge', smooth: true },
]

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)

// ---- 地形の高さ（生） ----
function noiseH(x: number, z: number): number {
  const n = 0.6 * Math.sin(x * 0.02 + Math.sin(z * 0.016) * 1.6) * Math.cos(z * 0.018 + Math.sin(x * 0.014) * 1.2)
    + 0.4 * Math.sin(x * 0.052 + 1.1) * Math.sin(z * 0.047 + 1.3)
  return n * 0.5 + 0.5
}
// 峠中心線への距離（マスク用サンプル）
const tougeSamples: [number, number][] = []
{
  const curve = new THREE.CatmullRomCurve3(TOUGE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5)
  for (const p of curve.getSpacedPoints(160)) tougeSamples.push([p.x, p.z])
}
function distToTouge(x: number, z: number): number {
  let m = 1e9
  for (const [sx, sz] of tougeSamples) { const d = (sx - x) * (sx - x) + (sz - z) * (sz - z); if (d < m) m = d }
  return Math.sqrt(m)
}
function heightRaw(x: number, z: number): number {
  const dT = distToTouge(x, z)
  const maskT = clamp(1 - (dT - 26) / 170, 0, 1)
  const distC = Math.hypot(x, z - 80)
  const maskO = clamp((distC - 300) / 260, 0, 1) * 0.35
  return noiseH(x, z) * (46 * maskT + 10 * maskO)
}
// 峠ロードの目標高さ（中心線を平滑化、入口は0）
const tougeFramesY: { x: number; z: number; y: number }[] = []
{
  const curve = new THREE.CatmullRomCurve3(TOUGE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5)
  const pts = curve.getSpacedPoints(200)
  const raw = pts.map((p) => heightRaw(p.x, p.z))
  for (let i = 0; i < pts.length; i++) {
    let s = 0, c = 0
    for (let k = -9; k <= 9; k++) { const j = clamp(i + k, 0, pts.length - 1); s += raw[j]; c++ }
    const ramp = smooth(clamp(i / (pts.length * 0.22), 0, 1))
    tougeFramesY.push({ x: pts[i].x, z: pts[i].z, y: (s / c) * ramp })
  }
}
export function terrainHeight(x: number, z: number): number {
  let base = heightRaw(x, z)
  let best = 1e9, by = 0
  for (const f of tougeFramesY) { const d = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z); if (d < best) { best = d; by = f.y } }
  const d = Math.sqrt(best)
  const half = 4.25
  if (d < half + 7) return by
  if (d < half + 30) return lerp(by, base, smooth((d - half - 7) / 23))
  return base
}

// ---- 道路サンプル（roadInfo 用） ----
interface SamplePt { x: number; z: number; halfW: number; kind: RoadKind }
const samplePts: SamplePt[] = []
function resample(pts: [number, number][], closed: boolean, smoothLine: boolean, step = 4): [number, number][] {
  if (smoothLine) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'catmullrom', 0.5)
    const len = curve.getLength()
    return curve.getSpacedPoints(Math.max(8, Math.round(len / step))).map((p) => [p.x, p.z] as [number, number])
  }
  const out: [number, number][] = []
  const seq = closed ? [...pts, pts[0]] : pts
  for (let i = 0; i < seq.length - 1; i++) {
    const [ax, az] = seq[i], [bx, bz] = seq[i + 1]
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(d / step))
    for (let k = 0; k < n; k++) out.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)])
  }
  if (!closed) out.push(seq[seq.length - 1])
  return out
}
for (const r of ROADS) {
  for (const [x, z] of resample(r.pts, !!r.closed, !!r.smooth)) samplePts.push({ x, z, halfW: r.width / 2, kind: r.kind })
}
function roadInfoAt(x: number, z: number): { dist: number; kind: RoadKind | 'offroad' } {
  let best = 1e9, kind: RoadKind | 'offroad' = 'offroad'
  for (const p of samplePts) {
    const d = Math.hypot(p.x - x, p.z - z) - p.halfW
    if (d < best) { best = d; kind = p.kind }
  }
  return { dist: best, kind: best <= 1.5 ? kind : 'offroad' }
}

// ---- テクスチャ ----
function asphaltTexture(): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256
  const g = cv.getContext('2d')!
  g.fillStyle = '#22252a'; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${140 + Math.random() * 60},${140 + Math.random() * 60},${150 + Math.random() * 60},${Math.random() * 0.05})`
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6)
  }
  g.fillStyle = 'rgba(235,238,240,0.85)'; g.fillRect(5, 0, 4, 256); g.fillRect(247, 0, 4, 256)
  g.fillStyle = 'rgba(250,205,60,0.8)'; g.fillRect(125, 0, 6, 110)
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}
function buildingTexture(litRatio: number, base: string): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256
  const g = cv.getContext('2d')!
  g.fillStyle = base; g.fillRect(0, 0, 128, 256)
  for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) {
    const lit = Math.random() < litRatio
    g.fillStyle = lit ? `rgba(255,${200 + Math.random() * 40},130,0.95)` : 'rgba(70,90,110,0.55)'
    g.fillRect(8 + x * 20, 10 + y * 20, 12, 13)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  return tex
}
function bannerTexture(text: string): THREE.Texture {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96
  const g = cv.getContext('2d')!
  g.fillStyle = '#101318'; g.fillRect(0, 0, 512, 96)
  g.fillStyle = '#ffd21f'; g.font = 'italic 900 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, 256, 52)
  return new THREE.CanvasTexture(cv)
}

export function buildWorld(): WorldData {
  const group = new THREE.Group()
  const colliders: Collider[] = []

  // 地形
  {
    const SIZE = 1150, SEG = 150
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const cGrass = new THREE.Color(0x27351f), cGrass2 = new THREE.Color(0x31452a), cRock = new THREE.Color(0x5d6066), cHigh = new THREE.Color(0x777d85)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const y = terrainHeight(x, z)
      pos.setY(i, y)
      const slope = Math.abs(terrainHeight(x + 3, z) - y) + Math.abs(terrainHeight(x, z + 3) - y)
      if (slope > 1.15) tmp.copy(cRock)
      else if (y > 26) tmp.copy(cHigh)
      else tmp.copy(Math.random() < 0.5 ? cGrass : cGrass2)
      tmp.offsetHSL(0, 0, (Math.random() - 0.5) * 0.03)
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }))
    terrain.receiveShadow = true
    group.add(terrain)
    const sea = new THREE.Mesh(new THREE.CircleGeometry(3200, 40), new THREE.MeshStandardMaterial({ color: 0x141c17, roughness: 1 }))
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.4
    group.add(sea)
    // 遠景の山影
    const mMat = new THREE.MeshBasicMaterial({ color: 0x131a26 })
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3
      const m = new THREE.Mesh(new THREE.ConeGeometry(180 + Math.random() * 160, 130 + Math.random() * 130, 5), mMat)
      m.position.set(Math.cos(a) * 980, 0, Math.sin(a) * 980)
      group.add(m)
    }
  }

  // 道路リボン
  {
    const tex = asphaltTexture()
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0 })
    const gravelMat = new THREE.MeshStandardMaterial({ color: 0x3d3a33, roughness: 1 })
    for (const r of ROADS) {
      const line = resample(r.pts, !!r.closed, !!r.smooth, 3)
      const frames = line.map(([x, z], i) => {
        const [px, pz] = line[(i - 1 + line.length) % line.length]
        const [nx, nz] = line[(i + 1) % line.length]
        let tx = nx - px, tz = nz - pz
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l
        return { x, z, y: terrainHeight(x, z), rx: tz, rz: -tx }
      })
      const build = (extra: number, yOff: number, m: THREE.Material) => {
        const verts: number[] = [], uvs: number[] = [], idx: number[] = []
        let cum = 0
        frames.forEach((f, i) => {
          if (i > 0) cum += Math.hypot(f.x - frames[i - 1].x, f.z - frames[i - 1].z)
          const hw = r.width / 2 + extra
          verts.push(f.x - f.rx * hw, f.y + yOff, f.z - f.rz * hw, f.x + f.rx * hw, f.y + yOff, f.z + f.rz * hw)
          uvs.push(0, cum / 9, 1, cum / 9)
          if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
        })
        if (r.closed && frames.length > 2) {
          const a = (frames.length - 1) * 2
          idx.push(a, a + 1, 0, a + 1, 1, 0)
        }
        const g2 = new THREE.BufferGeometry()
        g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
        g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
        g2.setIndex(idx); g2.computeVertexNormals()
        const mesh = new THREE.Mesh(g2, m)
        mesh.receiveShadow = true
        group.add(mesh)
      }
      if (r.kind === 'touge') build(1.6, 0.045, gravelMat)
      build(0, 0.09, mat)
    }
  }

  // 市街地：ブロック＋ビル
  {
    const texA = buildingTexture(0.4, '#232833'), texB = buildingTexture(0.28, '#1d2129')
    const mats = [texA, texB].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }))
    const padMat = new THREE.MeshStandardMaterial({ color: 0x363b43, roughness: 1 })
    const xRanges: [number, number][] = [[-196, -165.5], [-154.5, -85.5], [-74.5, -5.5], [5.5, 74.5], [85.5, 154.5], [165.5, 196]]
    const zRanges: [number, number][] = [[-34.5, -5.5], [5.5, 74.5], [85.5, 154.5], [165.5, 195.5]]
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (const [x0, x1] of xRanges) for (const [z0, z1] of zRanges) {
      const w = x1 - x0, d = z1 - z0
      if (w < 20 || d < 20) continue
      const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), padMat)
      pad.position.set((x0 + x1) / 2, 0.11, (z0 + z1) / 2)
      pad.receiveShadow = true
      group.add(pad)
      const n = 1 + Math.floor(rnd() * 3)
      for (let i = 0; i < n; i++) {
        const bw = 12 + rnd() * Math.min(24, w - 14), bd = 12 + rnd() * Math.min(24, d - 14)
        const bx = x0 + bw / 2 + 3 + rnd() * Math.max(1, w - bw - 6)
        const bz = z0 + bd / 2 + 3 + rnd() * Math.max(1, d - bd - 6)
        const bh = 10 + rnd() * rnd() * 40
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mats[Math.floor(rnd() * mats.length)])
        b.position.set(bx, bh / 2 + 0.2, bz)
        b.castShadow = true; b.receiveShadow = true
        group.add(b)
        colliders.push({ minX: bx - bw / 2 - 0.3, maxX: bx + bw / 2 + 0.3, minZ: bz - bd / 2 - 0.3, maxZ: bz + bd / 2 + 0.3 })
      }
    }
  }

  // 街灯（インスタンス）
  {
    const spots: { x: number; z: number; y: number }[] = []
    for (const p of samplePts) {
      if (Math.random() < 0.82) continue
      spots.push({ x: p.x, z: p.z, y: terrainHeight(p.x, p.z) })
    }
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 5.2, 5)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7, metalness: 0.6 })
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length)
    const lampGeo = new THREE.SphereGeometry(0.17, 8, 6)
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x443c20, emissive: 0xffc46b, emissiveIntensity: 2.4 })
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length)
    const m4 = new THREE.Matrix4()
    spots.forEach((s, i) => {
      m4.makeTranslation(s.x, s.y + 2.6, s.z); poles.setMatrixAt(i, m4)
      m4.makeTranslation(s.x, s.y + 5.25, s.z); lamps.setMatrixAt(i, m4)
    })
    group.add(poles, lamps)
  }

  // 信号機
  const signalMats: { red: THREE.MeshStandardMaterial; yellow: THREE.MeshStandardMaterial; green: THREE.MeshStandardMaterial }[] = []
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, metalness: 0.5 })
    const headMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.6 })
    for (const [sx, sz] of [[0, 0], [80, 80], [-80, 80], [0, 160], [-160, 0]] as [number, number][]) {
      const g = new THREE.Group()
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6), poleMat)
      pole.position.y = 2.3; g.add(pole)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), poleMat)
      arm.position.set(0, 4.55, 1.0); g.add(arm)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.3), headMat)
      head.position.set(0, 4.1, 2.05); g.add(head)
      const mk = (color: number, y: number) => {
        const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0.06 })
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m)
        s.position.set(0, y, 2.22); g.add(s)
        return m
      }
      signalMats.push({ red: mk(0xff2a1a, 4.42), yellow: mk(0xffb300, 4.1), green: mk(0x2aff5a, 3.78) })
      g.position.set(sx + 6.4, 0, sz + 6.4)
      group.add(g)
    }
  }

  // 峠ガードレール
  {
    const line = resample(TOUGE, false, true, 4)
    const railGeo = new THREE.BoxGeometry(0.08, 0.42, 3.9)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.45, metalness: 0.8 })
    const count = (line.length - 1) * 2
    const rails = new THREE.InstancedMesh(railGeo, railMat, count)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1)
    let idx = 0
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1]
      let tx = bx - ax, tz = bz - az
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l
      const yaw = Math.atan2(tx, tz)
      q.setFromAxisAngle(up, yaw)
      for (const side of [-1, 1]) {
        const cx = (ax + bx) / 2 + tz * side * 5.1, cz = (az + bz) / 2 - tx * side * 5.1
        m4.compose(new THREE.Vector3(cx, terrainHeight(cx, cz) + 0.55, cz), q, sc)
        rails.setMatrixAt(idx++, m4)
      }
    }
    rails.count = idx
    group.add(rails)
  }

  // 木・岩
  {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 5)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 })
    const leafGeo = new THREE.ConeGeometry(1.5, 3.6, 7)
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f3a22, roughness: 1 })
    const N = 460
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N)
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
    let placed = 0, guard = 0
    while (placed < N && guard++ < 6000) {
      const x = (Math.random() - 0.5) * 1080, z = (Math.random() - 0.5) * 1080
      if (roadInfoAt(x, z).dist < 7) continue
      if (Math.abs(x) < 215 && z > -55 && z < 215) continue
      const y = terrainHeight(x, z)
      const s = 0.8 + Math.random() * 0.9
      q.setFromAxisAngle(up, Math.random() * Math.PI)
      m4.compose(new THREE.Vector3(x, y + 0.8 * s, z), q, new THREE.Vector3(s, s, s)); trunks.setMatrixAt(placed, m4)
      m4.compose(new THREE.Vector3(x, y + (1.6 + 1.7) * s, z), q, new THREE.Vector3(s, s, s)); leaves.setMatrixAt(placed, m4)
      placed++
    }
    trunks.count = leaves.count = placed
    group.add(trunks, leaves)
    const rockGeo = new THREE.DodecahedronGeometry(1)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x62666d, roughness: 1, flatShading: true })
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 130)
    let rp = 0; guard = 0
    while (rp < 130 && guard++ < 3000) {
      const x = -560 + Math.random() * 380, z = -540 + Math.random() * 640
      if (roadInfoAt(x, z).dist < 5) continue
      const s = 0.5 + Math.random() * 2.0
      q.setFromAxisAngle(up, Math.random() * Math.PI)
      m4.compose(new THREE.Vector3(x, terrainHeight(x, z) + 0.2, z), q, new THREE.Vector3(s, s * 0.7, s))
      rocks.setMatrixAt(rp++, m4)
    }
    rocks.count = rp
    group.add(rocks)
  }

  // スタートゲート
  {
    const g = new THREE.Group()
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.5, metalness: 0.6 })
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.6, 8), poleMat)
      p.position.set(8 + side * 5.6, 2.8, 196); g.add(p)
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.15, 0.18), new THREE.MeshStandardMaterial({ map: bannerTexture('START'), roughness: 0.7 }))
    banner.position.set(8, 5.3, 196)
    g.add(banner)
    group.add(g)
  }

  // 交通ルート
  const makeRoute = (pts: [number, number][], closed: boolean, smoothLine: boolean, lane: number, step = 3): Route => {
    const line = resample(pts, closed, smoothLine, step)
    const frames: RouteFrame[] = line.map(([x, z], i) => {
      const [px, pz] = line[(i - 1 + line.length) % line.length]
      const [nx, nz] = line[(i + 1) % line.length]
      let tx = nx - px, tz = nz - pz
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l
      const ox = x + tz * lane, oz = z - tx * lane
      return { x: ox, y: terrainHeight(ox, oz), z: oz, hx: tx, hz: tz }
    })
    const cum: number[] = [0]
    const segCount = closed ? frames.length : frames.length - 1
    for (let i = 1; i <= segCount; i++) {
      const a = frames[i - 1], b = frames[i % frames.length]
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z))
    }
    const length = cum[cum.length - 1]
    const at = (s: number): RouteFrame => {
      let d = closed ? ((s % length) + length) % length : clamp(s, 0, length)
      let lo = 0, hi = cum.length - 1
      while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid }
      if (!closed && lo >= frames.length - 1) return frames[frames.length - 1]
      const a = frames[lo % frames.length], b = frames[(lo + 1) % frames.length]
      const seg = cum[lo + 1] - cum[lo] || 1
      const t = (d - cum[lo]) / seg
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), hx: a.hx, hz: a.hz }
    }
    return { frames, length, at }
  }
  const routes: Route[] = [
    makeRoute(HIGHWAY, true, true, 4.2),
    makeRoute([[-160, 0], [160, 0], [160, 160], [-160, 160]], true, false, 2.9),
    makeRoute(TOUGE, false, true, 2.2),
  ]

  const checkpoints = [
    { x: 0, z: 40 }, { x: 180, z: 60 }, { x: 305, z: 140 }, { x: 150, z: 325 },
    { x: -140, z: 330 }, { x: -285, z: 120 }, { x: -300, z: 10 }, { x: -352, z: -190 }, { x: -332, z: -448 },
  ]
  const minimapRoads = ROADS.map((r) => resample(r.pts, !!r.closed, !!r.smooth, 14))

  const update = (t: number) => {
    const phase = t % 9
    for (const s of signalMats) {
      s.green.emissiveIntensity = phase < 4 ? 2.2 : 0.06
      s.yellow.emissiveIntensity = phase >= 4 && phase < 5 ? 2.2 : 0.06
      s.red.emissiveIntensity = phase >= 5 ? 2.2 : 0.06
    }
  }

  return {
    group,
    heightAt: terrainHeight,
    roadInfo: roadInfoAt,
    colliders,
    routes,
    checkpoints,
    start: { x: 8, z: 196, heading: Math.PI },
    minimapRoads,
    update,
  }
}
