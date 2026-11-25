// 妖々夢弾幕STG（ファンメイド）
// 東方妖々夢にインスパイアされたオリジナルの縦スクロール弾幕シューティング。
// 原作の素材（画像・音楽・データ）は一切使わず、描画はすべて Canvas の図形、
// BGM は WebAudio の FM シンセで合成する完全オリジナル曲（ZUN風の作風で作曲）。
// 進行は全6面＋EX＋Phantasm（原作の構成を踏襲したファンメイド再現）。
// ボス戦前／撃破後には会話シーン（台詞は自作文、ポートレートは自前生成イラストを
// public/cdn/youyoumu/ から配信）がある。
//
// 内部実装は紅魔郷／地霊殿と同じ自作エンジン2点を使用：
//  - danmaku-engine（弾プール／レーザー／Emitter／固定60Hzループ）
//  - toho-engine（ボス・自機・敵・アイテム・ステージ脚本・キャラ描画）
//
// 弾幕の「隙間ルール」（紅魔郷 v1.2.0 の監査基準を最初から適用）：
//  - 螺旋・ストリームは弾間隔（弾速×発射間隔）＞当たり判定直径＋弾直径を保つ
//  - リングには必ず開口部（欠け）を持たせるか、弧の間隔で抜け道を確保する
//  - 滞留弾で画面を飽和させない（発生率×寿命で同時存在数を抑える）
//  - 壁状パターンの重なりで抜け道が相殺されないよう、波のタイミングをずらす
import { useEffect, useRef, useState } from 'react'
import {
  DanmakuWorld,
  FixedLoop,
  SpiralEmitter,
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
const HISCORE_KEY = 'webx-youyoumu-hiscore'
const CHALLENGE_KEY = 'webx-youyoumu-challenge-best'
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

type BossId = 'letty' | 'chen' | 'alice' | 'prism' | 'youmu' | 'yuyuko' | 'ran' | 'yukari'
type MidId = BossId
type StageDef = { title: string; road: number; mid: MidId; midName: string; boss: BossId; hue: number }
const STAGES: StageDef[] = [
  { title: '桜の舞う冬の森', road: 32, mid: 'letty', midName: 'レティ・ホワイトロック', boss: 'letty', hue: 0 },
  { title: '魔法の森の猫屋敷', road: 32, mid: 'chen', midName: '橙', boss: 'chen', hue: 1 },
  { title: '人形の棲む洋館', road: 34, mid: 'alice', midName: 'アリス・マーガトロイド', boss: 'alice', hue: 2 },
  { title: '騒霊たちの演奏会', road: 34, mid: 'prism', midName: 'プリズムリバー三姉妹', boss: 'prism', hue: 3 },
  { title: '白玉楼への石段', road: 34, mid: 'youmu', midName: '魂魄妖夢', boss: 'youmu', hue: 4 },
  { title: '西行妖の桜並木', road: 36, mid: 'youmu', midName: '魂魄妖夢', boss: 'yuyuko', hue: 5 },
  { title: '式神の里', road: 34, mid: 'chen', midName: '橙', boss: 'ran', hue: 6 },
  { title: '境界の彼方', road: 34, mid: 'ran', midName: '八雲藍', boss: 'yukari', hue: 7 },
]
// ステージごとの背景グラデーション [上, 中, 下]（春と冥界の色調）
const BG_PALS: [string, string, string][] = [
  ['#0a0e1a', '#131c33', '#1d2a4a'],
  ['#0c1410', '#16281c', '#1f3a28'],
  ['#120a1c', '#201233', '#2d1a4a'],
  ['#160a20', '#281238', '#3a1a50'],
  ['#0e1220', '#1a2238', '#28324f'],
  ['#180a18', '#33102c', '#4d183c'],
  ['#0d0a1e', '#1c1438', '#2c1e54'],
  ['#12041c', '#240833', '#3a0d50'],
]

// ===== キャラ描画（全員ローカル FigureDef） =====
const SKIN = { skin: '#ffe7d6', skinShade: '#f2c9a4' }
const LETTY_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#c9d4f2', hairShade: '#93a5d4', eye: '#5b7fd4',
    dress: '#5b6fb8', dressShade: '#3f4f8a', sub: '#eef2fc', accent: '#ffd54f',
  },
  hairStyle: 'medium', accessory: 'ribbon', wings: 'none',
}
const CHEN_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#8a5a30', hairShade: '#5f3d1e', eye: '#d4883b',
    dress: '#4d7a47', dressShade: '#33542f', sub: '#fdf6da', accent: '#d8404a',
  },
  hairStyle: 'twin', accessory: 'ribbon', wings: 'none',
}
const ALICE_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#f2d06b', hairShade: '#c4a03e', eye: '#4d7cd4',
    dress: '#46689c', dressShade: '#2f4a73', sub: '#f7f3ea', accent: '#d8404a',
  },
  hairStyle: 'medium', accessory: 'ribbon', wings: 'none',
}
const LUNASA_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#e8c96a', hairShade: '#b3963e', eye: '#7a4fd0',
    dress: '#3a3a44', dressShade: '#26262e', sub: '#f3eefc', accent: '#e0455a',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const YOUMU_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#e8ecf2', hairShade: '#b4bcca', eye: '#4d9e8a',
    dress: '#3f7a5e', dressShade: '#2a5340', sub: '#eef7ee', accent: '#2b2b33',
  },
  hairStyle: 'short', accessory: 'ribbon', wings: 'none',
}
const YUYUKO_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#f2b8d0', hairShade: '#d482a8', eye: '#c23b6e',
    dress: '#7a9cc6', dressShade: '#54739c', sub: '#fdf0f5', accent: '#f48fb1',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const RAN_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#f2d06b', hairShade: '#c4a03e', eye: '#4d7cd4',
    dress: '#46689c', dressShade: '#2f4a73', sub: '#f7f3ea', accent: '#ffd54f',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
}
const YUKARI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#f2d98c', hairShade: '#cbb054', eye: '#7a4fd0',
    dress: '#6a4a9e', dressShade: '#4a3273', sub: '#f3eefc', accent: '#e0455a',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const BOSS_FIGURES: Record<BossId, FigureDef> = {
  letty: LETTY_FIG,
  chen: CHEN_FIG,
  alice: ALICE_FIG,
  prism: LUNASA_FIG,
  youmu: YOUMU_FIG,
  yuyuko: YUYUKO_FIG,
  ran: RAN_FIG,
  yukari: YUKARI_FIG,
}
const MID_FIGURES: Record<MidId, FigureDef> = { ...BOSS_FIGURES }
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
/** 雪の柱：6列中1〜2列を必ず抜き、横64px以上の抜け道を残す雪弾の雨（レティ用） */
function snowColumns(ctx: BossContext, wave: number) {
  const skipA = wave % 6
  const skipB = (wave * 2 + 3) % 6
  for (let i = 0; i < 6; i++) {
    if (i === skipA || i === skipB) continue
    ctx.spawn({
      x: 32 + i * 64, y: -16, angle: DOWN, speed: spdOf(ctx, 138),
      r: 5, color: 7, kind: 'orb',
    })
  }
}
/** 大玉の扇（各所で共用）：自機方向へ大きな遅い弾を扇状に */
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
/** 任意位置からの扇（人形砲台／半霊／スキマ用）：中心角 center から n 発を spread 間隔で */
function fanFrom(ctx: BossContext, x: number, y: number, center: number, n: number, spread: number, o: RingOpts) {
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * spread
    ctx.spawn({
      x, y, angle: center + off,
      speed: spdOf(ctx, o.speed), r: o.r, color: o.color, kind: o.kind ?? 'orb',
    })
  }
}
/** スキマ弾：自機から十分離れたポータル点から、欠けつき小リングを放つ（紫用）。
 *  ポータルは自機の周囲 110px 以内には開かない */
