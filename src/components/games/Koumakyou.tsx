// 紅魔郷弾幕STG（ファンメイド）
// 東方紅魔郷にインスパイアされたオリジナルの縦スクロール弾幕シューティング。
// 原作の素材（画像・音楽・データ）は一切使わず、描画はすべて Canvas の図形、
// BGM は WebAudio で合成する完全オリジナル曲（ZUN風アレンジの文法で作曲）。
// 進行は全6面＋EXステージ（原作／New Classic の構成を踏襲したファンメイド再現）。
import { useEffect, useRef, useState } from 'react'

// ===== 定数 =====
const FW = 384 // プレイフィールド幅
const FH = 448 // プレイフィールド高さ
const SW = 512 // 画面全体幅（フィールド＋サイド表示）
const SH = 448
const MAXB = 1500 // 敵弾の上限
const BULLET_COLORS = ['#ff5b6a', '#ff9f43', '#ffe066', '#7bed6a', '#4fc3f7', '#b388ff', '#ff7ad9', '#f5f5f5']
const EX_KEY = 'webx-koumakyou-ex'
const HISCORE_KEY = 'webx-koumakyou-hiscore'

// ===== 型 =====
type Bullet = {
  on: boolean; x: number; y: number; vx: number; vy: number
  r: number; c: number; kind: number; grazed: boolean; curve: number
  stopT: number; fzT: number; fzDur: number; aimSpd: number; svx: number; svy: number
}
type PBullet = { x: number; y: number; vx: number; vy: number; dmg: number; homing: number; kind: number }
type Enemy = {
  x: number; y: number; hp: number; maxHp: number; t: number
  kind: 'down' | 'side' | 'big'; dir: number; shootT: number; seed: number
}
type Item = { x: number; y: number; vy: number; kind: 'power' | 'point' }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number }
type Clone = { x: number; y: number; real: boolean; shootT: number; spiralA: number }

type CharaId = 'reimu' | 'marisa'
type DiffId = 'easy' | 'normal' | 'hard'
const DIFF_CFG: Record<DiffId, { spd: number; den: number; label: string }> = {
  easy: { spd: 0.85, den: 0.62, label: 'Easy' },
  normal: { spd: 1, den: 1, label: 'Normal' },
  hard: { spd: 1.14, den: 1.4, label: 'Hard' },
}

type AttackDef = { name: string | null; hp: number; time: number }
type BossId = 'rumia' | 'cirno' | 'meiling' | 'patchouli' | 'sakuya' | 'remilia' | 'flandre'
type BossDef = { name: string; epithet: string; attacks: AttackDef[] }
const BOSS_DEFS: Record<BossId, BossDef> = {
  rumia: {
    name: 'ルーミア', epithet: '宵闇の妖怪',
    attacks: [
      { name: null, hp: 520, time: 40 },
      { name: '月符「ムーンライトレイ」', hp: 880, time: 45 },
      { name: '夜符「ミッドナイトバード」', hp: 1020, time: 50 },
      { name: '闇符「ディマーケイション」', hp: 1240, time: 55 },
    ],
  },
  cirno: {
    name: 'チルノ', epithet: '湖上の氷精',
    attacks: [
      { name: null, hp: 560, time: 40 },
      { name: '氷符「アイシクルフォール」', hp: 980, time: 50 },
      { name: '凍符「パーフェクトフリーズ」', hp: 1250, time: 55 },
    ],
  },
  meiling: {
    name: '紅美鈴', epithet: '華人小娘',
    attacks: [
      { name: null, hp: 600, time: 40 },
      { name: '華符「セラギネラ9」', hp: 1050, time: 50 },
      { name: '彩符「彩雨」', hp: 1280, time: 55 },
    ],
  },
  patchouli: {
    name: 'パチュリー・ノーレッジ', epithet: '知識と日陰の少女',
    attacks: [
      { name: null, hp: 640, time: 45 },
      { name: '火符「アグニシャイン」', hp: 1000, time: 50 },
      { name: '水符「プリンセスウンディネ」', hp: 1120, time: 55 },
      { name: '金符「メタルファティーグ」', hp: 1350, time: 55 },
    ],
  },
  sakuya: {
    name: '十六夜咲夜', epithet: '紅魔館のメイド',
    attacks: [
      { name: null, hp: 680, time: 45 },
      { name: '幻符「キリングドール」', hp: 1150, time: 55 },
      { name: '時符「ルナクロック」', hp: 1450, time: 60 },
    ],
  },
  remilia: {
    name: 'レミリア・スカーレット', epithet: '永遠に紅い幼き月',
    attacks: [
      { name: null, hp: 760, time: 45 },
      { name: '紅符「スカーレットシュート」', hp: 1250, time: 55 },
      { name: '夜符「スカーレットミスト」', hp: 1400, time: 60 },
      { name: '神術「吸血鬼幻想」', hp: 1750, time: 65 },
    ],
  },
  flandre: {
    name: 'フランドール・スカーレット', epithet: '悪魔の妹',
    attacks: [
      { name: null, hp: 820, time: 45 },
      { name: '禁忌「フォーオブアカインド」', hp: 1500, time: 60 },
      { name: '禁忌「レーヴァテイン」', hp: 1700, time: 60 },
      { name: '禁忌「カゴメカゴメ」', hp: 2050, time: 70 },
    ],
  },
}

type MidId = 'rumia' | 'daiyousei' | 'meiling' | 'koakuma' | 'sakuya' | 'patchouli'
type StageDef = { title: string; road: number; mid: MidId; midName: string; boss: BossId; hue: number }
const STAGES: StageDef[] = [
  { title: '紅霧に包まれる湖', road: 32, mid: 'rumia', midName: 'ルーミア', boss: 'rumia', hue: 0 },
  { title: '静かなる湖の氷精', road: 32, mid: 'daiyousei', midName: '大妖精', boss: 'cirno', hue: 1 },
  { title: '紅魔館の門前にて', road: 34, mid: 'meiling', midName: '紅美鈴', boss: 'meiling', hue: 2 },
  { title: '声の届かない大図書館', road: 34, mid: 'koakuma', midName: '小悪魔', boss: 'patchouli', hue: 3 },
  { title: '従順なるメイドの館', road: 36, mid: 'sakuya', midName: '十六夜咲夜', boss: 'sakuya', hue: 4 },
  { title: '紅く染まる館の最奥', road: 36, mid: 'sakuya', midName: '十六夜咲夜', boss: 'remilia', hue: 5 },
  { title: '妹様のいる地下室', road: 34, mid: 'patchouli', midName: 'パチュリー', boss: 'flandre', hue: 6 },
]
// ステージごとの背景グラデーション [上, 中, 下]
const BG_PALS: [string, string, string][] = [
  ['#0b0620', '#180b36', '#2a0f2e'],
  ['#06121f', '#0d2438', '#12303f'],
  ['#170a14', '#2b1030', '#3a1428'],
  ['#100722', '#1d0f3d', '#2a1245'],
  ['#0a0d24', '#141a3d', '#232048'],
  ['#1c0512', '#330a26', '#47102c'],
  ['#14041c', '#26073a', '#380b45'],
]

type MidBoss = {
  id: MidId; name: string; x: number; y: number; hp: number; maxHp: number
  t: number; timer: number; acc1: number; acc2: number; angle: number
  entering: boolean; flee: boolean
}
type Boss = {
  id: BossId; x: number; y: number; t: number
  atkIdx: number; hp: number; maxHp: number; timer: number
  acc1: number; acc2: number; acc3: number; angle: number
  spellMiss: boolean; spellBomb: boolean
  clones: Clone[]; beamA: number; entering: boolean; warpT: number
}
type Phase = 'card' | 'road' | 'midboss' | 'bosswait' | 'boss'
type Game = {
  time: number
  phase: Phase; phaseT: number; cardT: number
  stageList: number[]; stagePos: number; stageIdx: number
  chara: CharaId; diff: DiffId; challenge: boolean
  spdMul: number; denMul: number
  px: number; py: number; pSpeedLow: boolean
  lives: number; bombs: number; power: number
  score: number; graze: number
  shotT: number; invT: number; bombT: number; respawnT: number; dead: boolean
  shake: number
  spawnT: number; bigSpawned: number; roadPart: number; bossWait: number
  mid: MidBoss | null; boss: Boss | null
  msg: string; msgT: number
}

const newBullet = (): Bullet => ({
  on: false, x: 0, y: 0, vx: 0, vy: 0, r: 4, c: 0, kind: 0, grazed: false, curve: 0,
  stopT: 0, fzT: 0, fzDur: 0, aimSpd: 0, svx: 0, svy: 0,
})

