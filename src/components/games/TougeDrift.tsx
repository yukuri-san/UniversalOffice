import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { Engine, makeBlobShadow } from '../../engine/engine'
import { Input } from '../../engine/input'
import { GameAudio } from '../../engine/audio'
import { CAR_SPECS, Vehicle, buildHachiroku, buildGTR, buildTrafficCar, type BuiltCar, type CarSpec } from '../../engine/cars'
import { buildWorld, frameAt, type World } from '../../engine/world'

/**
 * 峠ドリフト3D v2.0
 * WebX 専用ゲームエンジン（src/engine）の上に構築。
 * 市街地・高速道路・峠を連結した周回ワールドをフリーラン／バトルで走る。
 * 車種選択（ハチロク風 5速 / GT-R34風 6速）、MT/AT 変速機、複数視点、交通車両つき。
 */

const BESTLAP_KEY = 'webx-touge-bestlap'
const BESTRACE_KEY = 'webx-touge-best'
const CAMERAS = ['チェイス（遠）', 'チェイス（近）', 'ボンネット', 'ルーフ', 'バンパー', 'オービット'] as const
const ZONE_LABEL: Record<string, string> = { city: '市街地', highway: '高速道路', touge: '峠', link: '連絡路' }

interface HudState {
  kmh: number; rpm: number; redline: number; gear: string; mode: string
  drift: number; gap: number; pos: number; progP: number; progR: number
  count: number; zone: string; cam: string; lap: string; drifting: boolean
}
type Phase = 'title' | 'count' | 'drive' | 'goal'
type GameMode = 'free' | 'race'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}
function loadNum(key: string): number {
  try { const v = JSON.parse(localStorage.getItem(key) ?? 'null') as { time?: number } | null; return v?.time ?? 0 } catch { return 0 }
}

