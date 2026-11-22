// 峠ドリフト3D v3：オープンワールド（市街地・高速・峠）自由走行＋チェックポイントレース
// UIはイニシャルDアーケード風（大メーター・バナー）× GTA風（円形ミニマップ・地名スプラッシュ）
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Engine } from '../../engine/engine'
import { Input } from '../../engine/input'
import { GameAudio } from '../../engine/audio'
import { CAR_SPECS, Vehicle, buildHachiroku, buildGTR, buildTrafficCar, type BuiltCar, type CarSpec } from '../../engine/cars'
import { buildWorld, type WorldData } from '../../engine/world'

const CAMERAS = ['チェイス（遠）', 'チェイス（近）', 'ボンネット', 'ルーフ', 'バンパー', 'オービット']
const PAR = [9, 20, 30, 45, 62, 78, 88, 103, 122]
const ZONE_JA: Record<string, string> = { city: '市街地', highway: '高速道路', touge: '峠', offroad: 'オフロード' }
const TRAFFIC_COLORS = [0xb8bcc2, 0x3a4a63, 0x6e1f1f, 0x2c4a34, 0x8a8d91, 0x54486e, 0x74552a, 0x24303c, 0x9aa0a6, 0x5c2e3e]

function fmt(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}
function loadBest(key: string): number | null {
  try { const v = localStorage.getItem(key); return v ? parseFloat(v) : null } catch { return null }
}
const angleLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

interface Traffic { built: BuiltCar; route: number; s: number; speed: number; dir: number; x: number; z: number }
interface Hud {
  speed: number; rpm: number; gear: string; mode: string; cam: string; zone: string
  drift: number; time: string; cp: string; diff: string; diffPlus: boolean
  nextDist: number; nextBearing: number; phase: string; count: number; banner: string
  medal: string; finalTime: string
}

