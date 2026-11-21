// App Store のカタログ。新規アプリはここに登録する（コアには入れない）。
// ユーザーはストアからインストール／アンインストールでき、更新はアプリごとに個別処理する。
// アプリを改良したら、そのアプリの version だけを上げる（WebX 本体のバージョンとは独立）。
export type StoreCategory = 'game' | 'tool' | 'calc' | 'life' | 'study'
export const STORE_CATEGORIES: { id: StoreCategory; label: string; key: string; emoji: string }[] = [
  { id: 'game', label: '🎮 ゲーム', key: 'catGame', emoji: '🎮' },
  { id: 'tool', label: '🧰 ツール', key: 'catTool', emoji: '🧰' },
  { id: 'calc', label: '🧮 計算・変換', key: 'catCalc', emoji: '🧮' },
  { id: 'life', label: '🌿 暮らし', key: 'catLife', emoji: '🌿' },
  { id: 'study', label: '📚 学習', key: 'catStudy', emoji: '📚' },
]
export interface StoreAppDef {
  id: string
  icon: string
  cls: string
  name: string
  desc: string
  version: string
  category: StoreCategory
  /** 最新バージョンの更新内容（更新内容ウィンドウに表示） */
  notes?: string
}

export const STORE_APPS: StoreAppDef[] = [
  {
    id: 'unit',
    icon: '換',
    cls: 'unit',
    name: '単位変換',
    desc: '長さ・重さ・温度・データ量を相互変換するユーティリティ。',
    version: '1.0.0',
    category: 'tool',
  },
  {
    id: 'pomodoro', icon: 'ポ', cls: 'pomodoro', name: 'ポモドーロ',
    desc: '作業25分＋休憩5分の集中タイマー。時間は自由に変更できます。', version: '1.0.0',
    category: 'life',
  },
  {
    id: 'metronome', icon: '拍', cls: 'metronome', name: 'メトロノーム',
    desc: '40〜208 BPM のクリックでテンポをキープ。楽器練習のお供に。', version: '1.0.0',
    category: 'life',
  },
  {
    id: 'whitenoise', icon: '音', cls: 'whitenoise', name: '環境音',
    desc: 'ホワイト／ピンク／ブラウンノイズを合成再生。集中や睡眠に。', version: '1.0.0',
    category: 'life',
  },
  {
    id: 'flashcards', icon: '単', cls: 'flashcards', name: '単語カード',
    desc: '表と裏を登録してめくって覚える暗記カード。端末内に保存。', version: '1.0.0',
    category: 'study',
  },
  {
    id: 'dice', icon: '🎲', cls: 'dice', name: 'サイコロ',
    desc: '最大5個まで振れるサイコロ。合計も自動表示。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'janken', icon: '✊', cls: 'janken', name: 'じゃんけん',
    desc: 'CPU とじゃんけん勝負。勝敗カウント付き。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'numguess', icon: '？', cls: 'numguess', name: '数当てゲーム',
    desc: '1〜100 の数をヒントで当てる定番ゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'omikuji', icon: '籤', cls: 'omikuji', name: 'おみくじ',
    desc: '大吉から大凶まで、今日の運勢をどうぞ。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'passgen', icon: '鍵', cls: 'passgen', name: 'パスワード生成',
    desc: '長さと文字種を選んで安全なパスワードを端末内で生成。', version: '1.0.0',
    category: 'tool',
  },
  {
    id: 'textcount', icon: '字', cls: 'textcount', name: '文字数カウント',
    desc: '文字数・単語数・行数・バイト数をリアルタイム表示。', version: '1.0.0',
    category: 'tool',
  },
  {
    id: 'colorpicker', icon: '色', cls: 'colorpicker', name: 'カラーピッカー',
    desc: '色を選ぶと HEX／RGB／HSL を表示。タップでコピー、濃淡見本つき。', version: '1.0.0',
    category: 'tool',
  },
  {
    id: 'morse', icon: 'モ', cls: 'morse', name: 'モールス信号',
    desc: '英数字をモールス符号に変換して音でも再生できます。', version: '1.0.0',
    category: 'tool',
  },
  {
    id: 'daycalc', icon: '日', cls: 'daycalc', name: '日数計算',
    desc: '2つの日の間隔と、N日後の日付（曜日つき）を計算。', version: '1.0.0',
    category: 'calc',
  },
  {
    id: 'bmi', icon: '体', cls: 'bmi', name: 'BMI計算',
    desc: '身長と体重から BMI と標準体重の目安を表示。', version: '1.0.0',
    category: 'calc',
  },
  {
    id: 'splitbill', icon: '勘', cls: 'splitbill', name: '割り勘',
    desc: '合計と人数から1人分を計算。100円単位などの丸め対応。', version: '1.0.0',
    category: 'calc',
  },
  {
    id: 'currency', icon: '¥', cls: 'currency', name: '通貨変換',
    desc: '主要11通貨を相互変換（2026年11月時点の目安レート、固定値）。', version: '1.0.0',
    category: 'calc',
  },
  {
    id: 'wareki', icon: '暦', cls: 'wareki', name: '和暦変換',
    desc: '西暦と和暦（明治〜令和）を相互変換。', version: '1.0.0',
    category: 'calc',
  },
  {
    id: 'tetris', icon: '🧩', cls: 'tetris', name: 'テトリス',
    desc: '定番の落ちものパズル。ラインを消してハイスコアを目指そう。', version: '1.0.1', notes: 'タッチ操作（タップで回転、スワイプで移動・落下）に対応しました。',
    category: 'game',
  },
  {
    id: 'suika', icon: '🍉', cls: 'suika', name: 'スイカゲーム',
    desc: '果物を落としてくっつけて進化。大きなスイカを作ろう。', version: '1.0.2', notes: '同じ果物が触れたときの合体判定を改善しました。',
    category: 'game',
  },
  {
    id: 'g2048', icon: '🔢', cls: 'g2048', name: '2048',
    desc: 'タイルを滑らせて同じ数字を合体。2048 を目指すパズル。', version: '1.0.1', notes: 'スワイプ操作に対応しました。',
    category: 'game',
  },
  {
    id: 'snake', icon: '🐍', cls: 'snake', name: 'スネーク',
    desc: 'エサを食べて長くなるヘビ。壁と自分に当たると終了。', version: '1.0.1', notes: 'スワイプ操作に対応しました。',
    category: 'game',
  },
  {
    id: 'breakout', icon: '🧱', cls: 'breakout', name: 'ブロック崩し',
    desc: 'バーでボールを打ち返してブロックを全部壊そう。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'minesweeper', icon: '💣', cls: 'minesweeper', name: 'マインスイーパ',
    desc: '数字をヒントに地雷を避ける定番パズル。', version: '1.0.1', notes: '旗モードを追加し、タッチでも旗が置けるようになりました。',
    category: 'game',
  },
  {
    id: 'sudoku', icon: '数', cls: 'sudoku', name: '数独',
    desc: '1〜9 を埋める数字パズル。3段階の難易度つき。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'memory', icon: '🃏', cls: 'memory', name: '神経衰弱',
    desc: 'カードをめくって同じ絵柄のペアを揃える記憶ゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'reversi', icon: '⚫', cls: 'reversi', name: 'リバーシ',
    desc: 'CPU と対戦。挟んでひっくり返して多く取る定番ボードゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'gomoku', icon: '五', cls: 'gomoku', name: '五目並べ',
    desc: 'CPU と対戦。先に5つ並べれば勝ち。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'match3', icon: '💎', cls: 'match3', name: 'マッチ3',
    desc: '宝石を入れ替えて3つ揃えて消すパズル。連鎖ボーナスあり。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'pong', icon: '🏓', cls: 'pong', name: 'ポン',
    desc: 'CPU と打ち合う元祖テニスゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'flappy', icon: '🐤', cls: 'flappy', name: 'フラッピー',
    desc: 'タップで羽ばたいてパイプの隙間を抜けるゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'mole', icon: '🐹', cls: 'mole', name: 'モグラたたき',
    desc: '30秒で何匹たたける？ 反射神経ゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'typing', icon: '⌨️', cls: 'typing', name: 'タイピング',
    desc: 'ローマ字入力の速度を競う60秒タイピング。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'puzzle15', icon: '15', cls: 'puzzle15', name: '15パズル',
    desc: 'タイルをスライドして 1〜15 を順番に並べるパズル。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'hanoi', icon: '🗼', cls: 'hanoi', name: 'ハノイの塔',
    desc: '円盤を全部右端へ移す古典パズル。最少15手。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'blackjack', icon: '♠', cls: 'blackjack', name: 'ブラックジャック',
    desc: '21 に近づけてディーラーに勝つカードゲーム。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'slot', icon: '🎰', cls: 'slot', name: 'スロット',
    desc: 'コインを賭けてリールを回す。7️⃣ 揃いで大当たり。', version: '1.0.0',
    category: 'game',
  },
  {
    id: 'runner', icon: '🦖', cls: 'runner', name: 'ランナー',
    desc: 'ジャンプでサボテンを避け続けるエンドレスラン。', version: '1.0.1', notes: 'Space キーでのジャンプに対応しました。',
    category: 'game',
  },
  {
    id: 'todo', icon: '✓', cls: 'todo', name: 'TODOリスト',
    desc: 'やることを追加してチェックで管理。完了・未完了で絞り込みでき、端末内に保存されます。', version: '1.0.0', notes: '新規アプリです。やることの追加・完了チェック・絞り込み・完了の一括削除ができます。',
    category: 'life',
  },
  {
    id: 'kakeibo', icon: '家', cls: 'kakeibo', name: '家計簿',
    desc: '収入と支出を記録して、月ごとの収支とカテゴリ内訳を確認できます。', version: '1.0.0', notes: '新規アプリです。収入・支出の記録、月ごとの収支とカテゴリ内訳が使えます。',
    category: 'life',
  },
  {
    id: 'habit', icon: '継', cls: 'habit', name: '習慣トラッカー',
    desc: '続けたい習慣を登録して、直近7日分の達成をチェック。連続日数も分かります。', version: '1.0.0', notes: '新規アプリです。習慣の登録と7日分の達成チェック、連続日数の表示ができます。',
    category: 'life',
  },
  {
    id: 'shopping', icon: '買', cls: 'shopping', name: '買い物リスト',
    desc: '買うものと数量をリスト化。買ったらチェックを付けて管理できます。', version: '1.0.0', notes: '新規アプリです。買うものの追加・数量メモ・購入チェックができます。',
    category: 'life',
  },
  {
    id: 'reaction', icon: '⚡', cls: 'reaction', name: '反応速度テスト',
    desc: '緑になった瞬間にタップして反応速度を測定。ベスト記録を保存します。', version: '1.0.0', notes: '新規アプリです。反応速度の測定とベスト記録の保存ができます。',
    category: 'game',
  },
  {
    id: 'simon', icon: '🎵', cls: 'simon', name: 'サイモン',
    desc: '光る色の順番を覚えて同じ順にタップする記憶ゲーム。', version: '1.0.0', notes: '新規アプリです。色の順番を覚える記憶ゲームが遊べます。',
    category: 'game',
  },
  {
    id: 'counter', icon: '数', cls: 'counter', name: 'カウンター',
    desc: '複数のカウンターを作って数を数えるシンプルな道具。名前も変えられます。', version: '1.0.0', notes: '新規アプリです。複数のカウンターで数を数えられます。',
    category: 'tool',
  },
  {
    id: 'roulette', icon: '🎡', cls: 'roulette', name: 'ルーレット',
    desc: '候補を入力してルーレットでランダムに1つ選ぶ、迷ったときの決定ツール。', version: '1.0.0', notes: '新規アプリです。候補からランダムに1つ選べます。',
    category: 'tool',
  },
  {
    id: 'coinflip', icon: '🪙', cls: 'coinflip', name: 'コイントス',
    desc: 'コインを投げて表か裏か。投げた回数の集計つき。', version: '1.0.0', notes: '新規アプリです。コイントスと表・裏の回数集計ができます。',
    category: 'game',
  },
  {
    id: 'countdown', icon: '⏳', cls: 'countdown', name: 'カウントダウン',
    desc: '記念日やイベントまでの残り日数を大きく表示します。', version: '1.0.0', notes: '新規アプリです。イベントまでの残り日数を表示できます。',
    category: 'life',
  },
  {
    id: 'agecalc', icon: '🎂', cls: 'agecalc', name: '年齢計算',
    desc: '生年月日から年齢（歳・か月・日）と生まれてからの日数を計算します。', version: '1.0.0', notes: '新規アプリです。生年月日から年齢と経過日数を計算できます。',
    category: 'calc',
  },
]