export default function TougeDrift() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>('title')
  const [carId, setCarId] = useState('hachiroku')
  const [gameMode, setGameMode] = useState<GameMode>('free')
  const [hud, setHud] = useState<HudState>({ kmh: 0, rpm: 900, redline: 7500, gear: 'N', mode: 'AT', drift: 0, gap: 0, pos: 2, progP: 0, progR: 0, count: 3, zone: '市街地', cam: CAMERAS[0], lap: '', drifting: false })
  const [result, setResult] = useState<{ win: boolean; time: number; drift: number } | null>(null)
  const [toast, setToast] = useState('')
  const [muted, setMuted] = useState(false)
  const [transMode, setTransMode] = useState<'MT' | 'AT'>('AT')
  const [bestLap, setBestLap] = useState(() => loadNum(BESTLAP_KEY))
  const [bestRace, setBestRace] = useState(() => loadNum(BESTRACE_KEY))
  const phaseRef = useRef<Phase>('title')
  const startRef = useRef<(carId: string, mode: GameMode) => void>(() => undefined)
  const resetRef = useRef<() => void>(() => undefined)
  const camRef = useRef<() => void>(() => undefined)
  const gearRef = useRef<{ up: () => void; down: () => void; neutral: () => void; toggleMode: () => void }>({ up: () => undefined, down: () => undefined, neutral: () => undefined, toggleMode: () => undefined })
  const touchRef = useRef<{ steer: number; throttle: boolean; brake: boolean; drift: boolean }>({ steer: 0, throttle: false, brake: false, drift: false })
  const audioRef = useRef<GameAudio | null>(null)
  const toastTimer = useRef<number | null>(null)

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p) }
  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const engine = new Engine(mount)
    engine.setupNight(0x05070f, 0.0075)
    engine.addStarsAndMoon()
    const world: World = buildWorld()
    engine.scene.add(world.group)
    const { frames, length } = world

    const input = new Input()
    const audio = new GameAudio()
    audioRef.current = audio

    // 交通車両
    const trafficColors = [0xb03030, 0x3050b0, 0xc0c0c8, 0x30a060, 0xd08020, 0x707078, 0x8040a0, 0x385058]
    interface Traffic { built: BuiltCar; s: number; lat: number; speed: number }
    const traffic: Traffic[] = trafficColors.map((c, i) => {
      const built = buildTrafficCar(c)
      const sh = makeBlobShadow(2.4)
      sh.position.set(0, 0.03, 0)
      built.group.add(sh)
      engine.scene.add(built.group)
      const s = (length / trafficColors.length) * i + 120
      const f = frameAt(frames, length, s)
      return { built, s, lat: (i % 2 === 0 ? -1 : 1) * f.width * 0.24, speed: 11 + (i % 4) * 2.2 }
    })

    interface PlayerRig { built: BuiltCar; vehicle: Vehicle; spec: CarSpec }
    let player: PlayerRig | null = null
    let rival: (Traffic & { targetBase: number }) | null = null
    const P = { s: 0, lat: -1.6, latVel: 0, drift: false, driftScore: 0 }
    let mode: GameMode = 'free'
    let raceTime = 0
    let countT = 0
    let finished = false
    let lapStart = 0
    let lapCurrent = 0
    let lastLap = 0
    let prevS = 0
    let camMode = 0
    let camPos = new THREE.Vector3(0, 5, 300)
    const tmpM = new THREE.Matrix4()

    const buildPlayerCar = (spec: CarSpec): BuiltCar => (spec.id === 'gtr34' ? buildGTR() : buildHachiroku())
    const startGame = (cid: string, gm: GameMode) => {
      const spec = CAR_SPECS.find((c) => c.id === cid) ?? CAR_SPECS[0]
      if (player) { engine.scene.remove(player.built.group) }
      if (rival) { engine.scene.remove(rival.built.group); rival = null }
      const built = buildPlayerCar(spec)
      const sh2 = makeBlobShadow(2.5)
      sh2.position.set(0, 0.03, 0)
      built.group.add(sh2)
      for (const sx of [-0.55, 0.55]) {
        const spot = new THREE.SpotLight(0xd6e9ff, 300, 95, 0.48, 0.55, 1.3)
        spot.position.set(sx, 0.75, 1.9)
        spot.target.position.set(sx * 1.7, -0.5, 28)
        built.group.add(spot)
        built.group.add(spot.target)
      }
      engine.scene.add(built.group)
      const vehicle = new Vehicle(spec)
      vehicle.setMode(input.usesKeyboard ? 'MT' : 'AT')
      vehicle.gear = 1
      setTransMode(vehicle.mode)
      player = { built, vehicle, spec }
      P.s = 0; P.lat = -1.6; P.latVel = 0; P.drift = false; P.driftScore = 0
      raceTime = 0; countT = 0; finished = false
      lapStart = 0; lapCurrent = 0; prevS = 0
      mode = gm
      if (gm === 'race') {
        const rivalSpec = CAR_SPECS.find((c) => c.id !== cid) ?? CAR_SPECS[1]
        const rb = buildPlayerCar(rivalSpec)
        const sh3 = makeBlobShadow(2.5)
        sh3.position.set(0, 0.03, 0)
        rb.group.add(sh3)
        engine.scene.add(rb.group)
        rival = { built: rb, s: 17, lat: 1.7, speed: 0, targetBase: 0 }
        setPhaseBoth('count')
      } else {
        setPhaseBoth('drive')
      }
      audio.start()
    }
    startRef.current = startGame
    resetRef.current = () => {
      if (player) { engine.scene.remove(player.built.group); player = null }
      if (rival) { engine.scene.remove(rival.built.group); rival = null }
      audio.update(900, 0, 0)
      setPhaseBoth('title')
    }
    camRef.current = () => {
      camMode = (camMode + 1) % CAMERAS.length
      showToast(`視点：${CAMERAS[camMode]}`)
    }
    gearRef.current = {
      up: () => player?.vehicle.shiftUp(),
      down: () => player?.vehicle.shiftDown(),
      neutral: () => player?.vehicle.toNeutral(),
      toggleMode: () => {
        if (!player) return
        const next = player.vehicle.mode === 'MT' ? 'AT' : 'MT'
        player.vehicle.setMode(next)
        setTransMode(next)
        showToast(next === 'AT' ? 'ATモードに切り替えた' : 'MTモードに切り替えた')
      },
    }
    input.onShiftUp = () => gearRef.current.up()
    input.onShiftDown = () => gearRef.current.down()
    input.onNeutralTap = () => gearRef.current.neutral()
    input.onNeutralLongPress = () => gearRef.current.toggleMode()
    input.onCamera = () => camRef.current()

    const placeCar = (built: BuiltCar, s: number, lat: number, yawExtra: number, steerVis: number, speed: number, dt: number) => {
      const f = frameAt(frames, length, s)
      const pos = f.pos.clone().addScaledVector(f.side, lat)
      built.group.position.set(pos.x, pos.y + 0.02, pos.z)
      const cos = Math.cos(yawExtra)
      const sin = Math.sin(yawExtra)
      const fwd = f.tan.clone().multiplyScalar(cos).addScaledVector(f.side, sin)
      const side2 = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
      const up2 = new THREE.Vector3().crossVectors(side2, fwd).normalize()
      tmpM.makeBasis(side2, up2, fwd)
      built.group.quaternion.setFromRotationMatrix(tmpM)
      for (const sp of built.spins) sp.rotation.x += (speed / 0.34) * dt
      for (const pv of built.frontPivots) pv.rotation.y = steerVis * 0.42
      return f
    }

    const hudTimer = window.setInterval(() => {
      if (!player) return
      const v = player.vehicle
      const f = frameAt(frames, length, P.s)
      setHud({
        kmh: Math.round(Math.abs(v.speed) * 3.6),
        rpm: Math.round(v.rpm),
        redline: player.spec.redline,
        gear: v.gearLabel === 'D' ? String(v.atGearNum) : v.gearLabel,
        mode: v.mode,
        drift: Math.floor(P.driftScore),
        gap: rival ? rival.s - P.s : 0,
        pos: rival ? (P.s >= rival.s ? 1 : 2) : 1,
        progP: Math.min(1, Math.max(0, P.s / length)),
        progR: rival ? Math.min(1, Math.max(0, rival.s / length)) : 0,
        count: phaseRef.current === 'count' ? Math.max(1, 3 - Math.floor(countT)) : 0,
        zone: ZONE_LABEL[f.zone] ?? '',
        cam: CAMERAS[camMode],
        lap: mode === 'free' ? `${fmt(lapCurrent)}${lastLap ? `（前周 ${fmt(lastLap)}）` : ''}` : fmt(raceTime),
        drifting: P.drift,
      })
    }, 100)

    engine.start((dt) => {
      input.touch.steer = touchRef.current.steer
      input.touch.throttle = touchRef.current.throttle
      input.touch.brake = touchRef.current.brake
      input.touch.drift = touchRef.current.drift
      input.poll()
      const inp = input.state

      // 交通車両は常時走らせる
      for (const t of traffic) {
        t.s += t.speed * dt
        placeCar(t.built, t.s, t.lat, 0, 0, t.speed, dt)
      }
      if (!player || (phaseRef.current !== 'drive' && phaseRef.current !== 'count' && phaseRef.current !== 'goal')) {
        // タイトル画面：ゆっくり周回カメラ
        const a = engine.elapsed * 0.05
        engine.camera.position.set(Math.cos(a) * 26, 9, 330 + Math.sin(a) * 26)
        engine.camera.lookAt(0, 1, 330)
        return
      }
      const v = player.vehicle
      const spec = player.spec

      if (phaseRef.current === 'count') {
        countT += dt
        if (countT >= 3) { setPhaseBoth('drive'); raceTime = 0 }
      }

      if (phaseRef.current === 'drive' && !finished) {
        if (mode === 'race') raceTime += dt
        else lapCurrent += dt
        const fHere = frameAt(frames, length, P.s)
        v.update(dt, inp.throttle, inp.brake, fHere.tan.y)
        // 横方向（ドリフト）物理
        const steerAuth = THREE.MathUtils.clamp(Math.abs(v.speed) / 9, 0, 1)
        const wantDrift = (inp.drift && Math.abs(v.speed) > 12) || (Math.abs(inp.steer) > 0.92 && Math.abs(v.speed) > 30)
        P.drift = wantDrift && v.speed > 0
        const grip = (P.drift ? 1.7 : 8.5) * spec.grip
        const targetLatVel = inp.steer * (4.2 + Math.abs(v.speed) * 0.17) * steerAuth * (P.drift ? 1.3 * spec.driftiness : 1)
        P.latVel += (targetLatVel - P.latVel) * Math.min(1, grip * dt)
        P.latVel += fHere.curve * v.speed * v.speed * 0.30 * dt * (P.drift ? 1.3 : 0.9)
        P.lat += P.latVel * dt
        const railAt = fHere.width / 2 + 1.4
        if (Math.abs(P.lat) > railAt) { P.lat = Math.sign(P.lat) * railAt; P.latVel *= -0.25; v.speed *= 0.94 }
        if (Math.abs(P.lat) > fHere.width / 2 + 0.4 && Math.abs(v.speed) > 0) {
          v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 20 * dt) // 路肩減速
        }
        prevS = P.s
        P.s += v.speed * dt
        if (P.drift && Math.abs(v.speed) > 10) P.driftScore += Math.abs(v.speed) * dt * (1 + Math.abs(P.latVel) * 0.12)
        // フリーランの周回計測
        const prevW = ((prevS % length) + length) % length
        const nowW = ((P.s % length) + length) % length
        if (mode === 'free' && prevW > length * 0.92 && nowW < length * 0.08 && v.speed > 0) {
          lastLap = lapCurrent
          lapCurrent = 0
          lapStart = raceTime
          void lapStart
          if (lastLap > 20) {
            const prev = loadNum(BESTLAP_KEY)
            if (!prev || lastLap < prev) { localStorage.setItem(BESTLAP_KEY, JSON.stringify({ time: lastLap })); setBestLap(lastLap) }
          }
        }
        // ライバル
        if (rival && mode === 'race') {
          let maxCurve = 0
          for (let d = 0; d < 70; d += 10) maxCurve = Math.max(maxCurve, Math.abs(frameAt(frames, length, rival.s + d).curve))
          const rTarget = (maxCurve > 0.011 ? 23 : maxCurve > 0.008 ? 29 : maxCurve > 0.005 ? 37 : maxCurve > 0.003 ? 45 : 53) * (spec.id === 'gtr34' ? 1.04 : 0.97)
          const rubber = THREE.MathUtils.clamp((P.s - rival.s) * 0.012, -2.5, 3.5)
          rival.speed = THREE.MathUtils.clamp(rival.speed + (rival.speed < rTarget + rubber ? 14 : -32) * dt, 0, 58)
          rival.s += rival.speed * dt
          rival.lat = Math.sin(rival.s * 0.011) * 1.7
          if (rival.s >= length && !finished) {
            finished = true
            const res = { win: false, time: raceTime, drift: Math.floor(P.driftScore) }
            setResult(res)
            setPhaseBoth('goal')
          }
        }
        // 接触（ライバル・交通）
        const others = rival ? [rival, ...traffic] : traffic
        for (const o of others) {
          let ds = P.s - o.s
          ds = ((ds + length / 2) % length + length) % length - length / 2
          if (Math.abs(ds) < 4.4 && Math.abs(P.lat - o.lat) < 1.8) {
            if (ds < 0 && v.speed > o.speed) { v.speed = o.speed; P.s = o.s - 4.4 }
            P.latVel += (P.lat >= o.lat ? 1 : -1) * 5 * dt
          }
        }
        // ゴール
        if (mode === 'race' && P.s >= length && !finished) {
          finished = true
          const res = { win: true, time: raceTime, drift: Math.floor(P.driftScore) }
          setResult(res)
          const prev = loadNum(BESTRACE_KEY)
          if (!prev || raceTime < prev) { localStorage.setItem(BESTRACE_KEY, JSON.stringify({ time: raceTime, win: true })); setBestRace(raceTime) }
          setPhaseBoth('goal')
        }
        audio.update(v.rpm, inp.throttle ? 1 : 0, P.drift ? Math.min(1, Math.abs(P.latVel) / 6) : 0)
      }

      if (phaseRef.current === 'goal') audio.update(950, 0, 0)
      // 描画
      const yaw = P.drift ? -Math.atan2(P.latVel, Math.max(Math.abs(v.speed), 6)) * 0.85 : -Math.atan2(P.latVel, Math.max(Math.abs(v.speed), 6)) * 0.22
      const pf = placeCar(player.built, P.s, P.lat, yaw, inp.steer, v.speed, dt)
      player.built.brakeLightMat.emissiveIntensity = inp.brake ? 2.6 : 0.7
      if (rival) placeCar(rival.built, rival.s, rival.lat, 0, 0, rival.speed, dt)
      // カメラ
      const carPos = player.built.group.position
      const fwd = pf.tan.clone().multiplyScalar(Math.cos(yaw * 0.6)).addScaledVector(pf.side, Math.sin(yaw * 0.6))
      if (camMode === 0 || camMode === 1) {
        const dist = camMode === 0 ? 10.5 : 6.8
        const height = camMode === 0 ? 3.6 : 2.4
        const want = carPos.clone().addScaledVector(fwd, -dist)
        want.y += height
        camPos.lerp(want, 1 - Math.exp(-dt * 4.5))
        engine.camera.position.copy(camPos)
        const look = carPos.clone().addScaledVector(pf.tan, 12)
        look.y += 1.1
        engine.camera.lookAt(look)
        const targetFov = (camMode === 0 ? 62 : 68) + (Math.abs(v.speed) / spec.vmax) * 10
        if (Math.abs(engine.camera.fov - targetFov) > 0.1) { engine.camera.fov += (targetFov - engine.camera.fov) * 0.08; engine.camera.updateProjectionMatrix() }
      } else if (camMode === 5) {
        const a = engine.elapsed * 0.35
        engine.camera.position.set(carPos.x + Math.cos(a) * 8, carPos.y + 2.4, carPos.z + Math.sin(a) * 8)
        engine.camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z)
      } else {
        const local = camMode === 2 ? new THREE.Vector3(0, 1.04, 1.15) : camMode === 3 ? new THREE.Vector3(0, 1.78, -0.35) : new THREE.Vector3(0, 0.45, 2.35)
        player.built.group.updateMatrixWorld()
        const wp = player.built.group.localToWorld(local.clone())
        engine.camera.position.copy(wp)
        const look = wp.clone().addScaledVector(pf.tan, 30)
        look.y += camMode === 4 ? 0.2 : 0.7
        engine.camera.lookAt(look)
        if (Math.abs(engine.camera.fov - 66) > 0.1) { engine.camera.fov = 66; engine.camera.updateProjectionMatrix() }
      }
    })

    return () => {
      window.clearInterval(hudTimer)
      input.dispose()
      audio.dispose()
      engine.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hold = (patch: Partial<{ steer: number; throttle: boolean; brake: boolean; drift: boolean }>) => {
    const reset = () => {
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
        ;(touchRef.current as Record<string, unknown>)[k] = typeof patch[k] === 'boolean' ? false : 0
      }
    }
    return {
      onPointerDown: (e: ReactPointerEvent) => { e.preventDefault(); Object.assign(touchRef.current, patch) },
      onPointerUp: reset,
      onPointerLeave: reset,
      onPointerCancel: reset,
    }
  }

  const btn: CSSProperties = { pointerEvents: 'auto', userSelect: 'none', touchAction: 'none', border: '1px solid rgba(255,255,255,.35)', background: 'rgba(10,14,24,.55)', color: '#fff', borderRadius: 14, fontWeight: 700 }
  const spec = CAR_SPECS.find((c) => c.id === carId) ?? CAR_SPECS[0]
  const rpmRatio = Math.min(1, hud.rpm / hud.redline)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#05070f', position: 'relative', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ flex: 1, minHeight: 260, position: 'relative' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', color: '#fff' }}>
        {(phase === 'drive' || phase === 'count' || phase === 'goal') && (
          <>
            <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 13, lineHeight: 1.55, textShadow: '0 1px 4px #000' }}>
              <div>📍 {hud.zone}　{hud.lap && `⏱ ${hud.lap}`}</div>
              {gameMode === 'race' ? (
                <>
                  <div>相手との差 {hud.gap >= 0 ? '+' : ''}{hud.gap.toFixed(0)}m（{hud.pos === 1 ? '1位' : '2位'}）</div>
                  <div style={{ width: 150, height: 6, background: 'rgba(255,255,255,.25)', borderRadius: 3, marginTop: 3, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, width: `${hud.progP * 100}%`, background: '#ffd34d', borderRadius: 3 }} />
                    <div style={{ position: 'absolute', top: -2, left: `${hud.progR * 100}%`, width: 3, height: 10, background: '#ff3540' }} />
                  </div>
                </>
              ) : (
                <div>DRIFT {hud.drift} pt{hud.drifting ? ' 🔥' : ''}</div>
              )}
            </div>
            <div style={{ position: 'absolute', top: 10, right: 12, textAlign: 'right', textShadow: '0 1px 4px #000' }}>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button style={{ ...btn, padding: '4px 10px', fontSize: 12 }} onClick={() => camRef.current()}>📷 {hud.cam}</button>
                <button style={{ ...btn, padding: '4px 10px', fontSize: 12 }} onClick={() => { const m = !muted; setMuted(m); if (audioRef.current) audioRef.current.muted = m }}>{muted ? '🔇' : '🔊'}</button>
              </div>
              <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>{hud.kmh}<span style={{ fontSize: 12 }}> km/h</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#ffd34d', minWidth: 44 }}>{hud.gear}</div>
                <div>
                  <div style={{ width: 130, height: 9, background: 'rgba(255,255,255,.22)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${rpmRatio * 100}%`, background: rpmRatio > 0.86 ? '#ff3540' : '#ffd34d' }} />
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{hud.rpm} rpm・{hud.mode}</div>
                </div>
              </div>
            </div>
          </>
        )}
        {toast && (
          <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', background: 'rgba(8,10,18,.8)', padding: '7px 16px', borderRadius: 999, fontSize: 13.5, border: '1px solid rgba(255,255,255,.25)' }}>{toast}</div>
        )}
        {phase === 'count' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 92, fontWeight: 900, color: '#ffd34d', textShadow: '0 4px 24px #000' }}>{hud.count}</div>
        )}
        {phase === 'title' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,5,12,.55)', pointerEvents: 'auto', textAlign: 'center', padding: 16, overflowY: 'auto' }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2 }}>峠ドリフト3D</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>市街地〜高速道路〜峠を巡る周回ワールド</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              {CAR_SPECS.map((c) => (
                <button key={c.id} onClick={() => setCarId(c.id)} style={{ ...btn, padding: '10px 14px', textAlign: 'left', background: carId === c.id ? 'rgba(225,29,46,.75)' : 'rgba(10,14,24,.6)', minWidth: 210 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.9 }}>{c.sub}</div>
                  <div style={{ fontSize: 11.5, opacity: 0.9 }}>{c.powerPs}ps / {c.weightKg}kg / {c.gears.length}速{c.drive}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={() => setGameMode('free')} style={{ ...btn, padding: '9px 18px', background: gameMode === 'free' ? 'rgba(225,29,46,.75)' : 'rgba(10,14,24,.6)' }}>フリーラン</button>
              <button onClick={() => setGameMode('race')} style={{ ...btn, padding: '9px 18px', background: gameMode === 'race' ? 'rgba(225,29,46,.75)' : 'rgba(10,14,24,.6)' }}>バトル（1周勝負）</button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 10, lineHeight: 1.7, maxWidth: 520 }}>
              キーボード：←→ ステア／↑ アクセル／↓ ブレーキ／スペース ドリフト／E・Q シフト／N ニュートラル（2秒長押しで AT⇔MT 切替）／C 視点<br />
              キーボード使用時は MT、タッチ時は AT で開始。視点は6種類。
            </div>
            {(bestLap > 0 || bestRace > 0) && (
              <div style={{ fontSize: 12.5, color: '#ffd34d', marginTop: 6 }}>
                {bestLap > 0 && <>ベストラップ {fmt(bestLap)}　</>}
                {bestRace > 0 && <>バトル最速 {fmt(bestRace)}</>}
              </div>
            )}
            <button style={{ ...btn, marginTop: 14, padding: '13px 36px', fontSize: 17, background: '#e11d2e', border: 'none' }} onClick={() => startRef.current(carId, gameMode)}>スタート</button>
          </div>
        )}
        {phase === 'goal' && result && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,5,12,.5)', pointerEvents: 'auto', textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: result.win ? '#ffd34d' : '#c7cede' }}>{result.win ? '🏆 勝利！' : '敗北…'}</div>
            <div style={{ fontSize: 15, marginTop: 8 }}>タイム {fmt(result.time)}／ドリフト {result.drift} pt</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={{ ...btn, padding: '12px 26px', fontSize: 15, background: '#e11d2e', border: 'none' }} onClick={() => startRef.current(carId, gameMode)}>もう一度</button>
              <button style={{ ...btn, padding: '12px 26px', fontSize: 15 }} onClick={() => { setResult(null); resetRef.current() }}>車種選択へ</button>
            </div>
          </div>
        )}
        {(phase === 'drive' || phase === 'count') && (
          <>
            <div style={{ position: 'absolute', left: 10, bottom: 12, display: 'flex', gap: 10 }}>
              <button style={{ ...btn, width: 68, height: 68, fontSize: 26 }} {...hold({ steer: -1 })}>◀</button>
              <button style={{ ...btn, width: 68, height: 68, fontSize: 26 }} {...hold({ steer: 1 })}>▶</button>
            </div>
            <div style={{ position: 'absolute', right: 10, bottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {transMode === 'MT' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button style={{ ...btn, width: 52, height: 40, fontSize: 13 }} onClick={() => gearRef.current.up()}>＋</button>
                  <button style={{ ...btn, width: 52, height: 40, fontSize: 13 }} onClick={() => gearRef.current.down()}>−</button>
                </div>
              )}
              <button style={{ ...btn, width: 56, height: 56, fontSize: 11 }} onClick={() => gearRef.current.toggleMode()}>{transMode}</button>
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
