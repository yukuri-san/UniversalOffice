// 電車運転シミュレーター3D（電車でGO風・BVE基準）
// ノッチ運転・定時運行・停車位置採点・ATS・対向列車
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Engine } from '../../engine/engine'
import {
  buildRailRoute, buildTrackSet, buildStation, buildConsist, placeConsist,
  TrainSim, TrainAudio, LIVERIES, type RailRoute,
} from '../../engine/rail'

const CTRL: [number, number, number][] = [
  [0, 0, -60], [0, 0, 300], [30, 0, 650], [85, 1, 1000], [150, 2, 1400],
  [140, 3, 1800], [120, 4, 2150], [150, 4, 2500], [205, 9, 2850],
  [225, 13, 3200], [150, 10, 3520], [60, 6, 3780], [30, 4, 4050], [28, 4, 4350],
]
const ST_DEFS = [
  { name: '新都心', ax: 0, az: 30, sched: 0 },
  { name: '河原町', ax: 85, az: 1000, sched: 82 },
  { name: '高原', ax: 145, az: 1800, sched: 150 },
  { name: '峡谷', ax: 215, az: 2920, sched: 238 },
  { name: '湖畔', ax: 55, az: 3800, sched: 315 },
]
const PLAYER_LAT = -2.1
const TRAIN_LEN = 20.1 * 4