function gapPortal(ctx: BossContext, px: number, py: number, color: number) {
  const dx = px - ctx.player.x
  const dy = py - ctx.player.y
  if (dx * dx + dy * dy < 110 * 110) return
  const gapC = Math.atan2(ctx.player.y - py, ctx.player.x - px)
  const n = 10
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const d = Math.abs(((a - gapC) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
    if (d < 0.5) continue // 自機方向に開口を向ける
    ctx.spawn({ x: px, y: py, angle: a, speed: spdOf(ctx, 58), r: 4, color, kind: 'orb' })
  }
}
// ===== ボス定義（BossDef への変換） =====
const BONUS = { bonusBase: 1_000_000, bonusPerSec: 20_000 }

function buildBossDef(id: BossId): BossDef {
  switch (id) {
    case 'letty': return {
      id, name: 'レティ・ホワイトロック', epithet: '冬を司る妖怪', radius: 22, figure: BOSS_FIGURES.letty,
      phases: [
        {
          name: null, hp: 520, timeLimit: 40, move: 'sine', moveRange: 100, moveSpeed: 0.6,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.25); ctx.aimed(2, 0.16, { speed: 118, r: 4, color: 7 }) }
            if (s.a2 <= 0) {
              // 単腕の雪渦：弾間隔 80×0.24=19.2px ＞ 弾直径8＋判定直径5=13px
              s.a2 = ivOf(ctx, 0.24)
              s.ang += 0.42
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 80), r: 4, color: 7, kind: 'orb' })
            }
          },
        },
        {
          name: '寒符「リンガリングコールド」', hp: 900, timeLimit: 50, move: 'hover', moveRange: 34, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 二重渦（対向2腕）：各腕の弾間隔 92×0.21=19.3px ＞ 14px
              s.a1 = ivOf(ctx, 0.21)
              s.ang += 0.34
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 92), r: 4.5, color: 7, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.1); ctx.aimed(2, 0.14, { speed: 116, r: 4, color: 5 }) }
          },
        },
        {
          name: '冬符「ホワイトアウト・ノクターン」', hp: 1080, timeLimit: 55, move: 'sine', moveRange: 100, moveSpeed: 0.6, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 雪の柱：縦間隔 138×1.15≒159px、横は抜け列2列（128px幅）を確保
              s.a1 = ivOf(ctx, 1.15)
              snowColumns(ctx, s.n)
              s.n += 1
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.8); ctx.aimed(1, 0, { speed: 124, r: 4, color: 7 }) }
          },
        },
      ],
    }
    case 'chen': return {
      id, name: '橙', epithet: '凶兆の黒猫', radius: 20, figure: BOSS_FIGURES.chen,
      phases: [
        {
          name: null, hp: 560, timeLimit: 40, move: 'sine', moveRange: 110, moveSpeed: 0.7,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.1); ctx.aimed(3, 0.17, { speed: 126, r: 4, color: 1 }) }
            if (s.a2 <= 0) {
              // 欠けリング：開口±0.55rad、輪の縦間隔 66×1.5=99px
              s.a2 = ivOf(ctx, 1.5)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 66, r: 4.5, color: 3 })
              s.ang += 0.7
            }
          },
        },
        {
          name: '仙符「回転式神」', hp: 980, timeLimit: 50, move: 'teleport', moveRange: 110, moveSpeed: 0.6, params: { interval: 3.6 }, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 回転渦：弾間隔 96×0.2=19.2px ＞ 14px
              s.a1 = ivOf(ctx, 0.2)
              s.ang += 0.38
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 96), r: 4.5, color: 1, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.7); ctx.aimed(2, 0.15, { speed: 122, r: 4, color: 1 }) }
          },
        },
        {
          name: '猫符「キャットウォーク・ランページ」', hp: 1150, timeLimit: 55, move: 'sine', moveRange: 120, moveSpeed: 0.85, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 突進の扇：5方向・間隔0.17rad（100px先で17px間隔 ＞ 14px）、波間隔 150×2.2=330px
              s.a1 = ivOf(ctx, 2.2)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 5, 0.17, { speed: 150, r: 4.5, color: 0 })
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 1.6)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang + Math.PI / 2, 0.55, { speed: 62, r: 4.5, color: 3 })
              s.ang -= 0.6
            }
          },
        },
      ],
    }
    case 'alice': return {
      id, name: 'アリス・マーガトロイド', epithet: '七色の人形遣い', radius: 22, figure: BOSS_FIGURES.alice,
      phases: [
        {
          name: null, hp: 600, timeLimit: 42, move: 'sine', moveRange: 90, moveSpeed: 0.55,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.15); ctx.aimed(2, 0.15, { speed: 120, r: 4, color: 5 }) }
            if (s.a2 <= 0) {
              // 人形砲台：左右の人形が交互に単発で狙う（各人形の発射間隔は実質1.8秒）
              s.a2 = ivOf(ctx, 0.9)
              const side = s.n % 2 === 0 ? -70 : 70
              s.n += 1
              const x = ctx.bossX() + side
              const y = ctx.bossY() + 26
              const a = Math.atan2(ctx.player.y - y, ctx.player.x - x)
              ctx.spawn({ x, y, angle: a, speed: spdOf(ctx, 128), r: 4, color: 6, kind: 'orb' })
            }
          },
        },
        {
          name: '人形「上海人形の砲列」', hp: 1050, timeLimit: 52, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt
            if (s.a1 <= 0) {
              // 3砲台（本体＋両脇の人形）が順に3方向扇を撃つ。砲台間は横70px離れ、
              // 扇の間隔0.2radは80px先で16px ＞ 14px。各砲台の連射間隔は実質2.7秒
              s.a1 = ivOf(ctx, 0.9)
              const idx = s.n % 3
              s.n += 1
              const x = ctx.bossX() + (idx - 1) * 70
              const y = ctx.bossY() + (idx === 1 ? 0 : 26)
              const base = Math.atan2(ctx.player.y - y, ctx.player.x - x)
              fanFrom(ctx, x, y, base, 3, 0.2, { speed: 118, r: 4.5, color: 6 })
            }
          },
        },
        {
          name: '操符「人形の円舞」', hp: 1200, timeLimit: 55, move: 'sine', moveRange: 80, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 周回する2体の人形がそれぞれ渦を描く：弾間隔 78×0.26=20.3px ＞ 13px
              s.a1 = ivOf(ctx, 0.26)
              const t = ctx.phaseTime()
              for (const ph of [0, Math.PI]) {
                const a = t * 0.9 + ph
                const x = ctx.bossX() + Math.cos(a) * 74
                const y = ctx.bossY() + Math.sin(a) * 30 + 12
                ctx.spawn({ x, y, angle: a + Math.PI / 2, speed: spdOf(ctx, 78), r: 4, color: 6, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.4)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 60, r: 4.5, color: 5 })
              s.ang += 0.8
            }
          },
        },
      ],
    }
    case 'prism': return {
      id, name: 'プリズムリバー三姉妹', epithet: '騒霊三姉妹', radius: 22, figure: BOSS_FIGURES.prism,
      phases: [
        {
          name: null, hp: 640, timeLimit: 44, move: 'sine', moveRange: 95, moveSpeed: 0.6,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            // 7秒ごとに担当が切り替わる：0=ルナサ（渦） 1=メルラン（扇） 2=リリカ（音符の雨）
            const seg = Math.floor(ctx.phaseTime() / 7) % 3
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (seg === 0 && s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.23)
              s.ang += 0.36
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 86), r: 4.5, color: 4, kind: 'orb' })
            }
            if (seg === 1 && s.a2 <= 0) {
              s.a2 = ivOf(ctx, 1.5)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 4, 0.19, { speed: 132, r: 4.5, color: 0 })
            }
            if (seg === 2 && s.a3 <= 0) {
              s.a3 = ivOf(ctx, 1.2)
              snowColumns(ctx, s.n)
              s.n += 1
            }
          },
        },
        {
          name: '騒符「三重奏の嵐」', hp: 1100, timeLimit: 54, move: 'hover', moveRange: 36, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // ルナサの渦：弾間隔 88×0.24=21.1px ＞ 14px
              s.a1 = ivOf(ctx, 0.24)
              s.ang += 0.33
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 88), r: 4.5, color: 4, kind: 'orb' })
            }
            if (s.a2 <= 0) {
              // メルランの扇：2秒間隔、間隔0.19rad
              s.a2 = ivOf(ctx, 2.0)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 4, 0.19, { speed: 128, r: 4.5, color: 0 })
            }
            if (s.a3 <= 0) {
              // リリカの音符雨：1.6秒間隔（縦 138×1.6=221px）、抜け列2列
              s.a3 = ivOf(ctx, 1.6)
              snowColumns(ctx, s.n)
              s.n += 1
            }
          },
        },
        {
          name: '合葬「プリズムリバーの葬送曲」', hp: 1250, timeLimit: 58, move: 'sine', moveRange: 90, moveSpeed: 0.55, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // テンポが上がっても弾間隔の下限を守る：96×0.18=17.3px ＞ 14px
              const tempo = Math.max(0.75, 1 - ctx.phaseTime() / 160)
              s.a1 = ivOf(ctx, 0.24) * tempo
              s.ang += 0.4
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 96), r: 4.5, color: 4, kind: 'star' })
              }
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.3)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang * 0.5, 0.52, { speed: 62, r: 4.5, color: 6 })
            }
          },
        },
      ],
    }
    case 'youmu': return {
      id, name: '魂魄妖夢', epithet: '半人半霊の庭師', radius: 20, figure: BOSS_FIGURES.youmu,
      phases: [
        {
          name: null, hp: 620, timeLimit: 42, move: 'sine', moveRange: 100, moveSpeed: 0.65,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 本体の斬撃扇（カッター弾3方向、間隔0.2rad）
              s.a1 = ivOf(ctx, 1.2)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.2, { speed: 138, r: 4, color: 7, kind: 'knife' })
            }
            if (s.a2 <= 0) {
              // 半霊：本体を周回しながら単発で狙う（発射間隔0.85秒で散発）
              s.a2 = ivOf(ctx, 0.85)
              const t = ctx.phaseTime()
              const gx = ctx.bossX() + Math.cos(t * 1.15) * 54
              const gy = ctx.bossY() + Math.sin(t * 1.15) * 24 + 8
              const a = Math.atan2(ctx.player.y - gy, ctx.player.x - gx)
              ctx.spawn({ x: gx, y: gy, angle: a, speed: spdOf(ctx, 122), r: 4.5, color: 7, kind: 'bubble' })
            }
          },
        },
        {
          name: '剣符「桜花閃々」', hp: 1150, timeLimit: 54, move: 'hover', moveRange: 26, moveSpeed: 0.4, ...BONUS,
          setup: (ctx) => {
            // 剣閃レーザー2本：予告0.85秒ののち、振幅±1.15radをゆっくり往復する。
            // 2本は常に対向し、レーザー同士の間（上下方向）に必ず退避帯が残る
            for (const ph of [0, Math.PI]) {
              ctx.addLaser({
                x: ctx.bossX(), y: ctx.bossY(), angle: Math.PI / 2, length: 640, width: 20, color: 7,
                telegraph: 0.85, duration: -1, fade: 0.3,
                sweepAmp: 1.15, sweepSpeed: 0.5, sweepPhase: ph,
                follow: () => ({ x: ctx.bossX(), y: ctx.bossY() }),
              })
            }
          },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt
            if (s.a1 <= 0) {
              // レーザーの合間の補助弾は散発の狙撃のみ（間隔2.4秒）
              s.a1 = ivOf(ctx, 2.4)
              ctx.aimed(2, 0.13, { speed: 112, r: 4, color: 3 })
            }
          },
        },
        {
          name: '人鬼「未来永劫斬」', hp: 1300, timeLimit: 56, move: 'teleport', moveRange: 100, moveSpeed: 0.6, params: { interval: 3.8 }, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 双方向カッターストリーム：弾間隔 150×0.13=19.5px ＞ カッター直径7＋判定5=12px
              s.a1 = ivOf(ctx, 0.13)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              const wob = Math.sin(ctx.phaseTime() * 1.3) * 0.22
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: base + wob, speed: spdOf(ctx, 150), r: 3.5, color: 7, kind: 'knife' })
              if (s.n % 2 === 0) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: base - wob + 0.5, speed: spdOf(ctx, 132), r: 3.5, color: 3, kind: 'knife' })
              }
              s.n += 1
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.6)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 60, r: 4.5, color: 7 })
              s.ang -= 0.7
            }
          },
        },
      ],
    }
    case 'yuyuko': return {
      id, name: '西行寺幽々子', epithet: '華胥の亡霊', radius: 22, figure: BOSS_FIGURES.yuyuko,
      phases: [
        {
          name: null, hp: 660, timeLimit: 44, move: 'sine', moveRange: 90, moveSpeed: 0.5,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 蝶の二重渦：弾間隔 84×0.23=19.3px ＞ 蝶直径9＋判定5=14px
              s.a1 = ivOf(ctx, 0.23)
              s.ang += 0.31
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 84), r: 4.5, color: 6, kind: 'ellipse' })
              }
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 1.9)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.21, { speed: 106, r: 5, color: 6, kind: 'ellipse' })
            }
          },
        },
        {
          name: '幽蝶「バタフライストーム」', hp: 1200, timeLimit: 54, move: 'hover', moveRange: 34, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 蝶のリング：開口±0.55rad、輪の間隔 66×1.7=112px
              s.a1 = ivOf(ctx, 1.7)
              ringGapArc(ctx, cntOf(ctx, 18), s.ang, 0.55, { speed: 66, r: 4.5, color: 6, kind: 'ellipse' })
              s.ang += 0.55
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 0.26)
              s.ang += 0.05
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: -s.ang * 0.7 + Math.PI / 2, speed: spdOf(ctx, 76), r: 4, color: 4, kind: 'orb' })
            }
          },
        },
        {
          name: '桜符「西行妖の誘い」', hp: 1250, timeLimit: 56, move: 'sine', moveRange: 95, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 桜の雨：抜け列2列を残す柱（縦間隔 138×1.3=179px）
              s.a1 = ivOf(ctx, 1.3)
              snowColumns(ctx, s.n)
              s.n += 1
            }
            if (s.a2 <= 0) {
              // 大きな蝶の扇：ゆっくり広がる（間隔0.24rad）
              s.a2 = ivOf(ctx, 2.3)
              bigFan(ctx, 3, 0.24, 68, 7, 6)
            }
          },
        },
        {
          name: '亡郷「反魂蝶」', hp: 1500, timeLimit: 70, move: 'hover', moveRange: 22, moveSpeed: 0.35, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 反魂の渦：蝶の弾間隔 90×0.21=18.9px ＞ 14px
              s.a1 = ivOf(ctx, 0.21)
              s.ang += 0.29
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 90), r: 4.5, color: 6, kind: 'ellipse' })
              }
            }
            if (s.a2 <= 0) {
              // 蘇生の輪：4.6秒ごとに全方位リング。開口を2か所（対向）に持ち、
              // 円周間隔は半径60px時点で 2π×60/22=17.1px ＞ 14px
              s.a2 = ivOf(ctx, 4.6)
              const n = cntOf(ctx, 22)
              const gapC = s.ang * 0.7
              const skip = new Set<number>()
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                for (const c of [gapC, gapC + Math.PI]) {
                  const d = Math.abs(((a - c) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
                  if (d < 0.44) skip.add(i)
                }
              }
              ringSkip(ctx, n, skip, { speed: 58, r: 4.5, color: 4, kind: 'ellipse' })
            }
            if (s.a3 <= 0) {
              // 舞い落ちる蝶：抜け列を残す柱（縦間隔 138×1.5=207px）
              s.a3 = ivOf(ctx, 1.5)
              snowColumns(ctx, s.n + 2)
              s.n += 1
            }
          },
        },
      ],
    }
    case 'ran': return {
      id, name: '八雲藍', epithet: '策士の式神', radius: 22, figure: BOSS_FIGURES.ran,
      phases: [
        {
          name: null, hp: 680, timeLimit: 44, move: 'teleport', moveRange: 110, moveSpeed: 0.6, params: { interval: 3.4 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.05); ctx.aimed(3, 0.16, { speed: 130, r: 4, color: 2 }) }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 1.55)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang, 0.52, { speed: 64, r: 4.5, color: 4 })
              s.ang += 0.65
            }
          },
        },
        {
          name: '式符「橙の再演・仙狐変化」', hp: 1250, timeLimit: 56, move: 'sine', moveRange: 110, moveSpeed: 0.7, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 橙の回転渦の再演（強化版）：弾間隔 100×0.19=19px ＞ 14px
              s.a1 = ivOf(ctx, 0.19)
              s.ang += 0.4
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 100), r: 4.5, color: 1, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) {
              // 橙の突進扇の再演：2.4秒間隔
              s.a2 = ivOf(ctx, 2.4)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 5, 0.17, { speed: 148, r: 4.5, color: 0 })
            }
          },
        },
        {
          name: '式神「八雲藍の策」', hp: 1350, timeLimit: 58, move: 'hover', moveRange: 40, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 四方の式ポータルが順に狙撃する（各ポータルの間隔は実質4.4秒）
              s.a1 = ivOf(ctx, 1.1)
              const idx = s.n % 4
              s.n += 1
              const t = ctx.phaseTime() * 0.45
              const px = ctx.bossX() + Math.cos(t + idx * Math.PI / 2) * 118
              const py = ctx.bossY() + Math.sin(t + idx * Math.PI / 2) * 44 + 20
              const a = Math.atan2(ctx.player.y - py, ctx.player.x - px)
              ctx.spawn({ x: px, y: py, angle: a, speed: spdOf(ctx, 126), r: 4.5, color: 2, kind: 'star' })
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.2)
              ringGapArc(ctx, cntOf(ctx, 16), -s.ang, 0.52, { speed: 60, r: 4.5, color: 4 })
              s.ang += 0.5
            }
          },
        },
      ],
    }
    case 'yukari': return {
      id, name: '八雲紫', epithet: '境界の妖怪', radius: 22, figure: BOSS_FIGURES.yukari,
      phases: [
        {
          name: null, hp: 700, timeLimit: 44, move: 'teleport', moveRange: 120, moveSpeed: 0.6, params: { interval: 3.2 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.1); ctx.aimed(3, 0.15, { speed: 128, r: 4, color: 4, kind: 'knife' }) }
            if (s.a2 <= 0) {
              // スキマ弾：四隅寄りのポータルを順に開く（自機の近くには開かない）
              s.a2 = ivOf(ctx, 1.9)
              const pts: [number, number][] = [[52, 120], [332, 120], [52, 250], [332, 250]]
              const p = pts[s.n % 4]
              s.n += 1
              gapPortal(ctx, p[0], p[1], 4)
            }
          },
        },
        {
          name: '境符「境界の波紋」', hp: 1300, timeLimit: 56, move: 'hover', moveRange: 30, moveSpeed: 0.4, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 左右から流れる網目弾：行は56px間隔、自機のいる行帯は必ず抜く。
              // 流れの弾間隔 130×0.3=39px ＞ 14px
              s.a1 = ivOf(ctx, 0.3)
              const rows = [96, 152, 208, 264, 320]
              const prow = Math.floor(ctx.player.y / 56)
              for (let i = 0; i < rows.length; i++) {
                if (Math.floor(rows[i] / 56) === prow) continue
                const fromLeft = (i + s.n) % 2 === 0
                ctx.spawn({
                  x: fromLeft ? -12 : FW + 12, y: rows[i] + ((s.n * 13) % 17) - 8,
                  angle: fromLeft ? 0 : Math.PI, speed: spdOf(ctx, 130), r: 4.5, color: 4, kind: 'orb',
                })
              }
              s.n += 1
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.0); ctx.aimed(2, 0.13, { speed: 118, r: 4, color: 6 }) }
          },
        },
        {
          name: '幻符「スキマの彼方」', hp: 1400, timeLimit: 58, move: 'teleport', moveRange: 130, moveSpeed: 0.7, params: { interval: 2.8 }, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 6か所のポータルを回しながら開く。各リングは自機方向に開口を持つ
              s.a1 = ivOf(ctx, 1.6)
              const pts: [number, number][] = [[46, 96], [192, 70], [338, 96], [46, 268], [192, 300], [338, 268]]
              const p = pts[s.n % 6]
              s.n += 1
              gapPortal(ctx, p[0], p[1], 6)
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 0.24)
              s.ang += 0.36
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 84), r: 4, color: 4, kind: 'orb' })
            }
          },
        },
        {
          name: '結界「夢と現の境界」', hp: 1550, timeLimit: 66, move: 'hover', moveRange: 24, moveSpeed: 0.35, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 本体の渦：弾間隔 88×0.22=19.4px ＞ 13px
              s.a1 = ivOf(ctx, 0.22)
              s.ang += 0.33
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 88), r: 4, color: 4, kind: 'orb' })
            }
            if (s.a2 <= 0) {
              // 縦の網（抜け列2列）と横の網（自機の行帯を抜く）を2.1秒ごとに交互に出す。
              // 同時に重ならないため、抜け道同士が相殺されることはない
              s.a2 = ivOf(ctx, 2.1)
              if (s.n % 2 === 0) {
                snowColumns(ctx, s.n)
              } else {
                const rows = [110, 166, 222, 278]
                const prow = Math.floor(ctx.player.y / 56)
                for (const ry of rows) {
                  if (Math.floor(ry / 56) === prow) continue
                  for (const fx of [26, 128, 256, 358]) {
                    ctx.spawn({ x: fx, y: ry, angle: DOWN, speed: spdOf(ctx, 96), r: 4.5, color: 6, kind: 'orb' })
                  }
                }
              }
              s.n += 1
            }
            if (s.a3 <= 0) { s.a3 = ivOf(ctx, 2.6); ctx.aimed(2, 0.12, { speed: 116, r: 4, color: 4, kind: 'knife' }) }
          },
        },
      ],
    }
  }
}
type PhaseState = { a1: number; a2: number; a3: number; ang: number; n: number }
let activePhaseState: PhaseState = { a1: 0, a2: 0, a3: 0, ang: 0, n: 0 }
function phaseState(_ctx: BossContext): PhaseState {
  return activePhaseState
}
/** フェイズごとに独立した作業変数を持たせ、開始時にリセットする */
function finBoss(def: BossDef): BossDef {
  for (const ph of def.phases) {
    const st: PhaseState = { a1: 0, a2: 0, a3: 0, ang: 0, n: 0 }
    const origSetup = ph.setup
    ph.setup = (ctx) => {
      st.a1 = 0; st.a2 = 0; st.a3 = 0; st.ang = 0; st.n = 0
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
    case 'letty': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.3); ctx.aimed(2, 0.15, { speed: 116, r: 4, color: 7 }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 0.26)
          s.ang += 0.42
          ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 78), r: 4, color: 7, kind: 'orb' })
        }
      })],
    })
    case 'chen': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.15); ctx.aimed(3, 0.17, { speed: 124, r: 4, color: 1 }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 1.6)
          ringGapArc(ctx, cntOf(ctx, 12), s.ang, 0.55, { speed: 66, r: 4.5, color: 3 })
          s.ang += 0.7
        }
      })],
    })
    case 'alice': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.2); ctx.aimed(2, 0.15, { speed: 118, r: 4, color: 5 }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 1.0)
          const side = s.n % 2 === 0 ? -64 : 64
          s.n += 1
          const x = ctx.bossX() + side
          const y = ctx.bossY() + 24
          const a = Math.atan2(ctx.player.y - y, ctx.player.x - x)
          ctx.spawn({ x, y, angle: a, speed: spdOf(ctx, 124), r: 4, color: 6, kind: 'orb' })
        }
      })],
    })
    case 'prism': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 0.25)
          s.ang += 0.36
          ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 84), r: 4.5, color: 4, kind: 'orb' })
        }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 1.7)
          const baseA = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
          fanFrom(ctx, ctx.bossX(), ctx.bossY(), baseA, 3, 0.2, { speed: 126, r: 4.5, color: 0 })
        }
      })],
    })
    case 'youmu': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 1.25)
          const baseA = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
          fanFrom(ctx, ctx.bossX(), ctx.bossY(), baseA, 3, 0.2, { speed: 134, r: 4, color: 7, kind: 'knife' })
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.4); ctx.aimed(1, 0, { speed: 124, r: 4.5, color: 7, kind: 'bubble' }) }
      })],
    })
    case 'yuyuko': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 0.25)
          s.ang += 0.31
          ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 82), r: 4.5, color: 6, kind: 'ellipse' })
        }
      })],
    })
    case 'ran': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.1); ctx.aimed(3, 0.16, { speed: 128, r: 4, color: 2 }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 1.7)
          ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.52, { speed: 62, r: 4.5, color: 4 })
          s.ang += 0.65
        }
      }, 'teleport', { interval: 3.6 })],
    })
    case 'yukari': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.15); ctx.aimed(3, 0.15, { speed: 126, r: 4, color: 4, kind: 'knife' }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 2.0)
          const pts: [number, number][] = [[52, 120], [332, 120], [52, 250], [332, 250]]
          const p = pts[s.n % 4]
          s.n += 1
          gapPortal(ctx, p[0], p[1], 4)
        }
      }, 'teleport', { interval: 3.4 })],
    })
  }
}