// ===== BGM（WebAudioステップシーケンサ／完全オリジナル曲） =====
// ZUN風の文法：高速マイナーキー、鋸波＋ビブラートのトランペット風リード、
// 三角波の高速アルペジオ、駆けるベース、ノイズのドラム。原作の旋律は使わない。
type TrackId = 'title' | 'stage' | 'boss' | 'exstage' | 'exboss' | 'jingle'
type Track = {
  bpm: number
  lead: { notes: (number | null)[]; lens: number[] }
  roots: number[]
  bassPat: (number | null)[]
  chords: number[][]
  kick: string; snare: string; hat: string
  arpDiv: number; cut: number; once?: boolean
}
function noteNum(tok: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(tok)
  if (!m) return -1
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const n = base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return n + (parseInt(m[3], 10) + 1) * 12
}
function parseLead(s: string): { notes: (number | null)[]; lens: number[] } {
  const toks = s.trim().split(/\s+/)
  const notes: (number | null)[] = new Array(toks.length).fill(null)
  const lens: number[] = new Array(toks.length).fill(1)
  let last = -1
  toks.forEach((t, i) => {
    if (t === '.') { if (last >= 0) lens[last]++ } else if (t === 'x') { last = -1 } else {
      const v = noteNum(t)
      if (v >= 0) { notes[i] = v; last = i } else last = -1
    }
  })
  return { notes, lens }
}
function parseOff(s: string): (number | null)[] {
  return s.trim().split(/\s+/).map(t => (t === '.' ? null : parseInt(t, 10)))
}
const BASS_PAT_CALM = parseOff('0 . . . . . . . 0 . . . . . . .')
const BASS_PAT_DRIVE = parseOff('0 . 0 . 12 . 0 . 0 . 12 . 0 . 0 .')
const BASS_PAT_GALLOP = parseOff('0 0 . 0 . 0 0 . 0 . 0 0 . 0 . 12')
const ARP_SEQ = [0, 1, 2, 3, 2, 1]
const TRACKS: Record<TrackId, Track> = {
  title: {
    bpm: 138, cut: 1500, arpDiv: 2,
    lead: parseLead('A4 . . . C5 . . . E5 . . . A5 . . . G5 . . . E5 . . . F5 . E5 . D5 . . . E5 . . . G5 . . . A5 . . . C6 . . . B5 . A5 . G5 . E5 . D5 . . . E5 . . .'),
    roots: [45, 41, 48, 43],
    bassPat: BASS_PAT_CALM,
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [52, 55, 60, 64], [55, 59, 62, 67]],
    kick: 'x.......x.......', snare: '................', hat: 'x.x.x.x.x.x.x.x.',
  },
  stage: {
    bpm: 172, cut: 2600, arpDiv: 1,
    lead: parseLead('D5 . F5 . A5 . D6 . C6 . A5 . F5 . D5 . E5 . F5 . G5 . A5 . G5 . F5 . E5 . F5 . D5 . F5 . Bb5 . A5 . G5 . F5 . D5 . F5 . E5 . F5 . E5 . C#5 . D5 . . . A4 . . .'),
    roots: [38, 38, 34, 33],
    bassPat: BASS_PAT_DRIVE,
    chords: [[62, 65, 69, 74], [62, 65, 69, 74], [58, 62, 65, 70], [57, 61, 64, 69]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.',
  },
  boss: {
    bpm: 184, cut: 2800, arpDiv: 1,
    lead: parseLead('D5 . . F5 . . A5 . D6 . C6 A5 F5 . D5 . E5 . . G5 . . Bb5 . A5 . G5 F5 E5 . F5 . G5 . . F5 . . D5 . F5 . G5 . A5 . . . A5 . G5 . F5 . E5 . C#5 . E5 . A5 . . .'),
    roots: [38, 34, 43, 33],
    bassPat: BASS_PAT_GALLOP,
    chords: [[62, 65, 69, 74], [58, 62, 65, 70], [55, 58, 62, 67], [57, 61, 64, 69]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exstage: {
    bpm: 182, cut: 2600, arpDiv: 1,
    lead: parseLead('E5 . G5 . B5 . E6 . D6 . B5 . G5 . E5 . E5 . G5 . A5 . G5 . E5 . D5 . E5 . G5 . B5 . A5 . G5 . A5 . B5 . D6 . B5 . G5 . A5 . B5 . A5 . F#5 . G5 . . . B4 . . .'),
    roots: [40, 36, 43, 38],
    bassPat: BASS_PAT_DRIVE,
    chords: [[64, 67, 71, 76], [60, 64, 67, 72], [59, 62, 67, 71], [62, 66, 69, 74]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exboss: {
    bpm: 194, cut: 3000, arpDiv: 1,
    lead: parseLead('E5 . . G5 . . B5 . E6 . D6 B5 G5 . E5 . D#5 . . F#5 . . B5 . A5 . G5 . F#5 . D#5 . E6 . . D6 . . C6 . B5 . A5 . G5 . A5 . B5 . A5 . G5 . F#5 . D#5 . F#5 . B5 . . .'),
    roots: [40, 40, 36, 35],
    bassPat: BASS_PAT_GALLOP,
    chords: [[64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [59, 63, 66, 71]],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo',
  },
  jingle: {
    bpm: 150, cut: 2400, arpDiv: 2, once: true,
    lead: parseLead('D5 . F5 . A5 . D6 . F6 . E6 . D6 . A5 . D6 . . . A5 . F5 . D5 . . . D5 . . .'),
    roots: [38, 38],
    bassPat: BASS_PAT_CALM,
    chords: [[62, 65, 69, 74], [62, 65, 69, 74]],
    kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  },
}

type Bgm = {
  play: (id: TrackId) => void
  stop: () => void
  toggleMute: () => boolean
}
function createBgm(): Bgm {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuf: AudioBuffer | null = null
  let timer: number | null = null
  let cur: TrackId | null = null
  let step = 0
  let nextTime = 0
  let muted = false
  const VOL = 0.15
  const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : VOL
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18; comp.ratio.value = 6
      master.connect(comp); comp.connect(ctx.destination)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') void ctx.resume()
  }
  function leadNote(m: number, t: number, dur: number, cut: number) {
    if (!ctx || !master) return
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq(m)
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.2, t + 0.015)
    g.gain.setValueAtTime(0.2, t + Math.max(0.015, dur - 0.06))
    g.gain.linearRampToValueAtTime(0, t + dur)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6
    const lg = ctx.createGain()
    lg.gain.setValueAtTime(0, t)
    lg.gain.linearRampToValueAtTime(26, t + 0.16)
    lfo.connect(lg); lg.connect(o.detune)
    o.connect(f); f.connect(g); g.connect(master)
    o.start(t); o.stop(t + dur + 0.05)
    lfo.start(t); lfo.stop(t + dur + 0.05)
  }
  function bassNote(m: number, t: number, dur: number) {
    if (!ctx || !master) return
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq(m)
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 720
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.17, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.05, t + dur)
    o.connect(f); f.connect(g); g.connect(master)
    o.start(t); o.stop(t + dur + 0.03)
  }
  function arpNote(m: number, t: number, dur: number) {
    if (!ctx || !master) return
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq(m)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.05, t)
    g.gain.exponentialRampToValueAtTime(0.004, t + dur)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + dur + 0.02)
  }
  function kick(t: number) {
    if (!ctx || !master) return
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(128, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.85, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + 0.15)
  }
  function noiseHit(t: number, vol: number, dur: number, type: BiquadFilterType, fq: number) {
    if (!ctx || !master || !noiseBuf) return
    const src = ctx.createBufferSource(); src.buffer = noiseBuf
    src.playbackRate.value = 0.9 + Math.random() * 0.2
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = fq
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f); f.connect(g); g.connect(master)
    src.start(t); src.stop(t + dur + 0.02)
  }
  function scheduleStep(tr: Track, s: number, t: number) {
    const spb = 60 / tr.bpm / 4
    const s16 = s % 16
    const bar = Math.floor(s / 16)
    const li = s % tr.lead.notes.length
    const ln = tr.lead.notes[li]
    if (ln !== null) leadNote(ln, t, spb * tr.lead.lens[li] * 0.95, tr.cut)
    const bo = tr.bassPat[s16]
    if (bo !== null && bo !== undefined) bassNote(tr.roots[bar % tr.roots.length] + bo, t, spb * 1.7)
    if (s % tr.arpDiv === 0) {
      const ch = tr.chords[bar % tr.chords.length]
      arpNote(ch[ARP_SEQ[s % 6]], t, spb * 0.95)
    }
    if (tr.kick[s16] === 'x') kick(t)
    if (tr.snare[s16] === 'x') noiseHit(t, 0.36, 0.09, 'bandpass', 1800)
    const h = tr.hat[s16]
    if (h === 'x') noiseHit(t, 0.15, 0.04, 'highpass', 7600)
    else if (h === 'o') noiseHit(t, 0.07, 0.04, 'highpass', 7600)
  }
  function sched() {
    if (!ctx || !cur) return
    const tr = TRACKS[cur]
    const spb = 60 / tr.bpm / 4
    // タブが裏に回ってタイマーが間引かれた場合は過去分を捨てて再同期する
    if (nextTime < ctx.currentTime - 0.05) nextTime = ctx.currentTime + 0.03
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(tr, step, nextTime)
      step++
      nextTime += spb
      if (tr.once && step >= tr.lead.notes.length) {
        const was = cur
        stop()
        if (was === 'jingle') play('title')
        break
      }
    }
  }
  function play(id: TrackId) {
    ensure()
    if (!ctx) return
    if (cur === id && timer !== null) return
    cur = id
    step = 0
    nextTime = ctx.currentTime + 0.06
    if (timer === null) timer = window.setInterval(sched, 25)
  }
  function stop() {
    cur = null
    if (timer !== null) { window.clearInterval(timer); timer = null }
  }
  function toggleMute() {
    muted = !muted
    ensure()
    if (ctx && master) master.gain.linearRampToValueAtTime(muted ? 0 : VOL, ctx.currentTime + 0.05)
    return muted
  }
  return { play, stop, toggleMute }
}

