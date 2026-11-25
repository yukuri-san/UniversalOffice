// 輝針城弾幕STG（ファンメイド）
// 東方輝針城にインスパイアされたオリジナルの縦スクロール弾幕シューティング。
// 原作の素材（画像・音楽・データ）は一切使わず、描画はすべて Canvas の図形、
// BGM は WebAudio の FM シンセで合成する完全オリジナル曲（ZUN風の作風で作曲）。
// 進行は全6面＋EX（原作の構成を踏襲したファンメイド再現）。
// ボス戦前／撃破後には会話シーン（台詞は自作文、ポートレートは自前生成イラストを
// public/cdn/kishinjou/ から配信）がある。
//
// 本作の固有ギミック（設計書 kishinjou-design.md が正本）：
//  - 鬼人正邪の「画面反転」：論理座標は反転させず Canvas の表示変換のみで反転し、
//    入力（キー／タッチ）は見た目どおりに追随させる。発動前に約1秒の予告を入れ、
//    切替前後は新規発生を止める。Easy では反転しない。
//  - 妖器ルール：3面（影狼戦）をノーダメージで撃破すると妖器を取得し、
//    4面ボスが九十九弁々（取得時）／九十九八橋（未取得時）に分岐する。
//    判定はプレイごとに毎回行い、セーブには残さない。
//  - 赤蛮奇の分離する首（第2の発射点）、針妙丸の弾の巨大化、影狼の狼変身、
//    雷鼓の拍同期リング、弁々・八橋の演奏連動音符弾、わかさぎ姫の水弾幕。
//
// 内部実装は紅魔郷／地霊殿／妖々夢と同じ自作エンジン2点を使用：
//  - danmaku-engine（弾プール／レーザー／Emitter／固定60Hzループ）
//  - toho-engine（ボス・自機・敵・アイテム・ステージ脚本・キャラ描画）
//
// 弾幕の「隙間ルール」（紅魔郷 v1.2.0 の監査基準を最初から適用）：
//  - 螺旋・ストリームは弾間隔（弾速×発射間隔）＞当たり判定直径＋弾直径を保つ
//  - リングには必ず開口部（欠け）を持たせるか、弧の間隔で抜け道を確保する
//  - 滞留弾で画面を飽和させない（発生率×寿命で同時存在数を抑える）
//  - 壁状パターンの重なりで抜け道が相殺されないよう、波のタイミングをずらす
//  - 反転中は同じパターンの密度を一段下げる（発生間隔×1.35）
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
  CIRNO_FIGURE,
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
const HISCORE_KEY = 'webx-kishinjou-hiscore'
const CHALLENGE_KEY = 'webx-kishinjou-challenge-best'
const DOWN = Math.PI / 2
// 拍同期ギミックの基準テンポ（TRACKS の boss / exboss と一致させる）
const BOSS_BPM = 176
const EXBOSS_BPM = 168

// ===== 基本型（ゲーム側） =====
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; r: number }

type CharaId = 'reimu' | 'marisa'
type DiffId = 'easy' | 'normal' | 'hard'
const DIFF_CFG: Record<DiffId, { spd: number; den: number; label: string }> = {
  easy: { spd: 0.85, den: 0.62, label: 'Easy' },
  normal: { spd: 1, den: 1, label: 'Normal' },
  hard: { spd: 1.14, den: 1.4, label: 'Hard' },
}

type BossId = 'wakasagi' | 'sekibanki' | 'kagerou' | 'benben' | 'yatsuhashi' | 'seija' | 'shinmyoumaru' | 'raiko'
type MidId = 'cirno' | 'sekibanki' | 'kagerou' | 'seija' | 'raiko'
type StageDef = {
  title: string
  road: number
  mid: MidId | null // 4面は中ボスなし
  midName: string
  boss: BossId // 4面は未取得時のボス（八橋）
  bossYouki?: BossId // 4面のみ：妖器取得時のボス（弁々）
  hue: number
}
const STAGES: StageDef[] = [
  { title: '静かなる湖のほとり', road: 32, mid: 'cirno', midName: 'チルノ', boss: 'wakasagi', hue: 0 },
  { title: '妖怪の棲む竹林', road: 32, mid: 'sekibanki', midName: '赤蛮奇', boss: 'sekibanki', hue: 1 },
  { title: '満月の獣道', road: 32, mid: 'kagerou', midName: '今泉影狼', boss: 'kagerou', hue: 2 },
  { title: '輝針城への空中回廊', road: 34, mid: null, midName: '', boss: 'yatsuhashi', bossYouki: 'benben', hue: 3 },
  { title: '逆転の輝針城', road: 34, mid: 'seija', midName: '鬼人正邪', boss: 'seija', hue: 4 },
  { title: '小人の御殿', road: 36, mid: 'seija', midName: '鬼人正邪', boss: 'shinmyoumaru', hue: 5 },
  { title: '嵐の太鼓台', road: 34, mid: 'raiko', midName: '堀川雷鼓', boss: 'raiko', hue: 6 },
]
/** そのステージで実際に対峙するボス（4面は妖器フラグで分岐） */
const bossOfStage = (stageIdx: number, youki: boolean): BossId => {
  const sd = STAGES[stageIdx]
  return youki && sd.bossYouki ? sd.bossYouki : sd.boss
}
// ステージごとの背景グラデーション [上, 中, 下]
const BG_PALS: [string, string, string][] = [
  ['#06121c', '#0d2436', '#14344c'], // 1面 湖
  ['#0a140c', '#14281a', '#1e3d26'], // 2面 竹林
  ['#0c0e1e', '#181c38', '#232a52'], // 3面 月夜
  ['#120c1e', '#221238', '#331c50'], // 4面 回廊
  ['#160a14', '#2c1224', '#431a34'], // 5面 城内
  ['#140c20', '#27163e', '#3a2058'], // 6面 御殿
  ['#0a0a18', '#161632', '#22224c'], // EX 嵐
]

// ===== 画面反転の共有状態（フェイズ更新 ⇔ 本体ループ） =====
// フェイズ側は wantX/wantY に「望ましい反転状態」を毎フレーム書き込み、
// 本体側が予告（約1秒）→切替→切替後の発生停止（約0.5秒）を管理する。
// appliedX/appliedY は本体側が書き、フェイズ側は密度調整の参照に使う。
const flipShared = {
  wantX: false,
  wantY: false,
  appliedX: false,
  appliedY: false,
  holdFire: false, // true の間、反転系パターンは新規発生を止める
}
// 影狼の狼変身の共有状態（描画側がフィギュアを切り替える）
const formShared = { wolf: false }

// ===== キャラ描画（全員ローカル FigureDef） =====
const SKIN = { skin: '#ffe7d6', skinShade: '#f2c9a4' }
const WAKASAGI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#4fc08d', hairShade: '#2f8a5f', eye: '#2e7cd6',
    dress: '#3a6ea8', dressShade: '#2a5280', sub: '#eef6fc', accent: '#e0455a',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const SEKIBANKI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#d8404a', hairShade: '#a02c34', eye: '#8a2be2',
    dress: '#2e3a5c', dressShade: '#1f2942', sub: '#f3eefc', accent: '#e0455a',
  },
  hairStyle: 'medium', accessory: 'bigRibbon', wings: 'none',
}
const KAGEROU_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#7a4a30', hairShade: '#54331f', eye: '#d43a3a',
    dress: '#b84a5a', dressShade: '#8a3542', sub: '#fdf3ee', accent: '#f2f2f2',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
}
// 狼変身時の影狼（灰色の毛並み＋濃い装束＋赤いオーラ）
const KAGEROU_WOLF_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#9aa0ac', hairShade: '#6c7280', eye: '#ff3b30',
    dress: '#5c2e38', dressShade: '#42202a', sub: '#e8e2da', accent: '#ffd54f',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
  aura: 'rgba(255,70,60,0.30)',
}
const BENBEN_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#8a5a30', hairShade: '#5f3d1e', eye: '#7a4fd0',
    dress: '#6a4a7a', dressShade: '#4a3256', sub: '#f7f0e6', accent: '#ffd54f',
  },
  hairStyle: 'twin', accessory: 'ribbon', wings: 'none',
}
const YATSUHASHI_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#3a3a44', hairShade: '#26262e', eye: '#b03050',
    dress: '#7a3a5c', dressShade: '#572842', sub: '#f7eef2', accent: '#7bed6a',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const SEIJA_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#2e2e38', hairShade: '#1c1c24', eye: '#e03030',
    dress: '#46689c', dressShade: '#2f4a73', sub: '#f7f3ea', accent: '#e0455a',
  },
  hairStyle: 'medium', accessory: 'none', wings: 'none',
}
const SHINMYOUMARU_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#c98d4e', hairShade: '#9c6c34', eye: '#4d7cd4',
    dress: '#c03a3a', dressShade: '#8f2828', sub: '#fdf6ee', accent: '#ffd54f',
  },
  hairStyle: 'long', accessory: 'ribbon', wings: 'none',
}
const RAIKO_FIG: FigureDef = {
  palette: {
    ...SKIN, hair: '#e8c96a', hairShade: '#b3963e', eye: '#d4883b',
    dress: '#3a3a44', dressShade: '#26262e', sub: '#f3eefc', accent: '#ffe066',
  },
  hairStyle: 'long', accessory: 'none', wings: 'none',
}
const BOSS_FIGURES: Record<BossId, FigureDef> = {
  wakasagi: WAKASAGI_FIG,
  sekibanki: SEKIBANKI_FIG,
  kagerou: KAGEROU_FIG,
  benben: BENBEN_FIG,
  yatsuhashi: YATSUHASHI_FIG,
  seija: SEIJA_FIG,
  shinmyoumaru: SHINMYOUMARU_FIG,
  raiko: RAIKO_FIG,
}
const MID_FIGURES: Record<MidId, FigureDef> = {
  cirno: CIRNO_FIGURE,
  sekibanki: SEKIBANKI_FIG,
  kagerou: KAGEROU_FIG,
  seija: SEIJA_FIG,
  raiko: RAIKO_FIG,
}
// ===== 難易度ヘルパー（BossContext の diff を現行の rn/iv 相当に読み替える） =====
const cntOf = (ctx: BossContext, n: number) => Math.max(3, Math.round(n * ctx.diff.den))
const ivOf = (ctx: BossContext, base: number) => base / ctx.diff.den
const spdOf = (ctx: BossContext, base: number) => base * ctx.diff.spd
/** Easy 判定（den 0.62）。反転の有無など難易度別の仕様切替に使う */
const isEasy = (ctx: BossContext) => ctx.diff.den < 0.8
/** 反転中は発生間隔を 1.35 倍にして密度を一段下げる */
const fivOf = (ctx: BossContext, base: number) =>
  ivOf(ctx, base) * (flipShared.appliedX || flipShared.appliedY ? 1.35 : 1)

// ===== 自機定義（紅魔郷／妖々夢と同じショット構成・速度） =====
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
type RingOpts = { speed: number; r: number; color: number; kind?: 'orb' | 'big' | 'bubble' | 'ellipse' | 'knife' | 'star' }
/** リングを「欠け」つきで撃つ。skip に入れたインデックスは発射しない */
function ringSkip(ctx: BossContext, n: number, skip: ReadonlySet<number>, o: RingOpts) {
  const base = 0
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
    const d = Math.abs(((a - gapCenter) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
    if (d < gapHalf) skip.add(i)
  }
  ringSkip(ctx, n, skip, o)
}
/** 任意位置からの扇：中心角 center から n 発を spread 間隔で */
function fanFrom(ctx: BossContext, x: number, y: number, center: number, n: number, spread: number, o: RingOpts) {
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * spread
    ctx.spawn({
      x, y, angle: center + off,
      speed: spdOf(ctx, o.speed), r: o.r, color: o.color, kind: o.kind ?? 'orb',
    })
  }
}
/** 大玉の扇：自機方向へ大きな遅い弾を扇状に */
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
/** 水柱の雨：6列中2列を必ず抜き、横64px以上の抜け道を残す。
 *  sway で波打たせても、揺れ幅（±20px）込みで抜け列は塞がらないよう
 *  抜け列の両隣は半分の密度にする代わりに列そのものを空ける */
function waterColumns(ctx: BossContext, wave: number, swayPhase: number) {
  const skipA = wave % 6
  const skipB = (wave * 2 + 3) % 6
  for (let i = 0; i < 6; i++) {
    if (i === skipA || i === skipB) continue
    ctx.spawn({
      x: 32 + i * 64, y: -16, angle: DOWN, speed: spdOf(ctx, 132),
      r: 5, color: 4, kind: 'bubble',
      swayAmp: 16, swayFreq: 1.7, swayPhase: swayPhase + i * 0.7,
    })
  }
}

// ===== ボス定義（BossDef への変換） =====
const BONUS = { bonusBase: 1_000_000, bonusPerSec: 20_000 }

/** 難易度別のスペル名差し替え（裏取り結果：多くが E/N 版と H 版で名前が変わる。
 *  Normal 基準で採用し、Hard では名前だけ差し替える） */
