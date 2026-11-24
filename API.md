# WebX API リファレンス

WebX のゲーム・アプリ開発用ライブラリの公開APIドキュメントです。

- **danmaku-engine**（`src/lib/danmaku-engine.ts`）— 汎用弾幕エンジン（Canvas 2D）。弾プール／スプライト事前描画／固定60Hzループで、敵弾3,000発規模でも60fpsを狙う性能設計。
- **toho-engine**（`src/lib/toho-engine.ts`）— danmaku-engine の上に構築した東方系レイヤー。ステージ脚本、ボスフレームワーク、自機フレームワーク、共通システム、キャラ描画ヘルパー。
- **errorDialog**（`src/lib/errorDialog.ts`）— テーマ別デザインのエラーウインドウAPI。

このドキュメントと同じ内容は、WebX の**開発者アプリ「APIリファレンス」タブ**からも検索・閲覧できます（構造化データは `src/lib/apiDocs.ts`）。

---

## danmaku-engine

### DanmakuWorld

```ts
class DanmakuWorld {
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
}
```

弾・レーザー・Emitter・タイムラインを統合した弾幕エンジンの中核クラス。`update(dt)` で論理更新（タイムライン→Emitter→弾→レーザーの順）、`render(ctx)` で描画、`collide` / `collideLasers` で自機との当たり判定を行う。`target` に自機位置を毎フレーム入れておくと、狙い撃ち（aimedVolley / AimedEmitter）と凍結弾の `resume: 'aim'` の基準点になる。`clearBullets` の `convert` にコールバックを渡すと、全弾消去の前に弾ごとへ得点化などの処理ができる。

- `opts`（WorldOpts）— フィールドサイズやプール上限などの生成オプション
- `dt`（number）— update の論理ステップ秒。FixedLoop と組み合わせて 1/60 固定で渡すのが基本
- `convert`（(b: Bullet) => void）— clearBullets の任意コールバック。消去前に有効な弾すべてへ呼ばれる

```ts
const world = new DanmakuWorld({ width: 384, height: 448 })
// 毎フレーム：自機位置を教えてから更新・判定・描画
world.target.x = player.x
world.target.y = player.y
world.update(1 / 60)
const res = world.collide(player.x, player.y, 2.5, 26)
if (res.hit) onMiss()
score += res.grazed * 500
world.render(ctx)
```

### WorldOpts

```ts
interface WorldOpts {
  width: number
  height: number
  bulletCap?: number  // 既定 4096
  laserCap?: number   // 既定 32
  margin?: number     // 画面外カリング余白 px、既定 40
  palette?: string[]  // 既定 DEFAULT_PALETTE
}
```

DanmakuWorld の生成オプション。フィールドの論理サイズ（width / height）は必須。弾がフィールド＋margin の外に出ると自動で消去される。

```ts
const world = new DanmakuWorld({ width: 384, height: 448, bulletCap: 2048 })
```

### CollideResult

```ts
interface CollideResult {
  hit: boolean    // 被弾したか（当たった弾は消去される）
  grazed: number  // この呼び出しで新たにグレイズした数
}
```

DanmakuWorld.collide の戻り値。グレイズは弾ごとに1回だけ数えられ（Bullet.grazed フラグで管理）、被弾した場合はその弾を消去して hit=true を返す。

```ts
const res = world.collide(px, py, 2.5, 26, (b) => playGrazeSe())
if (res.hit) { /* ミス処理 */ }
grazeCount += res.grazed
```

### BulletPool

```ts
class BulletPool {
  constructor(capacity?: number)  // 既定 4096
  spawn(o: SpawnOpts): Bullet | null
  kill(b: Bullet): void
  clear(): void
  get count(): number
  readonly bullets: Bullet[]
  readonly active: Bullet[]  // 有効な弾だけの稠密配列
}
```

弾オブジェクトの事前確保プール。フリーリスト＋稠密アクティブ配列で spawn / kill が O(1) に収まり、実行時のオブジェクト確保を最小化する。上限に達すると spawn は null を返す。通常は DanmakuWorld.spawn 経由で使い、反復処理には active を使う。

```ts
const pool = new BulletPool(4096)
const b = pool.spawn({ x: 100, y: 80, angle: Math.PI / 2, speed: 120, kind: 'orb', color: 0 })
for (const bullet of pool.active) { /* 有効な弾だけ処理 */ }
```

### Bullet

```ts
interface Bullet {
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
}
```

弾1発の状態オブジェクト。生成は SpawnOpts で行い、実体は BulletPool が所有する。凍結ステートマシン（delay による出現待ち→移動→freezeAt で凍結→resume で再始動）、半径成長（grow）、減衰（drag）、サイン揺れ（sway）といった東方系の弾の振る舞いをすべて保持する。_pool / _slot はプール内部用なので触らない。

```ts
// プールから得た弾は読み取り専用のつもりで扱う
const b = world.spawn({ x, y, angle, speed: 100 })
if (b) console.log(b.kind, b.r, b.age)
```

### SpawnOpts

```ts
interface SpawnOpts {
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
}
```

弾生成パラメータ。初速は angle+speed か vx/vy のどちらかで与える。freezeAt / freezeTime / resume を組み合わせると「途中で止まってから自機へ向き直す弾」のような時止め系の挙動が作れる。grow+maxR は膨らむ霧弾、drag は減速、sway は横揺れ。

- `angle / speed`（number）— 初速を角度（rad）と速さ（px/s）で指定。vx/vy 指定時は無視される
- `kind`（BulletKind）— 見た目種別。未指定は 'orb'。判定半径 r の既定値も種別で決まる
- `color / customColor`（number / string）— color はパレット番号。customColor（CSS色）を渡すとそちらが優先され color は -1 になる
- `freezeAt / freezeTime / resume`（number / number / ResumeMode）— 移動開始 freezeAt 秒後に freezeTime 秒間凍結し、resume の方式で再始動する
- `grow / maxR`（number）— 半径の増加量（/秒）と上限。霧弾向け

