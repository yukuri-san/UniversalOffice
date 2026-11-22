import * as THREE from 'three'

/**
 * WebX ゲームエンジン：ワールド
 * 制御点（座標・道幅・ゾーン）から周回ワールドを生成する。
 * ゾーンは city（市街地）/ highway（高速道路）/ touge（峠）/ link（連絡路）。
 * フレームは「距離 s + 横位置 lat」で車両を置くための均一サンプリングで返す。
 */
export type Zone = 'city' | 'highway' | 'touge' | 'link'

export interface UFrame {
  pos: THREE.Vector3
  tan: THREE.Vector3
  side: THREE.Vector3
  curve: number // 符号つき曲率（左カーブが正）
  width: number // 道路全幅
  zone: Zone
}

export interface World {
  frames: UFrame[]
  length: number
  group: THREE.Group
  startS: number
}

interface Ctrl { x: number; y: number; z: number; w: number; zone: Zone }

const CTRL: Ctrl[] = [
  { x: 0, y: 0, z: 330, w: 11, zone: 'city' },
  { x: 150, y: 0, z: 335, w: 11, zone: 'city' },
  { x: 300, y: 0, z: 330, w: 11, zone: 'city' },
  { x: 400, y: 0, z: 300, w: 11, zone: 'city' },
  { x: 410, y: 0, z: 190, w: 11, zone: 'city' },
  { x: 400, y: 0, z: 90, w: 12, zone: 'link' },
  { x: 470, y: 2, z: 0, w: 17, zone: 'highway' },
  { x: 520, y: 4, z: -120, w: 17, zone: 'highway' },
  { x: 500, y: 6, z: -240, w: 17, zone: 'highway' },
  { x: 420, y: 10, z: -330, w: 15, zone: 'highway' },
  { x: 300, y: 16, z: -360, w: 11, zone: 'link' },
  { x: 200, y: 26, z: -320, w: 9, zone: 'touge' },
  { x: 230, y: 38, z: -240, w: 9, zone: 'touge' },
  { x: 150, y: 48, z: -190, w: 9, zone: 'touge' },
  { x: 60, y: 56, z: -250, w: 9, zone: 'touge' },
  { x: 10, y: 64, z: -330, w: 9, zone: 'touge' },
  { x: -90, y: 58, z: -290, w: 9, zone: 'touge' },
  { x: -80, y: 48, z: -200, w: 9, zone: 'touge' },
  { x: -160, y: 40, z: -160, w: 9, zone: 'touge' },
  { x: -240, y: 34, z: -220, w: 9, zone: 'touge' },
  { x: -300, y: 28, z: -300, w: 9, zone: 'touge' },
  { x: -260, y: 16, z: -270, w: 10, zone: 'link' },
  { x: -320, y: 10, z: -160, w: 10, zone: 'link' },
  { x: -280, y: 4, z: -40, w: 10, zone: 'link' },
  { x: -190, y: 0, z: 60, w: 11, zone: 'link' },
  { x: -90, y: 0, z: 130, w: 11, zone: 'city' },
  { x: -40, y: 0, z: 230, w: 11, zone: 'city' },
]