function buildBossDef(id: BossId, diff: DiffId = 'normal'): BossDef {
  const hard = diff === 'hard'
  switch (id) {
    case 'wakasagi': return {
      id, name: 'わかさぎ姫', epithet: '淡水に棲む人魚', radius: 22, figure: BOSS_FIGURES.wakasagi,
      phases: [
        {
          name: null, hp: 520, timeLimit: 40, move: 'sine', moveRange: 100, moveSpeed: 0.6,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.3); ctx.aimed(2, 0.16, { speed: 116, r: 4, color: 4, kind: 'bubble' }) }
            if (s.a2 <= 0) {
              // 水しぶきの渦：弾間隔 82×0.25=20.5px ＞ 泡直径10＋判定直径5=15px
              s.a2 = ivOf(ctx, 0.25)
              s.ang += 0.4
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 82), r: 5, color: 4, kind: 'bubble' })
            }
          },
        },
        {
          name: '水符「テイルフィンスラップ」', hp: 900, timeLimit: 50, move: 'sine', moveRange: 90, moveSpeed: 0.55, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 寄せては返す2層の波：位相をずらした水柱の雨。
              // 縦間隔 132×1.3≒172px。隣り合う柱の間は 64-2×(揺れ16+弾半径5)=22px の
              // 抜け道が常に残り、抜け列（最大2列）がある波では更に広い。
              // 2層目は半周期ずらして波同士の隙間が相殺されないようにする
              s.a1 = ivOf(ctx, 1.3)
              waterColumns(ctx, s.n, s.n * 1.3)
              if (s.n % 2 === 1) waterColumns(ctx, s.n + 2, s.n * 1.3 + Math.PI)
              s.n += 1
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.2); ctx.aimed(1, 0, { speed: 118, r: 4, color: 7, kind: 'bubble' }) }
          },
        },
        {
          name: hard ? '鱗符「逆鱗の荒波」' : '鱗符「スケールウェイブ」', hp: 1050, timeLimit: 52, move: 'sine', moveRange: 105, moveSpeed: 0.6, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 魚群：5匹の塊が弧を描いて泳ぐ。塊同士の間隔 118×1.5=177px が安全地帯。
              // 群れの向きはボスの移動方向（位相）に連動してうねる
              s.a1 = ivOf(ctx, 1.5)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              const bend = Math.sin(ctx.phaseTime() * 0.8) * 0.5
              for (let k = 0; k < 5; k++) {
                const back = (k - 2) * 13 // 隊列の前後オフセット
                const side = Math.abs(k - 2) * 7 // V字の横オフセット
                ctx.spawn({
                  x: ctx.bossX() - Math.cos(base) * Math.abs(back) + Math.cos(base + Math.PI / 2) * (k - 2) * 7,
                  y: ctx.bossY() - Math.sin(base) * Math.abs(back) + Math.sin(base + Math.PI / 2) * (k - 2) * 7 + side * 0.3,
                  angle: base + (k - 2) * 0.05, speed: spdOf(ctx, 118), r: 4, color: 4, kind: 'ellipse',
                  curve: bend * 0.35,
                })
              }
              s.n += 1
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.4); ctx.aimed(2, 0.14, { speed: 112, r: 4, color: 7, kind: 'bubble' }) }
          },
        },
      ],
    }
    case 'sekibanki': return {
      id, name: '赤蛮奇', epithet: '首が飛ぶろくろ首', radius: 20, figure: BOSS_FIGURES.sekibanki,
      phases: [
        {
          name: null, hp: 560, timeLimit: 40, move: 'sine', moveRange: 100, moveSpeed: 0.65,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.15); ctx.aimed(3, 0.17, { speed: 124, r: 4, color: 0 }) }
            if (s.a2 <= 0) {
              // 首が伸びるような直線狙撃：速い単発を本体の少し下から
              s.a2 = ivOf(ctx, 1.9)
              const a = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY() + 10, angle: a, speed: spdOf(ctx, 196), r: 4, color: 6, kind: 'ellipse' })
            }
          },
        },
        {
          name: '飛符「フライングヘッド」', hp: 980, timeLimit: 52, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          setup: (ctx) => { ctx.setRealOnlyDamage(true); phaseState(ctx).a2 = 0.8 },
          teardown: (ctx) => { ctx.setBodies([]); ctx.setRealOnlyDamage(false) },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            // 分離した頭：本体の周りをゆるやかに周回し、自機を追いかけるように位相が寄る
            const t = ctx.phaseTime()
            const hx = ctx.bossX() + Math.cos(t * 0.85) * 96
            const hy = ctx.bossY() + Math.sin(t * 0.85) * 34 + 16
            ctx.setBodies([
              { x: ctx.bossX(), y: ctx.bossY(), real: true, radius: 20, visible: true },
              { x: hx, y: hy, real: false, radius: 13, visible: true },
            ])
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 本体の扇：間隔0.19rad（90px先で17px ＞ 14px）
              s.a1 = ivOf(ctx, 1.6)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 4, 0.19, { speed: 124, r: 4.5, color: 0 })
            }
            if (s.a2 <= 0) {
              // 頭からの狙撃：本体の扇と0.8秒ずらして撃ち、二方向の壁が同時に閉じないようにする
              s.a2 = ivOf(ctx, 1.6)
              const a = Math.atan2(ctx.player.y - hy, ctx.player.x - hx)
              ctx.spawn({ x: hx, y: hy, angle: a, speed: spdOf(ctx, 138), r: 4, color: 6, kind: 'orb' })
              ctx.spawn({ x: hx, y: hy, angle: a + 0.16, speed: spdOf(ctx, 138), r: 4, color: 6, kind: 'orb' })
              ctx.spawn({ x: hx, y: hy, angle: a - 0.16, speed: spdOf(ctx, 138), r: 4, color: 6, kind: 'orb' })
            }
          },
        },
        {
          name: hard ? '飛頭「セブンズヘッド」' : '飛頭「マルチプリケイティブヘッド」', hp: 1150, timeLimit: 55, move: 'sine', moveRange: 80, moveSpeed: 0.5, ...BONUS,
          setup: (ctx) => { ctx.setRealOnlyDamage(true) },
          teardown: (ctx) => { ctx.setBodies([]); ctx.setRealOnlyDamage(false) },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            const t = ctx.phaseTime()
            // 増えた頭は通常3つ、Hardでは原作どおり7つ。それぞれ位相をずらして周回する（撃破不可）
            const headCount = hard ? 7 : 3
            const heads: { x: number; y: number }[] = []
            for (let k = 0; k < headCount; k++) {
              const ph = (k / headCount) * Math.PI * 2
              heads.push({
                x: ctx.bossX() + Math.cos(t * 0.6 + ph) * 104,
                y: ctx.bossY() + Math.sin(t * 0.6 + ph) * 36 + 14,
              })
            }
            ctx.setBodies([
              { x: ctx.bossX(), y: ctx.bossY(), real: true, radius: 20, visible: true },
              ...heads.map(h => ({ x: h.x, y: h.y, real: false, radius: 12, visible: true })),
            ])
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 頭が順に欠けリングを放つ（各頭の間隔は実質 1.1秒×頭数）。
              // 開口は自機方向に向け、輪の間隔は十分に広い
              s.a1 = ivOf(ctx, 1.1)
              const h = heads[s.n % heads.length]
              s.n += 1
              const gapC = Math.atan2(ctx.player.y - h.y, ctx.player.x - h.x)
              const n = cntOf(ctx, 10)
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                const d = Math.abs(((a - gapC) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
                if (d < 0.55) continue
                ctx.spawn({ x: h.x, y: h.y, angle: a, speed: spdOf(ctx, 58), r: 4, color: 6, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) {
              // 頭が増えている間は本体の密度を落とす（狙撃のみ・2.6秒間隔）
              s.a2 = ivOf(ctx, 2.6)
              ctx.aimed(2, 0.13, { speed: 116, r: 4, color: 0 })
            }
          },
        },
      ],
    }
    case 'kagerou': return {
      id, name: '今泉影狼', epithet: '満月のワールウルフ', radius: 20, figure: BOSS_FIGURES.kagerou,
      phases: [
        {
          name: null, hp: 580, timeLimit: 40, move: 'sine', moveRange: 110, moveSpeed: 0.75,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 爪痕の三日月：弧を描く2連弾（curve で曲げる）
              s.a1 = ivOf(ctx, 1.35)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              for (const sgn of [-1, 1]) {
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY(), angle: base + sgn * 0.3,
                  speed: spdOf(ctx, 138), r: 4, color: 3, kind: 'ellipse', curve: -sgn * 0.55,
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.8); ctx.aimed(2, 0.15, { speed: 122, r: 4, color: 0 }) }
          },
        },
        {
          name: hard ? '咆哮「満月の遠吠え」' : '咆哮「ストレンジロア」', hp: 1020, timeLimit: 52, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          setup: (ctx) => { phaseState(ctx).a2 = 0.95 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 咆哮の衝撃波：速く広がる欠けリング（開口±0.55rad）。
              // 輪の間隔 96×1.9=182px、円周間隔は半径50px時点で 2π×50/16=19.6px ＞ 14px
              s.a1 = ivOf(ctx, 1.9)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang, 0.55, { speed: 96, r: 4.5, color: 7 })
              s.ang += 0.8
            }
            if (s.a2 <= 0) {
              // リングに合わせた拡散扇（リングとは0.95秒ずらし、壁の重なりを避ける）
              s.a2 = ivOf(ctx, 1.9)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.22, { speed: 126, r: 4, color: 3, kind: 'ellipse' })
            }
          },
        },
        {
          name: hard ? '変身「スターファング」' : '変身「トライアングルファング」', hp: 1180, timeLimit: 55, move: 'chase', moveRange: 120, moveSpeed: 0.9, ...BONUS,
          setup: (ctx) => {
            // 変身の瞬間：全弾消去＋姿が狼形態に切り替わる（描画側は formShared を参照）
            ctx.world.clearBullets()
            formShared.wolf = true
          },
          teardown: () => { formShared.wolf = false },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 噛みつく二連の弧弾：上下から挟むように曲がる爪弾。
              // 発生間隔 150×1.05=157px で波同士は重ならない
              s.a1 = ivOf(ctx, 1.05)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              for (const sgn of [-1, 1]) {
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY() + sgn * 8, angle: base + sgn * 0.42,
                  speed: spdOf(ctx, 150), r: 4.5, color: 0, kind: 'ellipse', curve: -sgn * 0.7,
                })
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY() + sgn * 8, angle: base + sgn * 0.2,
                  speed: spdOf(ctx, 150), r: 4.5, color: 7, kind: 'ellipse', curve: -sgn * 0.45,
                })
              }
            }
            if (s.a2 <= 0) {
              // 突進連動の爪弾：ボスの移動（chase）に合わせて自機方向へ3方向
              s.a2 = ivOf(ctx, 2.3)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.24, { speed: 142, r: 4, color: 3, kind: 'knife' })
            }
          },
        },
      ],
    }

    case 'benben': return {
      id, name: '九十九弁々', epithet: '琵琶の付喪神', radius: 22, figure: BOSS_FIGURES.benben,
      phases: [
        {
          name: null, hp: 600, timeLimit: 42, move: 'sine', moveRange: 90, moveSpeed: 0.55,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            // 琵琶の弦をはじく放射状の音符弾：拍（boss曲 176BPM、1拍≒0.34秒）の
            // 2拍ごとに波を出す。音符弾は星型で、波の間隔 118×0.68=80px
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 60 / BOSS_BPM * 2)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 5, 0.17, { speed: 118, r: 4, color: 2, kind: 'star' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.9); ctx.aimed(2, 0.14, { speed: 114, r: 4, color: 6, kind: 'star' }) }
          },
        },
        {
          name: '平曲「祇園精舎の鐘の音」', hp: 1060, timeLimit: 54, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          setup: (ctx) => { phaseState(ctx).a2 = 0.68 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 鐘の音のように響く弾の輪：4拍ごとに欠けリング（開口±0.55rad）。
              // 輪の間隔 62×(60/176×4≒1.36s)=84px、円周間隔は半径50px時点で 2π×50/18=17.5px ＞ 14px
              s.a1 = ivOf(ctx, 60 / BOSS_BPM * 4)
              ringGapArc(ctx, cntOf(ctx, 18), s.ang, 0.55, { speed: 62, r: 4.5, color: 2, kind: 'star' })
              s.ang += 0.6
            }
            if (s.a2 <= 0) {
              // 鐘の残響：リングと半拍ずらした狙撃扇
              s.a2 = ivOf(ctx, 60 / BOSS_BPM * 4)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.2, { speed: 128, r: 4, color: 6, kind: 'star' })
            }
          },
        },
        {
          name: hard ? '楽符「凶悪な五線譜」' : '楽符「邪悪な五線譜」', hp: 1200, timeLimit: 56, move: 'sine', moveRange: 85, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 五線譜に沿って音符弾が流れる：5本の譜線のうち1本を必ず空けて
              // 左から右へ音符が流れる。空き線が回転するので、譜線を跨いで逃げる。
              // 線間隔 50px（弾直径8＋判定5=13px の3倍以上）、波の間隔 150×0.72=108px
              s.a1 = ivOf(ctx, 60 / BOSS_BPM * 2)
              const lanes = [120, 170, 220, 270, 320]
              const empty = s.n % 5
              s.n += 1
              for (let i = 0; i < lanes.length; i++) {
                if (i === empty) continue
                ctx.spawn({
                  x: -12, y: lanes[i] + (Math.random() - 0.5) * 6, angle: 0,
                  speed: spdOf(ctx, 150), r: 4, color: 2, kind: 'star',
                })
                ctx.spawn({
                  x: -12, y: lanes[i] + (Math.random() - 0.5) * 6, angle: 0,
                  speed: spdOf(ctx, 132), r: 4, color: 6, kind: 'star',
                })
              }
            }
            if (s.a2 <= 0) {
              // 高音パート（速い小弾）と低音パート（遅い大弾）の二重奏：
              // 発生タイミングをずらし、重なる瞬間を作らない
              s.a2 = ivOf(ctx, 2.6)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.2, { speed: 168, r: 3, color: 2, kind: 'star' })
              bigFan(ctx, 2, 0.28, 66, 7, 6)
            }
          },
        },
      ],
    }
    case 'yatsuhashi': return {
      id, name: '九十九八橋', epithet: '琴の付喪神', radius: 22, figure: BOSS_FIGURES.yatsuhashi,
      phases: [
        {
          name: null, hp: 600, timeLimit: 42, move: 'sine', moveRange: 90, moveSpeed: 0.55,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 琴の爪弾きのような扇状の音符弾：弁々より間隔が広く、1発が大きい
              s.a1 = ivOf(ctx, 1.5)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 4, 0.24, { speed: 122, r: 5, color: 3, kind: 'star' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.0); ctx.aimed(2, 0.14, { speed: 112, r: 4, color: 7, kind: 'star' }) }
          },
        },
        {
          name: '琴符「諸行無常の琴の音」', hp: 1060, timeLimit: 54, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          setup: (ctx) => { phaseState(ctx).a2 = 0.68 },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 琴の音に乗せた音符弾の波：拍の2拍ごとに交互の向きの扇を出す
              s.a1 = ivOf(ctx, 60 / BOSS_BPM * 2)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              const side = s.n % 2 === 0 ? 1 : -1
              s.n += 1
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base + side * 0.35, 4, 0.2, { speed: 126, r: 4.5, color: 3, kind: 'star' })
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 60 / BOSS_BPM * 4)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 60, r: 4.5, color: 7, kind: 'star' })
              s.ang += 0.75
            }
          },
        },
        {
          name: hard ? '響符「エコーチェンバー」' : '響符「平安の残響」', hp: 1200, timeLimit: 56, move: 'sine', moveRange: 85, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 残響の輪：ゆっくり広がる欠けリング（開口±0.55rad）。
              // 輪の間隔 52×2.2=114px
              s.a1 = ivOf(ctx, 2.2)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang, 0.55, { speed: 52, r: 4.5, color: 3, kind: 'star' })
              s.ang += 0.55
              s.a3 = 1.1 // 1.1秒後に反響の小さい輪を出す
            }
            if (s.a3 > 0) {
              s.a3 -= dt
              if (s.a3 <= 0) {
                // 反響は元の輪より遅く・小さく、開口位置もずらす。
                // 元の輪とは半径で 52×1.1=57px 離れており、壁が重ならない
                ringGapArc(ctx, cntOf(ctx, 12), s.ang + 1.1, 0.55, { speed: 44, r: 4, color: 7, kind: 'star' })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.8); ctx.aimed(2, 0.13, { speed: 116, r: 4, color: 3, kind: 'star' }) }
          },
        },
      ],
    }
    case 'seija': return {
      id, name: '鬼人正邪', epithet: '逆転の天邪鬼', radius: 20, figure: BOSS_FIGURES.seija,
      phases: [
        {
          name: null, hp: 620, timeLimit: 42, move: 'sine', moveRange: 100, moveSpeed: 0.7,
          update: (ctx, dt) => {
            // 通常攻撃では反転しない（反転はスペル単位）
            flipShared.wantX = false
            flipShared.wantY = false
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 欺符「逆針撃」風：針弾を上方へ放ち、自機へテレポートするようなフェイント
              s.a1 = ivOf(ctx, 1.25)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.2, { speed: 140, r: 4, color: 0, kind: 'knife' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.7); ctx.aimed(2, 0.15, { speed: 122, r: 4, color: 6, kind: 'knife' }) }
          },
        },
        {
          // 原作準拠：反転はスペルごとに決まる。スペル1は左右反転。
          // Easy では反転しない（ユーザー承認済みの仮置き）。
          name: hard ? '逆符「イビルインザミラー」' : '逆符「鏡の国の弾幕」', hp: 1120, timeLimit: 54, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            if (flipShared.holdFire) return
            const t = ctx.phaseTime()
            flipShared.wantX = !isEasy(ctx) && t > 1.5
            flipShared.wantY = false
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 鏡像の渦：弾間隔 88×fivOf(0.23)=20.2px（反転時は間隔×1.35で更に広がる）＞ 14px
              s.a1 = fivOf(ctx, 0.23)
              s.ang += 0.34
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 88), r: 4.5, color: 6, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) { s.a2 = fivOf(ctx, 2.2); ctx.aimed(2, 0.14, { speed: 116, r: 4, color: 0, kind: 'knife' }) }
          },
        },
        {
          // スペル2は上下反転（天地有用が正邪の代名詞）。
          name: hard ? '逆符「天下転覆」' : '逆符「天地有用」', hp: 1250, timeLimit: 56, move: 'sine', moveRange: 85, moveSpeed: 0.5, ...BONUS,
          update: (ctx, dt) => {
            if (flipShared.holdFire) return
            const t = ctx.phaseTime()
            flipShared.wantX = false
            flipShared.wantY = !isEasy(ctx) && t > 1.5
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 天地の柱：抜け列2列を残す雨（縦間隔 132×fivOf(1.25)=165px）
              s.a1 = fivOf(ctx, 1.25)
              waterColumns(ctx, s.n, s.n * 1.1)
              s.n += 1
            }
            if (s.a2 <= 0) {
              s.a2 = fivOf(ctx, 1.9)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 62, r: 4.5, color: 6 })
              s.ang += 0.7
            }
          },
        },
        {
          // 最終スペルは上下・左右の両方を反転（180度回転）した状態で戦う。
          // 「周期で切り替える」のではなく、スペルごとに決まる反転状態という原作の形。
          name: hard ? '逆転「チェンジエアブレイブ」' : '逆転「リバースヒエラルキー」', hp: 1400, timeLimit: 60, move: 'hover', moveRange: 26, moveSpeed: 0.4, ...BONUS,
          update: (ctx, dt) => {
            if (flipShared.holdFire) return
            const t = ctx.phaseTime()
            flipShared.wantX = !isEasy(ctx) && t > 1.5
            flipShared.wantY = !isEasy(ctx) && t > 1.5
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 両軸反転中の渦：反転時は密度を一段下げ、弾間隔 86×fivOf(0.26)=22.4px ＞ 14px
              s.a1 = fivOf(ctx, 0.26)
              s.ang += 0.32
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 86), r: 4.5, color: 0, kind: 'orb' })
              }
            }
            if (s.a2 <= 0) {
              s.a2 = fivOf(ctx, 2.4)
              ringGapArc(ctx, cntOf(ctx, 16), s.ang * 0.5, 0.55, { speed: 58, r: 4.5, color: 6 })
            }
          },
        },
      ],
    }
    case 'shinmyoumaru': return {
      id, name: '少名針妙丸', epithet: '小人の末裔', radius: 18, figure: BOSS_FIGURES.shinmyoumaru,
      phases: [
        {
          name: null, hp: 640, timeLimit: 42, move: 'sine', moveRange: 110, moveSpeed: 0.8,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 針のような細い高速弾（縫い針の剣）
              s.a1 = ivOf(ctx, 1.15)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.18, { speed: 178, r: 3, color: 7, kind: 'knife' })
            }
            if (s.a2 <= 0) {
              // お椀型の弾のゆったりした移動：大きな遅い玉を1発
              s.a2 = ivOf(ctx, 2.3)
              bigFan(ctx, 1, 0, 62, 8, 6)
            }
          },
        },
        {
          name: hard ? '小槌「もっと大きくなあれ」' : '小槌「大きくなあれ」', hp: 1100, timeLimit: 54, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 打ち出の小槌で弾が巨大化：通常サイズで生まれ、飛行途中で巨大弾に育つ。
              // 巨大弾は遅く（58px/s）、3発の扇で間隔0.3rad（150px先で45px ＞ 巨大弾直径30＋判定5=35px）。
              // 発生間隔 1.9秒で、巨大弾同士の波の間隔は 58×1.9=110px
              s.a1 = ivOf(ctx, 1.9)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              for (let i = 0; i < 3; i++) {
                const off = (i - 1) * 0.3
                ctx.spawn({
                  x: ctx.bossX(), y: ctx.bossY(), angle: base + off,
                  speed: spdOf(ctx, 58), r: 5, color: 1, kind: 'big',
                  grow: 6, maxR: 15,
                })
              }
            }
            if (s.a2 <= 0) {
              // 小さい速弾との対比：細い針を散発で
              s.a2 = ivOf(ctx, 1.1)
              ctx.aimed(2, 0.16, { speed: 196, r: 3, color: 7, kind: 'knife' })
            }
          },
        },
        {
          name: hard ? '小弾「小人の茨道」' : '小弾「小人の道」', hp: 1180, timeLimit: 54, move: 'sine', moveRange: 100, moveSpeed: 0.6, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 小さな弾が列状に整列して大量に流れる：7列のうち2列を空けて広い抜け道を残す。
              // 小弾は直径5、列間隔は 384/7≒55px。縦間隔 150×1.05=157px
              s.a1 = ivOf(ctx, 1.05)
              const skipA = s.n % 7
              const skipB = (s.n * 3 + 4) % 7
              s.n += 1
              for (let i = 0; i < 7; i++) {
                if (i === skipA || i === skipB) continue
                ctx.spawn({
                  x: 28 + i * 56, y: -14, angle: DOWN, speed: spdOf(ctx, 150),
                  r: 2.5, color: 7, kind: 'dot',
                })
              }
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.5); bigFan(ctx, 2, 0.3, 64, 8, 6) }
          },
        },
        {
          // 原作の有名な反則ギミック：自機が大きくなる（当たり判定が拡大する）。
          // 判定拡大は playerGrowShared 経由で本体ループに伝え、描画も大きくする。
          name: '小槌「お前が大きくなあれ」', hp: 1250, timeLimit: 50, move: 'hover', moveRange: 34, moveSpeed: 0.5, ...BONUS,
          setup: () => { playerGrowShared.active = true },
          teardown: () => { playerGrowShared.active = false },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 自機が大きい間は弾を薄くする：渦の弾間隔 84×0.3=25.2px（判定直径10＋弾9=19px より広い）
              s.a1 = ivOf(ctx, 0.3)
              s.ang += 0.3
              ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang, speed: spdOf(ctx, 84), r: 4.5, color: 6, kind: 'orb' })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.4); ctx.aimed(2, 0.15, { speed: 112, r: 4, color: 1 }) }
          },
        },
        {
          name: hard ? '「七人の一寸法師」' : '「ホップオマイサムセブン」', hp: 1350, timeLimit: 58, move: 'teleport', moveRange: 110, moveSpeed: 0.6, params: { interval: 3.6 }, ...BONUS,
          setup: (ctx) => { ctx.setRealOnlyDamage(true) },
          teardown: (ctx) => { ctx.setBodies([]); ctx.setRealOnlyDamage(false) },
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            const t = ctx.phaseTime()
            // 7人の小さな針妙丸が跳ね回る：本体＋6つの分身が楕円軌道で跳ねる。
            // 分身は撃破不可（本体のみにダメージ）。分身の位置は描画側も参照する。
            const bodies: { x: number; y: number; real: boolean; radius: number; visible: boolean }[] = [
              { x: ctx.bossX(), y: ctx.bossY(), real: true, radius: 18, visible: true },
            ]
            for (let k = 0; k < 6; k++) {
              const ph = (k / 6) * Math.PI * 2
              const hop = Math.abs(Math.sin(t * 2.2 + ph))
              bodies.push({
                x: ctx.bossX() + Math.cos(t * 0.7 + ph) * 92,
                y: ctx.bossY() + Math.sin(t * 0.7 + ph) * 30 + 12 - hop * 26,
                real: false, radius: 12, visible: true,
              })
            }
            ctx.setBodies(bodies)
            s.a1 -= dt; s.a2 -= dt
            if (s.a1 <= 0) {
              // 分身が順に小さな針弾を撃つ（各分身の間隔は実質 1.05秒×7）。
              // 狙撃は散発で、壁にはならない
              s.a1 = ivOf(ctx, 0.15)
              const b = bodies[s.n % bodies.length]
              s.n += 1
              const a = Math.atan2(ctx.player.y - b.y, ctx.player.x - b.x)
              ctx.spawn({ x: b.x, y: b.y, angle: a, speed: spdOf(ctx, 132), r: 3, color: 7, kind: 'knife' })
            }
            if (s.a2 <= 0) {
              s.a2 = ivOf(ctx, 2.6)
              ringGapArc(ctx, cntOf(ctx, 14), s.ang, 0.55, { speed: 60, r: 4.5, color: 6 })
              s.ang += 0.7
            }
          },
        },
      ],
    }
    case 'raiko': return {
      id, name: '堀川雷鼓', epithet: '嵐を呼ぶ太鼓打ち', radius: 22, figure: BOSS_FIGURES.raiko,
      phases: [
        {
          name: null, hp: 700, timeLimit: 44, move: 'sine', moveRange: 100, moveSpeed: 0.65,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt
            // 太鼓の連打に合わせた小刻みな放射弾：0.72秒ごとに3方向の小扇
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 0.72)
              const base = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
              fanFrom(ctx, ctx.bossX(), ctx.bossY(), base, 3, 0.22, { speed: 132, r: 4, color: 2 })
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.6); ctx.aimed(2, 0.15, { speed: 120, r: 4, color: 7 }) }
          },
        },
        {
          name: '一鼓「暴れ宮太鼓」', hp: 1250, timeLimit: 56, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt
            // 画面上部から太鼓（大玉）がゆっくり落下し、底に触れると爆発して三角弾の輪を撒く。
            // 落下速度 55px/s、出現から着弾まで約 8.2秒。爆発は予定時刻にキューで処理する
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 4.0)
              // 太鼓は4レーン（96px間隔）から連続する3レーンに出現させる。
              // レーン間隔 96px ＞ 太鼓直径24＋判定5=29px で、太鼓同士が壁にならない
              const lane0 = Math.floor(Math.random() * 4)
              for (let k = 0; k < 3; k++) {
                const dx = 48 + ((lane0 + k) % 4) * 96
                ctx.spawn({
                  x: dx, y: -18, angle: DOWN, speed: spdOf(ctx, 55),
                  r: 12, color: 2, kind: 'big',
                })
                s.q.push({ x: dx, t: ctx.phaseTime() + (FH - 26 + 18) / (55 * ctx.diff.spd) })
              }
            }
            // 爆発キューの処理：着弾予定時刻を過ぎた太鼓を、底で爆発させる
            const now = ctx.phaseTime()
            s.q = s.q.filter((item) => {
              if (item.t > now) return true
              const gapC = Math.atan2(ctx.player.y - (FH - 26), ctx.player.x - item.x)
              const n = cntOf(ctx, 12)
              for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                const d = Math.abs(((a - gapC) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI)
                if (d < 0.55) continue // 自機方向に開口
                ctx.spawn({ x: item.x, y: FH - 26, angle: a, speed: spdOf(ctx, 68), r: 4.5, color: 0, kind: 'orb' })
              }
              return false
            })
          },
        },
        {
          // 三鼓「午前零時のスリーストライク」の再現。
          // 拍同期リングは原作の仕様ではなく、本リメイク独自の演出として採用する。
          name: '三鼓「午前零時のスリーストライク」', hp: 1350, timeLimit: 58, move: 'hover', moveRange: 30, moveSpeed: 0.45, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            // 3つの太鼓が本体の周りを回転しながら連射する
            const t = ctx.phaseTime()
            s.a1 -= dt; s.a2 -= dt
            s.bT -= dt
            if (s.a1 <= 0) {
              s.a1 = ivOf(ctx, 1.15)
              const drum = (s.n % 3) * (Math.PI * 2 / 3)
              s.n += 1
              const dx = ctx.bossX() + Math.cos(t * 0.8 + drum) * 76
              const dy = ctx.bossY() + Math.sin(t * 0.8 + drum) * 30 + 10
              const a = Math.atan2(ctx.player.y - dy, ctx.player.x - dx)
              ctx.spawn({ x: dx, y: dy, angle: a, speed: spdOf(ctx, 134), r: 4.5, color: 2, kind: 'orb' })
              ctx.spawn({ x: dx, y: dy, angle: a + 0.18, speed: spdOf(ctx, 134), r: 4.5, color: 2, kind: 'orb' })
              ctx.spawn({ x: dx, y: dy, angle: a - 0.18, speed: spdOf(ctx, 134), r: 4.5, color: 2, kind: 'orb' })
            }
            if (s.bT <= 0) {
              // 拍同期リング（リメイク独自演出）：exboss曲 168BPM の2拍ごと（0.714秒）。
              // 輪同士の半径間隔は 60×0.714=43px ＞ 弾直径9＋判定5=14px で壁にならない。
              // 円周間隔は半径50px時点で 2π×50/16=19.6px ＞ 14px。
              // 開口は拍ごとに回転するが、幅を±0.6radと広めに取り抜け道が消える瞬間を作らない
              s.bT = 60 / EXBOSS_BPM * 2
              ringGapArc(ctx, cntOf(ctx, 16), s.ang, 0.6, { speed: 60, r: 4.5, color: 7 })
              s.ang += 0.5
            }
            if (s.a2 <= 0) { s.a2 = ivOf(ctx, 2.5); ctx.aimed(1, 0, { speed: 118, r: 4, color: 0 }) }
          },
        },
        {
          name: '「プリスティンビート」', hp: 1500, timeLimit: 64, move: 'hover', moveRange: 26, moveSpeed: 0.4, ...BONUS,
          update: (ctx, dt) => {
            const s = phaseState(ctx)
            s.a1 -= dt; s.a2 -= dt; s.a3 -= dt
            if (s.a1 <= 0) {
              // 最終スペルの渦：弾間隔 92×0.21=19.3px ＞ 14px
              s.a1 = ivOf(ctx, 0.21)
              s.ang += 0.3
              for (const off of [0, Math.PI]) {
                ctx.spawn({ x: ctx.bossX(), y: ctx.bossY(), angle: s.ang + off, speed: spdOf(ctx, 92), r: 4.5, color: 7, kind: 'star' })
              }
            }
            if (s.a2 <= 0) {
              // 予告線の後に縦の雷撃（レーザー）＋着弾点からの拡散。
              // 予告なしの落雷は置かない。落雷位置は自機から40px以上離す
              s.a2 = ivOf(ctx, 3.4)
              let px = 40 + Math.random() * (FW - 80)
              if (Math.abs(px - ctx.player.x) < 52) px = ctx.player.x < FW / 2 ? px + 110 : px - 110
              px = Math.max(30, Math.min(FW - 30, px))
              ctx.addLaser({
                x: px, y: -10, angle: DOWN, length: FH + 20, width: 18, color: 7,
                telegraph: 0.8, duration: 0.6, fade: 0.3,
              })
              for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2
                ctx.spawn({ x: px, y: FH - 60, angle: a, speed: spdOf(ctx, 74), r: 4, color: 0, kind: 'orb' })
              }
            }
            if (s.a3 <= 0) {
              // 拍同期リング（リメイク独自演出）：2拍ごと、開口は回転する
              s.a3 = ivOf(ctx, 60 / EXBOSS_BPM * 2)
              ringGapArc(ctx, cntOf(ctx, 18), s.ang * 0.7, 0.55, { speed: 62, r: 4.5, color: 2 })
            }
          },
        },
      ],
    }
  }
}