```ts
// 0.55秒進んで止まり、1.15秒後に自機方向へ再加速する弾（時止め系）
world.spawn({ x, y, angle, speed: 155, kind: 'orb', color: 4,
  freezeAt: 0.55, freezeTime: 1.15, resume: 'aim', resumeSpeed: 100 })
```

### BulletTemplate

```ts
type BulletTemplate = Omit<SpawnOpts, 'x' | 'y'>
```

位置（x / y）を除いた弾パラメータのテンプレート型。Emitter の bullet プロパティや、ringVolley などのボレー関数の共通パラメータとして使う。

```ts
const tpl: BulletTemplate = { speed: 120, kind: 'knife', color: 4 }
ringVolley(world, boss.x, boss.y, 24, tpl)
```

### BulletKind

```ts
type BulletKind =
  | 'orb'      // 丸弾
  | 'big'      // 大玉
  | 'dot'      // 小粒
  | 'bubble'   // 泡弾（半透明）
  | 'ellipse'  // 楕円弾（速度方向を向く）
  | 'knife'    // ナイフ（速度方向を向く）
  | 'talisman' // 札（速度方向を向く）
  | 'star'     // 星弾（自転する）
```

弾の見た目種別。ellipse / knife / talisman は速度方向を向いて描画され、star は spin で自転する。種別ごとに当たり判定半径の既定値が決まる（orb 4 / big 9 / dot 2.5 / bubble 6 / ellipse 4 / knife 4 / talisman 4.5 / star 4.5）。スプライトは SpriteBank が種別×色×サイズで事前描画する。

```ts
world.spawn({ x, y, angle, speed: 200, kind: 'knife', color: 4 })
```

### ResumeMode

```ts
type ResumeMode =
  | 'keep'  // 保存した速度そのまま
  | 'aim'   // 自機方向へ向き直す
  | 'speed' // 保存した方向のまま速度だけ変える
  | 'fall'  // その場から落下する（重力加速）
```

凍結（時止め）した弾が再始動するときの挙動。SpawnOpts.resume で指定する。aim の向き直し先は DanmakuWorld.target（自機位置）、fall の重力は resumeGravity（既定 320）、speed の速さは resumeSpeed で決まる。

```ts
// 凍結後に落下する弾（凍結スペル系）
world.spawn({ x, y, angle, speed: 165, freezeAt: 0.5, freezeTime: 0.85, resume: 'fall', resumeGravity: 330 })
```

### DEFAULT_PALETTE

```ts
const DEFAULT_PALETTE: string[]
// ['#ff5b6a', '#ff9f43', '#ffe066', '#7bed6a', '#4fc3f7', '#b388ff', '#ff7ad9', '#f5f5f5']
```

弾・レーザーの色パレット既定値（8色）。Bullet.color や LaserOpts.color はこの配列のインデックスで色を指定する。WorldOpts.palette や SpriteBank の引数で差し替え可能。パレット外の色は customColor で直接指定する。

```ts
// color: 4 はパレットの水色（#4fc3f7）
world.spawn({ x, y, angle, speed: 100, color: 4 })
// 独自色は customColor で
world.spawn({ x, y, angle, speed: 100, customColor: '#88ffcc' })
```

### LaserPool

```ts
class LaserPool {
  constructor(capacity?: number)  // 既定 32
  spawn(o: LaserOpts): Laser | null
  kill(l: Laser): void
  clear(): void
  update(dt: number): void
  endX(l: Laser): number
  endY(l: Laser): number
  get count(): number
  readonly active: Laser[]
}
```

レーザーのプール。レーザーは「予告（state 0）→照射（1）→消散（2）」の状態を update で自動遷移する。angVel の定速回転、sweepAmp / sweepSpeed による往復の薙ぎ払い、follow コールバックによる発生源追従に対応。当たり判定は DanmakuWorld.collideLasers が線分距離で行う（照射中のみ）。通常は DanmakuWorld.addLaser 経由で使う。

```ts
world.addLaser({ x: boss.x, y: boss.y, angle: Math.PI / 2, width: 30,
  telegraph: 0.9, duration: -1, sweepAmp: 0.85, sweepSpeed: 0.85,
  follow: () => ({ x: boss.x, y: boss.y }) })
```

### LaserOpts / Laser

```ts
interface LaserOpts {
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
interface Laser { /* x, y, angle, state（0:予告 1:照射 2:消散）, age ほか */ }
```

レーザー生成パラメータとレーザー実体。sweepAmp を付けると angle = baseAngle + sin(age * sweepSpeed + sweepPhase) * sweepAmp で往復回転し、angVel とは排他（sweep 優先）。follow を渡すと毎フレーム発生源座標へ追従する。

- `telegraph`（number）— 照射前の予告線を表示する秒数。0 で即照射
- `duration`（number）— 照射を続ける秒数。負数なら無期限で、LaserPool.kill または World.clearLasers で消す
- `sweepAmp / sweepSpeed`（number）— 往復薙ぎ払いの振幅（rad）と速度
- `follow`（() => { x, y }）— 発生源の現在位置を返す関数。ボス追従レーザーに使う

```ts
// 下向きに予告0.7秒→2秒照射する固定レーザー
world.addLaser({ x, y, angle: Math.PI / 2, telegraph: 0.7, duration: 2, width: 22, color: 0 })
```

### distPointSegment

```ts
function distPointSegment(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number
```

点と線分の最短距離を返すユーティリティ。レーザー判定（DanmakuWorld.collideLasers）の基礎になっているもので、自前でレーザー風の判定を作るときにも使える。

- `px, py`（number）— 判定する点（自機位置など）
- `x1, y1, x2, y2`（number）— 線分の両端

```ts
const d = distPointSegment(player.x, player.y, lx, ly, laserEndX, laserEndY)
if (d < laserWidth / 2 + hitR) { /* 被弾 */ }
```

### SpriteBank