function buildFrames(): { frames: UFrame[]; length: number } {
  const curve = new THREE.CatmullRomCurve3(CTRL.map((c) => new THREE.Vector3(c.x, c.y, c.z)), true, 'catmullrom', 0.5)
  const widthCurve = new THREE.CatmullRomCurve3(CTRL.map((c) => new THREE.Vector3(c.w, 0, 0)), true, 'catmullrom', 0.5)
  const T = 3000
  const up = new THREE.Vector3(0, 1, 0)
  const raw: { pos: THREE.Vector3; tan: THREE.Vector3; width: number; zone: Zone; s: number }[] = []
  let acc = 0
  let prev: THREE.Vector3 | null = null
  for (let i = 0; i < T; i++) {
    const t = i / T
    const pos = curve.getPoint(t)
    const tan = curve.getTangent(t).normalize()
    if (prev) acc += pos.distanceTo(prev)
    prev = pos
    const segIdx = Math.floor(t * CTRL.length) % CTRL.length
    raw.push({ pos, tan, width: THREE.MathUtils.clamp(widthCurve.getPoint(t).x, 8, 18), zone: CTRL[segIdx].zone, s: acc })
  }
  const length = acc + raw[0].pos.distanceTo(raw[T - 1].pos)
  // 均一 s（2m 間隔）へ再サンプリング
  const M = Math.max(600, Math.floor(length / 2))
  const frames: UFrame[] = []
  let j = 0
  for (let i = 0; i < M; i++) {
    const s = (i / M) * length
    while (j < T - 2 && raw[j + 1].s < s) j++
    const a = raw[j]
    const b = raw[(j + 1) % T]
    const segLen = Math.max(0.001, (j + 1 < T ? b.s : length) - a.s)
    const f = THREE.MathUtils.clamp((s - a.s) / segLen, 0, 1)
    const pos = a.pos.clone().lerp(b.pos, f)
    const tan = a.tan.clone().lerp(b.tan, f).normalize()
    const side = new THREE.Vector3().crossVectors(tan, up).normalize()
    frames.push({ pos, tan, side, curve: 0, width: a.width + (b.width - a.width) * f, zone: f < 0.5 ? a.zone : b.zone })
  }
  const step = length / M
  for (let i = 0; i < M; i++) {
    const p = frames[(i - 1 + M) % M].tan
    const n = frames[(i + 1) % M].tan
    const cross = new THREE.Vector3().crossVectors(p, n)
    frames[i].curve = Math.atan2(cross.y, Math.max(-1, Math.min(1, p.dot(n)))) / (step * 2)
  }
  return { frames, length }
}

export function frameAt(frames: UFrame[], length: number, s: number): UFrame {
  const wrapped = ((s % length) + length) % length
  return frames[Math.floor((wrapped / length) * frames.length) % frames.length]
}

function strip(frames: UFrame[], length: number, offsetFn: (f: UFrame) => [number, number], yOff: number, mat: THREE.Material): THREE.Mesh {
  const M = frames.length
  const verts: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= M; i++) {
    const f = frames[i % M]
    const [lo, hi] = offsetFn(f)
    const a = f.pos.clone().addScaledVector(f.side, lo)
    const b = f.pos.clone().addScaledVector(f.side, hi)
    verts.push(a.x, a.y + yOff, a.z, b.x, b.y + yOff, b.z)
    if (i < M) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, mat)
}

function windowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 128
  cv.height = 256
  const g = cv.getContext('2d')
  if (g) {
    g.fillStyle = '#15171d'
    g.fillRect(0, 0, 128, 256)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 6; x++) {
        const lit = Math.random() < 0.42
        g.fillStyle = lit ? (Math.random() < 0.7 ? '#ffd9a0' : '#bcd6ff') : '#232833'
        g.fillRect(8 + x * 20, 10 + y * 15, 12, 8)
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function signTexture(lines: string[]): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 512
  cv.height = 192
  const g = cv.getContext('2d')
  if (g) {
    g.fillStyle = '#0a5c2e'
    g.fillRect(0, 0, 512, 192)
    g.strokeStyle = '#ffffff'
    g.lineWidth = 6
    g.strokeRect(8, 8, 496, 176)
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    lines.forEach((line, i) => {
      g.font = `bold ${i === 0 ? 64 : 44}px sans-serif`
      g.fillText(line, 256, 84 + i * 62)
    })
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function gantry(frames: UFrame[], length: number, s: number, tex: THREE.Texture, signW = 9): THREE.Group {
  const f = frameAt(frames, length, s)
  const g = new THREE.Group()
  const upv = new THREE.Vector3().crossVectors(f.side, f.tan).normalize()
  const basis = new THREE.Matrix4().makeBasis(f.side, upv, f.tan)
  g.quaternion.setFromRotationMatrix(basis)
  g.position.copy(f.pos)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x707880, metalness: 0.6, roughness: 0.5 })
  const half = f.width / 2 + 0.7
  for (const sx of [-half, half]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6.4, 8), poleMat)
    pole.position.set(sx, 3.2, 0)
    g.add(pole)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(f.width + 1.6, 0.35, 0.35), poleMat)
  beam.position.y = 6.2
  g.add(beam)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW * 0.375), new THREE.MeshBasicMaterial({ map: tex }))
  sign.position.set(0, 4.6, -0.25)
  sign.rotation.y = Math.PI
  g.add(sign)
  const back = new THREE.Mesh(new THREE.BoxGeometry(signW, signW * 0.375, 0.08), poleMat)
  back.position.set(0, 4.6, -0.2)
  g.add(back)
  return g
}