export default function Koumakyou() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [screen, setScreen] = useState<'title' | 'playing' | 'over' | 'clear'>('title')
  const [finalScore, setFinalScore] = useState(0)
  const [endTitle, setEndTitle] = useState('')
  const [endSub, setEndSub] = useState('')
  const [chara, setChara] = useState<CharaId>('reimu')
  const [diff, setDiff] = useState<DiffId>('normal')
  const [challenge, setChallenge] = useState(false)
  const [exUnlocked, setExUnlocked] = useState<boolean>(() => {
    try { return localStorage.getItem(EX_KEY) === '1' } catch { return false }
  })
  const [mutedUi, setMutedUi] = useState(false)
  const selRef = useRef({ chara, diff, challenge })
  selRef.current = { chara, diff, challenge }
  const bgmRef = useRef<Bgm | null>(null)
  const getBgm = (): Bgm => {
    if (!bgmRef.current) bgmRef.current = createBgm()
    return bgmRef.current
  }
  const startRef = useRef<(run: 'story' | 'extra') => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctxRaw = canvas.getContext('2d')
    if (!ctxRaw) return
    const ctx: CanvasRenderingContext2D = ctxRaw
    const bgmPlay = (id: TrackId) => { bgmRef.current?.play(id) }

    // ===== 内部状態 =====
    const bullets: Bullet[] = Array.from({ length: MAXB }, newBullet)
    let pbs: PBullet[] = []
    let enemies: Enemy[] = []
    let items: Item[] = []
    let parts: Particle[] = []
    let hiscore = 0
    try { hiscore = Number(localStorage.getItem(HISCORE_KEY) || 0) || 0 } catch { hiscore = 0 }

    let G: Game = freshGame('reimu', 'normal', false, [0, 1, 2, 3, 4, 5])
    let running = false

    function freshGame(ch: CharaId, df: DiffId, chMode: boolean, stageList: number[]): Game {
      const cfg = DIFF_CFG[df]
      return {
        time: 0, phase: 'card', phaseT: 0, cardT: 2.4,
        stageList, stagePos: 0, stageIdx: stageList[0],
        chara: ch, diff: df, challenge: chMode,
        spdMul: cfg.spd, denMul: cfg.den,
        px: FW / 2, py: FH - 60, pSpeedLow: false,
        lives: 2, bombs: 3, power: 0,
        score: 0, graze: 0,
        shotT: 0, invT: 0, bombT: 0, respawnT: 0, dead: false,
        shake: 0, spawnT: 0, bigSpawned: 0, roadPart: 0, bossWait: 0,
        mid: null, boss: null, msg: '', msgT: 0,
      }
    }
    function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v }
    const rn = (n: number) => Math.max(3, Math.round(n * G.denMul))
    const iv = (base: number) => base / G.denMul

    // ===== 弾プール =====
    let poolCur = 0
    function fire(x: number, y: number, vx: number, vy: number, r: number, c: number, kind = 0, curve = 0): Bullet | undefined {
      for (let i = 0; i < MAXB; i++) {
        poolCur = (poolCur + 1) % MAXB
        const b = bullets[poolCur]
        if (!b.on) {
          b.on = true; b.x = x; b.y = y
          b.vx = vx * G.spdMul; b.vy = vy * G.spdMul
          b.r = r; b.c = c; b.kind = kind; b.grazed = false; b.curve = curve
          b.stopT = 0; b.fzT = 0; b.fzDur = 0; b.aimSpd = 0; b.svx = 0; b.svy = 0
          return b
        }
      }
      return undefined
    }
    function fireA(x: number, y: number, ang: number, spd: number, r: number, c: number, kind = 0, curve = 0): Bullet | undefined {
      return fire(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, r, c, kind, curve)
    }
    // 途中で止まってから再び動く弾（凍符／ルナクロック用）
    function fireFrz(x: number, y: number, ang: number, spd: number, r: number, c: number, fzT: number, fzDur: number, aimSpd = 0) {
      const b = fireA(x, y, ang, spd, r, c)
      if (b) { b.fzT = fzT; b.fzDur = fzDur; b.aimSpd = aimSpd * G.spdMul }
    }
    function aimed(x: number, y: number, spd: number, r: number, c: number, spread = 0, n = 1, kind = 0) {
      const base = Math.atan2(G.py - y, G.px - x)
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i - (n - 1) / 2) * spread)
        fireA(x, y, a, spd, r, c, kind)
      }
    }
    function ring(x: number, y: number, n: number, spd: number, r: number, c: number, off = 0, kind = 0) {
      for (let i = 0; i < n; i++) fireA(x, y, off + (i / n) * Math.PI * 2, spd, r, c, kind)
    }
    function clearBullets(scoreEach = 0) {
      for (const b of bullets) {
        if (b.on && scoreEach > 0) G.score += scoreEach
        b.on = false
      }
    }

    // ===== パーティクル／アイテム =====
    function burst(x: number, y: number, n: number, c: string, spd = 120) {
      for (let i = 0; i < n; i++) {
        if (parts.length > 240) break
        const a = Math.random() * Math.PI * 2
        const s = (0.3 + Math.random() * 0.7) * spd
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.4, c, r: 1.5 + Math.random() * 2.5 })
      }
    }
    function dropItem(x: number, y: number, kind: 'power' | 'point') {
      items.push({ x, y, vy: 40, kind })
    }

    // ===== 入力 =====
    const keys = new Set<string>()
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      keys.add(k)
      if (k === 'm') setMutedUi(getBgmFromEffect().toggleMute())
      if (running && k === 'x') tryBomb()
    }
    const getBgmFromEffect = (): Bgm => {
      if (!bgmRef.current) bgmRef.current = createBgm()
      return bgmRef.current
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // タッチ／ポインタ：相対ドラッグ移動＋自動ショット
    let pointerDown = false
    let dragOffX = 0, dragOffY = 0
    const toLogical = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * SW,
        y: ((e.clientY - rect.top) / rect.height) * SH,
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!running) return
      const p = toLogical(e)
      if (p.x > FW) return
      pointerDown = true
      dragOffX = G.px - p.x; dragOffY = G.py - p.y
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown || !running || G.dead) return
      const p = toLogical(e)
      G.px = clamp(p.x + dragOffX, 8, FW - 8)
      G.py = clamp(p.y + dragOffY, 16, FH - 10)
    }
    const onPointerUp = () => { pointerDown = false }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // ===== ボム =====
    function tryBomb() {
      if (G.dead || G.bombs <= 0 || G.bombT > 0) return
      G.bombs--
      G.bombT = 0.8
      if (G.boss) G.boss.spellBomb = true
      clearBullets(100)
      for (const en of enemies) damageEnemy(en, 220)
      enemies = enemies.filter(e => e.hp > 0)
      if (G.mid) damageMid(240)
      if (G.boss) damageBoss(260)
      burst(G.px, G.py, 40, '#ffe066', 220)
      G.shake = Math.max(G.shake, 6)
    }

    // ===== ダメージ =====
    function damageEnemy(en: Enemy, dmg: number) {
      en.hp -= dmg
      if (en.hp <= 0) {
        G.score += en.kind === 'big' ? 10000 : 1000
        burst(en.x, en.y, en.kind === 'big' ? 26 : 10, en.kind === 'big' ? '#ffb74d' : '#a5d6a7', 130)
        if (en.kind === 'big') {
          dropItem(en.x - 14, en.y, 'power'); dropItem(en.x + 14, en.y, 'power'); dropItem(en.x, en.y - 10, 'point')
        } else if (Math.random() < 0.3) {
          dropItem(en.x, en.y, Math.random() < 0.6 ? 'power' : 'point')
        }
      }
    }
    function damageMid(dmg: number) {
      const m = G.mid
      if (!m || m.entering || m.flee) return
      m.hp -= dmg
      G.score += 10
      if (m.hp <= 0) defeatMid(true)
    }
    function damageBoss(dmg: number) {
      const b = G.boss
      if (!b || b.entering) return
      b.hp -= dmg
      G.score += 10
      if (b.hp <= 0) endAttack(true)
    }

    // ===== 被弾 =====
    function playerHit() {
      if (G.invT > 0 || G.bombT > 0 || G.dead) return
      burst(G.px, G.py, 30, '#ff5252', 180)
      G.shake = Math.max(G.shake, 7)
      G.power = Math.max(0, G.power - 1)
      if (G.boss) G.boss.spellMiss = true
      clearBullets(0)
      if (!G.challenge) {
        G.lives--
        if (G.lives < 0) { finish(false); return }
      }
      G.dead = true
      G.respawnT = 1.0
    }

    function finish(clear: boolean) {
      running = false
      if (G.score > hiscore) {
        hiscore = G.score
        try { localStorage.setItem(HISCORE_KEY, String(hiscore)) } catch { /* ignore */ }
      }
      if (clear) {
        const lastStage = G.stageList[G.stageList.length - 1]
        if (lastStage === 5 && G.diff !== 'easy' && !G.challenge) {
          try { localStorage.setItem(EX_KEY, '1') } catch { /* ignore */ }
          setExUnlocked(true)
        }
        if (lastStage === 6) { setEndTitle('EXTRA CLEAR!'); setEndSub('悪魔の妹を退治した！') } else if (G.diff === 'easy') {
          setEndTitle('EASY CLEAR!'); setEndSub('STAGE 5までクリア。Normal以上で全6面とEXに挑戦しよう')
        } else { setEndTitle('ALL CLEAR!'); setEndSub('紅魔館に平和が戻った！') }
        bgmPlay('jingle')
      } else {
        setEndTitle('GAME OVER')
        setEndSub(G.stageIdx === 6 ? 'EXTRA STAGE で力尽きた…' : `STAGE ${G.stageIdx + 1} で力尽きた…`)
        bgmPlay('title')
      }
      setFinalScore(G.score)
      setScreen(clear ? 'clear' : 'over')
    }

    // ===== ステージ進行 =====
    function startStage(pos: number) {
      G.stagePos = pos
      G.stageIdx = G.stageList[pos]
      G.phase = 'card'
      G.cardT = 2.4
      G.phaseT = 0
      G.roadPart = 0
      G.bigSpawned = 0
      G.spawnT = 0.5
      enemies = []
      clearBullets(0)
      bgmPlay(G.stageIdx === 6 ? 'exstage' : 'stage')
    }
    function startMidboss() {
      const sd = STAGES[G.stageIdx]
      const hp = 650 + G.stageIdx * 90
      G.mid = {
        id: sd.mid, name: sd.midName, x: FW / 2, y: -30, hp, maxHp: hp,
        t: 0, timer: 22, acc1: 1, acc2: 1.5, angle: 0, entering: true, flee: false,
      }
      G.phase = 'midboss'
      G.phaseT = 0
      G.msg = `中ボス ${sd.midName}`
      G.msgT = 1.8
    }
    function defeatMid(killed: boolean) {
      const m = G.mid
      if (!m) return
      if (killed) {
        G.score += 20000
        burst(m.x, m.y, 36, '#ffcc80', 170)
        dropItem(m.x - 14, m.y, 'power')
        dropItem(m.x + 14, m.y, 'point')
        clearBullets(30)
      }
      G.mid = null
      G.phase = 'road'
      G.roadPart = 1
      G.phaseT = 0
      G.bigSpawned = 0
      G.spawnT = 0.6
    }
    function startBoss() {
      const sd = STAGES[G.stageIdx]
      const def = BOSS_DEFS[sd.boss]
      G.boss = {
        id: sd.boss, x: FW / 2, y: -30, t: 0,
        atkIdx: 0, hp: def.attacks[0].hp, maxHp: def.attacks[0].hp, timer: def.attacks[0].time,
        acc1: 0, acc2: 0, acc3: 0, angle: 0,
        spellMiss: false, spellBomb: false, clones: [], beamA: Math.PI / 2, entering: true, warpT: 3.5,
      }
      G.phase = 'boss'
      G.phaseT = 0
      G.msg = `${def.epithet} ${def.name}`
      G.msgT = 2.5
      setupAttack()
      bgmPlay(G.stageIdx === 6 ? 'exboss' : 'boss')
    }
    function setupAttack() {
      const b = G.boss
      if (!b) return
      const d = BOSS_DEFS[b.id].attacks[b.atkIdx]
      b.hp = d.hp; b.maxHp = d.hp; b.timer = d.time
      b.acc1 = 0; b.acc2 = 0; b.acc3 = 0; b.spellMiss = false; b.spellBomb = false
      b.clones = []
      b.warpT = 3.5
      if (b.id === 'flandre' && b.atkIdx === 1) {
        const realIdx = Math.floor(Math.random() * 4)
        const xs = [70, 150, 234, 314]
        b.clones = xs.map((x, i) => ({ x, y: 84 + (i % 2) * 26, real: i === realIdx, shootT: 0.5 + i * 0.3, spiralA: i * 1.7 }))
      }
    }
    function endAttack(captured: boolean) {
      const b = G.boss
      if (!b) return
      const def = BOSS_DEFS[b.id]
      const atk = def.attacks[b.atkIdx]
      clearBullets(50)
      burst(b.x, b.y, 50, '#ff8a80', 200)
      G.shake = Math.max(G.shake, 8)
      if (atk.name) {
        if (captured && !b.spellMiss && !b.spellBomb) {
          const bonus = 1000000 + Math.floor(b.timer) * 20000
          G.score += bonus
          G.msg = `スペルカードボーナス ${bonus.toLocaleString()}`
        } else if (captured) {
          G.msg = 'スペルカード撃破！'
        } else {
          G.msg = 'スペルカード時間切れ…'
        }
        G.msgT = 2.2
        dropItem(b.x - 16, b.y + 10, 'power')
        dropItem(b.x + 16, b.y + 10, 'point')
      }
      if (b.atkIdx + 1 < def.attacks.length) {
        b.atkIdx++
        setupAttack()
      } else {
        G.boss = null
        G.score += 100000
        if (G.stagePos + 1 < G.stageList.length) startStage(G.stagePos + 1)
        else finish(true)
      }
    }

    // ===== 道中 =====
    function spawnFairy(kind: Enemy['kind'], x: number, y: number, dir: number) {
      enemies.push({
        x, y, kind, dir, t: 0, shootT: 1 + Math.random() * 1.4,
        hp: kind === 'big' ? 260 : 14, maxHp: kind === 'big' ? 260 : 14,
        seed: Math.random() * Math.PI * 2,
      })
    }
    function updateRoad(dt: number) {
      const partDur = STAGES[G.stageIdx].road / 2
      const t = G.phaseT
      G.spawnT -= dt
      if (G.spawnT <= 0) {
        if (t < partDur * 0.35) {
          G.spawnT = 0.7
          spawnFairy('down', 30 + Math.random() * (FW - 60), -16, 1)
        } else if (t < partDur * 0.7) {
          G.spawnT = 2.6
          const fromLeft = Math.random() < 0.5
          for (let i = 0; i < 5; i++) {
            spawnFairy('side', fromLeft ? -16 - i * 26 : FW + 16 + i * 26, 60 + Math.random() * 60, fromLeft ? 1 : -1)
          }
        } else {
          G.spawnT = 1.0
          spawnFairy('down', 30 + Math.random() * (FW - 60), -16, 1)
          spawnFairy('down', 30 + Math.random() * (FW - 60), -40, 1)
        }
      }
      if (t > partDur * 0.55 && G.bigSpawned === 0) {
        G.bigSpawned++
        spawnFairy('big', FW / 2, -30, 1)
      }
      if (G.roadPart === 0 && t >= partDur) startMidboss()
      else if (G.roadPart === 1 && t >= partDur) {
        G.phase = 'bosswait'
        G.phaseT = 0
        G.bossWait = 1.3
        clearBullets(0)
      }
    }
    function updateEnemies(dt: number) {
      for (const en of enemies) {
        en.t += dt
        if (en.kind === 'down') {
          en.y += 92 * dt
          en.x += Math.sin(en.t * 2.2 + en.seed) * 34 * dt
        } else if (en.kind === 'side') {
          en.x += en.dir * 105 * dt
          en.y += Math.sin(en.t * 2.6 + en.seed) * 46 * dt + 12 * dt
        } else {
          if (en.y < 82) en.y += 55 * dt
          en.x = FW / 2 + Math.sin(en.t * 0.6 + en.seed) * 90
        }
        en.shootT -= dt
        if (en.shootT <= 0 && en.y > 10 && en.y < FH - 120) {
          if (en.kind === 'big') {
            en.shootT = iv(1.7)
            ring(en.x, en.y + 8, rn(12), 78, 4.5, 4)
            aimed(en.x, en.y + 8, 130, 4, 1)
          } else {
            en.shootT = iv(1.6 + Math.random() * 0.9)
            aimed(en.x, en.y + 6, 118, 4, 0, 0.22, G.denMul > 1.2 ? 3 : 1)
          }
        }
      }
      enemies = enemies.filter(e => e.hp > 0 && e.y < FH + 40 && e.x > -60 && e.x < FW + 60)
    }

    // ===== 中ボス更新 =====
    function updateMidboss(dt: number) {
      const m = G.mid
      if (!m) return
      m.t += dt
      if (m.entering) {
        m.y += 65 * dt
        if (m.y >= 80) { m.y = 80; m.entering = false }
        return
      }
      if (!m.flee) {
        m.timer -= dt
        if (m.timer <= 0) { m.flee = true; G.msg = '逃げられた…'; G.msgT = 1.4 }
      }
      if (m.flee) {
        m.y -= 130 * dt
        m.x += Math.sin(m.t * 2) * 30 * dt
        if (m.y < -36) defeatMid(false)
        return
      }
      const den = G.denMul
      void den
      m.x = FW / 2 + Math.sin(m.t * 0.7) * 95
      switch (m.id) {
        case 'rumia':
          m.acc1 -= dt
          if (m.acc1 <= 0) { m.acc1 = iv(1.2); aimed(m.x, m.y + 6, 118, 4, 0, 0.2, 3) }
          break
        case 'daiyousei':
          m.acc1 -= dt
          if (m.acc1 <= 0) { m.acc1 = iv(1.6); ring(m.x, m.y, rn(10), 72, 4, 3) }
          m.acc2 -= dt
          if (m.acc2 <= 0) { m.acc2 = iv(1.1); aimed(m.x, m.y + 6, 115, 4, 4) }
          break
        case 'meiling':
          m.acc1 -= dt
          if (m.acc1 <= 0) { m.acc1 = iv(0.95); aimed(m.x, m.y + 6, 112, 4, Math.floor(m.t) % 8, 0.16, 5) }
          break
        case 'koakuma':
          m.acc1 -= dt
          if (m.acc1 <= 0) { m.acc1 = iv(0.8); aimed(m.x, m.y + 6, 126, 4, 6, 0.12, 2) }
          m.acc2 -= dt
          if (m.acc2 <= 0) {
            m.acc2 = iv(2.4)
            for (let k = 0; k < 4; k++) fireA(m.x, m.y, m.angle + (k * Math.PI) / 2, 84, 4, 6)
            m.angle += 0.4
          }
          break
        case 'sakuya':
          m.acc1 -= dt
          if (m.acc1 <= 0) { m.acc1 = iv(0.9); aimed(m.x, m.y + 6, 162, 4, 7, 0.14, 3, 2) }
          break
        case 'patchouli':
          m.angle += dt * 1.6
          m.acc1 -= dt
          if (m.acc1 <= 0) { m.acc1 = iv(0.16); fireA(m.x, m.y, m.angle, 88, 4, Math.floor(m.t * 2) % 5) }
          m.acc2 -= dt
          if (m.acc2 <= 0) { m.acc2 = iv(1.7); aimed(m.x, m.y + 6, 122, 4, 1, 0.18, 3) }
          break
      }
    }

    // ===== ボス更新 =====
    function updateBoss(dt: number) {
      const b = G.boss
      if (!b) return
      b.t += dt
      b.timer -= dt
      if (b.timer <= 0) { endAttack(false); return }
      if (b.entering) {
        b.y += 70 * dt
        if (b.y >= 88) { b.y = 88; b.entering = false }
        return
      }
      // --- 移動 ---
      const flanSelfMove = b.id === 'flandre' && b.atkIdx >= 2
      if (!flanSelfMove && !(b.id === 'flandre' && b.atkIdx === 1)) {
        switch (b.id) {
          case 'rumia': b.x = FW / 2 + Math.sin(b.t * 0.55) * 105; break
          case 'cirno': b.x = FW / 2 + Math.sin(b.t * 0.9) * 120 + Math.sin(b.t * 2.3) * 22; break
          case 'meiling': b.x = FW / 2 + Math.sin(b.t * 0.45) * 90; break
          case 'patchouli': b.x = FW / 2 + Math.sin(b.t * 0.3) * 30; break
          case 'sakuya': {
            // acc3 をテレポート用のXオフセットとして使う（咲夜のパターンは acc3 未使用）
            b.x = clamp(FW / 2 + Math.sin(b.t * 0.5) * 85 + b.acc3, 36, FW - 36)
            if (b.atkIdx <= 1) {
              b.warpT -= dt
              if (b.warpT <= 0) {
                b.warpT = 3.6 + Math.random() * 1.2
                burst(b.x, b.y, 14, '#cfd8dc', 90)
                const tx = 60 + Math.random() * (FW - 120)
                b.acc3 = tx - (FW / 2 + Math.sin(b.t * 0.5) * 85)
                b.y = 64 + Math.random() * 40
                burst(tx, b.y, 14, '#cfd8dc', 90)
              }
            }
            break
          }
          case 'remilia':
            b.x = FW / 2 + Math.sin(b.t * 0.6) * 130
            b.y = 88 + Math.sin(b.t * 0.8) * 14
            break
          case 'flandre': b.x = FW / 2 + Math.sin(b.t * 0.5) * 100; break
        }
      }
      // --- 攻撃パターン ---
      const bx = b.x, by = b.y
      if (b.id === 'rumia') {
        if (b.atkIdx === 0) {
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(1.1); aimed(bx, by + 6, 122, 4, 0, 0.18, 3) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.8); ring(bx, by, rn(10), 70, 4, 7, Math.random()) }
        } else if (b.atkIdx === 1) {
          // 月符「ムーンライトレイ」風：回転する2方向の光線弾幕
          b.angle += dt * 0.85
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.085)
            fireA(bx, by, b.angle, 88, 4.5, 5)
            fireA(bx, by, b.angle + Math.PI, 88, 4.5, 5)
            fireA(bx, by, -b.angle + 1.2, 88, 4.5, 2)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(1.7); aimed(bx, by + 6, 125, 4, 0) }
        } else if (b.atkIdx === 2) {
          // 夜符「ミッドナイトバード」風：曲がる鳥弾＋リング
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.5)
            for (let i = -1; i <= 1; i++) fireA(bx, by + 4, Math.PI / 2 + i * 0.55, 105, 5, 3, 1, i * 0.9)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.3); ring(bx, by, rn(14), 68, 4, 6, Math.random()) }
        } else {
          // 闇符「ディマーケイション」風：3方向スパイラル＋狙撃
          b.angle += dt * 1.5
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.075)
            for (let k = 0; k < 3; k++) fireA(bx, by, b.angle + (k * Math.PI * 2) / 3, 96, 4.5, 7)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(1.25); aimed(bx, by + 6, 140, 4, 0, 0.2, 3) }
        }
      } else if (b.id === 'cirno') {
        if (b.atkIdx === 0) {
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(0.9); aimed(bx, by + 6, 150, 4, 4, 0.16, 3, 3) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.2); ring(bx, by, rn(12), 75, 4, 4, Math.random()) }
        } else if (b.atkIdx === 1) {
          // 氷符「アイシクルフォール」風：上から降る氷柱
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.14)
            const x = 14 + Math.random() * (FW - 28)
            fire(x, -12, (Math.random() - 0.5) * 26, 152 + Math.random() * 62, 4.5, 4, 3)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(1.8); aimed(bx, by + 6, 122, 4, 4, 0.16, 3) }
        } else {
          // 凍符「パーフェクトフリーズ」風：広がって止まるリング
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(1.5)
            const n = rn(18)
            const off = Math.random() * Math.PI * 2
            for (let i = 0; i < n; i++) fireFrz(bx, by, off + (i / n) * Math.PI * 2, 106, 4.5, 4, 0.55, 0.75)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.6); aimed(bx, by + 6, 126, 4, 4, 0.18, 3) }
        }
      } else if (b.id === 'meiling') {
        if (b.atkIdx === 0) {
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(1.0); aimed(bx, by + 6, 115, 4, Math.floor(b.t) % 8, 0.16, 5) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(3.0); ring(bx, by, rn(12), 72, 4, 3, Math.random()) }
        } else if (b.atkIdx === 1) {
          // 華符「セラギネラ9」風：9方向の回転カラフル弾幕
          b.angle += dt * 1.15
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.11)
            for (let k = 0; k < 9; k++) fireA(bx, by, b.angle + (k * Math.PI * 2) / 9, 84, 4.5, k % 8)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.2); aimed(bx, by + 6, 122, 4, 1, 0.18, 3) }
        } else {
          // 彩符「彩雨」風：色とりどりの雨
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.09)
            const x = 10 + Math.random() * (FW - 20)
            fire(x, -10, (Math.random() - 0.5) * 36, 132 + Math.random() * 68, 4.5, Math.floor(Math.random() * 8))
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(1.5); aimed(bx, by + 6, 120, 4, 2, 0.16, 5) }
        }
      } else if (b.id === 'patchouli') {
        if (b.atkIdx === 0) {
          b.angle += dt * 1.9
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.16)
            const c = Math.floor(b.t * 2) % 5
            fireA(bx, by, b.angle, 88, 4.5, c)
            fireA(bx, by, b.angle + Math.PI, 88, 4.5, c)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(1.6); aimed(bx, by + 6, 124, 4, 1, 0.18, 3) }
        } else if (b.atkIdx === 1) {
          // 火符「アグニシャイン」風：炎の二重スパイラル
          b.angle += dt * 1.35
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.09)
            fireA(bx, by, b.angle, 92, 4.5, 0)
            fireA(bx, by, -b.angle + 0.8, 92, 4.5, 1)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.0); ring(bx, by, rn(12), 72, 4, 0, Math.random()) }
        } else if (b.atkIdx === 2) {
          // 水符「プリンセスウンディネ」風：ゆらめく泡弾の流れ
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.13)
            const a = Math.PI / 2 + Math.sin(b.t * 1.3) * 0.55
            fireA(bx - 12, by + 4, a, 62, 7, 4)
            fireA(bx + 12, by + 4, a + 0.24, 62, 7, 4)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.8); ring(bx, by, rn(14), 66, 5, 4, Math.random()) }
        } else {
          // 金符「メタルファティーグ」風：金属片の扇弾バースト
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(1.15); aimed(bx, by + 6, 150, 4, 7, 0.5, 7, 2) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(0.38); aimed(bx, by + 6, 168, 4, 7, 0, 1, 2) }
          b.angle += dt * 0.9
          b.acc3 -= dt
          if (b.acc3 <= 0) {
            b.acc3 = iv(0.3)
            for (let k = 0; k < 4; k++) fireA(bx, by, b.angle + (k * Math.PI) / 2, 80, 4, 7, 2)
          }
        }
      } else if (b.id === 'sakuya') {
        if (b.atkIdx === 0) {
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(0.85); aimed(bx, by + 6, 165, 4, 7, 0.14, 5, 2) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.4); ring(bx, by, rn(10), 95, 4, 5, Math.random(), 2) }
        } else if (b.atkIdx === 1) {
          // 幻符「キリングドール」風：ナイフのリングと狙撃
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(1.5); ring(bx, by, rn(16), 100, 4, 7, Math.random(), 2) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(0.7); aimed(bx, by + 6, 176, 4, 7, 0.12, 3, 2) }
        } else {
          // 時符「ルナクロック」風：止まってから一斉に自機へ向かう弾
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.3)
            const n = rn(12)
            const off = Math.random() * Math.PI * 2
            for (let i = 0; i < n; i++) fireFrz(bx, by, off + (i / n) * Math.PI * 2, 122, 4.5, 5, 0.6, 1.05, 140)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.2); aimed(bx, by + 6, 168, 4, 7, 0.1, 3, 2) }
        }
      } else if (b.id === 'remilia') {
        if (b.atkIdx === 0) {
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(1.0); aimed(bx, by + 6, 130, 4, 0, 0.16, 3) }
          b.acc2 -= dt
          if (b.acc2 <= 0) {
            b.acc2 = iv(2.5)
            ring(bx, by, rn(12), 70, 4.5, 0, Math.random())
            ring(bx, by, rn(12), 92, 4.5, 7, Math.random())
          }
        } else if (b.atkIdx === 1) {
          // 紅符「スカーレットシュート」風：高速狙撃ストリーム
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.32)
            b.acc3 += 1
            if (b.acc3 % 5 === 0) aimed(bx, by + 6, 182, 4.5, 0, 0.15, 3)
            else aimed(bx, by + 6, 188, 4.5, 0, 0.05, 1)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.4); ring(bx, by, rn(14), 78, 4, 0, Math.random()) }
        } else if (b.atkIdx === 2) {
          // 夜符「スカーレットミスト」風：漂う紅い霧
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.07)
            fire(bx + (Math.random() - 0.5) * 180, by + (Math.random() - 0.5) * 20,
              (Math.random() - 0.5) * 36, 46 + Math.random() * 34, 5, Math.random() < 0.7 ? 0 : 7)
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(1.9); aimed(bx, by + 6, 128, 4, 0, 0.16, 5) }
        } else {
          // 神術「吸血鬼幻想」風：蝙蝠弾とスパイラル
          b.acc1 -= dt
          if (b.acc1 <= 0) {
            b.acc1 = iv(0.42)
            for (let i = -1; i <= 1; i++) fireA(bx, by + 4, Math.PI / 2 + i * 0.5, 108, 5, 0, 1, i * 0.75)
          }
          b.angle += dt * 1.2
          b.acc2 -= dt
          if (b.acc2 <= 0) {
            b.acc2 = iv(0.12)
            fireA(bx, by, b.angle, 88, 4.5, 6)
            fireA(bx, by, b.angle + Math.PI, 88, 4.5, 6)
          }
          b.acc3 -= dt
          if (b.acc3 <= 0) { b.acc3 = iv(3.0); ring(bx, by, rn(16), 68, 4, 0, Math.random()) }
        }
      } else {
        // フランドール
        if (b.atkIdx === 0) {
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(0.5); aimed(bx, by + 6, 126, 4.5, 0, 0.18, 3) }
          b.angle += dt * 1.3
          b.acc2 -= dt
          if (b.acc2 <= 0) {
            b.acc2 = iv(0.12)
            fireA(bx, by, b.angle, 86, 4.5, 6)
            fireA(bx, by, b.angle + Math.PI, 86, 4.5, 0)
          }
        } else if (b.atkIdx === 1) {
          // 禁忌「フォーオブアカインド」風：4体分身
          for (const cl of b.clones) {
            cl.shootT -= dt
            if (cl.real) {
              cl.spiralA += dt * 1.9
              if (cl.shootT <= 0) {
                cl.shootT = iv(0.11)
                fireA(cl.x, cl.y + 6, cl.spiralA, 82, 4.5, 0)
                fireA(cl.x, cl.y + 6, cl.spiralA + Math.PI, 82, 4.5, 0)
              }
            } else if (cl.shootT <= 0) {
              cl.shootT = iv(1.15)
              const a = Math.atan2(G.py - cl.y, G.px - cl.x)
              fireA(cl.x, cl.y + 6, a, 108, 4, 4)
            }
          }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(2.6); ring(FW / 2, 70, rn(16), 62, 4, 5, Math.random()) }
        } else if (b.atkIdx === 2) {
          // 禁忌「レーヴァテイン」風：巨大な炎の剣
          b.x = FW / 2 + Math.sin(b.t * 0.4) * 80
          b.beamA = Math.PI / 2 + Math.sin(b.t * 0.45) * 1.05
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(1.9); ring(b.x, b.y + 6, rn(12), 74, 4.5, 0, Math.random()) }
          b.acc2 -= dt
          if (b.acc2 <= 0) { b.acc2 = iv(0.9); aimed(b.x, b.y + 6, 120, 4, 1) }
          const cyc = b.t % 4
          if (cyc > 0.7 && !G.dead && G.invT <= 0 && G.bombT <= 0) {
            const len = 520, hw = 15
            const ex = b.x + Math.cos(b.beamA) * len
            const ey = b.y + Math.sin(b.beamA) * len
            if (distSeg(G.px, G.py, b.x, b.y, ex, ey) < hw + 2.5) playerHit()
          }
        } else {
          // 禁忌「カゴメカゴメ」風：最終幕
          b.x = FW / 2 + Math.sin(b.t * 0.7) * 120
          b.angle += dt * 1.1
          b.acc1 -= dt
          if (b.acc1 <= 0) { b.acc1 = iv(0.46); aimed(b.x, b.y + 6, 132, 4.5, 6, 0.18, 5) }
          b.acc2 -= dt
          if (b.acc2 <= 0) {
            b.acc2 = iv(0.13)
            fireA(b.x, b.y, b.angle, 84, 4, 0)
            fireA(b.x, b.y, -b.angle + 2.1, 84, 4, 3)
          }
          b.acc3 -= dt
          if (b.acc3 <= 0) { b.acc3 = iv(3.1); ring(b.x, b.y, rn(18), 66, 4, 5, Math.random()) }
        }
      }
    }
    function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
      const dx = x2 - x1, dy = y2 - y1
      const l2 = dx * dx + dy * dy
      let t = l2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / l2
      t = Math.max(0, Math.min(1, t))
      const cx = x1 + t * dx, cy = y1 + t * dy
      return Math.hypot(px - cx, py - cy)
    }

    // ===== 自機更新 =====
    function updatePlayer(dt: number) {
      if (G.dead) {
        G.respawnT -= dt
        if (G.respawnT <= 0) {
          G.dead = false
          G.px = FW / 2; G.py = FH - 60
          G.invT = 3; G.bombs = Math.max(G.bombs, 3)
        }
        return
      }
      const low = keys.has('shift') || G.pSpeedLow
      const isMarisa = G.chara === 'marisa'
      const spd = low ? (isMarisa ? 134 : 118) : (isMarisa ? 276 : 252)
      let mx = 0, my = 0
      if (keys.has('arrowleft') || keys.has('a')) mx -= 1
      if (keys.has('arrowright') || keys.has('d')) mx += 1
      if (keys.has('arrowup') || keys.has('w')) my -= 1
      if (keys.has('arrowdown') || keys.has('s')) my += 1
      if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071 }
      if (!pointerDown) {
        G.px = clamp(G.px + mx * spd * dt, 8, FW - 8)
        G.py = clamp(G.py + my * spd * dt, 16, FH - 10)
      }
      G.pSpeedLow = low
      // ショット
      G.shotT -= dt
      const shooting = keys.has('z') || pointerDown
      if (shooting && G.shotT <= 0) {
        G.shotT = 0.075
        const p = G.power
        const x = G.px, y = G.py
        if (!isMarisa) {
          // 霊夢：広角＋弱い誘導弾
          pbs.push({ x: x - 4, y: y - 10, vx: 0, vy: -560, dmg: 4, homing: 0, kind: 0 })
          pbs.push({ x: x + 4, y: y - 10, vx: 0, vy: -560, dmg: 4, homing: 0, kind: 0 })
          if (p >= 1) {
            pbs.push({ x: x - 11, y: y - 4, vx: -26, vy: -540, dmg: 2, homing: 0, kind: 0 })
            pbs.push({ x: x + 11, y: y - 4, vx: 26, vy: -540, dmg: 2, homing: 0, kind: 0 })
          }
          if (p >= 2) {
            pbs.push({ x: x - 8, y: y - 2, vx: -44, vy: -390, dmg: 2, homing: 3.4, kind: 2 })
            pbs.push({ x: x + 8, y: y - 2, vx: 44, vy: -390, dmg: 2, homing: 3.4, kind: 2 })
          }
          if (p >= 3) {
            pbs.push({ x: x - 16, y: y - 2, vx: -60, vy: -520, dmg: 2, homing: 0, kind: 0 })
            pbs.push({ x: x + 16, y: y - 2, vx: 60, vy: -520, dmg: 2, homing: 0, kind: 0 })
          }
          if (p >= 4) pbs.push({ x, y: y - 16, vx: 0, vy: -620, dmg: 4, homing: 0, kind: 0 })
        } else {
          // 魔理沙：前方集中の高火力レーザー
          pbs.push({ x: x - 5, y: y - 12, vx: 0, vy: -640, dmg: 5, homing: 0, kind: 1 })
          pbs.push({ x: x + 5, y: y - 12, vx: 0, vy: -640, dmg: 5, homing: 0, kind: 1 })
          if (p >= 1) {
            pbs.push({ x: x - 10, y: y - 6, vx: 0, vy: -600, dmg: 3, homing: 0, kind: 0 })
            pbs.push({ x: x + 10, y: y - 6, vx: 0, vy: -600, dmg: 3, homing: 0, kind: 0 })
          }
          if (p >= 2) {
            pbs.push({ x: x - 2, y: y - 14, vx: 0, vy: -660, dmg: 3, homing: 0, kind: 1 })
            pbs.push({ x: x + 2, y: y - 14, vx: 0, vy: -660, dmg: 3, homing: 0, kind: 1 })
          }
          if (p >= 3) pbs.push({ x, y: y - 18, vx: 0, vy: -680, dmg: 5, homing: 0, kind: 1 })
          if (p >= 4) {
            pbs.push({ x: x - 14, y: y - 8, vx: 0, vy: -620, dmg: 4, homing: 0, kind: 1 })
            pbs.push({ x: x + 14, y: y - 8, vx: 0, vy: -620, dmg: 4, homing: 0, kind: 1 })
          }
        }
      }
      if (G.invT > 0) G.invT -= dt
      if (G.bombT > 0) G.bombT -= dt
    }

    // ===== 弾・アイテム等の更新と衝突 =====
    function updateWorld(dt: number) {
      // 誘導弾のターゲット探索
      const findTarget = (x: number, y: number): { x: number; y: number } | null => {
        let best: { x: number; y: number } | null = null
        let bd = Infinity
        const consider = (tx: number, ty: number) => {
          const d = (tx - x) * (tx - x) + (ty - y) * (ty - y)
          if (d < bd) { bd = d; best = { x: tx, y: ty } }
        }
        for (const en of enemies) if (en.hp > 0) consider(en.x, en.y)
        if (G.mid && !G.mid.flee) consider(G.mid.x, G.mid.y)
        if (G.boss && !G.boss.entering) {
          if (G.boss.id === 'flandre' && G.boss.atkIdx === 1 && G.boss.clones.length > 0) {
            for (const cl of G.boss.clones) consider(cl.x, cl.y)
          } else consider(G.boss.x, G.boss.y)
        }
        return best
      }
      // 自機弾
      for (const pb of pbs) {
        if (pb.homing > 0) {
          const tg = findTarget(pb.x, pb.y)
          if (tg) {
            const sp = Math.hypot(pb.vx, pb.vy) || 400
            const cur = Math.atan2(pb.vy, pb.vx)
            const want = Math.atan2(tg.y - pb.y, tg.x - pb.x)
            let diff = want - cur
            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2
            const turn = Math.max(-pb.homing * dt, Math.min(pb.homing * dt, diff))
            const na = cur + turn
            pb.vx = Math.cos(na) * sp; pb.vy = Math.sin(na) * sp
          }
        }
        pb.x += pb.vx * dt; pb.y += pb.vy * dt
        let consumed = false
        for (const en of enemies) {
          const rr = en.kind === 'big' ? 26 : 14
          if (Math.abs(pb.x - en.x) < rr && Math.abs(pb.y - en.y) < rr + 6) {
            damageEnemy(en, pb.dmg); consumed = true; break
          }
        }
        if (!consumed && G.mid && !G.mid.entering && !G.mid.flee) {
          if (Math.abs(pb.x - G.mid.x) < 20 && Math.abs(pb.y - G.mid.y) < 24) {
            damageMid(pb.dmg); consumed = true
          }
        }
        if (!consumed && G.boss && !G.boss.entering) {
          const b = G.boss
          if (b.id === 'flandre' && b.atkIdx === 1 && b.clones.length > 0) {
            for (const cl of b.clones) {
              if (Math.abs(pb.x - cl.x) < 20 && Math.abs(pb.y - cl.y) < 24) { damageBoss(pb.dmg); consumed = true; break }
            }
          } else if (Math.abs(pb.x - b.x) < 22 && Math.abs(pb.y - b.y) < 26) {
            damageBoss(pb.dmg); consumed = true
          }
        }
        if (consumed) pb.y = -9999
      }
      pbs = pbs.filter(pb => pb.y > -30 && pb.y < FH + 10 && pb.x > -20 && pb.x < FW + 20)
      enemies = enemies.filter(e => e.hp > 0)

      // 敵弾
      for (const b of bullets) {
        if (!b.on) continue
        if (b.stopT > 0) {
          // 停止中：タイマー経過で再始動（aimSpd>0 なら自機へ向き直す）
          b.stopT -= dt
          if (b.stopT <= 0) {
            if (b.aimSpd > 0) {
              const a = Math.atan2(G.py - b.y, G.px - b.x)
              b.vx = Math.cos(a) * b.aimSpd; b.vy = Math.sin(a) * b.aimSpd
            } else {
              b.vx = b.svx; b.vy = b.svy
            }
          }
        } else if (b.fzT > 0) {
          b.fzT -= dt
          if (b.fzT <= 0) {
            b.svx = b.vx; b.svy = b.vy
            b.vx = 0; b.vy = 0
            b.stopT = b.fzDur
          }
        }
        if (b.kind === 1 && b.curve !== 0 && b.stopT <= 0) {
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > 0) {
            const a = Math.atan2(b.vy, b.vx) + b.curve * dt
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp
          }
        }
        b.x += b.vx * dt; b.y += b.vy * dt
        if (b.x < -24 || b.x > FW + 24 || b.y < -24 || b.y > FH + 24) { b.on = false; continue }
        if (!G.dead) {
          const dx = b.x - G.px, dy = b.y - G.py
          const d2 = dx * dx + dy * dy
          if (!b.grazed && d2 < 26 * 26 && d2 >= (b.r + 2.5) * (b.r + 2.5)) {
            b.grazed = true; G.graze++; G.score += 500
          }
          if (d2 < (b.r + 2.5) * (b.r + 2.5)) {
            b.on = false
            playerHit()
          }
        }
      }

      // アイテム
      for (const it of items) {
        it.vy = Math.min(it.vy + 260 * dt, 150)
        it.y += it.vy * dt
        const dx = G.px - it.x, dy = G.py - it.y
        const d2 = dx * dx + dy * dy
        if (!G.dead && d2 < 60 * 60) { it.x += dx * 6 * dt; it.y += dy * 6 * dt }
        if (!G.dead && d2 < 16 * 16) {
          it.y = 99999
          if (it.kind === 'power') {
            if (G.power < 4) G.power++
            else G.score += 5000
          } else G.score += 3000
        }
      }
      items = items.filter(it => it.y < FH + 20)

      // パーティクル
      for (const p of parts) {
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt
        p.vx *= 0.96; p.vy *= 0.96
      }
      parts = parts.filter(p => p.life < p.max)
    }

    // ===== 全体更新 =====
    function update(dt: number) {
      G.time += dt
      G.phaseT += dt
      if (G.msgT > 0) G.msgT -= dt
      if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 14)

      if (G.phase === 'card') {
        G.cardT -= dt
        if (G.cardT <= 0) { G.phase = 'road'; G.phaseT = 0 }
      } else if (G.phase === 'road') {
        updateRoad(dt)
      } else if (G.phase === 'midboss') {
        updateMidboss(dt)
        // 中ボス戦中もたまに妖精が通る
        G.spawnT -= dt
        if (G.spawnT <= 0) {
          G.spawnT = 2.8
          spawnFairy('down', 30 + Math.random() * (FW - 60), -16, 1)
        }
      } else if (G.phase === 'bosswait') {
        G.bossWait -= dt
        if (G.bossWait <= 0) startBoss()
      }
      updatePlayer(dt)
      updateEnemies(dt)
      if (G.boss) updateBoss(dt)
      updateWorld(dt)
    }

    // ===== 描画 =====
    function drawBackground() {
      const pal = BG_PALS[STAGES[G.stageIdx].hue]
      const g = ctx.createLinearGradient(0, 0, 0, FH)
      g.addColorStop(0, pal[0])
      g.addColorStop(0.6, pal[1])
      g.addColorStop(1, pal[2])
      ctx.fillStyle = g
      ctx.fillRect(0, 0, FW, FH)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (let i = 0; i < 46; i++) {
        const sx = (i * 83) % FW
        const sy = ((i * 61 + G.time * (14 + (i % 3) * 9)) % FH)
        ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1)
      }
      // 満月
      ctx.beginPath(); ctx.arc(FW - 66, 62, 26, 0, Math.PI * 2)
      ctx.fillStyle = '#f7ead0'; ctx.fill()
      ctx.beginPath(); ctx.arc(FW - 76, 54, 22, 0, Math.PI * 2)
      ctx.fillStyle = pal[1]; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1
      // 紅魔館シルエット
      ctx.fillStyle = 'rgba(8,4,18,0.85)'
      ctx.fillRect(18, FH - 118, 92, 118)
      ctx.beginPath(); ctx.moveTo(10, FH - 118); ctx.lineTo(64, FH - 152); ctx.lineTo(118, FH - 118); ctx.closePath(); ctx.fill()
      ctx.fillRect(52, FH - 176, 24, 30)
      ctx.beginPath(); ctx.moveTo(46, FH - 176); ctx.lineTo(64, FH - 196); ctx.lineTo(82, FH - 176); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgba(255,214,120,0.85)'
      ctx.fillRect(38, FH - 92, 8, 11); ctx.fillRect(80, FH - 92, 8, 11); ctx.fillRect(60, FH - 66, 8, 11)
    }

    function drawReimu(x: number, y: number, blink: boolean) {
      if (blink) return
      ctx.save(); ctx.translate(x, y)
      ctx.fillStyle = '#e53935'
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(-9, -19); ctx.lineTo(-7, -8); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, -19); ctx.lineTo(7, -8); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#3a2a20'
      ctx.fillRect(-7, -12, 14, 16)
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -7, 5.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-6, -2, 12, 7)
      ctx.fillStyle = '#e53935'
      ctx.fillRect(-6, -2, 12, 2.4)
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, 4); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#d32f2f'
      ctx.beginPath(); ctx.moveTo(-6, 5); ctx.lineTo(6, 5); ctx.lineTo(9, 14); ctx.lineTo(-9, 14); ctx.closePath(); ctx.fill()
      ctx.restore()
    }

    function drawMarisa(x: number, y: number, blink: boolean) {
      if (blink) return
      ctx.save(); ctx.translate(x, y)
      // 金髪
      ctx.fillStyle = '#f9d976'
      ctx.fillRect(-7, -10, 14, 15)
      // 顔
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -6, 5.4, 0, Math.PI * 2); ctx.fill()
      // 黒いドレス
      ctx.fillStyle = '#263238'
      ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.lineTo(9, 14); ctx.lineTo(-9, 14); ctx.closePath(); ctx.fill()
      // 白いエプロン
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.moveTo(-3.4, 2); ctx.lineTo(3.4, 2); ctx.lineTo(5, 12); ctx.lineTo(-5, 12); ctx.closePath(); ctx.fill()
      // 大きな黒帽子
      ctx.fillStyle = '#1a1a22'
      ctx.beginPath(); ctx.ellipse(0, -12, 11, 3.6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-3.4, -21); ctx.lineTo(3.4, -21); ctx.lineTo(6, -12); ctx.closePath(); ctx.fill()
      // 白いリボン
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-6, -13.4, 12, 2.2)
      ctx.restore()
    }

    function drawFairy(en: Enemy) {
      ctx.save(); ctx.translate(en.x, en.y)
      const flap = Math.sin(en.t * 14) * 0.35
      ctx.fillStyle = 'rgba(170,225,255,0.75)'
      ctx.save(); ctx.rotate(-0.5 - flap); ctx.beginPath(); ctx.ellipse(-9, -3, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.save(); ctx.rotate(0.5 + flap); ctx.beginPath(); ctx.ellipse(9, -3, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      const dress = en.kind === 'big' ? '#7e57c2' : '#42a5f5'
      ctx.fillStyle = dress
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(7, 10); ctx.lineTo(-7, 10); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffe0bd'
      ctx.beginPath(); ctx.arc(0, -6, 4.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fdd835'
      ctx.beginPath(); ctx.arc(0, -8, 4.6, Math.PI, Math.PI * 2); ctx.fill()
      ctx.restore()
      if (en.kind === 'big') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(en.x - 22, en.y - 24, 44, 4)
        ctx.fillStyle = '#ab7be8'; ctx.fillRect(en.x - 22, en.y - 24, 44 * Math.max(0, en.hp / en.maxHp), 4)
      }
    }

    function drawRumia(x: number, y: number) {
      ctx.save(); ctx.translate(x, y)
      const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 30)
      aura.addColorStop(0, 'rgba(20,8,36,0.9)')
      aura.addColorStop(1, 'rgba(20,8,36,0)')
      ctx.fillStyle = aura
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#c62828'
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(10, 16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-10, 12, 20, 3)
      ctx.fillStyle = '#ffe082'
      ctx.beginPath(); ctx.arc(0, -10, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ff1744'
      ctx.beginPath(); ctx.arc(-6, -16, 3.4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(6, -16, 3.4, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    function drawCirno(x: number, y: number, t: number) {
      ctx.save(); ctx.translate(x, y)
      // 氷の羽（結晶）
      ctx.fillStyle = 'rgba(160,225,255,0.9)'
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const a = s * (0.5 + i * 0.42) + Math.sin(t * 6 + i) * 0.05
          ctx.save(); ctx.rotate(a)
          ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20, -3); ctx.lineTo(23, 2); ctx.lineTo(8, 3); ctx.closePath(); ctx.fill()
          ctx.restore()
        }
      }
      // 青いドレス
      ctx.fillStyle = '#42a5f5'
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(10, 16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-10, 11, 20, 3)
      // 水色の髪と顔
      ctx.fillStyle = '#81d4fa'
      ctx.beginPath(); ctx.arc(0, -10, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.6, 0, Math.PI * 2); ctx.fill()
      // 赤いリボン
      ctx.fillStyle = '#e53935'
      ctx.fillRect(-7.5, -15, 15, 2.6)
      ctx.restore()
    }

    function drawMeiling(x: number, y: number) {
      ctx.save(); ctx.translate(x, y)
      // 緑のドレス（チャイナ風）
      ctx.fillStyle = '#43a047'
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(10, 16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(-1, -4, 2, 18)
      // 茶色の髪
      ctx.fillStyle = '#8d4e2a'
      ctx.fillRect(-8, -12, 3.6, 17); ctx.fillRect(4.4, -12, 3.6, 17)
      ctx.beginPath(); ctx.arc(0, -10, 7.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.6, 0, Math.PI * 2); ctx.fill()
      // 緑の帽子＋星
      ctx.fillStyle = '#2e7d32'
      ctx.beginPath(); ctx.ellipse(0, -15, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillRect(-5, -19, 10, 4.4)
      ctx.fillStyle = '#ffd54f'
      ctx.save(); ctx.translate(0, -16.6); ctx.rotate(Math.PI / 4); ctx.fillRect(-1.8, -1.8, 3.6, 3.6); ctx.restore()
      ctx.restore()
    }

    function drawPatchouli(x: number, y: number) {
      ctx.save(); ctx.translate(x, y)
      // 紫の髪
      ctx.fillStyle = '#9575cd'
      ctx.fillRect(-8, -12, 16, 19)
      // ラベンダー色の服
      ctx.fillStyle = '#b39ddb'
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(10, 16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill()
      // 本
      ctx.fillStyle = '#f5f0e1'; ctx.fillRect(-6, 3, 12, 8)
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(-6, 3, 12, 1.8)
      // 顔
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.6, 0, Math.PI * 2); ctx.fill()
      // 三日月つきナイトキャップ
      ctx.fillStyle = '#7e57c2'
      ctx.beginPath(); ctx.ellipse(0, -14, 8.6, 3.6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.moveTo(-5, -14); ctx.quadraticCurveTo(0, -24, 8, -19); ctx.quadraticCurveTo(2, -16, 4, -13); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffe082'
      ctx.beginPath(); ctx.arc(6.4, -18.4, 2.1, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    function drawSakuya(x: number, y: number, t: number) {
      ctx.save(); ctx.translate(x, y)
      // 銀髪
      ctx.fillStyle = '#cfd8dc'
      ctx.fillRect(-8, -12, 3.6, 15); ctx.fillRect(4.4, -12, 3.6, 15)
      ctx.beginPath(); ctx.arc(0, -10, 7.6, 0, Math.PI * 2); ctx.fill()
      // 紺のメイド服＋白エプロン
      ctx.fillStyle = '#37474f'
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(10, 16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.moveTo(-4, 1); ctx.lineTo(4, 1); ctx.lineTo(6, 14); ctx.lineTo(-6, 14); ctx.closePath(); ctx.fill()
      // 顔
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.6, 0, Math.PI * 2); ctx.fill()
      // メイドカチューシャ
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(-7, -15.6, 14, 3)
      ctx.fillRect(-7, -18, 4, 2.6); ctx.fillRect(3, -18, 4, 2.6)
      // 浮遊するナイフ
      ctx.fillStyle = '#b0bec5'
      for (const s of [-1, 1]) {
        const ky = Math.sin(t * 2.4 + s) * 2
        ctx.save(); ctx.translate(s * 15, -2 + ky); ctx.rotate(s * 0.7)
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(2.2, 2); ctx.lineTo(-2.2, 2); ctx.closePath(); ctx.fill()
        ctx.restore()
      }
      ctx.restore()
    }

    function drawRemilia(x: number, y: number, t: number) {
      ctx.save(); ctx.translate(x, y)
      // 蝙蝠の翼
      ctx.fillStyle = 'rgba(62,32,84,0.95)'
      for (const s of [-1, 1]) {
        const flap = Math.sin(t * 5) * 2.4
        ctx.beginPath()
        ctx.moveTo(s * 5, -4)
        ctx.quadraticCurveTo(s * 20, -14 + flap, s * 27, -2 + flap)
        ctx.quadraticCurveTo(s * 20, 1, s * 17, 5)
        ctx.quadraticCurveTo(s * 11, 0, s * 5, 4)
        ctx.closePath(); ctx.fill()
      }
      // 薄紫の髪
      ctx.fillStyle = '#b39ddb'
      ctx.fillRect(-7.6, -12, 15.2, 14)
      // ピンクのドレス
      ctx.fillStyle = '#f8bbd0'
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(10, 16); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#e53935'; ctx.fillRect(-10, 12, 20, 3)
      // 顔と赤い目
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e53935'
      ctx.fillRect(-3.2, -9.4, 1.9, 1.9); ctx.fillRect(1.4, -9.4, 1.9, 1.9)
      // モブキャップ
      ctx.fillStyle = '#f48fb1'
      ctx.beginPath(); ctx.ellipse(0, -14.6, 8.6, 3.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e53935'; ctx.fillRect(-8.6, -13.4, 17.2, 1.8)
      ctx.restore()
    }

    function drawFlanAt(x: number, y: number, t: number) {
      ctx.save(); ctx.translate(x, y)
      const gemColors = ['#ff5252', '#ff9800', '#ffee58', '#69f0ae', '#40c4ff', '#7c4dff', '#ff7ad9']
      ctx.strokeStyle = '#4a3660'; ctx.lineWidth = 2
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 4, -2)
        ctx.quadraticCurveTo(s * 18, -12, s * 26, 4); ctx.stroke()
        for (let i = 0; i < 4; i++) {
          const gx = s * (12 + i * 5), gy = -6 + i * 3.4 + Math.sin(t * 3 + i) * 1.2
          ctx.fillStyle = gemColors[(i + (s > 0 ? 3 : 0)) % gemColors.length]
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.6, -2.6, 5.2, 5.2); ctx.restore()
        }
      }
      ctx.fillStyle = '#d81b60'
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(9, 15); ctx.lineTo(-9, 15); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff8e1'
      ctx.beginPath(); ctx.ellipse(0, -13, 8.5, 3.6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillRect(-5, -18, 10, 5)
      ctx.fillStyle = '#ffe082'
      ctx.fillRect(-7, -13, 3.4, 12); ctx.fillRect(3.6, -13, 3.4, 12)
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -9, 5.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e53935'
      ctx.fillRect(-3, -10, 1.8, 1.8); ctx.fillRect(1.4, -10, 1.8, 1.8)
      ctx.restore()
    }

    function drawDaiyousei(x: number, y: number, t: number) {
      ctx.save(); ctx.translate(x, y); ctx.scale(1.25, 1.25)
      const flap = Math.sin(t * 12) * 0.35
      ctx.fillStyle = 'rgba(170,225,255,0.75)'
      ctx.save(); ctx.rotate(-0.5 - flap); ctx.beginPath(); ctx.ellipse(-9, -3, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.save(); ctx.rotate(0.5 + flap); ctx.beginPath(); ctx.ellipse(9, -3, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.fillStyle = '#66bb6a'
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(7, 10); ctx.lineTo(-7, 10); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffe0bd'
      ctx.beginPath(); ctx.arc(0, -6, 4.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#6d4c41'
      ctx.beginPath(); ctx.arc(0, -8, 4.6, Math.PI, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    function drawKoakuma(x: number, y: number, t: number) {
      ctx.save(); ctx.translate(x, y)
      // 小さな蝙蝠翼
      ctx.fillStyle = 'rgba(40,20,50,0.95)'
      for (const s of [-1, 1]) {
        const flap = Math.sin(t * 7) * 1.6
        ctx.beginPath()
        ctx.moveTo(s * 4, -2)
        ctx.quadraticCurveTo(s * 14, -8 + flap, s * 17, 1 + flap)
        ctx.quadraticCurveTo(s * 10, 2, s * 4, 4)
        ctx.closePath(); ctx.fill()
      }
      // 赤いドレス
      ctx.fillStyle = '#b71c1c'
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(9, 15); ctx.lineTo(-9, 15); ctx.closePath(); ctx.fill()
      // 赤毛と顔
      ctx.fillStyle = '#d32f2f'
      ctx.fillRect(-7.4, -12, 14.8, 13)
      ctx.fillStyle = '#ffd9b3'
      ctx.beginPath(); ctx.arc(0, -8, 5.4, 0, Math.PI * 2); ctx.fill()
      // 頭の翼
      ctx.fillStyle = '#311b42'
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 5, -13); ctx.lineTo(s * 11, -17); ctx.lineTo(s * 9, -10); ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    }

    function drawFigure(id: BossId | MidId, x: number, y: number, t: number) {
      switch (id) {
        case 'rumia': drawRumia(x, y); break
        case 'cirno': drawCirno(x, y, t); break
        case 'meiling': drawMeiling(x, y); break
        case 'patchouli': drawPatchouli(x, y); break
        case 'sakuya': drawSakuya(x, y, t); break
        case 'remilia': drawRemilia(x, y, t); break
        case 'flandre': drawFlanAt(x, y, t); break
        case 'daiyousei': drawDaiyousei(x, y, t); break
        case 'koakuma': drawKoakuma(x, y, t); break
      }
    }

    function drawBeam(b: Boss) {
      const cyc = b.t % 4
      const len = 520
      const ex = b.x + Math.cos(b.beamA) * len
      const ey = b.y + Math.sin(b.beamA) * len
      ctx.save()
      if (cyc <= 0.7) {
        ctx.strokeStyle = 'rgba(255,80,60,0.45)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 6])
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke()
        ctx.setLineDash([])
      } else {
        const wdt = 15 + Math.sin(b.t * 30) * 2.5
        const g = ctx.createLinearGradient(b.x, b.y, ex, ey)
        g.addColorStop(0, 'rgba(255,240,180,0.95)')
        g.addColorStop(0.4, 'rgba(255,140,40,0.9)')
        g.addColorStop(1, 'rgba(230,40,30,0.75)')
        ctx.strokeStyle = g
        ctx.lineWidth = wdt * 2
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,230,0.9)'
        ctx.lineWidth = 5
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ex, ey); ctx.stroke()
      }
      ctx.restore()
    }

    function draw() {
      ctx.clearRect(0, 0, SW, SH)
      ctx.save()
      if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake)
      drawBackground()

      // アイテム
      for (const it of items) {
        ctx.fillStyle = it.kind === 'power' ? '#ef5350' : '#42a5f5'
        ctx.fillRect(it.x - 5, it.y - 5, 10, 10)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(it.kind === 'power' ? 'P' : '点', it.x, it.y + 0.5)
      }
      // 敵
      for (const en of enemies) drawFairy(en)
      // 中ボス
      const md = G.mid
      if (md) {
        drawFigure(md.id, md.x, md.y, md.t)
        if (!md.flee) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(md.x - 24, md.y - 30, 48, 4)
          ctx.fillStyle = '#ffb74d'; ctx.fillRect(md.x - 24, md.y - 30, 48 * Math.max(0, md.hp / md.maxHp), 4)
        }
      }
      // ボス
      const b = G.boss
      if (b) {
        if (b.id === 'flandre' && b.atkIdx === 2 && !b.entering) drawBeam(b)
        if (b.id === 'flandre' && b.atkIdx === 1 && b.clones.length > 0) {
          for (const cl of b.clones) drawFlanAt(cl.x, cl.y, b.t)
        } else {
          drawFigure(b.id, b.x, b.y, b.t)
        }
      }
      // 自機弾
      for (const pb of pbs) {
        if (pb.kind === 1) {
          ctx.fillStyle = '#a5f2ff'
          ctx.fillRect(pb.x - 2, pb.y - 11, 4, 16)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(pb.x - 0.8, pb.y - 11, 1.6, 16)
        } else if (pb.kind === 2) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(pb.x - 2.4, pb.y - 4, 4.8, 8)
          ctx.fillStyle = '#e53935'
          ctx.fillRect(pb.x - 2.4, pb.y - 4, 4.8, 2.4)
        } else {
          ctx.fillStyle = '#fff59d'
          ctx.fillRect(pb.x - 1.6, pb.y - 6, 3.2, 9)
        }
      }
      // 敵弾
      for (const bl of bullets) {
        if (!bl.on) continue
        if (bl.kind === 1) {
          // 鳥／蝙蝠弾
          ctx.save(); ctx.translate(bl.x, bl.y)
          ctx.rotate(Math.atan2(bl.vy, bl.vx))
          ctx.fillStyle = BULLET_COLORS[bl.c]
          ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.4); ctx.lineTo(-2.4, 0); ctx.lineTo(-5, 4.4); ctx.closePath(); ctx.fill()
          ctx.restore()
        } else if (bl.kind === 2) {
          // ナイフ／金属片
          ctx.save(); ctx.translate(bl.x, bl.y)
          ctx.rotate(Math.atan2(bl.vy, bl.vx) + Math.PI / 2)
          ctx.fillStyle = BULLET_COLORS[bl.c]
          ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(2.4, 3); ctx.lineTo(0, 6); ctx.lineTo(-2.4, 3); ctx.closePath(); ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(1, 2); ctx.lineTo(-1, 2); ctx.closePath(); ctx.fill()
          ctx.restore()
        } else if (bl.kind === 3) {
          // 氷柱
          ctx.save(); ctx.translate(bl.x, bl.y)
          ctx.rotate(Math.atan2(bl.vy, bl.vx) + Math.PI / 2)
          ctx.fillStyle = '#a5e8ff'
          ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(3.2, -5); ctx.lineTo(-3.2, -5); ctx.closePath(); ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(1.1, -3); ctx.lineTo(-1.1, -3); ctx.closePath(); ctx.fill()
          ctx.restore()
        } else {
          ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2)
          ctx.fillStyle = BULLET_COLORS[bl.c]; ctx.fill()
          ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r * 0.45, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill()
        }
        if (bl.stopT > 0) {
          // 停止中の弾は白い輪で示す
          ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r + 3.4, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke()
        }
      }
      // パーティクル
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max)
        ctx.fillStyle = p.c
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      // ボム演出
      if (G.bombT > 0) {
        ctx.beginPath(); ctx.arc(G.px, G.py, (0.8 - G.bombT) * 320, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,224,102,0.8)'; ctx.lineWidth = 5; ctx.stroke()
      }
      // 自機
      if (!G.dead) {
        const blink = G.invT > 0 && Math.floor(G.time * 14) % 2 === 0
        if (G.chara === 'marisa') drawMarisa(G.px, G.py, blink)
        else drawReimu(G.px, G.py, blink)
        if (G.pSpeedLow || pointerDown) {
          ctx.beginPath(); ctx.arc(G.px, G.py, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'; ctx.fill()
          ctx.beginPath(); ctx.arc(G.px, G.py, 3, 0, Math.PI * 2)
          ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1.4; ctx.stroke()
          ctx.beginPath(); ctx.arc(G.px, G.py, 8, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke()
        }
      }
      ctx.restore()

      // ===== ボス位置マーカー（画面下部） =====
      const marker = (x: number, color: string) => {
        const mx = clamp(x, 8, FW - 8)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.65 + Math.sin(G.time * 6) * 0.3
        ctx.beginPath(); ctx.moveTo(mx, FH - 10); ctx.lineTo(mx - 6, FH - 2); ctx.lineTo(mx + 6, FH - 2); ctx.closePath(); ctx.fill()
        ctx.globalAlpha = 1
      }
      if (b) marker(b.id === 'flandre' && b.atkIdx === 1 ? FW / 2 : b.x, '#ff5252')
      else if (md && !md.flee) marker(md.x, '#4fc3f7')

      // ===== ボス情報 =====
      if (b) {
        const def = BOSS_DEFS[b.id]
        const atk = def.attacks[b.atkIdx]
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(6, 6, FW - 12, 30)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(def.name, 10, 8)
        ctx.fillStyle = '#ffd54f'; ctx.font = '10px sans-serif'
        ctx.fillText(atk.name ?? '通常攻撃', 10, 21)
        const stars = '★'.repeat(Math.max(0, def.attacks.length - 1 - b.atkIdx))
        if (stars) {
          ctx.fillStyle = '#ff8a80'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
          ctx.fillText(stars, FW - 44, 21)
        }
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'
        ctx.fillText(`${Math.ceil(b.timer)}`, FW - 10, 8)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(6, 38, FW - 12, 4)
        ctx.fillStyle = '#ef5350'; ctx.fillRect(6, 38, (FW - 12) * Math.max(0, b.hp / b.maxHp), 4)
      }
      // ===== ステージカード =====
      if (G.phase === 'card') {
        const sd = STAGES[G.stageIdx]
        const def = BOSS_DEFS[sd.boss]
        ctx.fillStyle = 'rgba(5,2,14,0.62)'; ctx.fillRect(0, 128, FW, 168)
        ctx.fillStyle = '#ff9e9e'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(G.stageIdx === 6 ? 'EXTRA STAGE' : `STAGE ${G.stageIdx + 1}`, FW / 2, 158)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 21px sans-serif'
        ctx.fillText(sd.title, FW / 2, 192)
        ctx.fillStyle = '#d1c4e9'; ctx.font = '12px sans-serif'
        ctx.fillText(def.epithet, FW / 2, 232)
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 16px sans-serif'
        ctx.fillText(def.name, FW / 2, 256)
      }
      // メッセージ
      if (G.msgT > 0 && G.msg) {
        ctx.globalAlpha = Math.min(1, G.msgT)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4
        ctx.strokeText(G.msg, FW / 2, 120)
        ctx.fillText(G.msg, FW / 2, 120)
        ctx.globalAlpha = 1
      }

      // ===== サイド表示 =====
      ctx.fillStyle = '#12081f'; ctx.fillRect(FW, 0, SW - FW, SH)
      ctx.fillStyle = '#3d2b52'; ctx.fillRect(FW, 0, 2, SH)
      const sx = FW + 14
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      const label = (s: string, y: number) => {
        ctx.fillStyle = '#b39ddb'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(s, sx, y)
      }
      const value = (s: string, y: number) => {
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.fillText(s, sx, y)
      }
      label('STAGE', 12)
      value(G.stageIdx === 6 ? 'EXTRA' : `STAGE ${G.stageIdx + 1}`, 26)
      label('SCORE', 52)
      value(G.score.toLocaleString(), 66)
      label('HI-SCORE', 92)
      value(Math.max(hiscore, G.score).toLocaleString(), 106)
      label('PLAYER', 132)
      if (G.challenge) {
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('∞ チャレンジ', sx, 148)
      } else {
        for (let i = 0; i < Math.max(0, G.lives); i++) {
          ctx.fillStyle = '#ef5350'
          ctx.beginPath(); ctx.arc(sx + 8 + i * 20, 154, 6, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.beginPath(); ctx.arc(sx + 8 + i * 20, 154, 2.4, 0, Math.PI * 2); ctx.fill()
        }
      }
      label('BOMB', 172)
      for (let i = 0; i < G.bombs; i++) {
        ctx.fillStyle = '#ffd54f'
        ctx.save(); ctx.translate(sx + 8 + i * 20, 194); ctx.rotate(Math.PI / 4); ctx.fillRect(-4.4, -4.4, 8.8, 8.8); ctx.restore()
      }
      label('POWER', 214)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(sx, 232, 96, 8)
      ctx.fillStyle = '#ef5350'; ctx.fillRect(sx, 232, 96 * (G.power / 4), 8)
      ctx.fillStyle = '#ffffff'; ctx.font = '11px monospace'
      ctx.fillText(`${G.power} / 4`, sx, 244)
      label('GRAZE', 266)
      value(String(G.graze), 280)
      label('TIME', 306)
      value(`${Math.floor(G.time)}s`, 320)
      ctx.fillStyle = '#b39ddb'; ctx.font = '10px sans-serif'
      ctx.fillText(`${G.chara === 'marisa' ? '魔理沙' : '霊夢'} / ${DIFF_CFG[G.diff].label}${G.challenge ? ' / CHALLENGE' : ''}`, sx, 344)
      ctx.fillStyle = '#8e7bb5'; ctx.font = '10px sans-serif'
      ctx.fillText('Z: ショット', sx, 368)
      ctx.fillText('X: ボム', sx, 384)
      ctx.fillText('Shift: 低速', sx, 400)
      ctx.fillText('M: BGM切替', sx, 416)
      ctx.fillText('矢印/WASD: 移動', sx, 432)
    }

    // ===== メインループ =====
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000
      last = now
      if (dt > 0.05) dt = 0.05
      if (running) update(dt)
      else G.time += dt // タイトル背景用に時間を進める
      draw()
    }
    raf = requestAnimationFrame(loop)

    startRef.current = (run: 'story' | 'extra') => {
      const sel = selRef.current
      const list = run === 'extra' ? [6] : sel.diff === 'easy' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5]
      bullets.forEach(bl => { bl.on = false })
      pbs = []; enemies = []; items = []; parts = []
      G = freshGame(sel.chara, sel.diff, sel.challenge, list)
      running = true
      setScreen('playing')
      bgmPlay(G.stageIdx === 6 ? 'exstage' : 'stage')
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      bgmRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const overlayStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'rgba(8,3,18,0.8)', color: '#fff', textAlign: 'center',
    borderRadius: 8, padding: 14, zIndex: 3, overflowY: 'auto',
  }
  const btnStyle: React.CSSProperties = {
    background: '#c62828', color: '#fff', border: '1px solid #ff8a80',
    borderRadius: 999, padding: '10px 28px', fontSize: 16, fontWeight: 'bold',
    cursor: 'pointer',
  }
  const selBtn = (active: boolean): React.CSSProperties => ({
    background: active ? '#7b1fa2' : 'rgba(255,255,255,0.08)',
    color: '#fff',
    border: active ? '2px solid #ce93d8' : '1px solid rgba(255,255,255,0.35)',
    borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: active ? 'bold' : 'normal',
    cursor: 'pointer',
  })
  const selLabel: React.CSSProperties = { fontSize: 11, color: '#b39ddb', letterSpacing: 2, marginTop: 4 }
  const pressBomb = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' }))
  }
  const toggleMute = () => setMutedUi(getBgm().toggleMute())
  const touchTitle = () => { getBgm().play('title') }

  return (
    <div ref={wrapRef} style={{ width: '100%', maxWidth: 560, margin: '0 auto', userSelect: 'none' }}>
      <style>{`.kouma-btn:active { transform: scale(0.96); }`}</style>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={SW}
          height={SH}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: '#0b0620', touchAction: 'none' }}
        />
        <button
          type="button"
          className="kouma-btn"
          onClick={toggleMute}
          aria-label="BGMミュート切替"
          style={{
            position: 'absolute', right: 10, top: 10, zIndex: 4,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(20,10,40,0.7)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)', fontSize: 17,
            cursor: 'pointer',
          }}
        >
          {mutedUi ? '🔇' : '🔊'}
        </button>
        {screen === 'playing' && (
          <button
            type="button"
            className="kouma-btn"
            onPointerDown={(e) => { e.preventDefault(); pressBomb() }}
            style={{
              position: 'absolute', right: 10, bottom: 10, zIndex: 2,
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(198,40,40,0.75)', color: '#fff',
              border: '2px solid rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 'bold',
            }}
          >
            ボム
          </button>
        )}
        {screen === 'title' && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 12, letterSpacing: 4, color: '#ff9e9e' }}>ファンメイド弾幕STG</div>
            <div style={{ fontSize: 32, fontWeight: 'bold', color: '#ff5252', textShadow: '0 0 14px rgba(255,60,60,0.7)' }}>東方紅魔郷</div>
            <div style={{ fontSize: 12, color: '#d1c4e9' }}>〜 全6面＋EXステージ 〜</div>
            <div style={selLabel}>自機</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={selBtn(chara === 'reimu')} onClick={() => { setChara('reimu'); touchTitle() }}>霊夢（誘導・広角）</button>
              <button type="button" style={selBtn(chara === 'marisa')} onClick={() => { setChara('marisa'); touchTitle() }}>魔理沙（集中・高速）</button>
            </div>
            <div style={selLabel}>難易度</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={selBtn(diff === 'easy')} onClick={() => { setDiff('easy'); touchTitle() }}>Easy（5面まで）</button>
              <button type="button" style={selBtn(diff === 'normal')} onClick={() => { setDiff('normal'); touchTitle() }}>Normal</button>
              <button type="button" style={selBtn(diff === 'hard')} onClick={() => { setDiff('hard'); touchTitle() }}>Hard</button>
            </div>
            <div style={selLabel}>モード</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={selBtn(!challenge)} onClick={() => { setChallenge(false); touchTitle() }}>通常</button>
              <button type="button" style={selBtn(challenge)} onClick={() => { setChallenge(true); touchTitle() }}>チャレンジ（残機無限）</button>
            </div>
            <button type="button" className="kouma-btn" style={{ ...btnStyle, marginTop: 8 }} onClick={() => { getBgm(); startRef.current('story') }}>
              ゲームスタート
            </button>
            {exUnlocked && (
              <button
                type="button"
                className="kouma-btn"
                style={{ ...btnStyle, background: '#6a1b9a', border: '1px solid #ce93d8' }}
                onClick={() => { getBgm(); startRef.current('extra') }}
              >
                EXTRA STAGE（フランドール）
              </button>
            )}
            <div style={{ fontSize: 11.5, lineHeight: 1.8, color: '#cfc4e8' }}>
              移動：矢印/WASD（タッチはドラッグ）　ショット：Z　ボム：X　低速：Shift　BGM：M<br />
              Normal以上でSTAGE 6をクリアするとEXが解放されます
            </div>
          </div>
        )}
        {(screen === 'over' || screen === 'clear') && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 30, fontWeight: 'bold', color: screen === 'clear' ? '#ffd54f' : '#ff5252' }}>
              {endTitle || (screen === 'clear' ? 'ALL CLEAR!' : 'GAME OVER')}
            </div>
            <div style={{ fontSize: 14, color: '#d1c4e9' }}>{endSub}</div>
            <div style={{ fontSize: 20, fontFamily: 'monospace' }}>SCORE {finalScore.toLocaleString()}</div>
            <button type="button" className="kouma-btn" style={{ ...btnStyle, marginTop: 6 }} onClick={() => { getBgm(); startRef.current('story') }}>
              もう一度遊ぶ
            </button>
            <button
              type="button"
              onClick={() => { setScreen('title'); getBgm().play('title') }}
              style={{ background: 'transparent', color: '#b39ddb', border: 'none', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
            >
              タイトルに戻る
            </button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 6 }}>
        ※ 本作品は東方Projectにインスパイアされた非公式ファンメイドです。原作の素材・楽曲は使用していません（BGMはオリジナル曲をWebAudioで合成）。
      </div>
    </div>
  )
}