export default function TougeDrift() {
  const mountRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const startRef = useRef<(carId: string, mode: string) => void>(() => {})
  const inputRef = useRef<Input | null>(null)
  const audioRef = useRef<GameAudio | null>(null)
  const [phaseUi, setPhaseUi] = useState<'title' | 'game'>('title')
  const [carId, setCarId] = useState('hachiroku')
  const [mode, setMode] = useState<'free' | 'race'>('free')
  const [muted, setMuted] = useState(false)
  const [bestRace, setBestRace] = useState<number | null>(() => loadBest('webx-touge-checkpoint-best'))
  const [bestDrift, setBestDrift] = useState<number | null>(() => loadBest('webx-touge-drift-best'))
  const [hud, setHud] = useState<Hud>({
    speed: 0, rpm: 0, gear: '1', mode: 'AT', cam: CAMERAS[0], zone: '市街地',
    drift: 0, time: '0:00.00', cp: '', diff: '', diffPlus: false,
    nextDist: 0, nextBearing: 0, phase: 'title', count: 3, banner: '', medal: '', finalTime: '',
  })
  const [zoneSplash, setZoneSplash] = useState('')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const engine = new Engine(mount)
    engine.setupNight()
    engine.addStarsAndMoon()
    const world: WorldData = buildWorld()
    engine.scene.add(world.group)
    const input = new Input()
    inputRef.current = input
    const audio = new GameAudio()
    audioRef.current = audio

    // チェックポイント表示
    const cpMeshes: THREE.Group[] = world.checkpoints.map((c, i) => {
      const g = new THREE.Group()
      const last = i === world.checkpoints.length - 1
      const col = last ? 0xffffff : 0xffd21f
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 7, 20, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
      )
      cyl.position.y = 10
      g.add(cyl)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.22, 8, 32), new THREE.MeshBasicMaterial({ color: col }))
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.3
      g.add(ring)
      g.position.set(c.x, world.heightAt(c.x, c.z), c.z)
      g.visible = false
      engine.scene.add(g)
      return g
    })

    interface Player {
      built: BuiltCar; spec: CarSpec; vehicle: Vehicle
      x: number; z: number; heading: number; vx: number; vz: number; steerCur: number
    }
    const buildPlayerCar = (spec: CarSpec): BuiltCar => spec.id === 'gtr34' ? buildGTR() : buildHachiroku()
    const spec0 = CAR_SPECS[0]
    const P: Player = {
      built: buildPlayerCar(spec0), spec: spec0, vehicle: new Vehicle(spec0),
      x: world.start.x, z: world.start.z, heading: world.start.heading, vx: 0, vz: 0, steerCur: 0,
    }
    P.built.group.rotation.order = 'YXZ'
    {
      const hl = new THREE.SpotLight(0xcfe4ff, 60, 65, 0.46, 0.5, 1.2)
      hl.position.set(-0.56, 0.72, 1.8)
      const hr = hl.clone(); hr.position.x = 0.56
      for (const h of [hl, hr]) {
        h.target.position.set(h.position.x * 2.4, 0.1, 16)
        P.built.group.add(h); P.built.group.add(h.target)
      }
    }
    engine.scene.add(P.built.group)

    const traffics: Traffic[] = []
    const routePlan: [number, number][] = [[0, 5], [1, 3], [2, 2]]
    let tIdx = 0
    for (const [routeIdx, count] of routePlan) {
      const route = world.routes[routeIdx]
      for (let i = 0; i < count; i++) {
        const built = buildTrafficCar(TRAFFIC_COLORS[tIdx % TRAFFIC_COLORS.length])
        engine.scene.add(built.group)
        traffics.push({
          built, route: routeIdx,
          s: (route.length / count) * i + (routeIdx * 37),
          speed: 10.5 + (tIdx % 4) * 1.8, dir: 1, x: 0, z: 0,
        })
        tIdx++
      }
    }

    let phase: 'title' | 'count' | 'drive' | 'goal' = 'title'
    let gameMode: 'free' | 'race' = 'free'
    let camIdx = 0
    let camHeading = P.heading
    let orbitA = 0
    let countT = 0
    let raceT = 0
    let cpIndex = 0
    let driftScore = 0
    let toast = ''
    let toastUntil = 0
    let banner = ''
    let bannerUntil = 0
    let medal = ''
    let finalTime = ''
    let zoneNow = '市街地'
    let prevVF = 0
    const clockStart = performance.now()

    const showToast = (text: string) => { toast = text; toastUntil = engine.elapsed + 1.6 }
    const showBanner = (text: string, dur = 1.4) => { banner = text; bannerUntil = engine.elapsed + dur }

    input.onShiftUp = () => P.vehicle.shiftUp()
    input.onShiftDown = () => P.vehicle.shiftDown()
    input.onNeutralTap = () => P.vehicle.toNeutral()
    input.onNeutralLongPress = () => showToast(P.vehicle.toggleMode() === 'MT' ? 'MTモードに切り替えた' : 'ATモードに切り替えた')
    input.onCamera = () => { camIdx = (camIdx + 1) % CAMERAS.length; showToast(`視点：${CAMERAS[camIdx]}`) }

    startRef.current = (cid: string, md: string) => {
      const spec = CAR_SPECS.find((c) => c.id === cid) ?? CAR_SPECS[0]
      if (spec.id !== P.spec.id) {
        engine.scene.remove(P.built.group)
        P.built = buildPlayerCar(spec)
        P.built.group.rotation.order = 'YXZ'
        const hl = new THREE.SpotLight(0xcfe4ff, 60, 65, 0.46, 0.5, 1.2)
        hl.position.set(-0.56, 0.72, 1.8)
        const hr = hl.clone(); hr.position.x = 0.56
        for (const h of [hl, hr]) {
          h.target.position.set(h.position.x * 2.4, 0.1, 16)
          P.built.group.add(h); P.built.group.add(h.target)
        }
        engine.scene.add(P.built.group)
      }
      P.spec = spec
      P.vehicle = new Vehicle(spec)
      P.vehicle.setMode(input.usesKeyboard ? 'MT' : 'AT')
      P.vehicle.gear = 1
      P.x = world.start.x; P.z = world.start.z; P.heading = world.start.heading
      P.vx = 0; P.vz = 0; P.steerCur = 0
      camHeading = P.heading
      gameMode = md as 'free' | 'race'
      cpIndex = 0; driftScore = 0; raceT = 0; medal = ''; finalTime = ''
      phase = gameMode === 'race' ? 'count' : 'drive'
      countT = 0
      setPhaseUi('game')
      audio.start()
    }

    const placeTraffic = (t: Traffic) => {
      const f = world.routes[t.route].at(t.s)
      t.x = f.x; t.z = f.z
      t.built.group.position.set(f.x, f.y + 0.02, f.z)
      t.built.group.rotation.set(0, Math.atan2(f.hx * t.dir, f.hz * t.dir), 0)
      const spin = (t.speed * t.dir) / 0.31
      for (const s of t.built.spins) s.rotation.x += spin * 0.016
    }

    const drawMinimap = () => {
      const cv = mapRef.current
      if (!cv) return
      const g = cv.getContext('2d')
      if (!g) return
      const S = 150, scale = S / 1150, cx = S / 2
      g.clearRect(0, 0, S, S)
      g.fillStyle = 'rgba(8,12,16,0.78)'
      g.fillRect(0, 0, S, S)
      g.strokeStyle = 'rgba(160,175,190,0.9)'
      g.lineWidth = 1.6
      for (const line of world.minimapRoads) {
        g.beginPath()
        line.forEach(([x, z], i) => {
          const mx = cx + x * scale, my = cx + z * scale
          if (i === 0) g.moveTo(mx, my); else g.lineTo(mx, my)
        })
        g.stroke()
      }
      g.fillStyle = 'rgba(210,220,230,0.75)'
      for (const t of traffics) g.fillRect(cx + t.x * scale - 1, cx + t.z * scale - 1, 2, 2)
      if (gameMode === 'race' && phase !== 'goal' && phase !== 'title') {
        const cp = world.checkpoints[cpIndex]
        if (cp) {
          const pulse = 3 + Math.sin(engine.elapsed * 6) * 1.2
          g.fillStyle = '#ffd21f'
          g.beginPath(); g.arc(cx + cp.x * scale, cx + cp.z * scale, pulse, 0, Math.PI * 2); g.fill()
        }
      }
      // プレイヤー矢印（北上が画面上 = -z 方向）
      g.save()
      g.translate(cx + P.x * scale, cx + P.z * scale)
      g.rotate(-P.heading + Math.PI)
      g.fillStyle = '#ffffff'
      g.beginPath(); g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(0, 2.2); g.lineTo(-3.6, 4); g.closePath(); g.fill()
      g.restore()
      g.fillStyle = 'rgba(255,255,255,0.85)'
      g.font = 'bold 9px sans-serif'
      g.fillText('N', cx - 3, 11)
    }

    const hudTimer = window.setInterval(() => {
      const v = P.vehicle
      const cp = world.checkpoints[cpIndex]
      let nextDist = 0, nextBearing = 0
      if (gameMode === 'race' && cp && phase !== 'goal') {
        nextDist = Math.hypot(cp.x - P.x, cp.z - P.z)
        const worldBearing = Math.atan2(cp.x - P.x, cp.z - P.z)
        let rel = worldBearing - P.heading
        while (rel > Math.PI) rel -= Math.PI * 2
        while (rel < -Math.PI) rel += Math.PI * 2
        nextBearing = rel
      }
      const diff = gameMode === 'race' && phase !== 'title' ? raceT - (PAR[Math.min(cpIndex, PAR.length - 1)] ?? 0) : 0
      setHud({
        speed: Math.abs(v.speed) * 3.6,
        rpm: v.rpm / v.spec.redline,
        gear: v.mode === 'AT' && v.gear >= 1 ? String(v.atGearNum) : v.gearLabel,
        mode: v.mode, cam: CAMERAS[camIdx], zone: zoneNow,
        drift: Math.floor(driftScore),
        time: fmt(raceT),
        cp: gameMode === 'race' ? `${Math.min(cpIndex + (phase === 'goal' ? 0 : 1), world.checkpoints.length)}/${world.checkpoints.length}` : '',
        diff: gameMode === 'race' && phase !== 'title' ? `${diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)}` : '',
        diffPlus: diff >= 0,
        nextDist, nextBearing,
        phase,
        count: Math.max(0, Math.ceil(3 - countT)),
        banner: engine.elapsed < bannerUntil ? banner : (engine.elapsed < toastUntil ? toast : ''),
        medal, finalTime,
      })
      drawMinimap()
    }, 100)

    engine.start((dt) => {
      input.poll()
      const inp = input.state
      world.update(engine.elapsed)

      // 交通車両
      for (const t of traffics) {
        t.s += t.speed * t.dir * dt
        const len = world.routes[t.route].length
        if (t.route === 2) {
          if (t.s > len - 6) { t.s = len - 6; t.dir = -1 }
          if (t.s < 4) { t.s = 4; t.dir = 1 }
        }
        placeTraffic(t)
      }

      if (phase === 'title') {
        P.built.group.position.set(P.x, world.heightAt(P.x, P.z), P.z)
        P.built.group.rotation.set(0, engine.elapsed * 0.35, 0)
        const a = engine.elapsed * 0.35 + 2.4
        engine.camera.position.set(P.x + Math.sin(a) * 8.5, world.heightAt(P.x, P.z) + 2.6, P.z + Math.cos(a) * 8.5)
        engine.camera.lookAt(P.x, world.heightAt(P.x, P.z) + 0.8, P.z)
        engine.followSun(P.x, P.z)
        return
      }

      if (phase === 'count') {
        countT += dt
        if (countT >= 3) { phase = 'drive'; showBanner('GO!', 0.9) }
      }
      if (phase === 'drive' && gameMode === 'race') raceT += dt

      const v = P.vehicle
      const driving = phase === 'drive'
      const throttle = driving && inp.throttle
      const brake = driving && inp.brake

      // ステアリング（重みのある追従＋速度感応）
      const steerTarget = driving ? inp.steer : 0
      P.steerCur += (steerTarget - P.steerCur) * Math.min(1, dt * 7)

      const fx = Math.sin(P.heading), fz = Math.cos(P.heading)
      const rx = fz, rz = -fx
      let vF = P.vx * fx + P.vz * fz
      let vLat = P.vx * rx + P.vz * rz
      const grade = (world.heightAt(P.x + fx * 3, P.z + fz * 3) - world.heightAt(P.x - fx * 3, P.z - fz * 3)) / 6
      v.speed = vF
      v.update(dt, throttle, brake, grade)
      const newVF = v.speed

      const spec = P.spec
      const gripNow = inp.drift && driving ? (1.5 * spec.grip) / spec.driftiness : 8.5 * spec.grip
      vLat *= Math.exp(-gripNow * dt)

      const maxSteer = 0.55 / (1 + Math.abs(newVF) * 0.05)
      const steerAngle = P.steerCur * maxSteer
      let yawRate = (newVF / 2.6) * Math.tan(steerAngle)
      if (inp.drift && driving) yawRate *= 1.3
      P.heading += yawRate * dt

      P.vx = fx * newVF + rx * vLat
      P.vz = fz * newVF + rz * vLat

      // オフロード抵抗
      const ri = world.roadInfo(P.x, P.z)
      if (ri.dist > 1.2) {
        const drag = Math.exp(-(ri.dist > 6 ? 1.6 : 0.85) * dt)
        P.vx *= drag; P.vz *= drag
      }
      P.x += P.vx * dt
      P.z += P.vz * dt
      P.x = Math.max(-548, Math.min(548, P.x))
      P.z = Math.max(-548, Math.min(548, P.z))

      // 建物コリジョン
      for (const c of world.colliders) {
        if (P.x < c.minX - 2 || P.x > c.maxX + 2 || P.z < c.minZ - 2 || P.z > c.maxZ + 2) continue
        const nx = Math.max(c.minX, Math.min(c.maxX, P.x))
        const nz = Math.max(c.minZ, Math.min(c.maxZ, P.z))
        let dx = P.x - nx, dz = P.z - nz
        const d2 = dx * dx + dz * dz, R = 1.05
        if (d2 < R * R) {
          if (d2 < 1e-6) { dx = 1; dz = 0 }
          const d = Math.sqrt(dx * dx + dz * dz) || 1
          const ux = dx / d, uz = dz / d
          P.x = nx + ux * R; P.z = nz + uz * R
          const vn = P.vx * ux + P.vz * uz
          if (vn < 0) { P.vx -= ux * vn * 1.5; P.vz -= uz * vn * 1.5 }
        }
      }
      // 交通車両コリジョン
      for (const t of traffics) {
        const dx = P.x - t.x, dz = P.z - t.z
        const d2 = dx * dx + dz * dz
        if (d2 < 2.4 * 2.4 && d2 > 1e-4) {
          const d = Math.sqrt(d2), ux = dx / d, uz = dz / d
          P.x = t.x + ux * 2.4; P.z = t.z + uz * 2.4
          const vn = P.vx * ux + P.vz * uz
          if (vn < 0) { P.vx -= ux * vn * 1.3; P.vz -= uz * vn * 1.3 }
        }
      }

      // ドリフト判定・スコア
      const slip = Math.atan2(Math.abs(vLat), Math.abs(newVF))
      if (phase === 'drive' && slip > 0.15 && Math.abs(newVF) > 7) {
        driftScore += slip * Math.abs(newVF) * dt * 12
      }
      const skid = phase === 'drive' ? Math.min(1, Math.max(0, (slip - 0.13) * 3)) * (Math.abs(newVF) > 5 ? 1 : 0) : 0
      audio.update(v.rpm, throttle ? 1 : 0.2, skid)

      // ゾーン
      const zoneKey = ri.kind
      const zoneJa = ZONE_JA[zoneKey]
      if (zoneJa !== zoneNow && zoneKey !== 'offroad') {
        zoneNow = zoneJa
        if (performance.now() - clockStart > 3000) {
          setZoneSplash(zoneJa)
          window.setTimeout(() => setZoneSplash(''), 2100)
        }
      } else if (zoneKey !== 'offroad') zoneNow = zoneJa

      // チェックポイント
      cpMeshes.forEach((m, i) => { m.visible = gameMode === 'race' && phase !== 'goal' && i === cpIndex })
      if (gameMode === 'race' && phase === 'drive') {
        const cp = world.checkpoints[cpIndex]
        if (cp && Math.hypot(cp.x - P.x, cp.z - P.z) < 13) {
          cpIndex++
          if (cpIndex >= world.checkpoints.length) {
            phase = 'goal'
            finalTime = fmt(raceT)
            medal = raceT <= 130 ? '🏆 GOLD' : raceT <= 160 ? '🥈 SILVER' : '🥉 BRONZE'
            showBanner('GOAL!', 3)
            const prev = loadBest('webx-touge-checkpoint-best')
            if (prev === null || raceT < prev) {
              try { localStorage.setItem('webx-touge-checkpoint-best', String(raceT)) } catch { /* ignore */ }
              setBestRace(raceT)
            }
          } else {
            showBanner('CHECK POINT!', 1.1)
          }
        }
      }
      if (gameMode === 'free' && phase === 'drive') {
        const prev = loadBest('webx-touge-drift-best')
        if (driftScore > (prev ?? 0) && Math.floor(driftScore) % 50 === 0) {
          try { localStorage.setItem('webx-touge-drift-best', String(Math.floor(driftScore))) } catch { /* ignore */ }
          setBestDrift(Math.floor(driftScore))
        }
      }

      // 描画反映
      const y = world.heightAt(P.x, P.z)
      const slopeF = Math.atan2(world.heightAt(P.x + fx * 2.6, P.z + fz * 2.6) - world.heightAt(P.x - fx * 2.6, P.z - fz * 2.6), 5.2)
      const slopeR = Math.atan2(world.heightAt(P.x + rx * 2.2, P.z + rz * 2.2) - world.heightAt(P.x - rx * 2.2, P.z - rz * 2.2), 4.4)
      const accelG = (newVF - prevVF) / Math.max(dt, 0.001)
      prevVF = newVF
      P.built.group.position.set(P.x, y + 0.02, P.z)
      P.built.group.rotation.set(
        -slopeF * 0.85 + THREE.MathUtils.clamp(accelG * 0.0035, -0.035, 0.05),
        P.heading,
        slopeR * 0.6 + THREE.MathUtils.clamp(yawRate * newVF * 0.006, -0.07, 0.07),
      )
      const tireR = spec.tireCirc / (2 * Math.PI)
      for (const s of P.built.spins) s.rotation.x += (newVF / tireR) * dt
      for (const p of P.built.frontPivots) p.rotation.y = steerAngle * 0.92
      const bm = P.built.brakeLightMat as THREE.MeshStandardMaterial
      if (bm.emissiveIntensity !== undefined) bm.emissiveIntensity = brake ? 2.4 : 0.55
      engine.followSun(P.x, P.z)

      // カメラ
      const cam = engine.camera as THREE.PerspectiveCamera
      const speedRatio = Math.min(1, Math.abs(newVF) / 55)
      cam.fov = 62 + speedRatio * 13 + (inp.drift ? 2 : 0)
      cam.updateProjectionMatrix()
      const carY = y + 0.9
      if (camIdx <= 1) {
        const dist = camIdx === 0 ? 10.5 : 6.9
        const h = camIdx === 0 ? 3.6 : 2.4
        const velHeading = Math.atan2(P.vx, P.vz)
        const targetH = Math.abs(newVF) > 3 && slip > 0.25 ? angleLerp(P.heading, velHeading, 0.55) : P.heading
        camHeading = angleLerp(camHeading, targetH, Math.min(1, dt * 3.2))
        const bx = Math.sin(camHeading), bz = Math.cos(camHeading)
        const desired = new THREE.Vector3(P.x - bx * dist, y + h, P.z - bz * dist)
        desired.y = Math.max(desired.y, world.heightAt(desired.x, desired.z) + 1.1)
        cam.position.lerp(desired, Math.min(1, dt * 7))
        cam.lookAt(P.x + bx * 5, carY, P.z + bz * 5)
      } else if (camIdx === 5) {
        orbitA += dt * 0.45
        cam.position.set(P.x + Math.sin(orbitA) * 10, y + 3.4, P.z + Math.cos(orbitA) * 10)
        cam.lookAt(P.x, carY, P.z)
      } else {
        const local = camIdx === 2 ? new THREE.Vector3(0, 1.02, 1.05) : camIdx === 3 ? new THREE.Vector3(0, 1.72, -0.4) : new THREE.Vector3(0, 0.42, 2.3)
        const wp = P.built.group.localToWorld(local.clone())
        cam.position.copy(wp)
        const ahead = P.built.group.localToWorld(new THREE.Vector3(0, 0.85, 18))
        cam.lookAt(ahead)
      }
    })

    return () => {
      window.clearInterval(hudTimer)
      input.dispose()
      audio.dispose()
      engine.dispose()
      mount.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const spec = CAR_SPECS.find((c) => c.id === carId) ?? CAR_SPECS[0]
  const btn: React.CSSProperties = {
    pointerEvents: 'auto', padding: '12px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(10,14,20,0.55)', color: '#fff', fontWeight: 800, fontSize: 15, backdropFilter: 'blur(3px)',
  }
  const hold = (fn: (down: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(true) },
    onPointerUp: () => fn(false),
    onPointerLeave: () => fn(false),
    onPointerCancel: () => fn(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })
  const setTouch = (patch: Partial<{ steer: number; throttle: boolean; brake: boolean; drift: boolean }>) => {
    const inp = inputRef.current
    if (!inp) return
    Object.assign(inp.touch, patch)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#05070c', touchAction: 'none', userSelect: 'none' }}>
      <style>{`
        @keyframes wxBanner { 0% { transform: scale(1.7) skewX(-8deg); opacity: 0; } 18% { transform: scale(1) skewX(-8deg); opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes wxSplash { 0% { opacity: 0; transform: translateX(26px); } 15% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes wxCount { 0% { transform: scale(2.1) skewX(-8deg); opacity: 0; } 25% { transform: scale(1) skewX(-8deg); opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0.4; } }
      `}</style>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {phaseUi === 'game' && (
        <>
          {/* 上部：TIME / CP（アーケード風） */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: '#ffd21f', fontWeight: 900, fontStyle: 'italic' }}>TIME</div>
            <div style={{ fontSize: 27, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '2px 2px 0 #000, -1px -1px 0 #000', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{hud.time}</div>
            {hud.cp && (
              <div style={{ marginTop: 2, fontSize: 13, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '1px 1px 0 #000' }}>
                CP {hud.cp} {hud.diff && <span style={{ color: hud.diffPlus ? '#ff5d4d' : '#54d8ff' }}>{hud.diff}</span>}
              </div>
            )}
            {hud.phase === 'drive' && hud.cp && (
              <div style={{ marginTop: 1, fontSize: 12, color: '#ffd21f', fontWeight: 800, textShadow: '1px 1px 0 #000' }}>
                <span style={{ display: 'inline-block', transform: `rotate(${hud.nextBearing}rad)` }}>▲</span> {Math.round(hud.nextDist)}m
              </div>
            )}
          </div>

          {/* 右上：ドリフトスコア */}
          <div style={{ position: 'absolute', top: 10, right: 12, textAlign: 'right', pointerEvents: 'none' }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#ffd21f', fontWeight: 900, fontStyle: 'italic' }}>DRIFT</div>
            <div style={{ fontSize: 21, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '2px 2px 0 #000', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{hud.drift.toLocaleString()}<span style={{ fontSize: 11 }}> pt</span></div>
            <div style={{ fontSize: 11, color: '#cfe3ef', marginTop: 3, textShadow: '1px 1px 0 #000' }}>{hud.cam}</div>
          </div>

          {/* カウントダウン / バナー */}
          {hud.phase === 'count' && (
            <div key={hud.count} style={{ position: 'absolute', top: '34%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '4px 4px 0 #c00, 7px 7px 0 rgba(0,0,0,0.55)', animation: 'wxCount 0.9s ease-out', pointerEvents: 'none' }}>
              {hud.count > 0 ? hud.count : ''}
            </div>
          )}
          {hud.banner && hud.phase !== 'count' && (
            <div key={hud.banner} style={{ position: 'absolute', top: '26%', left: 0, right: 0, textAlign: 'center', fontSize: 43, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '3px 3px 0 #c00, 5px 5px 0 rgba(0,0,0,0.5)', animation: 'wxBanner 1.3s ease-out forwards', pointerEvents: 'none' }}>
              {hud.banner}
            </div>
          )}
          {hud.phase === 'goal' && (
            <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 30, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '2px 2px 0 #000' }}>{hud.medal}</div>
              <div style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '2px 2px 0 #000' }}>TIME {hud.finalTime}</div>
            </div>
          )}

          {/* GTA風：地名スプラッシュ */}
          {zoneSplash && (
            <div style={{ position: 'absolute', right: 18, bottom: 168, fontSize: 27, fontWeight: 700, color: '#fff', textShadow: '2px 2px 6px rgba(0,0,0,0.8)', animation: 'wxSplash 2.1s ease-out forwards', pointerEvents: 'none', fontFamily: 'serif' }}>
              {zoneSplash}
            </div>
          )}

          {/* 左下：GTA風円形ミニマップ */}
          <div style={{ position: 'absolute', left: 12, bottom: 12, width: 150, height: 150, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.75)', boxShadow: '0 4px 18px rgba(0,0,0,0.55)', pointerEvents: 'none' }}>
            <canvas ref={mapRef} width={150} height={150} style={{ width: 150, height: 150 }} />
          </div>

          {/* 右下：メータークラスタ（アーケード風） */}
          <div style={{ position: 'absolute', right: 12, bottom: 10, textAlign: 'right', pointerEvents: 'none', transform: 'skewX(-6deg)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 8 }}>
              <div>
                <span style={{ fontSize: 46, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '3px 3px 0 #000', fontVariantNumeric: 'tabular-nums', lineHeight: 0.95 }}>{Math.round(hud.speed)}</span>
                <span style={{ fontSize: 13, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '1px 1px 0 #000' }}> km/h</span>
              </div>
              <div style={{ fontSize: 52, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '3px 3px 0 #000', lineHeight: 0.95, minWidth: 44, textAlign: 'center' }}>{hud.gear}</div>
            </div>
            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', marginTop: 4 }}>
              {Array.from({ length: 18 }, (_, i) => (
                <div key={i} style={{
                  width: 8, height: 13,
                  background: i / 18 <= hud.rpm ? (i > 14 ? '#ff3524' : i > 10 ? '#ffb300' : '#3fe06c') : 'rgba(255,255,255,0.16)',
                  transform: 'skewX(-12deg)',
                }} />
              ))}
              <span style={{ fontSize: 11, fontWeight: 900, color: '#fff', marginLeft: 5, textShadow: '1px 1px 0 #000' }}>{hud.mode}</span>
            </div>
          </div>

          {/* タッチ操作 */}
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 176, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btn, width: 60 }} {...hold((d) => setTouch({ steer: d ? -1 : 0 }))}>◀</button>
              <button style={{ ...btn, width: 60 }} {...hold((d) => setTouch({ steer: d ? 1 : 0 }))}>▶</button>
              <button style={{ ...btn, width: 66, color: '#ffd21f' }} {...hold((d) => setTouch({ drift: d }))}>DRIFT</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btn, width: 62 }} {...hold((d) => setTouch({ brake: d }))}>ブレーキ</button>
              <button style={{ ...btn, width: 62, borderColor: '#ffd21f', color: '#ffd21f' }} {...hold((d) => setTouch({ throttle: d }))}>アクセル</button>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', gap: 6 }}>
            <button style={{ ...btn, padding: '7px 10px', fontSize: 12.5 }} onClick={() => inputRef.current?.onCamera?.()}>📷 {hud.cam}</button>
            <button style={{ ...btn, padding: '7px 10px', fontSize: 12.5 }} onClick={() => { audioToggle() }}>{muted ? '🔇 音OFF' : '🔊 音ON'}</button>
            {hud.mode === 'MT' && (
              <>
                <button style={{ ...btn, padding: '7px 12px', fontSize: 13 }} onClick={() => inputRef.current && shiftBy(1)}>＋</button>
                <button style={{ ...btn, padding: '7px 12px', fontSize: 13 }} onClick={() => inputRef.current && shiftBy(-1)}>−</button>
              </>
            )}
            <button style={{ ...btn, padding: '7px 10px', fontSize: 12.5 }} onClick={() => setPhaseUi('title')}>タイトル</button>
          </div>
        </>
      )}

      {phaseUi === 'title' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(3,5,10,0.25), rgba(3,5,10,0.78))', padding: 14, overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 520, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 37, fontWeight: 900, fontStyle: 'italic', transform: 'skewX(-6deg)', color: '#ffd21f', textShadow: '3px 3px 0 #c00, 6px 6px 0 rgba(0,0,0,0.5)', letterSpacing: 1 }}>峠ドリフト3D</div>
            <div style={{ fontSize: 12.5, color: '#d7e6f2', marginTop: 2 }}>市街地・高速・峠を自由に走れるオープンワールド</div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {CAR_SPECS.map((c) => (
                <button key={c.id} onClick={() => setCarId(c.id)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: carId === c.id ? '2px solid #ffd21f' : '1px solid rgba(255,255,255,0.25)',
                  background: carId === c.id ? 'rgba(255,210,31,0.13)' : 'rgba(10,14,20,0.55)', color: '#fff',
                }}>
                  <div style={{ fontSize: 17, fontWeight: 900, fontStyle: 'italic' }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: '#ffd21f', fontWeight: 700 }}>{c.sub}</div>
                  <div style={{ fontSize: 11.5, color: '#cfe3ef', marginTop: 2 }}>{c.drive}／{c.power}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setMode('free')} style={{
                flex: 1, padding: '9px 8px', borderRadius: 12, cursor: 'pointer',
                border: mode === 'free' ? '2px solid #ffd21f' : '1px solid rgba(255,255,255,0.25)',
                background: mode === 'free' ? 'rgba(255,210,31,0.13)' : 'rgba(10,14,20,0.55)', color: '#fff', fontWeight: 800, fontSize: 14,
              }}>🌃 フリーローム</button>
              <button onClick={() => setMode('race')} style={{
                flex: 1, padding: '9px 8px', borderRadius: 12, cursor: 'pointer',
                border: mode === 'race' ? '2px solid #ffd21f' : '1px solid rgba(255,255,255,0.25)',
                background: mode === 'race' ? 'rgba(255,210,31,0.13)' : 'rgba(10,14,20,0.55)', color: '#fff', fontWeight: 800, fontSize: 14,
              }}>🏁 チェックポイントレース</button>
            </div>

            <button
              onClick={() => startRef.current(carId, mode)}
              style={{ marginTop: 13, width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(180deg, #ffd21f, #f5a623)', color: '#1a1200', fontSize: 19, fontWeight: 900, fontStyle: 'italic', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}
            >
              ▶ スタート
            </button>
            {(bestRace !== null || bestDrift !== null) && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#ffe98a' }}>
                {bestRace !== null && <>レースベスト {fmt(bestRace)}　</>}
                {bestDrift !== null && <>ドリフトベスト {bestDrift.toLocaleString()}pt</>}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.65, color: '#b9c9d6', textAlign: 'left', background: 'rgba(8,10,14,0.55)', borderRadius: 10, padding: '8px 11px' }}>
              キーボード：↑↓←→／WASD、Space＝ドリフト、E/Q＝シフト、Nタップ＝ニュートラル、<b style={{ color: '#ffd21f' }}>Nを2秒長押し＝AT⇔MT切替</b>、C＝視点<br />
              選択中：{spec.name}（{spec.drive}）／ レースは黄色い光の柱を順に通過。フリーはドリフトでスコアが伸びる。
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function audioToggle() {
    const next = !muted
    setMuted(next)
    if (audioRef.current) audioRef.current.muted = next
  }
  function shiftBy(d: number) {
    const inp = inputRef.current
    if (!inp) return
    if (d > 0) inp.onShiftUp?.(); else inp.onShiftDown?.()
  }
}
