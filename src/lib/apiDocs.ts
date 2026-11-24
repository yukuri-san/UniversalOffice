/* apiDocs.ts
 * WebX の新規ライブラリ（danmaku-engine / toho-engine / errorDialog）の
 * 公開APIリファレンスを構造化データとして保持する。
 * 開発者アプリの「APIリファレンス」タブがこれを検索・表示し、
 * ルートの API.md は同内容の Markdown 版。
 */

export type ApiDocCategory = 'danmaku-engine' | 'toho-engine' | 'errorDialog'

export interface ApiDocParam {
  name: string
  type: string
  desc: string
}

export interface ApiDocEntry {
  id: string
  name: string
  category: ApiDocCategory
  /** 型つきシグネチャ文字列 */
  signature: string
  /** 日本語の要約 */
  summary: string
  params?: ApiDocParam[]
  /** 短い使用例コード */
  example: string
  /** 検索用キーワード（スペース区切り） */
  keywords: string
}

export const API_DOC_CATEGORIES: { id: ApiDocCategory; label: string }[] = [
  { id: 'danmaku-engine', label: 'danmaku-engine（汎用弾幕）' },
  { id: 'toho-engine', label: 'toho-engine（東方系レイヤー）' },
  { id: 'errorDialog', label: 'errorDialog（エラーウインドウ）' },
]

