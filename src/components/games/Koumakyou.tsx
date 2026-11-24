// 紅魔郷弾幕STG（ファンメイド）
// 東方紅魔郷にインスパイアされたオリジナルの縦スクロール弾幕シューティング。
// 原作の素材（画像・音楽・データ）は一切使わず、描画はすべて Canvas の図形、
// BGM は WebAudio で合成する完全オリジナル曲（ZUN風アレンジの文法で作曲）。
// 進行は全6面＋EXステージ（原作／New Classic の構成を踏襲したファンメイド再現）。
// ボス戦前／撃破後には会話シーン（台詞は自作文、ポートレートは自前生成イラストを
// public/cdn/koumakyou/ から配信）があり、タイトル／選択画面も原作の構成に寄せている。
//
// 内部実装は自作エンジン2点に移植済み：
//  - danmaku-engine（弾プール／レーザー／Emitter／固定60Hzループ）
//  - toho-engine（ボス・自機・敵・アイテム・ステージ脚本・キャラ描画）
import { useEffect, useRef, useState } from 'react'
import {
  DanmakuWorld,
  FixedLoop,
  AimedEmitter,
  SpiralEmitter,
  type Laser,
} from '../../lib/danmaku-engine'
import {
  GameState,
  ItemPool,
  EnemyPool,
  Player,
  PlayerBulletPool,
  BossController,
  StageRunner,
  drawFigure,
  RUMIA_FIGURE,
  CIRNO_FIGURE,
  REMILIA_FIGURE,
  FLANDRE_FIGURE,
  REIMU_FIGURE,
  MARISA_FIGURE,
  type BossBody,
  type BossContext,
  type BossDef,
  type EnemyDef,
  type FigureDef,
  type PhaseEndResult,
  type PlayerCharaDef,
  type StageApi,
  type StageScript,
} from '../../lib/toho-engine'

// ===== 定数 =====
const FW = 384 // プレイフィールド幅
const FH = 448 // プレイフィールド高さ
const SW = 512 // 画面全体幅（フィールド＋サイド表示）
const SH = 448
const MAXB = 1500 // 敵弾の上限
const EX_KEY = 'webx-koumakyou-ex'
const HISCORE_KEY = 'webx-koumakyou-hiscore'
const CHALLENGE_KEY = 'webx-koumakyou-challenge-best'
const DOWN = Math.PI / 2

// ===== 基本型（ゲーム側） =====
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number }

type CharaId = 'reimu' | 'marisa'
type DiffId = 'easy' | 'normal' | 'hard'
const DIFF_CFG: Record<DiffId, { spd: number; den: number; label: string }> = {
  easy: { spd: 0.85, den: 0.62, label: 'Easy' },
  normal: { spd: 1, den: 1, label: 'Normal' },
  hard: { spd: 1.14, den: 1.4, label: 'Hard' },
}

type BossId = 'rumia' | 'cirno' | 'meiling' | 'patchouli' | 'sakuya' | 'remilia' | 'flandre'
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

// ===== キャラ描画（プリセットにないキャラはローカル FigureDef） =====
const SKIN = { skin: '#ffe7d6', skinShade: '#f2c9a4' }
const MEILING_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#a85a32', hairShade: '#743c1c', eye: '#3d7de0',
    dress: '#3f9e4d', dressShade: '#2a6e36', sub: '#f7f3ea', accent: '#ffd54f',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
}
const PATCHOULI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#a58fd4', hairShade: '#7158a8', eye: '#8e5bb5',
    dress: '#b7a6dd', dressShade: '#8773ba', sub: '#f3eefc', accent: '#7e57c2',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
}
const SAKUYA_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#d7dee6', hairShade: '#97a9bb', eye: '#4a7dd4',
    dress: '#37475e', dressShade: '#222d40', sub: '#ffffff', accent: '#d8404a',
  },
  hairStyle: 'medium', accessory: 'none', wings: 'none',
}
const DAIYOUSEI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#8a5a34', hairShade: '#5d3b1f', eye: '#4d9e5f',
    dress: '#5db06a', dressShade: '#3d7a47', sub: '#ffffff', accent: '#ffd54f',
  },
  hairStyle: 'medium', accessory: 'none', wings: 'feather',
}
const KOAKUMA_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#d84a4a', hairShade: '#9c2432', eye: '#7e57c2',
    dress: '#b03040', dressShade: '#7a1e2b', sub: '#2a2a33', accent: '#311b42',
  },
  hairStyle: 'long', accessory: 'none', wings: 'bat',
}
const BOSS_FIGURES: Record<BossId, FigureDef> = {
  rumia: RUMIA_FIGURE,
  cirno: CIRNO_FIGURE,
  meiling: MEILING_FIG,
  patchouli: PATCHOULI_FIG,
  sakuya: SAKUYA_FIG,
  remilia: REMILIA_FIGURE,
  flandre: FLANDRE_FIGURE,
}
const MID_FIGURES: Record<MidId, FigureDef> = {
  rumia: RUMIA_FIGURE,
  daiyousei: DAIYOUSEI_FIG,
  meiling: MEILING_FIG,
  koakuma: KOAKUMA_FIG,
  sakuya: SAKUYA_FIG,
  patchouli: PATCHOULI_FIG,
}

// ===== 難易度ヘルパー（BossContext の diff を現行の rn/iv 相当に読み替える） =====
const cntOf = (ctx: BossContext, n: number) => Math.max(3, Math.round(n * ctx.diff.den))
const ivOf = (ctx: BossContext, base: number) => base / ctx.diff.den
const spdOf = (ctx: BossContext, base: number) => base * ctx.diff.spd

// ===== 自機定義（現行のショット構成・速度を PlayerCharaDef 形式で再定義） =====
const UP = -Math.PI / 2
const REIMU_LOCAL: PlayerCharaDef = {
  id: 'reimu', name: '博麗霊夢',
  speed: 252, focusSpeed: 118, hitR: 2.5, grazeR: 26, shotInterval: 0.075,
  bomb: { name: '霊符「夢想封印」', duration: 0.8, dps: 0, scope: 'full' },
  shots: (tier) => {
    const out = []
    out.push({ dx: -4, dy: -10, angle: UP, speed: 560, dmg: 4, kind: 'orb' as const })
    out.push({ dx: 4, dy: -10, angle: UP, speed: 560, dmg: 4, kind: 'orb' as const })
    if (tier >= 1) {
      out.push({ dx: -11, dy: -4, angle: Math.atan2(-540, -26), speed: Math.hypot(26, 540), dmg: 2, kind: 'orb' as const })
      out.push({ dx: 11, dy: -4, angle: Math.atan2(-540, 26), speed: Math.hypot(26, 540), dmg: 2, kind: 'orb' as const })
    }
    if (tier >= 2) {
      out.push({ dx: -8, dy: -2, angle: Math.atan2(-390, -44), speed: Math.hypot(44, 390), dmg: 2, kind: 'talisman' as const, homing: 3.4 })
      out.push({ dx: 8, dy: -2, angle: Math.atan2(-390, 44), speed: Math.hypot(44, 390), dmg: 2, kind: 'talisman' as const, homing: 3.4 })
    }
    if (tier >= 3) {
      out.push({ dx: -16, dy: -2, angle: Math.atan2(-520, -60), speed: Math.hypot(60, 520), dmg: 2, kind: 'orb' as const })
      out.push({ dx: 16, dy: -2, angle: Math.atan2(-520, 60), speed: Math.hypot(60, 520), dmg: 2, kind: 'orb' as const })
    }
    if (tier >= 4) {
      out.push({ dx: 0, dy: -16, angle: UP, speed: 620, dmg: 4, kind: 'orb' as const })
    }
    return out
  },
}
const MARISA_LOCAL: PlayerCharaDef = {
  id: 'marisa', name: '霧雨魔理沙',
  speed: 276, focusSpeed: 134, hitR: 2.5, grazeR: 26, shotInterval: 0.075,
  bomb: { name: '恋符「マスタースパーク」', duration: 0.8, dps: 0, scope: 'full' },
  shots: (tier) => {
    const out = []
    out.push({ dx: -5, dy: -12, angle: UP, speed: 640, dmg: 5, kind: 'laser' as const })
    out.push({ dx: 5, dy: -12, angle: UP, speed: 640, dmg: 5, kind: 'laser' as const })
    if (tier >= 1) {
      out.push({ dx: -10, dy: -6, angle: UP, speed: 600, dmg: 3, kind: 'orb' as const })
      out.push({ dx: 10, dy: -6, angle: UP, speed: 600, dmg: 3, kind: 'orb' as const })
    }
    if (tier >= 2) {
      out.push({ dx: -2, dy: -14, angle: UP, speed: 660, dmg: 3, kind: 'laser' as const })
      out.push({ dx: 2, dy: -14, angle: UP, speed: 660, dmg: 3, kind: 'laser' as const })
    }
    if (tier >= 3) {
      out.push({ dx: 0, dy: -18, angle: UP, speed: 680, dmg: 5, kind: 'laser' as const })
    }
    if (tier >= 4) {
      out.push({ dx: -14, dy: -8, angle: UP, speed: 620, dmg: 4, kind: 'laser' as const })
      out.push({ dx: 14, dy: -8, angle: UP, speed: 620, dmg: 4, kind: 'laser' as const })
    }
    return out
  },
}

// ===== ボス定義（BossDef への変換） =====
const BONUS = { bonusBase: 1_000_000, bonusPerSec: 20_000 }

