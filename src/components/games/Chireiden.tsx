// 地霊殿弾幕STG（ファンメイド）
// 東方地霊殿にインスパイアされたオリジナルの縦スクロール弾幕シューティング。
// 原作の素材（画像・音楽・データ）は一切使わず、描画はすべて Canvas の図形、
// BGM は WebAudio で合成する完全オリジナル曲（ZUN風アレンジの文法で作曲）。
// 進行は全6面＋EXステージ（原作の構成を踏襲したファンメイド再現）。
// v1.1.0：面構成を原作準拠に全面再構成した（1面 中キスメ／ボス ヤマメ、2面 パルスィ、
// 3面 勇儀、4面 中 燐（猫形態）／ボス さとり、5面 燐、6面 中 燐（猫形態）／ボス 空、
// EX 中 早苗／ボス こいし）。さとりの想起は「自機の相棒・過去作ボスの技を、自機ごとに
// 変えて再演する」形に再設計し、這い寄る残響弾（テリブルスーヴニール相当）を追加。
// 空の最終スペルは「地獄『サブタレイニアンサン』」（巨大な太陽＋引力＋核警告）に差し替えた。
// ボス戦前／撃破後には会話シーン（台詞は自作文、ポートレートは自前生成イラストを
// public/cdn/chireiden/ から配信）があり、タイトル／選択画面も原作の構成に寄せている。
//
// 内部実装は紅魔郷弾幕STGと同じ自作エンジン2点を使用：
//  - danmaku-engine（弾プール／レーザー／Emitter／固定60Hzループ）
//  - toho-engine（ボス・自機・敵・アイテム・ステージ脚本・キャラ描画）
//
// 弾幕の「隙間ルール」（紅魔郷 v1.2.0 の監査基準を最初から適用）：
//  - 螺旋・ストリームは弾間隔（弾速×発射間隔）＞当たり判定直径を保つ
//  - リングには必ず開口部（欠け）を持たせるか、弧の間隔で抜け道を確保する
//  - 滞留弾で画面を飽和させない（発生率×寿命で同時存在数を抑える）
//  - 壁状パターンの重なりで抜け道が相殺されないよう、波のタイミングをずらす
import { useEffect, useRef, useState } from 'react'
import {
  DanmakuWorld,
  FixedLoop,
  SpiralEmitter,
  type Bullet,
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
  REIMU_FIGURE,
  MARISA_FIGURE,
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
const HISCORE_KEY = 'webx-chireiden-hiscore'
const CHALLENGE_KEY = 'webx-chireiden-challenge-best'
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

type BossId = 'kisume' | 'yamame' | 'parsee' | 'yuugi' | 'satori' | 'orin' | 'utsuho' | 'koishi' | 'sanae'
/** 会話シーンを持つボス（早苗はEX中ボス専任のため会話なし） */
type DlgBossId = 'yamame' | 'parsee' | 'yuugi' | 'satori' | 'orin' | 'utsuho' | 'koishi'
type MidId = BossId
type StageDef = { title: string; road: number; mid: MidId; midName: string; boss: DlgBossId; hue: number }
// 面構成は原作（東方地霊殿）準拠：中ボスは各面のボス本人が務める面が多く、
// 燐は猫形態で4・6面の中ボス、人型で5面の中ボス＋ボスを務める
const STAGES: StageDef[] = [
  { title: '地底への縦穴', road: 32, mid: 'kisume', midName: 'キスメ', boss: 'yamame', hue: 0 },
  { title: '旧都へ続く橋', road: 32, mid: 'parsee', midName: '水橋パルスィ', boss: 'parsee', hue: 2 },
  { title: '旧都温泉街', road: 34, mid: 'yuugi', midName: '星熊勇儀', boss: 'yuugi', hue: 3 },
  { title: '地霊殿の広間', road: 34, mid: 'orin', midName: '火焔猫燐（猫形態）', boss: 'satori', hue: 4 },
  { title: '地霊殿の回廊', road: 34, mid: 'orin', midName: '火焔猫燐', boss: 'orin', hue: 1 },
  { title: '灼熱地獄跡', road: 36, mid: 'orin', midName: '火焔猫燐（猫形態）', boss: 'utsuho', hue: 5 },
  { title: '無意識の薔薇園', road: 34, mid: 'sanae', midName: '東風谷早苗', boss: 'koishi', hue: 6 },
]
// ステージごとの背景グラデーション [上, 中, 下]（地底の色調）
const BG_PALS: [string, string, string][] = [
  ['#0a0610', '#160b20', '#241028'],
  ['#0d0a06', '#1d1408', '#2e1e0c'],
  ['#06140c', '#0c2416', '#12301e'],
  ['#140806', '#2a0f08', '#3d180c'],
  ['#10061c', '#1e0b33', '#2c1145'],
  ['#180403', '#330a05', '#571503'],
  ['#0c0414', '#1c0730', '#2e0b45'],
]

// ===== キャラ描画（全員ローカル FigureDef） =====
const SKIN = { skin: '#ffe7d6', skinShade: '#f2c9a4' }
const KISUME_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#33544c', hairShade: '#1e352f', eye: '#7a4fd0',
    dress: '#5b3a6e', dressShade: '#3e2749', sub: '#efe6f7', accent: '#c9a86a',
  },
  hairStyle: 'twin', accessory: 'none', wings: 'none',
}
const YAMAME_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#b08a4a', hairShade: '#7d5c28', eye: '#4d7c0f',
    dress: '#7c5a30', dressShade: '#54401f', sub: '#f3e9d2', accent: '#a03d3d',
  },
  hairStyle: 'medium', accessory: 'ribbon', wings: 'none',
}
const PARSEE_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#d9c25e', hairShade: '#a68e35', eye: '#3f9e4d',
    dress: '#3f7a5e', dressShade: '#2a5340', sub: '#eef7ee', accent: '#ffd54f',
  },
  hairStyle: 'medium', accessory: 'ribbon', wings: 'none',
}
const YUUGI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#e8c96a', hairShade: '#b3963e', eye: '#d8404a',
    dress: '#46689c', dressShade: '#2f4a73', sub: '#f7f3ea', accent: '#d8404a',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
}
const SATORI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#d8a7c8', hairShade: '#a06a90', eye: '#c23b4e',
    dress: '#7766c2', dressShade: '#52439c', sub: '#f3eefc', accent: '#e0455a',
  },
  hairStyle: 'short', accessory: 'none', wings: 'none',
}
const UTSUHO_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#2e2a33', hairShade: '#17141c', eye: '#e0483b',
    dress: '#3d7a47', dressShade: '#2a5431', sub: '#f7f3ea', accent: '#ff7043',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'bat',
}
const KOISHI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#7fae7a', hairShade: '#557f52', eye: '#5a8c5a',
    dress: '#8aa653', dressShade: '#5f7539', sub: '#fdf6da', accent: '#7e57c2',
  },
  hairStyle: 'short', accessory: 'none', wings: 'none',
}
const ORIN_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#cf3a30', hairShade: '#8c2418', eye: '#c22f3d',
    dress: '#3a4a42', dressShade: '#24312b', sub: '#f3e9d2', accent: '#1c1c22',
  },
  hairStyle: 'twin', accessory: 'ribbon', wings: 'none',
}
// 猫形態のお燐：色調を変えて猫っぽさを出す（フィギュアに猫耳の部品は無いため色と名前で表現）
const ORIN_CAT_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#d8542e', hairShade: '#9c3517', eye: '#3f9e4d',
    dress: '#57443a', dressShade: '#38291f', sub: '#f7e8d2', accent: '#1c1c22',
  },
  hairStyle: 'twin', accessory: 'ribbon', wings: 'none',
}
const SANAE_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#5da85e', hairShade: '#3c7a40', eye: '#3a6bc2',
    dress: '#3f5f9e', dressShade: '#2c4472', sub: '#f7f3ea', accent: '#e8c33a',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const BOSS_FIGURES: Record<BossId, FigureDef> = {
  kisume: KISUME_FIG,
  yamame: YAMAME_FIG,
  parsee: PARSEE_FIG,
  yuugi: YUUGI_FIG,
  satori: SATORI_FIG,
  orin: ORIN_FIG,
  utsuho: UTSUHO_FIG,
  koishi: KOISHI_FIG,
  sanae: SANAE_FIG,
}
const MID_FIGURES: Record<MidId, FigureDef> = { ...BOSS_FIGURES }
/** 中ボスの姿：お燐は5面（stageIdx 4）だけ人型、それ以外は猫形態 */
function midFigOf(id: MidId, stageIdx: number): FigureDef {
  if (id === 'orin' && stageIdx !== 4) return ORIN_CAT_FIG
  return MID_FIGURES[id]
}

// ===== 難易度ヘルパー（BossContext の diff を現行の rn/iv 相当に読み替える） =====
const cntOf = (ctx: BossContext, n: number) => Math.max(3, Math.round(n * ctx.diff.den))
const ivOf = (ctx: BossContext, base: number) => base / ctx.diff.den
const spdOf = (ctx: BossContext, base: number) => base * ctx.diff.spd

// ===== 自機定義（紅魔郷と同じショット構成・速度） =====
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