```ts
class SpriteBank {
  constructor(palette?: string[], factory?: CanvasFactory)
  colorOf(b: Bullet): string
  get(b: Bullet): SpriteEntry | null
  clear(): void
  readonly palette: string[]
  readonly ss: number  // スーパーサンプリング倍率（2）
}
```

弾スプライトの事前描画バンク。「種別×色×サイズ」をキーにオフスクリーンCanvasへ描いてキャッシュし、DanmakuWorld.render が drawImage で blit する。描画のホットループで影やグラデーションを毎回計算しないための仕組み。Canvas が作れない環境（Nodeなど）では get が null を返し、エンジンは単純な円描画にフォールバックする。DanmakuWorld が内部に保持しているので、通常は直接触らない。

```ts
// 独自パレットでワールドを作ると内部の SpriteBank にも反映される
const world = new DanmakuWorld({ width: 384, height: 448, palette: ['#ff0000', '#00ff00'] })
world.sprites.clear()  // スプライトキャッシュを捨てる
```

### CanvasFactory

```ts
type CanvasFactory = (w: number, h: number) => HTMLCanvasElement
```

SpriteBank がスプライト用オフスクリーンCanvasを作るための生成関数型。未指定なら document.createElement('canvas') を使う。OffscreenCanvas を使いたい場合や、テスト・ベンチ環境で差し替えたい場合に渡す。

```ts
const bank = new SpriteBank(undefined, (w, h) => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
})
```

### ringVolley

```ts
function ringVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number, o: BulletTemplate & { angle?: number },
): number
```

全方位リングを1回撃つボレー部品。o.angle を基点に count 発を等間隔で円形に配置する。戻り値は実際に生成できた弾数（プール上限で欠ける場合がある）。

- `count`（number）— リングの弾数
- `o.angle`（number）— リングの回転オフセット（rad）。省略時は 0

```ts
ringVolley(world, boss.x, boss.y, 28, { speed: 110, kind: 'orb', color: 5 })
```

### fanVolley

```ts
function fanVolley(
  w: DanmakuWorld, x: number, y: number,
  center: number, count: number, spread: number, o: BulletTemplate,
): number
```

扇状に1回撃つボレー部品。中心角 center を軸に spread（rad）の広がりへ count 発を均等配置する。count が1のときは center 方向へ1発。戻り値は生成できた弾数。

- `center`（number）— 扇の中心角（rad）
- `spread`（number）— 扇の広がり（rad）

```ts
fanVolley(world, boss.x, boss.y, Math.PI / 2, 5, 0.6, { speed: 150, kind: 'orb', color: 1 })
```

### aimedVolley

```ts
function aimedVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number, spread: number, o: BulletTemplate,
): number
```

world.target（自機位置）方向を中心にした n-way 狙い撃ちボレー。内部では発射点から target への角度を計算して fanVolley を呼ぶ。使う前に world.target へ自機位置を入れておくこと。

```ts
aimedVolley(world, enemy.x, enemy.y, 3, 0.18, { speed: 170, kind: 'orb', color: 0 })
```

### scatterVolley

```ts
function scatterVolley(
  w: DanmakuWorld, x: number, y: number,
  count: number,
  o: BulletTemplate & { angleMin?: number; angleMax?: number; speedMin?: number; speedMax?: number },
): number
```

ランダム散布ボレー。角度範囲（既定は全方位）と速度範囲（既定は speed の 0.7〜1.3倍）から world.rng でランダムに count 発を撃つ。霧弾や爆発の破片のような、ばらつきのある発射に使う。

```ts
scatterVolley(world, x, y, 12, { kind: 'bubble', color: 5, angleMin: 0, angleMax: Math.PI, speedMin: 30, speedMax: 70 })
```

### Emitter（基底クラス）

```ts
abstract class Emitter {
  interval: number        // 射撃間隔（秒）、既定 0.1
  delay: number           // 開始までの遅延（秒）
  duration: number        // 稼働時間（秒、負数で無期限）
  bullet: BulletTemplate  // 弾テンプレート
  elapsed: number
  active: boolean
  update(dt: number, w: DanmakuWorld, x: number, y: number): void
  protected abstract fire(w: DanmakuWorld, x: number, y: number): void
}
```

継続射撃部品の抽象基底クラス。DanmakuWorld.addEmitter で登録すると、発射点の座標を受け取りながら interval ごとに fire が呼ばれる。duration を過ぎると active=false になり、ワールド側が自動で登録を外す。独自の発射パターンはこのクラスを継承し fire を実装して作る。

```ts
class CrossEmitter extends Emitter {
  fire(w: DanmakuWorld, x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      w.spawn({ ...this.bullet, x, y, angle: (i / 4) * Math.PI * 2 })
    }
  }
}
const e = new CrossEmitter()
e.interval = 0.4
e.bullet = { speed: 100, kind: 'orb', color: 2 }
world.addEmitter(e, () => ({ x: boss.x, y: boss.y }))
```

### RingEmitter

```ts
class RingEmitter extends Emitter {
  count: number    // 既定 16
  angle: number    // 現在の基点角
  angleVel: number // 1射撃ごとの角度オフセット増分 rad
}
```

全方位リングを繰り返し撃つ Emitter。angleVel を付けると1射撃ごとにリングが少しずつ回転し、花弁のような模様になる。

```ts
const e = new RingEmitter()
e.count = 20; e.interval = 0.28; e.angleVel = 0.13
e.bullet = { speed: 95, kind: 'orb', color: 3 }
world.addEmitter(e, bossPos)
```

### FanEmitter

```ts
class FanEmitter extends Emitter {
  count: number    // 既定 5
  spread: number   // 既定 0.6 rad
  angle: number    // 既定 PI/2（下向き）
  aim: boolean     // true で自機方向を中心にする
  angleVel: number // 中心角の増分 /射撃
}
```

扇状の n-way を繰り返し撃つ Emitter。aim=true で中心が world.target（自機）方向になる。angleVel で扇の向き自体を回していける。