function buildBossDef(id: BossId): BossDef {
  switch (id) {
    case 'rumia': return {
      id, name: 'ルーミア', epithet: '宵闇の妖怪', radius: 22, figure: BOSS_FIGURES.rumia,
      phases: [
        {
          name: null, hp: 520, timeLimit: 40, move: 'sine', moveRange: 105, moveSpeed: 0.61,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.1); ctx.aimed(3, 0.18, { speed: 122, r: 4, color: 0 }) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.8); ctx.ring(10, { speed: 70, r: 4, color: 7, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '月符「ムーンライトレイ」', hp: 880, timeLimit: 45, move: 'hover', moveRange: 34, moveSpeed: 0.5, ...BONUS,
          setup: (ctx) => {
            phaseState(ctx).a3 = 1.4 // 最初のレーザー斉射までの猶予
            const sp = new SpiralEmitter()
            // 弾の間隔（速度×間隔）が当たり判定直径を下回ると螺旋の腕が「隙間のない壁」になるため間隔を確保
            sp.arms = 2; sp.angleVel = 0.85; sp.interval = ivOf(ctx, 0.16)
            sp.bullet = { speed: spdOf(ctx, 88), r: 4.5, color: 5, kind: 'orb' }
            ctx.addEmitter(sp)
            const am = new AimedEmitter()
            am.count = 1; am.interval = ivOf(ctx, 1.7)
            am.bullet = { speed: spdOf(ctx, 125), r: 4, color: 0, kind: 'orb' }
            ctx.addEmitter(am)
          },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a3 -= dt
            if (s.a3 <= 0) {
              s.a3 = ivOf(ctx, 2.7)
              // 月光のレーザーを扇状に放つ（原作の「レーザー＋リング」の核）
              for (const off of [-0.62, 0, 0.62]) {
                ctx.addLaser({
                  x: ctx.bossX(), y: ctx.bossY() + 6,
                  angle: DOWN + off, length: 660, width: 13,
                  customColor: '#cfe8ff', telegraph: 0.45, duration: 1.05, fade: 0.2,
                })
              }
            }
          },
        },
        {
          name: '夜符「ミッドナイトバード」', hp: 1020, timeLimit: 50, move: 'drift', moveRange: 105, moveSpeed: 0.95, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.5)
              for (let i = -1; i <= 1; i++) {
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY() + 4, angle: DOWN + i * 0.55,
                  speed: spdOf(ctx, 105), r: 5, color: 3, kind: 'ellipse', curve: i * 0.9,
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.3); ctx.ring(14, { speed: 68, r: 4, color: 6, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '闇符「ディマーケイション」', hp: 1240, timeLimit: 55, move: 'sine', moveRange: 105, moveSpeed: 0.61, ...BONUS,
          setup: (ctx) => {
            const sp = new SpiralEmitter()
            // 腕が固体壁にならないよう、弾の間隔（速度×間隔）＞当たり判定直径を保つ
            sp.arms = 3; sp.angleVel = 1.5; sp.interval = ivOf(ctx, 0.15)
            sp.bullet = { speed: spdOf(ctx, 96), r: 4.5, color: 7, kind: 'orb' }
            ctx.addEmitter(sp)
            // 逆回転の渦を重ねて「境界（ディマーケイション）」の交差感を出す
            const sp2 = new SpiralEmitter()
            sp2.arms = 2; sp2.angleVel = -1.5; sp2.angle = 0.7; sp2.interval = ivOf(ctx, 0.17)
            sp2.bullet = { speed: spdOf(ctx, 84), r: 4.5, color: 5, kind: 'orb' }
            ctx.addEmitter(sp2)
            const am = new AimedEmitter()
            am.count = 3; am.spread = 0.2; am.interval = ivOf(ctx, 1.25)
            am.bullet = { speed: spdOf(ctx, 140), r: 4, color: 0, kind: 'orb' }
            ctx.addEmitter(am)
          },
        },
      ],
    }
    case 'cirno': return {
      id, name: 'チルノ', epithet: '湖上の氷精', radius: 22, figure: BOSS_FIGURES.cirno,
      phases: [
        {
          name: null, hp: 560, timeLimit: 40, move: 'sine', moveRange: 120, moveSpeed: 1.0,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.9); ctx.aimed(3, 0.16, { speed: 150, r: 4, color: 4, kind: 'knife', customColor: '#a5e8ff' }) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.2); ctx.ring(12, { speed: 75, r: 4, color: 4, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '氷符「アイシクルフォール」', hp: 980, timeLimit: 50, move: 'sine', moveRange: 120, moveSpeed: 1.0, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.55)
              // 氷柱が波になって画面全体へ降り注ぐ（原作の氷柱雨）
              for (let i = 0; i < 5; i++) {
                ctx.spawn({
                  x: 14 + ((i + Math.random() * 0.7) / 5) * (FW - 28), y: -12 - Math.random() * 18,
                  vx: (Math.random() - 0.5) * 22 * ctx.diff.spd, vy: spdOf(ctx, 150 + Math.random() * 60),
                  r: 4.5, color: 4, kind: 'knife', customColor: '#a5e8ff',
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.8); ctx.aimed(3, 0.16, { speed: 122, r: 4, color: 4 }) }
          },
        },
        {
          name: '凍符「パーフェクトフリーズ」', hp: 1250, timeLimit: 55, move: 'sine', moveRange: 120, moveSpeed: 1.0, ...BONUS,
          template: 'freeze',
          params: { interval: 1.5, count: 18, speed: 106, freezeAt: 0.55, freezeTime: 0.75, gravity: 330, layers: 1, color: 4 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a2 -= dt
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.6); ctx.aimed(3, 0.18, { speed: 126, r: 4, color: 4 }) }
          },
        },
      ],
    }
    case 'meiling': return {
      id, name: '紅美鈴', epithet: '華人小娘', radius: 22, figure: BOSS_FIGURES.meiling,
      phases: [
        {
          name: null, hp: 600, timeLimit: 40, move: 'sine', moveRange: 90, moveSpeed: 0.5,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.0); ctx.aimed(5, 0.16, { speed: 115, r: 4, color: Math.floor(ctx.phaseTime()) % 8 }) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 3.0); ctx.ring(12, { speed: 72, r: 4, color: 3, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '華符「セラギネラ9」', hp: 1050, timeLimit: 50, move: 'sine', moveRange: 90, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.15
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 9方向の腕が固体壁にならないよう発射間隔を広げ、腕の間に抜け道を残す
              s.a1 = ivOf(ctx, 0.17)
              for (let k = 0; k < 9; k++) {
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + (k * Math.PI * 2) / 9,
                  speed: spdOf(ctx, 84), r: 4.5, color: k % 8, kind: 'orb',
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.2); ctx.aimed(3, 0.18, { speed: 122, r: 4, color: 1 }) }
          },
        },
        {
          name: '彩符「彩雨」', hp: 1280, timeLimit: 55, move: 'sine', moveRange: 90, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.09)
              ctx.spawn({
                x: 10 + Math.random() * (FW - 20), y: -10,
                vx: (Math.random() - 0.5) * 36 * ctx.diff.spd, vy: spdOf(ctx, 132 + Math.random() * 68),
                r: 4.5, color: Math.floor(Math.random() * 8), kind: 'orb',
              })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.5); ctx.aimed(5, 0.16, { speed: 120, r: 4, color: 2 }) }
          },
        },
      ],
    }
    case 'patchouli': return {
      id, name: 'パチュリー・ノーレッジ', epithet: '知識と日陰の少女', radius: 22, figure: BOSS_FIGURES.patchouli,
      phases: [
        {
          name: null, hp: 640, timeLimit: 45, move: 'sine', moveRange: 30, moveSpeed: 0.34,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.9
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.16)
              const c = Math.floor(ctx.phaseTime() * 2) % 5
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 88), r: 4.5, color: c, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + Math.PI, speed: spdOf(ctx, 88), r: 4.5, color: c, kind: 'orb' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.6); ctx.aimed(3, 0.18, { speed: 124, r: 4, color: 1 }) }
          },
        },
        {
          name: '火符「アグニシャイン」', hp: 1000, timeLimit: 50, move: 'sine', moveRange: 30, moveSpeed: 0.34, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.35
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 二重渦の腕が固体壁にならないよう発射間隔を確保
              s.a1 = ivOf(ctx, 0.15)
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 92), r: 4.5, color: 0, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: -s.ang + 0.8, speed: spdOf(ctx, 92), r: 4.5, color: 1, kind: 'orb' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.0); ctx.ring(12, { speed: 72, r: 4, color: 0, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '水符「プリンセスウンディネ」', hp: 1120, timeLimit: 55, move: 'sine', moveRange: 30, moveSpeed: 0.34, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.13)
              const a = DOWN + Math.sin(ctx.phaseTime() * 1.3) * 0.55
              ctx.spawn({ x: ctx.bossX() - 12, y: ctx.bossY() + 4, angle: a, speed: spdOf(ctx, 62), r: 7, color: 4, kind: 'bubble' })
              ctx.spawn({ x: ctx.bossX() + 12, y: ctx.bossY() + 4, angle: a + 0.24, speed: spdOf(ctx, 62), r: 7, color: 4, kind: 'bubble' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.8); ctx.ring(14, { speed: 66, r: 5, color: 4, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '金符「メタルファティーグ」', hp: 1350, timeLimit: 55, move: 'sine', moveRange: 30, moveSpeed: 0.34, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 0.9
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.15); ctx.aimed(7, 0.5, { speed: 150, r: 4, color: 7, kind: 'knife' }) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 0.38); ctx.aimed(1, 0, { speed: 168, r: 4, color: 7, kind: 'knife' }) }
            if (s.a3 <= 0) {
              s.a3 = ivOf(ctx, 0.3)
              for (let k = 0; k < 4; k++) {
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + (k * Math.PI) / 2,
                  speed: spdOf(ctx, 80), r: 4, color: 7, kind: 'knife',
                })
              }
            }
          },
        },
      ],
    }
    case 'sakuya': return {
      id, name: '十六夜咲夜', epithet: '紅魔館のメイド', radius: 22, figure: BOSS_FIGURES.sakuya,
      phases: [
        {
          name: null, hp: 680, timeLimit: 45, move: 'teleport', moveRange: 85, moveSpeed: 0.56, params: { interval: 3.9 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.85); ctx.aimed(5, 0.14, { speed: 165, r: 4, color: 7, kind: 'knife' }) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.4); ctx.ring(10, { speed: 95, r: 4, color: 5, kind: 'knife', angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '幻符「キリングドール」', hp: 1150, timeLimit: 55, move: 'teleport', moveRange: 85, moveSpeed: 0.56, params: { interval: 3.9 }, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.5); ctx.ring(16, { speed: 100, r: 4, color: 7, kind: 'knife', angle: Math.random() * Math.PI * 2 }) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 0.85); ctx.aimed(3, 0.12, { speed: 176, r: 4, color: 7, kind: 'knife' }) }
          },
        },
        {
          name: '時符「ルナクロック」', hp: 1450, timeLimit: 60, move: 'sine', moveRange: 85, moveSpeed: 0.56, ...BONUS,
          template: 'timestop',
          // 波の間隔が短すぎると凍結ナイフが同心円の壁になり、再加速も絶え間なく追尾して
          // 抜け道が消えるため、原作のリズム（溜めて→止めて→一斉再加速）に寄せて間隔を空ける
          params: { interval: 1.5, count: 14, speed: 122, travel: 0.6, freeze: 1.2, resumeSpeed: 128, color: 5 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a2 -= dt
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.2); ctx.aimed(3, 0.1, { speed: 168, r: 4, color: 7, kind: 'knife' }) }
          },
        },
      ],
    }
    case 'remilia': return {
      id, name: 'レミリア・スカーレット', epithet: '永遠に紅い幼き月', radius: 22, figure: BOSS_FIGURES.remilia,
      phases: [
        {
          name: null, hp: 760, timeLimit: 45, move: 'sine', moveRange: 130, moveSpeed: 0.67,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.0); ctx.aimed(3, 0.16, { speed: 130, r: 4, color: 0 }) }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.5)
              ctx.ring(12, { speed: 70, r: 4.5, color: 0, angle: Math.random() * Math.PI * 2 })
              ctx.ring(12, { speed: 92, r: 4.5, color: 7, angle: Math.random() * Math.PI * 2 })
            }
          },
        },
        {
          name: '紅符「スカーレットシュート」', hp: 1250, timeLimit: 55, move: 'sine', moveRange: 130, moveSpeed: 0.67, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.32)
              s.a3 += 1
              if (s.a3 % 5 === 0) ctx.aimed(3, 0.15, { speed: 182, r: 4.5, color: 0 })
              else ctx.aimed(1, 0.05, { speed: 188, r: 4.5, color: 0 })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.4); ctx.ring(14, { speed: 78, r: 4, color: 0, angle: Math.random() * Math.PI * 2 }) }
          },
        },
        {
          name: '夜符「スカーレットミスト」', hp: 1400, timeLimit: 60, move: 'sine', moveRange: 130, moveSpeed: 0.67, ...BONUS,
          // 霧弾はテンプレート（減衰で失速し画面に滞留）だと膨らんだ泡が幕になって
          // 隙間が消えるため、自前実装にする：常に下へ流れ続ける扇状の霧＋帯の休止で
          // 「常時どこかに抜け道がある」状態を保つ
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.34)
              s.a3 += 1
              if (s.a3 % 4 !== 0) { // 4回に1回は休止し、霧の帯の間に横の抜け道を作る
                const bx = ctx.bossX(), by = ctx.bossY() + 6
                for (let i = 0; i < 5; i++) {
                  const off = (i - 2) * 0.42 + (Math.random() - 0.5) * 0.14
                  ctx.spawn({
                    x: bx + (Math.random() - 0.5) * 26, y: by,
                    angle: DOWN + off, speed: spdOf(ctx, 56 + Math.random() * 18),
                    r: 6, color: 0, kind: 'bubble', grow: 3.2, maxR: 11, ay: 10,
                  })
                }
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.9); ctx.aimed(5, 0.16, { speed: 128, r: 4, color: 0 }) }
          },
        },
        {
          name: '神術「吸血鬼幻想」', hp: 1750, timeLimit: 65, move: 'drift', moveRange: 130, moveSpeed: 1.15, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.2
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.5)
              for (let i = -1; i <= 1; i++) {
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY() + 4, angle: DOWN + i * 0.5,
                  speed: spdOf(ctx, 108), r: 5, color: 0, kind: 'ellipse', curve: i * 0.75,
                })
              }
            }
            if (s.a2 <= 0) {
              // 二方向渦の弾間隔（88×0.15≒13px）が当たり判定直径とほぼ同じで腕が壁化していたため、
              // 間隔を広げて腕を横切れる抜け道を作る
              s.a2 = ivOf(ctx, 0.24)
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 88), r: 4.5, color: 6, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + Math.PI, speed: spdOf(ctx, 88), r: 4.5, color: 6, kind: 'orb' })
            }
            if (s.a3 <= 0) {
              s.a3 = ivOf(ctx, 2.7)
              // 蝙蝠の群れが自機へ突進する（吸血鬼幻想の核：蝙蝠化と突進）
              const bx = ctx.bossX(), by = ctx.bossY()
              const base = Math.atan2(ctx.player.y - by, ctx.player.x - bx)
              const perp = base + Math.PI / 2
              for (let i = 0; i < 6; i++) {
                const off = (i - 2.5) * 15
                ctx.spawn({
                  x: bx + Math.cos(perp) * off, y: by + Math.sin(perp) * off,
                  angle: base + (i - 2.5) * 0.06, speed: spdOf(ctx, 148),
                  r: 4.5, color: 6, kind: 'ellipse', curve: (i % 2 === 0 ? 1 : -1) * 0.45,
                })
              }
            }
          },
        },
      ],
    }
    case 'flandre': return {
      id, name: 'フランドール・スカーレット', epithet: '悪魔の妹', radius: 22, figure: BOSS_FIGURES.flandre,
      phases: [
        {
          name: null, hp: 820, timeLimit: 45, move: 'sine', moveRange: 100, moveSpeed: 0.56,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.3
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.5); ctx.aimed(3, 0.18, { speed: 126, r: 4.5, color: 0 }) }
            if (s.a2 <= 0) {
              // 渦の弾間隔が当たり判定直径未満で腕が壁化していたため間隔を確保
              s.a2 = ivOf(ctx, 0.17)
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 86), r: 4.5, color: 6, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + Math.PI, speed: spdOf(ctx, 86), r: 4.5, color: 0, kind: 'orb' })
            }
          },
        },
        {
          name: '禁忌「フォーオブアカインド」', hp: 1500, timeLimit: 60, move: 'still', ...BONUS,
          setup: foakSetup,
          update: foakUpdate,
          teardown: foakTeardown,
        },
        {
          name: '禁忌「レーヴァテイン」', hp: 1700, timeLimit: 60, move: 'sine', moveRange: 80, moveSpeed: 0.44, ...BONUS,
          setup: lvSetup,
          teardown: lvTeardown,
          update: (ctx, dt) => {
            lvUpdate(ctx, dt)
            const s = phaseState(ctx)
            s.a2 -= dt
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 0.9); ctx.aimed(1, 0, { speed: 120, r: 4, color: 1 }) }
          },
        },
        {
          name: '禁忌「カゴメカゴメ」', hp: 2050, timeLimit: 70, move: 'sine', moveRange: 120, moveSpeed: 0.78, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.1
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.46); ctx.aimed(5, 0.18, { speed: 132, r: 4.5, color: 6 }) }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 0.13)
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 84), r: 4, color: 0, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: -s.ang + 2.1, speed: spdOf(ctx, 84), r: 4, color: 3, kind: 'orb' })
            }
            if (s.a3 <= 0) {
              s.a3 = ivOf(ctx, 3.2)
              // 自機を囲う檻（カゴメカゴメの核）：自機中心の二重リングが内側へ閉じる
              const cx = ctx.player.x, cy = ctx.player.y
              const n = cntOf(ctx, 22)
              const R = 128
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                ctx.spawn({
                  x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R,
                  angle: a + Math.PI, speed: spdOf(ctx, 54), r: 4, color: 5, kind: 'orb',
                })
                const a2 = a + Math.PI / n
                ctx.spawn({
                  x: cx + Math.cos(a2) * (R + 16), y: cy + Math.sin(a2) * (R + 16),
                  angle: a2 + Math.PI + 0.38, speed: spdOf(ctx, 50), r: 4, color: 6, kind: 'orb',
                })
              }
            }
          },
        },
      ],
    }
  }
}

// フェイズごとの作業変数（acc/angle）の置き場。
// BossContext からは現在のフェイズ定義を辿れないため、 finBoss が各フェイズの
// setup/update をラップし、実行中のフェイズの state を activePhaseState に差し替える。
// ボスと中ボスは同時には存在しないので、この共有方式で衝突しない。
type PhaseState = { a1: number; a2: number; a3: number; ang: number }
let activePhaseState: PhaseState = { a1: 0, a2: 0, a3: 0, ang: 0 }
function phaseState(_ctx: BossContext): PhaseState {
  return activePhaseState
}
/** フェイズごとに独立した作業変数を持たせ、開始時にリセットする */
function finBoss(def: BossDef): BossDef {
  for (const ph of def.phases) {
    const st: PhaseState = { a1: 0, a2: 0, a3: 0, ang: 0 }
    const origSetup = ph.setup
    ph.setup = (ctx) => {
      st.a1 = 0; st.a2 = 0; st.a3 = 0; st.ang = 0
      activePhaseState = st
      if (origSetup) origSetup(ctx)
    }
    const origUpdate = ph.update
    if (origUpdate) {
      ph.update = (ctx, dt) => {
        activePhaseState = st
        origUpdate(ctx, dt)
      }
    }
  }
  return def
}
function makeBossDef(id: BossId): BossDef {
  return finBoss(buildBossDef(id))
}

// ===== フォーオブアカインド専用状態（原作挙動：固定フォーメーション分身） =====
// 4体が画面上部のフォーメーションに展開し、全分身に当たり判定（HP共有）。
// 一定時間ごとにフォーメーションを変えて再配置する。
type FoakState = {
  bodies: BossBody[]
  from: { x: number; y: number }[]
  to: { x: number; y: number }[]
  glideT: number
  reposT: number
  pattern: number
  aimedT: number
  ringT: number
}
let foak: FoakState | null = null
const FOAK_PATTERNS: { x: number; y: number }[][] = [
  // 弧状（両端が手前）
  [{ x: 0.16, y: 0.19 }, { x: 0.38, y: 0.155 }, { x: 0.62, y: 0.155 }, { x: 0.84, y: 0.19 }],
  // 一直線
  [{ x: 0.14, y: 0.165 }, { x: 0.38, y: 0.165 }, { x: 0.62, y: 0.165 }, { x: 0.86, y: 0.165 }],
  // 菱形寄り（1体が奥、2体が両翼、1体が手前）
  [{ x: 0.5, y: 0.12 }, { x: 0.2, y: 0.21 }, { x: 0.8, y: 0.21 }, { x: 0.5, y: 0.26 }],
]
function foakSlots(pattern: number): { x: number; y: number }[] {
  return FOAK_PATTERNS[pattern % FOAK_PATTERNS.length].map(p => ({ x: p.x * FW, y: p.y * FH }))
}
function foakSetup(ctx: BossContext) {
  const slots = foakSlots(0)
  const bodies: BossBody[] = slots.map(s => ({ x: s.x, y: s.y, real: true, radius: 20, visible: true }))
  foak = {
    bodies,
    from: slots.map(s => ({ ...s })),
    to: slots.map(s => ({ ...s })),
    glideT: 0, reposT: 4.2, pattern: 0, aimedT: 1.6, ringT: 2.8,
  }
  bodies.forEach((b, i) => {
    const sp = new SpiralEmitter()
    sp.arms = 1
    sp.angle = (i / bodies.length) * Math.PI * 2
    sp.angleVel = i % 2 === 0 ? 1.7 : -1.7
    sp.interval = 0.19 / ctx.diff.den
    sp.bullet = { speed: 82 * ctx.diff.spd, r: 4, color: 0, kind: 'orb' }
    ctx.addEmitterAt(sp, () => ({ x: b.x, y: b.y }))
  })
  ctx.setBodies(bodies)
  ctx.setRealOnlyDamage(false) // 全分身に当たり判定あり（HP共有）
}
function foakUpdate(ctx: BossContext, dt: number) {
  const f = foak
  if (!f) return
  // 定期再配置：フォーメーションを変え、割り当てをシャッフルして滑らかに移動
  f.reposT -= dt
  if (f.reposT <= 0) {
    f.reposT = 4.2
    f.pattern = (f.pattern + 1 + Math.floor(Math.random() * (FOAK_PATTERNS.length - 1))) % FOAK_PATTERNS.length
    const slots = foakSlots(f.pattern)
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
    f.from = f.bodies.map(b => ({ x: b.x, y: b.y }))
    f.to = order.map(i => slots[i])
    f.glideT = 0.55
  }
  if (f.glideT > 0) {
    f.glideT = Math.max(0, f.glideT - dt)
    const p = 1 - f.glideT / 0.55
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
    f.bodies.forEach((b, i) => {
      b.x = f.from[i].x + (f.to[i].x - f.from[i].x) * e
      b.y = f.from[i].y + (f.to[i].y - f.from[i].y) * e
    })
  }
  // 各分身からの狙撃
  f.aimedT -= dt
  if (f.aimedT <= 0) {
    f.aimedT = 2.4 / ctx.diff.den
    for (const b of f.bodies) {
      const a = Math.atan2(ctx.player.y - b.y, ctx.player.x - b.x)
      ctx.spawn({ x: b.x, y: b.y + 4, angle: a, speed: 118 * ctx.diff.spd, r: 4, color: 5, kind: 'orb' })
    }
  }
  // いずれかの分身からのリング
  f.ringT -= dt
  if (f.ringT <= 0) {
    f.ringT = 3.4 / ctx.diff.den
    const b = f.bodies[Math.floor(Math.random() * f.bodies.length)]
    const n = Math.max(3, Math.round(14 * ctx.diff.den))
    const off = Math.random() * Math.PI * 2
    for (let i = 0; i < n; i++) {
      ctx.spawn({ x: b.x, y: b.y, angle: off + (i / n) * Math.PI * 2, speed: 64 * ctx.diff.spd, r: 4, color: 6, kind: 'orb' })
    }
  }
  ctx.setBodies(f.bodies)
}
function foakTeardown(ctx: BossContext) {
  foak = null
  ctx.setBodies([])
  ctx.setRealOnlyDamage(false)
}