type PhaseState = { a1: number; a2: number; a3: number; ang: number; n: number; bT: number; q: { x: number; t: number }[] }
let activePhaseState: PhaseState = { a1: 0, a2: 0, a3: 0, ang: 0, n: 0, bT: 0, q: [] }
function phaseState(_ctx: BossContext): PhaseState {
  return activePhaseState
}
/** フェイズごとに独立した作業変数を持たせ、開始時にリセットする */
function finBoss(def: BossDef): BossDef {
  for (const ph of def.phases) {
    const st: PhaseState = { a1: 0, a2: 0, a3: 0, ang: 0, n: 0, bT: 0, q: [] }
    const origSetup = ph.setup
    ph.setup = (ctx) => {
      st.a1 = 0; st.a2 = 0; st.a3 = 0; st.ang = 0; st.n = 0; st.bT = 0; st.q = []
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
function makeBossDef(id: BossId, diff: DiffId = 'normal'): BossDef {
  return finBoss(buildBossDef(id, diff))
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
    teardown?: (ctx: BossContext) => void,
  ): BossDef['phases'][number] => ({
    name: null, hp, timeLimit: 22, move, moveRange: 95, moveSpeed: 0.78, params, update, teardown,
  })
  switch (id) {
    case 'cirno': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.3); ctx.aimed(2, 0.15, { speed: 116, r: 4, color: 7 }) }
        if (s.a2 <= 0) {
          // 氷の欠けリング：開口を真下（自機のいる方向）に向け、
          // ボス直下の安全地帯を確保する（紅魔郷のアイシクルフォール修正と同じ流儀）
          s.a2 = ivOf(ctx, 1.7)
          ringGapArc(ctx, cntOf(ctx, 12), DOWN, 0.6, { speed: 64, r: 4.5, color: 7 })
        }
      })],
    })
    case 'sekibanki': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        const t = ctx.phaseTime()
        // 中ボス戦から「首の分離」を小規模に出し、ボス戦への予告とする
        const hx = ctx.bossX() + Math.cos(t * 0.9) * 78
        const hy = ctx.bossY() + Math.sin(t * 0.9) * 28 + 12
        ctx.setBodies([
          { x: ctx.bossX(), y: ctx.bossY(), real: true, radius: 20, visible: true },
          { x: hx, y: hy, real: false, radius: 12, visible: true },
        ])
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) { s.a1 = ivOf(ctx, 1.4); ctx.aimed(2, 0.16, { speed: 122, r: 4, color: 0 }) }
        if (s.a2 <= 0) {
          s.a2 = ivOf(ctx, 1.8)
          const a = Math.atan2(ctx.player.y - hy, ctx.player.x - hx)
          ctx.spawn({ x: hx, y: hy, angle: a, speed: spdOf(ctx, 130), r: 4, color: 6, kind: 'orb' })
        }
      }, 'sine', undefined, (ctx) => { ctx.setBodies([]) })],
    })
    case 'kagerou': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 1.4)
          const baseA = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
          for (const sgn of [-1, 1]) {
            ctx.spawn({
              x: ctx.bossX(), y: ctx.bossY(), angle: baseA + sgn * 0.3,
              speed: spdOf(ctx, 134), r: 4, color: 3, kind: 'ellipse', curve: -sgn * 0.5,
            })
          }
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.9); ctx.aimed(2, 0.15, { speed: 120, r: 4, color: 0 }) }
      })],
    })
    case 'seija': return finBoss({
      ...base,
      // 5面中ボスでは画面反転を1回だけ短く体験させ、ボス戦への予告とする。
      // 6面中ボスでは更に短く。Easy では反転しない。
      phases: [phase((ctx, dt) => {
        if (flipShared.holdFire) return
        const t = ctx.phaseTime()
        const winEnd = stageIdx === 4 ? 8 : 7
        flipShared.wantX = false
        flipShared.wantY = !isEasy(ctx) && t >= 3.5 && t < winEnd
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          // 欺符「逆針撃」風：針弾の3方向扇
          s.a1 = fivOf(ctx, 1.3)
          const baseA = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
          fanFrom(ctx, ctx.bossX(), ctx.bossY(), baseA, 3, 0.2, { speed: 136, r: 4, color: 0, kind: 'knife' })
        }
        if (s.a2 <= 0) { s.a2 = fivOf(ctx, 1.8); ctx.aimed(1, 0, { speed: 124, r: 4, color: 6, kind: 'knife' }) }
      }, 'teleport', { interval: 3.8 }, () => { flipShared.wantX = false; flipShared.wantY = false })],
    })
    case 'raiko': return finBoss({
      ...base,
      phases: [phase((ctx, dt) => {
        const s = phaseState(ctx)
        s.a1 -= dt; s.a2 -= dt
        if (s.a1 <= 0) {
          s.a1 = ivOf(ctx, 0.85)
          const baseA = Math.atan2(ctx.player.y - ctx.bossY(), ctx.player.x - ctx.bossX())
          fanFrom(ctx, ctx.bossX(), ctx.bossY(), baseA, 3, 0.22, { speed: 130, r: 4, color: 2 })
        }
        if (s.a2 <= 0) { s.a2 = ivOf(ctx, 1.7); ctx.aimed(2, 0.15, { speed: 118, r: 4, color: 7 }) }
      })],
    })
  }
}