// ボスの表示名（ステージカード／情報パネル用）
const BOSS_META: Record<BossId, { name: string; epithet: string }> = {
  letty: { name: 'レティ・ホワイトロック', epithet: '冬を司る妖怪' },
  chen: { name: '橙', epithet: '凶兆の黒猫' },
  alice: { name: 'アリス・マーガトロイド', epithet: '七色の人形遣い' },
  prism: { name: 'プリズムリバー三姉妹', epithet: '騒霊三姉妹' },
  youmu: { name: '魂魄妖夢', epithet: '半人半霊の庭師' },
  yuyuko: { name: '西行寺幽々子', epithet: '華胥の亡霊' },
  ran: { name: '八雲藍', epithet: '策士の式神' },
  yukari: { name: '八雲紫', epithet: '境界の妖怪' },
}
// ===== 会話シーン（ボス戦前／撃破後） =====
// 台詞は原作の書き起こしではなく、キャラの口調と場面構成（遭遇→掛け合い→戦闘開始）に
// 寄せた自作文。自機（霊夢／魔理沙）で分岐し、ボス側の応答も自機に合わせて変えている。
// プリズムリバーは三姉妹が代わる代わる話すため、ボス側の台詞に名前を冠している。
// w: 'p' = 自機, 'b' = ボス
type DLine = { w: 'p' | 'b'; t: string }
type DlgScript = { pre: DLine[]; post: DLine[] }
const dl = (w: 'p' | 'b', t: string): DLine => ({ w, t })
const DIALOGUES: Record<BossId, Record<CharaId, DlgScript>> = {
  letty: {
    reimu: {
      pre: [
        dl('p', 'うう、寒い……。春の気配が全然戻ってこないわね。'),
        dl('b', 'あら、巫女さん。私はレティ。冬が長引くのは私のせいじゃないのよ？'),
        dl('p', '桜が咲かないのは誰のせいかしら。少なくとも、あんたの周りは真冬のままよ。'),
        dl('b', 'ふふ、春が来ないなら、私はずっと元気でいられるもの。'),
        dl('p', '冬眠しすぎよ。少し運動して温まりなさい！'),
        dl('b', 'あらあら、凍てつく風でお相手するわ！'),
      ],
      post: [
        dl('b', 'あいたた……。なんだか眠くなってきたわ……。'),
        dl('p', 'ほら、運動したら眠くなるでしょう。おとなしく春を待ってなさい。'),
        dl('b', 'そうね……春が来たら、また会いましょう……。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'いてて、手がかじかんできたぜ。この寒さ、普通じゃないな。'),
        dl('b', '私はレティ。この辺りの冬を預かっているの。'),
        dl('p', '預かりすぎだぜ。幻想郷中から春が消えちまってる。'),
        dl('b', '春が来れば私は眠るだけ。だから、今のうちに暴れておくの。'),
        dl('p', '暴れる相手を間違えたな。私の魔法は火力十分だぜ！'),
        dl('b', 'なら、私の冷気で冷ましてみせて！'),
      ],
      post: [
        dl('b', '熱い……魔法って、こんなに熱かったかしら……。'),
        dl('p', 'これで少しは目が覚めたか？　春はもうすぐそこだぜ。'),
        dl('b', 'ふぁ……じゃあ私は、春までお休みするわ……。'),
      ],
    },
  },
  chen: {
    reimu: {
      pre: [
        dl('b', 'にゃーん！　ここから先は通さないよ！'),
        dl('p', '猫？　……耳と尻尾が二つずつ。ただの猫じゃないわね。'),
        dl('b', '私は橙！　藍様の式神だよ。春を集めてる奴は、あんた？'),
        dl('p', '逆よ。春が集められすぎてるから、返してもらいに来たの。'),
        dl('b', 'だめだめ！　藍様の大事な用事なんだから！'),
        dl('p', 'じゃあ、力ずくで通らせてもらうわ。'),
      ],
      post: [
        dl('b', 'うぅ……藍様ぁ、ごめんなさい……。'),
        dl('p', '藍、ね。その主のところへ案内してもらいたいところだけど……まあ、追えば分かるか。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', '止まれー！　ここは私、橙の縄張りだよ！'),
        dl('p', 'お、化け猫か。悪いな、急いでるんだ。どいてくれ。'),
        dl('b', '藍様に言われてるの。春を掻き集める邪魔者は通すなって！'),
        dl('p', 'へえ、その藍ってのが元凶か。……いや、もっと上がいるのか？'),
        dl('b', 'そんなこと教えない！　行くよ、式神の力、見せてあげる！'),
        dl('p', '上等だぜ。猫じゃらし代わりに遊んでやる！'),
      ],
      post: [
        dl('b', 'ひどいよぉ……マタタビより効いた……。'),
        dl('p', '悪いな。主の居場所は自分で探すさ。じゃあな、橙。'),
      ],
    },
  },
  alice: {
    reimu: {
      pre: [
        dl('b', 'あら、珍しいお客様。……博麗の巫女が、私の館に何の用かしら。'),
        dl('p', 'アリスね。春が消えた異変を追ってるの。何か知らない？'),
        dl('b', 'さあ。ただ、この辺りの春は、随分と上の方へ吸い上げられているみたいよ。'),
        dl('p', '上の方……冥界、か。でも、まずあんたの人形たちが武器を構えてるわよ。'),
        dl('b', 'ふふ、せっかく来たのなら、私の人形劇を見ていきなさい。'),
        dl('p', '劇なら幕引きまで付き合うわ。始めなさい！'),
      ],
      post: [
        dl('b', '見事ね……。私の人形たちが、あそこまで踊らされるなんて。'),
        dl('p', '手がかり、ありがとう。春は上の方、冥界ね。'),
        dl('b', 'ええ。……お礼に言っておくわ。冥界の門番は、腕の立つ剣士よ。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'まあ、魔理沙。人の館に土足で上がり込むのは相変わらずね。'),
        dl('p', 'おう、アリス。ちょうどいい、本を……じゃなくて情報を借りに来た。'),
        dl('b', '春の行方なら、答えは「上」よ。でも、ただでは通さないわ。'),
        dl('p', 'だろうな。人形総動員の歓迎っぷりだし。'),
        dl('b', '私の新しいコレクションの動き、試させてもらうわ。'),
        dl('p', 'いいぜ、全部まとめて相手してやる！'),
      ],
      post: [
        dl('b', '……ふう。やっぱり、あなたは人形では止められないわね。'),
        dl('p', 'じゃあ行くぜ。「上」ってのは冥界のことだろ？'),
        dl('b', 'ええ。白玉楼よ。……門番の剣には気をつけて。'),
      ],
    },
  },
  prism: {
    reimu: {
      pre: [
        dl('p', '騒がしいわね……。音の出どころは、あんたたち？'),
        dl('b', 'ルナサ：あら、お客さん。私たちはプリズムリバー三姉妹。'),
        dl('b', 'メルラン：お嬢様の宴の演奏の、真っ最中なのよ！'),
        dl('b', 'リリカ：ねえねえ、その巫女さんも巻き込んで、セッションしない？'),
        dl('p', '宴？　誰の宴か知らないけど、春を集めたお祝いなら止めさせてもらうわ。'),
        dl('b', 'ルナサ：なら、演奏でお相手しましょう。騒がしくいくわよ！'),
      ],
      post: [
        dl('b', 'メルラン：あーあ、楽器が悲鳴を上げちゃった……。'),
        dl('b', 'リリカ：でも楽しかった！　今度は宴で一緒にやろうよ。'),
        dl('p', '宴の主はこの奥ね。……まあ、演奏自体は悪くなかったわ。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'お、いい音だな。トランペットが特に。'),
        dl('b', 'メルラン：でしょでしょ！　私のトランペットは最高なの！'),
        dl('b', 'ルナサ：メルラン、調子に乗らない。……あんた、宴の邪魔をしに来たの？'),
        dl('p', '邪魔って言うか、春を返してもらいに来たんだぜ。'),
        dl('b', 'リリカ：じゃあ勝負！　私たちの演奏に勝てたら通してあげる！'),
        dl('p', '望むところだ。耳栓なしで耐えてみせるぜ！'),
      ],
      post: [
        dl('b', 'ルナサ：……完敗ね。あんたの魔法の音の方が、大きかったみたい。'),
        dl('p', 'はは、音量勝負なら負けないぜ。宴の主にはよろしくな。'),
        dl('b', 'メルラン：お嬢様、怒らないといいけど……。'),
      ],
    },
  },
  youmu: {
    reimu: {
      pre: [
        dl('b', '止まりなさい。ここから先は白玉楼、不用意に踏み込む場所ではありません。'),
        dl('p', '立派な石段と、立派な門番ね。私は春を返してもらいに来たの。'),
        dl('b', '春は幽々子様の悲願のために集めています。巫女といえど、通すわけにはいきません。'),
        dl('p', 'やっぱり元凶は奥のお嬢様か。……で、あんたは本気で私を止めるつもり？'),
        dl('b', '魂魄妖夢、主の剣として。……楼観剣に、斬れないものはあんまりない！'),
        dl('p', 'なら私も本気でいくわ。その剣、受けてみせる！'),
      ],
      post: [
        dl('b', '……見事です。私の剣が、届かなかった……。'),
        dl('p', 'あんたは強いわ。でも、主のやり方は間違ってる。止めてくる。'),
        dl('b', '幽々子様……どうか、ほどほどに……。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', '待ちなさい。白玉楼に何の用ですか、魔法使い。'),
        dl('p', 'お嬢様に用だ。春を独り占めするのはやめてもらうぜ。'),
        dl('b', '幽々子様のお望みは、誰にも邪魔させません。半霊の私が言うのも何ですが。'),
        dl('p', '半人半霊か。面白いな、二人分の相手ってことか？'),
        dl('b', 'ふふ、試してみますか。私の二刀は伊達じゃありませんよ。'),
        dl('p', '上等！　速さ勝負といこうぜ！'),
      ],
      post: [
        dl('b', '速い……。魔法使いの機動に、追いつけなかった……。'),
        dl('p', '剣の腕は確かだったぜ。あとは主を説得するだけだ。'),
        dl('b', '幽々子様は……説得の効くお方では、ないのですが……。'),
      ],
    },
  },
  yuyuko: {
    reimu: {
      pre: [
        dl('b', 'あらあら、お客様ね。ようこそ白玉楼へ。'),
        dl('p', '西行寺幽々子。幻想郷中の春を集めているのは、あんたね。'),
        dl('b', 'うふふ、西行妖を満開にしたくて。あと少しで、桜の下に眠る秘密が分かるの。'),
        dl('p', 'その「あと少し」で、幻想郷は凍え死にそうなのよ。やめなさい。'),
        dl('b', 'あら、怖い巫女さん。でもね、死んでる私には、凍え死にも関係ないの。'),
        dl('p', '関係大ありよ。……説得が無理なら、力で止める！'),
        dl('b', 'いいわ、桜の下で踊りましょう。蝶々がお相手するわ。'),
      ],
      post: [
        dl('b', 'あらあら、負けちゃった。でも、綺麗な弾幕だったわ。'),
        dl('p', '集めた春は返してもらうわよ。西行妖の秘密は、また今度ね。'),
        dl('b', 'そうね……。じゃあ、お花見の準備をしましょう。妖夢ー、お団子持ってきてー。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'あら、魔法使いさん。お花見には少し早いわよ？'),
        dl('p', 'その「少し早い」春を、あんたが全部持ってるんだろ。返せよ、幽々子。'),
        dl('b', 'うふふ、西行妖が咲けば、もっと素敵なお花見になるのに。'),
        dl('p', '咲かせる前に幻想郷が冬眠しちまうぜ。悪い冗談はやめろ。'),
        dl('b', '冗談じゃないの。本気よ？　亡霊だって、好奇心は死なないの。'),
        dl('p', '好奇心は猫も殺すって言うぜ。……やるぞ！'),
        dl('b', 'あら楽しみ。蝶の舞、とくとご覧あれ。'),
      ],
      post: [
        dl('b', 'あいたた……。でも、いい運動になったわ。'),
        dl('p', '春は返してもらったぜ。今度は普通のお花見に誘ってくれ。'),
        dl('b', 'ええ、ぜひ。妖夢のお団子は絶品なのよ。'),
      ],
    },
  },
  ran: {
    reimu: {
      pre: [
        dl('b', 'ふむ、巫女か。式の里へようこそ。……いや、歓迎はされていないと思ってくれ。'),
        dl('p', '八雲藍。あんたの式、橙には世話になったわ。春集めの続き？'),
        dl('b', '紫様の命でな、幻想郷の結界のほころびを調べている。ついでに春も、少々。'),
        dl('p', 'ついでの規模じゃないわよ。紫を出しなさい。'),
        dl('b', '主はお休み中だ。起こす前に、私の計算を上回ってみせよ。'),
        dl('p', '計算違いよ。私の勘は、あんたの式より速いわ！'),
      ],
      post: [
        dl('b', '……計算外、とはこのことか。勘という名の確率収束……。'),
        dl('p', 'ほらね。主を起こしてきなさい。今度は話し合いで済ませたいわ。'),
        dl('b', 'ふむ……紫様が起きるかどうかは、気分次第だがな。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', '魔法使いか。私の結界の計算に、随分とノイズを入れてくれたな。'),
        dl('p', '八雲藍だな。橙の主ってわけだ。春集めの責任者、出てこいって紫に伝えてくれ。'),
        dl('b', '紫様は就寝中。代理は私が務める。九尾の力、計算ずくで押し切ってやろう。'),
        dl('p', '計算ね。私の火力は計算外ってやつだぜ。'),
        dl('b', 'では検証しよう。式神の総力、受けてみよ！'),
        dl('p', '上等だ、狐のお姉さん！'),
      ],
      post: [
        dl('b', 'ぐ……計算が、追いつかない……。'),
        dl('p', 'はは、計算外の勝利だぜ。紫を起こしてきな、話はそれからだ。'),
        dl('b', '……起きたら、私が怒られる番か。とほほ。'),
      ],
    },
  },
  yukari: {
    reimu: {
      pre: [
        dl('b', 'あら、霊夢。こんな境界の果てまで、ご苦労さま。'),
        dl('p', '八雲紫。やっぱりあんたが裏にいたのね。春集めも、結界のほころびも。'),
        dl('b', 'うふふ、私は寝ていただけよ。藍が勝手に頑張っちゃったの。'),
        dl('p', '部下のせいにするな。……で、春は返してくれるの？'),
        dl('b', 'もちろん。でも、その前に少しだけ、境界の向こうを覗いていきなさい。'),
        dl('p', '覗くのはいいけど、落ちたら自己責任、ってわけね。覚悟して受けて立つわ！'),
        dl('b', 'いい答え。夢と現の境界で、遊びましょう。'),
      ],
      post: [
        dl('b', 'あらあら、やっぱり霊夢は強いわね。'),
        dl('p', '春は返してもらうわよ。あと、寝すぎ。たまには起きて仕事しなさい。'),
        dl('b', 'うふふ、善処するわ。……藍、春を返す手続き、お願いね。'),
      ],
    },
    marisa: {
      pre: [
        dl('b', 'あら、魔理沙。境界を越えてくるなんて、肝が据わってるわね。'),
        dl('p', '紫か。春の異変、元を辿ればあんたの式の仕業だろ。'),
        dl('b', '私は寝ていただけ。でも、式の責任は主の責任、とも言うわね。'),
        dl('p', '潔いんだか何なんだか。とにかく春は返してもらうぜ。'),
        dl('b', 'いいわよ。その代わり、境界の弾幕を抜けてから、ね。'),
        dl('p', '望むところだ。スキマだらけの攻撃、当ててみせろ！'),
        dl('b', 'ふふ、スキマは避けるものじゃなくて、落ちるものよ？'),
      ],
      post: [
        dl('b', '見事ね、魔理沙。スキマを全部かわすなんて。'),
        dl('p', 'へへ、当然だぜ。じゃあ約束通り、春を返せよな。'),
        dl('b', 'ええ、約束は守るわ。……たまにはお茶でも飲みにいらっしゃい。'),
      ],
    },
  },
}
// ===== ポートレート画像（自前生成イラスト） =====
// 自機2人は public/cdn/koumakyou/、ボス8人は public/cdn/youyoumu/ の webp を
// 自オリジン相対（BASE_URL基準）で参照し、SW の cdn/ キャッシュに乗せる。
// 読み込み失敗時は呼び出し側が図形／文字のフォールバック表示に切り替えるため、
// 画像が無くてもゲームは動作する。
const portraitUrl = (id: string): string =>
  id === 'reimu' || id === 'marisa'
    ? `${import.meta.env.BASE_URL}cdn/koumakyou/${id}.webp`
    : `${import.meta.env.BASE_URL}cdn/youyoumu/${id}.webp`

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
// 妖々夢向けに7曲（Phantasm用を含む）を新規に作曲している。
// 原作の旋律・フレーズは一切使わない。
type TrackId = 'title' | 'stage' | 'boss' | 'exstage' | 'exboss' | 'phantasm' | 'jingle'
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
    bpm: 132, cut: 1700, arpDiv: 2, patch: 'trumpet',
    lead: parseLead('D5 . . . F5 . . . A5 . . . C6 . . . Bb5 . . . A5 . . . . . G5 . E5 . . . F5 . . . A5 . . . D6 . . . C6 . . . A5 . . . Bb5 . . . G5 . . . A5 . . . C6 . . . F6 . . . E6 . . . C6 . . . Bb5 . . . A5 . . . . . G5 . A5 . . . F5 . . . E5 . . . D5 . . . F5 . . . . . . . C5 . . . D5 . . .'),
    roots: [38, 38, 34, 36, 38, 38, 34, 33],
    bassPat: BASS_PAT_CALM,
    chords: [[62, 65, 69, 74], [62, 65, 69, 74], [58, 62, 65, 70], [60, 64, 67, 72], [62, 65, 69, 74], [62, 65, 69, 74], [58, 62, 65, 70], [57, 61, 64, 69]],
    kick: 'x.......x.......', snare: '................', hat: 'x.x.x.x.x.x.x.x.',
  },
  stage: {
    bpm: 174, cut: 2600, arpDiv: 1, patch: 'trumpet',
    lead: parseLead('A5 . C6 . E6 . A6 . G6 . E6 . C6 . E6 . A6 . . . G6 . E6 . C6 . B5 . C6 . D6 . F6 . E6 . D6 . C6 . A5 . C6 . F6 . E6 . D6 . E6 . G6 . E6 . D6 . B5 . C6 . B5 . A5 C6 D6 E6 F6 E6 D6 C6 B5 C6 D6 E6 G6 . . . A6 . G6 . E6 . C6 . E6 . D6 . C6 . B5 . C6 . F6 . E6 . D6 . C6 . A5 . B5 . C6 . B5 . C6 . G#5 . B5 . E6 . . . x x x x E6 . A6 . C7 . A6 . E6 . C6 . A5 . C6 . D6 . E6 . F6 . E6 . D6 . C6 . B5 . A6 . . . . . G6 . F6 . E6 . D6 . C6 . C6 . D6 . E6 . G6 . F6 . E6 . D6 . A6 G6 E6 C6 A5 C6 E6 A6 G6 . . . E6 . . . C7 . A6 . G6 . E6 . D6 . E6 . F6 . E6 . F6 . E6 . D6 . C6 . D6 . E6 . F6 . G6 . G#6 . . . B6 . . . E6 . . . x x x x'),
    roots: [45, 45, 41, 43, 45, 45, 41, 40],
    bassPat: BASS_PAT_DRIVE,
    chords: [[57, 60, 64, 69], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [57, 60, 64, 69], [57, 60, 64, 69], [53, 57, 60, 65], [52, 56, 59, 64]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.',
  },
  boss: {
    bpm: 186, cut: 3000, arpDiv: 1, patch: 'brass', stab: true,
    lead: parseLead('A5 . A5 . C6 . A5 . E6 . A5 . C6 . A5 . A6 . . . G6 . E6 . C6 . B5 . C6 . D6 . F6 . E6 . D6 . A5 . D6 . F6 . A6 . G6 . G#6 . . . B6 . . . E6 . D6 . C6 . B5 . C6 . D6 . E6 . A6 . G6 . E6 . C6 . A5 . A5 . D6 . F6 . D6 . E6 . F6 . G6 . A6 . F6 . . E6 . . D6 . C6 . B5 . C6 . D6 . E6 . . . D6 . C6 . B5 . G#5 . B5 . E5 . A6 . C7 . A6 . E6 . C6 . A5 . C6 . E6 . F6 . E6 . D6 . C6 . B5 . C6 . D6 . E6 . A6 . . . . . G6 . F6 . E6 . D6 . C6 . B6 . . . G#6 . . . E6 . . . D6 . C6 . C6 . F6 E6 D6 C6 Bb5 A5 G5 F5 E5 F5 G5 A5 C6 D6 E6 . E6 . . C6 . . F6 . E6 . D6 . C6 . B5 . C6 . F6 . E6 . D6 . E6 . F6 . G6 . G#6 . . . . . . . B6 . . . E6 . . .'),
    roots: [45, 43, 45, 40, 45, 43, 41, 40],
    bassPat: BASS_PAT_GALLOP,
    chords: [[57, 60, 64, 69], [55, 59, 62, 67], [57, 60, 64, 69], [52, 56, 59, 64], [57, 60, 64, 69], [55, 59, 62, 67], [53, 57, 60, 65], [52, 56, 59, 64]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exstage: {
    bpm: 182, cut: 2800, arpDiv: 1, patch: 'trumpet',
    lead: parseLead('C#6 . E6 . G#6 . C#7 . B6 . G#6 . E6 . G#6 . C#7 . B6 . G#6 . E6 . F#6 . G#6 . B6 . G#6 . A6 . G#6 . F#6 . E6 . C#6 . E6 . A6 . C#7 . B6 . A6 . G#6 . F#6 . D#6 . F#6 . B6 . G#6 . C#7 B6 G#6 E6 C#6 E6 G#6 C#7 G#6 . . . F#6 . . . E6 . F#6 . G#6 . B6 . C#7 . B6 . G#6 . F#6 . C#7 . A6 . F#6 . E6 . F#6 . A6 . C#7 . B6 . F6 . . . G#6 . . . D#6 . C#6 . G#5 . . . G#6 . C#7 . E7 . C#7 . G#6 . E6 . C#6 . E6 . F#6 . G#6 . A6 . G#6 . F#6 . E6 . C#6 . E6 . A6 . C#7 . A6 . B6 . G#6 . E6 . G#6 . F#7 . B6 . A6 . G#6 . F#6 . E6 . C#7 . . G#6 . . E6 . C#6 . E6 . G#6 . B6 . A6 . B6 . C#7 . E7 . C#7 . B6 . G#6 . F#6 . A6 . . . E6 . . . F#6 . G#6 . A6 . B6 . G#6 . . . F6 . . . G#6 . . . x x x x'),
    roots: [49, 49, 45, 47, 49, 49, 45, 44],
    bassPat: BASS_PAT_DRIVE,
    chords: [[61, 64, 68, 73], [61, 64, 68, 73], [57, 61, 64, 69], [59, 63, 66, 71], [61, 64, 68, 73], [61, 64, 68, 73], [57, 61, 64, 69], [60, 63, 66, 71]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exboss: {
    bpm: 194, cut: 3200, arpDiv: 1, patch: 'brass', stab: true,
    lead: parseLead('C#6 . C#6 . E6 . C#6 . G#6 . C#6 . E6 . C#6 . C#7 . . . B6 . G#6 . E6 . D#6 . E6 . F#6 . A6 . G#6 . F#6 . C#6 . F#6 . A6 . C#7 . B6 . F6 . . . G#6 . . . D#6 . F#6 . G#6 . F6 . G#6 F6 D#6 C#6 B5 C#6 D#6 E6 F#6 G#6 F#6 E6 D#6 C#6 D#6 . G#6 . . . E6 . . . C#6 . . . x . G#5 . A6 . C#7 . E7 . C#7 . B6 . G#6 . E6 . G#6 . F6 . . . . . . . G#6 . F#6 . E6 . D#6 . C#7 . E7 . G#7 . E7 . C#7 . G#6 . E6 . C#6 . B6 . A6 . G#6 . F#6 . G#6 . A6 . B6 . C#7 . E7 . A6 . F#6 . C#6 . D#6 . E6 . F#6 . G#6 . F6 . . . D#7 . . . G#6 . . . x x x x C#7 . . . B6 . . . A6 . . . G#6 . . . F#6 . G#6 . A6 . B6 . C#7 . B6 . G#6 . E6 . E6 . A6 . C#7 . E7 . D#7 . B6 . G#6 . B6 . F6 . . . G#6 . . . C#7 . . . x x x x'),
    roots: [49, 49, 42, 44, 49, 49, 45, 44],
    bassPat: BASS_PAT_GALLOP,
    chords: [[61, 64, 68, 73], [61, 64, 68, 73], [57, 60, 64, 69], [60, 63, 66, 71], [61, 64, 68, 73], [61, 64, 68, 73], [57, 61, 64, 69], [60, 63, 66, 71]],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo',
  },
  phantasm: {
    bpm: 168, cut: 2900, arpDiv: 1, patch: 'bell',
    lead: parseLead('F#5 . . A5 . . C#6 . . . B5 . . . A5 . . . G#5 . . . A5 . . . E6 . . . D6 . . . C#6 . . . B5 . . . A5 . . . F#5 . . A5 . . C#6 . . E6 . . . D6 . . . C#6 . . . D6 . . . E6 . . . F#6 . . . E6 . . . D6 . . . C#6 . . . B5 . . . C#6 . . . A5 . . . F#6 E6 C#6 A5 F#5 A5 C#6 F#6 E6 . . . D6 . . . B5 . . . A5 . . . C#6 . . . E6 . . . G#6 . . . F#6 . . . E6 . . . D6 . . . B5 . . . G#5 . B5 . D6 . B5 . A5 . B5 . C#6 . D6 . C#6 . B5 . A5 . G#5 . A5 . B5 . C#6 . E6 . C#6 . D6 . B5 . A5 . C#6 . . . F#5 . . . A5 . B5 . C#6 . D6 . B5 . . . G#6 . . . F#6 . . . x x x x'),
    roots: [42, 42, 38, 40, 42, 42, 38, 40],
    bassPat: BASS_PAT_DRIVE,
    chords: [[54, 57, 61, 66], [54, 57, 61, 66], [50, 54, 57, 62], [52, 56, 59, 64], [54, 57, 61, 66], [54, 57, 61, 66], [50, 54, 57, 62], [52, 56, 59, 64]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.',
  },
  jingle: {
    bpm: 148, cut: 2400, arpDiv: 2, once: true, patch: 'bell',
    lead: parseLead('A5 . C#6 . E6 . A6 . C#7 . . . A6 . . . B6 . A6 . G#6 . E6 . C#6 . E6 . A6 . . . D6 . F#6 . A6 . D7 . C#7 . A6 . F#6 . D6 . E6 . G#6 . B6 . E7 . A6 . . . . . . .'),
    roots: [45, 45, 50, 52],
    bassPat: BASS_PAT_CALM,
    chords: [[57, 61, 64, 69], [57, 61, 64, 69], [55, 59, 62, 66], [56, 59, 64, 68]],
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
  bossId: BossId | null
  midId: MidId | null
  msg: string
  msgT: number
}

export default function Youyoumu() {
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
  const [dlgUi, setDlgUi] = useState<{ boss: BossId; lines: DLine[]; idx: number } | null>(null)
  // ===== タイトル画面のステップ（原作のメニュー構成に寄せた多段選択） =====
  const [titleStep, setTitleStep] = useState<'menu' | 'chara' | 'diff' | 'records' | 'help'>('menu')
  const [pendingRun, setPendingRun] = useState<'story' | 'extra' | 'phantasm'>('story')
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
  const startRef = useRef<(run: 'story' | 'extra' | 'phantasm') => void>(() => {})

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
        if (lastStage === 7) { setEndTitle('PHANTASM CLEAR!'); setEndSub('境界の妖怪と遊んだ！') } else if (lastStage === 6) { setEndTitle('EXTRA CLEAR!'); setEndSub('式神の里を駆け抜けた！') } else if (G.diff === 'easy') {
          setEndTitle('EASY CLEAR!'); setEndSub('STAGE 5までクリア。Normal以上で全6面とEXに挑戦しよう')
        } else { setEndTitle('ALL CLEAR!'); setEndSub('幻想郷に春が戻った！') }
        bgmPlay('jingle')
      } else {
        setEndTitle('GAME OVER')
        setEndSub(G.stageIdx === 7 ? 'PHANTASM STAGE で力尽きた…' : G.stageIdx === 6 ? 'EXTRA STAGE で力尽きた…' : `STAGE ${G.stageIdx + 1} で力尽きた…`)
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
      bgmPlay(G.stageIdx === 7 ? 'phantasm' : G.stageIdx === 6 ? 'exstage' : 'stage')
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
      bgmPlay(G.stageIdx === 7 ? 'phantasm' : G.stageIdx === 6 ? 'exboss' : 'boss')
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
      // 舞い落ちる桜の花びら
      for (let i = 0; i < 42; i++) {
        const sx = ((i * 89 + G.time * (7 + (i % 3) * 5)) % (FW + 24)) - 12
        const sy = (i * 61 + G.time * (15 + (i % 4) * 6)) % FH
        ctx.fillStyle = i % 3 === 0 ? 'rgba(248,187,208,0.85)' : 'rgba(244,143,177,0.5)'
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(G.time * (1 + (i % 3) * 0.4) + i)
        ctx.fillRect(-2.2, -1.1, 4.4, 2.2)
        ctx.restore()
      }
      // 遠景の鳥居のシルエット
      ctx.fillStyle = 'rgba(6,3,12,0.8)'
      ctx.fillRect(28, 52, 74, 7)
      ctx.fillRect(36, 66, 58, 5)
      ctx.fillRect(40, 52, 8, 62)
      ctx.fillRect(82, 52, 8, 62)
      // 底の石段と桜色の反射
      const mg = ctx.createLinearGradient(0, FH - 46, 0, FH)
      mg.addColorStop(0, 'rgba(244,143,177,0)')
      mg.addColorStop(1, 'rgba(244,143,177,0.26)')
      ctx.fillStyle = mg
      ctx.fillRect(0, FH - 46, FW, 46)
      ctx.fillStyle = 'rgba(6,3,10,0.9)'
      ctx.fillRect(0, FH - 14, FW, 14)
      ctx.fillStyle = 'rgba(248,187,208,0.7)'
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

      // アイテム
      items.render(ctx)
      // 敵
      for (const en of enemies.active) drawFairy(en)
      // 中ボス／ボス（紫はスキマに隠れる演出として少し半透明で描く）
      if (bossCtl.active) {
        const curId = ctlIsMid ? G.midId : G.bossId
        const fig = ctlIsMid && G.midId ? MID_FIGURES[G.midId] : G.bossId ? BOSS_FIGURES[G.bossId] : null
        const alpha = curId === 'yukari' ? 0.85 : 1
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
        drawFigure(ctx, BOSS_FIGURES[G.bossId], FW / 2, 88, { t: G.time, alpha: G.bossId === 'yukari' ? 0.85 : 1 })
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
        ctx.fillStyle = '#f8bbd0'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(G.stageIdx === 7 ? 'PHANTASM STAGE' : G.stageIdx === 6 ? 'EXTRA STAGE' : `STAGE ${G.stageIdx + 1}`, FW / 2, 158)
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
      ctx.fillStyle = '#17060f'; ctx.fillRect(FW, 0, SW - FW, SH)
      ctx.fillStyle = '#4a2b3d'; ctx.fillRect(FW, 0, 2, SH)
      const sx = FW + 14
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      const label = (s: string, y: number) => {
        ctx.fillStyle = '#d8b7c8'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(s, sx, y)
      }
      const value = (s: string, y: number) => {
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.fillText(s, sx, y)
      }
      label('STAGE', 12)
      value(G.stageIdx === 7 ? 'PHANTASM' : G.stageIdx === 6 ? 'EXTRA' : `STAGE ${G.stageIdx + 1}`, 26)
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
        ctx.fillStyle = '#d8b7c8'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('MISS', sx + 62, 266)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.fillText(String(G.misses), sx + 62, 280)
      }
      label('TIME', 306)
      value(`${Math.floor(G.time)}s`, 320)
      ctx.fillStyle = '#d8b7c8'; ctx.font = '10px sans-serif'
      ctx.fillText(`${G.chara === 'marisa' ? '魔理沙' : '霊夢'} / ${DIFF_CFG[G.diff].label}${G.challenge ? ' / CHALLENGE' : ''}`, sx, 344)
      ctx.fillStyle = '#a58a99'; ctx.font = '10px sans-serif'
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

    startRef.current = (run: 'story' | 'extra' | 'phantasm') => {
      const sel = selRef.current
      const list = run === 'extra' ? [6] : run === 'phantasm' ? [7] : sel.diff === 'easy' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5]
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
    background: 'rgba(16,4,10,0.82)', color: '#fff', textAlign: 'center',
    borderRadius: 8, padding: 14, zIndex: 3, overflowY: 'auto',
  }
  const btnStyle: React.CSSProperties = {
    background: '#ad1457', color: '#fff', border: '1px solid #ffab91',
    borderRadius: 999, padding: '10px 28px', fontSize: 16, fontWeight: 'bold',
    cursor: 'pointer',
  }
  const selLabel: React.CSSProperties = { fontSize: 11, color: '#d8b7c8', letterSpacing: 2, marginTop: 4 }
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
            color: '#f8bbd0', fontWeight: 'bold', fontSize: 20, letterSpacing: 2,
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
        .youyou-btn:active { transform: scale(0.96); }
        .youyou-menu { transition: background 0.12s, color 0.12s; }
        .youyou-menu:hover, .youyou-menu:active { background: rgba(240, 98, 146, 0.18); color: #fde7ef; }
        .youyou-menu .youyou-caret { opacity: 0; transition: opacity 0.12s; }
        .youyou-menu:hover .youyou-caret, .youyou-menu:active .youyou-caret { opacity: 1; }
        .youyou-card { transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
        .youyou-card:hover, .youyou-card:active { transform: translateY(-2px); border-color: rgba(244,143,177,0.95) !important; box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
      `}</style>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={SW}
          height={SH}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: '#0a0610', touchAction: 'none' }}
        />
        <button
          type="button"
          className="youyou-btn"
          onClick={toggleMute}
          aria-label="BGMミュート切替"
          style={{
            position: 'absolute', right: 10, top: 10, zIndex: 4,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(30,6,18,0.7)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)', fontSize: 17,
            cursor: 'pointer',
          }}
        >
          {mutedUi ? '🔇' : '🔊'}
        </button>
        {screen === 'playing' && (
          <button
            type="button"
            className="youyou-btn"
            onPointerDown={(e) => { e.preventDefault(); pressBomb() }}
            style={{
              position: 'absolute', right: 10, bottom: 10, zIndex: 2,
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(173,20,87,0.78)', color: '#fff',
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
            border: active ? '2px solid rgba(244,143,177,0.95)' : '2px solid rgba(255,255,255,0.25)',
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
                background: 'linear-gradient(to bottom, rgba(12,2,7,0.18) 0%, rgba(12,2,7,0.42) 62%, rgba(12,2,7,0.66) 100%)',
                borderRadius: 8,
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); skipDlg() }}
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 2,
                  background: 'rgba(26,4,14,0.78)', color: '#f8bbd0',
                  border: '1px solid rgba(244,143,177,0.55)', borderRadius: 999,
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
                  background: 'rgba(18,3,9,0.92)', border: '1px solid rgba(255,140,80,0.65)',
                  borderRadius: 10, padding: '14px 16px 16px', minHeight: 92,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)', textAlign: 'left',
                }}
              >
                <div
                  style={{
                    position: 'absolute', top: -13, left: 14, padding: '2px 14px',
                    background: speakingPlayer ? '#7b1fa2' : '#ad1457', color: '#fff',
                    borderRadius: 999, fontSize: 12.5, fontWeight: 'bold', letterSpacing: 1,
                    border: '1px solid rgba(255,255,255,0.5)',
                  }}
                >
                  {speakingPlayer ? playerName : bossName}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.8, color: '#fff', marginTop: 2 }}>{line.t}</div>
                <div style={{ position: 'absolute', right: 14, bottom: 8, fontSize: 11, color: '#f8bbd0' }}>
                  {dlgUi.idx + 1}/{dlgUi.lines.length}　▼ タップ / Z
                </div>
              </div>
            </div>
          )
        })()}
        {screen === 'title' && (() => {
          // タイトル画面：桜と冥界を思わせる背景＋キービジュアル＋縦並びメニュー
          const menuItem = (label: string, caption: string, onClick: () => void) => (
            <button
              key={label}
              type="button"
              className="youyou-menu"
              onClick={onClick}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(244,143,177,0.16)',
                color: '#fdf1e7', padding: '9px 10px', fontSize: 17, fontWeight: 'bold',
                letterSpacing: 2, cursor: 'pointer', textAlign: 'left',
                textShadow: '0 2px 8px rgba(0,0,0,0.85)',
              }}
            >
              <span className="youyou-caret" style={{ color: '#f48fb1', fontSize: 13 }}>▶</span>
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 'normal', color: '#dcb9ca', letterSpacing: 0 }}>{caption}</span>
            </button>
          )
          const stepHeader = (title: string, backTo: 'menu' | 'chara', backLabel: string) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => { setTitleStep(backTo); touchTitle() }}
                style={{
                  background: 'rgba(26,4,14,0.72)', color: '#f8bbd0', border: '1px solid rgba(244,143,177,0.5)',
                  borderRadius: 999, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                }}
              >
                ← {backLabel}
              </button>
              <div style={{ fontSize: 19, fontWeight: 'bold', color: '#f8bbd0', letterSpacing: 3 }}>{title}</div>
            </div>
          )
          const runCaption = pendingRun === 'extra' ? 'EXTRA STAGE' : pendingRun === 'phantasm' ? 'PHANTASM STAGE' : challenge ? 'チャレンジモード（残機無限）' : '全6面'
          return (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 3, borderRadius: 8, overflow: 'hidden',
                background: 'linear-gradient(155deg, #160510 0%, #2b0d20 46%, #170a24 100%)',
                color: '#fff',
              }}
            >
              {/* 桜色のグロー */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 46% at 82% 24%, rgba(244,143,177,0.28), transparent 70%), radial-gradient(ellipse 62% 42% at 10% 80%, rgba(173,20,87,0.26), transparent 70%), radial-gradient(ellipse 90% 30% at 50% 110%, rgba(240,98,146,0.34), transparent 70%)' }} />
              {/* キービジュアル（メニュー画面のみ、右側に大きく） */}
              {titleStep === 'menu' && !imgErr.has('yuyuko') && (
                <img
                  src={portraitUrl('yuyuko')}
                  alt=""
                  draggable={false}
                  onError={() => markImgErr('yuyuko')}
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
                    <div style={{ fontSize: 11, letterSpacing: 5, color: '#f8bbd0', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>ファンメイド弾幕STG</div>
                    <div style={{ fontSize: 44, fontWeight: 'bold', color: '#f06292', letterSpacing: 3, lineHeight: 1.15, textShadow: '0 0 18px rgba(255,90,30,0.75), 0 3px 10px rgba(0,0,0,0.9)' }}>東方妖々夢</div>
                    <div style={{ fontSize: 12.5, color: '#f2d3de', letterSpacing: 2, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>〜 消えた春の異変 〜　全6面＋EX＋Phantasm</div>
                    <div style={{ marginTop: 20, width: '64%', minWidth: 250 }}>
                      {menuItem('ゲームスタート', '春を取り戻す', () => { setChallenge(false); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('エクストラスタート', 'EXTRA STAGE', () => { setChallenge(false); setPendingRun('extra'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('ファンタズムスタート', 'PHANTASM STAGE', () => { setChallenge(false); setPendingRun('phantasm'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('チャレンジ', '残機無限で挑戦', () => { setChallenge(true); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('記録表示', 'スコアとベスト記録', () => { setTitleStep('records'); touchTitle() })}
                      {menuItem('遊び方', '操作とルール', () => { setTitleStep('help'); touchTitle() })}
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, color: '#e3c3d2', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
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
                    <div style={{ fontSize: 12, color: '#dcb9ca', marginBottom: 10 }}>{runCaption} ― 誰で異変に挑む？</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {([
                        { id: 'reimu' as CharaId, name: '博麗霊夢', trait: '誘導・広角ショット／標準速度', desc: '博麗神社の巫女。お札と御札の誘導弾で広く戦う。' },
                        { id: 'marisa' as CharaId, name: '霧雨魔理沙', trait: '集中レーザー／高速', desc: '普通の魔法使い。正面火力と速さで押し切る。' },
                      ]).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="youyou-card"
                          onClick={() => { setChara(c.id); setTitleStep('diff'); touchTitle() }}
                          style={{
                            flex: 1, background: 'rgba(22,4,12,0.74)', color: '#fff', cursor: 'pointer',
                            border: chara === c.id ? '2px solid rgba(244,143,177,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: 10, textAlign: 'left',
                          }}
                        >
                          {portraitEl(c.id, c.name, { width: '100%', height: 208, borderRadius: 8, display: 'block' })}
                          <div style={{ fontSize: 17, fontWeight: 'bold', marginTop: 8 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, color: '#f8bbd0', marginTop: 2 }}>{c.trait}</div>
                          <div style={{ fontSize: 11, color: '#ead9e0', lineHeight: 1.6, marginTop: 4 }}>{c.desc}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {titleStep === 'diff' && (
                  <>
                    {stepHeader('難易度選択', 'chara', '自機選択')}
                    <div style={{ fontSize: 12, color: '#dcb9ca', marginBottom: 10 }}>
                      {chara === 'reimu' ? '博麗霊夢' : '霧雨魔理沙'} ／ {runCaption}
                      {pendingRun !== 'story' && '（EX／Phantasmは難易度で弾幕の密度・速度が変わります）'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {([
                        { id: 'easy' as DiffId, name: 'Easy', desc: pendingRun !== 'story' ? '弾幕は薄め。EX／Phantasmのお試しに' : '5面まで。弾幕は薄めで遊びやすい' },
                        { id: 'normal' as DiffId, name: 'Normal', desc: '標準の歯ごたえ' },
                        { id: 'hard' as DiffId, name: 'Hard', desc: '弾幕の密度・速度アップ' },
                      ]).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="youyou-card"
                          onClick={() => { setDiff(d.id); getBgm(); startRef.current(pendingRun) }}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 14, width: '100%',
                            background: 'rgba(22,4,12,0.74)', color: '#fff', cursor: 'pointer',
                            border: diff === d.id ? '2px solid rgba(244,143,177,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: '13px 16px', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 19, fontWeight: 'bold', letterSpacing: 1 }}>{d.name}</span>
                          <span style={{ fontSize: 12, color: '#ead9e0' }}>{d.desc}</span>
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
                            <span style={{ fontSize: 13, color: '#dcb9ca' }}>　ミス {challengeBest.misses}回</span>
                          </div>
                        ) : (
                          <div style={{ color: '#d8b7c8' }}>まだ記録がありません</div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#ead9e0' }}>
                        EXTRA STAGE（八雲藍戦）と Phantasm（八雲紫戦）は最初からいつでも挑戦できます。
                      </div>
                    </div>
                  </>
                )}
                {titleStep === 'help' && (
                  <>
                    {stepHeader('遊び方', 'menu', 'タイトル')}
                    <div style={{ fontSize: 13, lineHeight: 2.05, color: '#f7ece2' }}>
                      消えた春の異変を追って、冥界の白玉楼を目指そう。全6面＋EX＋Phantasm。<br />
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
            <div style={{ fontSize: 14, color: '#ead9e0' }}>{endSub}</div>
            <div style={{ fontSize: 20, fontFamily: 'monospace' }}>SCORE {finalScore.toLocaleString()}</div>
            {endChallenge && (
              <div style={{ fontSize: 14, color: '#ffd54f' }}>
                チャレンジモード：ミス {finalMisses}回
                {challengeBest.score > 0 && (
                  <span>　／　ベスト {challengeBest.score.toLocaleString()}（ミス {challengeBest.misses}回）</span>
                )}
              </div>
            )}
            <button type="button" className="youyou-btn" style={{ ...btnStyle, marginTop: 6 }} onClick={() => { getBgm(); startRef.current('story') }}>
              もう一度遊ぶ
            </button>
            <button
              type="button"
              onClick={() => { setScreen('title'); setTitleStep('menu'); getBgm().play('title') }}
              style={{ background: 'transparent', color: '#d8b7c8', border: 'none', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
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