// ===== レーヴァテイン専用状態（原作挙動：巨大剣レーザーの大振りスイング） =====
// 構え（予告）→大角度の薙ぎ払い→間（ポーズ）を、向きを交互に変えて繰り返す。
type LvState = {
  laser: Laser | null
  t: number
  dir: 1 | -1
}
let lv: LvState | null = null
const LV_PAUSE = 0.85 // 間（ポーズ）
const LV_TELE = 0.7 // 構え（予告線）
const LV_SWING = 1.6 // スイング時間
const LV_CYCLE = LV_PAUSE + LV_TELE + LV_SWING + 0.35
function lvSetup(_ctx: BossContext) {
  lv = { laser: null, t: 0, dir: 1 }
}
function lvUpdate(ctx: BossContext, dt: number) {
  const s = lv
  if (!s) return
  s.t += dt
  const from = DOWN + s.dir * 1.8
  const to = DOWN - s.dir * 1.8
  if (s.t >= LV_PAUSE && !s.laser) {
    // 構え：フランドールを支点に巨大な剣（太いレーザー）を予告線つきで出現させる
    s.laser = ctx.addLaser({
      x: ctx.bossX(), y: ctx.bossY(),
      angle: from, length: 700, width: 36, color: 0,
      telegraph: LV_TELE, duration: LV_SWING + 0.1, fade: 0.25,
      follow: () => ({ x: ctx.bossX(), y: ctx.bossY() }),
    })
  }
  if (s.laser && s.t >= LV_PAUSE + LV_TELE && s.laser.active) {
    // 大振りのスイング：キュービックイージングで緩急をつける
    const p = Math.min(1, (s.t - LV_PAUSE - LV_TELE) / LV_SWING)
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    s.laser.angle = from + (to - from) * e
  }
  if (s.t >= LV_CYCLE) {
    s.t = 0
    s.dir = (s.dir * -1) as 1 | -1
    s.laser = null
  }
}
function lvTeardown(_ctx: BossContext) {
  lv = null
}

// ===== 中ボス定義（単一フェイズの BossDef として表現） =====
function makeMidDef(id: MidId, name: string, stageIdx: number): BossDef {
  const hp = 650 + stageIdx * 90
  const base = {
    id: `mid-${id}`, name, radius: 20, figure: MID_FIGURES[id],
  }
  const phase = (
    update: (ctx: BossContext, dt: number) => void,
  ): BossDef['phases'][number] => ({
    name: null, hp, timeLimit: 22, move: 'sine', moveRange: 95, moveSpeed: 0.78, update,
  })
  switch (id) {
    case 'rumia': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.2); ctx.aimed(3, 0.2, { speed: 118, r: 4, color: 0 }) }
      })],
    })
    case 'daiyousei': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.6); ctx.ring(10, { speed: 72, r: 4, color: 3, angle: Math.random() * Math.PI * 2 }) }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.1); ctx.aimed(1, 0, { speed: 115, r: 4, color: 4 }) }
      })],
    })
    case 'meiling': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.95); ctx.aimed(5, 0.16, { speed: 112, r: 4, color: Math.floor(ctx.phaseTime()) % 8 }) }
      })],
    })
    case 'koakuma': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.8); ctx.aimed(2, 0.12, { speed: 126, r: 4, color: 6 }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 2.4)
          for (let k = 0; k < 4; k++) {
            ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + (k * Math.PI) / 2, speed: spdOf(ctx, 84), r: 4, color: 6 })
          }
          s.ang += 0.4
        }
      })],
    })
    case 'sakuya': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.9); ctx.aimed(3, 0.14, { speed: 162, r: 4, color: 7, kind: 'knife' }) }
      })],
    })
    case 'patchouli': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.ang += dt * 1.6
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 0.16)
          ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 88), r: 4, color: Math.floor(ctx.phaseTime() * 2) % 5 })
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.7); ctx.aimed(3, 0.18, { speed: 122, r: 4, color: 1 }) }
      })],
    })
  }
}

// ボスの表示名（ステージカード／情報パネル用）
const BOSS_META: Record<BossId, { name: string; epithet: string }> = {
  rumia: { name: 'ルーミア', epithet: '宵闇の妖怪' },
  cirno: { name: 'チルノ', epithet: '湖上の氷精' },
  meiling: { name: '紅美鈴', epithet: '華人小娘' },
  patchouli: { name: 'パチュリー・ノーレッジ', epithet: '知識と日陰の少女' },
  sakuya: { name: '十六夜咲夜', epithet: '紅魔館のメイド' },
  remilia: { name: 'レミリア・スカーレット', epithet: '永遠に紅い幼き月' },
  flandre: { name: 'フランドール・スカーレット', epithet: '悪魔の妹' },
}

