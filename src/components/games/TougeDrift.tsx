import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'

/**
 * 峠ドリフト3D：夜の峠を舞台にした Three.js 製 3D ドリフトレース。
 * コースは Catmull-Rom スプラインの周回路。車の物理は「コース距離 s + 横位置 lat」の
 * アーケードモデルで、ドリフト時は横滑りとカウンターステア表現が入る。
 * ライバルカーと 1 周勝負。BGM（ユーロビート風）とエンジン音は WebAudio で合成する。
 */

const BEST_KEY = 'webx-touge-best'
const HALF_W = 5.2 // 道路半幅 (m)
const SAMPLES = 1600

interface Frame { pos: THREE.Vector3; tan: THREE.Vector3; side: THREE.Vector3; curve: number }
interface HudState { kmh: number; time: number; gap: number; drift: number; pos: number; progP: number; progR: number; count: number; drifting: boolean }
type Phase = 'title' | 'count' | 'race' | 'goal'

function buildTrack(): { frames: Frame[]; length: number } {
  const pts: [number, number, number][] = [
    [0, 0, -260], [90, 6, -215], [150, 14, -140], [120, 26, -60], [165, 38, 20], [250, 46, 55],
    [320, 40, 0], [330, 30, -80], [390, 22, -150], [470, 26, -120], [520, 38, -40], [480, 52, 40],
    [520, 62, 120], [460, 58, 190], [380, 48, 170], [330, 55, 240], [240, 62, 260], [170, 54, 200],
    [90, 44, 235], [30, 34, 170], [70, 24, 100], [20, 14, 40], [-40, 6, 90], [-90, 10, 160],
    [-160, 18, 130], [-190, 26, 50], [-150, 20, -30], [-190, 12, -110], [-140, 6, -180], [-60, 2, -215],
  ]
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), true, 'catmullrom', 0.55)
  const length = curve.getLength()
  const frames: Frame[] = []
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < SAMPLES; i++) {
    const u = i / SAMPLES
    const pos = curve.getPointAt(u)
    const tan = curve.getTangentAt(u).normalize()
    const side = new THREE.Vector3().crossVectors(tan, up).normalize()
    frames.push({ pos, tan, side, curve: 0 })
  }
  const seg = length / SAMPLES
  for (let i = 0; i < SAMPLES; i++) {
    const prev = frames[(i - 1 + SAMPLES) % SAMPLES].tan
    const next = frames[(i + 1) % SAMPLES].tan
    const cross = new THREE.Vector3().crossVectors(prev, next)
    const angle = Math.atan2(cross.y, Math.max(-1, Math.min(1, prev.dot(next))))
    frames[i].curve = angle / (seg * 2)
  }
  return { frames, length }
}

function frameAt(frames: Frame[], length: number, s: number): Frame {
  const wrapped = ((s % length) + length) % length
  const idx = Math.floor((wrapped / length) * SAMPLES) % SAMPLES
  return frames[idx]
}

function makeCar(bodyColor: number, accent: number): THREE.Group {
  const g = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.55, roughness: 0.35 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1420, metalness: 0.4, roughness: 0.15 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.52, 4.3), paint)
  body.position.y = 0.52
  g.add(body)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.1), paint)
  hood.position.set(0, 0.62, 1.85)
  g.add(hood)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.5, 2.1), glass)
  cabin.position.set(0, 1.0, -0.25)
  g.add(cabin)
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.42), paint)
  spoiler.position.set(0, 1.02, -2.05)
  g.add(spoiler)
  for (const sx of [-0.7, 0.7]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), glass)
    stay.position.set(sx, 0.85, -2.05)
    g.add(stay)
  }
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 14)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 })
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.27, 10)
  const hubMat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.7, roughness: 0.3 })
  for (const [x, z] of [[-0.88, 1.4], [0.88, 1.4], [-0.88, -1.4], [0.88, -1.4]] as const) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.z = Math.PI / 2
    w.position.set(x, 0.35, z)
    g.add(w)
    const h = new THREE.Mesh(hubGeo, hubMat)
    h.rotation.z = Math.PI / 2
    h.position.set(x, 0.35, z)
    g.add(h)
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 })
  for (const sx of [-0.55, 0.55]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), headMat)
    hl.position.set(sx, 0.62, 2.16)
    g.add(hl)
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a33 })
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.06), tailMat)
  tl.position.set(0, 0.68, -2.16)
  g.add(tl)
  return g
}

