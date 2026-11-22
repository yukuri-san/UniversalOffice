// ボクセルワールド3D（Minecraft風サンドボックス）
// チャンクメッシュ・地形生成・一人称操作・ブロック破壊/設置・セーブ対応
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Engine } from '../../engine/engine'

const W = 96, H = 36, CH = 16, WATER_Y = 9
const AIR = 0
interface BlockDef { name: string; top: number; bottom: number; side: number; solid: boolean }
const BLOCKS: Record<number, BlockDef> = {
  1: { name: '草', top: 0, bottom: 2, side: 1, solid: true },
  2: { name: '土', top: 2, bottom: 2, side: 2, solid: true },
  3: { name: '石', top: 3, bottom: 3, side: 3, solid: true },
  4: { name: '砂', top: 4, bottom: 4, side: 4, solid: true },
  5: { name: '原木', top: 6, bottom: 6, side: 5, solid: true },
  6: { name: '葉', top: 7, bottom: 7, side: 7, solid: true },
  7: { name: '木材', top: 8, bottom: 8, side: 8, solid: true },
  8: { name: 'ガラス', top: 9, bottom: 9, side: 9, solid: true },
  9: { name: 'レンガ', top: 10, bottom: 10, side: 10, solid: true },
  10: { name: '水', top: 11, bottom: 11, side: 11, solid: false },
}
const HOTBAR = [1, 2, 3, 4, 5, 7, 8, 9, 6]

// ---- テクスチャアトラス（手続き生成、外部アセットなし） ----
function makeAtlas(): THREE.Texture {
  const T = 64, COLS = 4
  const cv = document.createElement('canvas'); cv.width = T * COLS; cv.height = T * COLS
  const ctx = cv.getContext('2d')!
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const fill = (tile: number, base: string, fleck: string, n = 260) => {
    const ox = (tile % COLS) * T, oy = Math.floor(tile / COLS) * T
    ctx.fillStyle = base; ctx.fillRect(ox, oy, T, T)
    ctx.fillStyle = fleck
    for (let i = 0; i < n; i++) ctx.fillRect(ox + Math.random() * T, oy + Math.random() * T, rnd(1.5, 3.6), rnd(1.5, 3.6))
  }
  fill(0, '#63b245', '#4c9133') // 草（上面）
  fill(2, '#8a5f3c', '#6f4a2d') // 土
  fill(3, '#7d7d7d', '#666666', 170) // 石
  fill(4, '#ddd29a', '#c9bc7f') // 砂
  fill(7, '#2f6b2f', '#1e4d1e', 380) // 葉
  fill(8, '#a9824f', '#8a6a3e') // 木材
  fill(11, '#3a6fd8', '#5b8de8', 130) // 水
  // 草（側面）
  {
    const ox = 1 * T, oy = 0
    ctx.fillStyle = '#8a5f3c'; ctx.fillRect(ox, oy, T, T)
    ctx.fillStyle = '#6f4a2d'
    for (let i = 0; i < 200; i++) ctx.fillRect(ox + Math.random() * T, oy + Math.random() * T, 2.4, 2.4)
    ctx.fillStyle = '#63b245'; ctx.fillRect(ox, oy, T, 15)
    ctx.fillStyle = '#4c9133'
    for (let x = 0; x < T; x += 4) ctx.fillRect(ox + x, oy + 13, 3, rnd(3, 8))
  }
  // 原木（側面）
  {
    const ox = 5 * T, oy = 0
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(ox, oy, T, T)
    ctx.fillStyle = '#54381f'
    for (let x = 4; x < T; x += 11) ctx.fillRect(ox + x, oy, 4, T)
    ctx.fillStyle = '#7d5a36'
    for (let x = 9; x < T; x += 13) ctx.fillRect(ox + x, oy, 2, T)
  }
  // 原木（上面・年輪）
  {
    const ox = 2 * T, oy = 1 * T
    ctx.fillStyle = '#b08b57'; ctx.fillRect(ox, oy, T, T)
    ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 3
    for (let r = 7; r < 32; r += 8) { ctx.beginPath(); ctx.arc(ox + 32, oy + 32, r, 0, Math.PI * 2); ctx.stroke() }
    ctx.strokeStyle = '#6b4a2b'; ctx.strokeRect(ox + 1, oy + 1, T - 2, T - 2)
  }
  // ガラス
  {
    const ox = 1 * T, oy = 2 * T
    ctx.fillStyle = '#cfe8f2'; ctx.fillRect(ox, oy, T, T)
    ctx.fillStyle = '#a8cede'; ctx.fillRect(ox + 5, oy + 5, T - 10, T - 10)
    ctx.strokeStyle = '#eef8fc'; ctx.lineWidth = 4; ctx.strokeRect(ox + 2, oy + 2, T - 4, T - 4)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(ox + 12, oy + 50); ctx.lineTo(ox + 34, oy + 14); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox + 30, oy + 52); ctx.lineTo(ox + 46, oy + 26); ctx.stroke()
  }
  // レンガ
  {
    const ox = 2 * T, oy = 2 * T
    ctx.fillStyle = '#b5a89c'; ctx.fillRect(ox, oy, T, T)
    ctx.fillStyle = '#a2432f'
    const bh = 15
    for (let row = 0; row < 4; row++) {
      const off = row % 2 === 0 ? 0 : 16
      for (let bx = -1; bx < 3; bx++) ctx.fillRect(ox + bx * 32 + off + 2, oy + row * bh + 2, 28, bh - 4)
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
const uvOf = (tile: number): [number, number] => {
  const C = 4
  return [(tile % C) / C, 1 - (Math.floor(tile / C) + 1) / C]
}

// ---- ノイズ地形 ----
function hash2(x: number, z: number, seed: number): number {
  let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}
function smoothNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}
function terrainH(x: number, z: number, seed: number): number {
  const n = smoothNoise(x / 22, z / 22, seed) * 0.65 + smoothNoise(x / 7, z / 7, seed + 9) * 0.35
  return Math.max(2, Math.min(H - 12, Math.floor(6 + n * 13)))
}

const FACES: { dir: [number, number, number]; corners: [number, number, number][]; kind: 'top' | 'bottom' | 'side' }[] = [
  { dir: [1, 0, 0], kind: 'side', corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], kind: 'side', corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], kind: 'top', corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], kind: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], kind: 'side', corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], kind: 'side', corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
]