```ts
const e = new FanEmitter()
e.count = 5; e.spread = 0.55; e.aim = true; e.interval = 0.5
e.bullet = { speed: 150, kind: 'orb', color: 1 }
world.addEmitter(e, bossPos)
```

### AimedEmitter

```ts
class AimedEmitter extends Emitter {
  count: number   // 既定 1
  spread: number  // 既定 0.18 rad
}
```

自機方向への n-way 狙い撃ちを繰り返す Emitter。count=1 で単発狙撃、count を増やすと扇状の狙撃になる。toho-engine の PhaseTemplates（mist の狙撃部など）でも使われている。

```ts
const e = new AimedEmitter()
e.count = 3; e.spread = 0.16; e.interval = 1.1
e.bullet = { speed: 165, kind: 'orb', color: 0 }
world.addEmitter(e, bossPos)
```

### SpiralEmitter

```ts
class SpiralEmitter extends Emitter {
  arms: number        // 腕の本数、既定 2
  angle: number       // 現在の発射角
  angleVel: number    // 発射角の回転速度 rad/s、既定 2.2
  alternate: boolean  // 腕ごとに回転方向を反転する
}
```

発射角が回り続ける多腕スパイラル Emitter。arms 本の腕が等間隔に弾を出し、渦巻き模様を作る。alternate=true で奇数腕の角度符号を反転させ、逆巻きの渦を混ぜられる。

```ts
const e = new SpiralEmitter()
e.arms = 3; e.angleVel = 2.4; e.interval = 0.07
e.bullet = { speed: 105, kind: 'orb', color: 6 }
world.addEmitter(e, bossPos)
```

### ScatterEmitter

```ts
class ScatterEmitter extends Emitter {
  count: number     // 1射撃の発数、既定 6
  angleMin: number  // 既定 0
  angleMax: number  // 既定 2*PI
  speedMin: number  // 0 でテンプレート準拠
  speedMax: number  // 0 でテンプレート準拠
}
```

ランダム散布を繰り返す Emitter。内部で scatterVolley を使う。霧弾（bubble＋grow）や破片のような、方向と速さにばらつきのある発射向け。

```ts
const e = new ScatterEmitter()
e.count = 3; e.interval = 0.42
e.bullet = { speed: 38, kind: 'bubble', color: 5, r: 5, grow: 7.5, maxR: 17, drag: 0.22 }
world.addEmitter(e, bossPos)
```

### StreamEmitter

```ts
class StreamEmitter extends Emitter {
  angle: number   // 既定 PI/2
  aim: boolean    // 既定 true（自機方向）
  zigzag: number  // 交互に左右へずらす量 rad
}
```

単発を一定間隔で撃ち続ける直線ストリーム Emitter。aim=true（既定）で常に自機方向へ撃つ。zigzag を付けると発射角が左右交互にずれて蛇行する流れになる。

```ts
const e = new StreamEmitter()
e.interval = 0.16; e.zigzag = 0.12
e.bullet = { speed: 190, kind: 'ellipse', color: 4 }
world.addEmitter(e, bossPos)
```

### WaveEmitter

```ts
class WaveEmitter extends Emitter {
  baseAngle: number  // 既定 PI/2
  aim: boolean       // true で自機方向を基準にする
  amp: number        // 振幅 rad、既定 0.5
  freq: number       // 周波数 Hz、既定 1.6
}
```

発射角がサイン波で左右に揺れるストリーム Emitter。基準角＋sin(時刻 * freq * 2π) * amp で角度が決まる。波状にうねる弾の流れを作る。

```ts
const e = new WaveEmitter()
e.amp = 0.55; e.freq = 1.2; e.interval = 0.09
e.bullet = { speed: 130, kind: 'orb', color: 2 }
world.addEmitter(e, bossPos)
```

### VortexEmitter

```ts
class VortexEmitter extends Emitter {
  radius: number   // 発射点の円半径、既定 46
  rotVel: number   // 発射点の回転速度 rad/s、既定 1.8
  mode: 'in' | 'out' | 'tangent'  // 発射方向、既定 'tangent'
  angle: number    // 現在の発射点角度
}
```

発射点そのものが中心の周りを回る渦巻き Emitter。円周上の点から、mode に応じて中心方向（in）／外向き（out）／接線方向（tangent）へ撃つ。

```ts
const e = new VortexEmitter()
e.radius = 60; e.rotVel = 2.0; e.mode = 'tangent'; e.interval = 0.08
e.bullet = { speed: 90, kind: 'star', color: 3, spin: 3 }
world.addEmitter(e, bossPos)
```

### Timeline

```ts
type TimelineFn = (w: DanmakuWorld) => void

class Timeline {
  t: number
  at(time: number, fn: TimelineFn): this
  after(delay: number, fn: TimelineFn): this
  every(interval: number, fn: TimelineFn, count?: number): this  // count 負数で無限
  update(dt: number, w: DanmakuWorld): void
  clear(): void
  get pending(): number
}
```

絶対時刻イベント＋繰り返し実行を並べる簡易タイムライン。at で時刻指定、after で現在時刻からの相対指定、every で周期実行を登録する。DanmakuWorld が timeline を1つ保持し、world.update の中で駆動されるため、道中の出現スケジュールなどをデータ的に書ける。

```ts
world.timeline
  .at(2, (w) => ringVolley(w, 192, 60, 24, { speed: 100, color: 0 }))
  .every(1.5, (w) => aimedVolley(w, boss.x, boss.y, 3, 0.18, { speed: 160, color: 4 }), 6)
```

### ScriptRunner

```ts
type ScriptStep = { wait: number } | { do: TimelineFn }

class ScriptRunner {
  constructor(steps: ScriptStep[])
  reset(): void
  update(dt: number, w: DanmakuWorld): void
  finished: boolean
}
```

wait（秒数）と do（処理）を並べたステップ列を順に実行するスクリプトランナー。Timeline が「時刻で並列」に強いのに対し、こちらは「前の処理が終わってから次へ」という逐次演出（会話前後の間合い、段階的な攻撃展開など）に向く。update を毎フレーム呼ぶと内部で進行し、終わると finished=true になる。