/** WebAudio 合成サウンド（エンジン音＋ユーロビート風 BGM） */
class SoundEngine {
  ctx: AudioContext | null = null
  engineOsc: OscillatorNode | null = null
  engineGain: GainNode | null = null
  bgmTimer: number | null = null
  step = 0
  muted = false
  start() {
    if (this.ctx) { void this.ctx.resume(); return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const gain = ctx.createGain()
    gain.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 750
    osc.connect(filter).connect(gain).connect(ctx.destination)
    osc.start()
    this.engineOsc = osc
    this.engineGain = gain
    this.startBgm()
  }
  setSpeed(ratio: number, drifting: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return
    const t = this.ctx.currentTime
    this.engineOsc.frequency.setTargetAtTime(55 + ratio * 235 + (drifting ? 22 : 0), t, 0.06)
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.028 + ratio * 0.05, t, 0.1)
  }
  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, dest?: AudioNode) {
    if (!this.ctx) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    o.connect(g).connect(dest ?? ctx.destination)
    o.start(at)
    o.stop(at + dur + 0.02)
  }
  private kick(at: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, at)
    o.frequency.exponentialRampToValueAtTime(42, at + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.13)
    o.connect(g).connect(ctx.destination)
    o.start(at)
    o.stop(at + 0.15)
  }
  private hat(at: number, vol: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * 0.04)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.value = vol
    src.connect(f).connect(g).connect(ctx.destination)
    src.start(at)
  }
  private startBgm() {
    if (!this.ctx) return
    const ctx = this.ctx
    const bpm = 154
    const stepDur = 60 / bpm / 2 // 8分音符
    const bassLine = [55, 0, 55, 55, 0, 55, 0, 55, 65.4, 0, 65.4, 65.4, 0, 65.4, 0, 65.4, 49, 0, 49, 49, 0, 49, 0, 49, 55, 0, 55, 55, 82.4, 0, 73.4, 0]
    const arp = [440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 880]
    let nextAt = ctx.currentTime + 0.06
    const tick = () => {
      if (!this.ctx) return
      while (nextAt < this.ctx.currentTime + 0.14) {
        const s = this.step
        if (!this.muted) {
          if (s % 2 === 0) this.kick(nextAt)
          if (s % 2 === 1) this.hat(nextAt, 0.12)
          const b = bassLine[s % bassLine.length]
          if (b > 0) this.tone(b, nextAt, stepDur * 0.95, 'sawtooth', 0.16)
          if (s % 4 === 2) this.tone(arp[(s >> 2) % arp.length], nextAt, stepDur * 0.9, 'square', 0.045)
        }
        this.step++
        nextAt += stepDur
      }
    }
    tick()
    this.bgmTimer = window.setInterval(tick, 40)
  }
  dispose() {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer)
    if (this.ctx) void this.ctx.close().catch(() => undefined)
    this.ctx = null
  }
}