export default function VoxelWorld() {
  const mountRef = useRef<HTMLDivElement>(null)
  const joyBaseRef = useRef<HTMLDivElement>(null)
  const joyKnobRef = useRef<HTMLDivElement>(null)
  const ctlRef = useRef<{ setBlock: (i: number) => void; toggleFly: () => void }>({ setBlock: () => {}, toggleFly: () => {} })
  const [phase, setPhase] = useState<'title' | 'play'>('title')
  const [sel, setSel] = useState(0)
  const [fly, setFly] = useState(false)
  const [locked, setLocked] = useState(false)
  const [hasSave, setHasSave] = useState(() => { try { return !!localStorage.getItem('webx-voxel-save') } catch { return false } })
  const [seedLabel, setSeedLabel] = useState('')
  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window

  useEffect(() => {
    if (phase !== 'play') return
    const mount = mountRef.current
    if (!mount) return
    const engine = new Engine(mount)
    engine.setupDay()
    engine.scene.fog = new THREE.Fog(0x9fc8e8, 40, 130)
    const atlas = makeAtlas()
    const mat = new THREE.MeshLambertMaterial({ map: atlas })
    const waterMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, opacity: 0.72 })

    // ワールドデータ
    let seed = 20261122
    let diff: Record<string, number> = {}
    try {
      const raw = localStorage.getItem('webx-voxel-save')
      if (raw) { const p = JSON.parse(raw) as { seed: number; diff: Record<string, number> }; seed = p.seed; diff = p.diff }
    } catch { /* ignore */ }
    setSeedLabel(String(seed))
    const data = new Uint8Array(W * H * W)
    const idx = (x: number, y: number, z: number) => (y * W + z) * W + x
    const inB = (x: number, y: number, z: number) => x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < W
    const get = (x: number, y: number, z: number): number => (inB(x, y, z) ? data[idx(x, y, z)] : AIR)
    const set = (x: number, y: number, z: number, v: number) => { if (inB(x, y, z)) data[idx(x, y, z)] = v }
    for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
      const h = terrainH(x, z, seed)
      for (let y = 0; y <= h; y++) {
        if (y === 0) set(x, y, z, 3)
        else if (y === h) set(x, y, z, h <= WATER_Y + 1 ? 4 : 1)
        else if (y > h - 3) set(x, y, z, h <= WATER_Y + 1 ? 4 : 2)
        else set(x, y, z, 3)
      }
      for (let y = h + 1; y <= WATER_Y; y++) set(x, y, z, 10)
    }
    // 木
    for (let x = 3; x < W - 3; x++) for (let z = 3; z < W - 3; z++) {
      const h = terrainH(x, z, seed)
      if (get(x, h, z) !== 1 || hash2(x * 3, z * 7, seed + 31) > 0.014) continue
      const th = 4 + Math.floor(hash2(x, z, seed + 7) * 2)
      for (let y = h + 1; y <= h + th; y++) set(x, y, z, 5)
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy !== 0) continue
        const px = x + dx, py = h + th + dy, pz = z + dz
        if (get(px, py, pz) === AIR) set(px, py, pz, 6)
      }
      set(x, h + th + 1, z, 6)
    }
    for (const [k, v] of Object.entries(diff)) {
      const [x, y, z] = k.split(',').map(Number)
      set(x, y, z, v)
    }
    const saveWorld = () => {
      try { localStorage.setItem('webx-voxel-save', JSON.stringify({ seed, diff })) } catch { /* ignore */ }
      setHasSave(true)
    }

    // チャンクメッシュ
    const NCX = W / CH
    const meshes = new Map<string, THREE.Mesh>()
    const waterMeshes = new Map<string, THREE.Mesh>()
    const dirty = new Set<string>()
    const key = (cx: number, cz: number) => `${cx},${cz}`
    const buildChunk = (cx: number, cz: number) => {
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], ind: number[] = []
      const wpos: number[] = [], wnor: number[] = [], wuv: number[] = [], wind: number[] = []
      for (let x = cx * CH; x < (cx + 1) * CH; x++) for (let z = cz * CH; z < (cz + 1) * CH; z++) for (let y = 0; y < H; y++) {
        const b = get(x, y, z)
        if (b === AIR) continue
        const def = BLOCKS[b]
        const isWater = b === 10
        for (const f of FACES) {
          const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2]
          const nb = get(nx, ny, nz)
          if (nb !== AIR && BLOCKS[nb]?.solid) continue
          if (isWater && nb === 10) continue
          if (!isWater && nb === 10 && f.dir[1] === 1) { /* 上面は水越しに見えるので描く */ }
          else if (!isWater && nb !== AIR && !BLOCKS[nb]?.solid && nb !== 10) continue
          const tile = f.kind === 'top' ? def.top : f.kind === 'bottom' ? def.bottom : def.side
          const [u0, v0] = uvOf(tile)
          const T = 1 / 4 - 0.002, U = 0.001
          const uvs: [number, number][] = [[u0 + U, v0 + U], [u0 + T, v0 + U], [u0 + T, v0 + T + 0.002], [u0 + U, v0 + T + 0.002]]
          const P = isWater ? wpos : pos, N = isWater ? wnor : nor, V = isWater ? wuv : uv, I = isWater ? wind : ind
          const base = P.length / 3
          f.corners.forEach((c, ci) => {
            P.push(x + c[0], y + c[1] - (isWater ? 0.12 : 0), z + c[2])
            N.push(f.dir[0], f.dir[1], f.dir[2])
            V.push(uvs[ci][0], uvs[ci][1])
          })
          I.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
      }
      const mk = (P: number[], N: number[], V: number[], I: number[], M: THREE.Material, store: Map<string, THREE.Mesh>) => {
        const old = store.get(key(cx, cz))
        if (old) { engine.scene.remove(old); old.geometry.dispose(); store.delete(key(cx, cz)) }
        if (I.length === 0) return
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3))
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3))
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(V), 2))
        g.setIndex(I)
        const mesh = new THREE.Mesh(g, M)
        mesh.matrixAutoUpdate = false
        engine.scene.add(mesh)
        store.set(key(cx, cz), mesh)
      }
      mk(pos, nor, uv, ind, mat, meshes)
      mk(wpos, wnor, wuv, wind, waterMat, waterMeshes)
    }
    for (let cx = 0; cx < NCX; cx++) for (let cz = 0; cz < NCX; cz++) buildChunk(cx, cz)

    // ハイライト
    const hl = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x101418 }),
    )
    hl.visible = false
    engine.scene.add(hl)

    // プレイヤー
    const spawnH = terrainH(W / 2, W / 2, seed)
    const player = {
      pos: new THREE.Vector3(W / 2 + 0.5, spawnH + 2.2, W / 2 + 0.5),
      vel: new THREE.Vector3(),
      yaw: Math.PI * 0.75, pitch: -0.1,
      onGround: false, fly: false,
    }
    const keys = new Set<string>()
    let selIdx = 0
    let mouseBreak = false, mousePlace = false
    const joy = { active: false, dx: 0, dy: 0, id: -1 }
    const touchBtn = { jump: false, brk: false, place: false, up: false, down: false }
    ctlRef.current = {
      setBlock: (i: number) => { selIdx = i; setSel(i) },
      toggleFly: () => { player.fly = !player.fly; setFly(player.fly); player.vel.y = 0 },
    }

    const solidAt = (x: number, y: number, z: number) => {
      const b = get(Math.floor(x), Math.floor(y), Math.floor(z))
      return b !== AIR && !!BLOCKS[b]?.solid
    }
    const collide = (p: THREE.Vector3, dt: number) => {
      const hw = 0.32, ph = 1.8
      // Y
      p.y += player.vel.y * dt
      player.onGround = false
      {
        const minX = Math.floor(p.x - hw), maxX = Math.floor(p.x + hw)
        const minZ = Math.floor(p.z - hw), maxZ = Math.floor(p.z + hw)
        if (player.vel.y <= 0) {
          const fy = Math.floor(p.y)
          outer: for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
            if (solidAt(x + 0.5, fy + 0.5, z + 0.5)) { p.y = fy + 1; player.vel.y = 0; player.onGround = true; break outer }
          }
        } else {
          const hy = Math.floor(p.y + ph)
          outer2: for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
            if (solidAt(x + 0.5, hy + 0.5, z + 0.5)) { p.y = hy - ph - 0.01; player.vel.y = 0; break outer2 }
          }
        }
      }
      // X
      p.x += player.vel.x * dt
      for (let x = Math.floor(p.x - hw); x <= Math.floor(p.x + hw); x++) for (let y = Math.floor(p.y); y <= Math.floor(p.y + ph); y++) for (let z = Math.floor(p.z - hw); z <= Math.floor(p.z + hw); z++) {
        if (!solidAt(x + 0.5, y + 0.5, z + 0.5)) continue
        if (player.vel.x > 0) p.x = Math.min(p.x, x - hw - 0.01)
        else if (player.vel.x < 0) p.x = Math.max(p.x, x + 1 + hw + 0.01)
      }
      // Z
      p.z += player.vel.z * dt
      for (let x = Math.floor(p.x - hw); x <= Math.floor(p.x + hw); x++) for (let y = Math.floor(p.y); y <= Math.floor(p.y + ph); y++) for (let z = Math.floor(p.z - hw); z <= Math.floor(p.z + hw); z++) {
        if (!solidAt(x + 0.5, y + 0.5, z + 0.5)) continue
        if (player.vel.z > 0) p.z = Math.min(p.z, z - hw - 0.01)
        else if (player.vel.z < 0) p.z = Math.max(p.z, z + 1 + hw + 0.01)
      }
      p.x = THREE.MathUtils.clamp(p.x, 1, W - 1)
      p.z = THREE.MathUtils.clamp(p.z, 1, W - 1)
      if (p.y < 1) { p.y = 1; player.vel.y = 0; player.onGround = true }
    }

    const raycast = (): { x: number; y: number; z: number; px: number; py: number; pz: number } | null => {
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'))
      const origin = player.pos.clone(); origin.y += 1.62
      let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z)
      const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1
      const tdx = Math.abs(1 / (dir.x || 1e-9)), tdy = Math.abs(1 / (dir.y || 1e-9)), tdz = Math.abs(1 / (dir.z || 1e-9))
      let tmx = ((dir.x > 0 ? x + 1 - origin.x : origin.x - x)) * tdx
      let tmy = ((dir.y > 0 ? y + 1 - origin.y : origin.y - y)) * tdy
      let tmz = ((dir.z > 0 ? z + 1 - origin.z : origin.z - z)) * tdz
      let px = x, py = y, pz = z, t = 0
      for (let i = 0; i < 128 && t <= 7; i++) {
        const b = get(x, y, z)
        if (b !== AIR && b !== 10) return { x, y, z, px, py, pz }
        px = x; py = y; pz = z
        if (tmx < tmy && tmx < tmz) { x += stepX; t = tmx; tmx += tdx }
        else if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy }
        else { z += stepZ; t = tmz; tmz += tdz }
      }
      return null
    }
    const edit = (place: boolean) => {
      const hit = raycast()
      if (!hit) return
      const tx = place ? hit.px : hit.x, ty = place ? hit.py : hit.y, tz = place ? hit.pz : hit.z
      if (!inB(tx, ty, tz)) return
      if (place) {
        // プレイヤーと重なる場所には置かない
        const p = player.pos
        if (tx >= Math.floor(p.x - 0.32) && tx <= Math.floor(p.x + 0.32) && tz >= Math.floor(p.z - 0.32) && tz <= Math.floor(p.z + 0.32) && ty >= Math.floor(p.y) && ty <= Math.floor(p.y + 1.8)) return
        if (get(tx, ty, tz) !== AIR && get(tx, ty, tz) !== 10) return
        set(tx, ty, tz, HOTBAR[selIdx])
        diff[`${tx},${ty},${tz}`] = HOTBAR[selIdx]
      } else {
        if (ty === 0) return
        set(tx, ty, tz, AIR)
        diff[`${tx},${ty},${tz}`] = AIR
      }
      dirty.add(key(Math.floor(tx / CH), Math.floor(tz / CH)))
      if (tx % CH === 0) dirty.add(key(Math.floor(tx / CH) - 1, Math.floor(tz / CH)))
      if (tx % CH === CH - 1) dirty.add(key(Math.floor(tx / CH) + 1, Math.floor(tz / CH)))
      if (tz % CH === 0) dirty.add(key(Math.floor(tx / CH), Math.floor(tz / CH) - 1))
      if (tz % CH === CH - 1) dirty.add(key(Math.floor(tx / CH), Math.floor(tz / CH) + 1))
      saveWorld()
    }

    // 入力
    const dom = engine.renderer.domElement
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      keys.add(k)
      if (k === ' ') e.preventDefault()
      if (k === 'f') ctlRef.current.toggleFly()
      const n = parseInt(k)
      if (n >= 1 && n <= 9) { selIdx = n - 1; setSel(n - 1) }
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== dom) return
      player.yaw -= e.movementX * 0.0023
      player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0023, -1.55, 1.55)
    }
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== dom) { dom.requestPointerLock(); return }
      if (e.button === 0) { mouseBreak = true; edit(false) }
      if (e.button === 2) { mousePlace = true; edit(true) }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseBreak = false
      if (e.button === 2) mousePlace = false
    }
    const onCtx = (e: Event) => e.preventDefault()
    const onLockChange = () => setLocked(document.pointerLockElement === dom)
    const onWheel = (e: WheelEvent) => {
      selIdx = (selIdx + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length
      setSel(selIdx)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    dom.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    dom.addEventListener('contextmenu', onCtx)
    dom.addEventListener('wheel', onWheel)
    document.addEventListener('pointerlockchange', onLockChange)

    // タッチ（左側＝アナログスティック：触れた場所を中心に倒した方向・量で移動／右側＝視点ドラッグ）
    const touchState = new Map<number, { x: number; y: number; ox: number; oy: number; role: string }>()
    const showJoy = (cx: number, cy: number) => {
      const base = joyBaseRef.current, knob = joyKnobRef.current
      if (!base || !knob) return
      const r = mount.getBoundingClientRect()
      base.style.display = 'block'
      base.style.left = `${cx - r.left - 48}px`
      base.style.top = `${cy - r.top - 48}px`
      knob.style.transform = 'translate(0px, 0px)'
    }
    const hideJoy = () => { const base = joyBaseRef.current; if (base) base.style.display = 'none' }
    const onTouchStart = (e: TouchEvent) => {
      const r = dom.getBoundingClientRect()
      for (const t of Array.from(e.changedTouches)) {
        const role = (t.clientX - r.left) < r.width * 0.42 ? 'joy' : 'look'
        touchState.set(t.identifier, { x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, role })
        if (role === 'joy') { joy.active = true; joy.id = t.identifier; joy.dx = 0; joy.dy = 0; showJoy(t.clientX, t.clientY) }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) {
        const s = touchState.get(t.identifier)
        if (!s) continue
        if (s.role === 'look') {
          player.yaw -= (t.clientX - s.x) * 0.005
          player.pitch = THREE.MathUtils.clamp(player.pitch - (t.clientY - s.y) * 0.005, -1.55, 1.55)
        } else {
          const rawX = t.clientX - s.ox, rawY = t.clientY - s.oy
          const len = Math.hypot(rawX, rawY), max = 46
          const cl = len > max ? max / len : 1
          joy.dx = (rawX * cl) / max
          joy.dy = (rawY * cl) / max
          const knob = joyKnobRef.current
          if (knob) knob.style.transform = `translate(${rawX * cl}px, ${rawY * cl}px)`
        }
        s.x = t.clientX; s.y = t.clientY
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const s = touchState.get(t.identifier)
        if (s?.role === 'joy') { joy.active = false; joy.dx = 0; joy.dy = 0; hideJoy() }
        touchState.delete(t.identifier)
      }
    }
    dom.addEventListener('touchstart', onTouchStart, { passive: true })
    dom.addEventListener('touchmove', onTouchMove, { passive: false })
    dom.addEventListener('touchend', onTouchEnd)
    dom.addEventListener('touchcancel', onTouchEnd)
    ;(mount as unknown as { __touchBtn: typeof touchBtn }).__touchBtn = touchBtn
    ;(mount as unknown as { __edit: typeof edit }).__edit = edit

    let breakCd = 0, placeCd = 0
    engine.start((dt) => {
      dt = Math.min(dt, 0.05)
      // 移動入力
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw)
      let mx = 0, mz = 0
      if (keys.has('w') || keys.has('arrowup')) mz += 1
      if (keys.has('s') || keys.has('arrowdown')) mz -= 1
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1
      if (keys.has('d') || keys.has('arrowright')) mx += 1
      if (joy.active) { mx += joy.dx; mz -= joy.dy }
      const len = Math.hypot(mx, mz)
      if (len > 1) { mx /= len; mz /= len }
      const speed = player.fly ? 11 : (keys.has('shift') ? 7.6 : 5.4)
      const fwdX = -sin, fwdZ = -cos
      const rightX = cos, rightZ = -sin
      player.vel.x = (fwdX * mz + rightX * mx) * speed
      player.vel.z = (fwdZ * mz + rightZ * mx) * speed
      if (player.fly) {
        let vy = 0
        if (keys.has(' ') || touchBtn.up || touchBtn.jump) vy += 9
        if (keys.has('control') || touchBtn.down) vy -= 9
        player.vel.y = vy
      } else {
        player.vel.y -= 26 * dt
        if (player.vel.y < -38) player.vel.y = -38
        if ((keys.has(' ') || touchBtn.jump) && player.onGround) player.vel.y = 8.8
      }
      collide(player.pos, dt)
      if (touchBtn.brk) { breakCd -= dt; if (breakCd <= 0) { edit(false); breakCd = 0.22 } }
      if (touchBtn.place) { placeCd -= dt; if (placeCd <= 0) { edit(true); placeCd = 0.22 } }

      // 連続編集（マウス長押し）
      breakCd -= dt; placeCd -= dt
      if (mouseBreak && breakCd <= 0) { edit(false); breakCd = 0.22 }
      if (mousePlace && placeCd <= 0) { edit(true); placeCd = 0.22 }

      // ハイライト
      const hit = raycast()
      if (hit) {
        hl.visible = true
        hl.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
      } else hl.visible = false

      // チャンク再構築
      if (dirty.size) {
        for (const k of Array.from(dirty)) {
          const [cx, cz] = k.split(',').map(Number)
          if (cx >= 0 && cx < NCX && cz >= 0 && cz < NCX) buildChunk(cx, cz)
        }
        dirty.clear()
      }

      const cam = engine.camera as THREE.PerspectiveCamera
      cam.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z)
      cam.rotation.order = 'YXZ'
      cam.rotation.set(player.pitch, player.yaw, 0)
      cam.fov = 74
      cam.updateProjectionMatrix()
    })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      dom.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      dom.removeEventListener('contextmenu', onCtx)
      dom.removeEventListener('wheel', onWheel)
      document.removeEventListener('pointerlockchange', onLockChange)
      dom.removeEventListener('touchstart', onTouchStart)
      dom.removeEventListener('touchmove', onTouchMove)
      dom.removeEventListener('touchend', onTouchEnd)
      dom.removeEventListener('touchcancel', onTouchEnd)
      engine.dispose()
      mount.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const tbtn: React.CSSProperties = {
    pointerEvents: 'auto', width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(10,14,20,0.5)', color: '#fff', fontWeight: 900, fontSize: 12, touchAction: 'none',
  }
  const touchBtnOf = (name: 'jump' | 'brk' | 'place' | 'up' | 'down') => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation()
      const m = mountRef.current as unknown as { __touchBtn?: Record<string, boolean>; __edit?: (p: boolean) => void } | null
      if (m?.__touchBtn) m.__touchBtn[name] = true
      if (name === 'brk' && m?.__edit) m.__edit(false)
      if (name === 'place' && m?.__edit) m.__edit(true)
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation()
      const m = mountRef.current as unknown as { __touchBtn?: Record<string, boolean> } | null
      if (m?.__touchBtn) m.__touchBtn[name] = false
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.stopPropagation()
      const m = mountRef.current as unknown as { __touchBtn?: Record<string, boolean> } | null
      if (m?.__touchBtn) m.__touchBtn[name] = false
    },
  })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#79a6d2', touchAction: 'none', userSelect: 'none' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {phase === 'play' && (
        <>
          {/* 照準 */}
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: '#fff', fontSize: 20, textShadow: '0 0 3px #000', pointerEvents: 'none' }}>＋</div>
          {!isTouch && !locked && (
            <div style={{ position: 'absolute', top: '18%', left: 0, right: 0, textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: 17, textShadow: '2px 2px 0 #000', pointerEvents: 'none' }}>
              画面をクリックで操作開始（WASD移動／左クリック破壊／右クリック設置／F飛行）
            </div>
          )}
          {/* ホットバー */}
          <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', display: 'flex', gap: 4, pointerEvents: 'auto' }}>
            {HOTBAR.map((b, i) => (
              <button
                key={b}
                onClick={() => ctlRef.current.setBlock(i)}
                style={{
                  width: 46, height: 46, borderRadius: 6, cursor: 'pointer',
                  border: sel === i ? '3px solid #fff' : '2px solid rgba(0,0,0,0.45)',
                  background: `linear-gradient(180deg, ${['#63b245', '#8a5f3c', '#7d7d7d', '#ddd29a', '#6b4a2b', '#a9824f', '#cfe8f2', '#a2432f', '#2f6b2f'][i]} 0%, rgba(0,0,0,0.25) 130%)`,
                  color: '#fff', fontWeight: 900, fontSize: 11, textShadow: '1px 1px 0 #000', padding: 0,
                }}
              >
                {BLOCKS[b].name}
              </button>
            ))}
          </div>
          <div style={{ position: 'absolute', top: 8, left: 10, color: '#fff', fontSize: 12, fontWeight: 800, textShadow: '1px 1px 0 #000', pointerEvents: 'none' }}>
            シード {seedLabel}／{fly ? '飛行中（Fで切替）' : '歩行'}／変更は自動保存
          </div>
          <button
            onClick={() => ctlRef.current.toggleFly()}
            style={{ position: 'absolute', top: 8, right: 10, pointerEvents: 'auto', padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(10,14,20,0.55)', color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
          >
            {fly ? '🕊 飛行ON' : '🚶 飛行OFF'}
          </button>
          {isTouch && (
            <>
              <div style={{ position: 'absolute', right: 12, bottom: 76, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button style={tbtn} {...touchBtnOf('up')}>上昇</button>
                <button style={tbtn} {...touchBtnOf('jump')}>ジャンプ</button>
                <button style={tbtn} {...touchBtnOf('down')}>下降</button>
              </div>
              <div style={{ position: 'absolute', right: 80, bottom: 76, display: 'flex', gap: 10 }}>
                <button style={tbtn} {...touchBtnOf('brk')}>壊す</button>
                <button style={tbtn} {...touchBtnOf('place')}>置く</button>
              </div>
              <div ref={joyBaseRef} style={{ position: 'absolute', width: 96, height: 96, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', background: 'rgba(10,14,20,0.3)', display: 'none', pointerEvents: 'none', zIndex: 6 }}>
                <div ref={joyKnobRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.65)' }} />
              </div>
            </>
          )}
        </>
      )}

      {phase === 'title' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(30,60,30,0.35), rgba(10,20,10,0.8))', padding: 14, overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 500, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: '#7ddb4f', textShadow: '3px 3px 0 #2c5a1e, 6px 6px 0 rgba(0,0,0,0.45)' }}>ボクセルワールド3D</div>
            <div style={{ fontSize: 12.5, color: '#e2f0da', marginTop: 3 }}>Minecraft風サンドボックス／掘って、置いて、自由に建築</div>
            <div style={{ textAlign: 'left', fontSize: 12.5, lineHeight: 1.8, background: 'rgba(8,14,8,0.6)', borderRadius: 10, padding: '10px 13px', marginTop: 12 }}>
              ・PC：WASD移動、Spaceジャンプ、左クリック長押しで破壊、右クリックで設置、1〜9／ホイールでブロック選択、Fで飛行切替<br />
              ・スマホ：左側を触るとスティックが出て、倒した方向へ移動。右側ドラッグで視点、ボタンでジャンプ・破壊・設置（長押しで連続）<br />
              ・地形・木・水は自動生成。掘った・置いた変更は自動で端末に保存される
            </div>
            <button
              onClick={() => setPhase('play')}
              style={{ marginTop: 12, width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(180deg, #7ddb4f, #43a02c)', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}
            >
              ▶ {hasSave ? 'つづきから' : 'ワールドへ'}
            </button>
            {hasSave && (
              <button
                onClick={() => { try { localStorage.removeItem('webx-voxel-save') } catch { /* ignore */ } setHasSave(false); setPhase('play') }}
                style={{ marginTop: 8, width: '100%', padding: '10px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(10,14,10,0.5)', color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
              >
                セーブを消して新規ワールド
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