```ts
const script = new ScriptRunner([
  { do: (w) => ringVolley(w, x, y, 20, { speed: 90, color: 1 }) },
  { wait: 1.2 },
  { do: (w) => aimedVolley(w, x, y, 5, 0.3, { speed: 150, color: 0 }) },
])
// 毎フレーム
script.update(1 / 60, world)
```

### FixedLoop

```ts
interface FixedLoopOpts {
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
}
```

論理更新を固定タイムステップに分離するループ。requestAnimationFrame の timestamp を frame に渡すと、蓄積した実時間ぶんだけ update(step) を繰り返し、render(alpha) を呼ぶ。デルタは maxFrame でクランプし、maxSteps を超える遅延は捨てることで処理落ち時のスパイラル（遅延の雪だるま）を防ぐ。端末の表示リフレッシュレートに依存せず弾幕の挙動が一定になる。

```ts
const loop = new FixedLoop({
  update: (dt) => world.update(dt),
  render: () => world.render(ctx),
})
const tick = (now: number) => { loop.frame(now); requestAnimationFrame(tick) }
requestAnimationFrame(tick)
```

### FpsMeter

```ts
class FpsMeter {
  fps: number     // 直近の実測fps（0.5秒窓）
  frameMs: number // フレーム時間の指数移動平均 ms
  sample(dtMs: number): void
}
```

FPS計測器。sample にフレーム時間（ms）を渡し続けると、0.5秒窓の実測 fps と、フレーム時間の指数移動平均 frameMs を更新する。FixedLoop が内蔵しており、loop.fps / loop.frameMs でも読める。デバッグ表示や負荷計測用。

```ts
const meter = new FpsMeter()
// 毎フレーム
meter.sample(frameDeltaMs)
console.log(meter.fps, meter.frameMs)
```

---

## toho-engine

### GameState

```ts
interface GameStateOpts {
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
}
```

東方系STGの共通システム（スコア・残機・ボム・パワー・グレイズ）をまとめた状態クラス。addScore はエクステンド（スコア残機アップ）の判定も行い、到達したら残機を増やして true を返す。miss() は残機を減らしボムを初期値へ戻し、残機が尽きたら true。パワーは小数で保持し、整数部がショット段階（powerTier）になる。

```ts
const state = new GameState()
if (state.addScore(10000)) playExtendSe()
state.addGraze(res.grazed)
if (playerHit) {
  state.powerDown(1)
  if (state.miss()) gameOver()
}
```

### ItemPool

```ts
type ItemKind = 'power' | 'point' | 'life' | 'bomb' | 'fullpower'

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
}
```

ドロップアイテム（P／点／残機／ボム／フルパワー）のプール。アイテムは跳ね上がってから落下し、自機が magnetR 内に入ると吸着、collectR 内で回収されて onCollect が呼ばれる。attractAll=true（自機が画面上部の回収ラインへ入ったとき等）にすると全アイテムが吸着し、回収情報の fullValue が true になる（点アイテム満額の判定用）。描画は種別色の小さいチップ＋文字。

```ts
const items = new ItemPool()
items.spawn('power', enemy.x, enemy.y)
// 毎フレーム
items.update(dt, player.x, player.y, {
  height: 448,
  attractAll: player.y < 96,
  onCollect: (info) => applyItemEffect(state, info),
})
items.render(ctx)
```

### applyItemEffect

```ts
function applyItemEffect(
  state: GameState, info: ItemCollectInfo,
  scoreMul?: number,  // 既定 1
): void
```

アイテム回収効果を GameState へ適用する標準処理。power はパワー+0.25（満タン時は 5000点）、fullpower はパワー最大化、point は満額回収で 10000 点・通常 3000 点、life は残機+1、bomb はボム+1。点数には scoreMul が掛かる。独自の点数体系にしたい場合は ItemPool の onCollect で自前処理に差し替える。

- `state`（GameState）— 効果の適用先
- `info`（ItemCollectInfo）— ItemPool.update の onCollect で渡される回収情報
- `scoreMul`（number）— 得点倍率（難易度補正など）

```ts
onCollect: (info) => applyItemEffect(state, info)
```

### EnemyPool / EnemyDef

```ts
type EnemyMoveKind = 'down' | 'side' | 'sine' | 'hover' | 'dart'

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
}
```

編隊ザコ敵のプールと定義。移動パターンは down（直進落下）/ side（横移動）/ sine（波形）/ hover（stopY で停止→stayTime 後に退場）/ dart（斜め突進）の5種を内蔵し、射撃は fireInterval 間隔で fire コールバックが呼ばれる（world と敵自身を受け取るので aimedVolley 等をそのまま使える）。撃破判定は damage が行い、ドロップやスコア付与は呼び出し側が drop / score を見て行う。描画はゲーム側（sprite 識別子で対応）。

```ts
const fairy: EnemyDef = {
  hp: 6, radius: 12, score: 300, move: 'sine', speed: 74,
  fireInterval: 2.2,
  fire: (w, e) => aimedVolley(w, e.x, e.y, 1, 0, { speed: 130, color: 4 }),
  drop: ['power'], sprite: 'fairy',
}
enemies.spawn(fairy, 100, -26)
enemies.update(dt, world, { width: 384, height: 448 })
```

### PlayerCharaDef

```ts
type PlayerBulletKind = 'orb' | 'talisman' | 'missile' | 'laser'

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
}
```

自機キャラクターの差し替え可能な定義。移動速度・判定・ショット間隔と、パワー段階（0〜4）と集中状態に応じたショット構成を返す shots 関数、ボム定義を持つ。新しい自機はこの型のオブジェクトを1つ書けば追加できる。サンプルとして REIMU_DEF（広角＋誘導札）と MARISA_DEF（前方集中＋ミサイル）が用意されている。