interface Best { time: number; win: boolean }
function loadBest(): Best | null {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? 'null') as Best | null } catch { return null }
}
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export default function TougeDrift() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>('title')
  const [hud, setHud] = useState<HudState>({ kmh: 0, time: 0, gap: 0, drift: 0, pos: 2, progP: 0, progR: 0, count: 3, drifting: false })
  const [best, setBest] = useState<Best | null>(loadBest)
  const [result, setResult] = useState<{ win: boolean; time: number; drift: number } | null>(null)
  const [muted, setMuted] = useState(false)
  const phaseRef = useRef<Phase>('title')
  const inputRef = useRef({ steer: 0, throttle: false, brake: false, drift: false })
  const startSignalRef = useRef(0) // 0: 待機, 1: カウント開始要求, 2: 走行中
  const resetRef = useRef<() => void>(() => undefined)
  const soundRef = useRef<SoundEngine | null>(null)

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p) }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const { frames, length } = buildTrack()
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070f)
    scene.fog = new THREE.FogExp2(0x05070f, 0.0105)
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    scene.add(new THREE.AmbientLight(0x445588, 0.85))
    const moonLight = new THREE.DirectionalLight(0x8fa8dd, 0.55)
    moonLight.position.set(-120, 220, -80)
    scene.add(moonLight)

    // 星空と月
    {
      const n = 900
      const posArr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const e = Math.random() * Math.PI * 0.45 + 0.06
        const r = 1300
        posArr[i * 3] = Math.cos(a) * Math.cos(e) * r
        posArr[i * 3 + 1] = Math.sin(e) * r
        posArr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 2.2, sizeAttenuation: false, fog: false })))
      const moon = new THREE.Mesh(new THREE.CircleGeometry(46, 24), new THREE.MeshBasicMaterial({ color: 0xe8efff, fog: false }))
      moon.position.set(-520, 430, -780)
      moon.lookAt(0, 40, 0)
      scene.add(moon)
    }
    // 遠景の山影
    {
      const mat = new THREE.MeshBasicMaterial({ color: 0x0a1224 })
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3
        const r = 620 + Math.random() * 260
        const h = 170 + Math.random() * 130
        const cone = new THREE.Mesh(new THREE.ConeGeometry(210 + Math.random() * 130, h, 5), mat)
        cone.position.set(Math.cos(a) * r, h / 2 - 34, Math.sin(a) * r)
        scene.add(cone)
      }
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 32), new THREE.MeshBasicMaterial({ color: 0x060a12 }))
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -36
      scene.add(ground)
    }
    // 道路
    {
      const verts: number[] = []
      const idx: number[] = []
      for (let i = 0; i <= SAMPLES; i++) {
        const f = frames[i % SAMPLES]
        const l = f.pos.clone().addScaledVector(f.side, -HALF_W)
        const r = f.pos.clone().addScaledVector(f.side, HALF_W)
        verts.push(l.x, l.y, l.z, r.x, r.y, r.z)
        if (i < SAMPLES) {
          const a = i * 2
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.95 })))
      // 白線（両端）
      for (const sgn of [-1, 1]) {
        const lv: number[] = []
        const li: number[] = []
        for (let i = 0; i <= SAMPLES; i++) {
          const f = frames[i % SAMPLES]
          const c = f.pos.clone().addScaledVector(f.side, sgn * (HALF_W - 0.35))
          const a = c.clone().addScaledVector(f.side, -0.09)
          const b = c.clone().addScaledVector(f.side, 0.09)
          lv.push(a.x, a.y + 0.02, a.z, b.x, b.y + 0.02, b.z)
          if (i < SAMPLES) { const k = i * 2; li.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
        }
        const g2 = new THREE.BufferGeometry()
        g2.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3))
        g2.setIndex(li)
        scene.add(new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ color: 0xb9c2cc })))
      }
      // 中央の破線
      const dashGeo = new THREE.BoxGeometry(0.22, 0.03, 3)
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8dde3 })
      const dashCount = Math.floor(length / 9)
      const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount)
      const m4 = new THREE.Matrix4()
      const basis = new THREE.Matrix4()
      for (let i = 0; i < dashCount; i++) {
        const f = frameAt(frames, length, i * 9)
        const upv = new THREE.Vector3().crossVectors(f.side, f.tan).normalize()
        basis.makeBasis(f.side, upv, f.tan)
        m4.copy(basis).setPosition(f.pos.x, f.pos.y + 0.02, f.pos.z)
        dashes.setMatrixAt(i, m4)
      }
      scene.add(dashes)
      // ガードレール
      const railGeo = new THREE.BoxGeometry(0.14, 0.42, 1)
      const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.65, roughness: 0.45 })
      const stepN = 3
      const railCount = Math.floor(SAMPLES / stepN) * 2
      const rails = new THREE.InstancedMesh(railGeo, railMat, railCount)
      const segLen = (length / SAMPLES) * stepN
      let ri = 0
      for (let i = 0; i < SAMPLES; i += stepN) {
        const f = frames[i]
        const upv = new THREE.Vector3().crossVectors(f.side, f.tan).normalize()
        basis.makeBasis(f.side, upv, f.tan)
        for (const sgn of [-1, 1]) {
          const p = f.pos.clone().addScaledVector(f.side, sgn * (HALF_W + 1.15))
          m4.copy(basis).setPosition(p.x, p.y + 0.55, p.z)
          m4.scale(new THREE.Vector3(1, 1, segLen * 1.04))
          rails.setMatrixAt(ri++, m4)
        }
      }
      scene.add(rails)
      // 木（円錐）と岩
      const treeGeo = new THREE.ConeGeometry(1.7, 5.6, 6)
      const treeMat = new THREE.MeshStandardMaterial({ color: 0x0e2c1a, roughness: 1 })
      const trees = new THREE.InstancedMesh(treeGeo, treeMat, 520)
      const dummy = new THREE.Object3D()
      for (let i = 0; i < 520; i++) {
        const f = frames[Math.floor(Math.random() * SAMPLES)]
        const sgn = Math.random() < 0.5 ? -1 : 1
        const off = 13 + Math.random() * 48
        const p = f.pos.clone().addScaledVector(f.side, sgn * off)
        dummy.position.set(p.x, p.y - (off - 11) * 0.3 + 2.2, p.z)
        dummy.rotation.set(0, Math.random() * Math.PI, 0)
        const sc = 0.8 + Math.random() * 1.5
        dummy.scale.set(sc, sc, sc)
        dummy.updateMatrix()
        trees.setMatrixAt(i, dummy.matrix)
      }
      scene.add(trees)
    }

    const playerCar = makeCar(0xe9eaee, 0xc0c6cf)
    scene.add(playerCar)
    for (const sx of [-0.55, 0.55]) {
      const spot = new THREE.SpotLight(0xd6e9ff, 260, 85, 0.46, 0.5, 1.4)
      spot.position.set(sx, 0.7, 1.9)
      spot.target.position.set(sx * 1.6, -0.4, 26)
      playerCar.add(spot)
      playerCar.add(spot.target)
    }
    const rivalCar = makeCar(0x14151a, 0xff3540)
    scene.add(rivalCar)
    const rivalLight = new THREE.PointLight(0xff4040, 12, 9)
    rivalLight.position.set(0, 0.8, -2.4)
    rivalCar.add(rivalLight)

    // 物理・レース状態
    const P = { s: 0, lat: 0, latVel: 0, speed: 0, drift: false, driftScore: 0, driftTime: 0 }
    const R = { s: 16, lat: 1.6, speed: 0, finishAt: -1 }
    let raceTime = 0
    let countT = 0
    let finished = false
    let camPos = new THREE.Vector3(0, 4, -280)
    const keys = new Set<string>()
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k) || ['a', 'd', 'w', 's'].includes(k)) {
        if (down) keys.add(k); else keys.delete(k)
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault()
      }
    }
    const kd = onKey(true)
    const ku = onKey(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    const resize = () => {
      const w = mount.clientWidth || 640
      const h = mount.clientHeight || 420
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const hudTimer = window.setInterval(() => {
      setHud({
        kmh: Math.round(P.speed * 3.6),
        time: raceTime,
        gap: R.s - P.s,
        drift: Math.floor(P.driftScore),
        pos: P.s >= R.s ? 1 : 2,
        progP: Math.min(1, P.s / length),
        progR: Math.min(1, R.s / length),
        count: phaseRef.current === 'count' ? Math.max(1, 3 - Math.floor(countT)) : 0,
        drifting: P.drift,
      })
    }, 100)

    resetRef.current = () => {
      P.s = 0; P.lat = 0; P.latVel = 0; P.speed = 0; P.drift = false; P.driftScore = 0; P.driftTime = 0
      R.s = 16; R.lat = 1.6; R.speed = 0; R.finishAt = -1
      raceTime = 0; countT = 0; finished = false
      startSignalRef.current = 0
      setPhaseBoth('title')
    }
    const clock = new THREE.Clock()
    let raf = 0
    const tmpV = new THREE.Vector3()
    const tmpM = new THREE.Matrix4()
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.05)
      const inp = inputRef.current
      const kbSteer = (keys.has('arrowleft') || keys.has('a') ? -1 : 0) + (keys.has('arrowright') || keys.has('d') ? 1 : 0)
      const steer = THREE.MathUtils.clamp(inp.steer + kbSteer, -1, 1)
      const throttle = inp.throttle || keys.has('arrowup') || keys.has('w')
      const brake = inp.brake || keys.has('arrowdown') || keys.has('s')
      const driftKey = inp.drift || keys.has(' ')

      if (startSignalRef.current === 1 && phaseRef.current === 'title') {
        setPhaseBoth('count')
        countT = 0
        soundRef.current?.start()
      }
      if (phaseRef.current === 'count') {
        countT += dt
        if (countT >= 3) { setPhaseBoth('race'); raceTime = 0 }
      }

      if (phaseRef.current === 'race' && !finished) {
        raceTime += dt
        // --- プレイヤー物理 ---
        const fHere = frameAt(frames, length, P.s)
        const grade = fHere.tan.y
        let acc = 0
        if (throttle) acc += 21
        if (brake) acc -= P.speed > 0.5 ? 40 : 0
        acc -= P.speed * 0.32 + 2.2 + grade * 7.5
        const offroad = Math.abs(P.lat) > HALF_W + 0.4
        if (offroad) acc -= 26
        P.speed = THREE.MathUtils.clamp(P.speed + acc * dt, 0, 60)
        const steerAuth = THREE.MathUtils.clamp(P.speed / 9, 0, 1)
        const wantDrift = (driftKey && P.speed > 12) || (Math.abs(steer) > 0.92 && P.speed > 30)
        P.drift = wantDrift
        const grip = P.drift ? 1.7 : 8.5
        const targetLatVel = steer * (4.2 + P.speed * 0.17) * steerAuth * (P.drift ? 1.3 : 1)
        P.latVel += (targetLatVel - P.latVel) * Math.min(1, grip * dt)
        P.latVel += fHere.curve * P.speed * P.speed * 0.30 * dt * (P.drift ? 1.3 : 0.9)
        P.lat += P.latVel * dt
        if (Math.abs(P.lat) > HALF_W + 1.5) { P.lat = Math.sign(P.lat) * (HALF_W + 1.5); P.latVel *= -0.25 }
        P.s += P.speed * dt
        if (P.drift && P.speed > 10) {
          P.driftTime += dt
          P.driftScore += P.speed * dt * (1 + Math.abs(P.latVel) * 0.12)
        } else P.driftTime = 0
        // --- ライバル ---
        let maxCurve = 0
        for (let d = 0; d < 70; d += 10) maxCurve = Math.max(maxCurve, Math.abs(frameAt(frames, length, R.s + d).curve))
        const rTarget = maxCurve > 0.011 ? 23 : maxCurve > 0.008 ? 29 : maxCurve > 0.005 ? 37 : maxCurve > 0.003 ? 45 : 53
        const rubber = THREE.MathUtils.clamp((P.s - R.s) * 0.012, -2.5, 3.5)
        const rAcc = R.speed < rTarget + rubber ? 15 : -34
        R.speed = THREE.MathUtils.clamp(R.speed + rAcc * dt, 0, 56)
        R.s += R.speed * dt
        R.lat = Math.sin(R.s * 0.011) * 1.7
        // --- 接触 ---
        let ds = P.s - R.s
        if (Math.abs(ds) < 4.4 && Math.abs(P.lat - R.lat) < 1.8) {
          if (ds < 0) { P.speed = Math.min(P.speed, R.speed); P.s = R.s - 4.4 }
          P.latVel += (P.lat >= R.lat ? 1 : -1) * 6 * dt
          ds = P.s - R.s
        }
        // --- ゴール判定 ---
        if (R.s >= length && R.finishAt < 0) R.finishAt = raceTime
        if (P.s >= length || R.finishAt >= 0) {
          finished = true
          const win = P.s >= length && (R.finishAt < 0 || raceTime <= R.finishAt)
          const t = P.s >= length ? raceTime : R.finishAt
          const res = { win, time: t, drift: Math.floor(P.driftScore) }
          setResult(res)
          const prev = loadBest()
          if (!prev || t < prev.time) { localStorage.setItem(BEST_KEY, JSON.stringify({ time: t, win })); setBest({ time: t, win }) }
          setPhaseBoth('goal')
          soundRef.current?.setSpeed(0, false)
        }
        soundRef.current?.setSpeed(P.speed / 60, P.drift)
      }

      // --- 描画位置 ---
      const placeCar = (car: THREE.Group, s: number, lat: number, yawExtra: number) => {
        const f = frameAt(frames, length, s)
        const pos = tmpV.copy(f.pos).addScaledVector(f.side, lat)
        car.position.set(pos.x, pos.y + 0.03, pos.z)
        const cos = Math.cos(yawExtra)
        const sin = Math.sin(yawExtra)
        const fwd = f.tan.clone().multiplyScalar(cos).addScaledVector(f.side, sin)
        const side2 = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
        const up2 = new THREE.Vector3().crossVectors(side2, fwd).normalize()
        tmpM.makeBasis(side2, up2, fwd)
        car.quaternion.setFromRotationMatrix(tmpM)
        return { f, pos: car.position }
      }
      const yaw = P.drift ? -Math.atan2(P.latVel, Math.max(P.speed, 6)) * 0.85 : -Math.atan2(P.latVel, Math.max(P.speed, 6)) * 0.22
      const placed = placeCar(playerCar, P.s, P.lat, yaw)
      placeCar(rivalCar, R.s, R.lat, 0)
      // カメラ
      const back = placed.f.tan.clone().multiplyScalar(Math.cos(yaw * 0.6)).addScaledVector(placed.f.side, Math.sin(yaw * 0.6))
      const want = playerCar.position.clone().addScaledVector(back, -10.5)
      want.y += 3.6
      camPos.lerp(want, 1 - Math.exp(-dt * 4.5))
      camera.position.copy(camPos)
      const look = playerCar.position.clone().addScaledVector(placed.f.tan, 12)
      look.y += 1.1
      camera.lookAt(look)
      const targetFov = 62 + (P.speed / 60) * 11
      if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * 0.08; camera.updateProjectionMatrix() }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(hudTimer)
      ro.disconnect()
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      soundRef.current?.dispose()
      soundRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRace = () => {
    setResult(null)
    if (!soundRef.current) soundRef.current = new SoundEngine()
    soundRef.current.muted = muted
    startSignalRef.current = 1
  }
  const backToTitle = () => {
    setResult(null)
    soundRef.current?.setSpeed(0, false)
    resetRef.current()
  }
  const hold = (patch: Partial<typeof inputRef.current>) => ({
    onPointerDown: (e: ReactPointerEvent) => { e.preventDefault(); Object.assign(inputRef.current, patch) },
    onPointerUp: () => Object.assign(inputRef.current, Object.fromEntries(Object.keys(patch).map((k) => [k, typeof (patch as Record<string, unknown>)[k] === 'boolean' ? false : 0]))),
    onPointerLeave: () => Object.assign(inputRef.current, Object.fromEntries(Object.keys(patch).map((k) => [k, typeof (patch as Record<string, unknown>)[k] === 'boolean' ? false : 0]))),
    onPointerCancel: () => Object.assign(inputRef.current, Object.fromEntries(Object.keys(patch).map((k) => [k, typeof (patch as Record<string, unknown>)[k] === 'boolean' ? false : 0]))),
  })

  const btn: CSSProperties = { pointerEvents: 'auto', userSelect: 'none', touchAction: 'none', border: '1px solid rgba(255,255,255,.35)', background: 'rgba(10,14,24,.55)', color: '#fff', borderRadius: 14, fontWeight: 700, backdropFilter: 'blur(2px)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#05070f', position: 'relative', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ flex: 1, minHeight: 260, position: 'relative' }} />
      {/* HUD */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', color: '#fff' }}>
        <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 13, lineHeight: 1.5, textShadow: '0 1px 4px #000' }}>
          <div>TIME {fmtTime(hud.time)}</div>
          <div>相手との差 {hud.gap >= 0 ? '+' : ''}{hud.gap.toFixed(0)}m（{hud.pos === 1 ? '1位' : '2位'}）</div>
          <div>DRIFT {hud.drift} pt{hud.drifting ? ' 🔥' : ''}</div>
          <div style={{ width: 150, height: 6, background: 'rgba(255,255,255,.25)', borderRadius: 3, marginTop: 4, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${hud.progP * 100}%`, background: '#ffd34d', borderRadius: 3 }} />
            <div style={{ position: 'absolute', top: -2, left: `${hud.progR * 100}%`, width: 3, height: 10, background: '#ff3540' }} />
          </div>
        </div>
        <div style={{ position: 'absolute', top: 10, right: 12, textAlign: 'right', textShadow: '0 1px 4px #000' }}>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{hud.kmh}</div>
          <div style={{ fontSize: 12 }}>km/h</div>
          <button style={{ ...btn, marginTop: 6, padding: '4px 10px', fontSize: 12 }} onClick={() => { const m = !muted; setMuted(m); if (soundRef.current) soundRef.current.muted = m }}>
            {muted ? '🔇 音を出す' : '🔊 音を消す'}
          </button>
        </div>
        {phase === 'count' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 92, fontWeight: 900, color: '#ffd34d', textShadow: '0 4px 24px #000' }}>
            {hud.count}
          </div>
        )}
        {phase === 'title' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,5,12,.45)', pointerEvents: 'auto', textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2 }}>峠ドリフト3D</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>夜の峠でライバルと1周勝負。カーブはドリフトで抜けろ。</div>
            <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 10, lineHeight: 1.7 }}>
              操作：◀▶ ステアリング／アクセル・ブレーキ／DRIFT ボタン（PCは ←→↑↓＋スペース）<br />
              路肩に出ると減速。ガードレールに当たると跳ね返る。
            </div>
            {best && <div style={{ marginTop: 8, fontSize: 13, color: '#ffd34d' }}>ベスト {fmtTime(best.time)}（{best.win ? '勝利' : '敗北'}）</div>}
            <button style={{ ...btn, marginTop: 16, padding: '13px 34px', fontSize: 17, background: '#e11d2e', border: 'none' }} onClick={startRace}>スタート</button>
          </div>
        )}
        {phase === 'goal' && result && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,5,12,.5)', pointerEvents: 'auto', textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: result.win ? '#ffd34d' : '#c7cede' }}>{result.win ? '🏆 勝利！' : '敗北…'}</div>
            <div style={{ fontSize: 15, marginTop: 8 }}>タイム {fmtTime(result.time)}／ドリフト {result.drift} pt</div>
            <button style={{ ...btn, marginTop: 16, padding: '12px 30px', fontSize: 16, background: '#e11d2e', border: 'none' }} onClick={backToTitle}>もう一度</button>
          </div>
        )}
        {/* タッチ操作 */}
        {(phase === 'race' || phase === 'count') && (
          <>
            <div style={{ position: 'absolute', left: 10, bottom: 12, display: 'flex', gap: 10 }}>
              <button style={{ ...btn, width: 68, height: 68, fontSize: 26 }} {...hold({ steer: -1 })}>◀</button>
              <button style={{ ...btn, width: 68, height: 68, fontSize: 26 }} {...hold({ steer: 1 })}>▶</button>
            </div>
            <div style={{ position: 'absolute', right: 10, bottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <button style={{ ...btn, width: 62, height: 62, fontSize: 12 }} {...hold({ drift: true })}>DRIFT</button>
              <button style={{ ...btn, width: 62, height: 62, fontSize: 12 }} {...hold({ brake: true })}>ブレーキ</button>
              <button style={{ ...btn, width: 74, height: 84, fontSize: 13, background: 'rgba(190,18,40,.65)' }} {...hold({ throttle: true })}>アクセル</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