export function buildWorld(): World {
  const { frames, length } = buildFrames()
  const group = new THREE.Group()
  const M = frames.length

  // 道路本体
  group.add(strip(frames, length, (f) => [-f.width / 2, f.width / 2], 0, new THREE.MeshStandardMaterial({ color: 0x22242b, roughness: 0.95 })))
  // 路肩（明るめの帯）
  group.add(strip(frames, length, (f) => [f.width / 2, f.width / 2 + 0.9], -0.01, new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 1 })))
  group.add(strip(frames, length, (f) => [-f.width / 2 - 0.9, -f.width / 2], -0.01, new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 1 })))
  // 白線
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xaeb6bf })
  group.add(strip(frames, length, (f) => [f.width / 2 - 0.32, f.width / 2 - 0.14], 0.02, lineMat))
  group.add(strip(frames, length, (f) => [-f.width / 2 + 0.14, -f.width / 2 + 0.32], 0.02, lineMat))
  // 中央破線
  {
    const dashGeo = new THREE.BoxGeometry(0.2, 0.03, 3)
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8dde3 })
    const count = Math.floor(length / 10)
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, count)
    const m4 = new THREE.Matrix4()
    const basis = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const f = frameAt(frames, length, i * 10)
      const upv = new THREE.Vector3().crossVectors(f.side, f.tan).normalize()
      basis.makeBasis(f.side, upv, f.tan)
      m4.copy(basis).setPosition(f.pos.x, f.pos.y + 0.02, f.pos.z)
      inst.setMatrixAt(i, m4)
    }
    group.add(inst)
  }

  const dummy = new THREE.Object3D()
  const basis = new THREE.Matrix4()
  const m4 = new THREE.Matrix4()
  const setInst = (inst: THREE.InstancedMesh, i: number, f: UFrame, lat: number, y: number, sy = 1, sz = 1) => {
    const upv = new THREE.Vector3().crossVectors(f.side, f.tan).normalize()
    basis.makeBasis(f.side, upv, f.tan)
    const p = f.pos.clone().addScaledVector(f.side, lat)
    m4.copy(basis).setPosition(p.x, p.y + y, p.z)
    m4.scale(new THREE.Vector3(1, sy, sz))
    inst.setMatrixAt(i, m4)
  }

  // 峠・連絡路：ガードレール
  {
    const railFrames = frames.filter((f) => f.zone === 'touge' || f.zone === 'link')
    const stepF = 3
    const picked = railFrames.filter((_, i) => i % stepF === 0)
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.42, 1), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.65, roughness: 0.45 }), picked.length * 2)
    let ri = 0
    for (const f of picked) {
      const segLen = (length / M) * stepF * 1.05
      setInst(inst, ri++, f, f.width / 2 + 1.05, 0.55, 1, segLen)
      setInst(inst, ri++, f, -f.width / 2 - 1.05, 0.55, 1, segLen)
    }
    inst.count = ri
    group.add(inst)
  }
  // 高速：コンクリート壁
  {
    const hw = frames.filter((f) => f.zone === 'highway')
    const stepF = 3
    const picked = hw.filter((_, i) => i % stepF === 0)
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.85, 1), new THREE.MeshStandardMaterial({ color: 0x565d66, roughness: 0.9 }), picked.length * 2)
    let ri = 0
    for (const f of picked) {
      const segLen = (length / M) * stepF * 1.05
      setInst(inst, ri++, f, f.width / 2 + 0.7, 0.42, 1, segLen)
      setInst(inst, ri++, f, -f.width / 2 - 0.7, 0.42, 1, segLen)
    }
    inst.count = ri
    group.add(inst)
  }
  // 街灯（市街地・高速）
  {
    const lit = frames.filter((f, i) => (f.zone === 'city' || f.zone === 'highway') && i % 18 === 0)
    const poleInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 7.2, 6), new THREE.MeshStandardMaterial({ color: 0x3c4249, roughness: 0.7 }), lit.length)
    const lampInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), lit.length)
    lit.forEach((f, i) => {
      const sgn = i % 2 === 0 ? 1 : -1
      setInst(poleInst, i, f, sgn * (f.width / 2 + 1.3), 3.6)
      setInst(lampInst, i, f, sgn * (f.width / 2 + 0.9), 7.2)
    })
    group.add(poleInst)
    group.add(lampInst)
  }
  // 市街地：ビル群
  {
    const cityFrames = frames.filter((f) => f.zone === 'city')
    const tex = windowTexture()
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 130)
    let bi = 0
    for (let i = 0; i < cityFrames.length && bi < 130; i += 7) {
      const f = cityFrames[i]
      for (const sgn of [-1, 1]) {
        if (bi >= 130 || Math.random() < 0.25) continue
        const off = f.width / 2 + 11 + Math.random() * 20
        const h = 13 + Math.random() * 42
        const p = f.pos.clone().addScaledVector(f.side, sgn * off)
        dummy.position.set(p.x, f.pos.y + h / 2 - 1, p.z)
        dummy.rotation.set(0, Math.atan2(f.tan.x, f.tan.z), 0)
        dummy.scale.set(13 + Math.random() * 13, h, 13 + Math.random() * 13)
        dummy.updateMatrix()
        inst.setMatrixAt(bi++, dummy.matrix)
      }
    }
    inst.count = bi
    group.add(inst)
    // 歩道
    group.add(strip(frames, length, (f) => (f.zone === 'city' ? [f.width / 2 + 0.9, f.width / 2 + 3.4] : [0, 0]), 0.0, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 })))
    group.add(strip(frames, length, (f) => (f.zone === 'city' ? [-f.width / 2 - 3.4, -f.width / 2 - 0.9] : [0, 0]), 0.0, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 1 })))
  }
  // 峠・連絡路：木
  {
    const treeGeo = new THREE.ConeGeometry(1.7, 5.6, 6)
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x0e2c1a, roughness: 1 })
    const inst = new THREE.InstancedMesh(treeGeo, treeMat, 620)
    let ti = 0
    for (let i = 0; i < 620; i++) {
      const f = frames[Math.floor(Math.random() * M)]
      if (f.zone !== 'touge' && f.zone !== 'link') continue
      const sgn = Math.random() < 0.5 ? -1 : 1
      const off = f.width / 2 + 5 + Math.random() * 42
      const p = f.pos.clone().addScaledVector(f.side, sgn * off)
      dummy.position.set(p.x, p.y - (off - f.width / 2) * 0.28 + 2.0, p.z)
      dummy.rotation.set(0, Math.random() * Math.PI, 0)
      const sc = 0.8 + Math.random() * 1.6
      dummy.scale.set(sc, sc, sc)
      dummy.updateMatrix()
      inst.setMatrixAt(ti++, dummy.matrix)
    }
    inst.count = ti
    group.add(inst)
  }
  // 遠景の山と地面
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a1224 })
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3
      const r = 750 + Math.random() * 300
      const h = 190 + Math.random() * 150
      const cone = new THREE.Mesh(new THREE.ConeGeometry(240 + Math.random() * 150, h, 5), mat)
      cone.position.set(80 + Math.cos(a) * r, h / 2 - 40, -20 + Math.sin(a) * r)
      group.add(cone)
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1600, 32), new THREE.MeshBasicMaterial({ color: 0x060a12 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -42
    group.add(ground)
  }
  // 案内サイン（高速）とスタートゲート
  group.add(gantry(frames, length, length * 0.30, signTexture(['峠方面', 'TOUGE PASS'])))
  group.add(gantry(frames, length, length * 0.52, signTexture(['市街地', 'CITY'])))
  group.add(gantry(frames, length, 6, signTexture(['START', 'フリー走行・バトル'])))
  return { frames, length, group, startS: 0 }
}