```ts
const MY_CHARA: PlayerCharaDef = {
  id: 'my', name: 'マイキャラ',
  speed: 270, focusSpeed: 120, hitR: 2.5, grazeR: 26,
  shotInterval: 0.08,
  bomb: { name: '秘法「サンプルボム」', duration: 3, dps: 300, scope: 'full' },
  shots: (tier, focused) => [
    { dx: 0, dy: -10, angle: -Math.PI / 2, speed: 640, dmg: 9, kind: 'orb' },
  ],
}
```

### REIMU_DEF

```ts
const REIMU_DEF: PlayerCharaDef
// id: 'reimu', name: '博麗霊夢'
// speed 268 / focusSpeed 118 / hitR 2.5 / grazeR 26 / shotInterval 0.075
// bomb: 霊符「夢想封印」（全画面、3.2秒、dps 260）
```

霊夢タイプの自機定義サンプル。広角ショット＋パワー段階2から誘導札（talisman、homing）が加わる構成。集中（低速）で広がりが狭まる。PlayerCharaDef の実装例としてそのまま使える。

```ts
const player = new Player(REIMU_DEF, 192, 380)
```

### MARISA_DEF

```ts
const MARISA_DEF: PlayerCharaDef
// id: 'marisa', name: '霧雨魔理沙'
// speed 292 / focusSpeed 132 / hitR 2.5 / grazeR 26 / shotInterval 0.07
// bomb: 恋符「マスタースパーク」（前方、2.6秒、dps 340）
```

魔理沙タイプの自機定義サンプル。前方集中のレーザー状ショット＋パワー段階2から弱誘導ミサイル。霊夢より移動速度と火力が高く、広がりがない。

```ts
const player = new Player(MARISA_DEF, 192, 380)
```

### Player

```ts
interface PlayerInput {
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
}
```

自機本体。PlayerCharaDef に従って移動（フィールド境界でクランプ）と射撃タイミングを管理し、撃つ瞬間に onShots へ ShotSpawn 列を渡す（実際の弾生成は PlayerBulletPool.spawn へ回す）。startBomb はボム効果と無敵を開始する（GameState 側のボム消費は呼び出し側で先に行う）。respawn は無敵3秒で復活させる。被弾判定そのものは DanmakuWorld.collide 側で行い、結果に応じて dead や respawn をゲーム側が操作する。

```ts
player.update(dt, { mx, my, focus, shot }, { width: 384, height: 448 },
  state.powerTier, (shots) => {
    for (const s of shots) bullets.spawn(player.x, player.y, s)
  })
```

### PlayerBulletPool

```ts
class PlayerBulletPool {
  constructor(capacity?: number)  // 既定 320
  spawn(x: number, y: number, s: ShotSpawn): PlayerBullet | null
  update(dt: number, bounds: { width: number; height: number },
    findTarget: (x: number, y: number) => { x: number; y: number } | null,
    hitTest: (x: number, y: number, dmg: number) => boolean): void
  render(ctx: CanvasRenderingContext2D): void
  clear(): void
  get count(): number
}
```

自機弾のプール。ShotSpawn を受けて生成し、update で移動・誘導（homing の旋回）・命中処理を行う。誘導先は findTarget コールバック、命中は hitTest コールバック（命中して消費されたら true を返す）でゲーム側と接続する。描画は kind ごとに内蔵（laser は縦長の光条、talisman は札、missile は光球、orb は楕円弾）。

```ts
bullets.update(dt, { width: 384, height: 448 },
  (x, y) => nearestEnemyPos(x, y),
  (x, y, dmg) => damageEnemiesAt(x, y, dmg))
```

### BossController

```ts
interface BossControllerOpts {
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
}
```

ボス戦の制御クラス。BossDef のフェイズ列を順に実行し、HP・制限時間・移動パターン・テンプレート／カスタム処理の駆動、フェイズ終了時の Emitter／レーザー自動撤収と全弾消去を担う。スペル取得判定（ノーミス・ノーボムで撃破したら captured）も管理するので、スペル中に被弾したら notifyMiss、ボムを使ったら notifyBomb を呼ぶ。フェイズ遷移は onPhaseStart / onPhaseEnd、撃破は onDefeat で通知される。自機弾の命中は damage（本体）または hitBody（分身体）へ渡す。

```ts
const boss = new BossController({ width: 384, height: 448 })
boss.onPhaseEnd = (r) => { if (r.captured) state.addScore(r.bonus) }
boss.onDefeat = () => onBossDown()
boss.start(RUMIA_BOSS, world, player, 192, 96)
// 毎フレーム
boss.update(dt)
// スペル中の被弾・ボムを記録
boss.notifyMiss(); boss.notifyBomb()
```

### BossDef

```ts
interface BossDef {
  id: string
  name: string
  epithet?: string  // 二つ名
  radius: number    // 当たり判定半径
  figure?: FigureDef  // キャラ描画用フィギュア定義（任意）
  phases: BossPhaseDef[]
}
```

ボス1体の定義。名前・二つ名・判定半径・描画用 FigureDef と、通常攻撃とスペルカードを並べたフェイズ列を持つ。BossController.start に渡して戦闘を開始する。中ボスも「フェイズ1つだけの BossDef」として同じ仕組みで扱える。

```ts
const RUMIA_BOSS: BossDef = {
  id: 'rumia', name: 'ルーミア', radius: 20, figure: RUMIA_FIGURE,
  phases: [ /* 通常攻撃 → スペル… の BossPhaseDef 列 */ ],
}
```

### BossPhaseDef

```ts
type BossMoveKind = 'still' | 'hover' | 'sine' | 'chase' | 'teleport' | 'drift'

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
}
```

ボスのフェイズ（通常攻撃1つ、またはスペルカード1枚）の定義。移動は still（静止）/ hover（ふわりと揺れる）/ sine（横移動）/ chase（自機の x を追う）/ teleport（params.interval 秒ごとに瞬間移動）/ drift（ランダムな目標点へ漂う）から選べる。攻撃は template（仕掛けテンプレート＋params）か、setup / update / teardown のカスタム処理で書く。制限時間を過ぎるとタイムアウトとして次フェイズへ進む。