// ===== 共通パターンヘルパー（隙間ルールを満たす形で使い回す） =====
type RingOpts = { speed: number; r: number; color: number; kind?: 'orb' | 'big' | 'bubble' | 'ellipse' | 'knife' | 'star'; angle?: number }
/** リングを「欠け」つきで撃つ。skip に入れたインデックスは発射しない */
function ringSkip(ctx: BossContext, n: number, skip: ReadonlySet<number>, o: RingOpts) {
  const base = o.angle ?? 0
  for (let i = 0; i < n; i++) {
    if (skip.has(i)) continue
    ctx.spawn({
      x: ctx.bossX(), y: ctx.bossY(), angle: base + (i / n) * Math.PI * 2,
      speed: spdOf(ctx, o.speed), r: o.r, color: o.color, kind: o.kind ?? 'orb',
    })
  }
}
/** 角度 gapCenter から ±gapHalf(rad) の範囲を欠けさせたリング */
function ringGapArc(ctx: BossContext, n: number, gapCenter: number, gapHalf: number, o: RingOpts) {
  const skip = new Set<number>()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    let d = Math.abs(((a - gapCenter) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
    if (d < gapHalf) skip.add(i)
  }
  ringSkip(ctx, n, skip, o)
}
/** 釣瓶の雨：6列中1〜2列を必ず抜き、横64px以上の抜け道を残す */
function bucketRain(ctx: BossContext, wave: number) {
  const skipA = wave % 6
  const skipB = (wave * 2 + 3) % 6
  for (let i = 0; i < 6; i++) {
    if (i === skipA || i === skipB) continue
    ctx.spawn({
      x: 32 + i * 64, y: -16, angle: DOWN, speed: spdOf(ctx, 150),
      r: 6.5, color: 5, kind: 'big',
    })
  }
}
/** 蜘蛛の網リング：対向する2か所に大きな欠けを持つリング（ヤマメ／さとり想起で共用） */
function webRing(ctx: BossContext, rot: number, color = 3) {
  const n = 18
  const skip = new Set<number>()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    for (const c of [rot, rot + Math.PI]) {
      const d = Math.abs(((a - c) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
      if (d < 0.46) skip.add(i)
    }
  }
  ringSkip(ctx, n, skip, { speed: 64, r: 4.5, color })
}
/** 大玉の扇（勇儀／さとり想起／お空で共用）：自機方向へ大きな遅い弾を扇状に */
function bigFan(ctx: BossContext, n: number, spread: number, speed: number, r: number, color: number) {
  const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * spread
    ctx.spawn({
      x: ctx.bossX(), y: ctx.bossY() + 4, angle: base + off,
      speed: spdOf(ctx, speed), r, color, kind: 'big',
    })
  }
}

// ===== ボス定義（BossDef への変換） =====
// ===== 太陽の引力（お空の最終スペル専用） =====
// フェイズの setup/update が書き込み、コンポーネント側の stepGame が自機へ適用し、
// draw が太陽と WARNING の staging を描く。teardown／ステージ開始で必ず null に戻す。
let gravityWell: { x: number; y: number; pull: number; warn: number } | null = null

const BONUS = { bonusBase: 1_000_000, bonusPerSec: 20_000 }

function buildBossDef(id: DlgBossId, chara: CharaId): BossDef {
  switch (id) {
    case 'yamame': return {
      id, name: '黒谷ヤマメ', epithet: '暗い洞窟の明るい土蜘蛛', radius: 22, figure: BOSS_FIGURES.yamame,
      phases: [
        {
          name: null, hp: 520, timeLimit: 40, move: 'sine', moveRange: 110, moveSpeed: 0.7,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 2.3)
              // 欠けのあるリング：弧間隔（R=70で約31px）に加え、約77pxの開口部が回転する
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 72, r: 4.5, color: 3 })
              s.ang += 0.55
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.2); ctx.aimed(3, 0.18, { speed: 122, r: 4, color: 3 }) }
          },
        },
        {
          name: '罠符「キャプチャーウェブ」', hp: 920, timeLimit: 55, move: 'hover', moveRange: 40, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 網の縦糸：8方向へ「糸の結び目」を打ち出し、放射状の糸＋同心リングで
              // 実際の蜘蛛の巣（格子）を作る。糸に沿った間隔は 60×0.28=16.8px ＞
              // 当たり判定直径9px で、結び目の間を縫って格子を抜けられる
              s.a1 = ivOf(ctx, 0.28)
              s.ang += 0.045
              for (let k = 0; k < 8; k++) {
                const a = s.ang + (k / 8) * Math.PI * 2
                ctx.spawn({
                  x: ctx.bossX() + Math.cos(a) * 24, y: ctx.bossY() + Math.sin(a) * 24,
                  angle: a, speed: spdOf(ctx, 60), r: 4.5, color: 3, kind: 'orb',
                })
              }
            }
            if (s.a2 <= 0) {
              // 網の横糸：対向2か所に大きな欠け（各約0.92rad）を持つリング
              s.a2 = ivOf(ctx, 2.3)
              webRing(ctx, s.ang * 2 + 0.4)
            }
            if (s.a3 <= 0) { s.a3 = ivOf(ctx, 1.7); ctx.aimed(1, 0, { speed: 118, r: 4, color: 3 }) }
          },
        },
        {
          name: '瘴符「淀んだ瘴気」', hp: 1050, timeLimit: 55, move: 'sine', moveRange: 110, moveSpeed: 0.7, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 1.5)
              // 滞留する瘴気弾：発生 3発/1.5s、落下に約8秒 → 同時存在は約16発で飽和しない
              for (let i = 0; i < 3; i++) {
                ctx.spawn({
                  x: ctx.bossX() + (Math.random() - 0.5) * 60, y: ctx.bossY() + 6,
                  angle: DOWN + (Math.random() - 0.5) * 0.6, speed: spdOf(ctx, 52),
                  r: 6, color: 3, kind: 'bubble', swayAmp: 10, swayFreq: 1.2, swayPhase: Math.random() * 6.28,
                })
              }
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.8)
              ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.5, { speed: 66, r: 4.5, color: 3 })
              s.ang += 0.7
            }
          },
        },
      ],
    }
    case 'parsee': return {
      id, name: '水橋パルスィ', epithet: '地底の橋姫', radius: 22, figure: BOSS_FIGURES.parsee,
      phases: [
        {
          name: null, hp: 580, timeLimit: 40, move: 'sine', moveRange: 115, moveSpeed: 0.85,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.0); ctx.aimed(5, 0.16, { speed: 128, r: 4, color: 3 }) }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.4)
              ringGapArc(ctx, cntOf(ctx, 10), s.ang, 0.62, { speed: 70, r: 4.5, color: 3 })
              s.ang += 0.8
            }
          },
        },
        {
          name: '嫉妬「グリーンアイドモンスター」', hp: 1000, timeLimit: 55, move: 'sine', moveRange: 115, moveSpeed: 0.85, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 1.3
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 二重渦（基礎弾幕）：弾間隔 94×0.17≒16.0px（Hardでも約13px）＞ 当たり判定直径9px
              s.a1 = ivOf(ctx, 0.17)
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 94), r: 4.5, color: 3, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: -s.ang + 0.8, speed: spdOf(ctx, 94), r: 4.5, color: 3, kind: 'orb' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.2); ctx.aimed(3, 0.18, { speed: 124, r: 4, color: 3 }) }
            // ===== 嫉妬ゲージ：自機の行動に反応して溜まり、溢れると苛烈化する =====
            // グレイズ（かすり）した弾を数える：world.collide が立てた grazed フラグを読む
            for (const b of ctx.world.pool.bullets) {
              if (b.active && b.grazed && !s.seen.has(b)) {
                s.seen.add(b)
                if (s.gauge < 14) s.gauge += 1
              }
            }
            if (s.seen.size > 500) s.seen.clear()
            if (s.a3 <= 0) {
              // 近づかれるのも、上（橋の向こう）まで来られるのも妬ましい
              s.a3 = 0.25
              const dx = ctx.player.x - ctx.bossX(), dy = ctx.player.y - ctx.bossY()
              if (Math.hypot(dx, dy) < 120) s.gauge += 2
              else if (ctx.player.y < 150) s.gauge += 1
            }
            if (s.cool > 0) s.cool -= dt
            if (s.gauge >= 7 && s.cool <= 0 && s.burstT <= 0) {
              // 妬みが溢れた：その瞬間の自機位置を覚え、0.5秒後に収縮リングでぶつける
              s.snapX = ctx.player.x; s.snapY = ctx.player.y
              s.burstT = 0.5
              s.gauge = 2
              s.cool = 3.2
            }
            if (s.burstT > 0) {
              s.burstT -= dt
              if (s.burstT <= 0) {
                // 収縮リング：R=118・14発（弧間隔は約53px）。リングが現れる位置が予告を兼ね、
                // ボス方向に約2発分の欠けを残して逃げ道を保証する
                const cx = s.snapX, cy = s.snapY
                const n = 14, R = 118
                const gapC = Math.atan2(ctx.bossY() - cy, ctx.bossX() - cx)
                for (let i = 0; i < n; i++) {
                  const a = (i / n) * Math.PI * 2
                  const d = Math.abs(((a - gapC) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
                  if (d < (Math.PI * 2 / n) * 1.1) continue
                  ctx.spawn({
                    x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R,
                    angle: a + Math.PI, speed: spdOf(ctx, 46), r: 4.5, color: 6, kind: 'orb',
                  })
                }
              }
            }
          },
        },
        {
          name: '嫉符「連鎖ジェラシー」', hp: 1200, timeLimit: 55, move: 'hover', moveRange: 60, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 2.2)
              // 連鎖リング1段目（弧間隔は R=90 で約43px）。0.45秒後に半ステップずれた2段目が続く
              ringSkip(ctx, cntOf(ctx, 13), new Set(), { speed: 76, r: 4.5, color: 3, angle: s.ang })
              s.a3 = 0.45
              s.ang += 0.31
            }
            if (s.a3 > 0) {
              s.a3 -= dt
              if (s.a3 <= 0) {
                // 2段目：1段目との半径差は 76×0.45≒34px あり、壁として重ならない
                ringSkip(ctx, cntOf(ctx, 13), new Set(), { speed: 76, r: 4.5, color: 3, angle: s.ang + Math.PI / 13 })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.6); ctx.aimed(3, 0.16, { speed: 132, r: 4, color: 3 }) }
          },
        },
      ],
    }
    case 'yuugi': return {
      id, name: '星熊勇儀', epithet: '語られる怪力乱神', radius: 22, figure: BOSS_FIGURES.yuugi,
      phases: [
        {
          name: null, hp: 640, timeLimit: 40, move: 'sine', moveRange: 85, moveSpeed: 0.5,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.3); bigFan(ctx, 3, 0.3, 64, 8, 0) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.1); ctx.aimed(3, 0.16, { speed: 126, r: 4, color: 0 }) }
          },
        },
        {
          name: '鬼力「怪力乱神」', hp: 1100, timeLimit: 55, move: 'hover', moveRange: 50, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 大玉の扇：R=120 での隣接間隔は約29px ＞ 大玉の当たり判定直径17px
              s.a1 = ivOf(ctx, 1.5)
              bigFan(ctx, 5, 0.24, 70, 8.5, 0)
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 3.2)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang, 0.5, { speed: 60, r: 4.5, color: 0 })
              s.ang += 0.6
            }
          },
        },
        {
          name: '四天王奥義「三歩必殺」', hp: 1350, timeLimit: 60, move: 'teleport', moveRange: 120, moveSpeed: 0.56, params: { interval: 1.35 }, ...BONUS,
          setup: (ctx) => { phaseState(ctx).a1 = 1.3 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt
            if (s.a1 <= 0) {
              // テレポートの歩みに合わせた衝撃波リング（欠けつき）。
              // 間隔は move の interval と同じ 1.35 秒に固定して歩みと同期させる
              s.a1 = 1.35
              ringGapArc(ctx, cntOf(ctx, 20), s.ang, 0.48, { speed: 88, r: 4.5, color: 0 })
              s.ang += 0.9
              bigFan(ctx, 3, 0.26, 76, 8, 0)
            }
          },
        },
      ],
    }
    case 'satori': return {
      id, name: '古明地さとり', epithet: '心を読む地霊殿の主', radius: 22, figure: BOSS_FIGURES.satori,
      phases: [
        {
          name: null, hp: 660, timeLimit: 45, move: 'sine', moveRange: 30, moveSpeed: 0.34,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 心読み：1発目を撃ち、0.35秒後にもう一度「現在の位置」へ撃ち直す
              s.a1 = ivOf(ctx, 1.5)
              ctx.aimed(1, 0, { speed: 150, r: 4, color: 5 })
              s.a3 = 0.35
            }
            if (s.a3 > 0) {
              s.a3 -= dt
              if (s.a3 <= 0) ctx.aimed(1, 0, { speed: 160, r: 4, color: 5 })
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.6)
              ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.5, { speed: 68, r: 4.5, color: 5 })
              s.ang += 0.7
            }
          },
        },
        {
          // テリブルスーヴニール相当（自作解釈）：自機の移動軌跡を読み取り、
          // 少し遅れて軌跡上に「残響弾」を置く。這い寄るように過去の位置が蘇る
          name: '想起「テリブルスーヴニール」', hp: 1100, timeLimit: 60, move: 'hover', moveRange: 40, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            // 自機の移動軌跡を 0.12 秒ごとに記録する（最大50点＝6秒分）
            s.trailT -= dt
            if (s.trailT <= 0) {
              s.trailT = 0.12
              s.trail.push({ x: ctx.player.x, y: ctx.player.y })
              if (s.trail.length > 50) s.trail.shift()
            }
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.5); ctx.aimed(2, 0.14, { speed: 138, r: 4, color: 5 }) }
            if (s.a2 <= 0) {
              // 残響弾：軌跡を3点おきに間引いて置く。連続配置の間隔は26px以上、
              // 現在の自機位置から40px以内には置かない（壁化と理不尽な密着を防ぐ）。
              // 置かれた弾はゆっくり沈むだけで、追尾はしない
              s.a2 = ivOf(ctx, 2.1)
              let lx = -999, ly = -999, placed = 0
              for (let i = 0; i < s.trail.length; i += 3) {
                const p = s.trail[i]
                if (Math.hypot(p.x - lx, p.y - ly) < 26) continue
                if (Math.hypot(p.x - ctx.player.x, p.y - ctx.player.y) < 40) continue
                lx = p.x; ly = p.y
                placed += 1
                if (placed > 10) break
                ctx.spawn({
                  x: p.x, y: p.y, angle: DOWN, speed: spdOf(ctx, 34),
                  r: 4, color: 5, kind: 'orb', swayAmp: 6, swayFreq: 1.4, swayPhase: i * 0.7,
                })
              }
            }
          },
        },
        // 想起その1：自機の相棒・過去作の相手の技を再演する（原作の想起の構造）
        ...(chara === 'reimu'
          ? [{
              // 霊夢の相棒（紫）ゆかり：幽々子の蝶の二重渦（妖々夢）
              name: '想起「二重黒死蝶」', hp: 1150, timeLimit: 55, move: 'sine' as const, moveRange: 90, moveSpeed: 0.5, ...BONUS,
              update: (ctx: BossContext, dt: number) => {
                const s = phaseState(ctx)
                s.ang += dt * 1.5
                s.a1 -= dt; s.a2 -= dt
                if (s.a1 <= 0) {
                  // 蝶の二重渦：弾間隔 88×0.19≒16.7px（Hardでも約13.6px）＞ 当たり判定直径9px
                  s.a1 = ivOf(ctx, 0.19)
                  ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 88), r: 4.5, color: 6, kind: 'ellipse' })
                  ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: -s.ang + 1.2, speed: spdOf(ctx, 88), r: 4.5, color: 0, kind: 'ellipse' })
                }
                if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.8); ctx.aimed(1, 0, { speed: 132, r: 4, color: 6 }) }
              },
            }]
          : [{
              // 魔理沙の相棒：アリスの人形砲台（妖々夢）
              name: '想起「上海人形」', hp: 1150, timeLimit: 55, move: 'hover' as const, moveRange: 50, moveSpeed: 0.45, ...BONUS,
              update: (ctx: BossContext, dt: number) => {
                const s = phaseState(ctx)
                s.a1 -= dt; s.a2 -= dt
                if (s.a1 <= 0) {
                  // 左右の人形（ボス±56px）が交互に3方向の扇を撃つ
                  s.a1 = ivOf(ctx, 1.15)
                  s.n += 1
                  const ox = ctx.bossX() + (s.n % 2 === 0 ? -56 : 56), oy = ctx.bossY() + 10
                  const base = Math.atan2(ctx.player.y - oy, ctx.player.x - ox)
                  for (let k = -1; k <= 1; k++) {
                    ctx.spawn({ x: ox, y: oy, angle: base + k * 0.2, speed: spdOf(ctx, 118), r: 4, color: 4, kind: 'orb' })
                  }
                }
                if (s.a2 <= 0) {
                  s.a2 = ivOf(ctx, 2.8)
                  ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 64, r: 4.5, color: 5 })
                  s.ang += 0.7
                }
              },
            }]),
        // 想起その2：もう一人の過去作ボス
        ...(chara === 'reimu'
          ? [{
              // 霊夢が紅魔郷で戦ったレミリアの霧
              name: '想起「スカーレットミスト」', hp: 1250, timeLimit: 60, move: 'sine' as const, moveRange: 100, moveSpeed: 0.55, ...BONUS,
              update: (ctx: BossContext, dt: number) => {
                const s = phaseState(ctx)
                s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
                if (s.a1 <= 0) {
                  // 紅い霧：滞留する泡弾がゆっくり沈む。発生2発/1.3s・寿命約8秒で同時約12発
                  s.a1 = ivOf(ctx, 1.3)
                  for (let i = 0; i < 2; i++) {
                    ctx.spawn({
                      x: ctx.bossX() + (Math.random() - 0.5) * 70, y: ctx.bossY() + 6,
                      angle: DOWN + (Math.random() - 0.5) * 0.5, speed: spdOf(ctx, 46),
                      r: 6, color: 0, kind: 'bubble', swayAmp: 12, swayFreq: 0.9, swayPhase: Math.random() * 6.28,
                    })
                  }
                }
                if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.6); ctx.aimed(3, 0.16, { speed: 126, r: 4, color: 0 }) }
                if (s.a3 <= 0) {
                  s.a3 = ivOf(ctx, 3.6)
                  ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 62, r: 4.5, color: 0 })
                  s.ang += 0.6
                }
              },
            }]
          : [{
              // 魔理沙の相棒：パチュリーの炎の渦（紅魔郷）
              name: '想起「アグニシャイン」', hp: 1250, timeLimit: 60, move: 'hover' as const, moveRange: 50, moveSpeed: 0.45, ...BONUS,
              update: (ctx: BossContext, dt: number) => {
                const s = phaseState(ctx)
                s.ang += dt * 2.2
                s.a1 -= dt; s.a2 -= dt
                if (s.a1 <= 0) {
                  // 炎の渦：弾間隔 96×0.13≒12.5px（Hardでも約10.2px）＞ 当たり判定直径9px
                  s.a1 = ivOf(ctx, 0.13)
                  ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 96), r: 4.5, color: 0, kind: 'orb' })
                  ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + Math.PI, speed: spdOf(ctx, 96), r: 4.5, color: 1, kind: 'orb' })
                }
                if (s.a2 <= 0) {
                  s.a2 = ivOf(ctx, 2.4)
                  ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.5, { speed: 64, r: 4.5, color: 0 })
                }
              },
            }]),
      ],
    }
    case 'orin': return {
      id, name: '火焔猫燐', epithet: '地獄の輪禍', radius: 22, figure: BOSS_FIGURES.orin,
      phases: [
        {
          name: null, hp: 700, timeLimit: 45, move: 'sine', moveRange: 100, moveSpeed: 0.6,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 猫車が運ぶ亡霊：泡状の霊弾が漂いながら沈む
              s.a1 = ivOf(ctx, 1.4)
              for (let i = 0; i < 3; i++) {
                ctx.spawn({
                  x: ctx.bossX() + (i - 1) * 22, y: ctx.bossY() + 8,
                  angle: DOWN + (i - 1) * 0.3, speed: spdOf(ctx, 56),
                  r: 5.5, color: 6, kind: 'bubble', swayAmp: 9, swayFreq: 1.3, swayPhase: Math.random() * 6.28,
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.2); ctx.aimed(2, 0.15, { speed: 124, r: 4, color: 0 }) }
          },
        },
        {
          name: '猫符「キャッツサーカス」', hp: 1200, timeLimit: 55, move: 'hover', moveRange: 46, moveSpeed: 0.5, ...BONUS,
          setup: (ctx) => {
            const sp = new SpiralEmitter()
            // 猫の輪舞：弾間隔 88×0.24=21.1px（Hardでも約17px）＞ 当たり判定直径9px
            sp.arms = 5; sp.angleVel = -0.9; sp.interval = ivOf(ctx, 0.24)
            sp.bullet = { speed: spdOf(ctx, 88), r: 4.5, color: 0, kind: 'orb' }
            ctx.addEmitter(sp)
          },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 3.1)
              ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 62, r: 4.5, color: 0 })
              s.ang += 0.7
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.8); ctx.aimed(2, 0.15, { speed: 126, r: 4, color: 6 }) }
          },
        },
        {
          name: '恨霊「ゾンビフェアリー」', hp: 1400, timeLimit: 60, move: 'sine', moveRange: 100, moveSpeed: 0.6, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 画面下から湧き上がる怨霊：縦間隔は 74×0.55≒41px で、横の列もランダムに散る
              s.a1 = ivOf(ctx, 0.55)
              ctx.spawn({
                x: 20 + Math.random() * (FW - 40), y: FH + 12,
                angle: -DOWN + (Math.random() - 0.5) * 0.24, speed: spdOf(ctx, 74),
                r: 4, color: 7, kind: 'star',
              })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.6); ctx.aimed(3, 0.18, { speed: 122, r: 4, color: 6 }) }
            if (s.a3 <= 0) {
              s.a3 = ivOf(ctx, 3.4)
              ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 60, r: 4.5, color: 6 })
              s.ang += 0.6
            }
          },
        },
      ],
    }
    case 'utsuho': return {
      id, name: '霊烏路空', epithet: '核熱の地獄鴉', radius: 22, figure: BOSS_FIGURES.utsuho,
      phases: [
        {
          name: null, hp: 760, timeLimit: 45, move: 'sine', moveRange: 120, moveSpeed: 0.65,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.4); bigFan(ctx, 3, 0.28, 72, 8, 1) }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.05); ctx.aimed(3, 0.16, { speed: 124, r: 4, color: 1 }) }
          },
        },
        {
          name: '核熱「ニュークリアフュージョン」', hp: 1300, timeLimit: 60, move: 'sine', moveRange: 120, moveSpeed: 0.65, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 核弾の扇：R=130 での隣接間隔は約34px ＞ 大玉の当たり判定直径16px
              s.a1 = ivOf(ctx, 1.5)
              bigFan(ctx, 5, 0.26, 80, 8, 1)
            }
            if (s.a2 <= 0) {
              // 核分裂する巨大弾：自機方向へ進み、1.5秒後に破裂してリングに分裂する
              s.a2 = ivOf(ctx, 1.9)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              const b = ctx.spawn({
                x: ctx.bossX(), y: ctx.bossY() + 6, angle: base, speed: spdOf(ctx, 58),
                r: 13, color: 1, kind: 'big',
              })
              if (b) s.fus.push({ b, t: 0 })
            }
            // 分裂処理：寿命を迎えた核弾を、その場で欠けつきリングに変える
            for (let i = s.fus.length - 1; i >= 0; i--) {
              const f = s.fus[i]
              f.t += dt
              if (!f.b.active) { s.fus.splice(i, 1); continue }
              if (f.t >= 1.5) {
                const bx = f.b.x, by = f.b.y
                f.b.active = false
                s.fus.splice(i, 1)
                // 分裂リング：10発・連続2発分の欠け。弧間隔は R=60 で約38px
                const n = 10
                const skipAt = Math.floor(Math.random() * n)
                for (let k = 0; k < n; k++) {
                  if (k === skipAt || k === (skipAt + 1) % n) continue
                  ctx.spawn({
                    x: bx, y: by, angle: (k / n) * Math.PI * 2 + Math.random() * 0.2,
                    speed: spdOf(ctx, 78), r: 4, color: 1, kind: 'orb',
                  })
                }
              }
            }
          },
        },
        {
          name: '制御不能「セルフトカマク」', hp: 1500, timeLimit: 65, move: 'hover', moveRange: 46, moveSpeed: 0.5, ...BONUS,
          setup: (ctx) => { phaseState(ctx).a2 = 1.5 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 膨張リング（空中心・欠けつき）
              s.a1 = ivOf(ctx, 3.0)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang, 0.5, { speed: 62, r: 4.5, color: 1 })
              s.ang += 0.6
            }
            if (s.a2 <= 0) {
              // 収縮リング：空の周囲 R=100 から中心へ向かう（原作どおり中心は空）。
              // 自機方向に欠けを持ち、中心を横切った弾はそのまま外へ抜けるため壁として残らない
              s.a2 = ivOf(ctx, 3.0)
              const bx = ctx.bossX(), by = ctx.bossY()
              const n = cntOf(ctx, 16), R = 100
              const gapC = Math.atan2(ctx.player.y - by, ctx.player.x - bx)
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + s.ang
                const d = Math.abs(((a - gapC) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
                if (d < 0.5) continue
                ctx.spawn({
                  x: bx + Math.cos(a) * R, y: by + Math.sin(a) * R,
                  angle: a + Math.PI, speed: spdOf(ctx, 55), r: 4.5, color: 1, kind: 'orb',
                })
              }
            }
            if (s.a3 <= 0) { s.a3 = ivOf(ctx, 2.4); bigFan(ctx, 1, 0, 70, 8.5, 1) }
          },
        },
        {
          // 最終スペル：画面上空に巨大な太陽が居座り、自機を弱く引き寄せる。
          // 引力は「圧」なので弾密度は他の最終スペルより落として両立させる
          name: '地獄「サブタレイニアンサン」', hp: 1750, timeLimit: 70, move: 'drift', moveRange: 120, moveSpeed: 1.0, ...BONUS,
          setup: (ctx) => {
            const s = phaseState(ctx)
            s.sunX = FW / 2; s.sunY = 96
            gravityWell = { x: s.sunX, y: s.sunY, pull: 54, warn: 3.2 }
          },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            const t = ctx.phaseTime()
            // 太陽は上空をゆっくり漂う。引力の中心＝太陽の位置
            s.sunX = FW / 2 + Math.sin(t * 0.23) * 72
            s.sunY = 96 + Math.sin(t * 0.31) * 14
            if (gravityWell) {
              gravityWell.x = s.sunX
              gravityWell.y = s.sunY
              if (gravityWell.warn > 0) gravityWell.warn = Math.max(0, gravityWell.warn - dt)
            }
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 太陽からの渦弾：弾間隔 48×0.34≒16.3px ＞ 当たり判定直径9px
              s.a1 = ivOf(ctx, 0.34)
              s.ang += 0.62
              ctx.spawn({ x: s.sunX, y: s.sunY, angle: s.ang, speed: spdOf(ctx, 48), r: 4.5, color: 1, kind: 'orb' })
              ctx.spawn({ x: s.sunX, y: s.sunY, angle: s.ang + Math.PI, speed: spdOf(ctx, 48), r: 4.5, color: 0, kind: 'orb' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.8); bigFan(ctx, 1, 0, 72, 8.5, 1) }
            if (s.a3 <= 0) {
              s.a3 = ivOf(ctx, 5.2)
              // 太陽のコロナ：遅い欠けリング（欠けは自機方向＝逃げ道）
              const n = cntOf(ctx, 12)
              const gapC = Math.atan2(ctx.player.y - s.sunY, ctx.player.x - s.sunX)
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                const d = Math.abs(((a - gapC) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
                if (d < 0.5) continue
                ctx.spawn({ x: s.sunX, y: s.sunY, angle: a, speed: spdOf(ctx, 44), r: 4.5, color: 1, kind: 'orb' })
              }
            }
          },
          teardown: () => { gravityWell = null },
        },
      ],
    }
    case 'koishi': return {
      id, name: '古明地こいし', epithet: '無意識の少女', radius: 22, figure: BOSS_FIGURES.koishi,
      phases: [
        {
          name: null, hp: 820, timeLimit: 45, move: 'teleport', moveRange: 110, moveSpeed: 0.56, params: { interval: 2.3 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 0.95); ctx.aimed(5, 0.16, { speed: 138, r: 4, color: 6 }) }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.5)
              ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 74, r: 4.5, color: 6 })
              s.ang += 0.8
            }
          },
        },
        {
          name: '薔薇符「ローズカーテン」', hp: 1450, timeLimit: 60, move: 'sine', moveRange: 100, moveSpeed: 0.56, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.ang += dt * 2.4
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 薔薇の花弁のようにうねる二条の流れ：弾間隔 96×0.17=16.3px ＞ 当たり判定直径
              s.a1 = ivOf(ctx, 0.17)
              const wob = Math.sin(ctx.phaseTime() * 1.7) * 1.1
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + wob, speed: spdOf(ctx, 96), r: 4.5, color: 0, kind: 'orb' })
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + wob + Math.PI, speed: spdOf(ctx, 96), r: 4.5, color: 6, kind: 'orb' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.3); ctx.aimed(1, 0, { speed: 140, r: 4, color: 0 }) }
          },
        },
        {
          name: '本能「ハートの弾幕」', hp: 1650, timeLimit: 65, move: 'teleport', moveRange: 110, moveSpeed: 0.56, params: { interval: 2.8 }, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 2.9)
              // ハート形に弾を並べて放つ：並びの間隔は約16px、外へ膨らむほど広がる
              const bx = ctx.bossX(), by = ctx.bossY()
              const n = cntOf(ctx, 18)
              for (let k = 0; k < n; k++) {
                const th = (k / n) * Math.PI * 2
                const hx = 16 * Math.pow(Math.sin(th), 3)
                const hy = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)
                const px = bx + hx * 3.1, py = by - hy * 3.1
                ctx.spawn({
                  x: px, y: py, angle: Math.atan2(py - by, px - bx),
                  speed: spdOf(ctx, 58), r: 4.5, color: 0, kind: 'orb',
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.1); ctx.aimed(3, 0.16, { speed: 130, r: 4, color: 6 }) }
          },
        },
        {
          name: '無符「無意識の弾幕」', hp: 1950, timeLimit: 70, move: 'teleport', moveRange: 120, moveSpeed: 0.56, params: { interval: 2.0 }, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.8)
              // 画面の縁から不意に現れる弾：発生は毎秒約3.8発で、面を覆う密度にはならない
              for (let i = 0; i < 3; i++) {
                ctx.spawn({
                  x: 20 + Math.random() * (FW - 40), y: -12,
                  angle: DOWN + (Math.random() - 0.5) * 0.5, speed: spdOf(ctx, 105),
                  r: 4, color: 6, kind: 'orb',
                })
              }
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.0)
              // 左右の縁から自機へ向かう弾（各1発ずつ）
              for (const fromLeft of [true, false]) {
                const ex = fromLeft ? -12 : FW + 12
                const ey = 90 + Math.random() * 140
                ctx.spawn({
                  x: ex, y: ey, angle: Math.atan2(ctx.player.y - ey, ctx.player.x - ex),
                  speed: spdOf(ctx, 100), r: 4, color: 6, kind: 'orb',
                })
              }
            }
            if (s.a3 <= 0) { s.a3 = ivOf(ctx, 1.4); ctx.aimed(3, 0.16, { speed: 128, r: 4, color: 6 }) }
          },
        },
      ],
    }
  }
}