function findS(route: RailRoute, x: number, z: number): number {
  let best = 0, bd = 1e18
  route.frames.forEach((f, i) => {
    const d = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z)
    if (d < bd) { bd = d; best = i * route.spacing }
  })
  return best
}
function fmtClock(sec: number): string {
  const base = 9 * 3600 + 58 * 60 + Math.max(0, Math.floor(sec))
  const h = Math.floor(base / 3600), m = Math.floor((base % 3600) / 60), s = base % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface Hud {
  kmh: number; lever: string; leverVal: number; eb: boolean
  nextName: string; dist: number; stopErr: number | null
  timeDiff: number; clock: string; score: number
  phase: string; msg: string; msgSub: string; limit: number
  dwellLeft: number; cam: string; ats: boolean
  results: { name: string; err: number; dt: number; pts: number }[]
  rank: string
}

export default function TrainGo() {
  const mountRef = useRef<HTMLDivElement>(null)
  const leverRef = useRef<{ up: () => void; down: () => void; depart: () => void }>({ up: () => {}, down: () => {}, depart: () => {} })
  const [phaseUi, setPhaseUi] = useState<'title' | 'game'>('title')
  const [best, setBest] = useState<number | null>(() => { try { const v = localStorage.getItem('webx-traingo-best'); return v ? parseInt(v) : null } catch { return null } })
  const [hud, setHud] = useState<Hud>({
    kmh: 0, lever: 'N', leverVal: 0, eb: false, nextName: '', dist: 0, stopErr: null,
    timeDiff: 0, clock: '9:58:00', score: 0, phase: 'dwell', msg: '', msgSub: '', limit: 95,
    dwellLeft: 0, cam: '運転台', ats: false, results: [], rank: '',
  })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const engine = new Engine(mount)
    engine.setupDay()
    const route = buildRailRoute(CTRL, 95)
    const tunnelS: [number, number] = [findS(route, 190, 2620), findS(route, 238, 3180)]
    const bridgeS: [number, number] = [findS(route, 118, 2080), findS(route, 150, 2420)]
    engine.scene.add(buildTrackSet(route, [PLAYER_LAT, 2.1], { tunnel: tunnelS, bridge: bridgeS }))
    const stations = ST_DEFS.map((d) => ({ ...d, s: findS(route, d.ax, d.az) }))
    for (const st of stations) engine.scene.add(buildStation(route, st.s, st.name, -5.4))

    // 地面・景観
    {
      const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 40), new THREE.MeshStandardMaterial({ color: 0x74a35c, roughness: 1 }))
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.35
      ground.receiveShadow = true
      engine.scene.add(ground)
      // 川
      const mid = route.frameAt((bridgeS[0] + bridgeS[1]) / 2)
      const river = new THREE.Mesh(new THREE.PlaneGeometry(560, 130), new THREE.MeshStandardMaterial({ color: 0x3f7fbf, roughness: 0.25, metalness: 0.1 }))
      river.rotation.x = -Math.PI / 2
      river.position.set(mid.x, -5.4, mid.z)
      river.rotation.z = Math.atan2(mid.tx, mid.tz) + Math.PI / 2
      engine.scene.add(river)
      // 湖
      const lakeF = route.frameAt(stations[4].s + 130)
      const lake = new THREE.Mesh(new THREE.CircleGeometry(150, 28), new THREE.MeshStandardMaterial({ color: 0x4b8ec4, roughness: 0.2 }))
      lake.rotation.x = -Math.PI / 2
      lake.position.set(lakeF.x - 170, -0.2, lakeF.z + 30)
      engine.scene.add(lake)
      // トンネルの山
      const tm = route.frameAt((tunnelS[0] + tunnelS[1]) / 2)
      const hill = new THREE.Mesh(new THREE.ConeGeometry(300, 150, 7), new THREE.MeshStandardMaterial({ color: 0x5d7a4a, roughness: 1, flatShading: true }))
      hill.position.set(tm.x, 30, tm.z)
      engine.scene.add(hill)
      // 遠景の山
      const mMat = new THREE.MeshStandardMaterial({ color: 0x6d8a68, roughness: 1, flatShading: true })
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.4
        const m = new THREE.Mesh(new THREE.ConeGeometry(320 + (i % 3) * 90, 190 + (i % 4) * 55, 6), mMat)
        m.position.set(180 + Math.cos(a) * 1500, 0, 2100 + Math.sin(a) * 1500)
        engine.scene.add(m)
      }
      // 建物（市街地）
      const bGeo = new THREE.BoxGeometry(1, 1, 1)
      const bMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.85 })
      const buildings = new THREE.InstancedMesh(bGeo, bMat, 150)
      const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion()
      let bi = 0
      for (let s = 40; s < 1350 && bi < 150; s += 17) {
        const f = route.frameAt(s)
        for (const side of [-1, 1]) {
          if (bi >= 150 || Math.random() < 0.3) continue
          const lat = side * (15 + Math.random() * 26)
          const w = 8 + Math.random() * 10, d = 8 + Math.random() * 10, h = 7 + Math.random() * 22
          m4.compose(
            new THREE.Vector3(f.x + f.rx * lat, h / 2 - 0.3, f.z + f.rz * lat),
            q0, new THREE.Vector3(w, h, d),
          )
          buildings.setMatrixAt(bi++, m4)
        }
      }
      buildings.count = bi
      buildings.castShadow = true
      engine.scene.add(buildings)
      // 木
      const trunkI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.18, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 }), 380)
      const leafI = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.8, 7), new THREE.MeshStandardMaterial({ color: 0x2c5a2e, roughness: 1 }), 380)
      let ti = 0
      for (let s = 1250; s < route.length - 60 && ti < 380; s += 11) {
        const f = route.frameAt(s)
        if (s > tunnelS[0] - 60 && s < tunnelS[1] + 60) continue
        const side = Math.random() < 0.5 ? -1 : 1
        const lat = side * (9 + Math.random() * 55)
        const x = f.x + f.rx * lat, z = f.z + f.rz * lat
        const sc = 0.85 + Math.random() * 0.8
        m4.compose(new THREE.Vector3(x, 0.4, z), q0, new THREE.Vector3(sc, sc, sc)); trunkI.setMatrixAt(ti, m4)
        m4.compose(new THREE.Vector3(x, (1.5 + 1.8) * sc, z), q0, new THREE.Vector3(sc, sc, sc)); leafI.setMatrixAt(ti, m4)
        ti++
      }
      trunkI.count = leafI.count = ti
      engine.scene.add(trunkI, leafI)
    }

    const player = buildConsist(LIVERIES.blue, 4)
    engine.scene.add(player.group)
    const opp = buildConsist(LIVERIES.orange, 4)
    engine.scene.add(opp.group)
    const audio = new TrainAudio()

    const sim = new TrainSim()
    sim.s = stations[0].s + TRAIN_LEN // 先頭位置 = s + TRAIN_LEN ではなく、sim.s を先頭位置として扱う
    let headS = stations[0].s
    sim.s = headS
    let phase: 'dwell' | 'drive' | 'finished' = 'dwell'
    let nextIdx = 1
    let runT = -1 // 発車前は -1
    let dwellT = 0
    let score = 0
    let eb = false
    let ats = false
    let overCd = 0
    let msg = '発車ボタンを押してください'
    let msgSub = `${stations[0].name}駅`
    let msgUntil = 1e18
    let camMode = 0 // 0=運転台 1=追跡
    let oppS = route.length - 40
    let oppWait = 20
    const results: { name: string; err: number; dt: number; pts: number }[] = []
    const showMsg = (m: string, sub = '', dur = 2.4) => { msg = m; msgSub = sub; msgUntil = engine.elapsed + dur }

    const effLever = () => (eb || ats ? -9 : sim.lever)
    const leverUp = () => {
      audio.start()
      if (phase !== 'drive') return
      if (eb) { eb = false; sim.lever = 0; return }
      sim.lever = Math.min(5, sim.lever + 1)
    }
    const leverDown = () => {
      audio.start()
      if (phase !== 'drive') return
      if (eb) { eb = false; sim.lever = 0; return }
      sim.lever = Math.max(-8, sim.lever - 1)
    }
    const depart = () => {
      audio.start()
      if (phase !== 'dwell' || dwellT < 4) return
      audio.chime()
      phase = 'drive'
      if (runT < 0) runT = 0
      dwellT = 0
      showMsg('発車！', `次は ${stations[nextIdx].name}`, 1.6)
    }
    leverRef.current = {
      up: leverUp,
      down: leverDown,
      depart,
    }
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'e' || k === 'arrowup') { e.preventDefault(); leverUp() }
      else if (k === 'q' || k === 'arrowdown') { e.preventDefault(); leverDown() }
      else if (k === ' ') { e.preventDefault(); if (phase === 'dwell') depart(); else if (phase === 'drive') { eb = true; audio.beep() } }
      else if (k === 'c') { camMode = (camMode + 1) % 2; showMsg(camMode === 0 ? '視点：運転台' : '視点：追跡', '', 1.2) }
    }
    window.addEventListener('keydown', onKey)

    const hudTimer = window.setInterval(() => {
      const st = stations[Math.min(nextIdx, stations.length - 1)]
      const dist = phase === 'finished' ? 0 : st.s - headS
      const schedArr = st.sched
      const elapsed = runT < 0 ? 0 : runT
      const remain = dist / Math.max(4, sim.v)
      const eta = elapsed + remain
      setHud({
        kmh: sim.kmh,
        lever: eb ? 'EB' : ats ? 'ATS' : sim.leverLabel,
        leverVal: sim.lever, eb,
        nextName: st.name, dist: Math.max(0, dist),
        stopErr: phase === 'dwell' && results.length ? results[results.length - 1].err : null,
        timeDiff: phase === 'drive' || phase === 'dwell' ? eta - schedArr : 0,
        clock: fmtClock(elapsed),
        score, phase,
        msg: engine.elapsed < msgUntil ? msg : '',
        msgSub: engine.elapsed < msgUntil ? msgSub : '',
        limit: route.limitAt(headS),
        dwellLeft: phase === 'dwell' ? Math.max(0, 4 - dwellT) : 0,
        cam: camMode === 0 ? '運転台' : '追跡',
        ats,
        results: [...results],
        rank: score >= 900 ? 'S' : score >= 750 ? 'A' : score >= 550 ? 'B' : 'C',
      })
    }, 100)

    engine.start((dt) => {
      // 対向列車
      if (oppWait > 0) { oppWait -= dt; oppS = route.length - 40 }
      else {
        oppS -= dt * 19
        if (oppS < -120) { oppS = route.length - 40; oppWait = 26 }
      }
      placeConsist(opp, route, oppS, 2.1, -1)

      if (phase === 'dwell') {
        dwellT += dt
        sim.lever = 0
        sim.v = 0
      } else if (phase === 'drive') {
        runT += dt
        const limit = route.limitAt(headS)
        if (sim.kmh > limit + 18 && !ats) {
          ats = true; score = Math.max(0, score - 80)
          showMsg('ATS動作！', '制限速度を大きく超過 -80点', 2.2); audio.beep()
        }
        if (ats && sim.kmh <= limit) ats = false
        if (sim.kmh > limit + 6 && !ats) {
          overCd -= dt
          if (overCd <= 0) { score = Math.max(0, score - 30); overCd = 3; showMsg('速度超過', `${limit}km/h制限 -30点`, 1.4); audio.beep() }
        }
        const keep = sim.lever
        sim.lever = effLever()
        sim.update(dt, route.frameAt(headS).grade)
        sim.lever = keep
        headS = sim.s
        audio.joint(headS, sim.v)
        // 到着判定
        const st = stations[nextIdx]
        if (st) {
          const err = headS - st.s
          if (sim.v === 0 && Math.abs(err) <= 35) {
            const dtArr = runT - st.sched
            const stopPts = Math.max(0, Math.round(150 - Math.abs(err) * 6))
            const timePts = Math.max(0, Math.round(100 - Math.abs(dtArr) * 4))
            const pts = stopPts + timePts
            score += pts
            results.push({ name: st.name, err, dt: dtArr, pts })
            audio.chime()
            if (Math.abs(err) <= 0.8) showMsg('停車位置 ばっちり！', `${st.name} 到着 +${pts}点`, 2.6)
            else if (Math.abs(err) <= 5) showMsg('停車位置 良好', `${st.name} 到着 +${pts}点`, 2.6)
            else showMsg(`停車位置 ${err > 0 ? '+' : ''}${err.toFixed(1)}m`, `${st.name} 到着 +${pts}点`, 2.6)
            if (nextIdx >= stations.length - 1) {
              phase = 'finished'
              const prev = (() => { try { const v = localStorage.getItem('webx-traingo-best'); return v ? parseInt(v) : null } catch { return null } })()
              if (prev === null || score > prev) {
                try { localStorage.setItem('webx-traingo-best', String(score)) } catch { /* ignore */ }
                setBest(score)
              }
            } else {
              phase = 'dwell'
              dwellT = 0
              nextIdx++
            }
          } else if (err > 45) {
            score = Math.max(0, score - 200)
            results.push({ name: st.name, err, dt: 0, pts: -200 })
            showMsg('駅を通過してしまった！', `${st.name} -200点`, 2.6)
            if (nextIdx >= stations.length - 1) phase = 'finished'
            else nextIdx++
          }
        }
        if (headS > route.length - 30) phase = 'finished'
      }
      placeConsist(player, route, headS, PLAYER_LAT)
      audio.update(sim.v, phase === 'drive' ? effLever() : 0)
      engine.followSun(headS > 0 ? route.frameAt(headS).x : 0, route.frameAt(Math.max(0, headS)).z)

      // カメラ
      const cam = engine.camera as THREE.PerspectiveCamera
      if (camMode === 0) {
        const eye = route.posAt(headS - 2.4, PLAYER_LAT - 0.55, 3.1)
        const look = route.posAt(headS + 70, PLAYER_LAT - 0.4, 2.4)
        cam.position.lerp(eye, Math.min(1, dt * 14))
        cam.lookAt(look)
        cam.fov = 66
      } else {
        const eye = route.posAt(headS - 40, PLAYER_LAT + 7, 11)
        eye.y = Math.max(eye.y, route.frameAt(headS - 40).y + 6)
        const look = route.posAt(headS + 16, PLAYER_LAT, 1.6)
        cam.position.lerp(eye, Math.min(1, dt * 5))
        cam.lookAt(look)
        cam.fov = 60
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

  const panel: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(16,20,28,0.88), rgba(10,13,18,0.92))',
    border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, color: '#eef3f7',
    backdropFilter: 'blur(4px)',
  }
  const tbtn: React.CSSProperties = {
    pointerEvents: 'auto', flex: 1, padding: '13px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,26,36,0.85)', color: '#fff', fontWeight: 800, fontSize: 14.5,
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0e14', touchAction: 'none', userSelect: 'none' }}>
      <style>{`@keyframes tgMsg { 0% { transform: scale(1.5); opacity: 0; } 20% { transform: scale(1); opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0.9; } }`}</style>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />

      {phaseUi === 'game' && (
        <>
          {/* 評価メッセージ */}
          {hud.msg && (
            <div key={hud.msg + hud.msgSub} style={{ position: 'absolute', top: '16%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', animation: 'tgMsg 0.5s ease-out' }}>
              <div style={{ fontSize: 30, fontWeight: 900, fontStyle: 'italic', color: '#ffd21f', textShadow: '2px 2px 0 #7a2c00, 4px 4px 0 rgba(0,0,0,0.45)' }}>{hud.msg}</div>
              {hud.msgSub && <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', textShadow: '1px 1px 0 #000' }}>{hud.msgSub}</div>}
            </div>
          )}

          {/* 右上：運行情報 */}
          <div style={{ position: 'absolute', top: 10, right: 10, ...panel, padding: '8px 12px', minWidth: 168, pointerEvents: 'none' }}>
            <div style={{ fontSize: 11, color: '#9fc3e8' }}>次駅</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{hud.phase === 'finished' ? '終点到着' : hud.nextName}</div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>残り <b style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(hud.dist)}m</b>／制限 {hud.limit}km/h</div>
            <div style={{ fontSize: 12.5 }}>時刻 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{hud.clock}</b>（{hud.timeDiff <= 0 ? <span style={{ color: '#54d8ff' }}>{Math.abs(hud.timeDiff).toFixed(0)}秒 早着見込み</span> : <span style={{ color: '#ff8d7a' }}>{hud.timeDiff.toFixed(0)}秒 遅れ見込み</span>}）</div>
            <div style={{ fontSize: 12.5 }}>スコア <b style={{ color: '#ffd21f' }}>{hud.score}</b>{hud.phase === 'finished' && <>／ランク <b style={{ color: '#ffd21f', fontSize: 16 }}>{hud.rank}</b></>}</div>
            {hud.results.length > 0 && (
              <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 4 }}>
                {hud.results.map((r, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: '#cfe0ee' }}>{r.name}：{r.pts >= 0 ? `誤差 ${r.err > 0 ? '+' : ''}${r.err.toFixed(1)}m／${r.dt > 0 ? '+' : ''}${r.dt.toFixed(0)}秒／+${r.pts}` : '通過 -200'}</div>
                ))}
              </div>
            )}
          </div>

          {/* 下部：運転台パネル */}
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <div style={{ ...panel, padding: '8px 14px', textAlign: 'center', minWidth: 128 }}>
              <div style={{ fontSize: 10.5, color: '#9fc3e8', letterSpacing: 2 }}>SPEED</div>
              <div style={{ fontSize: 38, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: hud.kmh > hud.limit + 6 ? '#ff5d4d' : '#fff' }}>{hud.kmh.toFixed(0)}</div>
              <div style={{ fontSize: 11, color: '#9fc3e8' }}>km/h</div>
              <div style={{ display: 'flex', gap: 2, marginTop: 5 }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} style={{ flex: 1, height: 8, background: hud.kmh / 100 >= i / 12 ? (i > 9 ? '#ff3524' : i > 7 ? '#ffb300' : '#3fe06c') : 'rgba(255,255,255,0.14)' }} />
                ))}
              </div>
            </div>
            <div style={{ ...panel, padding: '8px 12px', textAlign: 'center', minWidth: 86 }}>
              <div style={{ fontSize: 10.5, color: '#9fc3e8', letterSpacing: 2 }}>NOTCH</div>
              <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.15, color: hud.eb || hud.ats ? '#ff5d4d' : hud.leverVal > 0 ? '#3fe06c' : hud.leverVal < 0 ? '#ffb300' : '#fff' }}>{hud.lever}</div>
              <div style={{ display: 'flex', gap: 2.5, justifyContent: 'center' }}>
                {[5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8].map((n) => (
                  <div key={n} style={{ width: 5, height: n === 0 ? 14 : 10, background: hud.leverVal === n && !hud.eb ? (n > 0 ? '#3fe06c' : n < 0 ? '#ffb300' : '#fff') : 'rgba(255,255,255,0.18)' }} />
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: '#9fc3e8', marginTop: 3 }}>視点：{hud.cam}（C）</div>
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 8 }}>
              {hud.phase === 'dwell' ? (
                <button style={{ ...tbtn, background: 'linear-gradient(180deg, #ffd21f, #f5a623)', color: '#1a1200', fontSize: 17 }} onClick={() => leverRef.current.depart()}>
                  ▶ 発車（あと{hud.dwellLeft.toFixed(0)}秒で発車可）
                </button>
              ) : hud.phase === 'finished' ? (
                <button style={tbtn} onClick={() => setPhaseUi('title')}>結果を確認（タイトルへ）</button>
              ) : (
                <>
                  <button style={tbtn} onClick={() => leverRef.current.down()}>◀ ノッチ−（Q）</button>
                  <button style={{ ...tbtn, borderColor: '#ff5d4d', color: '#ff8d7a' }} onClick={() => { const ev = new KeyboardEvent('keydown', { key: ' ' }); window.dispatchEvent(ev) }}>非常（Space）</button>
                  <button style={tbtn} onClick={() => leverRef.current.up()}>ノッチ＋（E）▶</button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {phaseUi === 'title' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, rgba(6,16,28,0.3), rgba(6,16,28,0.8))', padding: 14, overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: 500, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 33, fontWeight: 900, fontStyle: 'italic', color: '#7ec3ff', textShadow: '3px 3px 0 #123c6e, 6px 6px 0 rgba(0,0,0,0.45)' }}>電車運転シミュレーター3D</div>
            <div style={{ fontSize: 12.5, color: '#d7e6f2', marginTop: 3 }}>電車でGO風・BVE基準／新都心→湖畔 全5駅・約3.9km</div>
            <div style={{ textAlign: 'left', fontSize: 12.5, lineHeight: 1.8, background: 'rgba(8,12,20,0.6)', borderRadius: 10, padding: '10px 13px', marginTop: 12 }}>
              ・E／↑＝ノッチ＋（力行・ブレーキ緩め）、Q／↓＝ノッチ−、Space＝非常ブレーキ（停車中は発車）<br />
              ・制限速度を守り、駅では停止位置（誤差0m）と定時到着を狙う。超過はATSが作動する<br />
              ・停車位置 ±0.8m 以内は「ばっちり」。駅を通り過ぎると -200点<br />
              ・C＝視点切替（運転台／追跡）
            </div>
            {best !== null && <div style={{ marginTop: 8, fontSize: 13, color: '#ffd21f' }}>ベストスコア {best} 点</div>}
            <button
              onClick={() => setPhaseUi('game')}
              style={{ marginTop: 12, width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(180deg, #7ec3ff, #2f7fd0)', color: '#fff', fontSize: 18, fontWeight: 900, fontStyle: 'italic', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }}
            >
              ▶ 乗務開始
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