- `name`（string | null）— スペル名。通常攻撃フェイズは null
- `template / params`（PhaseTemplateId / Record<string, number>）— 仕掛けテンプレートを使う場合の指定とパラメータ
- `setup / update / teardown`（(ctx: BossContext) => void）— カスタム攻撃処理。update は毎フレーム呼ばれる

```ts
{
  name: '夜符「ミッドナイトバード」', hp: 900, timeLimit: 45,
  move: 'sine', moveRange: 70,
  setup: (ctx) => { const e = new SpiralEmitter(); e.arms = 2
    e.bullet = { speed: 100, kind: 'ellipse', color: 4 }; ctx.addEmitter(e) },
}
```

### BossContext

```ts
interface DiffScale { spd: number; den: number }  // 弾速倍率・弾数倍率

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
}
```

フェイズの setup / update / teardown と PhaseTemplates に渡される攻撃用コンテキスト。ring / fan / aimed は難易度倍率（弾速・弾数）を自動で適用する簡易発射ヘルパー。addEmitter / addLaser で登録したものはフェイズ終了時に自動で撤収される。setBodies で分身などの当たり判定体を差し替え、setRealOnlyDamage(true) の間は本物以外へのダメージが無効になる。

```ts
update: (ctx, dt) => {
  // 難易度倍率つきの狙い撃ち
  ctx.aimed(3, 0.16, { speed: 150, kind: 'orb', color: 0 })
}
```

### calcSpellBonus / PhaseEndResult

```ts
function calcSpellBonus(phase: BossPhaseDef, timeLeft: number): number
// = bonusBase（既定 500000）+ bonusPerSec（既定 20000）× 残り時間

interface PhaseEndResult {
  index: number
  phase: BossPhaseDef
  captured: boolean  // ノーミス・ノーボムで取得したか
  bonus: number      // 取得時のスペルカードボーナス
  timeout: boolean   // 制限時間切れで終わったか
  last: boolean      // 最終フェイズだったか
}
```

スペルカードボーナスの計算式と、BossController.onPhaseEnd で渡されるフェイズ終了結果。ボーナスは「基礎値＋残り時間×秒単価」で、取得（captured）したときだけ bonus に値が入る。

```ts
boss.onPhaseEnd = (r) => {
  if (r.captured) state.addScore(r.bonus)
  if (r.last) stageClear()
}
```

### PhaseTemplates

```ts
type PhaseTemplateId = 'timestop' | 'freeze' | 'clones' | 'laserSweep' | 'mist'

type PhaseTemplateFactory = (
  ctx: BossContext, params: Record<string, number>,
) => PhaseTemplateInstance

const PhaseTemplates: Record<PhaseTemplateId, PhaseTemplateFactory>
```

実在スペルカードの「仕掛け」を、スペル名ではなく仕掛け名で再利用できるようにしたテンプレート群。BossPhaseDef.template に ID を、params に数値を渡して使う。各テンプレートの主な params（既定値）：

- **timestop**（interval 1.7 / count 26 / speed 155 / travel 0.55 / freeze 1.15 / resumeSpeed 100 / color 4）— 撃った弾が途中で止まり一斉に自機へ再加速
- **freeze**（interval 2.3 / count 34 / speed 165 / freezeAt 0.5 / freezeTime 0.85 / gravity 330 / layers 2 / color 4）— 広がった弾が一時停止して落下再始動
- **clones**（count 4 / radius 76 / fireInterval 0.16 / bulletSpeed 108 / shuffle 5 / orbitSpeed 0.45 / color 6 / realOnlyDamage 0）— 複数体に分かれて周回し、本物が周期的に入れ替わる
- **laserSweep**（count 1 / sweepAngle 0.85 / sweepSpeed 0.85 / width 30 / telegraph 0.9 / ringInterval 2.8 / ringCount 16 / ringSpeed 82 / color 0）— 予告つき回転レーザーの往復薙ぎ払い＋リング弾
- **mist**（interval 0.42 / count 3 / speed 38 / grow 7.5 / maxR 17 / color 5 / aimedInterval 1.35 / aimedSpeed 74）— 漂いながら膨らむ泡弾＋狙撃

- `template`（PhaseTemplateId）— BossPhaseDef.template に指定する仕掛け ID
- `params`（Record<string, number>）— 弾数・速度・間隔などの調整値。省略したキーはテンプレートの既定値になる

```ts
{
  name: '時符「ルナクロック」', hp: 1000, timeLimit: 50,
  template: 'timestop',
  params: { interval: 1.6, count: 30, speed: 160, freeze: 1.2 },
}
```

### StageScript / StageEventDef

```ts
interface DialogueLine {
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
}
```

ステージ1本分のデータ駆動脚本フォーマット。時刻 at（秒）に発火するイベント列で、編隊出現（formation）・中ボス／ボス（midboss / boss）・背景変更・会話・アイテムドロップ・メッセージ・任意処理（call）を並べる。実行は StageRunner が担当する。

```ts
const STAGE1: StageScript = {
  id: 'stage1', title: '第1面', bg: 'lake',
  events: [
    { at: 1, type: 'formation', formation: { enemy: fairy, count: 5, interval: 0.5, from: 'top', x: 120 } },
    { at: 20, type: 'midboss', boss: RUMIA_MID },
    { at: 40, type: 'boss', boss: RUMIA_BOSS },
  ],
}
```

### StageRunner / StageApi

```ts
interface StageApi {
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
}
```

StageScript を時間軸で実行するランナー。編隊イベントは個別の出現予約に展開され、時刻が来たものから StageApi 経由でゲームシェル側へ通知される。ボス戦や会話の間は setPaused(true) で時計を止める運用を想定している。ゲーム側は StageApi（敵出現・ボス開始・背景・会話・ドロップ・メッセージ）を実装するだけでよい。