// フェイズごとの作業変数（acc/angle/カウンタ）の置き場。紅魔郷と同じ共有方式。
type PhaseState = {
  a1: number; a2: number; a3: number; ang: number; n: number
  /** さとり「テリブルスーヴニール」用：自機の移動軌跡 */
  trail: { x: number; y: number }[]
  trailT: number
  /** お空「ニュークリアフュージョン」用：分裂待ちの核弾 */
  fus: { b: Bullet; t: number }[]
  /** パルスィの嫉妬用：グレイズ済みとして数えた弾 */
  seen: Set<Bullet>
  gauge: number
  cool: number
  burstT: number
  snapX: number
  snapY: number
  /** お空「サブタレイニアンサン」用：太陽の位置 */
  sunX: number
  sunY: number
}
function freshPhaseState(): PhaseState {
  return {
    a1: 0, a2: 0, a3: 0, ang: 0, n: 0,
    trail: [], trailT: 0, fus: [], seen: new Set(), gauge: 0, cool: 0,
    burstT: 0, snapX: 0, snapY: 0, sunX: FW / 2, sunY: 96,
  }
}
let activePhaseState: PhaseState = freshPhaseState()
function phaseState(_ctx: BossContext): PhaseState {
  return activePhaseState
}
/** フェイズごとに独立した作業変数を持たせ、開始時にリセットする */
function finBoss(def: BossDef): BossDef {
  for (const ph of def.phases) {
    const st: PhaseState = freshPhaseState()
    const origSetup = ph.setup
    ph.setup = (ctx) => {
      Object.assign(st, freshPhaseState())
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
function makeBossDef(id: DlgBossId, chara: CharaId): BossDef {
  return finBoss(buildBossDef(id, chara))
}

// ===== 中ボス定義（単一フェイズの BossDef として表現） =====
function makeMidDef(id: MidId, name: string, stageIdx: number): BossDef {
  const hp = 650 + stageIdx * 90
  const base = {
    id: `mid-${id}`, name, radius: 20, figure: MID_FIGURES[id],
  }
  const phase = (
    update: (ctx: BossContext, dt: number) => void,
    move: 'sine' | 'teleport' = 'sine',
    params?: Record<string, number>,
  ): BossDef['phases'][number] => ({
    name: null, hp, timeLimit: 22, move, moveRange: 95, moveSpeed: 0.78, params, update,
  })
  switch (id) {
    case 'kisume': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 1.6)
          ctx.spawn({ x: ctx.bossX(), y: ctx.bossY() + 8, angle: DOWN, speed: spdOf(ctx, 62), r: 7, color: 5, kind: 'big', ay: 30 })
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.3); ctx.aimed(2, 0.16, { speed: 118, r: 4, color: 5 }) }
      })],
    })
    case 'yamame': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 1.7)
          ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 70, r: 4.5, color: 3 })
          s.ang += 0.7
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.2); ctx.aimed(1, 0, { speed: 115, r: 4, color: 3 }) }
      })],
    })
    case 'parsee': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.1); ctx.aimed(5, 0.16, { speed: 124, r: 4, color: 3 }) }
      })],
    })
    case 'yuugi': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.4); bigFan(ctx, 1, 0, 76, 8, 0) }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.2); ctx.aimed(3, 0.16, { speed: 120, r: 4, color: 0 }) }
      })],
    })
    case 'satori': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 1.6)
          ctx.aimed(1, 0, { speed: 146, r: 4, color: 5 })
          s.a3 = 0.35
        }
        if (s.a3 > 0) {
          s.a3 -= dt
          if (s.a3 <= 0) ctx.aimed(1, 0, { speed: 156, r: 4, color: 5 })
        }
      })],
    })
    case 'utsuho': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.5); bigFan(ctx, 3, 0.28, 72, 8, 1) }
      })],
    })
    case 'koishi': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.0); ctx.aimed(3, 0.14, { speed: 134, r: 4, color: 6 }) }
      }, 'teleport', { interval: 3.4 })],
    })
    case 'orin': return finBoss({
      ...base,
      // 4・6面は猫形態、5面は人型（ボス戦と同じ姿）で出る
      figure: stageIdx === 4 ? ORIN_FIG : ORIN_CAT_FIG,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 1.9)
          ringGapArc(ctx, cntOf(ctx, 10), s.ang, 0.6, { speed: 66, r: 4.5, color: 0 })
          s.ang += 0.7
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.1); ctx.aimed(2, 0.15, { speed: 122, r: 4, color: 6 }) }
      })],
    })
    case 'sanae': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 2.1)
          // 星の欠けリング（風祝の星弾）
          ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 72, r: 4.5, color: 3, kind: 'star' })
          s.ang += 0.6
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.15); ctx.aimed(3, 0.16, { speed: 126, r: 4, color: 3 }) }
      })],
    })
  }
}

