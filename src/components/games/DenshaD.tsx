// 電車でD風バトル3D：夜の峠路線でライバル列車と対決
// カーブで流す「ドリフト」、溝落とし、脱線リスク管理が勝負の分かれ目
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Engine } from '../../engine/engine'
import { GameAudio } from '../../engine/audio'
import {
  buildRailRoute, buildTrackSet, buildConsist, placeConsist,
  TrainSim, LIVERIES, type RailRoute,
} from '../../engine/rail'

const CTRL: [number, number, number][] = [
  [0, 0, -60], [0, 0, 260], [-40, 2, 560], [-130, 6, 830], [-90, 12, 1120],
  [-210, 20, 1380], [-260, 30, 1700], [-170, 40, 1980], [-250, 52, 2280],
  [-330, 64, 2560], [-260, 76, 2860], [-330, 88, 3150], [-300, 96, 3450], [-310, 100, 3720],
]
const PLAYER_LAT = -2.1
const RIVAL_LAT = 2.1

function findS(route: RailRoute, x: number, z: number): number {
  let best = 0, bd = 1e18
  route.frames.forEach((f, i) => {
    const d = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z)
    if (d < bd) { bd = d; best = i * route.spacing }
  })
  return best
}
function fmt(t: number): string {
  const m = Math.floor(t / 60), s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

interface Hud {
  kmh: number; lever: string; gap: number; time: string; style: number
  phase: string; count: number; banner: string; progP: number; progR: number
  result: string; resultSub: string; danger: number; gutter: boolean
}

export default function DenshaD() {
  const mountRef = useRef<HTMLDivElement>(null)
  const ctlRef = useRef<{ up: () => void; down: () => void; eb: () => void }>({ up: () => {}, down: () => {}, eb: () => {} })
  const [phaseUi, setPhaseUi] = useState<'title' | 'game'>('title')
  const [best, setBest] = useState<number | null>(() => { try { const v = localStorage.getItem('webx-denshaD-best'); return v ? parseFloat(v) : null } catch { return null } })
  const [hud, setHud] = useState<Hud>({
    kmh: 0, lever: 'N', gap: 0, time: '0:00.00', style: 0, phase: 'count', count: 3,
    banner: '', progP: 0, progR: 0, result: '', resultSub: '', danger: 0, gutter: false,
  })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const engine = new Engine(mount)
    engine.setupNight()
    engine.addStarsAndMoon()
    const route = buildRailRoute(CTRL, 80)
    engine.scene.add(buildTrackSet(route, [PLAYER_LAT, RIVAL_LAT]))
    const GOAL = route.length - 140
    const gutters: [number, number][] = [
      [findS(route, -205, 1360) - 80, findS(route, -205, 1360) + 80],
      [findS(route, -255, 2300) - 80, findS(route, -255, 2300) + 80],
    ]
    // 溝の目印（黄色ライン）
    for (const [g0, g1] of gutters) {
      const pts: THREE.Vector3[] = []
      for (let s = g0; s <= g1; s += 6) pts.push(route.posAt(s, PLAYER_LAT - 2.2, 0.16))
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xffd21f }),
      )
      engine.scene.add(line)
    }
    // 景観
    {
      const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 36), new THREE.MeshStandardMaterial({ color: 0x131a13, roughness: 1 }))
      ground.rotation.x = -Math.PI / 2; ground.position.set(-160, -0.4, 1800)
      engine.scene.add(ground)
      const mMat = new THREE.MeshBasicMaterial({ color: 0x101722 })
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.3
        const m = new THREE.Mesh(new THREE.ConeGeometry(240 + (i % 3) * 80, 170 + (i % 4) * 60, 5), mMat)
        m.position.set(-160 + Math.cos(a) * 1050, 0, 1800 + Math.sin(a) * 1050)
        engine.scene.add(m)
      }
      const leafI = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4.2, 7), new THREE.MeshStandardMaterial({ color: 0x14261a, roughness: 1 }), 420)
      const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion()
      let ti = 0
      for (let s = 30; s < route.length - 30 && ti < 420; s += 9) {
        const f = route.frameAt(s)
        const side = Math.random() < 0.5 ? -1 : 1
        const lat = side * (10 + Math.random() * 60)
        const sc = 0.9 + Math.random() * 1.1
        m4.compose(new THREE.Vector3(f.x + f.rx * lat, f.y + 1.8 * sc, f.z + f.rz * lat), q0, new THREE.Vector3(sc, sc, sc))
        leafI.setMatrixAt(ti++, m4)
      }
      leafI.count = ti
      engine.scene.add(leafI)
    }

    const player = buildConsist(LIVERIES.green, 4)
    engine.scene.add(player.group)
    const rival = buildConsist(LIVERIES.red, 4)
    engine.scene.add(rival.group)

    // 火花パーティクル
    const SPARKS = 160
    const sparkPos = new Float32Array(SPARKS * 3)
    const sparkVel = new Float32Array(SPARKS * 3)
    const sparkLife = new Float32Array(SPARKS)
    const sparkGeo = new THREE.BufferGeometry()
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffb545, size: 0.55, transparent: true, opacity: 0.95 }))
    sparks.frustumCulled = false
    engine.scene.add(sparks)
    let sparkIdx = 0
    const emitSpark = (p: THREE.Vector3, n: number) => {
      for (let i = 0; i < n; i++) {
        const k = sparkIdx; sparkIdx = (sparkIdx + 1) % SPARKS
        sparkPos[k * 3] = p.x; sparkPos[k * 3 + 1] = p.y; sparkPos[k * 3 + 2] = p.z
        sparkVel[k * 3] = (Math.random() - 0.5) * 7
        sparkVel[k * 3 + 1] = Math.random() * 4.5
        sparkVel[k * 3 + 2] = (Math.random() - 0.5) * 7
        sparkLife[k] = 0.5 + Math.random() * 0.4
      }
    }

    const audio = new GameAudio()
    const sim = new TrainSim()
    const rivalSim = new TrainSim()
    sim.s = 100
    rivalSim.s = 100
    let phase: 'count' | 'race' | 'finish' = 'count'
    let countT = 0
    let raceT = 0
    let style = 0
    let dangerT = 0
    let derailCd = 0
    let eb = false
    let banner = ''
    let bannerUntil = 0
    let result = ''
    let resultSub = ''
    let camMode = 0
    const showBanner = (t: string, dur = 1.2) => { banner = t; bannerUntil = engine.elapsed + dur }

    const up = () => { audio.start(); if (eb) { eb = false; sim.lever = 0; return } sim.lever = Math.min(5, sim.lever + 1) }
    const down = () => { audio.start(); if (eb) { eb = false; sim.lever = 0; return } sim.lever = Math.max(-8, sim.lever - 1) }
    ctlRef.current = { up, down, eb: () => { eb = true; audio.start() } }
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'e' || k === 'arrowup') { e.preventDefault(); up() }
      else if (k === 'q' || k === 'arrowdown') { e.preventDefault(); down() }
      else if (k === ' ') { e.preventDefault(); eb = true; audio.start() }
      else if (k === 'c') camMode = (camMode + 1) % 2
    }
    window.addEventListener('keydown', onKey)

    const hudTimer = window.setInterval(() => {
      setHud({
        kmh: sim.kmh,
        lever: eb ? 'EB' : sim.leverLabel,
        gap: sim.s - rivalSim.s,
        time: fmt(raceT),
        style: Math.floor(style),
        phase,
        count: Math.max(0, Math.ceil(3 - countT)),
        banner: engine.elapsed < bannerUntil ? banner : '',
        progP: Math.min(1, sim.s / GOAL),
        progR: Math.min(1, rivalSim.s / GOAL),
        result, resultSub,
        danger: Math.min(1, dangerT / 1.6),
        gutter: gutters.some(([a, b]) => sim.s >= a && sim.s <= b),
      })
    }, 100)

    engine.start((dt) => {
      if (phase === 'count') {
        countT += dt
        if (countT >= 3) { phase = 'race'; showBanner('GO!', 0.9); audio.start() }
      }
      const racing = phase === 'race'
      if (racing) raceT += dt

      // プレイヤー
      const grade = route.frameAt(sim.s).grade
      const keep = sim.lever
      if (!racing) sim.lever = 0
      else if (eb) sim.lever = -9
      sim.update(dt, grade)
      sim.lever = keep

      // カーブ判定
      const f = route.frameAt(sim.s)
      const R = Math.abs(f.curve) > 1e-5 ? 1 / Math.abs(f.curve) : 1e9
      const limit = route.limitAt(sim.s)
      const driftV = (limit * 1.03) / 3.6
      const derailV = (limit * 1.38) / 3.6
      const inGutter = gutters.some(([a, b]) => sim.s >= a && sim.s <= b)
      let drifting = false
      if (racing && R < 430 && sim.v > driftV && sim.v < derailV) {
        drifting = true
        style += (sim.v - driftV) * dt * 24 * (inGutter ? 2.4 : 1)
        if (inGutter) {
          sim.v += 0.55 * dt
          if (Math.random() < dt * 2) showBanner('溝落とし!!', 0.7)
        }
        const bogie = route.posAt(sim.s - 68, PLAYER_LAT + (f.curve > 0 ? -1.5 : 1.5), 0.3)
        emitSpark(bogie, 3)
      }
      derailCd = Math.max(0, derailCd - dt)
      if (racing && R < 430 && sim.v >= derailV && derailCd <= 0) {
        dangerT += dt
        sim.v = Math.max(derailV * 0.92, sim.v - 2.1 * dt)
        const bogie = route.posAt(sim.s - 68, PLAYER_LAT + (f.curve > 0 ? -1.5 : 1.5), 0.3)
        emitSpark(bogie, 6)
        if (dangerT > 1.6) {
          dangerT = 0; derailCd = 4
          sim.v = 5.5
          raceT += 5
          showBanner('脱線…！ +5秒', 1.8)
        }
      } else dangerT = Math.max(0, dangerT - dt * 1.4)

      // ライバルAI
      {
        const gap = sim.s - rivalSim.s
        const factor = 0.985 + Math.max(-0.05, Math.min(0.055, gap * 0.00035))
        const desired = Math.min(80, route.limitAt(rivalSim.s + 40) * factor) / 3.6
        if (!racing) rivalSim.lever = 0
        else if (rivalSim.v < desired - 1.2) rivalSim.lever = Math.min(5, rivalSim.lever + (Math.random() < 0.3 ? 1 : 0))
        else if (rivalSim.v > desired + 0.6) rivalSim.lever = Math.max(-5, rivalSim.lever - (Math.random() < 0.3 ? 1 : 0))
        rivalSim.update(dt, route.frameAt(rivalSim.s).grade)
      }

      // 車体傾斜（ドリフト表現）
      placeConsist(player, route, sim.s, PLAYER_LAT)
      placeConsist(rival, route, rivalSim.s, RIVAL_LAT)
      const rollP = THREE.MathUtils.clamp(-f.curve * sim.v * sim.v * 0.0035, -0.16, 0.16) * (drifting ? 1.5 : 1)
      for (const car of player.cars) car.rotation.z = rollP
      const rf = route.frameAt(rivalSim.s)
      const rollR = THREE.MathUtils.clamp(-rf.curve * rivalSim.v * rivalSim.v * 0.0035, -0.16, 0.16)
      for (const car of rival.cars) car.rotation.z = rollR

      // 火花更新
      for (let k = 0; k < SPARKS; k++) {
        if (sparkLife[k] <= 0) { sparkPos[k * 3 + 1] = -50; continue }
        sparkLife[k] -= dt
        sparkVel[k * 3 + 1] -= 9.8 * dt
        sparkPos[k * 3] += sparkVel[k * 3] * dt
        sparkPos[k * 3 + 1] += sparkVel[k * 3 + 1] * dt
        sparkPos[k * 3 + 2] += sparkVel[k * 3 + 2] * dt
      }
      sparkGeo.attributes.position.needsUpdate = true

      // ゴール判定
      if (racing && (sim.s >= GOAL || rivalSim.s >= GOAL)) {
        phase = 'finish'
        const win = sim.s >= rivalSim.s
        result = win ? '🏆 WIN!' : 'LOSE…'
        resultSub = `タイム ${fmt(raceT)}／スタイル ${Math.floor(style).toLocaleString()}pt`
        showBanner(result, 3)
        if (win) {
          const prev = (() => { try { const v = localStorage.getItem('webx-denshaD-best'); return v ? parseFloat(v) : null } catch { return null } })()
          if (prev === null || raceT < prev) {
            try { localStorage.setItem('webx-denshaD-best', String(raceT)) } catch { /* ignore */ }
            setBest(raceT)
          }
        }
      }

      audio.update(1100 + sim.v * 235, sim.lever > 0 ? 1 : 0.25, drifting ? 0.75 : 0)
      const headF = route.frameAt(sim.s)
      engine.followSun(headF.x, headF.z)

      // カメラ
      const cam = engine.camera as THREE.PerspectiveCamera
      if (camMode === 0) {
        const eye = route.posAt(sim.s - 42, PLAYER_LAT + 6, 12)
        eye.y = Math.max(eye.y, route.frameAt(sim.s - 42).y + 6.5)
        const look = route.posAt(sim.s + 20, PLAYER_LAT, 1.8)
        cam.position.lerp(eye, Math.min(1, dt * 5))
        if (dangerT > 0.2) {
          cam.position.x += (Math.random() - 0.5) * 0.22
          cam.position.y += (Math.random() - 0.5) * 0.22
        }
        cam.lookAt(look)
        cam.fov = 62 + Math.min(10, sim.v * 0.18)
      } else {
        const eye = route.posAt(sim.s - 2.4, PLAYER_LAT - 0.55, 3.1)
        const look = route.posAt(sim.s + 70, PLAYER_LAT - 0.4, 2.4)
        cam.position.lerp(eye, Math.min(1, dt * 14))
        cam.lookAt(look)
        cam.fov = 66
      }
      cam.updateProjectionMatrix()
    })

    return () => {
      window.clearInterval(hudTimer)
      window.removeEventListener('keydown', onKey)
      audio.dispose()
      engine.dispose()
      mount.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tbtn: React.CSSProperties = {
    pointerEvents: 'auto', flex: 1, padding: '13px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(12,16,24,0.7)', color: '#fff', fontWeight: 800, fontSize: 14.5, backdropFilter: 'blur(3px)',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#05070c', touchAction: 'none', userSelect: 'none' }}>
      <style>{`
        @keyframes ddBanner { 0% { transform: scale(1.7) skewX(-8deg); opacity: 0; } 18% { transform: scale(1) skewX(-8deg); opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes ddCount { 0% { transform: scale(2.1) skewX(-8deg); opacity: 0; } 25% { transform: scale(1) skewX(-8deg); opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0.4; } }
      `}</style>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {phaseUi === 'game' && (
        <>
          {/* 上部：進行バー（バトル） */}
          <div style={{ position: 'absolute', top: 10, left: 12, right: 12, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 900, fontStyle: 'italic', color: '#7ee787' }}>
              <span style={{ width: 34 }}>YOU</span>
              <div style={{ flex: 1, height: 9, background: 'rgba(255,255,255,0.15)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${hud.progP * 100}%`, height: '100%', background: '#3fe06c' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 900, fontStyle: 'italic', color: '#ff9d8a', marginTop: 3 }}>
              <span style={{ width: 34 }}>RIVAL</span>
              <div style={{ flex: 1, height: 9, background: 'rgba(255,255,255,0.15)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${hud.progR * 100}%`, height: '100%', background: '#ff5d4d' }} />
              </div>
              <span style={{ fontSize: 13, color: hud.gap >= 0 ? '#54d8ff' : '#ff5d4d', minWidth: 76, textAlign: 'right', textShadow: '1px 1px 0 #000' }}>
                {hud.gap >= 0 ? '+' : ''}{hud.gap.toFixed(0)}m
              </span>
            </div>
            <div style={{ textAlign: 'center', marginTop: 2, fontSize: 12, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '1px 1px 0 #000' }}>
              TIME {hud.time}　STYLE <span style={{ color: '#ffd21f' }}>{hud.style.toLocaleString()}pt</span>
              {hud.gutter && <span style={{ color: '#ffd21f' }}>　溝ゾーン！</span>}
            </div>
          </div>

          {hud.phase === 'count' && (
            <div key={hud.count} style={{ position: 'absolute', top: '32%', left: 0, right: 0, textAlign: 'center', fontSize: 96, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '4px 4px 0 #c00, 7px 7px 0 rgba(0,0,0,0.55)', animation: 'ddCount 0.9s ease-out', pointerEvents: 'none' }}>
              {hud.count > 0 ? hud.count : ''}
            </div>
          )}
          {hud.banner && hud.phase !== 'count' && (
            <div key={hud.banner} style={{ position: 'absolute', top: '24%', left: 0, right: 0, textAlign: 'center', fontSize: 44, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '3px 3px 0 #c00, 5px 5px 0 rgba(0,0,0,0.5)', animation: 'ddBanner 1.2s ease-out forwards', pointerEvents: 'none' }}>
              {hud.banner}
            </div>
          )}
          {hud.phase === 'finish' && (
            <div style={{ position: 'absolute', top: '36%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 34, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '2px 2px 0 #000' }}>{hud.resultSub}</div>
              <button onClick={() => setPhaseUi('title')} style={{ pointerEvents: 'auto', marginTop: 10, padding: '10px 26px', borderRadius: 10, border: 'none', background: 'linear-gradient(180deg, #ffd21f, #f5a623)', color: '#1a1200', fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>タイトルへ</button>
            </div>
          )}

          {/* 脱線ゲージ */}
          {hud.danger > 0 && (
            <div style={{ position: 'absolute', top: '46%', left: '50%', transform: 'translateX(-50%)', width: 220, pointerEvents: 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#ff5d4d', textAlign: 'center', textShadow: '1px 1px 0 #000' }}>脱線危険！</div>
              <div style={{ height: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${hud.danger * 100}%`, height: '100%', background: '#ff3524' }} />
              </div>
            </div>
          )}

          {/* 右下メーター */}
          <div style={{ position: 'absolute', right: 12, bottom: 12, textAlign: 'right', pointerEvents: 'none', transform: 'skewX(-6deg)' }}>
            <div>
              <span style={{ fontSize: 46, fontWeight: 900, fontStyle: 'italic', color: '#fff', textShadow: '3px 3px 0 #000', fontVariantNumeric: 'tabular-nums', lineHeight: 0.95 }}>{Math.round(hud.kmh)}</span>
              <span style={{ fontSize: 13, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '1px 1px 0 #000' }}> km/h</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, fontStyle: 'italic', color: hud.lever === 'EB' ? '#ff5d4d' : '#ffd21f', textShadow: '1px 1px 0 #000' }}>NOTCH {hud.lever}</div>
          </div>

          {/* タッチ操作 */}
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, display: 'flex', gap: 8, maxWidth: '62%' }}>
            <button style={tbtn} onClick={() => ctlRef.current.down()}>◀ ノッチ−</button>
            <button style={{ ...tbtn, borderColor: '#ff5d4d', color: '#ff8d7a' }} onClick={() => ctlRef.current.eb()}>非常</button>
            <button style={tbtn} onClick={() => ctlRef.current.up()}>ノッチ＋ ▶</button>
          </div>
        </>
      )}

      {phaseUi === 'title' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(3,5,10,0.3), rgba(3,5,10,0.82))', padding: 14, overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 500, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 36, fontWeight: 900, fontStyle: 'italic', transform: 'skewX(-6deg)', color: '#ffd21f', textShadow: '3px 3px 0 #c00, 6px 6px 0 rgba(0,0,0,0.5)' }}>電車でDバトル3D</div>
            <div style={{ fontSize: 12.5, color: '#d7e6f2', marginTop: 3 }}>夜の峠路線 約3.6km、ライバル列車との一騎打ち</div>
            <div style={{ textAlign: 'left', fontSize: 12.5, lineHeight: 1.8, background: 'rgba(8,10,14,0.6)', borderRadius: 10, padding: '10px 13px', marginTop: 12 }}>
              ・E／↑＝ノッチ＋、Q／↓＝ノッチ−、Space＝非常ブレーキ、C＝視点<br />
              ・カーブ制限より少し速く入ると<b style={{ color: '#ffd21f' }}>ドリフト</b>（車体が傾いて火花）でスタイルptが貯まり、減速も少ない<br />
              ・黄色ラインの<b style={{ color: '#ffd21f' }}>溝ゾーン</b>で流すと「溝落とし」で加速ボーナス<br />
              ・速すぎると脱線危険ゲージが溜まり、脱線すると +5秒＆大減速
            </div>
            {best !== null && <div style={{ marginTop: 8, fontSize: 13, color: '#ffd21f' }}>勝利ベストタイム {fmt(best)}</div>}
            <button
              onClick={() => setPhaseUi('game')}
              style={{ marginTop: 12, width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(180deg, #ffd21f, #f5a623)', color: '#1a1200', fontSize: 18, fontWeight: 900, fontStyle: 'italic', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}
            >
              ▶ バトル開始
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