```ts
const runner = new StageRunner(STAGE1, {
  spawnEnemy: (def, x, y, dir) => enemies.spawn(def, x, y, dir),
  startBoss: (def, mid) => startBossFight(def, mid),
  setBackground: (bg) => { currentBg = bg },
  dialogue: (lines) => showDialogue(lines),
  dropItem: (kind, x, y) => items.spawn(kind, x, y),
  message: (text) => showMessage(text),
}, { width: 384, height: 448 })
// ボス戦中は止める
runner.setPaused(boss.active)
runner.update(dt)
```

### drawFigure / FigureDef

```ts
interface FigurePalette {
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
): void
```

キャラを Canvas ベクターで描くイラスト調フィギュア描画。原点はキャラ中心、素の大きさは約 幅54×高さ46。オーラ→翼→後ろ髪→ドレス→顔→前髪→小物の順にレイヤー描画し、髪の揺れや翼のはためきは opts.t（アニメーション時刻）で動く。配色・髪型・小物・翼種を FigureDef のパラメータで差し替える設計で、原作素材は使わず公式デザインの配色・衣装を参考にした自前描画。新キャラは FigureDef を1つ書けば追加できる。

- `def`（FigureDef）— パレット・髪型・小物・翼種の定義
- `opts.t`（number）— アニメーション時刻。髪と翼の揺れに使う
- `opts.scale / flip / alpha`（number / boolean / number）— 拡縮、左右反転、不透明度

```ts
// プリセットを使って描く
drawFigure(ctx, RUMIA_FIGURE, boss.x, boss.y, { t: time, scale: 1.4 })
// 独自キャラを定義して描く
const MY_FIGURE: FigureDef = {
  palette: { skin: '#ffe7d6', skinShade: '#f2c9a4', hair: '#88ccff', hairShade: '#5599dd',
    eye: '#3344cc', dress: '#4455aa', dressShade: '#2c3870', sub: '#ffffff', accent: '#ffcc44' },
  hairStyle: 'twin', accessory: 'ribbon', wings: 'feather',
}
drawFigure(ctx, MY_FIGURE, x, y, { t: time })
```

### キャラプリセット（Figure）

```ts
const RUMIA_FIGURE: FigureDef    // 金髪・赤目・黒ドレス＋白ブラウス・赤リボン・闇オーラ
function drawRumia(ctx: CanvasRenderingContext2D, x: number, y: number, t?: number, scale?: number): void
const REIMU_FIGURE: FigureDef    // 紅白・大きなリボン・ロングヘア
const MARISA_FIGURE: FigureDef   // 金髪・黒衣・とんがり帽子
const FLANDRE_FIGURE: FigureDef  // 金髪・赤系ドレス・宝石の翼（crystal）
const REMILIA_FIGURE: FigureDef  // 銀青髪・ピンクドレス・蝙蝠翼（bat）
const CIRNO_FIGURE: FigureDef    // 水色髪ツインテール・青ドレス・氷の翼（ice）
```

drawFigure 用のキャラ別 FigureDef プリセット。ルーミア／霊夢／魔理沙／フランドール／レミリア／チルノの6体分が、公式デザインの配色・衣装・小物を参考にしたパラメータで用意されている。drawRumia は RUMIA_FIGURE で drawFigure を呼ぶショートカット。BossDef.figure に渡せばボス描画に使える。

```ts
drawRumia(ctx, boss.x, boss.y, time, 1.4)
// 他キャラは drawFigure ＋ プリセットで
drawFigure(ctx, FLANDRE_FIGURE, x, y, { t: time, scale: 1.4 })
```

---

## errorDialog

### showErrorDialog

```ts
function showErrorDialog(title: string, message: string, detail?: string): void

interface ErrorDialogRequest {
  title: string
  message: string
  detail?: string
}

const ERROR_DIALOG_EVENT = 'webx-error-dialog'
```

テーマ別デザインのエラーウインドウをポップアップ表示する API。呼ぶと webx-error-dialog カスタムイベントが発火し、シェル常駐の ErrorDialogHost が現在の UI モード／テーマに応じた見た目で表示する。複数回呼ぶとキューに入り、1つずつ順に表示される。lib・コンポーネント・ターミナルなど、どこからでも呼べる。天気・為替など外部 API の取得失敗時の表示に使われている。

- `title`（string）— ウインドウのタイトル（例：「天気を取得できませんでした」）
- `message`（string）— 本文のエラーメッセージ
- `detail`（string）— 任意の詳細情報。全スタイル共通で本文下に小さな等幅フォントで表示される

```ts
import { showErrorDialog } from '../lib/errorDialog'

try {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  // …取得成功時の処理
} catch (e) {
  showErrorDialog('天気を取得できませんでした',
    '通信に失敗しました。ネットワーク接続を確認してください。',
    e instanceof Error ? e.message : String(e))
}
```

### errorDialogStyle

```ts
type ErrorDialogStyle = 'android' | 'ios' | 'windows' | 'macos'

function errorDialogStyle(ui: string, theme: string): ErrorDialogStyle
```

現在の UI モード（App の resolvedUi）とテーマ ID から、エラーウインドウの見た目を決める関数。対応は mxui-classic → 'android'（Android の Material ダイアログ風）、mxui-liquid → 'ios'（iOS アラート風）、dxui → テーマが macos / ipados なら 'macos'（macOS アラート風）、それ以外は 'windows'（Windows ダイアログ風）。判定できない場合は 'windows' にフォールバックする。通常は ErrorDialogHost が内部で使うため、アプリ側が直接呼ぶ必要はない。

- `ui`（string）— 解決済み UI モード（'dxui' | 'mxui-classic' | 'mxui-liquid'）
- `theme`（string）— テーマ ID（ykr-theme）。macos / ipados のときだけ Mac 風になる

```ts
const style = errorDialogStyle('dxui', 'macos')  // 'macos'
const style2 = errorDialogStyle('mxui-liquid', 'dark')  // 'ios'
```