// ===== 会話シーン（ボス戦前／撃破後） =====
// 台詞は原作の書き起こしではなく、キャラの口調と場面構成（遭遇→掛け合い→戦闘開始）に
// 寄せた自作文。自機（霊夢／魔理沙）で分岐し、ボス側の応答も自機に合わせて変えている。
// w: 'p' = 自機, 'b' = ボス
type DLine = { w: 'p' | 'b'; t: string }
type DlgScript = { pre: DLine[]; post: DLine[] }
const dl = (w: 'p' | 'b', t: string): DLine => ({ w, t })
const DIALOGUES: Record<BossId, Record<CharaId, DlgScript>> = {
  rumia: {
    reimu: {
      pre: [
        dl('b', 'わー、真っ暗。……あれ、人間？'),
        dl('p', 'こんな霧の中で、よく平気で飛んでられるわね。'),
        dl('b', '私は暗い方が好きだもん。そっちこそ、霧で何も見えないのに大丈夫？'),
        dl('p', '大丈夫じゃないから来たの。この紅い霧、幻想郷中を覆ってるのよ。'),
        dl('b', 'ふーん。で、私が怪しいって？'),
        dl('p', '暗闇を操る妖怪が霧の中をうろうろしてたら、そりゃ疑うわ。'),
        dl('b', 'ひどいなー。私はお散歩してただけだよ？ あと、お腹が空いたから獲物を探してただけ。'),
        dl('p', '……その獲物って、まさか私じゃないでしょうね。'),
        dl('b', 'えへへ、人間っておいしいの？'),
        dl('p', '食べたら祟るわよ。ほら、さっさとどきなさい。先を急ぐの。'),
        dl('b', 'やだ。せっかく目の前にご飯……じゃなくて、お客さんが来たんだもん。'),
        dl('p', '話が通じないわね。なら、実力でどいてもらうわ。'),
        dl('b', 'わーい、遊んでくれるんだ！ じゃあ私も本気出しちゃおうかなー。'),
        dl('p', '遊びじゃないって言ってるのに……。もう、行くわよ！'),
      ],
      post: [
        dl('b', 'あいたたた……もうお腹いっぱい。弾幕でお腹いっぱいになるとは思わなかったよ。'),
        dl('p', 'だから言ったじゃない。私は食べ物じゃないの。'),
        dl('b', 'ねえねえ、霧の出どころなら、あっちの湖の向こうだよ。大きなお屋敷があるの。'),
        dl('p', '最初からそう言えば、こんなことにならなかったのに。'),
        dl('b', 'だって、その方が楽しいじゃない。……あ、でも私はもう寝る。おやすみー。'),
        dl('p', 'まったく、調子のいい妖怪ね。……湖の向こう、か。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'あれー？ 人間がこんな所に来るなんて珍しいね。'),
        dl('p', 'お、暗闇の妖怪か。ちょうどいい、この霧について聞きたいことがあるんだぜ。'),
        dl('b', '霧？ 知らないなー。私はただ、お腹が空いて飛んでただけだよ。'),
        dl('p', 'へえ。じゃあ、その「お腹が空いた」ってのは、私を見て言ってるのか？'),
        dl('b', 'えへへ、ばれた？ 人間って、食べると元気になるんでしょ？'),
        dl('p', '残念だが、私は硬くてまずいぜ。それより、霧の出どころを知らないか？'),
        dl('b', '知ってても、タダじゃ教えないもん。遊んでくれたら考えてあげる。'),
        dl('p', 'ほう、弾幕で遊ぼうってのか。いいぜ、望むところだ。'),
        dl('b', 'わーい！ じゃあ、暗くしてあげるね。何も見えなくなっちゃえー。'),
        dl('p', '私の魔法は光るからな。暗闇なんて関係ないぜ。'),
        dl('b', 'へえ、面白そう。じゃあ本気でいっちゃおうかな。'),
        dl('p', '来いよ。霧の手がかり、勝って聞き出すぜ！'),
      ],
      post: [
        dl('b', 'うぅ……目が回るー。光る弾幕、眩しすぎだよー。'),
        dl('p', '暗闇が得意な奴に、光は天敵だな。で、霧の出どころは？'),
        dl('b', '湖の向こうのお屋敷だよ。あそこから霧が出てるの、私も見たもん。'),
        dl('p', '最初から素直に言えば痛い目を見ずに済んだのにな。'),
        dl('b', 'でも、楽しかったからいいの。私は寝るね、おやすみー。'),
        dl('p', '寝るのかよ……。まあいい、湖の向こうだな。急ぐぜ。'),
      ],
    },
  },
  cirno: {
    reimu: {
      pre: [
        dl('b', 'あたいの湖にようこそ！ ……って、あんた誰？'),
        dl('p', '紅い霧の出どころを探してるの。湖の向こうの館が怪しいと思ってね。'),
        dl('b', 'ふーん。でも、ここはあたいの縄張りだよ。通過料、払っていきな！'),
        dl('p', '通過料？ 生憎と、お賽銭以外は持ち歩かない主義なの。'),
        dl('b', 'じゃあ、力ずくで通るって？ あたい、最強なんだからね！'),
        dl('p', '最強ねぇ。氷の妖精が、この程度の霧ごときに勝てるのかしら。'),
        dl('b', '霧なんて、あたいが凍らせてやるもん！ ついでにあんたもカチコチだよ！'),
        dl('p', 'あら怖い。でも、溶けたらどうするの？ 夏は暑いわよ。'),
        dl('b', 'うっ……そ、それでもあたいは最強なの！ 文句があるなら掛かってきな！'),
        dl('p', 'はいはい。じゃあ、その自信が本物か試してあげる。'),
        dl('b', 'やってやるー！ あたいの本気、見てなさい！'),
        dl('p', 'ほどほどにね。凍傷にはなりたくないから。'),
      ],
      post: [
        dl('b', 'うぅ……あたいが負けるなんて……。でも次は勝つもん！'),
        dl('p', 'はいはい、その意気やよし。ほら、通してくれる？'),
        dl('b', '約束だからね。あ、でも館の奴ら、あたいより強いよ？ 知らないからね！'),
        dl('p', '忠告ありがとう。あんたは湖で大人しくしてなさい。'),
        dl('b', 'むー……あたい、特訓する！ 待ってなさいよー！'),
        dl('p', 'ふふ、元気なのはいいことね。さて、館はもうすぐそこか。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', '止まれー！ ここから先は、あたいの湖だよ！'),
        dl('p', 'おお、氷の妖精じゃないか。元気そうだな、チルノ。'),
        dl('b', '知ってるの？ ……まあ、あたい有名だからね！ で、何しに来たの？'),
        dl('p', '紅い霧の出どころを探してる。湖の向こうの館だと思うんだが。'),
        dl('b', 'ふーん。でもね、タダでは通さないよ。あたいと勝負しな！'),
        dl('p', '勝負ね。負けたら素直に通してくれるのか？'),
        dl('b', 'あたいが負けるわけないもん！ あたい最強だし！'),
        dl('p', 'その自信、嫌いじゃないぜ。だが最強は一人だけだと思うんだよな。'),
        dl('b', 'なに言ってるの、あたいが最強に決まってるでしょ！'),
        dl('p', 'じゃあ決着をつけようぜ。最強の称号は、勝った方のものだ。'),
        dl('b', 'やってやる！ 凍てつくあたいの力、思い知りなさい！'),
        dl('p', '望むところだぜ。いくぞ、チルノ！'),
      ],
      post: [
        dl('b', 'ひどーい……あたいの氷、ぜんぶ溶けちゃった……。'),
        dl('p', '悪いな。火力ならこっちが上だったみたいだぜ。'),
        dl('b', '約束だから通してあげる。でも、館の連中はあたいより強いよ！'),
        dl('p', 'そうか、忠告感謝するぜ。……って、おい、もう立ち直ったのか？'),
        dl('b', 'あたいは最強だからね！ 次に会うときは負けないんだから！'),
        dl('p', 'はは、その調子だ。じゃあな、チルノ。館に行ってくるぜ。'),
      ],
    },
  },
  meiling: {
    reimu: {
      pre: [
        dl('b', 'はい止まって！ ここは紅魔館の門。関係者以外は通れません！'),
        dl('p', 'やっぱりこの館が霧の出どころなのね。通してもらうわよ。'),
        dl('b', 'だめです！ 門番として、それは聞けません。……むにゃ。'),
        dl('p', 'ちょっと、今うとうとしてたでしょう。'),
        dl('b', 'し、してません！ 私は紅美鈴、眠らない門番です！'),
        dl('p', '目が泳いでるわよ。……まあいいわ、寝てる間に通らせてもらうから。'),
        dl('b', 'それは困ります！ お嬢様に怒られちゃう……いえ、門番の誇りにかけて！'),
        dl('p', '誇りねぇ。居眠り門番の誇りって、いくらするのかしら。'),
        dl('b', 'うぅ、言い返せない……。でも、通すわけにはいかないんです！'),
        dl('p', 'なら仕方ないわね。実力で通らせてもらうわ。'),
        dl('b', '華符の腕前、侮らないでくださいね。いきますよ！'),
        dl('p', 'ええ、受けて立つわ。手加減はしないから。'),
      ],
      post: [
        dl('b', 'あいたた……やっぱり強いですね、巫女さん。'),
        dl('p', 'あんたも、寝起きの割にはやるじゃない。さ、通してくれる？'),
        dl('b', '約束ですから……。でも、中の皆さんはもっと手強いですよ。'),
        dl('p', '分かってるわ。ところで、館の主はどんな奴なの？'),
        dl('b', 'お嬢様は、気まぐれで、強くて、ちょっと退屈してる……そんな方です。'),
        dl('p', '退屈しのぎに異変を起こすタイプか。面倒な相手ね。'),
        dl('b', 'はは……頑張ってください。私は少し、休憩します……むにゃ。'),
        dl('p', '結局寝るんかい。……まあ、ゆっくり休みなさい。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'こらー！ そこの黒いの、止まりなさい！ ここは紅魔館です！'),
        dl('p', 'お、門番か。悪いな、私はこの館に用があるんだ。通してくれ。'),
        dl('b', '用って、まさか霧のことですか？ それなら尚更通せません！'),
        dl('p', 'やっぱりこの館が出どころか。答えてくれてありがとうな。'),
        dl('b', 'あっ、しまった……。い、いえ！ 何も言ってません！'),
        dl('p', '遅いぜ。さて、どうやって通ろうかな。力ずくが早そうだな。'),
        dl('b', '門番を舐めないでください！ 私だって、起きてるときは強いんです！'),
        dl('p', '起きてるときは、か。今はどうなんだ？'),
        dl('b', '今は……絶好調です！ たぶん！ ほら、構えてください！'),
        dl('p', 'はは、面白い奴だな。じゃあ遠慮なく行くぜ！'),
        dl('b', '受けて立ちます！ 紅魔館の門は、私が守る！'),
        dl('p', 'その意気だ。門番の力、見せてもらうぜ。'),
      ],
      post: [
        dl('b', 'うぅ……負けちゃいました。門番失格ですね……。'),
        dl('p', 'なに、いい戦いだったぜ。ほら、約束通り通してくれよな。'),
        dl('b', 'はい……。でも館の中は迷路みたいですから、気をつけて。'),
        dl('p', '迷路か。まあ、まっすぐ進めば何とかなるだろ。'),
        dl('b', 'あと、図書館には近づきすぎない方が……あ、もう行っちゃった。'),
        dl('p', '忠告は聞いたぜ。じゃあな、美鈴。いい夢見ろよ。'),
      ],
    },
  },
  patchouli: {
    reimu: {
      pre: [
        dl('b', '……図書館に何の用？ 本を借りるなら、まず手続きをして。'),
        dl('p', '生憎、読書に来たんじゃないの。この館から出てる紅い霧について聞きたいの。'),
        dl('b', '霧なら、レミィの仕業よ。日差しが嫌で、館ごと覆ってるの。'),
        dl('p', 'あっさり教えてくれるのね。じゃあ、そのレミィとやらに会わせて。'),
        dl('b', 'だめ。彼女、今は機嫌がいいの。邪魔したら、私が怒られる。'),
        dl('p', '怒られるのが嫌なら、霧を止めるよう言ってくれればいいのに。'),
        dl('b', '言っても聞かないわよ、あの子は。……だから、あなたをここで止める。'),
        dl('p', '本の虫が、腕まくりして出てくるなんてね。珍しいこともあるものだわ。'),
        dl('b', '私だって魔法使い。知識は力よ。……げほっ。'),
        dl('p', '体調が悪そうね。無理しない方がいいんじゃない？'),
        dl('b', 'これくらい、いつものこと。……さあ、図書館で暴れるなら、相応の覚悟をして。'),
        dl('p', 'ええ。でも、本は傷つけないよう気をつけるわ。'),
        dl('b', 'それは助かる。……じゃあ、始めるわよ。'),
        dl('p', '行くわ、パチュリー。'),
      ],
      post: [
        dl('b', 'げほっ、げほっ……負けたわ。あなたの弾幕、予想以上ね。'),
        dl('p', 'だから言ったのに。ほら、水でも飲んで休みなさい。'),
        dl('b', 'ありがとう。……レミィは最上階よ。咲夜が途中で止めるでしょうけど。'),
        dl('p', '咲夜？ あのメイドね。……分かった、ありがとう。'),
        dl('b', '礼には及ばないわ。ただ、あの子をあまり困らせないで。退屈してるだけなんだから。'),
        dl('p', '退屈しのぎに付き合わされるこっちの身にもなってほしいわね。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', '……あら、珍しいお客さん。でも、図書館は静かにが鉄則よ。'),
        dl('p', 'おう、魔理沙だ。本を借りに来た……と言いたいところだが、今日は霧の件だ。'),
        dl('b', '霧はレミィの仕業。……それより、あなた、前に本を持ち出そうとしたでしょう。'),
        dl('p', '人聞きの悪い。死ぬまで借りてるだけだぜ。'),
        dl('b', 'それを世間では窃盗と言うの。……まあ、今日は霧の用件だけ？'),
        dl('p', 'ああ。館の主に会いたい。霧を止めさせないと、幻想郷中が困るんだ。'),
        dl('b', '会わせるわけにはいかないわ。彼女の退屈しのぎに付き合うのは、私の役目でもあるの。'),
        dl('p', 'へえ、友達思いじゃないか。じゃあ、あんたを倒して進むしかないな。'),
        dl('b', '魔法使い同士、話が早くて助かるわ。……げほっ、げほっ。'),
        dl('p', 'おいおい、その体で大丈夫か？ 手加減した方がいいか？'),
        dl('b', '余計なお世話。知識の差を見せてあげるわ。'),
        dl('p', 'いいぜ。私の火力と、あんたの知識、どっちが上か決めよう！'),
      ],
      post: [
        dl('b', '……負けたわ。火力一点突破に弱いのは、課題ね。げほっ。'),
        dl('p', 'はは、悪かったな。でも、あんたの魔法も多彩で面白かったぜ。'),
        dl('b', 'お世辞でも嬉しいわ。……レミィは最上階。咲夜が案内……はしないでしょうね。'),
        dl('p', '咲夜ってメイドか。また戦うことになりそうだな。'),
        dl('b', 'ええ、彼女は強いわよ。……あと、私の本、勝手に持っていかないでね。'),
        dl('p', 'へいへい。……1冊くらい、いいだろ？'),
        dl('b', 'だめ。'),
        dl('p', 'ちっ、バレたか。じゃあ行くぜ、パチュリー。お大事にな。'),
      ],
    },
  },
  sakuya: {
    reimu: {
      pre: [
        dl('b', 'お嬢様の館へようこそ。……申し訳ありませんが、ここから先はお通しできません。'),
        dl('p', '丁寧な門前払いね。でも、霧を止めてもらわないと帰れないの。'),
        dl('b', '霧はお嬢様のお望みです。メイドの私が、それを覆すことはできません。'),
        dl('p', '主思いのいいメイドね。でも、幻想郷中が迷惑してるのよ。'),
        dl('b', '存じております。……ですが、お嬢様の退屈こそ、私たちにとって一番の問題でして。'),
        dl('p', '退屈しのぎに異変を起こす主と、それに付き合う従者。困った館ね。'),
        dl('b', 'お言葉ですが、お嬢様を侮辱することは許しません。'),
        dl('p', 'あら、怖い顔。じゃあ、力ずくで通るしかないわね。'),
        dl('b', 'ええ、その覚悟があるのなら。……時間を止めるまでもなく、片付けます。'),
        dl('p', '時間を止める？ へえ、面白い能力を持ってるのね。'),
        dl('b', 'すぐに分かりますわ。さあ、紅魔館のメイドの作法、ご覧に入れましょう。'),
        dl('p', '望むところよ。行くわ、咲夜！'),
      ],
      post: [
        dl('b', '……見事です。私の時間を、ここまでかわし切るとは。'),
        dl('p', 'ナイフの雨は冷や汗ものだったわ。さ、主のところへ案内して。'),
        dl('b', 'お約束ですから。……お嬢様、きっと喜ばれますわ。退屈が紛れると。'),
        dl('p', '喜ばれるのは複雑ね。でも、決着をつけに行くわ。'),
        dl('b', 'どうか、お手柔らかに。……いえ、あの方には不要な心配でしたね。'),
        dl('p', 'ふふ、いいメイドね、あんた。じゃあ行ってくるわ。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'あら、お客様。……ですが、生憎と今日は面会謝絶です。'),
        dl('p', '面会謝絶か。生憎と、こっちは押しかける気満々だぜ。'),
        dl('b', '霧の件ですね。お嬢様のお望みですので、止めるわけにはいきません。'),
        dl('p', '主の命令は絶対ってか。あんた、時間を操るんだってな。'),
        dl('b', 'どこでお聞きに？ ……ええ、多少は。お帰り頂くには十分な程度に。'),
        dl('p', 'へえ、時間を止めて追い返す気か。面白いじゃないか。'),
        dl('b', '面白い、で済めばよいのですが。ナイフも少々、添えさせて頂きます。'),
        dl('p', 'ナイフ投げメイドか。物騒でいいな、嫌いじゃないぜ。'),
        dl('b', '光栄です。では、紅魔館の流儀でおもてなしを。'),
        dl('p', '望むところだ。時間停止とやら、破ってみせるぜ！'),
        dl('b', 'ふふ、意気込みは買います。……いらっしゃい、霧雨魔理沙。'),
        dl('p', 'おう、行くぜ咲夜！ 全力で来い！'),
      ],
      post: [
        dl('b', '……お見事。止めた時間の中を、ここまで動かれるとは思いませんでした。'),
        dl('p', 'はは、速さなら負けないぜ。いい勝負だったな、咲夜。'),
        dl('b', 'ありがとうございます。……お嬢様は最上階でお待ちですわ。'),
        dl('p', '待ちか。退屈してるって話だし、歓迎されそうだな。'),
        dl('b', 'ええ、とても。どうか、よい「お茶会」を。'),
        dl('p', 'お茶会、ね。弾幕の、だけどな。行ってくるぜ。'),
      ],
    },
  },
  remilia: {
    reimu: {
      pre: [
        dl('b', 'ようこそ紅魔館へ。……あら、人間の巫女？ 珍しいお客さんね。'),
        dl('p', 'あんたがこの館の主ね。紅い霧、今すぐ止めてもらうわよ。'),
        dl('b', 'いきなりね。自己紹介もなし？ 私はレミリア・スカーレット。500年を生きる吸血鬼よ。'),
        dl('p', '博麗霊夢。幻想郷の巫女よ。で、霧の理由を聞かせて。'),
        dl('b', '理由は簡単。日差しが眩しいの。だから霧で空を覆ったのよ。'),
        dl('p', '……それだけ？ そのせいで幻想郷中が迷惑してるのよ。'),
        dl('b', '迷惑？ 私は快適よ。吸血鬼の都合も考えてほしいわ。'),
        dl('p', '自分勝手にも程があるわね。力ずくでも止めてもらうわ。'),
        dl('b', 'あら、怖い。でも退屈していたところなの。少しは楽しませてくれる？'),
        dl('p', '楽しませる気はないけど、後悔はさせてあげる。'),
        dl('b', 'ふふ、強気な人間は嫌いじゃないわ。運命は、私の味方をするの。'),
        dl('p', '運命ね。あんたの運命、今から書き換えてあげるわ。'),
        dl('b', 'いいわ、来なさい霊夢。紅い月夜の舞踏会、開演よ！'),
        dl('p', '行くわよ、レミリア！'),
      ],
      post: [
        dl('b', 'あらあら……負けちゃった。でも、楽しかったわ。'),
        dl('p', '楽しかった、じゃないの。約束通り、霧は止めてよね。'),
        dl('b', 'ええ、約束は約束。……でも、時々は遊びに来てくれてもいいのよ？'),
        dl('p', '異変を起こさないなら、考えてあげる。'),
        dl('b', 'ふふ、厳しい巫女さんね。……咲夜、お茶の用意をして。この人にも振る舞ってあげて。'),
        dl('p', 'あら、気が利くじゃない。じゃあ、一杯だけ頂こうかしら。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'あら、また人間？ 今日はお客さんが多い日ね。'),
        dl('p', '霧雨魔理沙だ。単刀直入に言うぜ、あの紅い霧を止めてくれ。'),
        dl('b', '止める？ 眩しい日差しを遮る、素敵な霧でしょう？ 私は気に入ってるわ。'),
        dl('p', 'あんたの快適のために、みんなが困ってるんだぜ。'),
        dl('b', 'みんな、ね。私、レミリア・スカーレットの前では、みんなも何もないわ。'),
        dl('p', '500年物の吸血鬼様は言うことが違うな。だが、聞き分けのない奴にはこれだ。'),
        dl('b', '弾幕で説得する気？ 野蛮ね。……でも、退屈していたのは本当よ。'),
        dl('p', '退屈ならちょうどいい。私が相手をしてやるぜ、全力でな。'),
        dl('b', 'ふふ、人間の分際で。運命の糸は、私が握っているのよ。'),
        dl('p', '運命ね。その糸、力ずくでちぎってやるぜ。'),
        dl('b', '面白いわ。来なさい、魔理沙。紅い夜に溺れさせてあげる。'),
        dl('p', '望むところだ！ いくぜ、レミリア！'),
      ],
      post: [
        dl('b', 'まさか、人間に負けるなんて……。でも、悪くない気分だわ。'),
        dl('p', 'どうだ、退屈は紛れたか？ 約束通り、霧は止めてくれよな。'),
        dl('b', 'ええ、止めるわ。吸血鬼は約束を守るものよ。……たぶん。'),
        dl('p', 'たぶん、は不安なんだが。まあ、また出したら懲らしめに来るぜ。'),
        dl('b', 'ふふ、それも悪くないわね。咲夜、お茶を。お客さんをもてなして。'),
        dl('p', 'お、気が利くな。一杯もらっていくぜ。'),
      ],
    },
  },
  flandre: {
    reimu: {
      pre: [
        dl('b', 'あら、お姉様じゃない人間が来た。ねえ、あなたは誰？'),
        dl('p', '博麗霊夢よ。あんたが、この地下室にいた吸血鬼の妹ね。'),
        dl('b', 'そう、フランドール。495年、ずっとここにいたの。ねえ、遊んでくれる？'),
        dl('p', '遊びね……。あんたの「遊び」は、物騒だと聞いてるけど。'),
        dl('b', 'だって、みんなすぐ壊れちゃうんだもん。丈夫な人間は久しぶり。'),
        dl('p', '壊れる前提で話すの、やめてくれない？'),
        dl('b', 'ねえねえ、あなたはどのくらい丈夫なの？ 試してもいい？'),
        dl('p', '試すのは勝手だけど、私は壊れる気はないわよ。'),
        dl('b', 'わーい！ じゃあ、壊れるまで遊ぼうね。たくさん、たくさん！'),
        dl('p', '……話が通じないのは姉妹そっくりね。仕方ない、相手をするわ。'),
        dl('b', 'ほんと？ やったぁ！ お姉様より強いといいなぁ。'),
        dl('p', '期待に応えられるかしらね。行くわよ、フランドール。'),
      ],
      post: [
        dl('b', 'あれ……負けちゃった。でも、壊れなかったね、あなた。'),
        dl('p', 'ええ、丈夫さだけは自信があるの。あんたこそ、大丈夫？'),
        dl('b', 'うん、平気。……ねえ、また遊びに来てくれる？'),
        dl('p', '暴れないって約束できるなら、考えてあげる。'),
        dl('b', '約束する！ ……たぶん。えへへ。'),
        dl('p', 'たぶん、か。まあ、今日のところは信じてあげるわ。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'わ、人間だ。人間がここまで来るなんて、珍しいね。'),
        dl('p', '霧雨魔理沙だ。あんたがレミリアの妹か。地下室暮らしは長いんだってな。'),
        dl('b', '495年だよ。ずっと一人。だから、遊び相手には困ってたの。'),
        dl('p', '遊び、ね。あんたの遊びは、周りが壊れるって噂だぜ。'),
        dl('b', '壊れるのが悪いんじゃない？ 私はそっと触ってるつもりだよ？'),
        dl('p', 'そっと、でそれか。……まあ、私は簡単には壊れないぜ。'),
        dl('b', 'ほんとに？ じゃあ、思いっきり遊んでもいいんだね！'),
        dl('p', 'ああ、来いよ。ただし、壊れたらあんたの負けだからな。'),
        dl('b', 'わーい！ 楽しい遊びにしようね。レーヴァテインも連れてくる！'),
        dl('p', 'おいおい、その剣は反則級だろ……。まあいい、全力で相手するぜ。'),
        dl('b', 'えへへ、いくよ魔理沙。495年分の退屈、今晴らすんだから！'),
        dl('p', '望むところだ。行くぜ、フランドール！'),
      ],
      post: [
        dl('b', 'あはは、楽しかった！ あなた、全然壊れないね。'),
        dl('p', 'はは、丈夫さには自信があるんだ。あんたも相当だったぜ。'),
        dl('b', 'ねえ、また来てくれる？ 次はもっと、すごい遊びを考えておくから。'),
        dl('p', '……考えものだな。でも、約束を守れるなら考えてやる。'),
        dl('b', 'やった！ じゃあ約束。指切りげんまん、だよ。'),
        dl('p', 'おう。……まったく、姉妹そろって退屈が過ぎるぜ。'),
      ],
    },
  },
}

// ===== ポートレート画像（自前生成イラスト） =====
// public/cdn/koumakyou/<id>.webp を自オリジン相対（BASE_URL基準）で参照し、
// SW の cdn/ キャッシュに乗せる。読み込み失敗時は呼び出し側が図形／文字の
// フォールバック表示に切り替えるため、画像が無くてもゲームは動作する。
const portraitUrl = (id: string): string => `${import.meta.env.BASE_URL}cdn/koumakyou/${id}.webp`

// ===== 道中ザコ敵の定義（難易度ごとに射撃間隔・弾速を調整） =====
function makeEnemyDefs(cfg: { spd: number; den: number }): { down: EnemyDef; side: EnemyDef; big: EnemyDef } {
  const fairyFire = (w: DanmakuWorld, e: { x: number; y: number }) => {
    if (e.y <= 10 || e.y >= FH - 120) return
    const a = Math.atan2(w.target.y - (e.y + 6), w.target.x - e.x)
    const n = cfg.den > 1.2 ? 3 : 1
    for (let i = 0; i < n; i++) {
      w.spawn({
        x: e.x, y: e.y + 6,
        angle: a + (n === 1 ? 0 : (i - (n - 1) / 2) * 0.22),
        speed: 118 * cfg.spd, r: 4, color: 0, kind: 'orb',
      })
    }
  }
  return {
    down: {
      hp: 14, radius: 14, score: 1000, move: 'sine', speed: 92,
      fireInterval: 2.05 / cfg.den, fire: fairyFire, sprite: 'fairy',
    },
    side: {
      hp: 14, radius: 14, score: 1000, move: 'side', speed: 105,
      fireInterval: 2.05 / cfg.den, fire: fairyFire, sprite: 'fairy',
    },
    big: {
      hp: 260, radius: 26, score: 10000, move: 'hover', speed: 55,
      stopY: 82, stayTime: 9999, fireInterval: 1.7 / cfg.den,
      fire: (w, e) => {
        if (e.y <= 10) return
        const n = Math.max(3, Math.round(12 * cfg.den))
        const off = Math.random() * Math.PI * 2
        for (let i = 0; i < n; i++) {
          w.spawn({ x: e.x, y: e.y + 8, angle: off + (i / n) * Math.PI * 2, speed: 78 * cfg.spd, r: 4.5, color: 4, kind: 'orb' })
        }
        const a = Math.atan2(w.target.y - (e.y + 8), w.target.x - e.x)
        w.spawn({ x: e.x, y: e.y + 8, angle: a, speed: 130 * cfg.spd, r: 4, color: 1, kind: 'orb' })
      },
      sprite: 'big',
    },
  }
}
// ===== BGM（WebAudio FMシンセ／完全オリジナル曲） =====
// PC-98 の FM 音源（YM2608/OPNA）を意識した自作シンセで鳴らす。
// 4オペレータFM（アルゴリズム切替＋フィードバック）でトランペット風リード／ブラス／ベル、
// FMベース、SSG風の矩形波アルペジオ、ノイズ＋サイン落ちのリズム隊、簡易ディレイで奥行きを出す。
// 曲は ZUN 風の作風（短調・疾走するベース・リフの反復・速いアルペジオ）を狙った完全新作で、
// 原作の旋律・フレーズは一切使わない。
type TrackId = 'title' | 'stage' | 'boss' | 'exstage' | 'exboss' | 'jingle'
type FmPatchName = 'trumpet' | 'brass' | 'bell'
type Track = {
  bpm: number
  lead: { notes: (number | null)[]; lens: number[] }
  roots: number[]
  bassPat: (number | null)[]
  chords: number[][]
  kick: string; snare: string; hat: string
  arpDiv: number; cut: number; once?: boolean
  patch: FmPatchName
  stab?: boolean
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
    bpm: 134, cut: 1700, arpDiv: 2, patch: 'trumpet',
    lead: parseLead('E5 . . . A5 . . . C6 . . . B5 . . . A5 . . . . . G5 . E5 . . . D5 . . . F5 . . . A5 . . . C6 . . . A5 . . . B5 . . . D6 . . . B5 . . . G5 . . . A5 . . . C6 . . . E6 . . . D6 . . . C6 . . . B5 . . . A5 . . . . . G5 . A5 . . . F5 . . . E5 . . . D5 . . . E5 . . . . . . . B4 . . . E5 . . .'),
    roots: [45, 45, 41, 43, 45, 45, 41, 40],
    bassPat: BASS_PAT_CALM,
    chords: [[57, 60, 64, 69], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [57, 60, 64, 69], [57, 60, 64, 69], [53, 57, 60, 65], [52, 56, 59, 64]],
    kick: 'x.......x.......', snare: '................', hat: 'x.x.x.x.x.x.x.x.',
  },
  stage: {
    bpm: 176, cut: 2600, arpDiv: 1, patch: 'trumpet',
    lead: parseLead('D5 . F5 . A5 . D6 . C6 . A5 . F5 . A5 . D6 . . . C6 . A5 . F5 . E5 . F5 . G5 . Bb5 . A5 . G5 . F5 . D5 . F5 . Bb5 . A5 . G5 . A5 . C6 . A5 . G5 . E5 . F5 . E5 . D5 F5 G5 A5 Bb5 A5 G5 F5 E5 F5 G5 A5 C6 . . . D6 . C6 . A5 . F5 . A5 . G5 . F5 . E5 . F5 . Bb5 . A5 . G5 . F5 . D5 . E5 . F5 . E5 . F5 . C#5 . E5 . A5 . . . x x x x A5 . D6 . F6 . D6 . A5 . F5 . D5 . F5 . G5 . A5 . Bb5 . A5 . G5 . F5 . E5 . D5 . D6 . . . . . C6 . Bb5 . A5 . G5 . F5 . F5 . G5 . A5 . C6 . B5 . A5 . G5 . F5 . D6 C6 A5 F5 D5 F5 A5 D6 C6 . . . A5 . . . F6 . D6 . C6 . A5 . G5 . A5 . Bb5 . A5 . Bb5 . A5 . G5 . F5 . G5 . A5 . Bb5 . C6 . C#6 . . . E6 . . . A5 . . . x x x x'),
    roots: [38, 38, 34, 36, 38, 38, 34, 33],
    bassPat: BASS_PAT_DRIVE,
    chords: [[62, 65, 69, 74], [62, 65, 69, 74], [58, 62, 65, 70], [60, 64, 67, 72], [62, 65, 69, 74], [62, 65, 69, 74], [58, 62, 65, 70], [57, 61, 64, 69]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.',
  },
  boss: {
    bpm: 188, cut: 3000, arpDiv: 1, patch: 'brass', stab: true,
    lead: parseLead('D5 . D5 . F5 . D5 . A5 . D5 . F5 . D5 . D6 . . . C6 . A5 . F5 . E5 . F5 . G5 . Bb5 . A5 . G5 . D5 . G5 . Bb5 . D6 . C6 . C#6 . . . E6 . . . A5 . G5 . F5 . E5 . F5 . G5 . A5 . D6 . C6 . A5 . F5 . D5 . D5 . G5 . Bb5 . G5 . A5 . Bb5 . C6 . D6 . Bb5 . . A5 . . G5 . F5 . E5 . F5 . G5 . A5 . . . G5 . F5 . E5 . C#5 . E5 . A4 . D6 . F6 . D6 . A5 . F5 . D5 . F5 . A5 . Bb5 . A5 . G5 . F5 . E5 . F5 . G5 . A5 . D6 . . . . . C6 . Bb5 . A5 . G5 . F5 . E6 . . . C#6 . . . A5 . . . G5 . F5 . F6 E6 D6 C6 Bb5 A5 G5 F5 E5 F5 G5 A5 Bb5 C6 D6 . D6 . . G5 . . Bb5 . A5 . G5 . F5 . E5 . F5 . Bb5 . A5 . G5 . A5 . Bb5 . C6 . D6 . C#6 . . . . . . . E6 . . . A5 . . .'),
    roots: [38, 43, 38, 33, 38, 43, 34, 33],
    bassPat: BASS_PAT_GALLOP,
    chords: [[62, 65, 69, 74], [58, 62, 65, 70], [62, 65, 69, 74], [57, 61, 64, 69], [62, 65, 69, 74], [58, 62, 65, 70], [58, 62, 65, 69], [57, 61, 64, 69]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exstage: {
    bpm: 184, cut: 2800, arpDiv: 1, patch: 'trumpet',
    lead: parseLead('E5 . G5 . B5 . E6 . D6 . B5 . G5 . B5 . E6 . D6 . B5 . G5 . A5 . B5 . D6 . B5 . C6 . B5 . A5 . G5 . E5 . G5 . C6 . E6 . D6 . C6 . B5 . A5 . F#5 . A5 . D6 . B5 . E6 D6 B5 G5 E5 G5 B5 E6 B5 . . . A5 . . . G5 . A5 . B5 . D6 . E6 . D6 . B5 . A5 . E6 . C6 . A5 . G5 . A5 . C6 . E6 . D6 . D#6 . . . B5 . . . F#5 . D#5 . B4 . . . B5 . E6 . G6 . E6 . B5 . G5 . E5 . G5 . A5 . B5 . C6 . B5 . A5 . G5 . F#5 . E5 . G5 . C6 . E6 . C6 . D6 . B5 . G5 . B5 . A5 . D6 . F#6 . D6 . C6 . B5 . A5 . G5 . E6 . . B5 . . G5 . E5 . G5 . B5 . D6 . C6 . D6 . E6 . G6 . E6 . D6 . B5 . A5 . C6 . . . G5 . . . A5 . B5 . C6 . D6 . B5 . . . D#6 . . . E6 . . . x x x x'),
    roots: [40, 40, 36, 38, 40, 40, 36, 35],
    bassPat: BASS_PAT_DRIVE,
    chords: [[64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [62, 66, 69, 74], [64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [59, 63, 66, 71]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exboss: {
    bpm: 196, cut: 3200, arpDiv: 1, patch: 'brass', stab: true,
    lead: parseLead('E5 . E5 . G5 . E5 . B5 . E5 . G5 . E5 . E6 . . . D6 . B5 . G5 . F#5 . G5 . A5 . C6 . B5 . A5 . E5 . A5 . C6 . E6 . D6 . D#6 . . . B5 . . . F#5 . A5 . B5 . D#6 . E6 D6 B5 G5 F#5 G5 A5 B5 C6 B5 A5 G5 F#5 D#5 E5 . B5 . . . G5 . . . E5 . . . x . B4 . C6 . E6 . G6 . E6 . D6 . B5 . G5 . B5 . D#6 . . . . . . . B5 . A5 . G5 . F#5 . E6 . G6 . B6 . G6 . E6 . B5 . G5 . E5 . D6 . C6 . B5 . A5 . G5 . A5 . B5 . D6 . E6 . C6 . A5 . E5 . F#5 . G5 . A5 . B5 . D#6 . . . F#6 . . . B5 . . . x x x x E6 . . . D6 . . . C6 . . . B5 . . . A5 . B5 . C6 . D6 . E6 . D6 . B5 . G5 . G5 . C6 . E6 . G6 . F#6 . D6 . B5 . D6 . D#6 . . . B5 . . . E6 . . . x x x x'),
    roots: [40, 40, 33, 35, 40, 40, 36, 35],
    bassPat: BASS_PAT_GALLOP,
    chords: [[64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 69, 72], [59, 63, 66, 71], [64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [59, 63, 66, 71]],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo',
  },
  jingle: {
    bpm: 150, cut: 2400, arpDiv: 2, once: true, patch: 'bell',
    lead: parseLead('D5 . F#5 . A5 . D6 . F#6 . . . D6 . . . E6 . D6 . C#6 . A5 . F#5 . A5 . D6 . . . G5 . B5 . D6 . G6 . F#6 . D6 . B5 . G5 . A5 . C#6 . E6 . A6 . D6 . . . . . . .'),
    roots: [38, 38, 43, 45],
    bassPat: BASS_PAT_CALM,
    chords: [[62, 66, 69, 74], [62, 66, 69, 74], [59, 62, 67, 71], [61, 64, 69, 73]],
    kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  },
}

// ===== FM音色定義（4オペレータ） =====
// alg 'stack': op1→op2→op3→op4(キャリア) の直列。リード／トランペット系。
// alg 'dual' : op1→op2(キャリア) と op3→op4(キャリア) の2系統並列。ブラス／ベル系。
// modIdx は変調指数（基本周波数に対する倍率）、fb は op1 のフィードバック量。
type FmPatchDef = {
  alg: 'stack' | 'dual'
  ratios: [number, number, number, number]
  fb: number
  modIdx: [number, number, number]
  modSus: number
  atk: number; dec: number; susLvl: number
  vibRate: number; vibAmt: number; vibDelay: number
  out: number
}
const FM_PATCHES: Record<FmPatchName, FmPatchDef> = {
  trumpet: {
    alg: 'stack', ratios: [1, 2, 1, 1], fb: 0.35, modIdx: [0.5, 1.1, 2.3], modSus: 0.45,
    atk: 0.03, dec: 0.22, susLvl: 0.55, vibRate: 5.6, vibAmt: 20, vibDelay: 0.15, out: 0.2,
  },
  brass: {
    alg: 'dual', ratios: [1, 1, 1, 1.004], fb: 0.22, modIdx: [1.7, 0, 1.7], modSus: 0.6,
    atk: 0.018, dec: 0.16, susLvl: 0.7, vibRate: 5.2, vibAmt: 7, vibDelay: 0.22, out: 0.15,
  },
  bell: {
    alg: 'dual', ratios: [3.51, 1, 2.76, 1.002], fb: 0.1, modIdx: [1.3, 0, 0.9], modSus: 0.12,
    atk: 0.004, dec: 0.5, susLvl: 0.06, vibRate: 0, vibAmt: 0, vibDelay: 0, out: 0.16,
  },
}

type Bgm = {
  play: (id: TrackId) => void
  stop: () => void
  toggleMute: () => boolean
  /** ユーザー操作のたびに呼ぶ：AudioContext の生成とサスペンド復帰 */
  unlock: () => void
}
function createBgm(): Bgm {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuf: AudioBuffer | null = null
  let delaySend: GainNode | null = null
  let timer: number | null = null
  let cur: TrackId | null = null
  let step = 0
  let nextTime = 0
  let schedTicks = 0
  let muted = false
  const VOL = 0.16
  const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ctx = new AC()
        master = ctx.createGain()
        master.gain.value = muted ? 0 : VOL
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -18; comp.ratio.value = 6
        master.connect(comp); comp.connect(ctx.destination)
        // 簡易ディレイ（リードとアルペジオに薄く送って奥行きを作る）
        delaySend = ctx.createGain(); delaySend.gain.value = 1
        const dly = ctx.createDelay(1); dly.delayTime.value = 0.29
        const fb = ctx.createGain(); fb.gain.value = 0.24
        const wet = ctx.createGain(); wet.gain.value = 0.45
        delaySend.connect(dly); dly.connect(fb); fb.connect(dly)
        dly.connect(wet); wet.connect(master)
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      } catch {
        // 音声が使えない環境でもゲーム本体の処理は止めない
        ctx = null
        master = null
        noiseBuf = null
        delaySend = null
      }
    }
    // Android Chrome ではユーザー操作なしに作られた／止められた Context が
    // suspended のまま固まることがあるため、呼ばれるたびに復帰を試みる
    if (ctx && (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted')) {
      void ctx.resume()
    }
  }
  function unlock() {
    ensure()
  }
  // 4オペレータFMボイス。変調側は指数エンベロープ（倍音が時間で減る）、
  // キャリア側は ADSR 風の音量エンベロープで鳴らす。
  function fmVoice(m: number, t: number, dur: number, p: FmPatchDef, vol: number, bright: number, sendLvl: number) {
    if (!ctx || !master) return
    const base = freq(m)
    const out = ctx.createGain(); out.gain.value = vol * p.out
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.5
    out.connect(f); f.connect(master)
    if (delaySend && sendLvl > 0) {
      const send = ctx.createGain(); send.gain.value = sendLvl
      f.connect(send); send.connect(delaySend)
    }
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = 'sine'
      o.frequency.value = base * p.ratios[i]
      const g = ctx.createGain(); g.gain.value = 0
      o.connect(g)
      oscs.push(o); gains.push(g)
    }
    const rel = Math.min(0.09, dur * 0.4)
    const ampEnv = (g: GainNode, peak: number) => {
      const sus = Math.max(0.001, peak * p.susLvl)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + p.atk)
      g.gain.exponentialRampToValueAtTime(sus, t + p.atk + p.dec)
      g.gain.setValueAtTime(sus, t + Math.max(p.atk + p.dec, dur - rel))
      g.gain.linearRampToValueAtTime(0, t + dur)
    }
    const modEnv = (g: GainNode, idxHz: number) => {
      const sus = Math.max(1, idxHz * p.modSus)
      g.gain.setValueAtTime(idxHz, t)
      g.gain.exponentialRampToValueAtTime(sus, t + Math.min(0.28, dur * 0.6))
      g.gain.setValueAtTime(sus, t + Math.max(0.01, dur - rel))
      g.gain.linearRampToValueAtTime(0, t + dur)
    }
    if (p.alg === 'stack') {
      gains[0].connect(oscs[1].frequency)
      gains[1].connect(oscs[2].frequency)
      gains[2].connect(oscs[3].frequency)
      gains[3].connect(out)
      modEnv(gains[0], p.modIdx[0] * base)
      modEnv(gains[1], p.modIdx[1] * base)
      modEnv(gains[2], p.modIdx[2] * base)
      ampEnv(gains[3], 1)
    } else {
      gains[0].connect(oscs[1].frequency)
      gains[1].connect(out)
      gains[2].connect(oscs[3].frequency)
      gains[3].connect(out)
      modEnv(gains[0], p.modIdx[0] * base)
      modEnv(gains[2], p.modIdx[2] * base)
      ampEnv(gains[1], 0.8)
      ampEnv(gains[3], 0.8)
    }
    if (p.fb > 0) {
      const fb = ctx.createGain(); fb.gain.value = p.fb
      gains[0].connect(fb); fb.connect(oscs[0].frequency)
    }
    if (p.vibAmt > 0) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = p.vibRate
      const lg = ctx.createGain()
      lg.gain.setValueAtTime(0, t)
      lg.gain.linearRampToValueAtTime(p.vibAmt, t + p.vibDelay + 0.18)
      lfo.connect(lg)
      for (const o of oscs) lg.connect(o.detune)
      lfo.start(t); lfo.stop(t + dur + 0.05)
    }
    for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05) }
  }
  function leadNote(m: number, t: number, dur: number, tr: Track) {
    fmVoice(m, t, dur, FM_PATCHES[tr.patch], 1, tr.cut, 0.3)
  }
  function stabNote(m: number, t: number, dur: number, tr: Track) {
    fmVoice(m, t, dur, FM_PATCHES.brass, 0.32, tr.cut, 0.1)
  }
  // FMベース：フィードバック付き2オペでアタックの芯を作り、2倍音ペアでクリックを足す
  function bassNote(m: number, t: number, dur: number) {
    if (!ctx || !master) return
    const C = ctx
    const base = freq(m)
    const out = C.createGain(); out.gain.value = 0.42
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 950
    out.connect(f); f.connect(master)
    const mk = (ratio: number) => {
      const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = base * ratio
      const g = C.createGain(); g.gain.value = 0
      o.connect(g)
      return { o, g }
    }
    const p1 = mk(1); const p2 = mk(1); const p3 = mk(2); const p4 = mk(1)
    p1.g.connect(p2.o.frequency); p2.g.connect(out)
    p3.g.connect(p4.o.frequency); p4.g.connect(out)
    const fb = C.createGain(); fb.gain.value = 0.55
    p1.g.connect(fb); fb.connect(p1.o.frequency)
    const rel = Math.min(0.06, dur * 0.35)
    // 変調（パンチ）：強く入って素早く落ち着く
    p1.g.gain.setValueAtTime(2.6 * base, t)
    p1.g.gain.exponentialRampToValueAtTime(0.7 * base, t + 0.09)
    p1.g.gain.setValueAtTime(0.7 * base, t + Math.max(0.09, dur - rel))
    p1.g.gain.linearRampToValueAtTime(0, t + dur)
    p3.g.gain.setValueAtTime(1.3 * base, t)
    p3.g.gain.exponentialRampToValueAtTime(Math.max(1, 0.1 * base), t + 0.05)
    p3.g.gain.linearRampToValueAtTime(0, t + Math.min(dur, 0.08))
    // キャリア音量
    p2.g.gain.setValueAtTime(0, t)
    p2.g.gain.linearRampToValueAtTime(1, t + 0.006)
    p2.g.gain.exponentialRampToValueAtTime(0.45, t + dur * 0.7)
    p2.g.gain.linearRampToValueAtTime(0, t + dur)
    p4.g.gain.setValueAtTime(0.32, t)
    p4.g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    for (const p of [p1, p2, p3, p4]) { p.o.start(t); p.o.stop(t + dur + 0.03) }
  }
  // SSG風：矩形波＋短い減衰でチップチューンらしい粒立ちにする
  function arpNote(m: number, t: number, dur: number) {
    if (!ctx || !master) return
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq(m)
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3400
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.055, t)
    g.gain.exponentialRampToValueAtTime(0.004, t + dur)
    o.connect(f); f.connect(g); g.connect(master)
    if (delaySend) {
      const send = ctx.createGain(); send.gain.value = 0.5
      g.connect(send); send.connect(delaySend)
    }
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
    if (ln !== null) leadNote(ln, t, spb * tr.lead.lens[li] * 0.95, tr)
    const bo = tr.bassPat[s16]
    if (bo !== null && bo !== undefined) bassNote(tr.roots[bar % tr.roots.length] + bo, t, spb * 1.7)
    if (s % tr.arpDiv === 0) {
      const ch = tr.chords[bar % tr.chords.length]
      arpNote(ch[ARP_SEQ[s % 6]], t, spb * 0.95)
    }
    if (tr.stab && s16 === 0) {
      const ch = tr.chords[bar % tr.chords.length]
      for (const cn of ch) stabNote(cn, t, spb * 5, tr)
    }
    if (tr.kick[s16] === 'x') kick(t)
    if (tr.snare[s16] === 'x') noiseHit(t, 0.36, 0.09, 'bandpass', 1800)
    const h = tr.hat[s16]
    if (h === 'x') noiseHit(t, 0.15, 0.04, 'highpass', 7600)
    else if (h === 'o') noiseHit(t, 0.07, 0.04, 'highpass', 7600)
  }
  function sched() {
    if (!ctx || !cur) return
    // サスペンド中は現在時刻が進まないので何も予約せず、約1秒ごとに復帰を試みる
    // （Android Chrome のオーディオフォーカス喪失などからの回復用）
    if (ctx.state !== 'running') {
      schedTicks++
      if (schedTicks % 40 === 0) void ctx.resume()
      return
    }
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
  return { play, stop, toggleMute, unlock }
}


// ===== 道中脚本（StageScript） =====
// 旧実装のスポーン規則を 0.1 秒刻みの call イベントで再現する。
// part 0: 道中前半 → 中ボス / part 1: 道中後半 → ボス待ちへ。
function buildRoadScript(
  stageIdx: number,
  part: 0 | 1,
  defs: { down: EnemyDef; side: EnemyDef; big: EnemyDef },
  onEnd: (part: 0 | 1) => void,
): StageScript {
  const half = STAGES[stageIdx].road / 2
  let spawnT = part === 0 ? 0.5 : 0.6
  let bigSpawned = false
  const events: StageScript['events'] = []
  for (let t = 0.1; t < half; t += 0.1) {
    const tt = t
    events.push({
      at: tt, type: 'call',
      fn: (api) => {
        spawnT -= 0.1
        if (spawnT <= 0) {
          if (tt < half * 0.35) {
            spawnT = 0.7
            api.spawnEnemy(defs.down, 30 + Math.random() * (FW - 60), -16, 1)
          } else if (tt < half * 0.7) {
            spawnT = 2.6
            const fromLeft = Math.random() < 0.5
            for (let i = 0; i < 5; i++) {
              api.spawnEnemy(
                defs.side,
                fromLeft ? -16 - i * 26 : FW + 16 + i * 26,
                60 + Math.random() * 60,
                fromLeft ? 1 : -1,
              )
            }
          } else {
            spawnT = 1.0
            api.spawnEnemy(defs.down, 30 + Math.random() * (FW - 60), -16, 1)
            api.spawnEnemy(defs.down, 30 + Math.random() * (FW - 60), -40, 1)
          }
        }
        if (tt > half * 0.55 && !bigSpawned) {
          bigSpawned = true
          api.spawnEnemy(defs.big, FW / 2, -30, 1)
        }
      },
    })
  }
  events.push({ at: half, type: 'call', fn: () => onEnd(part) })
  return { id: `stage${stageIdx}-road${part}`, title: STAGES[stageIdx].title, events }
}

// ===== 本体コンポーネント =====
type Phase = 'card' | 'road' | 'midboss' | 'bosswait' | 'boss'
type GState = {
  time: number
  phase: Phase
  phaseT: number
  cardT: number
  stageList: number[]
  stagePos: number
  stageIdx: number
  chara: CharaId
  diff: DiffId
  challenge: boolean
  misses: number
  shake: number
  spawnT: number
  bossWait: number
  respawnT: number
  focusNow: boolean
  bossId: BossId | null
  midId: MidId | null
  msg: string
  msgT: number
}

export default function Koumakyou() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [screen, setScreen] = useState<'title' | 'playing' | 'over' | 'clear'>('title')
  const [finalScore, setFinalScore] = useState(0)
  const [finalMisses, setFinalMisses] = useState(0)
  const [endChallenge, setEndChallenge] = useState(false)
  const [hiscoreUi, setHiscoreUi] = useState<number>(() => {
    try { return Number(localStorage.getItem(HISCORE_KEY) || 0) || 0 } catch { return 0 }
  })
  const [challengeBest, setChallengeBest] = useState<{ score: number; misses: number }>(() => {
    try {
      const raw = localStorage.getItem(CHALLENGE_KEY)
      const p = raw ? (JSON.parse(raw) as { score?: number; misses?: number }) : null
      return {
        score: typeof p?.score === 'number' ? p.score : 0,
        misses: typeof p?.misses === 'number' ? p.misses : 0,
      }
    } catch { return { score: 0, misses: 0 } }
  })
  const [endTitle, setEndTitle] = useState('')
  const [endSub, setEndSub] = useState('')
  const [chara, setChara] = useState<CharaId>('reimu')
  const [diff, setDiff] = useState<DiffId>('normal')
  const [challenge, setChallenge] = useState(false)
  const [mutedUi, setMutedUi] = useState(false)
  const selRef = useRef({ chara, diff, challenge })
  selRef.current = { chara, diff, challenge }
  // ===== 会話シーンの橋渡し（ゲームループ ⇔ React UI） =====
  // active の間、ゲームループは停止する。done は会話終了時の接続先（戦闘開始／次ステージ）。
  const dlgRef = useRef<{ active: boolean; done: (() => void) | null }>({ active: false, done: null })
  const [dlgUi, setDlgUi] = useState<{ boss: BossId; lines: DLine[]; idx: number } | null>(null)
  // ===== タイトル画面のステップ（原作のメニュー構成に寄せた多段選択） =====
  const [titleStep, setTitleStep] = useState<'menu' | 'chara' | 'diff' | 'records' | 'help'>('menu')
  const [pendingRun, setPendingRun] = useState<'story' | 'extra'>('story')
  // ポートレート画像の読み込み失敗を記録し、フォールバック表示に切り替える
  const [imgErr, setImgErr] = useState<ReadonlySet<string>>(new Set())
  const markImgErr = (id: string) =>
    setImgErr((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
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

    // ===== エンジン側オブジェクト =====
    const world = new DanmakuWorld({ width: FW, height: FH, bulletCap: MAXB, margin: 24 })
    const state = new GameState({ startLives: 2, startBombs: 3, maxBombs: 8, extendsAt: [] })
    const playerRef = { x: FW / 2, y: FH - 60 }
    const player = new Player(REIMU_LOCAL, FW / 2, FH - 60)
    const pbullets = new PlayerBulletPool(320)
    const enemies = new EnemyPool(96)
    const items = new ItemPool(128)
    const bossCtl = new BossController({ width: FW, height: FH, clearBulletsOnPhaseEnd: false })
    let parts: Particle[] = []
    let hiscore = 0
    try { hiscore = Number(localStorage.getItem(HISCORE_KEY) || 0) || 0 } catch { hiscore = 0 }
    state.hiScore = hiscore

    let enemyDefs = makeEnemyDefs(DIFF_CFG.normal)
    let runner: StageRunner | null = null
    let ctlIsMid = false
    let running = false

    function freshGame(ch: CharaId, df: DiffId, chMode: boolean, stageList: number[]): GState {
      return {
        time: 0, phase: 'card', phaseT: 0, cardT: 2.4,
        stageList, stagePos: 0, stageIdx: stageList[0],
        chara: ch, diff: df, challenge: chMode, misses: 0,
        shake: 0, spawnT: 0, bossWait: 0, respawnT: 0, focusNow: false,
        bossId: null, midId: null, msg: '', msgT: 0,
      }
    }
    let G: GState = freshGame('reimu', 'normal', false, [0, 1, 2, 3, 4, 5])
    const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

    // ===== ボス／中ボスの入場・退場演出 =====
    // 入場：画面外（上方）から飛来して定位置に収まるまで、ボス制御は開始しない
    // （＝入場中は無敵・無射撃）。退場：撃破時に爆発＋フェード上昇を見せてから遷移する。
    type EnterState = { t: number; max: number; fig: FigureDef; homeY: number; kind: 'mid' | 'boss' }
    type ExitState = {
      t: number; max: number; fig: FigureDef; x: number; y: number
      burstT: number; action: (() => void) | null
    }
    let enter: EnterState | null = null
    let exitFx: ExitState | null = null
    let bossDlgDone = false // このボスの戦前会話を既に挟んだか

    // ===== パーティクル =====
    function burst(x: number, y: number, n: number, c: string, spd = 120) {
      for (let i = 0; i < n; i++) {
        if (parts.length > 240) break
        const a = Math.random() * Math.PI * 2
        const s = (0.3 + Math.random() * 0.7) * spd
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.4, c, r: 1.5 + Math.random() * 2.5 })
      }
    }

    // ===== 敵撃破 =====
    function onEnemyKilled(e: { x: number; y: number; def: EnemyDef }) {
      const big = e.def.sprite === 'big'
      state.addScore(e.def.score ?? (big ? 10000 : 1000))
      burst(e.x, e.y, big ? 26 : 10, big ? '#ffb74d' : '#a5d6a7', 130)
      if (big) {
        items.spawn('power', e.x - 14, e.y)
        items.spawn('power', e.x + 14, e.y)
        items.spawn('point', e.x, e.y - 10)
      } else if (Math.random() < 0.3) {
        items.spawn(Math.random() < 0.6 ? 'power' : 'point', e.x, e.y)
      }
    }

    // ===== ボム =====
    function tryBomb() {
      if (!running || player.dead || player.bombT > 0) return
      if (!state.useBomb()) return
      player.startBomb()
      if (bossCtl.active) bossCtl.notifyBomb()
      world.clearBullets((b) => { void b; state.addScore(100) })
      for (const e of [...enemies.active]) {
        if (enemies.damage(e, 220)) onEnemyKilled(e)
      }
      if (bossCtl.active) bossCtl.damage(ctlIsMid ? 240 : 260)
      burst(player.x, player.y, 40, '#ffe066', 220)
      G.shake = Math.max(G.shake, 6)
    }

    // ===== 被弾 =====
    function playerHit() {
      if (player.invulnT > 0 || player.bombT > 0 || player.dead) return
      burst(player.x, player.y, 30, '#ff5252', 180)
      G.shake = Math.max(G.shake, 7)
      state.powerDown(1)
      if (bossCtl.active) bossCtl.notifyMiss()
      world.clearBullets()
      if (G.challenge) {
        G.misses++ // チャレンジモードは倒された数を記録する
      } else {
        if (state.miss()) { finish(false); return }
      }
      player.dead = true
      G.respawnT = 1.0
    }

    function finish(clear: boolean) {
      running = false
      if (G.challenge) {
        // チャレンジ専用ベストを通常モードとは分けて保存（通常ハイスコアには触れない）
        setFinalMisses(G.misses)
        setEndChallenge(true)
        try {
          const raw = localStorage.getItem(CHALLENGE_KEY)
          const prev = raw ? (JSON.parse(raw) as { score?: number; misses?: number }) : null
          const prevScore = typeof prev?.score === 'number' ? prev.score : 0
          if (state.score > prevScore) {
            const rec = { score: state.score, misses: G.misses }
            localStorage.setItem(CHALLENGE_KEY, JSON.stringify(rec))
            setChallengeBest(rec)
          }
        } catch { /* ignore */ }
      } else {
        setEndChallenge(false)
        if (state.score > hiscore) {
          hiscore = state.score
          try { localStorage.setItem(HISCORE_KEY, String(hiscore)) } catch { /* ignore */ }
          setHiscoreUi(hiscore)
        }
      }
      if (clear) {
        const lastStage = G.stageList[G.stageList.length - 1]
        if (lastStage === 5 && G.diff !== 'easy' && !G.challenge) {
          // EX解放の記録（表示ゲートには使わない。EXTRAは常時挑戦可能）
          try { localStorage.setItem(EX_KEY, '1') } catch { /* ignore */ }
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
      setFinalScore(state.score)
      setScreen(clear ? 'clear' : 'over')
    }

    // ===== ステージ進行 =====
    function startStage(pos: number) {
      G.stagePos = pos
      G.stageIdx = G.stageList[pos]
      G.phase = 'card'
      G.cardT = 2.4
      G.phaseT = 0
      G.bossId = null
      G.midId = null
      enter = null
      runner = null
      enemies.clear()
      pbullets.clear()
      world.clearBullets()
      world.clearLasers()
      if (bossCtl.active) bossCtl.abort()
      bgmPlay(G.stageIdx === 6 ? 'exstage' : 'stage')
    }
    function startRoadPart(part: 0 | 1) {
      G.phase = 'road'
      G.phaseT = 0
      const api: StageApi = {
        spawnEnemy: (def, x, y, dir) => { enemies.spawn(def, x, y, dir) },
        startBoss: () => { /* このゲームでは call イベント経由で開始する */ },
        setBackground: () => { /* 背景はステージ番号で切替済み */ },
        dialogue: () => { /* 会話イベントは未使用 */ },
        dropItem: (kind, x, y) => { items.spawn(kind, x, y) },
        message: (text) => { G.msg = text; G.msgT = 1.8 },
      }
      runner = new StageRunner(
        buildRoadScript(G.stageIdx, part, enemyDefs, (p) => {
          if (p === 0) startMidboss()
          else {
            G.phase = 'bosswait'
            G.phaseT = 0
            G.bossWait = 1.3
            world.clearBullets()
          }
        }),
        api,
        { width: FW, height: FH },
      )
    }
    function startMidboss() {
      const sd = STAGES[G.stageIdx]
      ctlIsMid = true
      G.midId = sd.mid
      G.phase = 'midboss'
      G.phaseT = 0
      G.spawnT = 1.2
      G.msg = `中ボス ${sd.midName}`
      G.msgT = 1.8
      // 入場演出：画面外から飛来してから戦闘開始
      enter = { t: 1.0, max: 1.0, fig: MID_FIGURES[sd.mid], homeY: 80, kind: 'mid' }
    }
    function launchMidboss() {
      const sd = STAGES[G.stageIdx]
      bossCtl.start(makeMidDef(sd.mid, sd.midName, G.stageIdx), world, playerRef, FW / 2, 80)
      burst(FW / 2, 80, 14, '#b3e5fc', 90)
    }
    function startBoss() {
      const sd = STAGES[G.stageIdx]
      ctlIsMid = false
      G.bossId = sd.boss
      G.phase = 'boss'
      G.phaseT = 0
      bossDlgDone = false
      const meta = BOSS_META[sd.boss]
      G.msg = `${meta.epithet} ${meta.name}`
      G.msgT = 2.5
      // BGMは会話を挟んで戦闘開始時（launchBoss）に切り替える
      // 入場演出：画面外から飛来してから戦闘開始
      enter = { t: 1.05, max: 1.05, fig: BOSS_FIGURES[sd.boss], homeY: 88, kind: 'boss' }
    }
    function launchBoss() {
      const sd = STAGES[G.stageIdx]
      bgmPlay(G.stageIdx === 6 ? 'exboss' : 'boss')
      bossCtl.start(makeBossDef(sd.boss), world, playerRef, FW / 2, 88)
      burst(FW / 2, 88, 16, '#ffcdd2', 90)
    }

    // ===== 会話シーンの開始（ゲームループを止め、終了時に done へ接続） =====
    function openDialogue(boss: BossId, kind: 'pre' | 'post', done: () => void) {
      const script = DIALOGUES[boss][G.chara]
      const lines = kind === 'pre' ? script.pre : script.post
      if (lines.length === 0) { done(); return }
      dlgRef.current = { active: true, done }
      setDlgUi({ boss, lines, idx: 0 })
    }

    // ===== ボス／中ボスのフェイズ終了処理 =====
    bossCtl.onPhaseEnd = (res: PhaseEndResult) => {
      if (ctlIsMid) {
        const midFig = G.midId ? MID_FIGURES[G.midId] : null
        if (res.timeout) {
          G.msg = '逃げられた…'
          G.msgT = 1.4
        } else {
          state.addScore(20000)
          burst(bossCtl.x, bossCtl.y, 36, '#ffcc80', 170)
          items.spawn('power', bossCtl.x - 14, bossCtl.y)
          items.spawn('point', bossCtl.x + 14, bossCtl.y)
          world.clearBullets(() => state.addScore(30))
          // 撃破時の退場演出（フェードしながら上昇する残像）
          if (midFig) {
            exitFx = { t: 0.7, max: 0.7, fig: midFig, x: bossCtl.x, y: bossCtl.y, burstT: 0, action: null }
          }
        }
        G.midId = null
        startRoadPart(1)
        return
      }
      burst(bossCtl.x, bossCtl.y, 50, '#ff8a80', 200)
      G.shake = Math.max(G.shake, 8)
      world.clearBullets(() => state.addScore(50))
      if (res.phase.name) {
        if (res.captured) {
          state.addScore(res.bonus)
          G.msg = `スペルカードボーナス ${res.bonus.toLocaleString()}`
        } else if (!res.timeout) {
          G.msg = 'スペルカード撃破！'
        } else {
          G.msg = 'スペルカード時間切れ…'
        }
        G.msgT = 2.2
        items.spawn('power', bossCtl.x - 16, bossCtl.y + 10)
        items.spawn('point', bossCtl.x + 16, bossCtl.y + 10)
      }
    }
    bossCtl.onDefeat = () => {
      if (ctlIsMid) return // 中ボスの後処理は onPhaseEnd で完了している
      const bid = G.bossId
      const fig = bid ? BOSS_FIGURES[bid] : null
      const bx = bossCtl.x, by = bossCtl.y
      G.bossId = null
      state.addScore(100000)
      const proceed = () => {
        if (G.stagePos + 1 < G.stageList.length) startStage(G.stagePos + 1)
        else finish(true)
      }
      // 退場演出（爆発＋フェード上昇）→ 撃破後会話 → 次ステージ／クリア の順に進む
      if (fig) {
        exitFx = {
          t: 1.15, max: 1.15, fig, x: bx, y: by, burstT: 0,
          action: bid ? () => openDialogue(bid, 'post', proceed) : proceed,
        }
      } else {
        proceed()
      }
    }

    // ===== 入力 =====
    const keys = new Set<string>()
    const getBgmFromEffect = (): Bgm => {
      if (!bgmRef.current) bgmRef.current = createBgm()
      return bgmRef.current
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      keys.add(k)
      if (k === 'm') setMutedUi(getBgmFromEffect().toggleMute())
      if (running && k === 'x' && !dlgRef.current.active) tryBomb()
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Android Chrome の WebAudio 対策：AudioContext が suspended のまま固まると
    // BGM が一切鳴らなくなるため、あらゆるユーザー操作と画面復帰のたびに復帰させる
    const onGestureAudio = () => { bgmRef.current?.unlock() }
    const onVisAudio = () => { if (!document.hidden) bgmRef.current?.unlock() }
    window.addEventListener('pointerdown', onGestureAudio)
    document.addEventListener('visibilitychange', onVisAudio)

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
      dragOffX = player.x - p.x; dragOffY = player.y - p.y
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown || !running || player.dead) return
      const p = toLogical(e)
      player.x = clamp(p.x + dragOffX, 8, FW - 8)
      player.y = clamp(p.y + dragOffY, 16, FH - 10)
    }
    const onPointerUp = () => { pointerDown = false }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // ===== 更新（固定60Hzステップ） =====
    function findTarget(x: number, y: number): { x: number; y: number } | null {
      let best: { x: number; y: number } | null = null
      let bd = Infinity
      const consider = (tx: number, ty: number) => {
        const d = (tx - x) * (tx - x) + (ty - y) * (ty - y)
        if (d < bd) { bd = d; best = { x: tx, y: ty } }
      }
      for (const en of enemies.active) consider(en.x, en.y)
      if (bossCtl.active) {
        for (const b of bossCtl.bodies) if (b.visible) consider(b.x, b.y)
      }
      return best
    }
    function hitTest(x: number, y: number, dmg: number): boolean {
      for (const e of enemies.active) {
        const rr = e.def.sprite === 'big' ? 26 : 14
        if (Math.abs(x - e.x) < rr && Math.abs(y - e.y) < rr + 6) {
          if (enemies.damage(e, dmg)) onEnemyKilled(e)
          return true
        }
      }
      if (bossCtl.active) {
        for (const b of bossCtl.bodies) {
          if (!b.visible) continue
          if (Math.abs(x - b.x) < b.radius && Math.abs(y - b.y) < b.radius + 4) {
            if (bossCtl.hitBody(b, dmg)) {
              state.addScore(10)
              return true
            }
          }
        }
      }
      return false
    }

    function stepGame(dt: number) {
      if (dlgRef.current.active) return // 会話中はゲームを停止する（描画は直前の状態で継続）
      G.time += dt
      if (!running) return
      G.phaseT += dt
      if (G.msgT > 0) G.msgT -= dt
      if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 14)

      // --- 退場演出の進行（爆発を散らしながらフェード） ---
      if (exitFx) {
        exitFx.t -= dt
        exitFx.burstT -= dt
        if (exitFx.burstT <= 0) {
          exitFx.burstT = 0.13
          burst(
            exitFx.x + (Math.random() - 0.5) * 30,
            exitFx.y + (Math.random() - 0.5) * 30,
            10, '#ffab91', 130,
          )
        }
        if (exitFx.t <= 0) {
          const act = exitFx.action
          exitFx = null
          if (act) act()
        }
      }

      // --- フェイズ進行 ---
      if (G.phase === 'card') {
        G.cardT -= dt
        if (G.cardT <= 0) startRoadPart(0)
      } else if (G.phase === 'road') {
        if (runner) runner.update(dt)
      } else if (G.phase === 'midboss') {
        if (enter) {
          // 入場中：飛来が終わるまで戦闘を開始しない
          enter.t -= dt
          if (enter.t <= 0) { enter = null; launchMidboss() }
        } else {
          // 中ボス戦中もたまに妖精が通る
          G.spawnT -= dt
          if (G.spawnT <= 0) {
            G.spawnT = 2.8
            enemies.spawn(enemyDefs.down, 30 + Math.random() * (FW - 60), -16, 1)
          }
          bossCtl.update(dt)
        }
      } else if (G.phase === 'bosswait') {
        G.bossWait -= dt
        if (G.bossWait <= 0) startBoss()
      } else if (G.phase === 'boss') {
        if (enter) {
          enter.t -= dt
          if (enter.t <= 0) {
            enter = null
            // 入場が終わったら、戦前会話を挟んでから戦闘を開始する
            if (!bossDlgDone && G.bossId) {
              bossDlgDone = true
              const bid = G.bossId
              openDialogue(bid, 'pre', () => launchBoss())
            } else {
              launchBoss()
            }
          }
        } else {
          bossCtl.update(dt)
        }
      }

      // --- 自機 ---
      if (player.dead) {
        G.respawnT -= dt
        if (G.respawnT <= 0) {
          player.respawn(FW / 2, FH - 60)
          state.bombs = Math.max(state.bombs, 3)
        }
      } else {
        let mx = 0, my = 0
        if (keys.has('arrowleft') || keys.has('a')) mx -= 1
        if (keys.has('arrowright') || keys.has('d')) mx += 1
        if (keys.has('arrowup') || keys.has('w')) my -= 1
        if (keys.has('arrowdown') || keys.has('s')) my += 1
        if (mx !== 0 && my !== 0) { mx *= 0.7071; my *= 0.7071 }
        const focus = keys.has('shift')
        G.focusNow = focus
        player.update(
          dt,
          { mx, my, focus, shot: keys.has('z') || pointerDown },
          { width: FW, height: FH },
          state.powerTier,
          (shots) => { for (const s of shots) pbullets.spawn(player.x, player.y, s) },
        )
      }
      playerRef.x = player.x
      playerRef.y = player.y
      world.target.x = player.x
      world.target.y = player.y

      // --- 敵・自機弾・敵弾 ---
      enemies.update(dt, world, { width: FW, height: FH })
      pbullets.update(dt, { width: FW, height: FH }, findTarget, hitTest)
      world.update(dt)

      // --- 被弾・グレイズ ---
      if (!player.dead) {
        const res = world.collide(
          player.x, player.y, player.def.hitR, player.def.grazeR,
          () => { state.addGraze(); state.addScore(500) },
        )
        if (res.hit || world.collideLasers(player.x, player.y, player.def.hitR)) {
          playerHit()
        }
      }

      // --- アイテム ---
      items.update(dt, player.x, player.y, {
        height: FH, magnetR: 60, collectR: 16,
        onCollect: (info) => {
          if (info.kind === 'power') {
            if (state.powerTier >= 4) state.addScore(5000)
            else state.power = Math.min(4, state.powerTier + 1)
          } else if (info.kind === 'point') {
            state.addScore(3000)
          }
        },
      })

      // --- パーティクル ---
      for (const p of parts) {
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt
        p.vx *= 0.96; p.vy *= 0.96
      }
      parts = parts.filter(p => p.life < p.max)
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

    function drawFairy(e: { x: number; y: number; t: number; hp: number; maxHp: number; def: EnemyDef }) {
      const big = e.def.sprite === 'big'
      ctx.save(); ctx.translate(e.x, e.y)
      const flap = Math.sin(e.t * 14) * 0.35
      ctx.fillStyle = 'rgba(170,225,255,0.75)'
      ctx.save(); ctx.rotate(-0.5 - flap); ctx.beginPath(); ctx.ellipse(-9, -3, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.save(); ctx.rotate(0.5 + flap); ctx.beginPath(); ctx.ellipse(9, -3, 8, 3.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.fillStyle = big ? '#7e57c2' : '#42a5f5'
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(7, 10); ctx.lineTo(-7, 10); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#ffe0bd'
      ctx.beginPath(); ctx.arc(0, -6, 4.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fdd835'
      ctx.beginPath(); ctx.arc(0, -8, 4.6, Math.PI, Math.PI * 2); ctx.fill()
      ctx.restore()
      if (big) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x - 22, e.y - 24, 44, 4)
        ctx.fillStyle = '#ab7be8'; ctx.fillRect(e.x - 22, e.y - 24, 44 * Math.max(0, e.hp / e.maxHp), 4)
      }
    }

    function draw() {
      ctx.clearRect(0, 0, SW, SH)
      ctx.save()
      if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake)
      drawBackground()

      // アイテム
      items.render(ctx)
      // 敵
      for (const en of enemies.active) drawFairy(en)
      // 中ボス／ボス（分身時は全ボディを描く）
      if (bossCtl.active) {
        const fig = ctlIsMid && G.midId ? MID_FIGURES[G.midId] : G.bossId ? BOSS_FIGURES[G.bossId] : null
        if (fig) {
          if (bossCtl.bodies.length > 1) {
            for (const b of bossCtl.bodies) {
              if (b.visible) drawFigure(ctx, fig, b.x, b.y, { t: G.time, alpha: b.real ? 1 : 0.85 })
            }
          } else {
            drawFigure(ctx, fig, bossCtl.x, bossCtl.y, { t: G.time })
          }
        }
        if (ctlIsMid) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bossCtl.x - 24, bossCtl.y - 30, 48, 4)
          ctx.fillStyle = '#ffb74d'; ctx.fillRect(bossCtl.x - 24, bossCtl.y - 30, 48 * Math.max(0, bossCtl.hp / bossCtl.maxHp), 4)
        }
      }
      // 入場演出：画面外（上方）から定位置へ飛来する
      if (enter) {
        const p = easeOut(clamp(1 - enter.t / enter.max, 0, 1))
        drawFigure(ctx, enter.fig, FW / 2, -48 + (enter.homeY + 48) * p, { t: G.time })
      }
      // 戦前会話中：入場済みのボスが定位置で待機している姿を描く
      if (G.phase === 'boss' && !enter && !bossCtl.active && G.bossId && dlgRef.current.active) {
        drawFigure(ctx, BOSS_FIGURES[G.bossId], FW / 2, 88, { t: G.time })
      }
      // 退場演出：撃破されたボスがフェードしながら上昇する
      if (exitFx) {
        const p = clamp(exitFx.t / exitFx.max, 0, 1)
        drawFigure(ctx, exitFx.fig, exitFx.x, exitFx.y - (1 - p) * 34, { t: G.time, alpha: p })
      }
      // 自機弾
      pbullets.render(ctx)
      // 敵弾・レーザー
      world.render(ctx)
      // パーティクル
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max)
        ctx.fillStyle = p.c
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      // ボム演出
      if (player.bombT > 0) {
        ctx.beginPath(); ctx.arc(player.x, player.y, (0.8 - player.bombT) * 320, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,224,102,0.8)'; ctx.lineWidth = 5; ctx.stroke()
      }
      // 自機
      if (!player.dead) {
        const blink = player.invulnT > 0 && Math.floor(G.time * 14) % 2 === 0
        drawFigure(ctx, G.chara === 'marisa' ? MARISA_FIGURE : REIMU_FIGURE, player.x, player.y, {
          t: G.time, scale: 0.8, alpha: blink ? 0.3 : 1,
        })
        if (G.focusNow || pointerDown) {
          ctx.beginPath(); ctx.arc(player.x, player.y, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'; ctx.fill()
          ctx.beginPath(); ctx.arc(player.x, player.y, 3, 0, Math.PI * 2)
          ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1.4; ctx.stroke()
          ctx.beginPath(); ctx.arc(player.x, player.y, 8, 0, Math.PI * 2)
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
      if (bossCtl.active) {
        marker(bossCtl.bodies.length > 1 ? FW / 2 : bossCtl.x, ctlIsMid ? '#4fc3f7' : '#ff5252')
      }

      // ===== ボス情報 =====
      if (bossCtl.active && !ctlIsMid && bossCtl.def && bossCtl.phase) {
        const def = bossCtl.def
        const ph = bossCtl.phase
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(6, 6, FW - 12, 30)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(def.name, 10, 8)
        ctx.fillStyle = '#ffd54f'; ctx.font = '10px sans-serif'
        ctx.fillText(ph.name ?? '通常攻撃', 10, 21)
        const stars = '★'.repeat(Math.max(0, def.phases.length - 1 - bossCtl.phaseIndex))
        if (stars) {
          ctx.fillStyle = '#ff8a80'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'
          ctx.fillText(stars, FW - 44, 21)
        }
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right'
        ctx.fillText(`${Math.ceil(bossCtl.timeLeft)}`, FW - 10, 8)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(6, 38, FW - 12, 4)
        ctx.fillStyle = '#ef5350'; ctx.fillRect(6, 38, (FW - 12) * Math.max(0, bossCtl.hp / bossCtl.maxHp), 4)
      }
      // ===== ステージカード =====
      if (G.phase === 'card') {
        const sd = STAGES[G.stageIdx]
        const meta = BOSS_META[sd.boss]
        ctx.fillStyle = 'rgba(5,2,14,0.62)'; ctx.fillRect(0, 128, FW, 168)
        ctx.fillStyle = '#ff9e9e'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(G.stageIdx === 6 ? 'EXTRA STAGE' : `STAGE ${G.stageIdx + 1}`, FW / 2, 158)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 21px sans-serif'
        ctx.fillText(sd.title, FW / 2, 192)
        ctx.fillStyle = '#d1c4e9'; ctx.font = '12px sans-serif'
        ctx.fillText(meta.epithet, FW / 2, 232)
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 16px sans-serif'
        ctx.fillText(meta.name, FW / 2, 256)
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
      value(state.score.toLocaleString(), 66)
      label('HI-SCORE', 92)
      value(Math.max(hiscore, state.score).toLocaleString(), 106)
      label('PLAYER', 132)
      if (G.challenge) {
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('∞ チャレンジ', sx, 148)
      } else {
        for (let i = 0; i < Math.max(0, state.lives); i++) {
          ctx.fillStyle = '#ef5350'
          ctx.beginPath(); ctx.arc(sx + 8 + i * 20, 154, 6, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.beginPath(); ctx.arc(sx + 8 + i * 20, 154, 2.4, 0, Math.PI * 2); ctx.fill()
        }
      }
      label('BOMB', 172)
      for (let i = 0; i < state.bombs; i++) {
        ctx.fillStyle = '#ffd54f'
        ctx.save(); ctx.translate(sx + 8 + i * 20, 194); ctx.rotate(Math.PI / 4); ctx.fillRect(-4.4, -4.4, 8.8, 8.8); ctx.restore()
      }
      label('POWER', 214)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(sx, 232, 96, 8)
      ctx.fillStyle = '#ef5350'; ctx.fillRect(sx, 232, 96 * (state.power / 4), 8)
      ctx.fillStyle = '#ffffff'; ctx.font = '11px monospace'
      ctx.fillText(`${Math.floor(state.power)} / 4`, sx, 244)
      label('GRAZE', 266)
      value(String(state.graze), 280)
      if (G.challenge) {
        ctx.fillStyle = '#b39ddb'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('MISS', sx + 62, 266)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.fillText(String(G.misses), sx + 62, 280)
      }
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

    // ===== メインループ（FixedLoop: 論理60Hz固定） =====
    const fixed = new FixedLoop({
      step: 1 / 60,
      update: (dt) => stepGame(dt),
      render: () => draw(),
    })
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      fixed.frame(now)
    }
    raf = requestAnimationFrame(frame)

    startRef.current = (run: 'story' | 'extra') => {
      const sel = selRef.current
      const list = run === 'extra' ? [6] : sel.diff === 'easy' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5]
      dlgRef.current = { active: false, done: null }
      setDlgUi(null)
      world.clearBullets()
      world.clearLasers()
      world.clearEmitters()
      enemies.clear()
      items.clear()
      pbullets.clear()
      parts = []
      enter = null
      exitFx = null
      if (bossCtl.active) bossCtl.abort()
      state.reset()
      state.hiScore = hiscore
      enemyDefs = makeEnemyDefs(DIFF_CFG[sel.diff])
      bossCtl.setDiff({ spd: DIFF_CFG[sel.diff].spd, den: DIFF_CFG[sel.diff].den })
      player.def = sel.chara === 'marisa' ? MARISA_LOCAL : REIMU_LOCAL
      player.respawn(FW / 2, FH - 60)
      player.invulnT = 0
      G = freshGame(sel.chara, sel.diff, sel.challenge, list)
      running = true
      setScreen('playing')
      startStage(0)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerdown', onGestureAudio)
      document.removeEventListener('visibilitychange', onVisAudio)
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

  // ===== 会話シーンの操作 =====
  const closeDlg = () => {
    const done = dlgRef.current.done
    dlgRef.current = { active: false, done: null }
    setDlgUi(null)
    if (done) done()
  }
  const advanceDlg = () => {
    if (!dlgUi) return
    if (dlgUi.idx + 1 < dlgUi.lines.length) setDlgUi({ ...dlgUi, idx: dlgUi.idx + 1 })
    else closeDlg()
  }
  const skipDlg = () => { if (dlgUi) closeDlg() }
  useEffect(() => {
    if (!dlgUi) return
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'escape') { e.preventDefault(); closeDlg() }
      else if (k === 'z' || k === 'enter' || k === ' ') { e.preventDefault(); advanceDlg() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  // ポートレート表示（読み込み失敗時は名前入りの図形プレースホルダにフォールバック）
  const portraitEl = (id: string, label: string, style: React.CSSProperties) => {
    if (imgErr.has(id)) {
      return (
        <div
          style={{
            ...style, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(160deg, #4a1030 0%, #20060f 100%)',
            color: '#ffb3b3', fontWeight: 'bold', fontSize: 20, letterSpacing: 2,
          }}
        >
          {label}
        </div>
      )
    }
    return (
      <img
        src={portraitUrl(id)}
        alt={label}
        draggable={false}
        onError={() => markImgErr(id)}
        style={{ objectFit: 'cover', ...style }}
      />
    )
  }

  return (
    <div ref={wrapRef} style={{ width: '100%', maxWidth: 560, margin: '0 auto', userSelect: 'none' }}>
      <style>{`
        .kouma-btn:active { transform: scale(0.96); }
        .kouma-menu { transition: background 0.12s, color 0.12s; }
        .kouma-menu:hover, .kouma-menu:active { background: rgba(255, 70, 85, 0.18); color: #ffd7d7; }
        .kouma-menu .kouma-caret { opacity: 0; transition: opacity 0.12s; }
        .kouma-menu:hover .kouma-caret, .kouma-menu:active .kouma-caret { opacity: 1; }
        .kouma-card { transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
        .kouma-card:hover, .kouma-card:active { transform: translateY(-2px); border-color: rgba(255,150,150,0.95) !important; box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
      `}</style>
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
        {screen === 'playing' && dlgUi && (() => {
          const line = dlgUi.lines[dlgUi.idx]
          const speakingPlayer = line.w === 'p'
          const playerName = chara === 'reimu' ? '博麗霊夢' : '霧雨魔理沙'
          const bossName = BOSS_META[dlgUi.boss].name
          const faceStyle = (active: boolean): React.CSSProperties => ({
            height: 188, width: 138, borderRadius: 10,
            border: active ? '2px solid rgba(255,150,150,0.95)' : '2px solid rgba(255,255,255,0.25)',
            opacity: active ? 1 : 0.55,
            filter: active ? 'none' : 'brightness(0.55) saturate(0.75)',
            transform: active ? 'scale(1.03)' : 'scale(1)',
            transition: 'opacity 0.15s, filter 0.15s, transform 0.15s',
            boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
          })
          return (
            <div
              onClick={advanceDlg}
              style={{
                position: 'absolute', inset: 0, zIndex: 6, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                background: 'linear-gradient(to bottom, rgba(5,2,12,0.18) 0%, rgba(5,2,12,0.42) 62%, rgba(5,2,12,0.66) 100%)',
                borderRadius: 8,
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); skipDlg() }}
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 2,
                  background: 'rgba(20,8,26,0.75)', color: '#ffb3b3',
                  border: '1px solid rgba(255,150,150,0.55)', borderRadius: 999,
                  padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                }}
              >
                スキップ ≫
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 12px', pointerEvents: 'none' }}>
                {portraitEl(chara, playerName, faceStyle(speakingPlayer))}
                {portraitEl(dlgUi.boss, bossName, faceStyle(!speakingPlayer))}
              </div>
              <div
                style={{
                  position: 'relative', margin: '10px 10px 12px',
                  background: 'rgba(12,4,22,0.9)', border: '1px solid rgba(255,120,120,0.65)',
                  borderRadius: 10, padding: '14px 16px 16px', minHeight: 92,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)', textAlign: 'left',
                }}
              >
                <div
                  style={{
                    position: 'absolute', top: -13, left: 14, padding: '2px 14px',
                    background: speakingPlayer ? '#7b1fa2' : '#b71c1c', color: '#fff',
                    borderRadius: 999, fontSize: 12.5, fontWeight: 'bold', letterSpacing: 1,
                    border: '1px solid rgba(255,255,255,0.5)',
                  }}
                >
                  {speakingPlayer ? playerName : bossName}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.8, color: '#fff', marginTop: 2 }}>{line.t}</div>
                <div style={{ position: 'absolute', right: 14, bottom: 8, fontSize: 11, color: '#ff9e9e' }}>
                  {dlgUi.idx + 1}/{dlgUi.lines.length}　▼ タップ / Z
                </div>
              </div>
            </div>
          )
        })()}
        {screen === 'title' && (() => {
          // タイトル画面：紅い霧の背景＋キービジュアル＋縦並びメニュー（原作の画面構成に寄せた多段選択）
          const menuItem = (label: string, caption: string, onClick: () => void) => (
            <button
              key={label}
              type="button"
              className="kouma-menu"
              onClick={onClick}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,150,150,0.16)',
                color: '#f5e9f7', padding: '9px 10px', fontSize: 17, fontWeight: 'bold',
                letterSpacing: 2, cursor: 'pointer', textAlign: 'left',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
              }}
            >
              <span className="kouma-caret" style={{ color: '#ff6b6b', fontSize: 13 }}>▶</span>
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 'normal', color: '#d8a7c3', letterSpacing: 0 }}>{caption}</span>
            </button>
          )
          const stepHeader = (title: string, backTo: 'menu' | 'chara', backLabel: string) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => { setTitleStep(backTo); touchTitle() }}
                style={{
                  background: 'rgba(20,8,26,0.7)', color: '#ffb3b3', border: '1px solid rgba(255,150,150,0.5)',
                  borderRadius: 999, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                }}
              >
                ← {backLabel}
              </button>
              <div style={{ fontSize: 19, fontWeight: 'bold', color: '#ffb3b3', letterSpacing: 3 }}>{title}</div>
            </div>
          )
          const runCaption = pendingRun === 'extra' ? 'EXTRA STAGE' : challenge ? 'チャレンジモード（残機無限）' : '全6面'
          return (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 3, borderRadius: 8, overflow: 'hidden',
                background: 'linear-gradient(155deg, #20060f 0%, #3d0a24 46%, #1a0b31 100%)',
                color: '#fff',
              }}
            >
              {/* 紅い霧のモヤ */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 46% at 80% 26%, rgba(255,64,80,0.30), transparent 70%), radial-gradient(ellipse 62% 42% at 12% 78%, rgba(150,30,60,0.28), transparent 70%), radial-gradient(ellipse 90% 30% at 50% 108%, rgba(90,10,40,0.5), transparent 70%)' }} />
              {/* キービジュアル（メニュー画面のみ、右側に大きく） */}
              {titleStep === 'menu' && !imgErr.has('remilia') && (
                <img
                  src={portraitUrl('remilia')}
                  alt=""
                  draggable={false}
                  onError={() => markImgErr('remilia')}
                  style={{
                    position: 'absolute', right: 0, top: 0, height: '100%', width: '47%',
                    objectFit: 'cover', objectPosition: 'top center', opacity: 0.95, pointerEvents: 'none',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 42%)',
                    maskImage: 'linear-gradient(to right, transparent 0%, black 42%)',
                  }}
                />
              )}
              <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '16px 18px', overflowY: 'auto' }}>
                {titleStep === 'menu' && (
                  <>
                    <div style={{ fontSize: 11, letterSpacing: 5, color: '#ff9e9e', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>ファンメイド弾幕STG</div>
                    <div style={{ fontSize: 44, fontWeight: 'bold', color: '#ff5f6b', letterSpacing: 3, lineHeight: 1.15, textShadow: '0 0 18px rgba(255,50,70,0.75), 0 3px 10px rgba(0,0,0,0.9)' }}>東方紅魔郷</div>
                    <div style={{ fontSize: 12.5, color: '#e8c9dd', letterSpacing: 2, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>〜 紅霧異変 〜　全6面＋EXステージ</div>
                    <div style={{ marginTop: 20, width: '64%', minWidth: 250 }}>
                      {menuItem('ゲームスタート', '紅魔館へ出発', () => { setChallenge(false); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('エクストラスタート', 'EXTRA STAGE', () => { setChallenge(false); setPendingRun('extra'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('チャレンジ', '残機無限で挑戦', () => { setChallenge(true); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('記録表示', 'スコアとベスト記録', () => { setTitleStep('records'); touchTitle() })}
                      {menuItem('遊び方', '操作とルール', () => { setTitleStep('help'); touchTitle() })}
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, color: '#d8b7d9', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                      ハイスコア {hiscoreUi.toLocaleString()}
                      {challengeBest.score > 0 && (
                        <span>　／　チャレンジベスト {challengeBest.score.toLocaleString()}（ミス {challengeBest.misses}回）</span>
                      )}
                    </div>
                  </>
                )}
                {titleStep === 'chara' && (
                  <>
                    {stepHeader('自機選択', 'menu', 'タイトル')}
                    <div style={{ fontSize: 12, color: '#d8a7c3', marginBottom: 10 }}>{runCaption} ― 誰で異変に挑む？</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {([
                        { id: 'reimu' as CharaId, name: '博麗霊夢', trait: '誘導・広角ショット／標準速度', desc: '博麗神社の巫女。お札と御札の誘導弾で広く戦う。' },
                        { id: 'marisa' as CharaId, name: '霧雨魔理沙', trait: '集中レーザー／高速', desc: '普通の魔法使い。正面火力と速さで押し切る。' },
                      ]).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="kouma-card"
                          onClick={() => { setChara(c.id); setTitleStep('diff'); touchTitle() }}
                          style={{
                            flex: 1, background: 'rgba(16,5,24,0.72)', color: '#fff', cursor: 'pointer',
                            border: chara === c.id ? '2px solid rgba(255,150,150,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: 10, textAlign: 'left',
                          }}
                        >
                          {portraitEl(c.id, c.name, { width: '100%', height: 208, borderRadius: 8, display: 'block' })}
                          <div style={{ fontSize: 17, fontWeight: 'bold', marginTop: 8 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, color: '#ffb3b3', marginTop: 2 }}>{c.trait}</div>
                          <div style={{ fontSize: 11, color: '#cfc4e8', lineHeight: 1.6, marginTop: 4 }}>{c.desc}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {titleStep === 'diff' && (
                  <>
                    {stepHeader('難易度選択', 'chara', '自機選択')}
                    <div style={{ fontSize: 12, color: '#d8a7c3', marginBottom: 10 }}>
                      {chara === 'reimu' ? '博麗霊夢' : '霧雨魔理沙'} ／ {runCaption}
                      {pendingRun === 'extra' && '（EXは難易度で弾幕の密度・速度が変わります）'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {([
                        { id: 'easy' as DiffId, name: 'Easy', desc: pendingRun === 'extra' ? '弾幕は薄め。EXのお試しに' : '5面まで。弾幕は薄めで遊びやすい' },
                        { id: 'normal' as DiffId, name: 'Normal', desc: '標準の歯ごたえ' },
                        { id: 'hard' as DiffId, name: 'Hard', desc: '弾幕の密度・速度アップ' },
                      ]).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="kouma-card"
                          onClick={() => { setDiff(d.id); getBgm(); startRef.current(pendingRun) }}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 14, width: '100%',
                            background: 'rgba(16,5,24,0.72)', color: '#fff', cursor: 'pointer',
                            border: diff === d.id ? '2px solid rgba(255,150,150,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: '13px 16px', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 19, fontWeight: 'bold', letterSpacing: 1 }}>{d.name}</span>
                          <span style={{ fontSize: 12, color: '#cfc4e8' }}>{d.desc}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {titleStep === 'records' && (
                  <>
                    {stepHeader('記録表示', 'menu', 'タイトル')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: 1.9 }}>
                      <div>
                        <div style={selLabel}>ハイスコア（通常モード）</div>
                        <div style={{ fontSize: 22, fontFamily: 'monospace' }}>{hiscoreUi.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={selLabel}>チャレンジベスト（残機無限）</div>
                        {challengeBest.score > 0 ? (
                          <div style={{ fontSize: 22, fontFamily: 'monospace' }}>
                            {challengeBest.score.toLocaleString()}
                            <span style={{ fontSize: 13, color: '#d8a7c3' }}>　ミス {challengeBest.misses}回</span>
                          </div>
                        ) : (
                          <div style={{ color: '#b39ddb' }}>まだ記録がありません</div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#cfc4e8' }}>
                        EXTRA STAGE（フランドール戦）は最初からいつでも挑戦できます。<br />
                        Normal以上で全6面をクリアすると、EX解放の記録が残ります。
                      </div>
                    </div>
                  </>
                )}
                {titleStep === 'help' && (
                  <>
                    {stepHeader('遊び方', 'menu', 'タイトル')}
                    <div style={{ fontSize: 13, lineHeight: 2.05, color: '#efe7f7' }}>
                      紅い霧に覆われた幻想郷。湖の向こうの紅魔館を目指し、全6面＋EXステージを進もう。<br />
                      移動：矢印キー / WASD（タッチはドラッグ）<br />
                      ショット：Z（タッチ中は自動）　ボム：X（画面ボタンでも可）<br />
                      低速移動：Shift（当たり判定が表示される）<br />
                      BGMミュート：M（右上のボタンでも可）<br />
                      会話：タップ / クリック / Z / Enter で送る。Esc か「スキップ」で省略できる。<br />
                      敵弾に近づくとかすり（GRAZE）で得点。アイテムを集めてパワーアップ。<br />
                      チャレンジモードは残機無限で、ミス回数が記録される。
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })()}
        {(screen === 'over' || screen === 'clear') && (
          <div style={overlayStyle}>
            <div style={{ fontSize: 30, fontWeight: 'bold', color: screen === 'clear' ? '#ffd54f' : '#ff5252' }}>
              {endTitle || (screen === 'clear' ? 'ALL CLEAR!' : 'GAME OVER')}
            </div>
            <div style={{ fontSize: 14, color: '#d1c4e9' }}>{endSub}</div>
            <div style={{ fontSize: 20, fontFamily: 'monospace' }}>SCORE {finalScore.toLocaleString()}</div>
            {endChallenge && (
              <div style={{ fontSize: 14, color: '#ffd54f' }}>
                チャレンジモード：ミス {finalMisses}回
                {challengeBest.score > 0 && (
                  <span>　／　ベスト {challengeBest.score.toLocaleString()}（ミス {challengeBest.misses}回）</span>
                )}
              </div>
            )}
            <button type="button" className="kouma-btn" style={{ ...btnStyle, marginTop: 6 }} onClick={() => { getBgm(); startRef.current('story') }}>
              もう一度遊ぶ
            </button>
            <button
              type="button"
              onClick={() => { setScreen('title'); setTitleStep('menu'); getBgm().play('title') }}
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