export const API_DOCS: ApiDocEntry[] = [
  // ==========================================================
  // danmaku-engine
  // ==========================================================
  {
    id: 'danmaku-world',
    name: 'DanmakuWorld',
    category: 'danmaku-engine',
    signature:
      'class DanmakuWorld {\n' +
      '  constructor(opts: WorldOpts)\n' +
      '  spawn(o: SpawnOpts): Bullet | null\n' +
      '  addLaser(o: LaserOpts): Laser | null\n' +
      '  addEmitter(e: Emitter, pos?: { x: number; y: number } | (() => { x: number; y: number })): EmitterEntry\n' +
      '  removeEmitter(entry: EmitterEntry): void\n' +
      '  clearEmitters(): void\n' +
      '  clearBullets(convert?: (b: Bullet) => void): void\n' +
      '  clearLasers(): void\n' +
      '  update(dt: number): void\n' +
      '  collide(px: number, py: number, hitR: number, grazeR: number, onGraze?: (b: Bullet) => void, onHit?: (b: Bullet) => void): CollideResult\n' +
      '  collideLasers(px: number, py: number, hitR: number): boolean\n' +
      '  render(ctx: CanvasRenderingContext2D, bank?: SpriteBank): void\n' +
      '  readonly pool: BulletPool\n' +
      '  readonly lasers: LaserPool\n' +
      '  readonly timeline: Timeline\n' +
      '  readonly sprites: SpriteBank\n' +
      '  readonly target: { x: number; y: number }\n' +
      '  rng: () => number\n' +
      '  time: number\n' +
      '  get bulletCount(): number\n' +
      '  get laserCount(): number\n' +
      '  get emitterCount(): number\n' +
      '}',
    summary:
      '弾・レーザー・Emitter・タイムラインを統合した弾幕エンジンの中核クラス。update(dt) で論理更新（タイムライン→Emitter→弾→レーザーの順）、render(ctx) で描画、collide / collideLasers で自機との当たり判定を行う。target に自機位置を毎フレーム入れておくと、狙い撃ち（aimedVolley / AimedEmitter）と凍結弾の resume: \'aim\' の基準点になる。clearBullets の convert にコールバックを渡すと、全弾消去の前に弾ごとへ得点化などの処理ができる。',
    params: [
      { name: 'opts', type: 'WorldOpts', desc: 'フィールドサイズやプール上限などの生成オプション' },
      { name: 'dt', type: 'number', desc: 'update の論理ステップ秒。FixedLoop と組み合わせて 1/60 固定で渡すのが基本' },
      { name: 'convert', type: '(b: Bullet) => void', desc: 'clearBullets の任意コールバック。消去前に有効な弾すべてへ呼ばれる' },
    ],
    example:
      "const world = new DanmakuWorld({ width: 384, height: 448 })\n" +
      '// 毎フレーム：自機位置を教えてから更新・判定・描画\n' +
      'world.target.x = player.x\n' +
      'world.target.y = player.y\n' +
      'world.update(1 / 60)\n' +
      'const res = world.collide(player.x, player.y, 2.5, 26)\n' +
      'if (res.hit) onMiss()\n' +
      'score += res.grazed * 500\n' +
      'world.render(ctx)',
    keywords: 'world ワールド 統合 中核 メインループ 弾幕エンジン danmaku',
  },
  {
    id: 'world-opts',
    name: 'WorldOpts',
    category: 'danmaku-engine',
    signature:
      'interface WorldOpts {\n' +
      '  width: number\n' +
      '  height: number\n' +
      '  bulletCap?: number  // 既定 4096\n' +
      '  laserCap?: number   // 既定 32\n' +
      '  margin?: number     // 画面外カリング余白 px、既定 40\n' +
      '  palette?: string[]  // 既定 DEFAULT_PALETTE\n' +
      '}',
    summary:
      'DanmakuWorld の生成オプション。フィールドの論理サイズ（width / height）は必須。弾がフィールド＋margin の外に出ると自動で消去される。',
    example: "const world = new DanmakuWorld({ width: 384, height: 448, bulletCap: 2048 })",
    keywords: 'worldopts オプション 設定 フィールド サイズ cap 上限',
  },
  {
    id: 'collide-result',
    name: 'CollideResult',
    category: 'danmaku-engine',
    signature:
      'interface CollideResult {\n' +
      '  hit: boolean    // 被弾したか（当たった弾は消去される）\n' +
      '  grazed: number  // この呼び出しで新たにグレイズした数\n' +
      '}',
    summary:
      'DanmakuWorld.collide の戻り値。グレイズは弾ごとに1回だけ数えられ（Bullet.grazed フラグで管理）、被弾した場合はその弾を消去して hit=true を返す。',
    example:
      'const res = world.collide(px, py, 2.5, 26, (b) => playGrazeSe())\n' +
      'if (res.hit) { /* ミス処理 */ }\n' +
      'grazeCount += res.grazed',
    keywords: 'collideresult 判定結果 被弾 グレイズ graze hit',
  },
  {
    id: 'bullet-pool',
    name: 'BulletPool',
    category: 'danmaku-engine',
    signature:
      'class BulletPool {\n' +
      '  constructor(capacity?: number)  // 既定 4096\n' +
      '  spawn(o: SpawnOpts): Bullet | null\n' +
      '  kill(b: Bullet): void\n' +
      '  clear(): void\n' +
      '  get count(): number\n' +
      '  readonly bullets: Bullet[]\n' +
      '  readonly active: Bullet[]  // 有効な弾だけの稠密配列\n' +
      '}',
    summary:
      '弾オブジェクトの事前確保プール。フリーリスト＋稠密アクティブ配列で spawn / kill が O(1) に収まり、実行時のオブジェクト確保を最小化する。上限に達すると spawn は null を返す。通常は DanmakuWorld.spawn 経由で使い、反復処理には active を使う。',
    example:
      'const pool = new BulletPool(4096)\n' +
      "const b = pool.spawn({ x: 100, y: 80, angle: Math.PI / 2, speed: 120, kind: 'orb', color: 0 })\n" +
      'for (const bullet of pool.active) { /* 有効な弾だけ処理 */ }',
    keywords: 'bulletpool プール 弾プール 事前確保 pool spawn kill',
  },
  {
    id: 'bullet',
    name: 'Bullet',
    category: 'danmaku-engine',
    signature:
      'interface Bullet {\n' +
      '  active: boolean\n' +
      '  x: number; y: number\n' +
      '  vx: number; vy: number\n' +
      '  ax: number; ay: number\n' +
      '  angle: number   // 描画角度\n' +
      '  curve: number   // 速度ベクトルの角速度 rad/s（曲射）\n' +
      '  spin: number    // 見た目の自転 rad/s\n' +
      '  r: number       // 当たり判定半径\n' +
      '  scale: number   // 見た目倍率\n' +
      '  kind: BulletKind\n' +
      '  color: number   // パレット番号（customColor 使用時は -1）\n' +
      '  customColor: string\n' +
      '  grazed: boolean\n' +
      '  state: number   // 凍結ステートマシン（0:通常 1:出現待ち 2:凍結中）\n' +
      '  freezeAt: number; freezeTime: number; resume: ResumeMode\n' +
      '  grow: number; maxR: number  // 霧弾の半径成長\n' +
      '  drag: number    // 速度減衰 /秒\n' +
      '  swayAmp: number; swayFreq: number; swayPhase: number  // サイン揺れ\n' +
      '  age: number\n' +
      '}',
    summary:
      '弾1発の状態オブジェクト。生成は SpawnOpts で行い、実体は BulletPool が所有する。凍結ステートマシン（delay による出現待ち→移動→freezeAt で凍結→resume で再始動）、半径成長（grow）、減衰（drag）、サイン揺れ（sway）といった東方系の弾の振る舞いをすべて保持する。_pool / _slot はプール内部用なので触らない。',
    example:
      '// プールから得た弾は読み取り専用のつもりで扱う\n' +
      'const b = world.spawn({ x, y, angle, speed: 100 })\n' +
      'if (b) console.log(b.kind, b.r, b.age)',
    keywords: 'bullet 弾 状態 プロパティ freeze 凍結 grow sway',
  },
  {
    id: 'spawn-opts',
    name: 'SpawnOpts',
    category: 'danmaku-engine',
    signature:
      'interface SpawnOpts {\n' +
      '  x: number; y: number\n' +
      '  angle?: number   // rad。vx/vy を指定しない場合に使う\n' +
      '  speed?: number   // px/s\n' +
      '  vx?: number; vy?: number\n' +
      '  ax?: number; ay?: number\n' +
      '  kind?: BulletKind\n' +
      '  color?: number; customColor?: string\n' +
      '  r?: number; scale?: number\n' +
      '  curve?: number; spin?: number\n' +
      '  delay?: number        // 出現してから動き出すまでの時間\n' +
      '  freezeAt?: number     // 移動開始から何秒後に凍結するか\n' +
      '  freezeTime?: number   // 凍結している時間\n' +
      '  resume?: ResumeMode; resumeSpeed?: number; resumeGravity?: number\n' +
      '  grow?: number; maxR?: number\n' +
      '  drag?: number\n' +
      '  swayAmp?: number; swayFreq?: number; swayPhase?: number\n' +
      '}',
    summary:
      '弾生成パラメータ。初速は angle+speed か vx/vy のどちらかで与える。freezeAt / freezeTime / resume を組み合わせると「途中で止まってから自機へ向き直す弾」のような時止め系の挙動が作れる。grow+maxR は膨らむ霧弾、drag は減速、sway は横揺れ。',
    params: [
      { name: 'angle / speed', type: 'number', desc: '初速を角度（rad）と速さ（px/s）で指定。vx/vy 指定時は無視される' },
      { name: 'kind', type: 'BulletKind', desc: '見た目種別。未指定は \'orb\'。判定半径 r の既定値も種別で決まる' },
      { name: 'color / customColor', type: 'number / string', desc: 'color はパレット番号。customColor（CSS色）を渡すとそちらが優先され color は -1 になる' },
      { name: 'freezeAt / freezeTime / resume', type: 'number / number / ResumeMode', desc: '移動開始 freezeAt 秒後に freezeTime 秒間凍結し、resume の方式で再始動する' },
      { name: 'grow / maxR', type: 'number', desc: '半径の増加量（/秒）と上限。霧弾向け' },
    ],
    example:
      '// 0.55秒進んで止まり、1.15秒後に自機方向へ再加速する弾（時止め系）\n' +
      "world.spawn({ x, y, angle, speed: 155, kind: 'orb', color: 4,\n" +
      "  freezeAt: 0.55, freezeTime: 1.15, resume: 'aim', resumeSpeed: 100 })",
    keywords: 'spawnopts 生成 パラメータ 弾を出す freeze 時止め',
  },
  {
    id: 'bullet-template',
    name: 'BulletTemplate',
    category: 'danmaku-engine',
    signature: "type BulletTemplate = Omit<SpawnOpts, 'x' | 'y'>",
    summary:
      '位置（x / y）を除いた弾パラメータのテンプレート型。Emitter の bullet プロパティや、ringVolley などのボレー関数の共通パラメータとして使う。',
    example:
      "const tpl: BulletTemplate = { speed: 120, kind: 'knife', color: 4 }\n" +
      'ringVolley(world, boss.x, boss.y, 24, tpl)',
    keywords: 'bullettemplate テンプレート 共通パラメータ emitter ボレー',
  },
  {
    id: 'bullet-kind',
    name: 'BulletKind',
    category: 'danmaku-engine',
    signature:
      "type BulletKind =\n" +
      "  | 'orb'      // 丸弾\n" +
      "  | 'big'      // 大玉\n" +
      "  | 'dot'      // 小粒\n" +
      "  | 'bubble'   // 泡弾（半透明）\n" +
      "  | 'ellipse'  // 楕円弾（速度方向を向く）\n" +
      "  | 'knife'    // ナイフ（速度方向を向く）\n" +
      "  | 'talisman' // 札（速度方向を向く）\n" +
      "  | 'star'     // 星弾（自転する）",
    summary:
      '弾の見た目種別。ellipse / knife / talisman は速度方向を向いて描画され、star は spin で自転する。種別ごとに当たり判定半径の既定値が決まる（orb 4 / big 9 / dot 2.5 / bubble 6 / ellipse 4 / knife 4 / talisman 4.5 / star 4.5）。スプライトは SpriteBank が種別×色×サイズで事前描画する。',
    example: "world.spawn({ x, y, angle, speed: 200, kind: 'knife', color: 4 })",
    keywords: 'bulletkind 弾種 見た目 丸弾 大玉 ナイフ 札 星 泡 楕円',
  },
  {
    id: 'resume-mode',
    name: 'ResumeMode',
    category: 'danmaku-engine',
    signature:
      "type ResumeMode =\n" +
      "  | 'keep'  // 保存した速度そのまま\n" +
      "  | 'aim'   // 自機方向へ向き直す\n" +
      "  | 'speed' // 保存した方向のまま速度だけ変える\n" +
      "  | 'fall'  // その場から落下する（重力加速）",
    summary:
      '凍結（時止め）した弾が再始動するときの挙動。SpawnOpts.resume で指定する。aim の向き直し先は DanmakuWorld.target（自機位置）、fall の重力は resumeGravity（既定 320）、speed の速さは resumeSpeed で決まる。',
    example:
      "// 凍結後に落下する弾（凍結スペル系）\n" +
      "world.spawn({ x, y, angle, speed: 165, freezeAt: 0.5, freezeTime: 0.85, resume: 'fall', resumeGravity: 330 })",
    keywords: 'resumemode 再始動 凍結 時止め aim fall keep speed',
  },
  {
    id: 'default-palette',
    name: 'DEFAULT_PALETTE',
    category: 'danmaku-engine',
    signature:
      'const DEFAULT_PALETTE: string[]\n' +
      "// ['#ff5b6a', '#ff9f43', '#ffe066', '#7bed6a', '#4fc3f7', '#b388ff', '#ff7ad9', '#f5f5f5']",
    summary:
      '弾・レーザーの色パレット既定値（8色）。Bullet.color や LaserOpts.color はこの配列のインデックスで色を指定する。WorldOpts.palette や SpriteBank の引数で差し替え可能。パレット外の色は customColor で直接指定する。',
    example:
      '// color: 4 はパレットの水色（#4fc3f7）\n' +
      "world.spawn({ x, y, angle, speed: 100, color: 4 })\n" +
      "// 独自色は customColor で\n" +
      "world.spawn({ x, y, angle, speed: 100, customColor: '#88ffcc' })",
    keywords: 'defaultpalette パレット 色 カラー',
  },
  {
    id: 'laser-pool',
    name: 'LaserPool',
    category: 'danmaku-engine',
    signature:
      'class LaserPool {\n' +
      '  constructor(capacity?: number)  // 既定 32\n' +
      '  spawn(o: LaserOpts): Laser | null\n' +
      '  kill(l: Laser): void\n' +
      '  clear(): void\n' +
      '  update(dt: number): void\n' +
      '  endX(l: Laser): number\n' +
      '  endY(l: Laser): number\n' +
      '  get count(): number\n' +
      '  readonly active: Laser[]\n' +
      '}',
    summary:
      'レーザーのプール。レーザーは「予告（state 0）→照射（1）→消散（2）」の状態を update で自動遷移する。angVel の定速回転、sweepAmp / sweepSpeed による往復の薙ぎ払い、follow コールバックによる発生源追従に対応。当たり判定は DanmakuWorld.collideLasers が線分距離で行う（照射中のみ）。通常は DanmakuWorld.addLaser 経由で使う。',
    example:
      'world.addLaser({ x: boss.x, y: boss.y, angle: Math.PI / 2, width: 30,\n' +
      '  telegraph: 0.9, duration: -1, sweepAmp: 0.85, sweepSpeed: 0.85,\n' +
      '  follow: () => ({ x: boss.x, y: boss.y }) })',
    keywords: 'laserpool レーザー プール 予告 照射 薙ぎ払い sweep',
  },
  {
    id: 'laser-opts',
    name: 'LaserOpts / Laser',
    category: 'danmaku-engine',
    signature:
      'interface LaserOpts {\n' +
      '  x: number; y: number; angle: number\n' +
      '  length?: number   // 既定 640\n' +
      '  width?: number    // 既定 26\n' +
      '  color?: number; customColor?: string\n' +
      '  telegraph?: number  // 予告線の時間（秒）、既定 0.7\n' +
      '  duration?: number   // 照射時間。負数で無期限（kill で消す）、既定 -1\n' +
      '  fade?: number       // 消散時間、既定 0.25\n' +
      '  angVel?: number     // 一定回転 rad/s\n' +
      '  sweepAmp?: number; sweepSpeed?: number; sweepPhase?: number  // 往復薙ぎ払い\n' +
      '  follow?: () => { x: number; y: number }  // 発生源の追従\n' +
      '}\n' +
      'interface Laser { /* x, y, angle, state（0:予告 1:照射 2:消散）, age ほか */ }',
    summary:
      'レーザー生成パラメータとレーザー実体。sweepAmp を付けると angle = baseAngle + sin(age * sweepSpeed + sweepPhase) * sweepAmp で往復回転し、angVel とは排他（sweep 優先）。follow を渡すと毎フレーム発生源座標へ追従する。',
    params: [
      { name: 'telegraph', type: 'number', desc: '照射前の予告線を表示する秒数。0 で即照射' },
      { name: 'duration', type: 'number', desc: '照射を続ける秒数。負数なら無期限で、LaserPool.kill または World.clearLasers で消す' },
      { name: 'sweepAmp / sweepSpeed', type: 'number', desc: '往復薙ぎ払いの振幅（rad）と速度' },
      { name: 'follow', type: '() => { x, y }', desc: '発生源の現在位置を返す関数。ボス追従レーザーに使う' },
    ],
    example:
      "// 下向きに予告0.7秒→2秒照射する固定レーザー\n" +
      'world.addLaser({ x, y, angle: Math.PI / 2, telegraph: 0.7, duration: 2, width: 22, color: 0 })',
    keywords: 'laseropts laser レーザー パラメータ 予告線 telegraph',
  },
  {
    id: 'dist-point-segment',
    name: 'distPointSegment',
    category: 'danmaku-engine',
    signature:
      'function distPointSegment(\n' +
      '  px: number, py: number,\n' +
      '  x1: number, y1: number, x2: number, y2: number,\n' +
      '): number',
    summary:
      '点と線分の最短距離を返すユーティリティ。レーザー判定（DanmakuWorld.collideLasers）の基礎になっているもので、自前でレーザー風の判定を作るときにも使える。',
    params: [
      { name: 'px, py', type: 'number', desc: '判定する点（自機位置など）' },
      { name: 'x1, y1, x2, y2', type: 'number', desc: '線分の両端' },
    ],
    example:
      'const d = distPointSegment(player.x, player.y, lx, ly, laserEndX, laserEndY)\n' +
      'if (d < laserWidth / 2 + hitR) { /* 被弾 */ }',
    keywords: 'distpointsegment 距離 線分 判定 レーザー',
  },
  {
    id: 'sprite-bank',
    name: 'SpriteBank',
    category: 'danmaku-engine',
    signature:
      'class SpriteBank {\n' +
      '  constructor(palette?: string[], factory?: CanvasFactory)\n' +
      '  colorOf(b: Bullet): string\n' +
      '  get(b: Bullet): SpriteEntry | null\n' +
      '  clear(): void\n' +
      '  readonly palette: string[]\n' +
      '  readonly ss: number  // スーパーサンプリング倍率（2）\n' +
      '}',
    summary:
      '弾スプライトの事前描画バンク。「種別×色×サイズ」をキーにオフスクリーンCanvasへ描いてキャッシュし、DanmakuWorld.render が drawImage で blit する。描画のホットループで影やグラデーションを毎回計算しないための仕組み。Canvas が作れない環境（Nodeなど）では get が null を返し、エンジンは単純な円描画にフォールバックする。DanmakuWorld が内部に保持しているので、通常は直接触らない。',
    example:
      '// 独自パレットでワールドを作ると内部の SpriteBank にも反映される\n' +
      "const world = new DanmakuWorld({ width: 384, height: 448, palette: ['#ff0000', '#00ff00'] })\n" +
      'world.sprites.clear()  // スプライトキャッシュを捨てる',
    keywords: 'spritebank スプライト 事前描画 blit キャッシュ 高速化',
  },
  {
    id: 'canvas-factory',
    name: 'CanvasFactory',
    category: 'danmaku-engine',
    signature: 'type CanvasFactory = (w: number, h: number) => HTMLCanvasElement',
    summary:
      'SpriteBank がスプライト用オフスクリーンCanvasを作るための生成関数型。未指定なら document.createElement(\'canvas\') を使う。OffscreenCanvas を使いたい場合や、テスト・ベンチ環境で差し替えたい場合に渡す。',
    example:
      'const bank = new SpriteBank(undefined, (w, h) => {\n' +
      '  const c = document.createElement(\'canvas\')\n' +
      '  c.width = w; c.height = h\n' +
      '  return c\n' +
      '})',
    keywords: 'canvasfactory ファクトリ オフスクリーン canvas',
  },
  {
    id: 'ring-volley',
    name: 'ringVolley',
    category: 'danmaku-engine',
    signature:
      'function ringVolley(\n' +
      '  w: DanmakuWorld, x: number, y: number,\n' +
      '  count: number, o: BulletTemplate & { angle?: number },\n' +
      '): number',
    summary:
      '全方位リングを1回撃つボレー部品。o.angle を基点に count 発を等間隔で円形に配置する。戻り値は実際に生成できた弾数（プール上限で欠ける場合がある）。',
    params: [
      { name: 'count', type: 'number', desc: 'リングの弾数' },
      { name: 'o.angle', type: 'number', desc: 'リングの回転オフセット（rad）。省略時は 0' },
    ],
    example: "ringVolley(world, boss.x, boss.y, 28, { speed: 110, kind: 'orb', color: 5 })",
    keywords: 'ringvolley リング 全方位 円形 ボレー',
  },
  {
    id: 'fan-volley',
    name: 'fanVolley',
    category: 'danmaku-engine',
    signature:
      'function fanVolley(\n' +
      '  w: DanmakuWorld, x: number, y: number,\n' +
      '  center: number, count: number, spread: number, o: BulletTemplate,\n' +
      '): number',
    summary:
      '扇状に1回撃つボレー部品。中心角 center を軸に spread（rad）の広がりへ count 発を均等配置する。count が1のときは center 方向へ1発。戻り値は生成できた弾数。',
    params: [
      { name: 'center', type: 'number', desc: '扇の中心角（rad）' },
      { name: 'spread', type: 'number', desc: '扇の広がり（rad）' },
    ],
    example: "fanVolley(world, boss.x, boss.y, Math.PI / 2, 5, 0.6, { speed: 150, kind: 'orb', color: 1 })",
    keywords: 'fanvolley 扇 扇状 n-way ボレー',
  },
  {
    id: 'aimed-volley',
    name: 'aimedVolley',
    category: 'danmaku-engine',
    signature:
      'function aimedVolley(\n' +
      '  w: DanmakuWorld, x: number, y: number,\n' +
      '  count: number, spread: number, o: BulletTemplate,\n' +
      '): number',
    summary:
      'world.target（自機位置）方向を中心にした n-way 狙い撃ちボレー。内部では発射点から target への角度を計算して fanVolley を呼ぶ。使う前に world.target へ自機位置を入れておくこと。',
    example: "aimedVolley(world, enemy.x, enemy.y, 3, 0.18, { speed: 170, kind: 'orb', color: 0 })",
    keywords: 'aimedvolley 狙い撃ち 狙撃 n-way 自機狙い ボレー',
  },
  {
    id: 'scatter-volley',
    name: 'scatterVolley',
    category: 'danmaku-engine',
    signature:
      'function scatterVolley(\n' +
      '  w: DanmakuWorld, x: number, y: number,\n' +
      '  count: number,\n' +
      '  o: BulletTemplate & { angleMin?: number; angleMax?: number; speedMin?: number; speedMax?: number },\n' +
      '): number',
    summary:
      'ランダム散布ボレー。角度範囲（既定は全方位）と速度範囲（既定は speed の 0.7〜1.3倍）から world.rng でランダムに count 発を撃つ。霧弾や爆発の破片のような、ばらつきのある発射に使う。',
    example:
      "scatterVolley(world, x, y, 12, { kind: 'bubble', color: 5, angleMin: 0, angleMax: Math.PI, speedMin: 30, speedMax: 70 })",
    keywords: 'scattervolley ランダム 散布 ばらまき ボレー rng',
  },
  {
    id: 'emitter',
    name: 'Emitter（基底クラス）',
    category: 'danmaku-engine',
    signature:
      'abstract class Emitter {\n' +
      '  interval: number        // 射撃間隔（秒）、既定 0.1\n' +
      '  delay: number           // 開始までの遅延（秒）\n' +
      '  duration: number        // 稼働時間（秒、負数で無期限）\n' +
      '  bullet: BulletTemplate  // 弾テンプレート\n' +
      '  elapsed: number\n' +
      '  active: boolean\n' +
      '  update(dt: number, w: DanmakuWorld, x: number, y: number): void\n' +
      '  protected abstract fire(w: DanmakuWorld, x: number, y: number): void\n' +
      '}',
    summary:
      '継続射撃部品の抽象基底クラス。DanmakuWorld.addEmitter で登録すると、発射点の座標を受け取りながら interval ごとに fire が呼ばれる。duration を過ぎると active=false になり、ワールド側が自動で登録を外す。独自の発射パターンはこのクラスを継承し fire を実装して作る。',
    example:
      'class CrossEmitter extends Emitter {\n' +
      '  fire(w: DanmakuWorld, x: number, y: number): void {\n' +
      '    for (let i = 0; i < 4; i++) {\n' +
      '      w.spawn({ ...this.bullet, x, y, angle: (i / 4) * Math.PI * 2 })\n' +
      '    }\n' +
      '  }\n' +
      '}\n' +
      'const e = new CrossEmitter()\n' +
      'e.interval = 0.4\n' +
      "e.bullet = { speed: 100, kind: 'orb', color: 2 }\n" +
      'world.addEmitter(e, () => ({ x: boss.x, y: boss.y }))',
    keywords: 'emitter 基底 継承 カスタム 射撃部品 abstract',
  },
  {
    id: 'ring-emitter',
    name: 'RingEmitter',
    category: 'danmaku-engine',
    signature:
      'class RingEmitter extends Emitter {\n' +
      '  count: number    // 既定 16\n' +
      '  angle: number    // 現在の基点角\n' +
      '  angleVel: number // 1射撃ごとの角度オフセット増分 rad\n' +
      '}',
    summary:
      '全方位リングを繰り返し撃つ Emitter。angleVel を付けると1射撃ごとにリングが少しずつ回転し、花弁のような模様になる。',
    example:
      'const e = new RingEmitter()\n' +
      'e.count = 20; e.interval = 0.28; e.angleVel = 0.13\n' +
      "e.bullet = { speed: 95, kind: 'orb', color: 3 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'ringemitter リング 回転 emitter',
  },
  {
    id: 'fan-emitter',
    name: 'FanEmitter',
    category: 'danmaku-engine',
    signature:
      'class FanEmitter extends Emitter {\n' +
      '  count: number    // 既定 5\n' +
      '  spread: number   // 既定 0.6 rad\n' +
      '  angle: number    // 既定 PI/2（下向き）\n' +
      '  aim: boolean     // true で自機方向を中心にする\n' +
      '  angleVel: number // 中心角の増分 /射撃\n' +
      '}',
    summary:
      '扇状の n-way を繰り返し撃つ Emitter。aim=true で中心が world.target（自機）方向になる。angleVel で扇の向き自体を回していける。',
    example:
      'const e = new FanEmitter()\n' +
      'e.count = 5; e.spread = 0.55; e.aim = true; e.interval = 0.5\n' +
      "e.bullet = { speed: 150, kind: 'orb', color: 1 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'fanemitter 扇 n-way emitter 狙い',
  },
  {
    id: 'aimed-emitter',
    name: 'AimedEmitter',
    category: 'danmaku-engine',
    signature:
      'class AimedEmitter extends Emitter {\n' +
      '  count: number   // 既定 1\n' +
      '  spread: number  // 既定 0.18 rad\n' +
      '}',
    summary:
      '自機方向への n-way 狙い撃ちを繰り返す Emitter。count=1 で単発狙撃、count を増やすと扇状の狙撃になる。toho-engine の PhaseTemplates（mist の狙撃部など）でも使われている。',
    example:
      'const e = new AimedEmitter()\n' +
      'e.count = 3; e.spread = 0.16; e.interval = 1.1\n' +
      "e.bullet = { speed: 165, kind: 'orb', color: 0 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'aimedemitter 狙い撃ち 狙撃 emitter',
  },
  {
    id: 'spiral-emitter',
    name: 'SpiralEmitter',
    category: 'danmaku-engine',
    signature:
      'class SpiralEmitter extends Emitter {\n' +
      '  arms: number        // 腕の本数、既定 2\n' +
      '  angle: number       // 現在の発射角\n' +
      '  angleVel: number    // 発射角の回転速度 rad/s、既定 2.2\n' +
      '  alternate: boolean  // 腕ごとに回転方向を反転する\n' +
      '}',
    summary:
      '発射角が回り続ける多腕スパイラル Emitter。arms 本の腕が等間隔に弾を出し、渦巻き模様を作る。alternate=true で奇数腕の角度符号を反転させ、逆巻きの渦を混ぜられる。',
    example:
      'const e = new SpiralEmitter()\n' +
      'e.arms = 3; e.angleVel = 2.4; e.interval = 0.07\n' +
      "e.bullet = { speed: 105, kind: 'orb', color: 6 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'spiralemitter スパイラル 渦巻き 多腕 emitter',
  },
  {
    id: 'scatter-emitter',
    name: 'ScatterEmitter',
    category: 'danmaku-engine',
    signature:
      'class ScatterEmitter extends Emitter {\n' +
      '  count: number     // 1射撃の発数、既定 6\n' +
      '  angleMin: number  // 既定 0\n' +
      '  angleMax: number  // 既定 2*PI\n' +
      '  speedMin: number  // 0 でテンプレート準拠\n' +
      '  speedMax: number  // 0 でテンプレート準拠\n' +
      '}',
    summary:
      'ランダム散布を繰り返す Emitter。内部で scatterVolley を使う。霧弾（bubble＋grow）や破片のような、方向と速さにばらつきのある発射向け。',
    example:
      'const e = new ScatterEmitter()\n' +
      'e.count = 3; e.interval = 0.42\n' +
      "e.bullet = { speed: 38, kind: 'bubble', color: 5, r: 5, grow: 7.5, maxR: 17, drag: 0.22 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'scatteremitter ランダム 散布 emitter 霧弾',
  },
  {
    id: 'stream-emitter',
    name: 'StreamEmitter',
    category: 'danmaku-engine',
    signature:
      'class StreamEmitter extends Emitter {\n' +
      '  angle: number   // 既定 PI/2\n' +
      '  aim: boolean    // 既定 true（自機方向）\n' +
      '  zigzag: number  // 交互に左右へずらす量 rad\n' +
      '}',
    summary:
      '単発を一定間隔で撃ち続ける直線ストリーム Emitter。aim=true（既定）で常に自機方向へ撃つ。zigzag を付けると発射角が左右交互にずれて蛇行する流れになる。',
    example:
      'const e = new StreamEmitter()\n' +
      'e.interval = 0.16; e.zigzag = 0.12\n' +
      "e.bullet = { speed: 190, kind: 'ellipse', color: 4 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'streamemitter ストリーム 直線 連射 emitter zigzag',
  },
  {
    id: 'wave-emitter',
    name: 'WaveEmitter',
    category: 'danmaku-engine',
    signature:
      'class WaveEmitter extends Emitter {\n' +
      '  baseAngle: number  // 既定 PI/2\n' +
      '  aim: boolean       // true で自機方向を基準にする\n' +
      '  amp: number        // 振幅 rad、既定 0.5\n' +
      '  freq: number       // 周波数 Hz、既定 1.6\n' +
      '}',
    summary:
      '発射角がサイン波で左右に揺れるストリーム Emitter。基準角＋sin(時刻 * freq * 2π) * amp で角度が決まる。波状にうねる弾の流れを作る。',
    example:
      'const e = new WaveEmitter()\n' +
      'e.amp = 0.55; e.freq = 1.2; e.interval = 0.09\n' +
      "e.bullet = { speed: 130, kind: 'orb', color: 2 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'waveemitter 波状 サイン 揺れ emitter',
  },
  {
    id: 'vortex-emitter',
    name: 'VortexEmitter',
    category: 'danmaku-engine',
    signature:
      'class VortexEmitter extends Emitter {\n' +
      '  radius: number   // 発射点の円半径、既定 46\n' +
      '  rotVel: number   // 発射点の回転速度 rad/s、既定 1.8\n' +
      "  mode: 'in' | 'out' | 'tangent'  // 発射方向、既定 'tangent'\n" +
      '  angle: number    // 現在の発射点角度\n' +
      '}',
    summary:
      '発射点そのものが中心の周りを回る渦巻き Emitter。円周上の点から、mode に応じて中心方向（in）／外向き（out）／接線方向（tangent）へ撃つ。',
    example:
      'const e = new VortexEmitter()\n' +
      "e.radius = 60; e.rotVel = 2.0; e.mode = 'tangent'; e.interval = 0.08\n" +
      "e.bullet = { speed: 90, kind: 'star', color: 3, spin: 3 }\n" +
      'world.addEmitter(e, bossPos)',
    keywords: 'vortexemitter 渦巻き 回転 発射点 emitter',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    category: 'danmaku-engine',
    signature:
      'type TimelineFn = (w: DanmakuWorld) => void\n\n' +
      'class Timeline {\n' +
      '  t: number\n' +
      '  at(time: number, fn: TimelineFn): this\n' +
      '  after(delay: number, fn: TimelineFn): this\n' +
      '  every(interval: number, fn: TimelineFn, count?: number): this  // count 負数で無限\n' +
      '  update(dt: number, w: DanmakuWorld): void\n' +
      '  clear(): void\n' +
      '  get pending(): number\n' +
      '}',
    summary:
      '絶対時刻イベント＋繰り返し実行を並べる簡易タイムライン。at で時刻指定、after で現在時刻からの相対指定、every で周期実行を登録する。DanmakuWorld が timeline を1つ保持し、world.update の中で駆動されるため、道中の出現スケジュールなどをデータ的に書ける。',
    example:
      'world.timeline\n' +
      '  .at(2, (w) => ringVolley(w, 192, 60, 24, { speed: 100, color: 0 }))\n' +
      '  .every(1.5, (w) => aimedVolley(w, boss.x, boss.y, 3, 0.18, { speed: 160, color: 4 }), 6)',
    keywords: 'timeline タイムライン スケジュール at every after イベント',
  },
  {
    id: 'script-runner',
    name: 'ScriptRunner',
    category: 'danmaku-engine',
    signature:
      "type ScriptStep = { wait: number } | { do: TimelineFn }\n\n" +
      'class ScriptRunner {\n' +
      '  constructor(steps: ScriptStep[])\n' +
      '  reset(): void\n' +
      '  update(dt: number, w: DanmakuWorld): void\n' +
      '  finished: boolean\n' +
      '}',
    summary:
      'wait（秒数）と do（処理）を並べたステップ列を順に実行するスクリプトランナー。Timeline が「時刻で並列」に強いのに対し、こちらは「前の処理が終わってから次へ」という逐次演出（会話前後の間合い、段階的な攻撃展開など）に向く。update を毎フレーム呼ぶと内部で進行し、終わると finished=true になる。',
    example:
      'const script = new ScriptRunner([\n' +
      '  { do: (w) => ringVolley(w, x, y, 20, { speed: 90, color: 1 }) },\n' +
      '  { wait: 1.2 },\n' +
      '  { do: (w) => aimedVolley(w, x, y, 5, 0.3, { speed: 150, color: 0 }) },\n' +
      '])\n' +
      '// 毎フレーム\n' +
      'script.update(1 / 60, world)',
    keywords: 'scriptrunner スクリプト 逐次 wait do 演出',
  },
  {
    id: 'fixed-loop',
    name: 'FixedLoop',
    category: 'danmaku-engine',
    signature:
      'interface FixedLoopOpts {\n' +
      '  step?: number     // 論理ステップ秒、既定 1/60\n' +
      '  maxFrame?: number // 1フレームで進める実時間の上限（秒）、既定 0.25\n' +
      '  maxSteps?: number // 1フレームの最大ステップ数、既定 5\n' +
      '  update: (dt: number) => void\n' +
      '  render?: (alpha: number) => void  // alpha は補間係数\n' +
      '}\n\n' +
      'class FixedLoop {\n' +
      '  constructor(opts: FixedLoopOpts)\n' +
      '  frame(nowMs: number): void  // requestAnimationFrame の timestamp を渡す\n' +
      '  reset(): void\n' +
      '  get fps(): number\n' +
      '  get frameMs(): number\n' +
      '  readonly meter: FpsMeter\n' +
      '  lastSteps: number\n' +
      '}',
    summary:
      '論理更新を固定タイムステップに分離するループ。requestAnimationFrame の timestamp を frame に渡すと、蓄積した実時間ぶんだけ update(step) を繰り返し、render(alpha) を呼ぶ。デルタは maxFrame でクランプし、maxSteps を超える遅延は捨てることで処理落ち時のスパイラル（遅延の雪だるま）を防ぐ。端末の表示リフレッシュレートに依存せず弾幕の挙動が一定になる。',
    example:
      'const loop = new FixedLoop({\n' +
      '  update: (dt) => world.update(dt),\n' +
      '  render: () => world.render(ctx),\n' +
      '})\n' +
      'const tick = (now: number) => { loop.frame(now); requestAnimationFrame(tick) }\n' +
      'requestAnimationFrame(tick)',
    keywords: 'fixedloop 固定ステップ ループ 60hz requestanimationframe fps',
  },
  {
    id: 'fps-meter',
    name: 'FpsMeter',
    category: 'danmaku-engine',
    signature:
      'class FpsMeter {\n' +
      '  fps: number     // 直近の実測fps（0.5秒窓）\n' +
      '  frameMs: number // フレーム時間の指数移動平均 ms\n' +
      '  sample(dtMs: number): void\n' +
      '}',
    summary:
      'FPS計測器。sample にフレーム時間（ms）を渡し続けると、0.5秒窓の実測 fps と、フレーム時間の指数移動平均 frameMs を更新する。FixedLoop が内蔵しており、loop.fps / loop.frameMs でも読める。デバッグ表示や負荷計測用。',
    example:
      'const meter = new FpsMeter()\n' +
      '// 毎フレーム\n' +
      'meter.sample(frameDeltaMs)\n' +
      'console.log(meter.fps, meter.frameMs)',
    keywords: 'fpsmeter fps 計測 フレーム時間 デバッグ',
  },
  // ==========================================================
  // toho-engine
  // ==========================================================
  {
    id: 'game-state',
    name: 'GameState',
    category: 'toho-engine',
    signature:
      'interface GameStateOpts {\n' +
      '  startLives?: number   // 既定 2\n' +
      '  startBombs?: number   // 既定 3\n' +
      '  maxBombs?: number     // 既定 8\n' +
      '  maxPower?: number     // 既定 4\n' +
      '  extendsAt?: number[]  // エクステンドのスコア閾値、既定 [1000万, 3000万, 6000万]\n' +
      '}\n\n' +
      'class GameState {\n' +
      '  score: number; hiScore: number\n' +
      '  lives: number; bombs: number\n' +
      '  power: number  // 0.00〜maxPower（整数部が powerTier）\n' +
      '  graze: number\n' +
      '  get powerTier(): number\n' +
      '  addScore(n: number): boolean  // エクステンド到達で true\n' +
      '  addGraze(n?: number): void\n' +
      '  addPower(amount: number): boolean  // 上限で溢れたら true\n' +
      '  powerDown(amount?: number): void\n' +
      '  addBomb(n?: number): void\n' +
      '  addLife(n?: number): void\n' +
      '  useBomb(): boolean  // 残りがあれば消費して true\n' +
      '  miss(): boolean     // ゲームオーバーなら true\n' +
      '  reset(): void\n' +
      '}',
    summary:
      '東方系STGの共通システム（スコア・残機・ボム・パワー・グレイズ）をまとめた状態クラス。addScore はエクステンド（スコア残機アップ）の判定も行い、到達したら残機を増やして true を返す。miss() は残機を減らしボムを初期値へ戻し、残機が尽きたら true。パワーは小数で保持し、整数部がショット段階（powerTier）になる。',
    example:
      'const state = new GameState()\n' +
      'if (state.addScore(10000)) playExtendSe()\n' +
      'state.addGraze(res.grazed)\n' +
      'if (playerHit) {\n' +
      '  state.powerDown(1)\n' +
      '  if (state.miss()) gameOver()\n' +
      '}',
    keywords: 'gamestate スコア 残機 ボム パワー グレイズ エクステンド 状態',
  },
  {
    id: 'item-pool',
    name: 'ItemPool',
    category: 'toho-engine',
    signature:
      "type ItemKind = 'power' | 'point' | 'life' | 'bomb' | 'fullpower'\n\n" +
      'interface ItemCollectInfo {\n' +
      '  kind: ItemKind; x: number; y: number\n' +
      '  fullValue: boolean  // 回収ライン（画面上部）での全吸着回収か\n' +
      '}\n\n' +
      'class ItemPool {\n' +
      '  constructor(capacity?: number)  // 既定 256\n' +
      '  spawn(kind: ItemKind, x: number, y: number): Item | null\n' +
      '  update(dt: number, px: number, py: number, opts: {\n' +
      '    height: number\n' +
      '    magnetR?: number    // 吸着半径、既定 64\n' +
      '    collectR?: number   // 回収半径、既定 15\n' +
      '    attractAll?: boolean\n' +
      '    onCollect?: (info: ItemCollectInfo) => void\n' +
      '  }): void\n' +
      '  render(ctx: CanvasRenderingContext2D): void\n' +
      '  clear(): void\n' +
      '  get count(): number\n' +
      '}',
    summary:
      'ドロップアイテム（P／点／残機／ボム／フルパワー）のプール。アイテムは跳ね上がってから落下し、自機が magnetR 内に入ると吸着、collectR 内で回収されて onCollect が呼ばれる。attractAll=true（自機が画面上部の回収ラインへ入ったとき等）にすると全アイテムが吸着し、回収情報の fullValue が true になる（点アイテム満額の判定用）。描画は種別色の小さいチップ＋文字。',
    example:
      'const items = new ItemPool()\n' +
      "items.spawn('power', enemy.x, enemy.y)\n" +
      '// 毎フレーム\n' +
      'items.update(dt, player.x, player.y, {\n' +
      '  height: 448,\n' +
      '  attractAll: player.y < 96,\n' +
      '  onCollect: (info) => applyItemEffect(state, info),\n' +
      '})\n' +
      'items.render(ctx)',
    keywords: 'itempool アイテム ドロップ 回収 吸着 パワー 点アイテム',
  },
  {
    id: 'apply-item-effect',
    name: 'applyItemEffect',
    category: 'toho-engine',
    signature:
      'function applyItemEffect(\n' +
      '  state: GameState, info: ItemCollectInfo,\n' +
      '  scoreMul?: number,  // 既定 1\n' +
      '): void',
    summary:
      'アイテム回収効果を GameState へ適用する標準処理。power はパワー+0.25（満タン時は 5000点）、fullpower はパワー最大化、point は満額回収で 10000 点・通常 3000 点、life は残機+1、bomb はボム+1。点数には scoreMul が掛かる。独自の点数体系にしたい場合は ItemPool の onCollect で自前処理に差し替える。',
    params: [
      { name: 'state', type: 'GameState', desc: '効果の適用先' },
      { name: 'info', type: 'ItemCollectInfo', desc: 'ItemPool.update の onCollect で渡される回収情報' },
      { name: 'scoreMul', type: 'number', desc: '得点倍率（難易度補正など）' },
    ],
    example: 'onCollect: (info) => applyItemEffect(state, info)',
    keywords: 'applyitemeffect アイテム効果 得点 パワーアップ 残機',
  },
  {
    id: 'enemy-pool',
    name: 'EnemyPool / EnemyDef',
    category: 'toho-engine',
    signature:
      "type EnemyMoveKind = 'down' | 'side' | 'sine' | 'hover' | 'dart'\n\n" +
      'interface EnemyDef {\n' +
      '  hp: number\n' +
      '  radius: number\n' +
      '  score?: number\n' +
      '  move: EnemyMoveKind\n' +
      '  speed?: number       // px/s、既定 68\n' +
      '  stopY?: number       // hover: 停止する y\n' +
      '  stayTime?: number    // hover: 停止してから退場までの秒数\n' +
      '  fireInterval?: number  // 射撃間隔（秒）。0/未指定で撃たない\n' +
      '  fire?: (w: DanmakuWorld, e: Enemy) => void  // カスタム射撃\n' +
      '  drop?: ItemKind[]    // 撃破時ドロップ\n' +
      '  sprite?: string      // 描画識別子（ゲーム側の描画と対応）\n' +
      '}\n\n' +
      'class EnemyPool {\n' +
      '  constructor(capacity?: number)  // 既定 96\n' +
      '  spawn(def: EnemyDef, x: number, y: number, dir?: number): Enemy | null\n' +
      '  damage(e: Enemy, dmg: number): boolean  // 撃破したら true\n' +
      '  kill(e: Enemy): void\n' +
      '  clear(): void\n' +
      '  update(dt: number, w: DanmakuWorld, bounds: { width: number; height: number }): void\n' +
      '  get count(): number\n' +
      '  readonly active: Enemy[]\n' +
      '}',
    summary:
      '編隊ザコ敵のプールと定義。移動パターンは down（直進落下）/ side（横移動）/ sine（波形）/ hover（stopY で停止→stayTime 後に退場）/ dart（斜め突進）の5種を内蔵し、射撃は fireInterval 間隔で fire コールバックが呼ばれる（world と敵自身を受け取るので aimedVolley 等をそのまま使える）。撃破判定は damage が行い、ドロップやスコア付与は呼び出し側が drop / score を見て行う。描画はゲーム側（sprite 識別子で対応）。',
    example:
      'const fairy: EnemyDef = {\n' +
      '  hp: 6, radius: 12, score: 300, move: \'sine\', speed: 74,\n' +
      '  fireInterval: 2.2,\n' +
      '  fire: (w, e) => aimedVolley(w, e.x, e.y, 1, 0, { speed: 130, color: 4 }),\n' +
      "  drop: ['power'], sprite: 'fairy',\n" +
      '}\n' +
      'enemies.spawn(fairy, 100, -26)\n' +
      'enemies.update(dt, world, { width: 384, height: 448 })',
    keywords: 'enemypool enemydef 敵 ザコ 編隊 移動パターン 射撃 ドロップ',
  },
  {
    id: 'player-chara-def',
    name: 'PlayerCharaDef',
    category: 'toho-engine',
    signature:
      "type PlayerBulletKind = 'orb' | 'talisman' | 'missile' | 'laser'\n\n" +
      'interface ShotSpawn {\n' +
      '  dx: number; dy: number  // 自機位置からのオフセット\n' +
      '  angle: number           // 発射角 rad（-PI/2 が真上）\n' +
      '  speed: number; dmg: number\n' +
      '  kind: PlayerBulletKind\n' +
      '  homing?: number  // 誘導の旋回速度 rad/s（0で直進）\n' +
      '}\n\n' +
      'interface BombDef {\n' +
      '  name: string\n' +
      '  duration: number  // 効果時間（秒）\n' +
      '  dps: number       // 秒間ダメージ\n' +
      "  scope: 'full' | 'front'  // 全画面ボムか前方ボムか\n" +
      '}\n\n' +
      'interface PlayerCharaDef {\n' +
      '  id: string; name: string\n' +
      '  speed: number       // 通常移動速度 px/s\n' +
      '  focusSpeed: number  // 低速（集中）移動速度 px/s\n' +
      '  hitR: number        // 当たり判定半径\n' +
      '  grazeR: number      // グレイズ半径\n' +
      '  shotInterval: number  // ショット間隔（秒）\n' +
      '  shots: (powerTier: number, focused: boolean) => ShotSpawn[]\n' +
      '  bomb: BombDef\n' +
      '}',
    summary:
      '自機キャラクターの差し替え可能な定義。移動速度・判定・ショット間隔と、パワー段階（0〜4）と集中状態に応じたショット構成を返す shots 関数、ボム定義を持つ。新しい自機はこの型のオブジェクトを1つ書けば追加できる。サンプルとして REIMU_DEF（広角＋誘導札）と MARISA_DEF（前方集中＋ミサイル）が用意されている。',
    example:
      'const MY_CHARA: PlayerCharaDef = {\n' +
      "  id: 'my', name: 'マイキャラ',\n" +
      '  speed: 270, focusSpeed: 120, hitR: 2.5, grazeR: 26,\n' +
      '  shotInterval: 0.08,\n' +
      "  bomb: { name: '秘法「サンプルボム」', duration: 3, dps: 300, scope: 'full' },\n" +
      '  shots: (tier, focused) => [\n' +
      "    { dx: 0, dy: -10, angle: -Math.PI / 2, speed: 640, dmg: 9, kind: 'orb' },\n" +
      '  ],\n' +
      '}',
    keywords: 'playercharadef 自機 キャラ定義 ショット ボム 差し替え',
  },
  {
    id: 'reimu-def',
    name: 'REIMU_DEF',
    category: 'toho-engine',
    signature:
      'const REIMU_DEF: PlayerCharaDef\n' +
      "// id: 'reimu', name: '博麗霊夢'\n" +
      '// speed 268 / focusSpeed 118 / hitR 2.5 / grazeR 26 / shotInterval 0.075\n' +
      "// bomb: 霊符「夢想封印」（全画面、3.2秒、dps 260）",
    summary:
      '霊夢タイプの自機定義サンプル。広角ショット＋パワー段階2から誘導札（talisman、homing）が加わる構成。集中（低速）で広がりが狭まる。PlayerCharaDef の実装例としてそのまま使える。',
    example: 'const player = new Player(REIMU_DEF, 192, 380)',
    keywords: 'reimu 霊夢 自機 サンプル 誘導札 夢想封印',
  },
  {
    id: 'marisa-def',
    name: 'MARISA_DEF',
    category: 'toho-engine',
    signature:
      'const MARISA_DEF: PlayerCharaDef\n' +
      "// id: 'marisa', name: '霧雨魔理沙'\n" +
      '// speed 292 / focusSpeed 132 / hitR 2.5 / grazeR 26 / shotInterval 0.07\n' +
      "// bomb: 恋符「マスタースパーク」（前方、2.6秒、dps 340）",
    summary:
      '魔理沙タイプの自機定義サンプル。前方集中のレーザー状ショット＋パワー段階2から弱誘導ミサイル。霊夢より移動速度と火力が高く、広がりがない。',
    example: 'const player = new Player(MARISA_DEF, 192, 380)',
    keywords: 'marisa 魔理沙 自機 サンプル マスタースパーク 前方集中',
  },
  {
    id: 'player',
    name: 'Player',
    category: 'toho-engine',
    signature:
      'interface PlayerInput {\n' +
      '  mx: number; my: number  // -1..1 の移動入力\n' +
      '  focus: boolean\n' +
      '  shot: boolean\n' +
      '}\n\n' +
      'class Player {\n' +
      '  constructor(def: PlayerCharaDef, x: number, y: number)\n' +
      '  def: PlayerCharaDef\n' +
      '  x: number; y: number\n' +
      '  invulnT: number  // 無敵時間（秒）\n' +
      '  bombT: number    // ボム持続の残り（秒）\n' +
      '  dead: boolean\n' +
      '  get bombing(): boolean\n' +
      '  startBomb(): boolean\n' +
      '  respawn(x: number, y: number): void\n' +
      '  update(dt: number, input: PlayerInput, bounds: { width: number; height: number }, powerTier: number, onShots: (shots: ShotSpawn[]) => void): void\n' +
      '}',
    summary:
      '自機本体。PlayerCharaDef に従って移動（フィールド境界でクランプ）と射撃タイミングを管理し、撃つ瞬間に onShots へ ShotSpawn 列を渡す（実際の弾生成は PlayerBulletPool.spawn へ回す）。startBomb はボム効果と無敵を開始する（GameState 側のボム消費は呼び出し側で先に行う）。respawn は無敵3秒で復活させる。被弾判定そのものは DanmakuWorld.collide 側で行い、結果に応じて dead や respawn をゲーム側が操作する。',
    example:
      'player.update(dt, { mx, my, focus, shot }, { width: 384, height: 448 },\n' +
      '  state.powerTier, (shots) => {\n' +
      '    for (const s of shots) bullets.spawn(player.x, player.y, s)\n' +
      '  })',
    keywords: 'player 自機本体 移動 射撃 ボム 無敵 リスポーン',
  },
  {
    id: 'player-bullet-pool',
    name: 'PlayerBulletPool',
    category: 'toho-engine',
    signature:
      'class PlayerBulletPool {\n' +
      '  constructor(capacity?: number)  // 既定 320\n' +
      '  spawn(x: number, y: number, s: ShotSpawn): PlayerBullet | null\n' +
      '  update(dt: number, bounds: { width: number; height: number },\n' +
      '    findTarget: (x: number, y: number) => { x: number; y: number } | null,\n' +
      '    hitTest: (x: number, y: number, dmg: number) => boolean): void\n' +
      '  render(ctx: CanvasRenderingContext2D): void\n' +
      '  clear(): void\n' +
      '  get count(): number\n' +
      '}',
    summary:
      '自機弾のプール。ShotSpawn を受けて生成し、update で移動・誘導（homing の旋回）・命中処理を行う。誘導先は findTarget コールバック、命中は hitTest コールバック（命中して消費されたら true を返す）でゲーム側と接続する。描画は kind ごとに内蔵（laser は縦長の光条、talisman は札、missile は光球、orb は楕円弾）。',
    example:
      'bullets.update(dt, { width: 384, height: 448 },\n' +
      '  (x, y) => nearestEnemyPos(x, y),\n' +
      '  (x, y, dmg) => damageEnemiesAt(x, y, dmg))',
    keywords: 'playerbulletpool 自機弾 プール 誘導 命中 ショット',
  },
  {
    id: 'boss-controller',
    name: 'BossController',
    category: 'toho-engine',
    signature:
      'interface BossControllerOpts {\n' +
      '  width?: number   // 既定 384\n' +
      '  height?: number  // 既定 448\n' +
      '  clearBulletsOnPhaseEnd?: boolean  // 既定 true\n' +
      '  diff?: DiffScale\n' +
      '}\n\n' +
      'class BossController {\n' +
      '  constructor(opts?: BossControllerOpts)\n' +
      '  start(def: BossDef, world: DanmakuWorld, player: { x: number; y: number }, x: number, y: number): void\n' +
      '  update(dt: number): void\n' +
      '  damage(amount: number): void\n' +
      '  hitBody(body: BossBody | null, amount: number): boolean\n' +
      '  notifyMiss(): void\n' +
      '  notifyBomb(): void\n' +
      '  abort(): void\n' +
      '  setDiff(d: DiffScale): void\n' +
      '  get phase(): BossPhaseDef | null\n' +
      '  get isSpell(): boolean\n' +
      '  get radius(): number\n' +
      '  phaseIndex: number; hp: number; maxHp: number; timeLeft: number\n' +
      '  active: boolean; finished: boolean\n' +
      '  bodies: BossBody[]\n' +
      '  onPhaseStart: ((index: number, phase: BossPhaseDef) => void) | null\n' +
      '  onPhaseEnd: ((result: PhaseEndResult) => void) | null\n' +
      '  onDefeat: (() => void) | null\n' +
      '}',
    summary:
      'ボス戦の制御クラス。BossDef のフェイズ列を順に実行し、HP・制限時間・移動パターン・テンプレート／カスタム処理の駆動、フェイズ終了時の Emitter／レーザー自動撤収と全弾消去を担う。スペル取得判定（ノーミス・ノーボムで撃破したら captured）も管理するので、スペル中に被弾したら notifyMiss、ボムを使ったら notifyBomb を呼ぶ。フェイズ遷移は onPhaseStart / onPhaseEnd、撃破は onDefeat で通知される。自機弾の命中は damage（本体）または hitBody（分身体）へ渡す。',
    example:
      'const boss = new BossController({ width: 384, height: 448 })\n' +
      'boss.onPhaseEnd = (r) => { if (r.captured) state.addScore(r.bonus) }\n' +
      'boss.onDefeat = () => onBossDown()\n' +
      'boss.start(RUMIA_BOSS, world, player, 192, 96)\n' +
      '// 毎フレーム\n' +
      'boss.update(dt)\n' +
      '// スペル中の被弾・ボムを記録\n' +
      'boss.notifyMiss(); boss.notifyBomb()',
    keywords: 'bosscontroller ボス 制御 フェイズ スペル取得 hp タイマー',
  },
  {
    id: 'boss-def',
    name: 'BossDef',
    category: 'toho-engine',
    signature:
      'interface BossDef {\n' +
      '  id: string\n' +
      '  name: string\n' +
      '  epithet?: string  // 二つ名\n' +
      '  radius: number    // 当たり判定半径\n' +
      '  figure?: FigureDef  // キャラ描画用フィギュア定義（任意）\n' +
      '  phases: BossPhaseDef[]\n' +
      '}',
    summary:
      'ボス1体の定義。名前・二つ名・判定半径・描画用 FigureDef と、通常攻撃とスペルカードを並べたフェイズ列を持つ。BossController.start に渡して戦闘を開始する。中ボスも「フェイズ1つだけの BossDef」として同じ仕組みで扱える。',
    example:
      'const RUMIA_BOSS: BossDef = {\n' +
      "  id: 'rumia', name: 'ルーミア', radius: 20, figure: RUMIA_FIGURE,\n" +
      '  phases: [ /* 通常攻撃 → スペル… の BossPhaseDef 列 */ ],\n' +
      '}',
    keywords: 'bossdef ボス定義 フェイズ列 中ボス',
  },
  {
    id: 'boss-phase-def',
    name: 'BossPhaseDef',
    category: 'toho-engine',
    signature:
      "type BossMoveKind = 'still' | 'hover' | 'sine' | 'chase' | 'teleport' | 'drift'\n\n" +
      'interface BossPhaseDef {\n' +
      '  name: string | null  // スペル名。null は通常攻撃\n' +
      '  spell?: boolean      // スペルカードか（未指定なら name から自動判定）\n' +
      '  hp: number\n' +
      '  timeLimit: number    // 制限時間（秒）\n' +
      '  move?: BossMoveKind  // 既定 hover\n' +
      '  moveRange?: number; moveSpeed?: number\n' +
      '  template?: PhaseTemplateId\n' +
      '  params?: Record<string, number>\n' +
      '  bonusBase?: number    // スペルボーナス基礎値、既定 500000\n' +
      '  bonusPerSec?: number  // 残り時間1秒あたり、既定 20000\n' +
      '  setup?: (ctx: BossContext) => void\n' +
      '  update?: (ctx: BossContext, dt: number) => void\n' +
      '  teardown?: (ctx: BossContext) => void\n' +
      '}',
    summary:
      'ボスのフェイズ（通常攻撃1つ、またはスペルカード1枚）の定義。移動は still（静止）/ hover（ふわりと揺れる）/ sine（横移動）/ chase（自機の x を追う）/ teleport（params.interval 秒ごとに瞬間移動）/ drift（ランダムな目標点へ漂う）から選べる。攻撃は template（仕掛けテンプレート＋params）か、setup / update / teardown のカスタム処理で書く。制限時間を過ぎるとタイムアウトとして次フェイズへ進む。',
    params: [
      { name: 'name', type: 'string | null', desc: 'スペル名。通常攻撃フェイズは null' },
      { name: 'template / params', type: 'PhaseTemplateId / Record<string, number>', desc: '仕掛けテンプレートを使う場合の指定とパラメータ' },
      { name: 'setup / update / teardown', type: '(ctx: BossContext) => void', desc: 'カスタム攻撃処理。update は毎フレーム呼ばれる' },
    ],
    example:
      '{\n' +
      "  name: '夜符「ミッドナイトバード」', hp: 900, timeLimit: 45,\n" +
      "  move: 'sine', moveRange: 70,\n" +
      '  setup: (ctx) => { const e = new SpiralEmitter(); e.arms = 2\n' +
      "    e.bullet = { speed: 100, kind: 'ellipse', color: 4 }; ctx.addEmitter(e) },\n" +
      '}',
    keywords: 'bossphasedef フェイズ スペルカード 通常攻撃 移動 テンプレート',
  },
  {
    id: 'boss-context',
    name: 'BossContext',
    category: 'toho-engine',
    signature:
      'interface DiffScale { spd: number; den: number }  // 弾速倍率・弾数倍率\n\n' +
      'interface BossBody {\n' +
      '  x: number; y: number\n' +
      '  real: boolean     // 本物か（分身用）\n' +
      '  radius: number\n' +
      '  visible: boolean\n' +
      '}\n\n' +
      'interface BossContext {\n' +
      '  world: DanmakuWorld\n' +
      '  bossX: () => number; bossY: () => number\n' +
      '  player: { x: number; y: number }\n' +
      '  diff: DiffScale\n' +
      '  phaseTime: () => number\n' +
      '  spawn: (o: SpawnOpts) => Bullet | null\n' +
      '  ring: (count: number, o: BulletTemplate) => void\n' +
      '  fan: (center: number, count: number, spread: number, o: BulletTemplate) => void\n' +
      '  aimed: (count: number, spread: number, o: BulletTemplate) => void\n' +
      '  addEmitter: (e: Emitter) => EmitterEntry\n' +
      '  addEmitterAt: (e: Emitter, getPos: () => { x: number; y: number }) => EmitterEntry\n' +
      '  addLaser: (o: LaserOpts) => Laser | null\n' +
      '  setBodies: (bodies: BossBody[]) => void\n' +
      '  setRealOnlyDamage: (v: boolean) => void\n' +
      '}',
    summary:
      'フェイズの setup / update / teardown と PhaseTemplates に渡される攻撃用コンテキスト。ring / fan / aimed は難易度倍率（弾速・弾数）を自動で適用する簡易発射ヘルパー。addEmitter / addLaser で登録したものはフェイズ終了時に自動で撤収される。setBodies で分身などの当たり判定体を差し替え、setRealOnlyDamage(true) の間は本物以外へのダメージが無効になる。',
    example:
      'update: (ctx, dt) => {\n' +
      '  // 難易度倍率つきの狙い撃ち\n' +
      "  ctx.aimed(3, 0.16, { speed: 150, kind: 'orb', color: 0 })\n" +
      '}',
    keywords: 'bosscontext コンテキスト 攻撃 ヘルパー 難易度倍率 分身',
  },
  {
    id: 'calc-spell-bonus',
    name: 'calcSpellBonus / PhaseEndResult',
    category: 'toho-engine',
    signature:
      'function calcSpellBonus(phase: BossPhaseDef, timeLeft: number): number\n' +
      '// = bonusBase（既定 500000）+ bonusPerSec（既定 20000）× 残り時間\n\n' +
      'interface PhaseEndResult {\n' +
      '  index: number\n' +
      '  phase: BossPhaseDef\n' +
      '  captured: boolean  // ノーミス・ノーボムで取得したか\n' +
      '  bonus: number      // 取得時のスペルカードボーナス\n' +
      '  timeout: boolean   // 制限時間切れで終わったか\n' +
      '  last: boolean      // 最終フェイズだったか\n' +
      '}',
    summary:
      'スペルカードボーナスの計算式と、BossController.onPhaseEnd で渡されるフェイズ終了結果。ボーナスは「基礎値＋残り時間×秒単価」で、取得（captured）したときだけ bonus に値が入る。',
    example:
      'boss.onPhaseEnd = (r) => {\n' +
      '  if (r.captured) state.addScore(r.bonus)\n' +
      '  if (r.last) stageClear()\n' +
      '}',
    keywords: 'calcspellbonus スペルボーナス 取得 phaseendresult フェイズ終了',
  },
  {
    id: 'phase-templates',
    name: 'PhaseTemplates',
    category: 'toho-engine',
    signature:
      "type PhaseTemplateId = 'timestop' | 'freeze' | 'clones' | 'laserSweep' | 'mist'\n\n" +
      'type PhaseTemplateFactory = (\n' +
      '  ctx: BossContext, params: Record<string, number>,\n' +
      ') => PhaseTemplateInstance\n\n' +
      'const PhaseTemplates: Record<PhaseTemplateId, PhaseTemplateFactory>',
    summary:
      '実在スペルカードの「仕掛け」を、スペル名ではなく仕掛け名で再利用できるようにしたテンプレート群。BossPhaseDef.template に ID を、params に数値を渡して使う。各テンプレートの主な params（既定値）：timestop（interval 1.7 / count 26 / speed 155 / travel 0.55 / freeze 1.15 / resumeSpeed 100 / color 4）＝撃った弾が途中で止まり一斉に自機へ再加速。freeze（interval 2.3 / count 34 / speed 165 / freezeAt 0.5 / freezeTime 0.85 / gravity 330 / layers 2 / color 4）＝広がった弾が一時停止して落下再始動。clones（count 4 / radius 76 / fireInterval 0.16 / bulletSpeed 108 / shuffle 5 / orbitSpeed 0.45 / color 6 / realOnlyDamage 0）＝複数体に分かれて周回し、本物が周期的に入れ替わる。laserSweep（count 1 / sweepAngle 0.85 / sweepSpeed 0.85 / width 30 / telegraph 0.9 / ringInterval 2.8 / ringCount 16 / ringSpeed 82 / color 0）＝予告つき回転レーザーの往復薙ぎ払い＋リング弾。mist（interval 0.42 / count 3 / speed 38 / grow 7.5 / maxR 17 / color 5 / aimedInterval 1.35 / aimedSpeed 74）＝漂いながら膨らむ泡弾＋狙撃。',
    params: [
      { name: 'template', type: 'PhaseTemplateId', desc: 'BossPhaseDef.template に指定する仕掛け ID' },
      { name: 'params', type: 'Record<string, number>', desc: '弾数・速度・間隔などの調整値。省略したキーはテンプレートの既定値になる' },
    ],
    example:
      '{\n' +
      "  name: '時符「ルナクロック」', hp: 1000, timeLimit: 50,\n" +
      "  template: 'timestop',\n" +
      '  params: { interval: 1.6, count: 30, speed: 160, freeze: 1.2 },\n' +
      '}',
    keywords: 'phasetemplates テンプレート 仕掛け 時止め 凍結 分身 レーザー 霧弾 スペル',
  },
  {
    id: 'stage-script',
    name: 'StageScript / StageEventDef',
    category: 'toho-engine',
    signature:
      'interface DialogueLine {\n' +
      '  speaker: string\n' +
      '  text: string\n' +
      "  side?: 'left' | 'right'\n" +
      '}\n\n' +
      'interface FormationDef {\n' +
      '  enemy: EnemyDef\n' +
      '  count: number\n' +
      '  interval: number  // 出現間隔（秒）\n' +
      "  from: 'top' | 'left' | 'right'\n" +
      '  x?: number; y?: number  // top: 中心x / left,right: 開始y\n' +
      '  spacing?: number        // 編隊の間隔 px\n' +
      '}\n\n' +
      'type StageEventDef =\n' +
      "  | { at: number; type: 'formation'; formation: FormationDef }\n" +
      "  | { at: number; type: 'midboss'; boss: BossDef }\n" +
      "  | { at: number; type: 'boss'; boss: BossDef }\n" +
      "  | { at: number; type: 'background'; bg: string }\n" +
      "  | { at: number; type: 'dialogue'; lines: DialogueLine[] }\n" +
      "  | { at: number; type: 'drop'; item: ItemKind; x?: number; y?: number }\n" +
      "  | { at: number; type: 'message'; text: string }\n" +
      "  | { at: number; type: 'call'; fn: (api: StageApi) => void }\n\n" +
      'interface StageScript {\n' +
      '  id: string\n' +
      '  title: string\n' +
      '  subtitle?: string\n' +
      '  bg?: string  // 背景識別子の初期値\n' +
      '  events: StageEventDef[]\n' +
      '}',
    summary:
      'ステージ1本分のデータ駆動脚本フォーマット。時刻 at（秒）に発火するイベント列で、編隊出現（formation）・中ボス／ボス（midboss / boss）・背景変更・会話・アイテムドロップ・メッセージ・任意処理（call）を並べる。実行は StageRunner が担当する。',
    example:
      'const STAGE1: StageScript = {\n' +
      "  id: 'stage1', title: '第1面', bg: 'lake',\n" +
      '  events: [\n' +
      "    { at: 1, type: 'formation', formation: { enemy: fairy, count: 5, interval: 0.5, from: 'top', x: 120 } },\n" +
      "    { at: 20, type: 'midboss', boss: RUMIA_MID },\n" +
      "    { at: 40, type: 'boss', boss: RUMIA_BOSS },\n" +
      '  ],\n' +
      '}',
    keywords: 'stagescript stageeventdef 脚本 ステージ イベント 編隊 会話 データ駆動',
  },
  {
    id: 'stage-runner',
    name: 'StageRunner / StageApi',
    category: 'toho-engine',
    signature:
      'interface StageApi {\n' +
      '  spawnEnemy: (def: EnemyDef, x: number, y: number, dir: number) => void\n' +
      '  startBoss: (def: BossDef, midboss: boolean) => void\n' +
      '  setBackground: (bg: string) => void\n' +
      '  dialogue: (lines: DialogueLine[]) => void\n' +
      '  dropItem: (kind: ItemKind, x: number, y: number) => void\n' +
      '  message: (text: string) => void\n' +
      '}\n\n' +
      'class StageRunner {\n' +
      '  constructor(script: StageScript, api: StageApi, opts: { width: number; height: number })\n' +
      '  update(dt: number): void\n' +
      '  setPaused(v: boolean): void\n' +
      '  reset(): void\n' +
      '  get finished(): boolean\n' +
      '  t: number; paused: boolean\n' +
      '  readonly script: StageScript\n' +
      '}',
    summary:
      'StageScript を時間軸で実行するランナー。編隊イベントは個別の出現予約に展開され、時刻が来たものから StageApi 経由でゲームシェル側へ通知される。ボス戦や会話の間は setPaused(true) で時計を止める運用を想定している。ゲーム側は StageApi（敵出現・ボス開始・背景・会話・ドロップ・メッセージ）を実装するだけでよい。',
    example:
      'const runner = new StageRunner(STAGE1, {\n' +
      '  spawnEnemy: (def, x, y, dir) => enemies.spawn(def, x, y, dir),\n' +
      '  startBoss: (def, mid) => startBossFight(def, mid),\n' +
      '  setBackground: (bg) => { currentBg = bg },\n' +
      '  dialogue: (lines) => showDialogue(lines),\n' +
      '  dropItem: (kind, x, y) => items.spawn(kind, x, y),\n' +
      '  message: (text) => showMessage(text),\n' +
      '}, { width: 384, height: 448 })\n' +
      '// ボス戦中は止める\n' +
      'runner.setPaused(boss.active)\n' +
      'runner.update(dt)',
    keywords: 'stagerunner stageapi ランナー 実行 脚本 ポーズ',
  },
  {
    id: 'draw-figure',
    name: 'drawFigure / FigureDef',
    category: 'toho-engine',
    signature:
      'interface FigurePalette {\n' +
      '  skin: string; skinShade: string\n' +
      '  hair: string; hairShade: string\n' +
      '  eye: string\n' +
      '  dress: string; dressShade: string  // 服の主色\n' +
      '  sub: string    // ブラウス／エプロン等の副色\n' +
      '  accent: string // リボン等のアクセント色\n' +
      '}\n' +
      "type HairStyle = 'long' | 'medium' | 'short' | 'twin'\n" +
      "type FigureAccessory = 'ribbon' | 'bigRibbon' | 'witchHat' | 'none'\n" +
      "type FigureWings = 'none' | 'bat' | 'crystal' | 'ice' | 'feather'\n\n" +
      'interface FigureDef {\n' +
      '  palette: FigurePalette\n' +
      '  hairStyle: HairStyle\n' +
      '  accessory: FigureAccessory\n' +
      '  wings: FigureWings\n' +
      '  aura?: string  // 背後のオーラ色（rgba文字列）\n' +
      '}\n\n' +
      'interface FigureDrawOpts { t?: number; scale?: number; flip?: boolean; alpha?: number }\n\n' +
      'function drawFigure(\n' +
      '  ctx: CanvasRenderingContext2D,\n' +
      '  def: FigureDef,\n' +
      '  x: number, y: number,\n' +
      '  opts?: FigureDrawOpts,\n' +
      '): void',
    summary:
      'キャラを Canvas ベクターで描くイラスト調フィギュア描画。原点はキャラ中心、素の大きさは約 幅54×高さ46。オーラ→翼→後ろ髪→ドレス→顔→前髪→小物の順にレイヤー描画し、髪の揺れや翼のはためきは opts.t（アニメーション時刻）で動く。配色・髪型・小物・翼種を FigureDef のパラメータで差し替える設計で、原作素材は使わず公式デザインの配色・衣装を参考にした自前描画。新キャラは FigureDef を1つ書けば追加できる。',
    params: [
      { name: 'def', type: 'FigureDef', desc: 'パレット・髪型・小物・翼種の定義' },
      { name: 'opts.t', type: 'number', desc: 'アニメーション時刻。髪と翼の揺れに使う' },
      { name: 'opts.scale / flip / alpha', type: 'number / boolean / number', desc: '拡縮、左右反転、不透明度' },
    ],
    example:
      '// プリセットを使って描く\n' +
      'drawFigure(ctx, RUMIA_FIGURE, boss.x, boss.y, { t: time, scale: 1.4 })\n' +
      '// 独自キャラを定義して描く\n' +
      'const MY_FIGURE: FigureDef = {\n' +
      '  palette: { skin: \'#ffe7d6\', skinShade: \'#f2c9a4\', hair: \'#88ccff\', hairShade: \'#5599dd\',\n' +
      "    eye: '#3344cc', dress: '#4455aa', dressShade: '#2c3870', sub: '#ffffff', accent: '#ffcc44' },\n" +
      "  hairStyle: 'twin', accessory: 'ribbon', wings: 'feather',\n" +
      '}\n' +
      'drawFigure(ctx, MY_FIGURE, x, y, { t: time })',
    keywords: 'drawfigure figuredef キャラ描画 フィギュア イラスト パレット 翼 リボン',
  },
  {
    id: 'figure-presets',
    name: 'キャラプリセット（Figure）',
    category: 'toho-engine',
    signature:
      'const RUMIA_FIGURE: FigureDef    // 金髪・赤目・黒ドレス＋白ブラウス・赤リボン・闇オーラ\n' +
      'function drawRumia(ctx: CanvasRenderingContext2D, x: number, y: number, t?: number, scale?: number): void\n' +
      'const REIMU_FIGURE: FigureDef    // 紅白・大きなリボン・ロングヘア\n' +
      'const MARISA_FIGURE: FigureDef   // 金髪・黒衣・とんがり帽子\n' +
      'const FLANDRE_FIGURE: FigureDef  // 金髪・赤系ドレス・宝石の翼（crystal）\n' +
      'const REMILIA_FIGURE: FigureDef  // 銀青髪・ピンクドレス・蝙蝠翼（bat）\n' +
      'const CIRNO_FIGURE: FigureDef    // 水色髪ツインテール・青ドレス・氷の翼（ice）',
    summary:
      'drawFigure 用のキャラ別 FigureDef プリセット。ルーミア／霊夢／魔理沙／フランドール／レミリア／チルノの6体分が、公式デザインの配色・衣装・小物を参考にしたパラメータで用意されている。drawRumia は RUMIA_FIGURE で drawFigure を呼ぶショートカット。BossDef.figure に渡せばボス描画に使える。',
    example:
      'drawRumia(ctx, boss.x, boss.y, time, 1.4)\n' +
      '// 他キャラは drawFigure ＋ プリセットで\n' +
      'drawFigure(ctx, FLANDRE_FIGURE, x, y, { t: time, scale: 1.4 })',
    keywords: 'プリセット ルーミア 霊夢 魔理沙 フランドール レミリア チルノ figure キャラ',
  },
  // ==========================================================
  // errorDialog
  // ==========================================================
  {
    id: 'show-error-dialog',
    name: 'showErrorDialog',
    category: 'errorDialog',
    signature:
      'function showErrorDialog(title: string, message: string, detail?: string): void\n\n' +
      'interface ErrorDialogRequest {\n' +
      '  title: string\n' +
      '  message: string\n' +
      '  detail?: string\n' +
      '}\n\n' +
      "const ERROR_DIALOG_EVENT = 'webx-error-dialog'",
    summary:
      'テーマ別デザインのエラーウインドウをポップアップ表示する API。呼ぶと webx-error-dialog カスタムイベントが発火し、シェル常駐の ErrorDialogHost が現在の UI モード／テーマに応じた見た目で表示する。複数回呼ぶとキューに入り、1つずつ順に表示される。lib・コンポーネント・ターミナルなど、どこからでも呼べる。天気・為替など外部 API の取得失敗時の表示に使われている。',
    params: [
      { name: 'title', type: 'string', desc: 'ウインドウのタイトル（例：「天気を取得できませんでした」）' },
      { name: 'message', type: 'string', desc: '本文のエラーメッセージ' },
      { name: 'detail', type: 'string', desc: '任意の詳細情報。全スタイル共通で本文下に小さな等幅フォントで表示される' },
    ],
    example:
      "import { showErrorDialog } from '../lib/errorDialog'\n\n" +
      'try {\n' +
      '  const res = await fetch(url)\n' +
      '  if (!res.ok) throw new Error(`HTTP ${res.status}`)\n' +
      '  // …取得成功時の処理\n' +
      '} catch (e) {\n' +
      "  showErrorDialog('天気を取得できませんでした',\n" +
      "    '通信に失敗しました。ネットワーク接続を確認してください。',\n" +
      '    e instanceof Error ? e.message : String(e))\n' +
      '}',
    keywords: 'showerrordialog エラー ウインドウ ポップアップ ダイアログ 通知 失敗',
  },
  {
    id: 'error-dialog-style',
    name: 'errorDialogStyle',
    category: 'errorDialog',
    signature:
      "type ErrorDialogStyle = 'android' | 'ios' | 'windows' | 'macos'\n\n" +
      'function errorDialogStyle(ui: string, theme: string): ErrorDialogStyle',
    summary:
      '現在の UI モード（App の resolvedUi）とテーマ ID から、エラーウインドウの見た目を決める関数。対応は mxui-classic → \'android\'（Android の Material ダイアログ風）、mxui-liquid → \'ios\'（iOS アラート風）、dxui → テーマが macos / ipados なら \'macos\'（macOS アラート風）、それ以外は \'windows\'（Windows ダイアログ風）。判定できない場合は \'windows\' にフォールバックする。通常は ErrorDialogHost が内部で使うため、アプリ側が直接呼ぶ必要はない。',
    params: [
      { name: 'ui', type: 'string', desc: '解決済み UI モード（\'dxui\' | \'mxui-classic\' | \'mxui-liquid\'）' },
      { name: 'theme', type: 'string', desc: 'テーマ ID（ykr-theme）。macos / ipados のときだけ Mac 風になる' },
    ],
    example:
      "const style = errorDialogStyle('dxui', 'macos')  // 'macos'\n" +
      "const style2 = errorDialogStyle('mxui-liquid', 'dark')  // 'ios'",
    keywords: 'errordialogstyle スタイル テーマ android ios windows macos 見た目',
  },
]