// ボスの表示名（ステージカード／情報パネル用）
const BOSS_META: Record<BossId, { name: string; epithet: string }> = {
  wakasagi: { name: 'わかさぎ姫', epithet: '淡水に棲む人魚' },
  sekibanki: { name: '赤蛮奇', epithet: '首が飛ぶろくろ首' },
  kagerou: { name: '今泉影狼', epithet: '満月のワールウルフ' },
  benben: { name: '九十九弁々', epithet: '琵琶の付喪神' },
  yatsuhashi: { name: '九十九八橋', epithet: '琴の付喪神' },
  seija: { name: '鬼人正邪', epithet: '逆転の天邪鬼' },
  shinmyoumaru: { name: '少名針妙丸', epithet: '小人の末裔' },
  raiko: { name: '堀川雷鼓', epithet: '嵐を呼ぶ太鼓打ち' },
}

// ===== 会話シーン（ボス戦前／撃破後） =====
// 台詞は原作の書き起こしではなく、キャラの口調と場面構成（遭遇→掛け合い→戦闘開始）に
// 寄せた自作文。自機（霊夢／魔理沙）で分岐し、ボス側の応答も自機に合わせて変えている。
// 今回の異変：空に浮かぶ逆さの城と、物事が「逆さま」になる気配。九十九姉妹は
// 妖器（3面ノーダメージで手に入る武器）の有無で出会う相手が変わる。
// w: 'p' = 自機, 'b' = ボス
type DLine = { w: 'p' | 'b'; t: string }
type DlgScript = { pre: DLine[]; post: DLine[]; postYouki?: DLine[] }
const dl = (w: 'p' | 'b', t: string): DLine => ({ w, t })
const DIALOGUES: Record<BossId, Record<CharaId, DlgScript>> = {
  wakasagi: {
    reimu: {
      pre: [
        dl('p', '……湖の水が、逆流してる？　魚まで逆さまに泳いでるわ。'),
        dl('b', 'あら、巫女さん。私はわかさぎ姫。この湖に棲む人魚よ。'),
        dl('p', '異変のせいで水がおかしいの？　魚たちが大騒ぎしてるけど。'),
        dl('b', '上から何か「力」が降ってきて、湖の底までひっくり返りそうなの！'),
        dl('p', '上……空に浮かんでる、あの逆さまの城ね。'),
        dl('b', 'そうよ！　私の湖をこれ以上荒らすなら、波で追い返すわ！'),
        dl('p', '荒らすつもりはないけど、通らせてもらうわ。波、乗りこなしてみせる！'),
      ],
      post: [
        dl('b', 'うぅ……波が収まっちゃった……。'),
        dl('p', '湖は元に戻りつつあるみたい。あとは城の方ね。'),
        dl('b', '気をつけて。城の連中は、みんな「逆さま」が大好きなのよ……。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'お、湖が逆流してるぜ。魚までバタバタしてる。'),
        dl('b', '私はわかさぎ姫。この湖の主、ってところね。'),
        dl('p', '主か。異変のせいで湖がひっくり返りそうなんだってな。'),
        dl('b', 'ええ。空の城から変な力が降ってきて、水が言うことを聞かないの。'),
        dl('p', 'そりゃ迷惑だな。……で、私が通るのも迷惑か？'),
        dl('b', 'ふふ、迷惑ついでに波の洗礼を受けていきなさい！'),
        dl('p', '上等だぜ。魔法使いは波くらい乗りこなすさ！'),
      ],
      post: [
        dl('b', '……強いわね、魔法使い。波が負けちゃった。'),
        dl('p', 'はは、いい波だったぜ。城へ行く道、教えてくれ。'),
        dl('b', '竹林を抜けて、月夜の獣道よ。……逆さまに気をつけてね。'),
      ],
    },
  },
  sekibanki: {
    reimu: {
      pre: [
        dl('p', '竹林を抜けたら……首だけ飛んでる！？　何者なの、あんた。'),
        dl('b', '私は赤蛮奇。ろくろ首よ。驚いた？'),
        dl('p', '驚いたけど、異変のせいで首まで飛ぶようになったわけじゃないでしょう？'),
        dl('b', '違うわよ、これは元からの芸よ。でも最近は首が勝手に暴れるの。'),
        dl('p', '異変の力で、首が言うことを聞かなくなったのね。'),
        dl('b', 'そう！　だから、首を止めてもらうわけにはいかないの。遊んでいきなさい！'),
        dl('p', '首だけで遊ばれても困るわ。まとめて相手するわよ！'),
      ],
      post: [
        dl('b', 'あいたた……首が戻ってきた。もう暴れないでよ……。'),
        dl('p', '首が戻ったなら良かったわ。城はこの先？'),
        dl('b', 'ええ。……でも城の天邪鬼には気をつけて。あの子、世界の裏表をひっくり返すのよ。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'うおっ、首が飛んだ！　ろくろ首か、珍しいな。'),
        dl('b', '私は赤蛮奇。首が飛ぶのは私の十八番よ。'),
        dl('p', '十八番ね。でも首がやけに暴れてないか？　異変のせいか？'),
        dl('b', 'そうなの。城から降ってくる力で、首が勝手に飛び回るのよ。'),
        dl('p', 'へえ、城の力か。面白くなってきたぜ。'),
        dl('b', '面白がるのはここまでよ。私の首の舞、見ていきなさい！'),
        dl('p', '首の舞か。魔法の方が派手だぜ、見せてやる！'),
      ],
      post: [
        dl('b', 'ぐ……首が七つも八つも飛んじゃった……。'),
        dl('p', '派手だったぜ。じゃあ城へ行くぜ。首、ちゃんと付けとけよ。'),
        dl('b', 'うるさいわね……。城は月夜の先よ。気をつけてね、魔法使い。'),
      ],
    },
  },
  kagerou: {
    reimu: {
      pre: [
        dl('p', '満月が……やけに大きい。獣の気配がするわ。'),
        dl('b', 'ぐるる……私は今泉影狼。満月の夜は、血が騒ぐのよ。'),
        dl('p', '狼女ね。異変の力で、満月の影響が強まってるの？'),
        dl('b', 'そう。月が近いせいか、牙が疼いて仕方ないの！'),
        dl('p', '疼くのは分かるけど、噛みつかれても困るわ。'),
        dl('b', 'なら、牙を研ぐ相手になって。月下の勝負よ！'),
        dl('p', '勝負なら受けて立つわ。牙より、私の札の方が速いわよ！'),
      ],
      post: [
        dl('b', 'はぁ……はぁ……負けたわ。月の光が、遠くなっていく……。'),
        dl('p', '満月はまだあるわ。城の異変が収まれば、月も落ち着くはずよ。'),
        dl('b', 'そうね……。あ、巫女さん。これ、拾ったの。城の連中の「武器」よ。'),
      ],
      postYouki: [
        dl('b', 'はぁ……はぁ……負けたわ。月の光が、遠くなっていく……。'),
        dl('p', '満月はまだあるわ。城の異変が収まれば、月も落ち着くはずよ。'),
        dl('b', 'そうね……。ねえ巫女さん、その手にあるの、見せて。'),
        dl('p', 'ん？　この光るもの……いつの間にか手に入れてたわ。'),
        dl('b', 'それ、城の連中が使う「妖器」よ。あんたなら使いこなせるかも。4面で試してみなさい。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', '満月か……。でっかい月だな。獣の匂いもするぜ。'),
        dl('b', '私は今泉影狼。満月の夜は、私の時間よ。'),
        dl('p', '狼女か。異変で月が近くなったせいで、余計に元気だな。'),
        dl('b', 'そうよ。牙も爪も、月光で研ぎ澄まされてるの！'),
        dl('p', '研ぎ澄まされた牙か。私の魔法も研ぎ澄まされてるぜ。'),
        dl('b', 'ふふ、じゃあ勝負。月下の牙、受けてみなさい！'),
        dl('p', '上等だ！　狼女相手に負けるわけにはいかないぜ！'),
      ],
      post: [
        dl('b', 'うぅ……牙が折れちゃいそう……。'),
        dl('p', '悪いな。城へ行く道はこの先か？'),
        dl('b', 'ええ……。あ、魔法使い。落ちてたよ、これ。城の連中の「武器」みたい。'),
      ],
      postYouki: [
        dl('b', 'うぅ……牙が折れちゃいそう……。'),
        dl('p', '悪いな。城へ行く道はこの先か？'),
        dl('b', 'ええ……。あ、魔法使い、その手の光るもの、見せて。'),
        dl('p', 'ん？　いつの間にか持ってたぜ。これ、何だ？'),
        dl('b', '城の連中が使う「妖器」よ。4面で役に立つはず。……貸したわけじゃないからね！'),
      ],
    },
  },
  benben: {
    reimu: {
      pre: [
        dl('p', '城の回廊……琵琶の音がする。誰かいるの？'),
        dl('b', 'まあ、巫女さん。私は九十九弁々。琵琶の付喪神よ。'),
        dl('p', '付喪神ね。あんたの手にあるの、妖器……？　私も同じものを拾ったわ。'),
        dl('b', 'あら、同じ武器を持つ者同士。なら、演奏で勝負しましょう。'),
        dl('p', '演奏で？　私は楽器なんて弾けないわよ。'),
        dl('b', 'ふふ、弾幕が私の演奏よ。五線譜の上を踊りなさい！'),
        dl('p', '踊るのはあんたの方よ。始めなさい！'),
      ],
      post: [
        dl('b', '……見事な踊りだったわ。巫女さん。'),
        dl('p', '演奏も悪くなかったわ。城の奥には何があるの？'),
        dl('b', '天邪鬼の正邪よ。あの子は「逆さま」そのもの。気をつけて。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'お、琵琶の音だ。付喪神か？'),
        dl('b', '私は九十九弁々。琵琶の音色に乗せて、あなたを迎えましょう。'),
        dl('p', '迎えるって、演奏会か？　悪いな、聴くのはタダじゃないぜ。'),
        dl('b', 'ふふ、代金は弾幕で払ってもらうわ。妖器を持つ者同士、ね。'),
        dl('p', 'へえ、私の拾い物が妖器ってわけか。なら、演奏勝負といこうぜ！'),
        dl('b', 'いいわ、五線譜の上で踊りなさい！'),
      ],
      post: [
        dl('b', '……負けたわ。でも、いい演奏だった。'),
        dl('p', 'ああ、楽しかったぜ。城の奥の主は誰だ？'),
        dl('b', '鬼人正邪。天邪鬼よ。あの子の「逆さま」には、本当に気をつけて。'),
      ],
    },
  },
  yatsuhashi: {
    reimu: {
      pre: [
        dl('p', '城の回廊……今度は琴の音。誰かいるの？'),
        dl('b', '私は九十九八橋。琴の付喪神よ。'),
        dl('p', '付喪神ね。姉妹で城を守ってるの？'),
        dl('b', 'ええ。でも、妖器を持たない者には私が相手をするの。決まりなの。'),
        dl('p', '妖器……？　私は持ってないわ。だからあんたが出てきたのね。'),
        dl('b', 'そうよ。琴の音に乗せて、あなたの心を残響で包んであげる。'),
        dl('p', '包まれるのはごめんよ。音より速く、斬り込むわ！'),
      ],
      post: [
        dl('b', '……琴の音が、途切れちゃった。'),
        dl('p', 'いい音色だったわ。城の奥には何があるの？'),
        dl('b', '天邪鬼の正邪よ。世界の裏表をひっくり返す、困った子なの。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'お、琴の音だ。付喪神か？'),
        dl('b', '私は九十九八橋。琴の付喪神よ。'),
        dl('p', '琴か。妖器を持ってないと、あんたが出てくるのか？'),
        dl('b', 'ええ、決まりなの。姉は妖器を持つ者の相手、私は持たざる者の相手。'),
        dl('p', 'へえ、面倒な決まりだな。まあ、どっちでも相手してやるぜ。'),
        dl('b', 'ふふ、琴の残響に溺れなさい！'),
        dl('p', '溺れるのはお互いさまだぜ。かかってこい！'),
      ],
      post: [
        dl('b', '……負けちゃった。でも、いい演奏だったわ。'),
        dl('p', 'ああ、残響が耳に残るぜ。城の奥の主は誰だ？'),
        dl('b', '鬼人正邪よ。天邪鬼の子。あの子の「逆さま」には気をつけてね。'),
      ],
    },
  },
  seija: {
    reimu: {
      pre: [
        dl('p', 'ここが輝針城……天井が床で、床が天井？　何もかも逆さまじゃない。'),
        dl('b', 'ようこそ、逆転の城へ。私は鬼人正邪。天邪鬼よ。'),
        dl('p', '天邪鬼ね。異変の元凶はあんた？'),
        dl('b', 'そうよ。強い者が弱く、弱い者が強くなる世界が正しいの！'),
        dl('p', '正しいかどうかは、私が決めるわ。城の異変、止めさせてもらう！'),
        dl('b', 'ふふふ、止められるかしら。世界をひっくり返してあげる！'),
        dl('p', 'ひっくり返されても、私は私よ。かかってきなさい！'),
      ],
      post: [
        dl('b', 'ぐっ……世界が、元に戻っていく……。'),
        dl('p', '戻るのが正しいのよ。……で、城の奥の小槌の主は？'),
        dl('b', '針妙丸……あの子は小さいくせに、大きな野望を持ってるのよ……。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'うわ、城の中が逆さまだぜ。階段が天井から生えてる。'),
        dl('b', 'ふふ、ようこそ逆転の城へ。私は鬼人正邪よ。'),
        dl('p', '天邪鬼か。異変の元凶ってわけだな。'),
        dl('b', 'そうよ。弱い者が強い者を倒す、それが私の正義なの！'),
        dl('p', '正義ね。でも、ひっくり返った世界は住みにくいぜ。'),
        dl('b', '住みにくくて何が悪いの？　さあ、世界をひっくり返すわよ！'),
        dl('p', 'ひっくり返されても、魔法の向きは変えられないぜ！'),
      ],
      post: [
        dl('b', 'くっ……私の逆転が、解けていく……。'),
        dl('p', '残念だったな。城の奥の主は誰だ？'),
        dl('b', '針妙丸よ。小人の末裔。……あの子の小槌には気をつけなさい。'),
      ],
    },
  },
  shinmyoumaru: {
    reimu: {
      pre: [
        dl('p', '城の奥……小さな玉座に、小さな子が座ってる。あんたが主？'),
        dl('b', '私は少名針妙丸！　小人の末裔にして、この城の主よ！'),
        dl('p', '小さいわね。……その小槌が、異変の原因？'),
        dl('b', 'そうよ、打ち出の小槌！　これで小さいものを大きく、大きいものを小さくできるの！'),
        dl('p', 'だから世界が逆さまになったのね。小さいあんたが、大きな野望を持つなんて。'),
        dl('b', '小さいからこそ、大きな夢を見るの！　小槌の力、見せてあげる！'),
        dl('p', '夢は夢のままにしておきなさい。私が止めてあげるわ！'),
      ],
      post: [
        dl('b', 'うぅ……小槌が、重い……。'),
        dl('p', '小槌は元に戻すわ。世界も、元通りよ。'),
        dl('b', '……ありがとう。でも、いつかまた大きくなる夢は見るわよ。'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'お、小さな主様だな。玉座がやけに立派だぜ。'),
        dl('b', '私は少名針妙丸！　小人の末裔よ！'),
        dl('p', '小人か。で、その小槌が異変の元凶だな。'),
        dl('b', 'そうよ！　打ち出の小槌があれば、小さい私だって大きくできるの！'),
        dl('p', '大きくなるのはいいが、世界まで大きくしちまったな。'),
        dl('b', '世界を大きくするのが夢なの！　さあ、小槌の力を見なさい！'),
        dl('p', '夢は寝て見ろってな。……やるぜ！'),
      ],
      post: [
        dl('b', 'ぐ……小槌が、重すぎる……。'),
        dl('p', 'はは、夢はでっかくていいが、やり方は考えな。'),
        dl('b', 'うぅ……でも、いつかまた挑戦するわよ！'),
      ],
    },
  },
  raiko: {
    reimu: {
      pre: [
        dl('p', '嵐の音……太鼓の音が、城の上から響いてる。'),
        dl('b', 'ドンドン！　私は堀川雷鼓！　太鼓の音で嵐を呼ぶのよ！'),
        dl('p', '雷鼓ね。異変はもう収まったはずなのに、なんで太鼓を叩いてるの？'),
        dl('b', '異変が収まったからこそ、祝いの太鼓よ！　……ついでに、巫女の腕試しもね。'),
        dl('p', '祝いなら素直に喜べばいいのに。まあ、腕試しなら受けて立つわ。'),
        dl('b', 'いい返事！　太鼓の響きに合わせて、踊りなさい！'),
        dl('p', '踊るのはあんたの方よ。太鼓のリズム、乗りこなしてみせる！'),
      ],
      post: [
        dl('b', '……見事な踊りだったわ。巫女さん。'),
        dl('p', '太鼓も悪くなかったわ。これで異変は本当に終わりね。'),
        dl('b', 'ええ。……今度は宴で叩くわ。巫女さんも来なさいよ！'),
      ],
    },
    marisa: {
      pre: [
        dl('p', 'お、太鼓の音だ。嵐まで呼んでるぜ。'),
        dl('b', 'ドンドン！　私は堀川雷鼓！　太鼓の音は嵐の音よ！'),
        dl('p', '雷鼓か。異変の後片付けに太鼓とは、派手だな。'),
        dl('b', '派手がいいのよ！　祝いの太鼓を叩きながら、腕試しも兼ねてるの！'),
        dl('p', '腕試しか。いいぜ、太鼓のリズムに乗ってやる！'),
        dl('b', 'ふふ、乗れるかしら。太鼓の連打、受けてみなさい！'),
        dl('p', '連打なら慣れてるぜ。魔法の連射で返してやる！'),
      ],
      post: [
        dl('b', '……いいリズムだったわ。魔法使い。'),
        dl('p', 'へへ、太鼓もいい音だったぜ。これで異変は終わりだな。'),
        dl('b', 'ええ。……今度は宴で叩くわ。あんたも来なさいよ！'),
      ],
    },
  },
}
// ===== ポートレート画像（自前生成イラスト） =====
// 自機2人とチルノは public/cdn/koumakyou/、ボス8人は public/cdn/kishinjou/ の webp を
// 自オリジン相対（BASE_URL基準）で参照し、SW の cdn/ キャッシュに乗せる。
// 読み込み失敗時は呼び出し側が図形／文字のフォールバック表示に切り替えるため、
// 画像が無くてもゲームは動作する。
const portraitUrl = (id: string): string =>
  id === 'reimu' || id === 'marisa' || id === 'cirno'
    ? `${import.meta.env.BASE_URL}cdn/koumakyou/${id}.webp`
    : `${import.meta.env.BASE_URL}cdn/kishinjou/${id === 'wakasagi' ? 'wakasagihime' : id}.webp`

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
// 輝針城向けに6曲＋妖器取得ジングルを新規に作曲している。
// 原作の旋律・フレーズは一切使わない。
// 拍同期ギミックの基準テンポは BOSS_BPM（176）／EXBOSS_BPM（168）と一致させる。
type TrackId = 'title' | 'stage' | 'boss' | 'exstage' | 'exboss' | 'jingle' | 'youki'
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
    bpm: 138, cut: 1700, arpDiv: 2, patch: 'bell',
    lead: parseLead('E5 . . . G5 . . . B5 . . . D6 . . . C6 . . . B5 . . . . . A5 . G5 . . . A5 . . . B5 . . . E6 . . . D6 . . . B5 . . . C6 . . . A5 . . . B5 . . . D6 . . . G6 . . . F#6 . . . D6 . . . C6 . . . B5 . . . . . A5 . B5 . . . G5 . . . F#5 . . . E5 . . . G5 . . . . . . . C5 . . . E5 . . .'),
    roots: [40, 40, 36, 38, 40, 40, 36, 35],
    bassPat: BASS_PAT_CALM,
    chords: [[64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [62, 66, 69, 74], [64, 67, 71, 76], [64, 67, 71, 76], [60, 64, 67, 72], [59, 63, 66, 71]],
    kick: 'x.......x.......', snare: '................', hat: 'x.x.x.x.x.x.x.x.',
  },
  stage: {
    bpm: 172, cut: 2600, arpDiv: 1, patch: 'trumpet',
    lead: parseLead('E5 . G5 . B5 . E6 . D6 . B5 . G5 . B5 . E6 . . . D6 . B5 . G5 . F#5 . G5 . A5 . B5 . A5 . G5 . E5 . G5 . B5 . A5 . G5 . A5 . C6 . A5 . G5 . F#5 . G5 . E5 . G5 . A5 . B5 . C6 . B5 . A5 . G5 . E5 . D6 . . . . . C6 . B5 . A5 . G5 . E5 . G5 . B5 . E6 . D6 . C6 . B5 . A5 . G5 . E5 . F#5 . G5 . A5 . B5 . D6 . C6 . B5 . A5 . G5 . B5 . . . E6 . . . D6 . C6 . B5 . A5 . G5 . E6 . . . . . F#6 . E6 . D6 . B5 . A5 . G5 . A5 . B5 . C6 . D6 . E6 . D6 . C6 . B5 . A5 . G5 . A5 . B5 . E6 . D6 . B5 . G5 . E5 . . . x x x x'),
    roots: [40, 40, 36, 38, 40, 40, 36, 35],
    bassPat: BASS_PAT_DRIVE,
    chords: [[52, 55, 59, 64], [52, 55, 59, 64], [48, 52, 55, 60], [50, 54, 57, 62], [52, 55, 59, 64], [52, 55, 59, 64], [48, 52, 55, 60], [47, 51, 54, 59]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.',
  },
  boss: {
    bpm: BOSS_BPM, cut: 3000, arpDiv: 1, patch: 'brass', stab: true,
    lead: parseLead('E5 . E5 . G5 . E5 . B5 . E5 . G5 . E5 . E6 . . . D6 . B5 . G5 . F#5 . G5 . A5 . C6 . B5 . A5 . E5 . A5 . C6 . E6 . D6 . E6 . . . G6 . . . D6 . C6 . B5 . A5 . B5 . C6 . D6 . G6 . F#6 . E6 . D6 . C6 . B5 . A5 . C6 . D6 . E6 . F#6 . G6 . A6 . G6 . . F#6 . . E6 . D6 . C6 . B5 . C6 . D6 . E6 . . . D6 . C6 . B5 . A5 . B5 . E5 . A6 . C7 . A6 . E6 . C6 . A5 . C6 . E6 . F#6 . E6 . D6 . C6 . B5 . C6 . D6 . E6 . A6 . . . . . G6 . F#6 . E6 . D6 . C6 . B6 . . . A6 . . . F#6 . . . E6 . D6 . C6 . A5 . B5 . C6 . D6 . E6 . F#6 . G6 . A6 . B6 . . . E6 . . . D6 . C6 . B5 . A5 . G5 . A5 . B5 . C6 . D6 . E6 . . . x x x x'),
    roots: [40, 38, 40, 35, 40, 38, 36, 35],
    bassPat: BASS_PAT_GALLOP,
    chords: [[52, 55, 59, 64], [50, 54, 57, 62], [52, 55, 59, 64], [47, 51, 54, 59], [52, 55, 59, 64], [50, 54, 57, 62], [48, 52, 55, 60], [47, 51, 54, 59]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exstage: {
    bpm: 180, cut: 2800, arpDiv: 1, patch: 'trumpet',
    lead: parseLead('A5 . C6 . E6 . A6 . G6 . E6 . C6 . E6 . A6 . G6 . E6 . C6 . D6 . E6 . G6 . E6 . F6 . E6 . D6 . C6 . A5 . C6 . F6 . A6 . G6 . F6 . E6 . D6 . B5 . D6 . G6 . E6 . A6 G6 E6 C6 A5 C6 E6 A6 G6 . . . F6 . . . E6 . F6 . G6 . A6 . C7 . A6 . G6 . F6 . E6 . A6 . F6 . D6 . C6 . D6 . F6 . A6 . G6 . E6 . . . F6 . . . D6 . C6 . A5 . . . C6 . F6 . A6 . C7 . A6 . F6 . C6 . A5 . C6 . D6 . E6 . F6 . G6 . F6 . E6 . D6 . C6 . E6 . A6 . G6 . F6 . E6 . D6 . C6 . D6 . E6 . F6 . G6 . A6 . G6 . F6 . E6 . D6 . C6 . . . . . . . x x x x'),
    roots: [45, 45, 41, 43, 45, 45, 41, 40],
    bassPat: BASS_PAT_DRIVE,
    chords: [[57, 60, 64, 69], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [57, 60, 64, 69], [57, 60, 64, 69], [53, 57, 60, 65], [52, 56, 59, 64]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxxooxxooxxooxxo',
  },
  exboss: {
    bpm: EXBOSS_BPM, cut: 3200, arpDiv: 1, patch: 'brass', stab: true,
    lead: parseLead('D6 . D6 . F6 . D6 . A6 . D6 . F6 . D6 . D7 . . . C7 . A6 . F6 . E6 . F6 . G6 . A6 . G6 . F6 . D6 . F6 . A6 . D7 . C7 . A6 . . . C7 . . . A6 . F6 . G6 . A6 . G6 . F6 . E6 . D6 . E6 . F6 . G6 . A6 . C7 . A6 . F6 . D6 . E6 . F6 . G6 . A6 . C7 . D7 . C7 . . A6 . . G6 . F6 . E6 . F6 . G6 . A6 . . . G6 . F6 . E6 . D6 . E6 . D6 . . . x . A5 . D6 . F6 . A6 . D7 . C7 . A6 . F6 . A6 . G6 . . . . . . . A6 . G6 . F6 . E6 . D7 . F7 . A7 . F7 . D7 . A6 . F6 . D6 . C7 . Bb6 . A6 . G6 . A6 . Bb6 . C7 . D7 . F7 . C7 . A6 . F6 . G6 . A6 . Bb6 . C7 . A6 . . . G6 . . . F6 . . . D6 . . . x x x x D7 . . . C7 . . . Bb6 . . . A6 . . . G6 . A6 . Bb6 . C7 . D7 . C7 . A6 . F6 . F6 . A6 . D7 . F7 . E7 . C7 . A6 . C7 . G6 . . . A6 . . . D7 . . . x x x x'),
    roots: [50, 50, 43, 45, 50, 50, 46, 45],
    bassPat: BASS_PAT_GALLOP,
    chords: [[62, 65, 69, 74], [62, 65, 69, 74], [57, 60, 64, 69], [60, 63, 66, 71], [62, 65, 69, 74], [62, 65, 69, 74], [57, 61, 64, 69], [60, 63, 66, 71]],
    kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo',
  },
  jingle: {
    bpm: 148, cut: 2400, arpDiv: 2, once: true, patch: 'bell',
    lead: parseLead('E5 . G5 . B5 . E6 . G6 . . . E6 . . . D6 . C6 . B5 . G5 . B5 . E6 . . . A5 . C6 . E6 . A6 . G6 . E6 . C6 . A5 . B5 . D6 . F#6 . B6 . G6 . . . . . . .'),
    roots: [40, 40, 45, 47],
    bassPat: BASS_PAT_CALM,
    chords: [[52, 56, 59, 64], [52, 56, 59, 64], [50, 54, 57, 62], [51, 54, 59, 63]],
    kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  },
  youki: {
    bpm: 168, cut: 2600, arpDiv: 2, once: true, patch: 'bell',
    lead: parseLead('C6 . E6 . G6 . C7 . E7 . . . D7 . . . C7 . . . B6 . A6 . G6 . E6 . C6 . E6 . G6 . C7 . A6 . . . . . . .'),
    roots: [48, 48, 43, 45],
    bassPat: BASS_PAT_CALM,
    chords: [[60, 64, 67, 72], [60, 64, 67, 72], [55, 59, 62, 67], [57, 61, 64, 69]],
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


// ===== 自機が大きくなるギミック（針妙丸「お前が大きくなあれ」）の共有状態 =====
const playerGrowShared = { active: false }

// ===== 道中脚本（StageScript） =====
// 紅魔郷と同じスポーン規則：0.1 秒刻みの call イベントで道中を進行する。
// part 0: 道中前半 → 中ボス（4面は中ボスなしのためボス待ちへ） / part 1: 道中後半 → ボス待ちへ。
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
  // 妖器ルール（3面判定・プレイごと）
  youki: boolean
  youkiFailed: boolean
  youkiNotice: number
  // 画面反転（正邪）の適用状態
  flipX: boolean
  flipY: boolean
  flipTeleT: number
  flipPostT: number
  flipPending: { x: boolean; y: boolean } | null
}

export default function Kishinjou() {
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
        youki: false, youkiFailed: false, youkiNotice: 0,
        flipX: false, flipY: false, flipTeleT: 0, flipPostT: 0, flipPending: null,
      }
    }
    let G: GState = freshGame('reimu', 'normal', false, [0, 1, 2, 3, 4, 5])
    const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)

    // ===== 画面反転の状態管理 =====
    // フェイズ側が flipShared.want に望ましい状態を書き、本体側が予告→切替→発生停止を管理する。
    // 論理座標は反転させず、表示変換のみで反転させる（設計書 3章）。
    function clearFlip() {
      G.flipX = false; G.flipY = false
      G.flipTeleT = 0; G.flipPostT = 0; G.flipPending = null
      flipShared.wantX = false; flipShared.wantY = false
      flipShared.appliedX = false; flipShared.appliedY = false
      flipShared.holdFire = false
    }
    function updateFlip(dt: number) {
      // 戦闘中で正邪が現れている間だけ、フェイズ側の要求を反映する
      const seijaActive = bossCtl.active && ((ctlIsMid && G.midId === 'seija') || (!ctlIsMid && G.bossId === 'seija'))
      const wantX = seijaActive ? flipShared.wantX : false
      const wantY = seijaActive ? flipShared.wantY : false
      if (G.flipPending) {
        G.flipTeleT -= dt
        if (G.flipTeleT <= 0) {
          G.flipX = G.flipPending.x
          G.flipY = G.flipPending.y
          flipShared.appliedX = G.flipX
          flipShared.appliedY = G.flipY
          G.flipPending = null
          G.flipPostT = 0.5 // 切替後も0.5秒は新規発生を止める
        }
        return
      }
      if (G.flipPostT > 0) {
        G.flipPostT -= dt
        if (G.flipPostT <= 0) flipShared.holdFire = false
        return
      }
      if (wantX !== G.flipX || wantY !== G.flipY) {
        // 予告（約1秒）→切替。予告中は新規発生を止める
        G.flipPending = { x: wantX, y: wantY }
        G.flipTeleT = 1.0
        flipShared.holdFire = true
      }
    }

    // ===== ボス／中ボスの入場・退場演出 =====
    type EnterState = { t: number; max: number; fig: FigureDef; homeY: number; kind: 'mid' | 'boss' }
    type ExitState = {
      t: number; max: number; fig: FigureDef; x: number; y: number
      burstT: number; action: (() => void) | null
    }
    let enter: EnterState | null = null
    let exitFx: ExitState | null = null
    let bossDlgDone = false // このボスの戦前会話を既に挟んだか
    let afterNotice: (() => void) | null = null // 妖器取得通知の後に実行する処理

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
      // 妖器判定：3面（stageIdx 2）の間、残機が減る被弾が1回でもあると取得資格を失う。
      // グレイズは含めない。ボム使用自体は資格に影響しない
      if (G.stageIdx === 2) G.youkiFailed = true
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
      playerGrowShared.active = false
      player.def.hitR = 2.5
      clearFlip()
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
        if (lastStage === 6) { setEndTitle('EXTRA CLEAR!'); setEndSub('嵐の太鼓台を駆け抜けた！') } else if (G.diff === 'easy') {
          setEndTitle('EASY CLEAR!'); setEndSub('STAGE 5までクリア。Normal以上で全6面とEXに挑戦しよう')
        } else { setEndTitle('ALL CLEAR!'); setEndSub('逆転の城を元に戻した！') }
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
      clearFlip()
      formShared.wolf = false
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
      const hasMid = STAGES[G.stageIdx].mid !== null
      runner = new StageRunner(
        buildRoadScript(G.stageIdx, part, enemyDefs, (p) => {
          if (p === 0) {
            if (hasMid) startMidboss()
            else {
              // 4面は中ボスなし：道中前半の後にそのままボス待ちへ
              G.phase = 'bosswait'
              G.phaseT = 0
              G.bossWait = 1.3
              world.clearBullets()
            }
          } else {
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
      if (!sd.mid) return
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
      if (!sd.mid) return
      bossCtl.start(makeMidDef(sd.mid, sd.midName, G.stageIdx), world, playerRef, FW / 2, 80)
      burst(FW / 2, 80, 14, '#b3e5fc', 90)
    }
    function startBoss() {
      const sd = STAGES[G.stageIdx]
      ctlIsMid = false
      G.bossId = bossOfStage(G.stageIdx, G.youki)
      G.phase = 'boss'
      G.phaseT = 0
      bossDlgDone = false
      const meta = BOSS_META[G.bossId]
      G.msg = `${meta.epithet} ${meta.name}`
      G.msgT = 2.5
      // BGMは会話を挟んで戦闘開始時（launchBoss）に切り替える
      // 入場演出：画面外から飛来してから戦闘開始
      enter = { t: 1.05, max: 1.05, fig: BOSS_FIGURES[G.bossId], homeY: 88, kind: 'boss' }
    }
    function launchBoss() {
      const sd = STAGES[G.stageIdx]
      bgmPlay(G.stageIdx === 6 ? 'exboss' : 'boss')
      const bid = G.bossId ?? sd.boss
      bossCtl.start(makeBossDef(bid, G.diff), world, playerRef, FW / 2, 88)
      burst(FW / 2, 88, 16, '#ffcdd2', 90)
    }

    // ===== 会話シーンの開始（ゲームループを止め、終了時に done へ接続） =====
    function openDialogue(boss: BossId, kind: 'pre' | 'post', done: () => void) {
      const script = DIALOGUES[boss][G.chara]
      // 影狼の撃破後会話は、妖器を取得したかどうかで台詞が変わる
      const lines = kind === 'pre' ? script.pre : (boss === 'kagerou' && G.youki && script.postYouki ? script.postYouki : script.post)
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
        clearFlip()
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
      const stageIdx = G.stageIdx
      G.bossId = null
      state.addScore(100000)
      clearFlip()
      playerGrowShared.active = false
      player.def.hitR = 2.5
      const proceed = () => {
        if (G.stagePos + 1 < G.stageList.length) startStage(G.stagePos + 1)
        else finish(true)
      }
      // 妖器判定の確定：3面ボス（影狼）撃破時点で、ノーダメージなら妖器を取得する
      const gotYouki = stageIdx === 2 && !G.youkiFailed
      if (gotYouki) G.youki = true
      // 退場演出（爆発＋フェード上昇）→ 妖器取得通知（取得時のみ）→ 撃破後会話 → 次ステージ／クリア の順に進む
      const afterExit = () => {
        if (gotYouki) {
          // 取得通知を約2.2秒表示し、専用ジングルを鳴らす
          G.youkiNotice = 2.2
          bgmPlay('youki')
          afterNotice = bid ? () => openDialogue(bid, 'post', proceed) : proceed
        } else if (bid) {
          openDialogue(bid, 'post', proceed)
        } else {
          proceed()
        }
      }
      if (fig) {
        exitFx = {
          t: 1.15, max: 1.15, fig, x: bx, y: by, burstT: 0,
          action: afterExit,
        }
      } else {
        afterExit()
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

    // タッチ／ポインタ：相対ドラッグ移動＋自動ショット。
    // 画面反転中は、見た目の移動方向と一致するよう論理座標を反転して扱う
    let pointerDown = false
    let dragOffX = 0, dragOffY = 0
    const toLogical = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const rawX = ((e.clientX - rect.left) / rect.width) * SW
      const rawY = ((e.clientY - rect.top) / rect.height) * SH
      // HUD領域（反転前の x > FW）は反転後もタッチ対象外にする
      if (rawX > FW) return { x: FW + 1, y: rawY }
      let x = rawX
      let y = rawY
      if (G.flipX) x = FW - x
      if (G.flipY) y = FH - y
      return { x, y }
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

      // --- 妖器取得通知の進行 ---
      if (G.youkiNotice > 0) {
        G.youkiNotice -= dt
        if (G.youkiNotice <= 0) {
          const act = afterNotice
          afterNotice = null
          if (act) act()
        }
      }

      // --- 画面反転の進行（予告→切替→発生停止） ---
      updateFlip(dt)

      // --- 自機が大きくなっている間の当たり判定 ---
      const wantGrow = playerGrowShared.active
      if (player.def.hitR !== (wantGrow ? 5 : 2.5)) player.def.hitR = wantGrow ? 5 : 2.5

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
        // 画面反転中は「見た目どおり」に動くよう入力ベクトルの該当軸を反転させる
        if (G.flipX) mx = -mx
        if (G.flipY) my = -my
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
      const hue = G.stageIdx
      // 3面は満月を描く（影狼の舞台）
      if (hue === 2) {
        ctx.fillStyle = '#f5f0dc'
        ctx.beginPath(); ctx.arc(FW - 62, 58, 30, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(220,210,180,0.5)'
        ctx.beginPath(); ctx.arc(FW - 70, 52, 7, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(FW - 54, 66, 5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(FW - 58, 48, 4, 0, Math.PI * 2); ctx.fill()
      }
      // 1面は湖面のきらめき、EXは嵐の斜線
      if (hue === 0) {
        ctx.fillStyle = 'rgba(120,200,255,0.25)'
        for (let i = 0; i < 6; i++) {
          const y = FH - 70 + i * 12
          const x = (Math.sin(G.time * 0.8 + i * 1.7) * 18 + FW / 2)
          ctx.fillRect(x - 26 - i * 4, y, 52 + i * 8, 2)
        }
      }
      if (hue === 6) {
        ctx.strokeStyle = 'rgba(180,190,255,0.18)'
        ctx.lineWidth = 1
        for (let i = 0; i < 8; i++) {
          const x = ((i * 67 + G.time * 260) % (FW + 80)) - 40
          ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x - 26, 60); ctx.stroke()
        }
      }
      // 舞い落ちる花びら／葉（面ごとに色を変える）
      const petalCols = ['rgba(150,220,255,0.8)', 'rgba(170,255,180,0.6)', 'rgba(240,230,200,0.8)', 'rgba(200,170,255,0.7)', 'rgba(255,150,180,0.7)', 'rgba(255,220,150,0.8)', 'rgba(180,190,255,0.8)']
      const pc = petalCols[hue]
      for (let i = 0; i < 36; i++) {
        const sx = ((i * 89 + G.time * (7 + (i % 3) * 5)) % (FW + 24)) - 12
        const sy = (i * 61 + G.time * (15 + (i % 4) * 6)) % FH
        ctx.fillStyle = i % 3 === 0 ? pc : 'rgba(255,255,255,0.35)'
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(G.time * (1 + (i % 3) * 0.4) + i)
        ctx.fillRect(-2.2, -1.1, 4.4, 2.2)
        ctx.restore()
      }
      // 遠景の城のシルエット（輝針城）
      ctx.fillStyle = 'rgba(6,3,12,0.8)'
      ctx.fillRect(28, 52, 74, 7)
      ctx.fillRect(36, 66, 58, 5)
      ctx.fillRect(40, 52, 8, 62)
      ctx.fillRect(82, 52, 8, 62)
      // 底の反射
      const mg = ctx.createLinearGradient(0, FH - 46, 0, FH)
      mg.addColorStop(0, 'rgba(126,87,194,0)')
      mg.addColorStop(1, 'rgba(126,87,194,0.26)')
      ctx.fillStyle = mg
      ctx.fillRect(0, FH - 46, FW, 46)
      ctx.fillStyle = 'rgba(6,3,10,0.9)'
      ctx.fillRect(0, FH - 14, FW, 14)
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

    /** 赤蛮奇の分離した首を描く（顔＋赤髪＋リボン） */
    function drawSekibankiHead(x: number, y: number) {
      ctx.save(); ctx.translate(x, y)
      // 赤髪（後ろ）
      ctx.fillStyle = '#d8404a'
      ctx.beginPath(); ctx.arc(0, -2, 13, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(-11, 4, 5, 9, 0.3, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(11, 4, 5, 9, -0.3, 0, Math.PI * 2); ctx.fill()
      // 顔
      ctx.fillStyle = '#ffe7d6'
      ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.fill()
      // 目
      ctx.fillStyle = '#8a2be2'
      ctx.beginPath(); ctx.arc(-3.5, -1, 1.6, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(3.5, -1, 1.6, 0, Math.PI * 2); ctx.fill()
      // リボン
      ctx.fillStyle = '#e0455a'
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(-6, -17); ctx.lineTo(0, -14); ctx.lineTo(6, -17); ctx.closePath(); ctx.fill()
      ctx.restore()
    }

    function draw() {
      ctx.clearRect(0, 0, SW, SH)
      ctx.save()
      if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake)
      drawBackground()

      // ===== 画面反転：プレイフィールドの描画だけを反転させる =====
      // 論理座標は通常のまま。HUD・会話・メニュー等のHTML側UIは反転させない。
      ctx.save()
      if (G.flipX || G.flipY) {
        ctx.translate(FW / 2, FH / 2)
        ctx.scale(G.flipX ? -1 : 1, G.flipY ? -1 : 1)
        ctx.translate(-FW / 2, -FH / 2)
      }

      // アイテム
      items.render(ctx)
      // 敵
      for (const en of enemies.active) drawFairy(en)
      // 中ボス／ボス
      if (bossCtl.active) {
        const curId = ctlIsMid ? G.midId : G.bossId
        const fig = ctlIsMid && G.midId
          ? MID_FIGURES[G.midId]
          : G.bossId === 'kagerou' && formShared.wolf
            ? KAGEROU_WOLF_FIG
            : G.bossId ? BOSS_FIGURES[G.bossId] : null
        if (fig) {
          // 分身・首がある場合は全ボディを描く
          if (bossCtl.bodies.length > 1) {
            for (const b of bossCtl.bodies) {
              if (!b.visible) continue
              if (b.real) {
                drawFigure(ctx, fig, b.x, b.y, {
                  t: G.time,
                  scale: curId === 'shinmyoumaru' ? 0.85 : 1,
                })
              } else if (curId === 'sekibanki') {
                drawSekibankiHead(b.x, b.y)
              } else {
                // 七人の一寸法師：小さな針妙丸
                drawFigure(ctx, fig, b.x, b.y, { t: G.time, scale: 0.55 })
              }
            }
          } else {
            drawFigure(ctx, fig, bossCtl.x, bossCtl.y, {
              t: G.time,
              scale: curId === 'shinmyoumaru' ? 0.85 : 1,
            })
          }
          // 狼変身中は耳を描く
          if (G.bossId === 'kagerou' && formShared.wolf) {
            ctx.fillStyle = '#6c7280'
            ctx.beginPath(); ctx.moveTo(bossCtl.x - 12, bossCtl.y - 22); ctx.lineTo(bossCtl.x - 9, bossCtl.y - 38); ctx.lineTo(bossCtl.x - 2, bossCtl.y - 22); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(bossCtl.x + 2, bossCtl.y - 22); ctx.lineTo(bossCtl.x + 9, bossCtl.y - 38); ctx.lineTo(bossCtl.x + 12, bossCtl.y - 22); ctx.closePath(); ctx.fill()
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
        const fig = G.bossId === 'kagerou' && formShared.wolf ? KAGEROU_WOLF_FIG : BOSS_FIGURES[G.bossId]
        drawFigure(ctx, fig, FW / 2, 88, { t: G.time, scale: G.bossId === 'shinmyoumaru' ? 0.85 : 1 })
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
        const grown = playerGrowShared.active
        drawFigure(ctx, G.chara === 'marisa' ? MARISA_FIGURE : REIMU_FIGURE, player.x, player.y, {
          t: G.time, scale: grown ? 1.35 : 0.8, alpha: blink ? 0.3 : 1,
        })
        if (grown) {
          ctx.fillStyle = '#ff8a80'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
          ctx.fillText('大きくなあれ！', player.x, player.y - 24)
        }
        if (G.focusNow || pointerDown) {
          const hr = grown ? 5 : 3
          ctx.beginPath(); ctx.arc(player.x, player.y, hr, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'; ctx.fill()
          ctx.beginPath(); ctx.arc(player.x, player.y, hr, 0, Math.PI * 2)
          ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1.4; ctx.stroke()
          ctx.beginPath(); ctx.arc(player.x, player.y, grown ? 13 : 8, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke()
        }
      }
      ctx.restore() // 反転ここまで
      ctx.restore() // 揺れここまで

      // ===== 反転の予告・状態表示（UI側なので反転させない） =====
      if (G.flipPending) {
        const pulse = 0.5 + Math.sin(G.time * 14) * 0.3
        ctx.strokeStyle = `rgba(255,213,79,${pulse})`
        ctx.lineWidth = 5
        ctx.strokeRect(3, 3, FW - 6, FH - 6)
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4
        const label = G.flipPending.x && G.flipPending.y ? '世界反転！' : G.flipPending.x ? '左右反転！' : G.flipPending.y ? '上下反転！' : '反転解除'
        ctx.strokeText(label, FW / 2, 60)
        ctx.fillText(label, FW / 2, 60)
      } else if (G.flipX || G.flipY) {
        ctx.strokeStyle = 'rgba(171,71,188,0.85)'
        ctx.lineWidth = 3
        ctx.strokeRect(2, 2, FW - 4, FH - 4)
        ctx.fillStyle = '#ce93d8'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        const label = G.flipX && G.flipY ? '180°反転中' : G.flipX ? '←→ 反転中' : '↑↓ 反転中'
        ctx.fillText(label, FW / 2, 44)
      }

      // ===== ボス位置マーカー（画面下部。反転中は見た目の位置に合わせる） =====
      const marker = (x: number, color: string) => {
        const mx = clamp(G.flipX ? FW - x : x, 8, FW - 8)
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
        const meta = BOSS_META[bossOfStage(G.stageIdx, G.youki)]
        ctx.fillStyle = 'rgba(5,2,14,0.62)'; ctx.fillRect(0, 128, FW, 168)
        ctx.fillStyle = '#b39ddb'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
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
      // 妖器取得通知
      if (G.youkiNotice > 0) {
        const a = Math.min(1, G.youkiNotice)
        ctx.globalAlpha = a
        ctx.fillStyle = 'rgba(20,4,30,0.72)'; ctx.fillRect(0, 168, FW, 96)
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2
        ctx.strokeRect(24, 168, FW - 48, 96)
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('妖器を手に入れた！', FW / 2, 204)
        ctx.fillStyle = '#ffffff'; ctx.font = '15px sans-serif'
        ctx.fillText('4面のボスは九十九弁々になる', FW / 2, 238)
        ctx.globalAlpha = 1
      }

      // ===== サイド表示 =====
      ctx.fillStyle = '#12061c'; ctx.fillRect(FW, 0, SW - FW, SH)
      ctx.fillStyle = '#3d2b5c'; ctx.fillRect(FW, 0, 2, SH)
      const sx = FW + 14
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      const label = (s: string, y: number) => {
        ctx.fillStyle = '#c5b3e0'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(s, sx, y)
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
      ctx.fillStyle = '#7e57c2'; ctx.fillRect(sx, 232, 96 * (state.power / 4), 8)
      ctx.fillStyle = '#ffffff'; ctx.font = '11px monospace'
      ctx.fillText(`${Math.floor(state.power)} / 4`, sx, 244)
      label('GRAZE', 266)
      value(String(state.graze), 280)
      if (G.challenge) {
        ctx.fillStyle = '#c5b3e0'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('MISS', sx + 62, 266)
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.fillText(String(G.misses), sx + 62, 280)
      }
      label('TIME', 306)
      value(`${Math.floor(G.time)}s`, 320)
      if (G.youki) {
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 11px sans-serif'
        ctx.fillText('妖器：取得済み', sx, 344)
      } else if (G.stageIdx === 2) {
        ctx.fillStyle = '#a58a99'; ctx.font = '10px sans-serif'
        ctx.fillText('妖器：ノーダメージで取得', sx, 344)
      } else {
        ctx.fillStyle = '#a58a99'; ctx.font = '10px sans-serif'
        ctx.fillText(`${G.chara === 'marisa' ? '魔理沙' : '霊夢'} / ${DIFF_CFG[G.diff].label}${G.challenge ? ' / CHALLENGE' : ''}`, sx, 344)
      }
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
      afterNotice = null
      formShared.wolf = false
      playerGrowShared.active = false
      if (bossCtl.active) bossCtl.abort()
      state.reset()
      state.hiScore = hiscore
      enemyDefs = makeEnemyDefs(DIFF_CFG[sel.diff])
      bossCtl.setDiff({ spd: DIFF_CFG[sel.diff].spd, den: DIFF_CFG[sel.diff].den })
      player.def = sel.chara === 'marisa' ? MARISA_LOCAL : REIMU_LOCAL
      player.def.hitR = 2.5
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
    background: 'rgba(14,4,24,0.82)', color: '#fff', textAlign: 'center',
    borderRadius: 8, padding: 14, zIndex: 3, overflowY: 'auto',
  }
  const btnStyle: React.CSSProperties = {
    background: '#5e35b1', color: '#fff', border: '1px solid #b39ddb',
    borderRadius: 999, padding: '10px 28px', fontSize: 16, fontWeight: 'bold',
    cursor: 'pointer',
  }
  const selLabel: React.CSSProperties = { fontSize: 11, color: '#c5b3e0', letterSpacing: 2, marginTop: 4 }
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
            background: 'linear-gradient(160deg, #311b92 0%, #12061c 100%)',
            color: '#d1c4e9', fontWeight: 'bold', fontSize: 20, letterSpacing: 2,
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
        .kishi-btn:active { transform: scale(0.96); }
        .kishi-menu { transition: background 0.12s, color 0.12s; }
        .kishi-menu:hover, .kishi-menu:active { background: rgba(126, 87, 194, 0.18); color: #ede7f6; }
        .kishi-menu .kishi-caret { opacity: 0; transition: opacity 0.12s; }
        .kishi-menu:hover .kishi-caret, .kishi-menu:active .kishi-caret { opacity: 1; }
        .kishi-card { transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
        .kishi-card:hover, .kishi-card:active { transform: translateY(-2px); border-color: rgba(179,157,219,0.95) !important; box-shadow: 0 10px 26px rgba(0,0,0,0.55); }
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
          className="kishi-btn"
          onClick={toggleMute}
          aria-label="BGMミュート切替"
          style={{
            position: 'absolute', right: 10, top: 10, zIndex: 4,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(18,6,28,0.7)', color: '#fff',
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
            className="kishi-btn"
            onPointerDown={(e) => { e.preventDefault(); pressBomb() }}
            style={{
              position: 'absolute', right: narrow ? 8 : 10, bottom: narrow ? 8 : 10, zIndex: 2,
              width: narrow ? 54 : 64, height: narrow ? 54 : 64, borderRadius: '50%',
              background: 'rgba(94,53,177,0.78)', color: '#fff',
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
            border: active ? '2px solid rgba(179,157,219,0.95)' : '2px solid rgba(255,255,255,0.25)',
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
                background: 'linear-gradient(to bottom, rgba(10,2,20,0.18) 0%, rgba(10,2,20,0.42) 62%, rgba(10,2,20,0.66) 100%)',
                borderRadius: 8,
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); skipDlg() }}
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 2,
                  background: 'rgba(18,4,28,0.78)', color: '#d1c4e9',
                  border: '1px solid rgba(179,157,219,0.55)', borderRadius: 999,
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
                  background: 'rgba(16,3,28,0.92)', border: '1px solid rgba(126,87,194,0.65)',
                  borderRadius: 10, padding: narrow ? '12px 14px 14px' : '14px 16px 16px', minHeight: narrow ? 84 : 92,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)', textAlign: 'left',
                }}
              >
                <div
                  style={{
                    position: 'absolute', top: -13, left: 14, padding: '2px 14px',
                    background: speakingPlayer ? '#5e35b1' : '#7e57c2', color: '#fff',
                    borderRadius: 999, fontSize: 12.5, fontWeight: 'bold', letterSpacing: 1,
                    border: '1px solid rgba(255,255,255,0.5)',
                  }}
                >
                  {speakingPlayer ? playerName : bossName}
                </div>
                <div style={{ fontSize: narrow ? 14 : 15, lineHeight: narrow ? 1.7 : 1.8, color: '#fff', marginTop: 2 }}>{line.t}</div>
                <div style={{ position: 'absolute', right: 14, bottom: 8, fontSize: 11, color: '#d1c4e9' }}>
                  {dlgUi.idx + 1}/{dlgUi.lines.length}　▼ タップ / Z
                </div>
              </div>
            </div>
          )
        })()}
        {screen === 'title' && (() => {
          // タイトル画面：逆転の城を思わせる背景＋キービジュアル＋縦並びメニュー
          const menuItem = (label: string, caption: string, onClick: () => void) => (
            <button
              key={label}
              type="button"
              className="kishi-menu"
              onClick={onClick}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', flexWrap: narrow ? 'wrap' : 'nowrap',
                background: 'transparent', border: 'none', borderBottom: '1px solid rgba(179,157,219,0.16)',
                color: '#fdf1e7', padding: narrow ? '8px 10px' : '9px 10px', fontSize: narrow ? 16 : 17, fontWeight: 'bold',
                letterSpacing: 2, cursor: 'pointer', textAlign: 'left',
                textShadow: '0 2px 8px rgba(0,0,0,0.85)',
              }}
            >
              <span className="kishi-caret" style={{ color: '#b39ddb', fontSize: 13 }}>▶</span>
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 'normal', color: '#c5b3e0', letterSpacing: 0 }}>{caption}</span>
            </button>
          )
          const stepHeader = (title: string, backTo: 'menu' | 'chara', backLabel: string) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => { setTitleStep(backTo); touchTitle() }}
                style={{
                  background: 'rgba(18,4,28,0.72)', color: '#d1c4e9', border: '1px solid rgba(179,157,219,0.5)',
                  borderRadius: 999, padding: '5px 14px', fontSize: 12, cursor: 'pointer',
                }}
              >
                ← {backLabel}
              </button>
              <div style={{ fontSize: 19, fontWeight: 'bold', color: '#d1c4e9', letterSpacing: 3 }}>{title}</div>
            </div>
          )
          const runCaption = pendingRun === 'extra' ? 'EXTRA STAGE' : challenge ? 'チャレンジモード（残機無限）' : '全6面'
          return (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 3, borderRadius: 8, overflow: 'hidden',
                background: 'linear-gradient(155deg, #0e0518 0%, #241238 46%, #120a2e 100%)',
                color: '#fff',
              }}
            >
              {/* 逆転の城のグロー */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 46% at 82% 24%, rgba(126,87,194,0.28), transparent 70%), radial-gradient(ellipse 62% 42% at 10% 80%, rgba(94,53,177,0.26), transparent 70%), radial-gradient(ellipse 90% 30% at 50% 110%, rgba(179,157,219,0.34), transparent 70%)' }} />
              {/* キービジュアル（メニュー画面のみ、右側に大きく） */}
              {titleStep === 'menu' && !imgErr.has('shinmyoumaru') && (
                <img
                  src={portraitUrl('shinmyoumaru')}
                  alt=""
                  draggable={false}
                  onError={() => markImgErr('shinmyoumaru')}
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
                    <div style={{ fontSize: 11, letterSpacing: 5, color: '#d1c4e9', textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>ファンメイド弾幕STG</div>
                    <div style={{ fontSize: narrow ? 36 : 44, fontWeight: 'bold', color: '#9575cd', letterSpacing: 3, lineHeight: 1.15, textShadow: '0 0 18px rgba(126,87,194,0.75), 0 3px 10px rgba(0,0,0,0.9)' }}>東方輝針城</div>
                    <div style={{ fontSize: 12.5, color: '#e3d9f2', letterSpacing: 2, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>〜 逆転の城と打ち出の小槌 〜　全6面＋EX</div>
                    <div style={{ marginTop: narrow ? 14 : 20, width: narrow ? '84%' : '64%', minWidth: narrow ? 0 : 250 }}>
                      {menuItem('ゲームスタート', '逆転の異変を追う', () => { setChallenge(false); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('エクストラスタート', 'EXTRA STAGE', () => { setChallenge(false); setPendingRun('extra'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('チャレンジ', '残機無限で挑戦', () => { setChallenge(true); setPendingRun('story'); setTitleStep('chara'); touchTitle() })}
                      {menuItem('記録表示', 'スコアとベスト記録', () => { setTitleStep('records'); touchTitle() })}
                      {menuItem('遊び方', '操作とルール', () => { setTitleStep('help'); touchTitle() })}
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, color: '#c5b3e0', textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
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
                    <div style={{ fontSize: 12, color: '#c5b3e0', marginBottom: 10 }}>{runCaption} ― 誰で異変に挑む？</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {([
                        { id: 'reimu' as CharaId, name: '博麗霊夢', trait: '誘導・広角ショット／標準速度', desc: '博麗神社の巫女。お札と御札の誘導弾で広く戦う。' },
                        { id: 'marisa' as CharaId, name: '霧雨魔理沙', trait: '集中レーザー／高速', desc: '普通の魔法使い。正面火力と速さで押し切る。' },
                      ]).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="kishi-card"
                          onClick={() => { setChara(c.id); setTitleStep('diff'); touchTitle() }}
                          style={{
                            flex: 1, background: 'rgba(18,4,28,0.74)', color: '#fff', cursor: 'pointer',
                            border: chara === c.id ? '2px solid rgba(179,157,219,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: 10, textAlign: 'left',
                          }}
                        >
                          {portraitEl(c.id, c.name, { width: '100%', height: narrow ? 136 : 208, borderRadius: 8, display: 'block' })}
                          <div style={{ fontSize: 17, fontWeight: 'bold', marginTop: 8 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, color: '#d1c4e9', marginTop: 2 }}>{c.trait}</div>
                          <div style={{ fontSize: 11, color: '#e3d9f2', lineHeight: 1.6, marginTop: 4 }}>{c.desc}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {titleStep === 'diff' && (
                  <>
                    {stepHeader('難易度選択', 'chara', '自機選択')}
                    <div style={{ fontSize: 12, color: '#c5b3e0', marginBottom: 10 }}>
                      {chara === 'reimu' ? '博麗霊夢' : '霧雨魔理沙'} ／ {runCaption}
                      {pendingRun !== 'story' && '（EXは難易度で弾幕の密度・速度が変わります）'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {([
                        { id: 'easy' as DiffId, name: 'Easy', desc: pendingRun !== 'story' ? '弾幕は薄め。EXのお試しに' : '5面まで。弾幕は薄めで遊びやすい' },
                        { id: 'normal' as DiffId, name: 'Normal', desc: '標準の歯ごたえ' },
                        { id: 'hard' as DiffId, name: 'Hard', desc: '弾幕の密度・速度アップ' },
                      ]).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          className="kishi-card"
                          onClick={() => { setDiff(d.id); getBgm(); startRef.current(pendingRun) }}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 14, width: '100%',
                            background: 'rgba(18,4,28,0.74)', color: '#fff', cursor: 'pointer',
                            border: diff === d.id ? '2px solid rgba(179,157,219,0.9)' : '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 12, padding: '13px 16px', textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 19, fontWeight: 'bold', letterSpacing: 1 }}>{d.name}</span>
                          <span style={{ fontSize: 12, color: '#e3d9f2' }}>{d.desc}</span>
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
                            <span style={{ fontSize: 13, color: '#c5b3e0' }}>　ミス {challengeBest.misses}回</span>
                          </div>
                        ) : (
                          <div style={{ color: '#c5b3e0' }}>まだ記録がありません</div>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#e3d9f2' }}>
                        EXTRA STAGE（堀川雷鼓戦）は最初からいつでも挑戦できます。
                        3面をノーダメージでクリアすると妖器が手に入り、4面のボスが九十九弁々になります。
                      </div>
                    </div>
                  </>
                )}
                {titleStep === 'help' && (
                  <>
                    {stepHeader('遊び方', 'menu', 'タイトル')}
                    <div style={{ fontSize: 13, lineHeight: 2.05, color: '#f7ece2' }}>
                      逆さまになった世界を追って、空に浮かぶ輝針城を目指そう。全6面＋EX。<br />
                      移動：矢印キー / WASD（タッチはドラッグ）<br />
                      ショット：Z（タッチ中は自動）　ボム：X（画面ボタンでも可）<br />
                      低速移動：Shift（当たり判定が表示される）<br />
                      BGMミュート：M（右上のボタンでも可）<br />
                      会話：タップ / クリック / Z / Enter で送る。Esc か「スキップ」で省略できる。<br />
                      敵弾に近づくとかすり（GRAZE）で得点。アイテムを集めてパワーアップ。<br />
                      チャレンジモードは残機無限で、ミス回数が記録される。<br />
                      5面の鬼人正邪戦では画面が反転する。反転中は操作も見た目どおりに変わるので注意。<br />
                      3面をノーダメージでクリアすると妖器が手に入り、4面のボスが九十九弁々に変わる。
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
            <div style={{ fontSize: 14, color: '#e3d9f2' }}>{endSub}</div>
            <div style={{ fontSize: 20, fontFamily: 'monospace' }}>SCORE {finalScore.toLocaleString()}</div>
            {endChallenge && (
              <div style={{ fontSize: 14, color: '#ffd54f' }}>
                チャレンジモード：ミス {finalMisses}回
                {challengeBest.score > 0 && (
                  <span>　／　ベスト {challengeBest.score.toLocaleString()}（ミス {challengeBest.misses}回）</span>
                )}
              </div>
            )}
            <button type="button" className="kishi-btn" style={{ ...btnStyle, marginTop: 6 }} onClick={() => { getBgm(); startRef.current('story') }}>
              もう一度遊ぶ
            </button>
            <button
              type="button"
              onClick={() => { setScreen('title'); setTitleStep('menu'); getBgm().play('title') }}
              style={{ background: 'transparent', color: '#c5b3e0', border: 'none', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
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
            className="kishi-btn"
            onClick={toggleMute}
            aria-label="BGMミュート切替"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(18,6,28,0.7)', color: '#fff',
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