// ボスの表示名（ステージカード／情報パネル用）
const BOSS_META: Record<DlgBossId, { name: string; epithet: string }> = {
  yamame: { name: '黒谷ヤマメ', epithet: '暗い洞窟の明るい土蜘蛛' },
  parsee: { name: '水橋パルスィ', epithet: '地底の橋姫' },
  yuugi: { name: '星熊勇儀', epithet: '語られる怪力乱神' },
  satori: { name: '古明地さとり', epithet: '心を読む地霊殿の主' },
  orin: { name: '火焔猫燐', epithet: '地獄の輪禍' },
  utsuho: { name: '霊烏路空', epithet: '核熱の地獄鴉' },
  koishi: { name: '古明地こいし', epithet: '無意識の少女' },
}

// ===== 会話シーン（ボス戦前／撃破後） =====
// 台詞は原作の書き起こしではなく、キャラの口調と場面構成（遭遇→掛け合い→戦闘開始）に
// 寄せた自作文。自機（霊夢／魔理沙）で分岐し、ボス側の応答も自機に合わせて変えている。
// w: 'p' = 自機, 'b' = ボス
type DLine = { w: 'p' | 'b'; t: string }
type DlgScript = { pre: DLine[]; post: DLine[] }
const dl = (w: 'p' | 'b', t: string): DLine => ({ w, t })
const DIALOGUES: Record<DlgBossId, Record<CharaId, DlgScript>> = {
  yamame: {
    reimu: {
      pre: [
        dl('b', 'あらあら、地上の人間がこんな所まで。迷子？ それとも物好き？'),
        dl('p', '間欠泉と怨霊の異変を追ってきたの。地底の奥に心当たりはない？'),
        dl('b', 'ふふ、聞き込み上手だね。でもね、地底は地上の者がうろつく場所じゃないよ。'),
        dl('p', 'それは地上も同じ。怨霊がうろつく場所じゃないわ。'),
        dl('b', '言い返すねえ。私は黒谷ヤマメ、土蜘蛛。病を操るのが仕事みたいなものさ。'),
        dl('p', '病気で地上の者を追い払うつもり？'),
        dl('b', 'まさか。私は明るい性格でね、話し相手は歓迎だよ。ただし——'),
        dl('p', 'ただし？'),
        dl('b', '私の巣を荒らす者には、容赦しないってだけ。あんた、もう巣の中だよ？'),
        dl('p', 'あら、いつの間に。……蜘蛛の巣って、払えば済むものよね。'),
        dl('b', 'やってみな。キャプチャーウェブに捕まったら、病でじっくり眠ってもらうよ。'),
        dl('p', '寝てる暇はないの。悪いけど、糸は切らせてもらうわ！'),
      ],
      post: [
        dl('b', 'あらら、巣ごと破られちゃった。地上の巫女は手荒いねえ。'),
        dl('p', '手荒くしたのはそっちの網の方。さ、通してちょうだい。'),
        dl('b', 'いいよ、約束だ。橋を渡れば旧都。パルスィが妬んで待ってるから気をつけて。'),
        dl('p', '橋姫ね。怨霊については？'),
        dl('b', '灼熱地獄跡さ。あそこが熱を持てば、怨霊も浮かれて出てくる。'),
        dl('p', 'やっぱり奥ね。ありがとう、ヤマメ。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'おや、人間。地上の匂いがするね。こんな洞窟に何の用？'),
        dl('p', '間欠泉の調査だ。地底の奥まで行かせてもらうぜ。'),
        dl('b', 'ふーん。あたしはヤマメ。ここの主みたいなものさ。'),
        dl('p', '主ね。じゃあ聞くが、怨霊が地上まで出てるのは知ってるか？'),
        dl('b', '知ってるよ。灼熱地獄跡が騒がしいからね。でも、それとあたしの巣は別だ。'),
        dl('p', '巣を荒らす気はないぜ。通してくれればそれでいい。'),
        dl('b', 'そうはいかないなあ。通すには、巣の主の許可がいるんだよ。'),
        dl('p', '今、許可を取りに来てるんだが。'),
        dl('b', '口の許可じゃだめ。弾幕で示しな。捕まえたら、病で眠って地上に帰ってもらう。'),
        dl('p', '病気はごめんだぜ。だが、網をかいくぐるのは得意分野だ。'),
        dl('b', 'へえ、言うね。じゃあ見せてもらおうか、地上の魔法使いの腕前を！'),
        dl('p', 'おう、巣ごと吹き飛ばさないよう気をつけるぜ。'),
      ],
      post: [
        dl('b', '参った参った。網、ぜんぶすり抜けられちゃった。'),
        dl('p', '悪いな。だが約束通り、通してくれよ。'),
        dl('b', 'ああ、橋の向こうが旧都だ。橋姫のパルスィには気をつけな、妬み深いよ。'),
        dl('p', '妬みか。面倒そうだな。怨霊の出どころは？'),
        dl('b', '灼熱地獄跡で決まりさ。あの熱さ、普通じゃない。'),
        dl('p', '了解だ。助かったぜ、ヤマメ。'),
      ],
    },
  },
  parsee: {
    reimu: {
      pre: [
        dl('b', '……地上の人間。いいわね、地上は。光があって、風があって……妬ましい。'),
        dl('p', 'いきなり妬まれても困るわ。私は異変の調査で来ただけ。'),
        dl('b', '調査、ね。地上の者はいつもそう。地底なんて見下して、用が済めば帰るだけ。'),
        dl('p', '見下してなんかいないわ。怨霊が地上に出てるの、止めに来たのよ。'),
        dl('b', 'ふん、英雄気取り。……そういうところも、妬ましい。'),
        dl('p', 'あんた、橋姫のパルスィね。嫉妬の権化って聞いたけど、本当みたい。'),
        dl('b', 'ええ、その通り。私は水橋パルスィ。妬むことが生き甲斐なの。'),
        dl('p', '橋を渡らせてくれる？ 奥で何が起きてるか、確かめないといけないの。'),
        dl('b', '渡らせる？ いいえ。地上の者がすいすい進むなんて、妬ましくて見てられない。'),
        dl('p', '理由が嫉妬だけって、正直すぎるのも困りものね。'),
        dl('b', '嫉妬は正直なのよ。さあ、私の妬みを受け止められるかしら、巫女さん。'),
        dl('p', '仕方ないわね。嫉妬の相手は、ほどほどにしなさい！'),
      ],
      post: [
        dl('b', '負けた……。負けてなお、勝ったあんたが妬ましい。最悪の気分。'),
        dl('p', '勝っても妬まれるんじゃ、割に合わないわね。橋、渡っていい？'),
        dl('b', 'どうぞどうぞ。……奥は旧都。鬼の街よ。あんたみたいな上品な巫女には、眩しすぎるかもね。'),
        dl('p', '上品かどうかは置いといて。怨霊のことは？'),
        dl('b', '地霊殿の鴉が暴れてるって噂。……まあ、私には関係ないけど。'),
        dl('p', '地霊殿の鴉ね。ありがとう、パルスィ。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'あら、魔法使い。地上の者は服もきれいで、魔法も派手で……妬ましいわ。'),
        dl('p', 'いきなりだな。私は魔理沙、間欠泉の調査で来た。橋を渡らせてくれ。'),
        dl('b', '調査、調査って。地底を観光地みたいに思ってない？ 妬ましい。'),
        dl('p', '観光なら、もっと明るい場所を選ぶぜ。ここは暗くて湿ってるしな。'),
        dl('b', '悪口まで言える余裕。ますます妬ましい……！'),
        dl('p', 'あんたが橋姫のパルスィか。嫉妬で相手を止めるのが仕事だって？'),
        dl('b', 'ええ。妬みこそ私の力。あんたの余裕も、自信も、全部妬ましいの。'),
        dl('p', '自信は実力の裏付けだぜ。妬む前に、自分も磨けばいいのに。'),
        dl('b', '言ってくれるわね。……そういう正論が、一番妬ましいのよ！'),
        dl('p', 'おっと、火に油だったか。まあ、戦う理由としては十分だな。'),
        dl('b', 'グリーンアイドモンスターの恐ろしさ、思い知りなさい！'),
        dl('p', '望むところだ。嫉妬の弾幕、受けて立つぜ！'),
      ],
      post: [
        dl('b', 'くっ……火力まで妬ましいなんて。私、どこまで嫉妬深いのかしら。'),
        dl('p', '自覚があるだけマシだと思うぜ。橋、通してくれよな。'),
        dl('b', '渡れば旧都。鬼たちが酒盛りしてるわ。あんたも誘われるかもね、妬ましい。'),
        dl('p', '酒か、地底の酒は強そうだな。で、怨霊の件は？'),
        dl('b', '地霊殿の鴉よ。核の力を得て、制御できてないらしいわ。'),
        dl('p', '核、ね。穏やかじゃないな。ありがとう、パルスィ。'),
      ],
    },
  },
  yuugi: {
    reimu: {
      pre: [
        dl('b', 'おう、よく来たね地上の巫女。旧都へようこそ。酒でも飲んでいくかい？'),
        dl('p', 'ご丁寧にどうも。でも私は、間欠泉と怨霊の異変を調べに来たの。'),
        dl('b', '異変ねえ。地底の連中は地上の都合なんか気にしちゃいないよ。'),
        dl('p', '気にしてもらわないと困るの。怨霊は地上まで出てきてるんだから。'),
        dl('b', 'はは、物怖じしないね。私は星熊勇儀、鬼だ。気に入ったよ、巫女。'),
        dl('p', '気に入られるのは光栄だけど、通してもらえる？'),
        dl('b', '鬼の街の流儀ってやつでね。強い奴は通す、弱い奴は帰す。それだけさ。'),
        dl('p', 'つまり、力試しをしろと。'),
        dl('b', '話が早くて助かる。私の怪力、受けられるかい？ 三歩で仕留めるのが趣味なんだ。'),
        dl('p', '三歩ね。その三歩、踏ませないよう頑張るわ。'),
        dl('b', 'いい意気だ！ さあ、鬼の力試しと行こうじゃないか！'),
        dl('p', 'ええ。巫女の力も、見せてあげる。'),
      ],
      post: [
        dl('b', 'ははは！ 参った、いい力だ。地上の巫女もやるもんだね。'),
        dl('p', 'あんたの怪力も相当だったわ。肩が凝ったくらい。'),
        dl('b', 'そりゃあ嬉しいね。約束通り通しな。地霊殿はこの先だ。'),
        dl('p', '怨霊の出どころは地霊殿で合ってる？'),
        dl('b', 'あそこの鴉さ。お空って子が、核の力を暴走させてるらしい。'),
        dl('p', '核の力……。ただの異変じゃなさそうね。ありがとう、勇儀。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'お、珍しい客だね。地上の魔法使いが旧都に何の用だい？'),
        dl('p', '間欠泉の異変の調査だ。奥の地霊殿まで行きたい。'),
        dl('b', '地霊殿ね。あそこは心を読む主人の館だ、気をつけな。'),
        dl('p', '忠告ありがとう。で、通してくれるのか？'),
        dl('b', '私は勇儀、鬼の一人。旧都の流儀は単純さ。強い奴を通す、それだけ。'),
        dl('p', '単純でいいな。じゃあ、力試しだな？'),
        dl('b', 'ああ。私の怪力乱神、真正面から受けてみな。逃げ回るだけじゃ認めないよ。'),
        dl('p', '真正面は私の専門だぜ。火力で押し切ってやる。'),
        dl('b', 'はは、いいねえ！ その意気、酒の肴になるってもんだ。'),
        dl('p', '勝ったら一杯奢ってくれよな。'),
        dl('b', '望むところさ。さあ来い、魔理沙！'),
        dl('p', '行くぜ、勇儀！ 全開だ！'),
      ],
      post: [
        dl('b', 'ははは、負けた負けた！ いやあ、気持ちのいい火力だったよ。'),
        dl('p', 'あんたの怪力も本物だったぜ。腕が痺れてる。'),
        dl('b', '約束の酒は今度な。地霊殿はこの先。主人はさとり、心を読む目がある。'),
        dl('p', '心を読む、か。隠し事はできないな。怨霊の元は？'),
        dl('b', 'さとりの飼い鴉、お空さ。核の力を得て、はしゃぎすぎてるらしい。'),
        dl('p', '核融合の鴉か。……面倒なことになってるな。ありがとう、勇儀。'),
      ],
    },
  },
  satori: {
    reimu: {
      pre: [
        dl('b', 'ようこそ地霊殿へ。……ふふ、言わなくていいわ。あなたの心は読めているもの。'),
        dl('p', '古明地さとりね。心を読む、というのは本当みたい。'),
        dl('b', 'ええ。あなたは間欠泉と怨霊のことで来た。地上が騒がしいのも知っているわ。'),
        dl('p', '話が早いじゃない。怨霊の出どころは、あんたの館の鴉だと聞いたわ。'),
        dl('b', 'お空のことね。あの子は地獄鴉。神から核融合の力を授かって、少し持て余しているの。'),
        dl('p', '持て余す、で済む話じゃないの。地上まで影響が出てる。'),
        dl('b', '分かっているわ。だから、あなたに頼みたいのだけど……その前に。'),
        dl('p', 'その前に？'),
        dl('b', 'あなたの心と腕前を、確かめさせて。私の想起の弾幕は、あなたの相棒や、かつて戦った者たちの記憶を読むものよ。'),
        dl('p', '幽々子の蝶にレミリアの霧まで読むのね。面白いけど、手加減はしないわよ。'),
        dl('b', 'ええ、そう来なくては。……あなたの心、思ったより真っ直ぐね。'),
        dl('p', '褒め言葉として受け取っておくわ。行くわよ、さとり。'),
      ],
      post: [
        dl('b', '見事だったわ。心の読み通り、真っ直ぐで強い。'),
        dl('p', 'あんたの想起も見事だったわよ。で、頼みというのは？'),
        dl('b', 'お空を止めてほしいの。灼熱地獄跡で、力が暴走しているわ。'),
        dl('b', 'この先の回廊では、お燐が待っているはず。あの子は私の自慢のペットよ。'),
        dl('p', '飼い主の責任は重いわね。……いいわ、行ってくる。猫にも挨拶していくわ。'),
        dl('b', 'ありがとう。あの子は悪くないの。ただ、新しい力が嬉しくて、加減を知らないだけ。'),
        dl('p', '分かってる。優しく止めてあげるわ。……たぶんね。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'いらっしゃい、地霊殿へ。……ふふ、今「心を読むって本当か？」って思ったわね。'),
        dl('p', 'お、本当みたいだな。私は魔理沙、間欠泉の異変を調べに来た。'),
        dl('b', '知っているわ。あなたの心はよく読める。……本を盗む計画は、今日はなしね。'),
        dl('p', '人の心のぞき見はほどほどにしろよ。で、怨霊の元はあんたの鴉だって？'),
        dl('b', 'お空ね。核融合の力を得た地獄鴉。制御が利かなくなってきているわ。'),
        dl('p', '核融合か。そりゃあ間欠泉も吹くわけだ。止めに行くぜ。'),
        dl('b', 'その前に、あなたの実力を確かめさせて。想起の弾幕で、あなたの相棒たちの記憶を辿るわ。'),
        dl('p', '私の記憶？ アリスやパチュリーの技ってことか。懐かしいな。'),
        dl('b', 'ええ。心を読む者の特権。……さあ、あなたの記憶を再演しましょう。'),
        dl('p', '面白いじゃないか。二度目の相手も、全力で倒すだけだぜ。'),
        dl('b', 'ふふ、その自信も本物ね。では、始めましょうか。'),
        dl('p', '来いよ、さとり。心読みの腕前、見せてもらう！'),
      ],
      post: [
        dl('b', '読み通り、いえ、読み以上に強かったわ。お見事。'),
        dl('p', '想起の弾幕、懐かしくて手強かったぜ。で、お空の件だな。'),
        dl('b', 'お願いできる？ 灼熱地獄跡で暴走しているの。止めてあげて。'),
        dl('b', '回廊ではお燐が様子を見ているはずよ。猫車に轢かれないようにね。'),
        dl('p', '任せろ。暴走鴉の一匹や二匹、なんとかするぜ。'),
        dl('b', 'あの子は単純なの。力を褒められたいだけ。……どうか、傷つけすぎないで。'),
        dl('p', '分かってる。加減して止めてやるさ。'),
      ],
    },
  },
  orin: {
    reimu: {
      pre: [
        dl('b', 'あら、地上の人間？ こんな所まで死体を運ぶ用事もないのに。'),
        dl('p', '古明地さとりの飼い猫ね。火焔猫燐、だったかしら。'),
        dl('b', 'お、知ってるんだ。あたいはお燐。死体運びが仕事の火車だよ。'),
        dl('p', 'さっきの猫はあんただったのね。姿が変わるの？'),
        dl('b', 'あれは猫の姿。こっちが本気の姿だよ。……で、何の用？'),
        dl('p', 'お空の暴走を止めに来たの。通してちょうだい。'),
        dl('b', 'お空のことは心配だけどさ。さとり様の館を荒らす奴は通せないなあ。'),
        dl('p', '荒らす気はないわ。止めに行くだけ。'),
        dl('b', '言葉じゃ信用できないね。猫車の轢き逃げに気をつけて、勝ってから通るんだね。'),
        dl('p', '轢き逃げは物騒ね。……いいわ、相手になる。'),
        dl('b', 'へへ、いい返事。死体にならないよう頑張るんだよ？'),
        dl('p', '縁起でもない。行くわよ、お燐！'),
      ],
      post: [
        dl('b', 'いてて……やるねえ、巫女さん。'),
        dl('p', '猫車の腕前、見せてもらったわ。通してくれる？'),
        dl('b', '約束だもんね。お空はこの先の灼熱地獄跡だよ。'),
        dl('p', 'あんたも心配なんでしょう、お空のこと。'),
        dl('b', '……うん。あの子、力が嬉しくて止まれないだけなんだ。優しく止めてあげて。'),
        dl('p', '分かってるわ。任せてちょうだい。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'おっ、人間だ。人間の死体は重いんだよなあ。'),
        dl('p', '死体扱いするな。私は魔理沙、生きてるぜ。'),
        dl('b', 'あたいはお燐。地霊殿のペットで、死体運びの火車だよ。'),
        dl('p', 'さっきの猫もあんたか。変身できるのか、便利だな。'),
        dl('b', '猫の姿は散歩用さ。こっちが仕事の姿だよ。'),
        dl('p', '仕事熱心だな。私はお空を止めに来た。通してくれ。'),
        dl('b', 'お空のことは気になるけど、館の用心棒も仕事でね。'),
        dl('p', '用心棒か。じゃあ、実力で通るしかないな。'),
        dl('b', 'そうこなくっちゃ。あたいの猫車、避けられるかな？'),
        dl('p', '死体運びの車に轢かれる趣味はないぜ。全力で避ける。'),
        dl('b', 'へへ、楽しみだ。いくよ、魔理沙！'),
        dl('p', '来い、お燐！'),
      ],
      post: [
        dl('b', 'あいたた……負けたー。車輪、曲がってないかな。'),
        dl('p', '丈夫な車だな。で、通してくれるんだろ？'),
        dl('b', 'もちろん。お空は灼熱地獄跡。あの熱さ、近頃おかしいんだ。'),
        dl('p', 'あんたも心配してるんだな、お空を。'),
        dl('b', '友達だもん。……力を褒められたいだけの子なんだ。ひどいことはしないでね。'),
        dl('p', '任せろ。優しく止めてやるさ。'),
      ],
    },
  },
  utsuho: {
    reimu: {
      pre: [
        dl('b', 'あ、誰か来た！ ねえねえ、見て見て、私の新しい力！'),
        dl('p', 'あんたが霊烏路空ね。その力、地上まで響いてるわよ。'),
        dl('b', '響いてる？ すごいでしょ！ 核融合の力だよ。太陽の力！'),
        dl('p', '太陽の力を、こんな地底で暴走させるものじゃないわ。'),
        dl('b', '暴走？ してないよ。私は上手く使えてるもん。たぶん。'),
        dl('p', 'たぶん、が一番危ないの。間欠泉は吹くし、怨霊は湧くし。'),
        dl('b', 'うーん、難しいことは分かんない。でも、力が強いのはいいことだよね？'),
        dl('p', '強さには責任が伴うの。あんたには、まだ早かったみたいね。'),
        dl('b', 'じゃあ試してみてよ。私の核の力、巫女さんに止められるかな？'),
        dl('p', '止めるわ。異変解決が私の仕事だもの。'),
        dl('b', 'わーい、遊んでくれるんだ！ いくよ、ニュークリアフュージョン！'),
        dl('p', '遊びじゃないって……。まあいい、行くわよ、お空！'),
      ],
      post: [
        dl('b', 'あれー、負けちゃった。私の力、まだ足りなかったのかな。'),
        dl('p', '力は十分すぎるくらいよ。足りないのは、加減の方。'),
        dl('b', '加減……。さとり様にも言われた気がする。えへへ。'),
        dl('p', 'これからは、さとりの言うことをよく聞くの。地上に迷惑をかけないように。'),
        dl('b', 'うん、分かった！ ……間欠泉、止まるといいな。'),
        dl('p', '止まるわよ。あんたが大人しくしてればね。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'おー、人間だ！ ねえ、私の力見ていってよ。核融合だよ、核融合！'),
        dl('p', 'お空だな。噂は聞いてるぜ。その力で間欠泉を吹かせてる自覚はあるか？'),
        dl('b', '間欠泉？ 私が熱くすると、上が温まるからかな。すごいでしょ！'),
        dl('p', 'すごいが、迷惑なんだぜ。地上じゃ怨霊まで湧いてる。'),
        dl('b', '怨霊は私のせいじゃないもん。たぶん。……たぶんね。'),
        dl('p', 'その「たぶん」が積もって異変になるんだ。力を抑えろ、お空。'),
        dl('b', '抑える？ やだ。せっかくの力だもん、もっと試したい！'),
        dl('p', 'だろうな。単純な奴は説得より実力行使が早い。'),
        dl('b', '実力行使？ いいよ、私だって負けないもん。制御棒、なしでいくよ！'),
        dl('p', '制御不能ってわけか。……面白い、相手になるぜ！'),
        dl('b', 'セルフトカマク、点火！ いくよ、魔理沙！'),
        dl('p', '来いよ、お空！ その熱、私が冷ましてやる！'),
      ],
      post: [
        dl('b', 'あつかったー……負けちゃった。でも楽しかった！'),
        dl('p', '楽しかった、じゃない。力が暴走すると、周りが危ないんだぜ。'),
        dl('b', 'うん……反省する。さとり様に、加減を教えてもらう。'),
        dl('p', 'それでいい。力は使い方次第で、宝にも災いにもなるからな。'),
        dl('b', '魔理沙も力持ちだよね。今度は遊びで勝負しようね！'),
        dl('p', 'はは、考えておくぜ。まずは大人しくしてることだ、お空。'),
      ],
    },
  },
  koishi: {
    reimu: {
      pre: [
        dl('b', 'あれ、あなた誰？ ……あ、自己紹介がまだだった。私はこいし。'),
        dl('p', 'いつの間に背後に……。あんた、さとりの妹ね。'),
        dl('b', 'そう、古明地こいし。お姉ちゃんとは違って、私は心を読まないの。無意識だから。'),
        dl('p', '無意識にここまで来たの？ 地霊殿の外は危ないわよ。'),
        dl('b', '危ない？ そうかな。誰も私に気づかないから、平気平気。'),
        dl('p', '気づかない、ね。確かに気配がなかった。……何をしに来たの？'),
        dl('b', '別に。気づいたらここにいたの。あなたが強そうだから、遊びたくなっただけ。'),
        dl('p', '理由が無意識って、止めようがないわね。'),
        dl('b', 'ねえ、遊ぼう？ 私の弾幕、見えないところから来るよ。当てられるかな。'),
        dl('p', '見えない相手は苦手だけど……やるしかないわね。'),
        dl('b', 'わーい。じゃあ、はじめよう。私のこと、見つけてね。'),
        dl('p', '見つけてみせるわ。行くわよ、こいし。'),
      ],
      post: [
        dl('b', 'あはは、見つかっちゃった。あなた、すごいね。'),
        dl('p', '無意識の動きは読みにくかったわ。いい勝負だった。'),
        dl('b', 'ねえ、また遊んでくれる？ 次はもっと、見つからないようにするから。'),
        dl('p', '暴れないなら、考えてあげる。お姉さんの所に帰りなさい。'),
        dl('b', 'うん、帰る。……あれ、私、なんでここに来たんだっけ。まあいっか。'),
        dl('p', '本当に無意識なのね。……まあ、平和になったならいいわ。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'やっほー。気づかなかったでしょ、私がいたこと。'),
        dl('p', 'うおっ、いつの間に。……あんた、さとりの妹のこいしか。'),
        dl('b', '正解。私は古明地こいし。無意識で動くから、誰にも見つからないの。'),
        dl('p', '見つからないって、便利なようで寂しくないか？'),
        dl('b', '寂しい？ うーん、考えたことなかった。無意識だからね。'),
        dl('p', 'そうか。で、こんな所で何してるんだ？'),
        dl('b', '分からない。歩いてたらここにいて、強そうな魔法使いがいたから声をかけたの。'),
        dl('p', '声をかけた、って今の今まで気づかなかったがな。'),
        dl('b', 'ねえ、遊ぼうよ。私の弾幕は、無意識の場所から飛んでくるよ。'),
        dl('p', '見えない弾幕か。厄介だが、面白そうだぜ。'),
        dl('b', 'じゃあ決まり。私を見つけられたら、あなたの勝ちね。'),
        dl('p', '望むところだ。行くぜ、こいし！'),
      ],
      post: [
        dl('b', '見つかっちゃったー。無意識でも、見つかるんだね。'),
        dl('p', 'はは、勘と反応でなんとかなったぜ。いい勝負だった。'),
        dl('b', 'ねえ魔理沙、今度は地上にも遊びに行っていい？'),
        dl('p', '騒ぎを起こさないならな。……って、聞いてるか？'),
        dl('b', '聞いてる聞いてる。たぶん。……じゃあね、また遊ぼうね。'),
        dl('p', '本当に掴みどころのない奴だ。まあ、平和が一番だな。'),
      ],
    },
  },
}

// ===== ポートレート画像（自前生成イラスト） =====
// 自機2人は public/cdn/koumakyou/、ボス8人は public/cdn/chireiden/ の webp を
// 自オリジン相対（BASE_URL基準）で参照し、SW の cdn/ キャッシュに乗せる。
// 読み込み失敗時は呼び出し側が図形／文字のフォールバック表示に切り替えるため、
// 画像が無くてもゲームは動作する。
const portraitUrl = (id: string): string =>
  id === 'reimu' || id === 'marisa'
    ? `${import.meta.env.BASE_URL}cdn/koumakyou/${id}.webp`
    : `${import.meta.env.BASE_URL}cdn/chireiden/${id}.webp`

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
// ===== BGM（WebAudioステップシーケンサ／完全オリジナル曲） =====
// ZUN風の文法：高速マイナーキー、鋸波＋ビブラートのトランペット風リード、
// 三角波の高速アルペジオ、駆けるベース、ノイズのドラム。原作の旋律は使わない。
// 地霊殿向けに、紅魔郷とは別の6曲を新規に作曲している。
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
    bpm: 134, cut: 1400, arpDiv: 2,
    lead: parseLead('A4 . C5 . E5 . . . D5 . C5 . A4 . . . F4 . A4 . C5 . . . B4 . . . G4 . . . E4 . G4 . B4 . . . D5 . C5 . B4 . A4 . . . . .'),
    roots: [45, 41, 43, 40],
    bassPat: BASS_PAT_CALM,
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]],
    kick: 'x.......x.......', snare: '................', hat: 'x.x.x.x.x.x.x.x.',
  },
  stage: {
    bpm: 170, cut: 2500, arpDiv: 1,
    lead: parseLead('D5 . . F5 . A5 . . G5 . F5 . E5 . F5 . D5 . . . C5 . D5 . F5 . . A5 . G5 . F5 . E5 . C5 . D5 . . . A4 . C5 . D5 . . . F5 . E5 . D5 . . .'),
    roots: [38, 38, 36, 41],
    bassPat: BASS_PAT_DRIVE,
    chords: [[62, 65, 69, 74], [62, 65, 69, 74], [58, 62, 65, 70], [65, 69, 72, 77]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.',
  },
  boss: {
    bpm: 184, cut: 2800, arpDiv: 1,
    lead: parseLead('E5 . . G5 . . B5 . E6 . D6 B5 G5 . E5 . D5 . . F#5 . . A5 . G5 . F#5 . D#5 . E5 . . . B4 . D5 . F#5 . A5 . G5 . F#5 . D#5 . E5 . . . . .'),
    roots: [40, 40, 36, 35],
    bassPat: BASS_PAT_GALLOP,
    chords: [[64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [59, 62, 66, 71]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exstage: {
    bpm: 178, cut: 2600, arpDiv: 1,
    lead: parseLead('G5 . Bb5 . D6 . . . C6 . Bb5 . G5 . . . A5 . Bb5 . C6 . Bb5 . A5 . F5 . G5 . . . D5 . F5 . G5 . . . Bb5 . A5 . G5 . F5 . D#5 . F5 . G5 . . .'),
    roots: [43, 43, 39, 41],
    bassPat: BASS_PAT_DRIVE,
    chords: [[67, 70, 74, 79], [67, 70, 74, 79], [63, 67, 70, 75], [65, 69, 72, 77]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exboss: {
    bpm: 196, cut: 3000, arpDiv: 1,
    lead: parseLead('E5 . G5 . B5 . E6 . D6 . B5 . A5 . G5 . F#5 . D#5 . E5 . G5 . B5 . . . C6 . B5 . A5 . G5 . A5 . B5 . D6 . B5 . A5 . G5 . F#5 . D#5 . F#5 . B5 . . .'),
    roots: [40, 36, 43, 35],
    bassPat: BASS_PAT_GALLOP,
    chords: [[64, 67, 71, 76], [60, 64, 67, 72], [59, 62, 67, 71], [59, 63, 66, 71]],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo',
  },
  jingle: {
    bpm: 148, cut: 2400, arpDiv: 2, once: true,
    lead: parseLead('D5 . F5 . A5 . D6 . A5 . F5 . D5 . . . E5 . F5 . E5 . D5 . . . D5 . . .'),
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
  /** ユーザー操作のたびに呼ぶ：AudioContext の生成とサスペンド復帰 */
  unlock: () => void
}
function createBgm(): Bgm {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuf: AudioBuffer | null = null
  let timer: number | null = null
  let cur: TrackId | null = null
  let step = 0
  let nextTime = 0
  let schedTicks = 0
  let muted = false
  const VOL = 0.15
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
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      } catch {
        // 音声が使えない環境でもゲーム本体の処理は止めない
        ctx = null
        master = null
        noiseBuf = null
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
// 紅魔郷と同じスポーン規則：0.1 秒刻みの call イベントで道中を進行する。
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
  bossId: DlgBossId | null
  midId: MidId | null
  msg: string
  msgT: number
}

export default function Chireiden() {
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
  const dlgRef = useRef<{ active: boolean; done: (() => void) | null }>({ active: false, done: null })
  const [dlgUi, setDlgUi] = useState<{ boss: DlgBossId; lines: DLine[]; idx: number } | null>(null)
  // ===== タイトル画面のステップ（原作のメニュー構成に寄せた多段選択） =====
  const [titleStep, setTitleStep] = useState<'menu' | 'chara' | 'diff' | 'records' | 'help'>('menu')
  const [pendingRun, setPendingRun] = useState<'story' | 'extra'>('story')
  // ポートレート画像の読み込み失敗を記録し、フォールバック表示に切り替える
  const [imgErr, setImgErr] = useState<ReadonlySet<string>>(new Set())
  // 狭い／低いウィンドウ（スマホ等）でも画面全体が隠れず見えるよう、ステージ表示サイズを実測でフィットさせる
  const [stageBox, setStageBox] = useState<{ w: number; h: number } | null>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (cw <= 0 || ch <= 0) return
      const isNarrow = cw < 480
      setNarrow((prev) => (prev === isNarrow ? prev : isNarrow))
      const foot = isNarrow ? 46 : 40 // 下部の注記行（narrow時はミュートボタン付き）の高さぶんを差し引く
      const availW = Math.min(cw, 560)
      const availH = Math.max(120, ch - foot)
      const scale = Math.min(availW / SW, availH / SH)
      const w = Math.floor(SW * scale)
      const h = Math.floor(SH * scale)
      setStageBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
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
      gravityWell = null
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
        if (lastStage === 6) { setEndTitle('EXTRA CLEAR!'); setEndSub('無意識の少女と遊んだ！') } else if (G.diff === 'easy') {
          setEndTitle('EASY CLEAR!'); setEndSub('STAGE 5までクリア。Normal以上で全6面とEXに挑戦しよう')
        } else { setEndTitle('ALL CLEAR!'); setEndSub('地底に平和が戻った！') }
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
      gravityWell = null
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
      enter = { t: 1.0, max: 1.0, fig: midFigOf(sd.mid, G.stageIdx), homeY: 80, kind: 'mid' }
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
      bossCtl.start(makeBossDef(sd.boss, G.chara), world, playerRef, FW / 2, 88)
      burst(FW / 2, 88, 16, '#ffcdd2', 90)
    }

    // ===== 会話シーンの開始（ゲームループを止め、終了時に done へ接続） =====
    function openDialogue(boss: DlgBossId, kind: 'pre' | 'post', done: () => void) {
      const script = DIALOGUES[boss][G.chara]
      const lines = kind === 'pre' ? script.pre : script.post
      if (lines.length === 0) { done(); return }
      dlgRef.current = { active: true, done }
      setDlgUi({ boss, lines, idx: 0 })
    }

    // ===== ボス／中ボスのフェイズ終了処理 =====
    bossCtl.onPhaseEnd = (res: PhaseEndResult) => {
      if (ctlIsMid) {
        const midFig = G.midId ? midFigOf(G.midId, G.stageIdx) : null
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
      // 太陽の引力（お空の最終スペル）：中心近くでは弱め、入力で十分抗える強さ
      if (gravityWell && !player.dead && bossCtl.active) {
        const dx = gravityWell.x - player.x
        const dy = gravityWell.y - player.y
        const d = Math.hypot(dx, dy)
        if (d > 12) {
          const p = gravityWell.pull * dt * (d < 60 ? 0.45 : 1)
          player.x = clamp(player.x + (dx / d) * p, 8, FW - 8)
          player.y = clamp(player.y + (dy / d) * p, 16, FH - 10)
        }
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
      // 上昇する火の粉（地底の熱気）
      for (let i = 0; i < 40; i++) {
        const sx = (i * 89) % FW
        const sy = FH - ((i * 67 + G.time * (12 + (i % 3) * 8)) % FH)
        ctx.fillStyle = i % 3 === 0 ? 'rgba(255,150,80,0.8)' : 'rgba(255,210,140,0.5)'
        ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1)
      }
      // 鍾乳石のシルエット（天井）
      ctx.fillStyle = 'rgba(5,3,10,0.9)'
      for (let i = 0; i < 7; i++) {
        const bx = i * 58 - 8
        const len = 26 + ((i * 37) % 34)
        ctx.beginPath()
        ctx.moveTo(bx, 0); ctx.lineTo(bx + 17, len); ctx.lineTo(bx + 34, 0)
        ctx.closePath(); ctx.fill()
      }
      // 底の溶岩だまりの輝き
      const mg = ctx.createLinearGradient(0, FH - 46, 0, FH)
      mg.addColorStop(0, 'rgba(255,90,20,0)')
      mg.addColorStop(1, 'rgba(255,90,20,0.30)')
      ctx.fillStyle = mg
      ctx.fillRect(0, FH - 46, FW, 46)
      ctx.fillStyle = 'rgba(6,3,8,0.9)'
      ctx.fillRect(0, FH - 14, FW, 14)
      ctx.fillStyle = 'rgba(255,120,40,0.75)'
      for (let i = 0; i < 5; i++) {
        const cx0 = (i * 83 + 20) % (FW - 30)
        ctx.fillRect(cx0, FH - 9 + (i % 2) * 3, 22 + (i % 3) * 9, 2)
      }
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

      // 太陽（お空の最終スペル）：引力の中心を巨大な太陽として描く（実弾は太陽位置から出る）
      if (gravityWell && running) {
        const sx0 = gravityWell.x, sy0 = gravityWell.y
        const sg = ctx.createRadialGradient(sx0, sy0, 4, sx0, sy0, 46)
        sg.addColorStop(0, 'rgba(255,236,160,0.95)')
        sg.addColorStop(0.45, 'rgba(255,160,60,0.75)')
        sg.addColorStop(1, 'rgba(255,80,20,0)')
        ctx.fillStyle = sg
        ctx.beginPath(); ctx.arc(sx0, sy0, 46, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffca28'
        ctx.beginPath(); ctx.arc(sx0, sy0, 25 + Math.sin(G.time * 3.1) * 1.6, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(255,112,67,0.9)'; ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.arc(sx0, sy0, 31, 0, Math.PI * 2); ctx.stroke()
      }
      // アイテム
      items.render(ctx)
      // 敵
      for (const en of enemies.active) drawFairy(en)
      // 中ボス／ボス（こいしは無意識の演出として半透明で描く）
      if (bossCtl.active) {
        const curId = ctlIsMid ? G.midId : G.bossId
        const fig = ctlIsMid && G.midId ? midFigOf(G.midId, G.stageIdx) : G.bossId ? BOSS_FIGURES[G.bossId] : null
        const alpha = curId === 'koishi' ? 0.62 : 1
        if (fig) {
          drawFigure(ctx, fig, bossCtl.x, bossCtl.y, { t: G.time, alpha })
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
        drawFigure(ctx, BOSS_FIGURES[G.bossId], FW / 2, 88, { t: G.time, alpha: G.bossId === 'koishi' ? 0.62 : 1 })
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

      // ===== 核警告の staging（最終スペル開始直後のみ） =====
      if (gravityWell && running && gravityWell.warn > 0) {
        const wy = 48
        ctx.fillStyle = 'rgba(120,0,0,0.72)'; ctx.fillRect(0, wy, FW, 20)
        ctx.save()
        ctx.beginPath(); ctx.rect(0, wy, FW, 20); ctx.clip()
        ctx.fillStyle = '#ffeb3b'
        for (let x = -20 + ((G.time * 60) % 40) - 40; x < FW + 20; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, wy + 20); ctx.lineTo(x + 12, wy); ctx.lineTo(x + 24, wy + 20); ctx.closePath(); ctx.fill()
        }
        ctx.restore()
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('☢ WARNING ☢', FW / 2, wy + 10.5)
      }

      // ===== ボス位置マーカー（画面下部） =====
      const marker = (x: number, color: string) => {
        const mx = clamp(x, 8, FW - 8)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.65 + Math.sin(G.time * 6) * 0.3
        ctx.beginPath(); ctx.moveTo(mx, FH - 10); ctx.lineTo(mx - 6, FH - 2); ctx.lineTo(mx + 6, FH - 2); ctx.closePath(); ctx.fill()
        ctx.globalAlpha = 1
      }
      if (bossCtl.active) {
        marker(bossCtl.x, ctlIsMid ? '#4fc3f7' : '#ff5252')
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
        ctx.fillStyle = '#ffb27d'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
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
      ctx.fillStyle = '#170b06'; ctx.fillRect(FW, 0, SW - FW, SH)
      ctx.fillStyle = '#52352b'; ctx.fillRect(FW, 0, 2, SH)
      const sx = FW + 14
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      const label = (s: string, y: number) => {
        ctx.fillStyle = '#dbb49d'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(s, sx, y)
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
        ctx.fillStyle = '#dbb49d'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('MISS', sx + 62, 266)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.fillText(String(G.misses), sx + 62, 280)
      }
      label('TIME', 306)
      value(`${Math.floor(G.time)}s`, 320)
      ctx.fillStyle = '#dbb49d'; ctx.font = '10px sans-serif'
      ctx.fillText(`${G.chara === 'marisa' ? '魔理沙' : '霊夢'} / ${DIFF_CFG[G.diff].label}${G.challenge ? ' / CHALLENGE' : ''}`, sx, 344)
      ctx.fillStyle = '#a5836f'; ctx.font = '10px sans-serif'
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
    background: 'rgba(14,5,3,0.82)', color: '#fff', textAlign: 'center',
    borderRadius: 8, padding: 14, zIndex: 3, overflowY: 'auto',
  }
  const btnStyle: React.CSSProperties = {
    background: '#bf360c', color: '#fff', border: '1px solid #ffab91',
    borderRadius: 999, padding: '10px 28px', fontSize: 16, fontWeight: 'bold',
    cursor: 'pointer',
  }
  const selLabel: React.CSSProperties = { fontSize: 11, color: '#dbb49d', letterSpacing: 2, marginTop: 4 }
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
            background: 'linear-gradient(160deg, #4a2410 0%, #200d06 100%)',
            color: '#ffccb3', fontWeight: 'bold', fontSize: 20, letterSpacing: 2,
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
    <div ref={wrapRef} style={{ width: '100%', maxWidth: 560, margin: '0 auto', userSelect: 'none', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{`
        .chirei-btn:active { transform: scale(0.96); }
        .chirei-menu { transition: background 0.12s, color 0.12s; }
        .chirei-menu:hover, .chirei-menu:active { background: rgba(255, 110, 50, 0.18); color: #ffe3d7; }
        .chirei-menu .chirei-caret { opacity: 0; transition: opacity 0.12s; }
        .chirei-menu:hover .chirei-caret, .chirei-menu:active .chirei-caret { opacity: 1; }
        .chirei-card { transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
        .chirei-card:hover, .chirei-card:active { transform: translateY(-2px); border-color: rgba(255,170,120,0.95) !important; box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
      `}</style>
      <div style={{ position: 'relative', flexShrink: 0, ...(stageBox ? { width: stageBox.w, height: stageBox.h } : {}) }}>
        <canvas
          ref={canvasRef}
          width={SW}
          height={SH}
          style={{ width: '100%', height: stageBox ? '100%' : 'auto', display: 'block', borderRadius: 8, background: '#0a0610', touchAction: 'none' }}
        />
        {!narrow && (
        <button
          type="button"
          className="chirei-btn"
          onClick={toggleMute}
          aria-label="BGMミュート切替"
          style={{
            position: 'absolute', right: 10, top: 10, zIndex: 4,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(30,14,6,0.7)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)', fontSize: 17,
            cursor: 'pointer',
          }}
        >
          {mutedUi ? '🔇' : '🔊'}
        </button>
        )}
        {screen === 'playing' && (
          <button
            type="button"
            className="chirei-btn"
            onPointerDown={(e) => { e.preventDefault(); pressBomb() }}
            style={{
              position: 'absolute', right: narrow ? 8 : 10, bottom: narrow ? 8 : 10, zIndex: 2,
              width: narrow ? 54 : 64, height: narrow ? 54 : 64, borderRadius: '50%',
              background: 'rgba(191,54,12,0.78)', color: '#fff',
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
            height: narrow ? 150 : 188, width: narrow ? 110 : 138, borderRadius: 10,
            border: active ? '2px solid rgba(255,170,120,0.95)' : '2px solid rgba(255,255,255,0.25)',
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
                background: 'linear-gradient(to bottom, rgba(10,4,2,0.18) 0%, rgba(10,4,2,0.42) 62%, rgba(10,4,2,0.66) 100%)',
                borderRadius: 8,
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); skipDlg() }}
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 2,
                  background: 'rgba(26,10,4,0.78)', color: '#ffccb3',
                  border: '1px solid rgba(255,170,120,0.55)', borderRadius: 999,
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
                  background: 'rgba(18,7,3,0.92)', border: '1px solid rgba(255,140,80,0.65)',
                  borderRadius: 10, padding: narrow ? '12px 14px 14px' : '14px 16px 16px', minHeight: narrow ? 84 : 92,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)', textAlign: 'left',
                }}
              >
                <div
                  style={{
                    position: 'absolute', top: -13, left: 14, padding: '2px 14px',
                    background: speakingPlayer ? '#7b1fa2' : '#bf360c', color: '#fff',
                    borderRadius: 999, fontSize: 12.5, fontWeight: 'bold', letterSpacing: 1,
                    border: '1px solid rgba(255,255,255,0.5)',
                  }}
                >
                  {speakingPlayer ? playerName : bossName}
                </div>
                <div style={{ fontSize: narrow ? 14 : 15, lineHeight: narrow ? 1.7 : 1.8, color: '#fff', marginTop: 2 }}>{line.t}</div>
                <div style={{ position: 'absolute', right: 14, bottom: 8, fontSize: 11, color: '#ffb27d' }}>
                  {dlgUi.idx + 1}/{dlgUi.lines.length}　▼ タップ / Z
                </div>
              </div>
            </div>
          )
        })()}
        {screen === 'title' && (() => {
          // タイトル画面：地底の灼熱を思わせる背景＋キービジュアル＋縦並びメニュー
          const menuItem = (label: string, caption: string, onClick: () => void) => (
            <button
              key={label}
              type="button"
              className="chirei-menu"
              onClick={onClick}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', flexWrap: narrow ? 'wrap' : 'nowrap',
                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,170,120,0.16)',
                color: '#fdf1e7', padding: narrow ? '8px 10px' : '9px 10px', fontSize: narrow ? 16 : 17, fontWeight: 'bold',
                letterSpacing: 2, cursor: 'pointer', textAlign: 'left',
                textShadow: '0 2px 8px rgba(0,0,0,0.85)',
              }}
            >
              <span className="chirei-caret" style={{ color: '#ff8a50', fontSize: 13 }}>▶</span>
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 'normal', color: '#e0b49b', letterSpacing: 0 }}>{caption}</span>
            </button>
          )
          const stepHeader = (title: string, backTo: 'menu' | 'chara', backLabel: string) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => { setTitleStep(backTo); touchTitle() }}
                style={{
                  background: 'rgba(26,10,4,0.72)', color: '#ffccb3', border: '1px solid rgba(255,170,120,0.5)',
                  borderRadius: 999, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                }}
              >
                ← {backLabel}
              </button>
              <div style={{ fontSize: 19, fontWeight: 'bold', color: '#ffccb3', letterSpacing: 3 }}>{title}</div>
            </div>
          )
          const runCaption = pendingRun === 'extra' ? 'EXTRA STAGE' : challenge ? 'チャレンジモード（残機無限）' : '全6面'
          return (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 3, borderRadius: 8, overflow: 'hidden',
                background: 'linear-gradient(155deg, #12060a 0%, #2b0d08 46%, #170a24 100%)',
                color: '#fff',
              }}
            >
              {/* 灼熱のグロー */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 46% at 82% 24%, rgba(255,120,40,0.28), transparent 70%), radial-gradient(ellipse 62% 42% at 10% 80%, rgba(190,60,20,0.26), transparent 70%), radial-gradient(ellipse 90% 30% at 50% 110%, rgba(255,80,10,0.38), transparent 70%)' }} />
              {/* キービジュアル（メニュー画面のみ、右側に大きく） */}
              {titleStep === 'menu' && !imgErr.has('satori') && (
                <img
                  src={portraitUrl('satori')}
                  alt=""
                  draggable={false}
                  onError={() => markImgErr('satori')}
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
                    <div style={{ fontSize: 11, letterSpacing: 5, color: '#ffb27d', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>ファンメイド弾幕STG</div>
                    <div style={{ fontSize: narrow ? 36 : 44, fontWeight: 'bold', color: '#ff7043', letterSpacing: 3, lineHeight: 1.15, textShadow: '0 0 18px rgba(255,90,30,0.75), 0 3px 10px rgba(0,0,0,0.9)' }}>東方地霊殿</div>
                    <div style={{ fontSize: 12.5, color: '#f3d3bd', letterSpacing: 2, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>〜 地霊の異変 〜　全6面＋EXステージ</div>
                    <div style={{ marginTop: narrow ? 14 : 20, width: narrow ? '84%' : '64%', minWidth: narrow ? 0 : 250 }}>
                      {menuItem('ゲームスタート', '地底へ降りる', () => { setChallenge(false); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('エクストラスタート', 'EXTRA STAGE', () => { setChallenge(false); setPendingRun('extra'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('チャレンジ', '残機無限で挑戦', () => { setChallenge(true); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('記録表示', 'スコアとベスト記録', () => { setTitleStep('records'); touchTitle() })}
                      {menuItem('遊び方', '操作とルール', () => { setTitleStep('help'); touchTitle() })}
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, color: '#e8c3ab', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
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
                    <div style={{ fontSize: 12, color: '#e0b49b', marginBottom: 10 }}>{runCaption} ― 誰で異変に挑む？</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {([
                        { id: 'reimu' as CharaId, name: '博麗霊夢', trait: '誘導・広角ショット／標準速度', desc: '博麗神社の巫女。お札と御札の誘導弾で広く戦う。' },
                        { id: 'marisa' as CharaId, name: '霧雨魔理沙', trait: '集中レーザー／高速', desc: '普通の魔法使い。正面火力と速さで押し切る。' },
                      ]).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="chirei-card"
                          onClick={() => { setChara(c.id); setTitleStep('diff'); touchTitle() }}
                          style={{
                            flex: 1, background: 'rgba(22,9,4,0.74)', color: '#fff', cursor: 'pointer',
                            border: chara === c.id ? '2px solid rgba(255,170,120,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: 10, textAlign: 'left',
                          }}
                        >
                          {portraitEl(c.id, c.name, { width: '100%', height: narrow ? 136 : 208, borderRadius: 8, display: 'block' })}
                          <div style={{ fontSize: 17, fontWeight: 'bold', marginTop: 8 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, color: '#ffccb3', marginTop: 2 }}>{c.trait}</div>
                          <div style={{ fontSize: 11, color: '#e6d5c8', lineHeight: 1.6, marginTop: 4 }}>{c.desc}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {titleStep === 'diff' && (
                  <>
                    {stepHeader('難易度選択', 'chara', '自機選択')}
                    <div style={{ fontSize: 12, color: '#e0b49b', marginBottom: 10 }}>
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
                          className="chirei-card"
                          onClick={() => { setDiff(d.id); getBgm(); startRef.current(pendingRun) }}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 14, width: '100%',
                            background: 'rgba(22,9,4,0.74)', color: '#fff', cursor: 'pointer',
                            border: diff === d.id ? '2px solid rgba(255,170,120,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: '13px 16px', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 19, fontWeight: 'bold', letterSpacing: 1 }}>{d.name}</span>
                          <span style={{ fontSize: 12, color: '#e6d5c8' }}>{d.desc}</span>
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
                            <span style={{ fontSize: 13, color: '#e0b49b' }}>　ミス {challengeBest.misses}回</span>
                          </div>
                        ) : (
                          <div style={{ color: '#dbb49d' }}>まだ記録がありません</div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#e6d5c8' }}>
                        EXTRA STAGE（古明地こいし戦）は最初からいつでも挑戦できます。
                      </div>
                    </div>
                  </>
                )}
                {titleStep === 'help' && (
                  <>
                    {stepHeader('遊び方', 'menu', 'タイトル')}
                    <div style={{ fontSize: 13, lineHeight: 2.05, color: '#f7ece2' }}>
                      間欠泉と怨霊の異変を追って、地底の奥を目指そう。全6面＋EXステージ。<br />
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
            <div style={{ fontSize: 14, color: '#e6d5c8' }}>{endSub}</div>
            <div style={{ fontSize: 20, fontFamily: 'monospace' }}>SCORE {finalScore.toLocaleString()}</div>
            {endChallenge && (
              <div style={{ fontSize: 14, color: '#ffd54f' }}>
                チャレンジモード：ミス {finalMisses}回
                {challengeBest.score > 0 && (
                  <span>　／　ベスト {challengeBest.score.toLocaleString()}（ミス {challengeBest.misses}回）</span>
                )}
              </div>
            )}
            <button type="button" className="chirei-btn" style={{ ...btnStyle, marginTop: 6 }} onClick={() => { getBgm(); startRef.current('story') }}>
              もう一度遊ぶ
            </button>
            <button
              type="button"
              onClick={() => { setScreen('title'); setTitleStep('menu'); getBgm().play('title') }}
              style={{ background: 'transparent', color: '#dbb49d', border: 'none', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
            >
              タイトルに戻る
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, width: stageBox ? stageBox.w : '100%', maxWidth: '100%' }}>
        <div style={{ flex: 1, fontSize: 11, color: '#999', textAlign: narrow ? 'left' : 'center', lineHeight: 1.5 }}>
          ※ 本作品は東方Projectにインスパイアされた非公式ファンメイドです。原作の素材・楽曲は使用していません（BGMはオリジナル曲をWebAudioで合成）。
        </div>
        {narrow && (
          <button
            type="button"
            className="chirei-btn"
            onClick={toggleMute}
            aria-label="BGMミュート切替"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(30,14,6,0.7)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer',
            }}
          >
            {mutedUi ? '🔇' : '🔊'}
          </button>
        )}
      </div>
    </div>
  )
}
