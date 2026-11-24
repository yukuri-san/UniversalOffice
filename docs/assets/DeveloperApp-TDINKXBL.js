import{a as r,R as $,j as e,T,U as D,o as Q,q as Z}from"./index-Be-PYX_H.js";const M=[{id:"danmaku-engine",label:"danmaku-engine（汎用弾幕）"},{id:"toho-engine",label:"toho-engine（東方系レイヤー）"},{id:"errorDialog",label:"errorDialog（エラーウインドウ）"}],y=[{id:"danmaku-world",name:"DanmakuWorld",category:"danmaku-engine",signature:`class DanmakuWorld {
  constructor(opts: WorldOpts)
  spawn(o: SpawnOpts): Bullet | null
  addLaser(o: LaserOpts): Laser | null
  addEmitter(e: Emitter, pos?: { x: number; y: number } | (() => { x: number; y: number })): EmitterEntry
  removeEmitter(entry: EmitterEntry): void
  clearEmitters(): void
  clearBullets(convert?: (b: Bullet) => void): void
  clearLasers(): void
  update(dt: number): void
  collide(px: number, py: number, hitR: number, grazeR: number, onGraze?: (b: Bullet) => void, onHit?: (b: Bullet) => void): CollideResult
  collideLasers(px: number, py: number, hitR: number): boolean
  render(ctx: CanvasRenderingContext2D, bank?: SpriteBank): void
  readonly pool: BulletPool
  readonly lasers: LaserPool
  readonly timeline: Timeline
  readonly sprites: SpriteBank
  readonly target: { x: number; y: number }
  rng: () => number
  time: number
  get bulletCount(): number
  get laserCount(): number
  get emitterCount(): number
}`,summary:"弾・レーザー・Emitter・タイムラインを統合した弾幕エンジンの中核クラス。update(dt) で論理更新（タイムライン→Emitter→弾→レーザーの順）、render(ctx) で描画、collide / collideLasers で自機との当たり判定を行う。target に自機位置を毎フレーム入れておくと、狙い撃ち（aimedVolley / AimedEmitter）と凍結弾の resume: 'aim' の基準点になる。clearBullets の convert にコールバックを渡すと、全弾消去の前に弾ごとへ得点化などの処理ができる。",params:[{name:"opts",type:"WorldOpts",desc:"フィールドサイズやプール上限などの生成オプション"},{name:"dt",type:"number",desc:"update の論理ステップ秒。FixedLoop と組み合わせて 1/60 固定で渡すのが基本"},{name:"convert",type:"(b: Bullet) => void",desc:"clearBullets の任意コールバック。消去前に有効な弾すべてへ呼ばれる"}],example:`const world = new DanmakuWorld({ width: 384, height: 448 })
// 毎フレーム：自機位置を教えてから更新・判定・描画
world.target.x = player.x
world.target.y = player.y
world.update(1 / 60)
const res = world.collide(player.x, player.y, 2.5, 26)
if (res.hit) onMiss()
score += res.grazed * 500
world.render(ctx)`,keywords:"world ワールド 統合 中核 メインループ 弾幕エンジン danmaku"},{id:"world-opts",name:"WorldOpts",category:"danmaku-engine",signature:`interface WorldOpts {
  width: number
  height: number
  bulletCap?: number  // 既定 4096
  laserCap?: number   // 既定 32
  margin?: number     // 画面外カリング余白 px、既定 40
  palette?: string[]  // 既定 DEFAULT_PALETTE
}`,summary:"DanmakuWorld の生成オプション。フィールドの論理サイズ（width / height）は必須。弾がフィールド＋margin の外に出ると自動で消去される。",example:"const world = new DanmakuWorld({ width: 384, height: 448, bulletCap: 2048 })",keywords:"worldopts オプション 設定 フィールド サイズ cap 上限"},{id:"collide-result",name:"CollideResult",category:"danmaku-engine",signature:`interface CollideResult {
  hit: boolean    // 被弾したか（当たった弾は消去される）
  grazed: number  // この呼び出しで新たにグレイズした数
}`,summary:"DanmakuWorld.collide の戻り値。グレイズは弾ごとに1回だけ数えられ（Bullet.grazed フラグで管理）、被弾した場合はその弾を消去して hit=true を返す。",example:`const res = world.collide(px, py, 2.5, 26, (b) => playGrazeSe())
if (res.hit) { /* ミス処理 */ }
grazeCount += res.grazed`,keywords:"collideresult 判定結果 被弾 グレイズ graze hit"},{id:"bullet-pool",name:"BulletPool",category:"danmaku-engine",signature:`class BulletPool {
  constructor(capacity?: number)  // 既定 4096
  spawn(o: SpawnOpts): Bullet | null
  kill(b: Bullet): void
  clear(): void
  get count(): number
  readonly bullets: Bullet[]
  readonly active: Bullet[]  // 有効な弾だけの稠密配列
}`,summary:"弾オブジェクトの事前確保プール。フリーリスト＋稠密アクティブ配列で spawn / kill が O(1) に収まり、実行時のオブジェクト確保を最小化する。上限に達すると spawn は null を返す。通常は DanmakuWorld.spawn 経由で使い、反復処理には active を使う。",example:`const pool = new BulletPool(4096)
const b = pool.spawn({ x: 100, y: 80, angle: Math.PI / 2, speed: 120, kind: 'orb', color: 0 })
for (const bullet of pool.active) { /* 有効な弾だけ処理 */ }`,keywords:"bulletpool プール 弾プール 事前確保 pool spawn kill"},{id:"bullet",name:"Bullet",category:"danmaku-engine",signature:`interface Bullet {
  active: boolean
  x: number; y: number
  vx: number; vy: number
  ax: number; ay: number
  angle: number   // 描画角度
  curve: number   // 速度ベクトルの角速度 rad/s（曲射）
  spin: number    // 見た目の自転 rad/s
  r: number       // 当たり判定半径
  scale: number   // 見た目倍率
  kind: BulletKind
  color: number   // パレット番号（customColor 使用時は -1）
  customColor: string
  grazed: boolean
  state: number   // 凍結ステートマシン（0:通常 1:出現待ち 2:凍結中）
  freezeAt: number; freezeTime: number; resume: ResumeMode
  grow: number; maxR: number  // 霧弾の半径成長
  drag: number    // 速度減衰 /秒
  swayAmp: number; swayFreq: number; swayPhase: number  // サイン揺れ
  age: number
}`,summary:"弾1発の状態オブジェクト。生成は SpawnOpts で行い、実体は BulletPool が所有する。凍結ステートマシン（delay による出現待ち→移動→freezeAt で凍結→resume で再始動）、半径成長（grow）、減衰（drag）、サイン揺れ（sway）といった東方系の弾の振る舞いをすべて保持する。_pool / _slot はプール内部用なので触らない。",example:`// プールから得た弾は読み取り専用のつもりで扱う
const b = world.spawn({ x, y, angle, speed: 100 })
if (b) console.log(b.kind, b.r, b.age)`,keywords:"bullet 弾 状態 プロパティ freeze 凍結 grow sway"},{id:"spawn-opts",name:"SpawnOpts",category:"danmaku-engine",signature:`interface SpawnOpts {
  x: number; y: number
  angle?: number   // rad。vx/vy を指定しない場合に使う
  speed?: number   // px/s
  vx?: number; vy?: number
  ax?: number; ay?: number
  kind?: BulletKind
  color?: number; customColor?: string
  r?: number; scale?: number
  curve?: number; spin?: number
  delay?: number        // 出現してから動き出すまでの時間
  freezeAt?: number     // 移動開始から何秒後に凍結するか
  freezeTime?: number   // 凍結している時間
  resume?: ResumeMode; resumeSpeed?: number; resumeGravity?: number
  grow?: number; maxR?: number
  drag?: number
  swayAmp?: number; swayFreq?: number; swayPhase?: number
}`,summary:"弾生成パラメータ。初速は angle+speed か vx/vy のどちらかで与える。freezeAt / freezeTime / resume を組み合わせると「途中で止まってから自機へ向き直す弾」のような時止め系の挙動が作れる。grow+maxR は膨らむ霧弾、drag は減速、sway は横揺れ。",params:[{name:"angle / speed",type:"number",desc:"初速を角度（rad）と速さ（px/s）で指定。vx/vy 指定時は無視される"},{name:"kind",type:"BulletKind",desc:"見た目種別。未指定は 'orb'。判定半径 r の既定値も種別で決まる"},{name:"color / customColor",type:"number / string",desc:"color はパレット番号。customColor（CSS色）を渡すとそちらが優先され color は -1 になる"},{name:"freezeAt / freezeTime / resume",type:"number / number / ResumeMode",desc:"移動開始 freezeAt 秒後に freezeTime 秒間凍結し、resume の方式で再始動する"},{name:"grow / maxR",type:"number",desc:"半径の増加量（/秒）と上限。霧弾向け"}],example:`// 0.55秒進んで止まり、1.15秒後に自機方向へ再加速する弾（時止め系）
world.spawn({ x, y, angle, speed: 155, kind: 'orb', color: 4,
  freezeAt: 0.55, freezeTime: 1.15, resume: 'aim', resumeSpeed: 100 })`,keywords:"spawnopts 生成 パラメータ 弾を出す freeze 時止め"},{id:"bullet-template",name:"BulletTemplate",category:"danmaku-engine",signature:"type BulletTemplate = Omit<SpawnOpts, 'x' | 'y'>",summary:"位置（x / y）を除いた弾パラメータのテンプレート型。Emitter の bullet プロパティや、ringVolley などのボレー関数の共通パラメータとして使う。",example:`const tpl: BulletTemplate = { speed: 120, kind: 'knife', color: 4 }
ringVolley(world, boss.x, boss.y, 24, tpl)`,keywords:"bullettemplate テンプレート 共通パラメータ emitter ボレー"},{id:"bullet-kind",name:"BulletKind",category:"danmaku-engine",signature:`type BulletKind =
  | 'orb'      // 丸弾
  | 'big'      // 大玉
  | 'dot'      // 小粒
  | 'bubble'   // 泡弾（半透明）
  | 'ellipse'  // 楕円弾（速度方向を向く）
  | 'knife'    // ナイフ（速度方向を向く）
  | 'talisman' // 札（速度方向を向く）
  | 'star'     // 星弾（自転する）`,summary:"弾の見た目種別。ellipse / knife / talisman は速度方向を向いて描画され、star は spin で自転する。種別ごとに当たり判定半径の既定値が決まる（orb 4 / big 9 / dot 2.5 / bubble 6 / ellipse 4 / knife 4 / talisman 4.5 / star 4.5）。スプライトは SpriteBank が種別×色×サイズで事前描画する。",example:"world.spawn({ x, y, angle, speed: 200, kind: 'knife', color: 4 })",keywords:"bulletkind 弾種 見た目 丸弾 大玉 ナイフ 札 星 泡 楕円"},{id:"resume-mode",name:"ResumeMode",category:"danmaku-engine",signature:`type ResumeMode =
  | 'keep'  // 保存した速度そのまま
  | 'aim'   // 自機方向へ向き直す
  | 'speed' // 保存した方向のまま速度だけ変える
  | 'fall'  // その場から落下する（重力加速）`,summary:"凍結（時止め）した弾が再始動するときの挙動。SpawnOpts.resume で指定する。aim の向き直し先は DanmakuWorld.target（自機位置）、fall の重力は resumeGravity（既定 320）、speed の速さは resumeSpeed で決まる。",example:`// 凍結後に落下する弾（凍結スペル系）
world.spawn({ x, y, angle, speed: 165, freezeAt: 0.5, freezeTime: 0.85, resume: 'fall', resumeGravity: 330 })`,keywords:"resumemode 再始動 凍結 時止め aim fall keep speed"},{id:"default-palette",name:"DEFAULT_PALETTE",category:"danmaku-engine",signature:`const DEFAULT_PALETTE: string[]
// ['#ff5b6a', '#ff9f43', '#ffe066', '#7bed6a', '#4fc3f7', '#b388ff', '#ff7ad9', '#f5f5f5']`,summary:"弾・レーザーの色パレット既定値（8色）。Bullet.color や LaserOpts.color はこの配列のインデックスで色を指定する。WorldOpts.palette や SpriteBank の引数で差し替え可能。パレット外の色は customColor で直接指定する。",example:`// color: 4 はパレットの水色（#4fc3f7）
world.spawn({ x, y, angle, speed: 100, color: 4 })
// 独自色は customColor で
world.spawn({ x, y, angle, speed: 100, customColor: '#88ffcc' })`,keywords:"defaultpalette パレット 色 カラー"},{id:"laser-pool",name:"LaserPool",category:"danmaku-engine",signature:`class LaserPool {
  constructor(capacity?: number)  // 既定 32
  spawn(o: LaserOpts): Laser | null
  kill(l: Laser): void
  clear(): void
  update(dt: number): void
  endX(l: Laser): number
  endY(l: Laser): number
  get count(): number
  readonly active: Laser[]
}`,summary:"レーザーのプール。レーザーは「予告（state 0）→照射（1）→消散（2）」の状態を update で自動遷移する。angVel の定速回転、sweepAmp / sweepSpeed による往復の薙ぎ払い、follow コールバックによる発生源追従に対応。当たり判定は DanmakuWorld.collideLasers が線分距離で行う（照射中のみ）。通常は DanmakuWorld.addLaser 経由で使う。",example:`world.addLaser({ x: boss.x, y: boss.y, angle: Math.PI / 2, width: 30,
  telegraph: 0.9, duration: -1, sweepAmp: 0.85, sweepSpeed: 0.85,
  follow: () => ({ x: boss.x, y: boss.y }) })`,keywords:"laserpool レーザー プール 予告 照射 薙ぎ払い sweep"},{id:"laser-opts",name:"LaserOpts / Laser",category:"danmaku-engine",signature:`interface LaserOpts {
  x: number; y: number; angle: number
  length?: number   // 既定 640
  width?: number    // 既定 26
  color?: number; customColor?: string
  telegraph?: number  // 予告線の時間（秒）、既定 0.7
  duration?: number   // 照射時間。負数で無期限（kill で消す）、既定 -1
  fade?: number       // 消散時間、既定 0.25
  angVel?: number     // 一定回転 rad/s
  sweepAmp?: number; sweepSpeed?: number; sweepPhase?: number  // 往復薙ぎ払い
  follow?: () => { x: number; y: number }  // 発生源の追従
}
interface Laser { /* x, y, angle, state（0:予告 1:照射 2:消散）, age ほか */ }`,summary:"レーザー生成パラメータとレーザー実体。sweepAmp を付けると angle = baseAngle + sin(age * sweepSpeed + sweepPhase) * sweepAmp で往復回転し、angVel とは排他（sweep 優先）。follow を渡すと毎フレーム発生源座標へ追従する。",params:[{name:"telegraph",type:"number",desc:"照射前の予告線を表示する秒数。0 で即照射"},{name:"duration",type:"number",desc:"照射を続ける秒数。負数なら無期限で、LaserPool.kill または World.clearLasers で消す"},{name:"sweepAmp / sweepSpeed",type:"number",desc:"往復薙ぎ払いの振幅（rad）と速度"},{name:"follow",type:"() => { x, y }",desc:"発生源の現在位置を返す関数。ボス追従レーザーに使う"}],example:`// 下向きに予告0.7秒→2秒照射する固定レーザー
world.addLaser({ x, y, angle: Math.PI / 2, telegraph: 0.7, duration: 2, width: 22, color: 0 })`,keywords:"laseropts laser レーザー パラメータ 予告線 telegraph"},{id:"dist-point-segment",name:"distPointSegment",category:"danmaku-engine",signature:`function distPointSegment(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number`,summary:"点と線分の最短距離を返すユーティリティ。レーザー判定（DanmakuWorld.collideLasers）の基礎になっているもので、自前でレーザー風の判定を作るときにも使える。",params:[{name:"px, py",type:"number",desc:"判定する点（自機位置など）"},{name:"x1, y1, x2, y2",type:"number",desc:"線分の両端"}],example:`const d = distPointSegment(player.x, player.y, lx, ly, laserEndX, laserEndY)
if (d < laserWidth / 2 + hitR) { /* 被弾 */ }`,keywords:"distpointsegment 距離 線分 判定 レーザー"},{id:"sprite-bank",name:"SpriteBank",category:"danmaku-engine",signature:`class SpriteBank {
  constructor(palette?: string[], factory?: CanvasFactory)
  colorOf(b: Bullet): string
  get(b: Bullet): SpriteEntry | null
  clear(): void
  readonly palette: string[]
  readonly ss: number  // スーパーサンプリング倍率（2）
}`,summary:"弾スプライトの事前描画バンク。「種別×色×サイズ」をキーにオフスクリーンCanvasへ描いてキャッシュし、DanmakuWorld.render が drawImage で blit する。描画のホットループで影やグラデーションを毎回計算しないための仕組み。Canvas が作れない環境（Nodeなど）では get が null を返し、エンジンは単純な円描画にフォールバックする。DanmakuWorld が内部に保持しているので、通常は直接触らない。",example:`// 独自パレットでワールドを作ると内部の SpriteBank にも反映される
const world = new DanmakuWorld({ width: 384, height: 448, palette: ['#ff0000', '#00ff00'] })
world.sprites.clear()  // スプライトキャッシュを捨てる`,keywords:"spritebank スプライト 事前描画 blit キャッシュ 高速化"},{id:"canvas-factory",name:"CanvasFactory",category:"danmaku-engine",signature:"type CanvasFactory = (w: number, h: number) => HTMLCanvasElement",summary:"SpriteBank がスプライト用オフスクリーンCanvasを作るための生成関数型。未指定なら document.createElement('canvas') を使う。OffscreenCanvas を使いたい場合や、テスト・ベンチ環境で差し替えたい場合に渡す。",example:`const bank = new SpriteBank(undefined, (w, h) => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
})`,keywords:"canvasfactory ファクトリ オフスクリーン canvas"},{id:"ring-volley",name:"ringVolley",category:"danmaku-engine",signature:`function ringVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number, o: BulletTemplate & { angle?: number },
): number`,summary:"全方位リングを1回撃つボレー部品。o.angle を基点に count 発を等間隔で円形に配置する。戻り値は実際に生成できた弾数（プール上限で欠ける場合がある）。",params:[{name:"count",type:"number",desc:"リングの弾数"},{name:"o.angle",type:"number",desc:"リングの回転オフセット（rad）。省略時は 0"}],example:"ringVolley(world, boss.x, boss.y, 28, { speed: 110, kind: 'orb', color: 5 })",keywords:"ringvolley リング 全方位 円形 ボレー"},{id:"fan-volley",name:"fanVolley",category:"danmaku-engine",signature:`function fanVolley(
  w: DanmakuWorld, x: number, y: number,
  center: number, count: number, spread: number, o: BulletTemplate,
): number`,summary:"扇状に1回撃つボレー部品。中心角 center を軸に spread（rad）の広がりへ count 発を均等配置する。count が1のときは center 方向へ1発。戻り値は生成できた弾数。",params:[{name:"center",type:"number",desc:"扇の中心角（rad）"},{name:"spread",type:"number",desc:"扇の広がり（rad）"}],example:"fanVolley(world, boss.x, boss.y, Math.PI / 2, 5, 0.6, { speed: 150, kind: 'orb', color: 1 })",keywords:"fanvolley 扇 扇状 n-way ボレー"},{id:"aimed-volley",name:"aimedVolley",category:"danmaku-engine",signature:`function aimedVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number, spread: number, o: BulletTemplate,
): number`,summary:"world.target（自機位置）方向を中心にした n-way 狙い撃ちボレー。内部では発射点から target への角度を計算して fanVolley を呼ぶ。使う前に world.target へ自機位置を入れておくこと。",example:"aimedVolley(world, enemy.x, enemy.y, 3, 0.18, { speed: 170, kind: 'orb', color: 0 })",keywords:"aimedvolley 狙い撃ち 狙撃 n-way 自機狙い ボレー"},{id:"scatter-volley",name:"scatterVolley",category:"danmaku-engine",signature:`function scatterVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number,
  o: BulletTemplate & { angleMin?: number; angleMax?: number; speedMin?: number; speedMax?: number },
): number`,summary:"ランダム散布ボレー。角度範囲（既定は全方位）と速度範囲（既定は speed の 0.7〜1.3倍）から world.rng でランダムに count 発を撃つ。霧弾や爆発の破片のような、ばらつきのある発射に使う。",example:"scatterVolley(world, x, y, 12, { kind: 'bubble', color: 5, angleMin: 0, angleMax: Math.PI, speedMin: 30, speedMax: 70 })",keywords:"scattervolley ランダム 散布 ばらまき ボレー rng"},{id:"emitter",name:"Emitter（基底クラス）",category:"danmaku-engine",signature:`abstract class Emitter {
  interval: number        // 射撃間隔（秒）、既定 0.1
  delay: number           // 開始までの遅延（秒）
  duration: number        // 稼働時間（秒、負数で無期限）
  bullet: BulletTemplate  // 弾テンプレート
  elapsed: number
  active: boolean
  update(dt: number, w: DanmakuWorld, x: number, y: number): void
  protected abstract fire(w: DanmakuWorld, x: number, y: number): void
}`,summary:"継続射撃部品の抽象基底クラス。DanmakuWorld.addEmitter で登録すると、発射点の座標を受け取りながら interval ごとに fire が呼ばれる。duration を過ぎると active=false になり、ワールド側が自動で登録を外す。独自の発射パターンはこのクラスを継承し fire を実装して作る。",example:`class CrossEmitter extends Emitter {
  fire(w: DanmakuWorld, x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      w.spawn({ ...this.bullet, x, y, angle: (i / 4) * Math.PI * 2 })
    }
  }
}
const e = new CrossEmitter()
e.interval = 0.4
e.bullet = { speed: 100, kind: 'orb', color: 2 }
world.addEmitter(e, () => ({ x: boss.x, y: boss.y }))`,keywords:"emitter 基底 継承 カスタム 射撃部品 abstract"},{id:"ring-emitter",name:"RingEmitter",category:"danmaku-engine",signature:`class RingEmitter extends Emitter {
  count: number    // 既定 16
  angle: number    // 現在の基点角
  angleVel: number // 1射撃ごとの角度オフセット増分 rad
}`,summary:"全方位リングを繰り返し撃つ Emitter。angleVel を付けると1射撃ごとにリングが少しずつ回転し、花弁のような模様になる。",example:`const e = new RingEmitter()
e.count = 20; e.interval = 0.28; e.angleVel = 0.13
e.bullet = { speed: 95, kind: 'orb', color: 3 }
world.addEmitter(e, bossPos)`,keywords:"ringemitter リング 回転 emitter"},{id:"fan-emitter",name:"FanEmitter",category:"danmaku-engine",signature:`class FanEmitter extends Emitter {
  count: number    // 既定 5
  spread: number   // 既定 0.6 rad
  angle: number    // 既定 PI/2（下向き）
  aim: boolean     // true で自機方向を中心にする
  angleVel: number // 中心角の増分 /射撃
}`,summary:"扇状の n-way を繰り返し撃つ Emitter。aim=true で中心が world.target（自機）方向になる。angleVel で扇の向き自体を回していける。",example:`const e = new FanEmitter()
e.count = 5; e.spread = 0.55; e.aim = true; e.interval = 0.5
e.bullet = { speed: 150, kind: 'orb', color: 1 }
world.addEmitter(e, bossPos)`,keywords:"fanemitter 扇 n-way emitter 狙い"},{id:"aimed-emitter",name:"AimedEmitter",category:"danmaku-engine",signature:`class AimedEmitter extends Emitter {
  count: number   // 既定 1
  spread: number  // 既定 0.18 rad
}`,summary:"自機方向への n-way 狙い撃ちを繰り返す Emitter。count=1 で単発狙撃、count を増やすと扇状の狙撃になる。toho-engine の PhaseTemplates（mist の狙撃部など）でも使われている。",example:`const e = new AimedEmitter()
e.count = 3; e.spread = 0.16; e.interval = 1.1
e.bullet = { speed: 165, kind: 'orb', color: 0 }
world.addEmitter(e, bossPos)`,keywords:"aimedemitter 狙い撃ち 狙撃 emitter"},{id:"spiral-emitter",name:"SpiralEmitter",category:"danmaku-engine",signature:`class SpiralEmitter extends Emitter {
  arms: number        // 腕の本数、既定 2
  angle: number       // 現在の発射角
  angleVel: number    // 発射角の回転速度 rad/s、既定 2.2
  alternate: boolean  // 腕ごとに回転方向を反転する
}`,summary:"発射角が回り続ける多腕スパイラル Emitter。arms 本の腕が等間隔に弾を出し、渦巻き模様を作る。alternate=true で奇数腕の角度符号を反転させ、逆巻きの渦を混ぜられる。",example:`const e = new SpiralEmitter()
e.arms = 3; e.angleVel = 2.4; e.interval = 0.07
e.bullet = { speed: 105, kind: 'orb', color: 6 }
world.addEmitter(e, bossPos)`,keywords:"spiralemitter スパイラル 渦巻き 多腕 emitter"},{id:"scatter-emitter",name:"ScatterEmitter",category:"danmaku-engine",signature:`class ScatterEmitter extends Emitter {
  count: number     // 1射撃の発数、既定 6
  angleMin: number  // 既定 0
  angleMax: number  // 既定 2*PI
  speedMin: number  // 0 でテンプレート準拠
  speedMax: number  // 0 でテンプレート準拠
}`,summary:"ランダム散布を繰り返す Emitter。内部で scatterVolley を使う。霧弾（bubble＋grow）や破片のような、方向と速さにばらつきのある発射向け。",example:`const e = new ScatterEmitter()
e.count = 3; e.interval = 0.42
e.bullet = { speed: 38, kind: 'bubble', color: 5, r: 5, grow: 7.5, maxR: 17, drag: 0.22 }
world.addEmitter(e, bossPos)`,keywords:"scatteremitter ランダム 散布 emitter 霧弾"},{id:"stream-emitter",name:"StreamEmitter",category:"danmaku-engine",signature:`class StreamEmitter extends Emitter {
  angle: number   // 既定 PI/2
  aim: boolean    // 既定 true（自機方向）
  zigzag: number  // 交互に左右へずらす量 rad
}`,summary:"単発を一定間隔で撃ち続ける直線ストリーム Emitter。aim=true（既定）で常に自機方向へ撃つ。zigzag を付けると発射角が左右交互にずれて蛇行する流れになる。",example:`const e = new StreamEmitter()
e.interval = 0.16; e.zigzag = 0.12
e.bullet = { speed: 190, kind: 'ellipse', color: 4 }
world.addEmitter(e, bossPos)`,keywords:"streamemitter ストリーム 直線 連射 emitter zigzag"},{id:"wave-emitter",name:"WaveEmitter",category:"danmaku-engine",signature:`class WaveEmitter extends Emitter {
  baseAngle: number  // 既定 PI/2
  aim: boolean       // true で自機方向を基準にする
  amp: number        // 振幅 rad、既定 0.5
  freq: number       // 周波数 Hz、既定 1.6
}`,summary:"発射角がサイン波で左右に揺れるストリーム Emitter。基準角＋sin(時刻 * freq * 2π) * amp で角度が決まる。波状にうねる弾の流れを作る。",example:`const e = new WaveEmitter()
e.amp = 0.55; e.freq = 1.2; e.interval = 0.09
e.bullet = { speed: 130, kind: 'orb', color: 2 }
world.addEmitter(e, bossPos)`,keywords:"waveemitter 波状 サイン 揺れ emitter"},{id:"vortex-emitter",name:"VortexEmitter",category:"danmaku-engine",signature:`class VortexEmitter extends Emitter {
  radius: number   // 発射点の円半径、既定 46
  rotVel: number   // 発射点の回転速度 rad/s、既定 1.8
  mode: 'in' | 'out' | 'tangent'  // 発射方向、既定 'tangent'
  angle: number    // 現在の発射点角度
}`,summary:"発射点そのものが中心の周りを回る渦巻き Emitter。円周上の点から、mode に応じて中心方向（in）／外向き（out）／接線方向（tangent）へ撃つ。",example:`const e = new VortexEmitter()
e.radius = 60; e.rotVel = 2.0; e.mode = 'tangent'; e.interval = 0.08
e.bullet = { speed: 90, kind: 'star', color: 3, spin: 3 }
world.addEmitter(e, bossPos)`,keywords:"vortexemitter 渦巻き 回転 発射点 emitter"},{id:"timeline",name:"Timeline",category:"danmaku-engine",signature:`type TimelineFn = (w: DanmakuWorld) => void

class Timeline {
  t: number
  at(time: number, fn: TimelineFn): this
  after(delay: number, fn: TimelineFn): this
  every(interval: number, fn: TimelineFn, count?: number): this  // count 負数で無限
  update(dt: number, w: DanmakuWorld): void
  clear(): void
  get pending(): number
}`,summary:"絶対時刻イベント＋繰り返し実行を並べる簡易タイムライン。at で時刻指定、after で現在時刻からの相対指定、every で周期実行を登録する。DanmakuWorld が timeline を1つ保持し、world.update の中で駆動されるため、道中の出現スケジュールなどをデータ的に書ける。",example:`world.timeline
  .at(2, (w) => ringVolley(w, 192, 60, 24, { speed: 100, color: 0 }))
  .every(1.5, (w) => aimedVolley(w, boss.x, boss.y, 3, 0.18, { speed: 160, color: 4 }), 6)`,keywords:"timeline タイムライン スケジュール at every after イベント"},{id:"script-runner",name:"ScriptRunner",category:"danmaku-engine",signature:`type ScriptStep = { wait: number } | { do: TimelineFn }

class ScriptRunner {
  constructor(steps: ScriptStep[])
  reset(): void
  update(dt: number, w: DanmakuWorld): void
  finished: boolean
}`,summary:"wait（秒数）と do（処理）を並べたステップ列を順に実行するスクリプトランナー。Timeline が「時刻で並列」に強いのに対し、こちらは「前の処理が終わってから次へ」という逐次演出（会話前後の間合い、段階的な攻撃展開など）に向く。update を毎フレーム呼ぶと内部で進行し、終わると finished=true になる。",example:`const script = new ScriptRunner([
  { do: (w) => ringVolley(w, x, y, 20, { speed: 90, color: 1 }) },
  { wait: 1.2 },
  { do: (w) => aimedVolley(w, x, y, 5, 0.3, { speed: 150, color: 0 }) },
])
// 毎フレーム
script.update(1 / 60, world)`,keywords:"scriptrunner スクリプト 逐次 wait do 演出"},{id:"fixed-loop",name:"FixedLoop",category:"danmaku-engine",signature:`interface FixedLoopOpts {
  step?: number     // 論理ステップ秒、既定 1/60
  maxFrame?: number // 1フレームで進める実時間の上限（秒）、既定 0.25
  maxSteps?: number // 1フレームの最大ステップ数、既定 5
  update: (dt: number) => void
  render?: (alpha: number) => void  // alpha は補間係数
}

class FixedLoop {
  constructor(opts: FixedLoopOpts)
  frame(nowMs: number): void  // requestAnimationFrame の timestamp を渡す
  reset(): void
  get fps(): number
  get frameMs(): number
  readonly meter: FpsMeter
  lastSteps: number
}`,summary:"論理更新を固定タイムステップに分離するループ。requestAnimationFrame の timestamp を frame に渡すと、蓄積した実時間ぶんだけ update(step) を繰り返し、render(alpha) を呼ぶ。デルタは maxFrame でクランプし、maxSteps を超える遅延は捨てることで処理落ち時のスパイラル（遅延の雪だるま）を防ぐ。端末の表示リフレッシュレートに依存せず弾幕の挙動が一定になる。",example:`const loop = new FixedLoop({
  update: (dt) => world.update(dt),
  render: () => world.render(ctx),
})
const tick = (now: number) => { loop.frame(now); requestAnimationFrame(tick) }
requestAnimationFrame(tick)`,keywords:"fixedloop 固定ステップ ループ 60hz requestanimationframe fps"},{id:"fps-meter",name:"FpsMeter",category:"danmaku-engine",signature:`class FpsMeter {
  fps: number     // 直近の実測fps（0.5秒窓）
  frameMs: number // フレーム時間の指数移動平均 ms
  sample(dtMs: number): void
}`,summary:"FPS計測器。sample にフレーム時間（ms）を渡し続けると、0.5秒窓の実測 fps と、フレーム時間の指数移動平均 frameMs を更新する。FixedLoop が内蔵しており、loop.fps / loop.frameMs でも読める。デバッグ表示や負荷計測用。",example:`const meter = new FpsMeter()
// 毎フレーム
meter.sample(frameDeltaMs)
console.log(meter.fps, meter.frameMs)`,keywords:"fpsmeter fps 計測 フレーム時間 デバッグ"},{id:"game-state",name:"GameState",category:"toho-engine",signature:`interface GameStateOpts {
  startLives?: number   // 既定 2
  startBombs?: number   // 既定 3
  maxBombs?: number     // 既定 8
  maxPower?: number     // 既定 4
  extendsAt?: number[]  // エクステンドのスコア閾値、既定 [1000万, 3000万, 6000万]
}

class GameState {
  score: number; hiScore: number
  lives: number; bombs: number
  power: number  // 0.00〜maxPower（整数部が powerTier）
  graze: number
  get powerTier(): number
  addScore(n: number): boolean  // エクステンド到達で true
  addGraze(n?: number): void
  addPower(amount: number): boolean  // 上限で溢れたら true
  powerDown(amount?: number): void
  addBomb(n?: number): void
  addLife(n?: number): void
  useBomb(): boolean  // 残りがあれば消費して true
  miss(): boolean     // ゲームオーバーなら true
  reset(): void
}`,summary:"東方系STGの共通システム（スコア・残機・ボム・パワー・グレイズ）をまとめた状態クラス。addScore はエクステンド（スコア残機アップ）の判定も行い、到達したら残機を増やして true を返す。miss() は残機を減らしボムを初期値へ戻し、残機が尽きたら true。パワーは小数で保持し、整数部がショット段階（powerTier）になる。",example:`const state = new GameState()
if (state.addScore(10000)) playExtendSe()
state.addGraze(res.grazed)
if (playerHit) {
  state.powerDown(1)
  if (state.miss()) gameOver()
}`,keywords:"gamestate スコア 残機 ボム パワー グレイズ エクステンド 状態"},{id:"item-pool",name:"ItemPool",category:"toho-engine",signature:`type ItemKind = 'power' | 'point' | 'life' | 'bomb' | 'fullpower'

interface ItemCollectInfo {
  kind: ItemKind; x: number; y: number
  fullValue: boolean  // 回収ライン（画面上部）での全吸着回収か
}

class ItemPool {
  constructor(capacity?: number)  // 既定 256
  spawn(kind: ItemKind, x: number, y: number): Item | null
  update(dt: number, px: number, py: number, opts: {
    height: number
    magnetR?: number    // 吸着半径、既定 64
    collectR?: number   // 回収半径、既定 15
    attractAll?: boolean
    onCollect?: (info: ItemCollectInfo) => void
  }): void
  render(ctx: CanvasRenderingContext2D): void
  clear(): void
  get count(): number
}`,summary:"ドロップアイテム（P／点／残機／ボム／フルパワー）のプール。アイテムは跳ね上がってから落下し、自機が magnetR 内に入ると吸着、collectR 内で回収されて onCollect が呼ばれる。attractAll=true（自機が画面上部の回収ラインへ入ったとき等）にすると全アイテムが吸着し、回収情報の fullValue が true になる（点アイテム満額の判定用）。描画は種別色の小さいチップ＋文字。",example:`const items = new ItemPool()
items.spawn('power', enemy.x, enemy.y)
// 毎フレーム
items.update(dt, player.x, player.y, {
  height: 448,
  attractAll: player.y < 96,
  onCollect: (info) => applyItemEffect(state, info),
})
items.render(ctx)`,keywords:"itempool アイテム ドロップ 回収 吸着 パワー 点アイテム"},{id:"apply-item-effect",name:"applyItemEffect",category:"toho-engine",signature:`function applyItemEffect(
  state: GameState, info: ItemCollectInfo,
  scoreMul?: number,  // 既定 1
): void`,summary:"アイテム回収効果を GameState へ適用する標準処理。power はパワー+0.25（満タン時は 5000点）、fullpower はパワー最大化、point は満額回収で 10000 点・通常 3000 点、life は残機+1、bomb はボム+1。点数には scoreMul が掛かる。独自の点数体系にしたい場合は ItemPool の onCollect で自前処理に差し替える。",params:[{name:"state",type:"GameState",desc:"効果の適用先"},{name:"info",type:"ItemCollectInfo",desc:"ItemPool.update の onCollect で渡される回収情報"},{name:"scoreMul",type:"number",desc:"得点倍率（難易度補正など）"}],example:"onCollect: (info) => applyItemEffect(state, info)",keywords:"applyitemeffect アイテム効果 得点 パワーアップ 残機"},{id:"enemy-pool",name:"EnemyPool / EnemyDef",category:"toho-engine",signature:`type EnemyMoveKind = 'down' | 'side' | 'sine' | 'hover' | 'dart'

interface EnemyDef {
  hp: number
  radius: number
  score?: number
  move: EnemyMoveKind
  speed?: number       // px/s、既定 68
  stopY?: number       // hover: 停止する y
  stayTime?: number    // hover: 停止してから退場までの秒数
  fireInterval?: number  // 射撃間隔（秒）。0/未指定で撃たない
  fire?: (w: DanmakuWorld, e: Enemy) => void  // カスタム射撃
  drop?: ItemKind[]    // 撃破時ドロップ
  sprite?: string      // 描画識別子（ゲーム側の描画と対応）
}

class EnemyPool {
  constructor(capacity?: number)  // 既定 96
  spawn(def: EnemyDef, x: number, y: number, dir?: number): Enemy | null
  damage(e: Enemy, dmg: number): boolean  // 撃破したら true
  kill(e: Enemy): void
  clear(): void
  update(dt: number, w: DanmakuWorld, bounds: { width: number; height: number }): void
  get count(): number
  readonly active: Enemy[]
}`,summary:"編隊ザコ敵のプールと定義。移動パターンは down（直進落下）/ side（横移動）/ sine（波形）/ hover（stopY で停止→stayTime 後に退場）/ dart（斜め突進）の5種を内蔵し、射撃は fireInterval 間隔で fire コールバックが呼ばれる（world と敵自身を受け取るので aimedVolley 等をそのまま使える）。撃破判定は damage が行い、ドロップやスコア付与は呼び出し側が drop / score を見て行う。描画はゲーム側（sprite 識別子で対応）。",example:`const fairy: EnemyDef = {
  hp: 6, radius: 12, score: 300, move: 'sine', speed: 74,
  fireInterval: 2.2,
  fire: (w, e) => aimedVolley(w, e.x, e.y, 1, 0, { speed: 130, color: 4 }),
  drop: ['power'], sprite: 'fairy',
}
enemies.spawn(fairy, 100, -26)
enemies.update(dt, world, { width: 384, height: 448 })`,keywords:"enemypool enemydef 敵 ザコ 編隊 移動パターン 射撃 ドロップ"},{id:"player-chara-def",name:"PlayerCharaDef",category:"toho-engine",signature:`type PlayerBulletKind = 'orb' | 'talisman' | 'missile' | 'laser'

interface ShotSpawn {
  dx: number; dy: number  // 自機位置からのオフセット
  angle: number           // 発射角 rad（-PI/2 が真上）
  speed: number; dmg: number
  kind: PlayerBulletKind
  homing?: number  // 誘導の旋回速度 rad/s（0で直進）
}

interface BombDef {
  name: string
  duration: number  // 効果時間（秒）
  dps: number       // 秒間ダメージ
  scope: 'full' | 'front'  // 全画面ボムか前方ボムか
}

interface PlayerCharaDef {
  id: string; name: string
  speed: number       // 通常移動速度 px/s
  focusSpeed: number  // 低速（集中）移動速度 px/s
  hitR: number        // 当たり判定半径
  grazeR: number      // グレイズ半径
  shotInterval: number  // ショット間隔（秒）
  shots: (powerTier: number, focused: boolean) => ShotSpawn[]
  bomb: BombDef
}`,summary:"自機キャラクターの差し替え可能な定義。移動速度・判定・ショット間隔と、パワー段階（0〜4）と集中状態に応じたショット構成を返す shots 関数、ボム定義を持つ。新しい自機はこの型のオブジェクトを1つ書けば追加できる。サンプルとして REIMU_DEF（広角＋誘導札）と MARISA_DEF（前方集中＋ミサイル）が用意されている。",example:`const MY_CHARA: PlayerCharaDef = {
  id: 'my', name: 'マイキャラ',
  speed: 270, focusSpeed: 120, hitR: 2.5, grazeR: 26,
  shotInterval: 0.08,
  bomb: { name: '秘法「サンプルボム」', duration: 3, dps: 300, scope: 'full' },
  shots: (tier, focused) => [
    { dx: 0, dy: -10, angle: -Math.PI / 2, speed: 640, dmg: 9, kind: 'orb' },
  ],
}`,keywords:"playercharadef 自機 キャラ定義 ショット ボム 差し替え"},{id:"reimu-def",name:"REIMU_DEF",category:"toho-engine",signature:`const REIMU_DEF: PlayerCharaDef
// id: 'reimu', name: '博麗霊夢'
// speed 268 / focusSpeed 118 / hitR 2.5 / grazeR 26 / shotInterval 0.075
// bomb: 霊符「夢想封印」（全画面、3.2秒、dps 260）`,summary:"霊夢タイプの自機定義サンプル。広角ショット＋パワー段階2から誘導札（talisman、homing）が加わる構成。集中（低速）で広がりが狭まる。PlayerCharaDef の実装例としてそのまま使える。",example:"const player = new Player(REIMU_DEF, 192, 380)",keywords:"reimu 霊夢 自機 サンプル 誘導札 夢想封印"},{id:"marisa-def",name:"MARISA_DEF",category:"toho-engine",signature:`const MARISA_DEF: PlayerCharaDef
// id: 'marisa', name: '霧雨魔理沙'
// speed 292 / focusSpeed 132 / hitR 2.5 / grazeR 26 / shotInterval 0.07
// bomb: 恋符「マスタースパーク」（前方、2.6秒、dps 340）`,summary:"魔理沙タイプの自機定義サンプル。前方集中のレーザー状ショット＋パワー段階2から弱誘導ミサイル。霊夢より移動速度と火力が高く、広がりがない。",example:"const player = new Player(MARISA_DEF, 192, 380)",keywords:"marisa 魔理沙 自機 サンプル マスタースパーク 前方集中"},{id:"player",name:"Player",category:"toho-engine",signature:`interface PlayerInput {
  mx: number; my: number  // -1..1 の移動入力
  focus: boolean
  shot: boolean
}

class Player {
  constructor(def: PlayerCharaDef, x: number, y: number)
  def: PlayerCharaDef
  x: number; y: number
  invulnT: number  // 無敵時間（秒）
  bombT: number    // ボム持続の残り（秒）
  dead: boolean
  get bombing(): boolean
  startBomb(): boolean
  respawn(x: number, y: number): void
  update(dt: number, input: PlayerInput, bounds: { width: number; height: number }, powerTier: number, onShots: (shots: ShotSpawn[]) => void): void
}`,summary:"自機本体。PlayerCharaDef に従って移動（フィールド境界でクランプ）と射撃タイミングを管理し、撃つ瞬間に onShots へ ShotSpawn 列を渡す（実際の弾生成は PlayerBulletPool.spawn へ回す）。startBomb はボム効果と無敵を開始する（GameState 側のボム消費は呼び出し側で先に行う）。respawn は無敵3秒で復活させる。被弾判定そのものは DanmakuWorld.collide 側で行い、結果に応じて dead や respawn をゲーム側が操作する。",example:`player.update(dt, { mx, my, focus, shot }, { width: 384, height: 448 },
  state.powerTier, (shots) => {
    for (const s of shots) bullets.spawn(player.x, player.y, s)
  })`,keywords:"player 自機本体 移動 射撃 ボム 無敵 リスポーン"},{id:"player-bullet-pool",name:"PlayerBulletPool",category:"toho-engine",signature:`class PlayerBulletPool {
  constructor(capacity?: number)  // 既定 320
  spawn(x: number, y: number, s: ShotSpawn): PlayerBullet | null
  update(dt: number, bounds: { width: number; height: number },
    findTarget: (x: number, y: number) => { x: number; y: number } | null,
    hitTest: (x: number, y: number, dmg: number) => boolean): void
  render(ctx: CanvasRenderingContext2D): void
  clear(): void
  get count(): number
}`,summary:"自機弾のプール。ShotSpawn を受けて生成し、update で移動・誘導（homing の旋回）・命中処理を行う。誘導先は findTarget コールバック、命中は hitTest コールバック（命中して消費されたら true を返す）でゲーム側と接続する。描画は kind ごとに内蔵（laser は縦長の光条、talisman は札、missile は光球、orb は楕円弾）。",example:`bullets.update(dt, { width: 384, height: 448 },
  (x, y) => nearestEnemyPos(x, y),
  (x, y, dmg) => damageEnemiesAt(x, y, dmg))`,keywords:"playerbulletpool 自機弾 プール 誘導 命中 ショット"},{id:"boss-controller",name:"BossController",category:"toho-engine",signature:`interface BossControllerOpts {
  width?: number   // 既定 384
  height?: number  // 既定 448
  clearBulletsOnPhaseEnd?: boolean  // 既定 true
  diff?: DiffScale
}

class BossController {
  constructor(opts?: BossControllerOpts)
  start(def: BossDef, world: DanmakuWorld, player: { x: number; y: number }, x: number, y: number): void
  update(dt: number): void
  damage(amount: number): void
  hitBody(body: BossBody | null, amount: number): boolean
  notifyMiss(): void
  notifyBomb(): void
  abort(): void
  setDiff(d: DiffScale): void
  get phase(): BossPhaseDef | null
  get isSpell(): boolean
  get radius(): number
  phaseIndex: number; hp: number; maxHp: number; timeLeft: number
  active: boolean; finished: boolean
  bodies: BossBody[]
  onPhaseStart: ((index: number, phase: BossPhaseDef) => void) | null
  onPhaseEnd: ((result: PhaseEndResult) => void) | null
  onDefeat: (() => void) | null
}`,summary:"ボス戦の制御クラス。BossDef のフェイズ列を順に実行し、HP・制限時間・移動パターン・テンプレート／カスタム処理の駆動、フェイズ終了時の Emitter／レーザー自動撤収と全弾消去を担う。スペル取得判定（ノーミス・ノーボムで撃破したら captured）も管理するので、スペル中に被弾したら notifyMiss、ボムを使ったら notifyBomb を呼ぶ。フェイズ遷移は onPhaseStart / onPhaseEnd、撃破は onDefeat で通知される。自機弾の命中は damage（本体）または hitBody（分身体）へ渡す。",example:`const boss = new BossController({ width: 384, height: 448 })
boss.onPhaseEnd = (r) => { if (r.captured) state.addScore(r.bonus) }
boss.onDefeat = () => onBossDown()
boss.start(RUMIA_BOSS, world, player, 192, 96)
// 毎フレーム
boss.update(dt)
// スペル中の被弾・ボムを記録
boss.notifyMiss(); boss.notifyBomb()`,keywords:"bosscontroller ボス 制御 フェイズ スペル取得 hp タイマー"},{id:"boss-def",name:"BossDef",category:"toho-engine",signature:`interface BossDef {
  id: string
  name: string
  epithet?: string  // 二つ名
  radius: number    // 当たり判定半径
  figure?: FigureDef  // キャラ描画用フィギュア定義（任意）
  phases: BossPhaseDef[]
}`,summary:"ボス1体の定義。名前・二つ名・判定半径・描画用 FigureDef と、通常攻撃とスペルカードを並べたフェイズ列を持つ。BossController.start に渡して戦闘を開始する。中ボスも「フェイズ1つだけの BossDef」として同じ仕組みで扱える。",example:`const RUMIA_BOSS: BossDef = {
  id: 'rumia', name: 'ルーミア', radius: 20, figure: RUMIA_FIGURE,
  phases: [ /* 通常攻撃 → スペル… の BossPhaseDef 列 */ ],
}`,keywords:"bossdef ボス定義 フェイズ列 中ボス"},{id:"boss-phase-def",name:"BossPhaseDef",category:"toho-engine",signature:`type BossMoveKind = 'still' | 'hover' | 'sine' | 'chase' | 'teleport' | 'drift'

interface BossPhaseDef {
  name: string | null  // スペル名。null は通常攻撃
  spell?: boolean      // スペルカードか（未指定なら name から自動判定）
  hp: number
  timeLimit: number    // 制限時間（秒）
  move?: BossMoveKind  // 既定 hover
  moveRange?: number; moveSpeed?: number
  template?: PhaseTemplateId
  params?: Record<string, number>
  bonusBase?: number    // スペルボーナス基礎値、既定 500000
  bonusPerSec?: number  // 残り時間1秒あたり、既定 20000
  setup?: (ctx: BossContext) => void
  update?: (ctx: BossContext, dt: number) => void
  teardown?: (ctx: BossContext) => void
}`,summary:"ボスのフェイズ（通常攻撃1つ、またはスペルカード1枚）の定義。移動は still（静止）/ hover（ふわりと揺れる）/ sine（横移動）/ chase（自機の x を追う）/ teleport（params.interval 秒ごとに瞬間移動）/ drift（ランダムな目標点へ漂う）から選べる。攻撃は template（仕掛けテンプレート＋params）か、setup / update / teardown のカスタム処理で書く。制限時間を過ぎるとタイムアウトとして次フェイズへ進む。",params:[{name:"name",type:"string | null",desc:"スペル名。通常攻撃フェイズは null"},{name:"template / params",type:"PhaseTemplateId / Record<string, number>",desc:"仕掛けテンプレートを使う場合の指定とパラメータ"},{name:"setup / update / teardown",type:"(ctx: BossContext) => void",desc:"カスタム攻撃処理。update は毎フレーム呼ばれる"}],example:`{
  name: '夜符「ミッドナイトバード」', hp: 900, timeLimit: 45,
  move: 'sine', moveRange: 70,
  setup: (ctx) => { const e = new SpiralEmitter(); e.arms = 2
    e.bullet = { speed: 100, kind: 'ellipse', color: 4 }; ctx.addEmitter(e) },
}`,keywords:"bossphasedef フェイズ スペルカード 通常攻撃 移動 テンプレート"},{id:"boss-context",name:"BossContext",category:"toho-engine",signature:`interface DiffScale { spd: number; den: number }  // 弾速倍率・弾数倍率

interface BossBody {
  x: number; y: number
  real: boolean     // 本物か（分身用）
  radius: number
  visible: boolean
}

interface BossContext {
  world: DanmakuWorld
  bossX: () => number; bossY: () => number
  player: { x: number; y: number }
  diff: DiffScale
  phaseTime: () => number
  spawn: (o: SpawnOpts) => Bullet | null
  ring: (count: number, o: BulletTemplate) => void
  fan: (center: number, count: number, spread: number, o: BulletTemplate) => void
  aimed: (count: number, spread: number, o: BulletTemplate) => void
  addEmitter: (e: Emitter) => EmitterEntry
  addEmitterAt: (e: Emitter, getPos: () => { x: number; y: number }) => EmitterEntry
  addLaser: (o: LaserOpts) => Laser | null
  setBodies: (bodies: BossBody[]) => void
  setRealOnlyDamage: (v: boolean) => void
}`,summary:"フェイズの setup / update / teardown と PhaseTemplates に渡される攻撃用コンテキスト。ring / fan / aimed は難易度倍率（弾速・弾数）を自動で適用する簡易発射ヘルパー。addEmitter / addLaser で登録したものはフェイズ終了時に自動で撤収される。setBodies で分身などの当たり判定体を差し替え、setRealOnlyDamage(true) の間は本物以外へのダメージが無効になる。",example:`update: (ctx, dt) => {
  // 難易度倍率つきの狙い撃ち
  ctx.aimed(3, 0.16, { speed: 150, kind: 'orb', color: 0 })
}`,keywords:"bosscontext コンテキスト 攻撃 ヘルパー 難易度倍率 分身"},{id:"calc-spell-bonus",name:"calcSpellBonus / PhaseEndResult",category:"toho-engine",signature:`function calcSpellBonus(phase: BossPhaseDef, timeLeft: number): number
// = bonusBase（既定 500000）+ bonusPerSec（既定 20000）× 残り時間

interface PhaseEndResult {
  index: number
  phase: BossPhaseDef
  captured: boolean  // ノーミス・ノーボムで取得したか
  bonus: number      // 取得時のスペルカードボーナス
  timeout: boolean   // 制限時間切れで終わったか
  last: boolean      // 最終フェイズだったか
}`,summary:"スペルカードボーナスの計算式と、BossController.onPhaseEnd で渡されるフェイズ終了結果。ボーナスは「基礎値＋残り時間×秒単価」で、取得（captured）したときだけ bonus に値が入る。",example:`boss.onPhaseEnd = (r) => {
  if (r.captured) state.addScore(r.bonus)
  if (r.last) stageClear()
}`,keywords:"calcspellbonus スペルボーナス 取得 phaseendresult フェイズ終了"},{id:"phase-templates",name:"PhaseTemplates",category:"toho-engine",signature:`type PhaseTemplateId = 'timestop' | 'freeze' | 'clones' | 'laserSweep' | 'mist'

type PhaseTemplateFactory = (
  ctx: BossContext, params: Record<string, number>,
) => PhaseTemplateInstance

const PhaseTemplates: Record<PhaseTemplateId, PhaseTemplateFactory>`,summary:"実在スペルカードの「仕掛け」を、スペル名ではなく仕掛け名で再利用できるようにしたテンプレート群。BossPhaseDef.template に ID を、params に数値を渡して使う。各テンプレートの主な params（既定値）：timestop（interval 1.7 / count 26 / speed 155 / travel 0.55 / freeze 1.15 / resumeSpeed 100 / color 4）＝撃った弾が途中で止まり一斉に自機へ再加速。freeze（interval 2.3 / count 34 / speed 165 / freezeAt 0.5 / freezeTime 0.85 / gravity 330 / layers 2 / color 4）＝広がった弾が一時停止して落下再始動。clones（count 4 / radius 76 / fireInterval 0.16 / bulletSpeed 108 / shuffle 5 / orbitSpeed 0.45 / color 6 / realOnlyDamage 0）＝複数体に分かれて周回し、本物が周期的に入れ替わる。laserSweep（count 1 / sweepAngle 0.85 / sweepSpeed 0.85 / width 30 / telegraph 0.9 / ringInterval 2.8 / ringCount 16 / ringSpeed 82 / color 0）＝予告つき回転レーザーの往復薙ぎ払い＋リング弾。mist（interval 0.42 / count 3 / speed 38 / grow 7.5 / maxR 17 / color 5 / aimedInterval 1.35 / aimedSpeed 74）＝漂いながら膨らむ泡弾＋狙撃。",params:[{name:"template",type:"PhaseTemplateId",desc:"BossPhaseDef.template に指定する仕掛け ID"},{name:"params",type:"Record<string, number>",desc:"弾数・速度・間隔などの調整値。省略したキーはテンプレートの既定値になる"}],example:`{
  name: '時符「ルナクロック」', hp: 1000, timeLimit: 50,
  template: 'timestop',
  params: { interval: 1.6, count: 30, speed: 160, freeze: 1.2 },
}`,keywords:"phasetemplates テンプレート 仕掛け 時止め 凍結 分身 レーザー 霧弾 スペル"},{id:"stage-script",name:"StageScript / StageEventDef",category:"toho-engine",signature:`interface DialogueLine {
  speaker: string
  text: string
  side?: 'left' | 'right'
}

interface FormationDef {
  enemy: EnemyDef
  count: number
  interval: number  // 出現間隔（秒）
  from: 'top' | 'left' | 'right'
  x?: number; y?: number  // top: 中心x / left,right: 開始y
  spacing?: number        // 編隊の間隔 px
}

type StageEventDef =
  | { at: number; type: 'formation'; formation: FormationDef }
  | { at: number; type: 'midboss'; boss: BossDef }
  | { at: number; type: 'boss'; boss: BossDef }
  | { at: number; type: 'background'; bg: string }
  | { at: number; type: 'dialogue'; lines: DialogueLine[] }
  | { at: number; type: 'drop'; item: ItemKind; x?: number; y?: number }
  | { at: number; type: 'message'; text: string }
  | { at: number; type: 'call'; fn: (api: StageApi) => void }

interface StageScript {
  id: string
  title: string
  subtitle?: string
  bg?: string  // 背景識別子の初期値
  events: StageEventDef[]
}`,summary:"ステージ1本分のデータ駆動脚本フォーマット。時刻 at（秒）に発火するイベント列で、編隊出現（formation）・中ボス／ボス（midboss / boss）・背景変更・会話・アイテムドロップ・メッセージ・任意処理（call）を並べる。実行は StageRunner が担当する。",example:`const STAGE1: StageScript = {
  id: 'stage1', title: '第1面', bg: 'lake',
  events: [
    { at: 1, type: 'formation', formation: { enemy: fairy, count: 5, interval: 0.5, from: 'top', x: 120 } },
    { at: 20, type: 'midboss', boss: RUMIA_MID },
    { at: 40, type: 'boss', boss: RUMIA_BOSS },
  ],
}`,keywords:"stagescript stageeventdef 脚本 ステージ イベント 編隊 会話 データ駆動"},{id:"stage-runner",name:"StageRunner / StageApi",category:"toho-engine",signature:`interface StageApi {
  spawnEnemy: (def: EnemyDef, x: number, y: number, dir: number) => void
  startBoss: (def: BossDef, midboss: boolean) => void
  setBackground: (bg: string) => void
  dialogue: (lines: DialogueLine[]) => void
  dropItem: (kind: ItemKind, x: number, y: number) => void
  message: (text: string) => void
}

class StageRunner {
  constructor(script: StageScript, api: StageApi, opts: { width: number; height: number })
  update(dt: number): void
  setPaused(v: boolean): void
  reset(): void
  get finished(): boolean
  t: number; paused: boolean
  readonly script: StageScript
}`,summary:"StageScript を時間軸で実行するランナー。編隊イベントは個別の出現予約に展開され、時刻が来たものから StageApi 経由でゲームシェル側へ通知される。ボス戦や会話の間は setPaused(true) で時計を止める運用を想定している。ゲーム側は StageApi（敵出現・ボス開始・背景・会話・ドロップ・メッセージ）を実装するだけでよい。",example:`const runner = new StageRunner(STAGE1, {
  spawnEnemy: (def, x, y, dir) => enemies.spawn(def, x, y, dir),
  startBoss: (def, mid) => startBossFight(def, mid),
  setBackground: (bg) => { currentBg = bg },
  dialogue: (lines) => showDialogue(lines),
  dropItem: (kind, x, y) => items.spawn(kind, x, y),
  message: (text) => showMessage(text),
}, { width: 384, height: 448 })
// ボス戦中は止める
runner.setPaused(boss.active)
runner.update(dt)`,keywords:"stagerunner stageapi ランナー 実行 脚本 ポーズ"},{id:"draw-figure",name:"drawFigure / FigureDef",category:"toho-engine",signature:`interface FigurePalette {
  skin: string; skinShade: string
  hair: string; hairShade: string
  eye: string
  dress: string; dressShade: string  // 服の主色
  sub: string    // ブラウス／エプロン等の副色
  accent: string // リボン等のアクセント色
}
type HairStyle = 'long' | 'medium' | 'short' | 'twin'
type FigureAccessory = 'ribbon' | 'bigRibbon' | 'witchHat' | 'none'
type FigureWings = 'none' | 'bat' | 'crystal' | 'ice' | 'feather'

interface FigureDef {
  palette: FigurePalette
  hairStyle: HairStyle
  accessory: FigureAccessory
  wings: FigureWings
  aura?: string  // 背後のオーラ色（rgba文字列）
}

interface FigureDrawOpts { t?: number; scale?: number; flip?: boolean; alpha?: number }

function drawFigure(
  ctx: CanvasRenderingContext2D,
  def: FigureDef,
  x: number, y: number,
  opts?: FigureDrawOpts,
): void`,summary:"キャラを Canvas ベクターで描くイラスト調フィギュア描画。原点はキャラ中心、素の大きさは約 幅54×高さ46。オーラ→翼→後ろ髪→ドレス→顔→前髪→小物の順にレイヤー描画し、髪の揺れや翼のはためきは opts.t（アニメーション時刻）で動く。配色・髪型・小物・翼種を FigureDef のパラメータで差し替える設計で、原作素材は使わず公式デザインの配色・衣装を参考にした自前描画。新キャラは FigureDef を1つ書けば追加できる。",params:[{name:"def",type:"FigureDef",desc:"パレット・髪型・小物・翼種の定義"},{name:"opts.t",type:"number",desc:"アニメーション時刻。髪と翼の揺れに使う"},{name:"opts.scale / flip / alpha",type:"number / boolean / number",desc:"拡縮、左右反転、不透明度"}],example:`// プリセットを使って描く
drawFigure(ctx, RUMIA_FIGURE, boss.x, boss.y, { t: time, scale: 1.4 })
// 独自キャラを定義して描く
const MY_FIGURE: FigureDef = {
  palette: { skin: '#ffe7d6', skinShade: '#f2c9a4', hair: '#88ccff', hairShade: '#5599dd',
    eye: '#3344cc', dress: '#4455aa', dressShade: '#2c3870', sub: '#ffffff', accent: '#ffcc44' },
  hairStyle: 'twin', accessory: 'ribbon', wings: 'feather',
}
drawFigure(ctx, MY_FIGURE, x, y, { t: time })`,keywords:"drawfigure figuredef キャラ描画 フィギュア イラスト パレット 翼 リボン"},{id:"figure-presets",name:"キャラプリセット（Figure）",category:"toho-engine",signature:`const RUMIA_FIGURE: FigureDef    // 金髪・赤目・黒ドレス＋白ブラウス・赤リボン・闇オーラ
function drawRumia(ctx: CanvasRenderingContext2D, x: number, y: number, t?: number, scale?: number): void
const REIMU_FIGURE: FigureDef    // 紅白・大きなリボン・ロングヘア
const MARISA_FIGURE: FigureDef   // 金髪・黒衣・とんがり帽子
const FLANDRE_FIGURE: FigureDef  // 金髪・赤系ドレス・宝石の翼（crystal）
const REMILIA_FIGURE: FigureDef  // 銀青髪・ピンクドレス・蝙蝠翼（bat）
const CIRNO_FIGURE: FigureDef    // 水色髪ツインテール・青ドレス・氷の翼（ice）`,summary:"drawFigure 用のキャラ別 FigureDef プリセット。ルーミア／霊夢／魔理沙／フランドール／レミリア／チルノの6体分が、公式デザインの配色・衣装・小物を参考にしたパラメータで用意されている。drawRumia は RUMIA_FIGURE で drawFigure を呼ぶショートカット。BossDef.figure に渡せばボス描画に使える。",example:`drawRumia(ctx, boss.x, boss.y, time, 1.4)
// 他キャラは drawFigure ＋ プリセットで
drawFigure(ctx, FLANDRE_FIGURE, x, y, { t: time, scale: 1.4 })`,keywords:"プリセット ルーミア 霊夢 魔理沙 フランドール レミリア チルノ figure キャラ"},{id:"show-error-dialog",name:"showErrorDialog",category:"errorDialog",signature:`function showErrorDialog(title: string, message: string, detail?: string): void

interface ErrorDialogRequest {
  title: string
  message: string
  detail?: string
}

const ERROR_DIALOG_EVENT = 'webx-error-dialog'`,summary:"テーマ別デザインのエラーウインドウをポップアップ表示する API。呼ぶと webx-error-dialog カスタムイベントが発火し、シェル常駐の ErrorDialogHost が現在の UI モード／テーマに応じた見た目で表示する。複数回呼ぶとキューに入り、1つずつ順に表示される。lib・コンポーネント・ターミナルなど、どこからでも呼べる。天気・為替など外部 API の取得失敗時の表示に使われている。",params:[{name:"title",type:"string",desc:"ウインドウのタイトル（例：「天気を取得できませんでした」）"},{name:"message",type:"string",desc:"本文のエラーメッセージ"},{name:"detail",type:"string",desc:"任意の詳細情報。全スタイル共通で本文下に小さな等幅フォントで表示される"}],example:`import { showErrorDialog } from '../lib/errorDialog'

try {
  const res = await fetch(url)
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
  // …取得成功時の処理
} catch (e) {
  showErrorDialog('天気を取得できませんでした',
    '通信に失敗しました。ネットワーク接続を確認してください。',
    e instanceof Error ? e.message : String(e))
}`,keywords:"showerrordialog エラー ウインドウ ポップアップ ダイアログ 通知 失敗"},{id:"error-dialog-style",name:"errorDialogStyle",category:"errorDialog",signature:`type ErrorDialogStyle = 'android' | 'ios' | 'windows' | 'macos'

function errorDialogStyle(ui: string, theme: string): ErrorDialogStyle`,summary:"現在の UI モード（App の resolvedUi）とテーマ ID から、エラーウインドウの見た目を決める関数。対応は mxui-classic → 'android'（Android の Material ダイアログ風）、mxui-liquid → 'ios'（iOS アラート風）、dxui → テーマが macos / ipados なら 'macos'（macOS アラート風）、それ以外は 'windows'（Windows ダイアログ風）。判定できない場合は 'windows' にフォールバックする。通常は ErrorDialogHost が内部で使うため、アプリ側が直接呼ぶ必要はない。",params:[{name:"ui",type:"string",desc:"解決済み UI モード（'dxui' | 'mxui-classic' | 'mxui-liquid'）"},{name:"theme",type:"string",desc:"テーマ ID（ykr-theme）。macos / ipados のときだけ Mac 風になる"}],example:`const style = errorDialogStyle('dxui', 'macos')  // 'macos'
const style2 = errorDialogStyle('mxui-liquid', 'dark')  // 'ios'`,keywords:"errordialogstyle スタイル テーマ android ios windows macos 見た目"}],ee=[{sig:"WebX.notify(text)",desc:"OS の通知センターに通知を出す。通知タップで自分のアプリが開く"},{sig:"WebX.openApp(id)",desc:"指定したアプリを開く（例：'calendar'、ストアアプリやマイAppの ID も可）"},{sig:"WebX.storage.get(key, fallback?)",desc:"自分のアプリ専用ストレージから値を読む（JSON 化できる値）"},{sig:"WebX.storage.set(key, value)",desc:"自分のアプリ専用ストレージへ保存する（1値 200KB まで）"},{sig:"WebX.storage.remove(key)",desc:"保存した値を消す"},{sig:"WebX.storage.keys()",desc:"保存済みキーの一覧を返す"},{sig:"WebX.system.info()",desc:"WebX のバージョン・テーマ・言語・画面サイズなどのシステム情報を返す"},{sig:"WebX.system.theme() / lang() / version()",desc:"テーマ ID／言語コード／WebX バージョンだけを返す"},{sig:"WebX.clipboard.write(text)",desc:"クリップボードへテキストをコピーする"}],ne=`<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;padding:16px">
<h1>WebX API サンプル</h1>
<p>WebX のシステム関数を試すサンプルです。</p>
<button id="b1">通知を出す</button>
<button id="b2">システム情報</button>
<button id="b3">カウント保存</button>
<button id="b4">カレンダーを開く</button>
<pre id="out" style="white-space:pre-wrap"></pre>
<script>
const out = document.getElementById('out')
document.getElementById('b1').onclick = () => WebX.notify('サンプルAppからの通知です')
document.getElementById('b2').onclick = async () => { out.textContent = JSON.stringify(await WebX.system.info(), null, 2) }
document.getElementById('b3').onclick = async () => {
  const n = (await WebX.storage.get('count', 0)) + 1
  await WebX.storage.set('count', n)
  out.textContent = '保存したカウント: ' + n
}
document.getElementById('b4').onclick = () => WebX.openApp('calendar')
<\/script>
</body></html>`,L="webx-dev-playground",te=`// JavaScript を書いて「実行」すると下に結果が出ます
const xs = [1, 2, 3, 4, 5]
console.log('合計:', xs.reduce((a, b) => a + b, 0))
'答えは ' + xs.reduce((a, b) => a + b, 0)`,N=`<!doctype html>
<html><body style="font-family:sans-serif;padding:16px">
<h1>マイApp</h1>
<p>ここに HTML を書くとアプリになります。</p>
<button onclick="document.body.style.background='#e0f2fe'">色を変える</button>
</body></html>`;function re({openApp:B}){var j;const[o,d]=r.useState("play"),[u,P]=r.useState("js"),[p,W]=r.useState(()=>localStorage.getItem(L)??te),[z,I]=r.useState([]),[m,f]=r.useState($),[c,h]=r.useState(null),[w,x]=r.useState(""),[C,v]=r.useState("📦"),[A,k]=r.useState(N),[O,V]=r.useState([]),[_,U]=r.useState(""),[b,F]=r.useState("all"),[g,G]=r.useState(""),[X,K]=r.useState(null),S=r.useMemo(()=>{const n=g.trim().toLowerCase();return y.filter(t=>b!=="all"&&t.category!==b?!1:n?t.name.toLowerCase().includes(n)||t.summary.toLowerCase().includes(n)||t.keywords.toLowerCase().includes(n)||t.signature.toLowerCase().includes(n):!0)},[b,g]),i=y.find(n=>n.id===X)??S[0]??null;r.useEffect(()=>{localStorage.setItem(L,p)},[p]);const E=async()=>{const n=[];for(let s=0;s<localStorage.length;s++){const l=localStorage.key(s);l&&n.push({key:l,size:new TextEncoder().encode(localStorage.getItem(l)??"").length})}n.sort((s,l)=>l.size-s.size),V(n);const t=await Q(),a=await Z();U(`保存方式: ${t.backend} / ブラウザ使用量: ${(t.usage/1024).toFixed(1)} KB / WebX データ実測: ${(a/1024).toFixed(1)} KB / localStorage: ${(n.reduce((s,l)=>s+l.size,0)/1024).toFixed(1)} KB`)};r.useEffect(()=>{o==="storage"&&E()},[o]);const H=()=>{const n=[],t={log:(...a)=>n.push(a.map(s=>typeof s=="object"?JSON.stringify(s):String(s)).join(" ")),error:(...a)=>n.push("⛔ "+a.map(String).join(" ")),warn:(...a)=>n.push("⚠ "+a.map(String).join(" "))};try{const s=new Function("console",`"use strict";
${p}`)(t);s!==void 0&&n.push(`→ ${typeof s=="object"?JSON.stringify(s):String(s)}`),I(n.length?n:["（出力なし）"])}catch(a){I([...n,`⛔ ${a instanceof Error?a.message:String(a)}`])}},R=()=>{h(null),x(""),v("📦"),k(N)},q=n=>{h(n.id),x(n.name),v(n.icon),k(n.html)},J=()=>{if(!w.trim())return;const n={id:c??T(),name:w.trim(),icon:C||"📦",html:A,createdAt:Date.now()},t=c?m.map(a=>a.id===c?n:a):[...m,n];f(t),D(t),h(n.id)},Y=n=>{const t=m.filter(a=>a.id!==n);f(t),D(t),c===n&&R()};return e.jsxs("div",{className:"wxapp dev-app",children:[e.jsxs("div",{className:"wxapp-tabs",children:[e.jsx("button",{className:o==="play"?"chip on":"chip",onClick:()=>d("play"),children:"▶ プレイグラウンド"}),e.jsx("button",{className:o==="apps"?"chip on":"chip",onClick:()=>d("apps"),children:"📦 マイApp作成"}),e.jsx("button",{className:o==="api"?"chip on":"chip",onClick:()=>d("api"),children:"🧩 システム関数（API）"}),e.jsx("button",{className:o==="apiref"?"chip on":"chip",onClick:()=>d("apiref"),children:"📖 APIリファレンス"}),e.jsx("button",{className:o==="storage"?"chip on":"chip",onClick:()=>d("storage"),children:"🗄 ストレージ検査"})]}),o==="play"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"wxapp-chips",children:[e.jsx("button",{className:u==="js"?"chip on":"chip",onClick:()=>P("js"),children:"JavaScript"}),e.jsx("button",{className:u==="html"?"chip on":"chip",onClick:()=>P("html"),children:"HTML プレビュー"}),u==="js"&&e.jsx("button",{className:"btn primary",onClick:H,children:"▶ 実行"})]}),e.jsx("textarea",{className:"dev-code",value:p,onChange:n=>W(n.target.value),spellCheck:!1,placeholder:u==="js"?"JavaScript コード":"HTML コード"}),u==="js"?e.jsx("pre",{className:"dev-output",children:z.join(`
`)||"実行結果がここに出ます"}):e.jsx("iframe",{title:"プレビュー",className:"dev-preview",sandbox:"allow-scripts",srcDoc:p}),e.jsx("p",{className:"wxapp-note",children:"コードは端末内に自動保存されます。実行はこのページ内だけで完結し、外部に送信されません。"})]}),o==="apps"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"dev-app-list",children:[m.map(n=>e.jsxs("div",{className:"dev-app-row",children:[e.jsx("span",{className:"dev-app-icon",children:n.icon}),e.jsx("span",{className:"dev-app-name",children:n.name}),e.jsx("button",{className:"btn",onClick:()=>B(n.id),children:"開く"}),e.jsx("button",{className:"btn",onClick:()=>q(n),children:"編集"}),e.jsx("button",{className:"btn danger",onClick:()=>Y(n.id),children:"削除"})]},n.id)),m.length===0&&e.jsx("p",{className:"wxapp-empty",children:"まだマイAppがありません。下のフォームから作れます。"})]}),e.jsx("label",{className:"wxapp-label",children:"アプリ名"}),e.jsx("input",{type:"text",value:w,onChange:n=>x(n.target.value),placeholder:"例：おみくじ"}),e.jsx("label",{className:"wxapp-label",children:"アイコン（絵文字1文字）"}),e.jsx("input",{type:"text",value:C,onChange:n=>v(n.target.value),maxLength:4}),e.jsx("label",{className:"wxapp-label",children:"HTMLコード"}),e.jsx("textarea",{className:"dev-code",value:A,onChange:n=>k(n.target.value),spellCheck:!1}),e.jsxs("div",{className:"wxapp-toolbar",children:[e.jsx("button",{className:"btn primary",onClick:J,children:c?"上書き保存":"アプリを作成"}),e.jsx("button",{className:"btn",onClick:R,children:"新規"})]}),e.jsx("p",{className:"wxapp-note",children:"作ったアプリはデスクトップとスタートメニューに並び、通常のアプリと同じように開けます。実行はサンドボックス内で、WebX の機能は「システム関数（API）」タブの WebX API 経由でのみ使えます。"})]}),o==="api"&&e.jsxs(e.Fragment,{children:[e.jsxs("p",{className:"wxapp-note",children:["マイApp の HTML からは、グローバルオブジェクト ",e.jsx("code",{children:"WebX"})," で WebX のシステム関数を呼べます（SDK は自動で読み込まれます）。すべての関数は Promise を返すので ",e.jsx("code",{children:"await"})," で結果を受け取れます。詳しい仕様はドキュメントの DEVELOPER.md にあります。"]}),e.jsx("div",{className:"dev-ls-list",children:ee.map(n=>e.jsxs("div",{className:"dev-ls-row",children:[e.jsx("code",{children:n.sig}),e.jsx("span",{children:n.desc})]},n.sig))}),e.jsx("div",{className:"wxapp-toolbar",children:e.jsx("button",{className:"btn primary",onClick:()=>{const n={id:T(),name:"WebX API サンプル",icon:"🧩",html:ne,createdAt:Date.now()},t=[...m,n];f(t),D(t),B(n.id)},children:"サンプルAppを作成して開く"})}),e.jsx("p",{className:"wxapp-note",children:"ストレージはアプリごとに分離されていて、他のアプリのデータには触れません。対応していない機能の呼び出しはエラーになります。"})]}),o==="apiref"&&e.jsxs(e.Fragment,{children:[e.jsx("p",{className:"wxapp-note",children:"WebX のゲーム・アプリ開発用ライブラリ（danmaku-engine / toho-engine / errorDialog）の公開APIリファレンスです。名前・説明・キーワードで検索できます。同内容はドキュメントの API.md にも載っています。"}),e.jsx("div",{className:"wxapp-search",children:e.jsx("input",{type:"text",value:g,onChange:n=>G(n.target.value),placeholder:"API名・キーワードで検索（例：レーザー、freeze、自機）"})}),e.jsxs("div",{className:"wxapp-chips",children:[e.jsxs("button",{className:b==="all"?"chip on":"chip",onClick:()=>F("all"),children:["すべて（",y.length,"）"]}),M.map(n=>e.jsxs("button",{className:b===n.id?"chip on":"chip",onClick:()=>F(n.id),children:[n.label,"（",y.filter(t=>t.category===n.id).length,"）"]},n.id))]}),i&&e.jsxs("div",{className:"dev-apiref-detail",children:[e.jsxs("div",{className:"dev-apiref-head",children:[e.jsx("strong",{children:i.name}),e.jsx("span",{className:"wxapp-count",children:(j=M.find(n=>n.id===i.category))==null?void 0:j.label})]}),e.jsx("pre",{className:"dev-output dev-apiref-pre",children:i.signature}),e.jsx("p",{className:"dev-apiref-summary",children:i.summary}),i.params&&i.params.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("label",{className:"wxapp-label",children:"引数・フィールド"}),e.jsx("div",{className:"dev-ls-list dev-apiref-params",children:i.params.map(n=>e.jsxs("div",{className:"dev-ls-row",children:[e.jsx("code",{children:n.name}),e.jsx("span",{className:"dev-apiref-ptype",children:n.type}),e.jsx("span",{children:n.desc})]},n.name))})]}),e.jsx("label",{className:"wxapp-label",children:"使用例"}),e.jsx("pre",{className:"dev-output dev-apiref-pre",children:i.example})]}),e.jsxs("div",{className:"dev-apiref-list",children:[S.map(n=>e.jsxs("button",{className:i&&i.id===n.id?"dev-apiref-item on":"dev-apiref-item",onClick:()=>K(n.id),children:[e.jsx("code",{children:n.name}),e.jsx("span",{children:n.summary})]},n.id)),S.length===0&&e.jsxs("p",{className:"wxapp-empty",children:["「",g,"」に一致するAPIがありません。"]})]})]}),o==="storage"&&e.jsxs(e.Fragment,{children:[e.jsx("p",{className:"wxapp-note",children:_||"読み込み中…"}),e.jsx("button",{className:"btn",onClick:()=>void E(),children:"再読み込み"}),e.jsx("div",{className:"dev-ls-list",children:O.map(n=>e.jsxs("div",{className:"dev-ls-row",children:[e.jsx("code",{children:n.key}),e.jsxs("span",{children:[(n.size/1024).toFixed(2)," KB"]}),e.jsx("button",{className:"btn danger",onClick:()=>{window.confirm(`${n.key} を削除しますか？`)&&(localStorage.removeItem(n.key),E())},children:"削除"})]},n.key))}),e.jsx("p",{className:"wxapp-note",children:"注意：設定やアプリのデータが消えるキーもあります。意味の分かるものだけ削除してください。"})]})]})}export{re as default};
