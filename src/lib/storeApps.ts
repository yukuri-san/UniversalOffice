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
    desc: '表と裏を登録してめくって覚える暗記カード。端末内に保存。', version: '1.1.0', notes: 'デッキ（カード一覧）の JSON 書き出し／読み込みに対応しました。',
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
    desc: '英数字をモールス符号に変換して音でも再生できます。', version: '1.0.2', notes: '音が出ない問題への対策として、再生方式を全面変更しました。Web Audioでその場で鳴らす方式をやめ、モールス音声をWAVファイルとして合成し、音楽アプリ等と同じ「メディア再生」の経路で鳴らします。再生できない場合は理由を画面に表示します。「🔑 電鍵」ボタン（押している間だけ鳴る）も同じ方式で鳴ります。',
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
    desc: '主要11通貨を相互変換。「最新レートを取得」でネットから最新レートを反映できます。', version: '1.1.0', notes: '「最新レートを取得」ボタンを追加し、open.er-api.com から最新レートを取得して反映できるようにしました（失敗時は従来の固定レートのまま）。',
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
    desc: '寿司打スタイル：流れる皿の言葉をローマ字で打って食べるゲーム。単語400件超＋短文80件超、3コース。従来の60秒モードも搭載。スマホ・タブレット対応。', version: '1.2.1', notes: '出題ペースをゆっくりにしました。皿の流れる速度を全コースで落とし、出現間隔も広げました。さらに速度をレーンの幅に連動させたので、画面の狭いスマホでは自動でもっと遅くなります。直前の皿が右端から十分離れるまでは次の皿を出さないようにし、皿が詰まって打てなくなることも防ぎました。',
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
    id: 'diary', icon: '日', cls: 'diary', name: '日記',
    desc: '日付ごとに出来事と気分を記録。タイトル・本文の検索や過去の日記の編集もできます。', version: '1.0.0', notes: '新規アプリです。日付ごとの記録・5段階の気分・検索・編集ができます。',
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
  {
    id: 'weather', icon: '🌤️', cls: 'weather', name: '天気',
    desc: '各地の天気予報。今の天気・24時間・7日間を表示し、地名検索もできます。',
    version: '1.0.0', category: 'life',
    notes: '新規追加：現在の天気・体感温度・湿度・風速、24時間予報、7日間予報、地名検索（Open-Meteo）',
  },
  {
    id: 'gallery', icon: '🖼️', cls: 'gallery', name: 'ギャラリー',
    desc: '写真を取り込んで眺めるギャラリー。壁紙設定もできます。写真は端末内に保存。',
    version: '1.0.0', category: 'life',
    notes: '新規追加：写真の取り込み（自動縮小）・グリッド表示・ビューア・壁紙設定・削除。端末内保存',
  },
  {
    id: 'music', icon: '🎵', cls: 'music', name: 'ミュージック',
    desc: '音声ファイルを取り込んで再生するプレイヤー。プレイリストとバックグラウンド再生に対応。',
    version: '1.0.0', category: 'life',
    notes: '新規追加：曲の取り込み・再生/一時停止・前後スキップ・シーク・音量・自動で次へ。端末内保存',
  },
  {
    id: 'level', icon: '⚖', cls: 'level', name: '水平器',
    desc: '端末の傾きを測る水平器', version: '1.0.0', category: 'tool',
    notes: '新規追加（v1.22.0ex）。端末の傾きセンサーで前後・左右の角度と気泡を表示します。',
  },
  {
    id: 'compass', icon: '🧭', cls: 'compass', name: 'コンパス',
    desc: '方角を表示するコンパス', version: '1.0.0', category: 'tool',
    notes: '新規追加（v1.22.0ex）。端末の向きから方角（度数と北・東・南・西）を表示します。',
  },
  {
    id: 'noise', icon: '🔊', cls: 'noise', name: '騒音計',
    desc: 'マイクで音の大きさを測る', version: '1.0.0', category: 'tool',
    notes: '新規追加（v1.22.0ex）。マイク入力から音量の目安（dB）を表示します。音声は録音・送信されません。',
  },
  {
    id: 'speedtest', icon: '🚀', cls: 'speedtest', name: '速度テスト',
    desc: '通信速度（ping/下り/上り）を測定', version: '1.0.1', category: 'tool',
    notes: 'v1.0.1：測定できない不具合を修正（Service Worker の干渉を解消）。Cloudflare に届かない環境では自サイト経由の代替測定に切り替え、失敗時は段階を表示します。',
  },
  {
    id: 'ymmdic', icon: '🗣', cls: 'ymmdic', name: 'YMM4辞書CSV',
    desc: 'YMM4用の辞書CSV（立ち絵空間IDとセリフ）を編集。フォルダ管理・CSV入出力・自動保存対応。',
    version: '1.3.0', category: 'tool',
    notes: 'v1.3.0：空間IDを全ファイル共通に変更しました。どの辞書を開いても同じID一覧が使え、設定画面での名前変更・削除は全ファイルに反映されます（既存のファイル別IDは自動で統合されます）。v1.2.0：空間IDの設定画面を追加。v1.1.0：UI/UX刷新と仮データ削除。',
  },
  {
    id: 'qr', icon: 'QR', cls: 'qr', name: 'QR・バーコード',
    desc: 'QRコードと各種バーコードの作成・読み取り。Wi-Fiや連絡先のQR、JANコードにも対応。',
    version: '1.0.0', category: 'tool',
    notes: '新規追加：QR（テキスト/Wi-Fi/連絡先/メール/電話/SMS）・CODE128・EAN-13/8・UPC・CODE39・ITF-14・MSI・Pharmacode の作成、カメラと画像からの読み取り',
  },
  {
    id: 'tap10', icon: '連', cls: 'tap10', name: '10秒連打',
    desc: '10秒間でボタンを何回連打できるか競うシンプルゲーム。ベスト記録を保存。', version: '1.0.0', notes: '新規アプリです。10秒間の連打回数とベスト記録の保存ができます。',
    category: 'game',
  },
  {
    id: 'aimtrainer', icon: '的', cls: 'aimtrainer', name: 'エイム練習',
    desc: '現れた的をすばやくタップ。30秒で何ヒットできるか競います。', version: '1.0.0', notes: '新規アプリです。30秒間の的当てとベスト記録の保存ができます。',
    category: 'game',
  },
  {
    id: 'lightsout', icon: '灯', cls: 'lightsout', name: 'ライツアウト',
    desc: '押すと自分と上下左右が反転するパズル。全部のライトを消せばクリア。', version: '1.0.0', notes: '新規アプリです。5×5のライト消しパズルが遊べます。',
    category: 'game',
  },
  {
    id: 'mastermind', icon: '推', cls: 'mastermind', name: 'マスターマインド',
    desc: '隠された4つの色の並びを推理して当てるゲーム。ヒントは●と○。', version: '1.0.0', notes: '新規アプリです。色当て推理ゲームが遊べます。',
    category: 'game',
  },
  {
    id: 'trivia', icon: '雑', cls: 'trivia', name: '雑学クイズ',
    desc: 'いろいろなジャンルの雑学4択クイズ。全問正解を目指そう。', version: '1.0.0', notes: '新規アプリです。雑学の4択クイズが遊べます。',
    category: 'game',
  },
  {
    id: 'flagquiz', icon: '旗', cls: 'flagquiz', name: '国旗クイズ',
    desc: '国旗を見て国名を当てる4択クイズ。世界の国旗に挑戦。', version: '1.0.0', notes: '新規アプリです。国旗から国名を当てるクイズが遊べます。',
    category: 'game',
  },
  {
    id: 'nummemory', icon: '憶', cls: 'nummemory', name: '数字記憶',
    desc: '一瞬表示される数字を覚えて入力。正解するたびに桁数が増えます。', version: '1.0.0', notes: '新規アプリです。数字の暗記ゲームとベスト記録の保存ができます。',
    category: 'game',
  },
  {
    id: 'colormatch', icon: '彩', cls: 'colormatch', name: '色マッチ',
    desc: '文字の意味ではなく「色」を答えるストループテスト。30秒勝負。', version: '1.0.0', notes: '新規アプリです。色のストループテストで遊べます。',
    category: 'game',
  },
  {
    id: 'balloonpop', icon: '風', cls: 'balloonpop', name: '風船割り',
    desc: '現れた風船をタップして割るだけ。30秒で何個割れる？', version: '1.0.0', notes: '新規アプリです。30秒間の風船割りとベスト記録の保存ができます。',
    category: 'game',
  },
  {
    id: 'samegame', icon: '消', cls: 'samegame', name: 'セイムゲーム',
    desc: '同じ色のブロックがつながったところを消していくパズル。', version: '1.0.0', notes: '新規アプリです。同色ブロック消しパズルが遊べます。',
    category: 'game',
  },
  {
    id: 'mathdash', icon: '算', cls: 'mathdash', name: '計算ダッシュ',
    desc: '60秒で計算問題に答え続けるスプリントゲーム。連続正解を狙おう。', version: '1.0.0', notes: '新規アプリです。60秒の計算スプリントとベスト記録の保存ができます。',
    category: 'game',
  },
  {
    id: 'shiritori', icon: '詞', cls: 'shiritori', name: 'しりとり判定',
    desc: 'コンピュータと対戦するしりとり。ルール判定はアプリが自動で行います。', version: '1.0.0', notes: '新規アプリです。CPU対戦のしりとり（自動判定つき）が遊べます。',
    category: 'game',
  },
  {
    id: 'kuku', icon: '九', cls: 'kuku', name: '九九れんしゅう',
    desc: '九九の問題が10問出る練習ドリル。かかった時間も表示。', version: '1.0.0', notes: '新規アプリです。九九の10問ドリルができます。',
    category: 'study',
  },
  {
    id: 'drill', icon: '練', cls: 'drill', name: '計算ドリル',
    desc: 'たし算・ひき算・かけ算と、わり算モードの10問ドリル。', version: '1.0.0', notes: '新規アプリです。四則計算の10問ドリルができます。',
    category: 'study',
  },
  {
    id: 'engquiz', icon: '英', cls: 'engquiz', name: '英単語クイズ',
    desc: '基本の英単語の意味を当てる4択クイズ。', version: '1.0.0', notes: '新規アプリです。英単語の意味当てクイズができます。',
    category: 'study',
  },
  {
    id: 'prefquiz', icon: '県', cls: 'prefquiz', name: '都道府県クイズ',
    desc: '都道府県の県庁所在地を当てる4択クイズ。', version: '1.0.0', notes: '新規アプリです。県庁所在地クイズができます。',
    category: 'study',
  },
  {
    id: 'elements', icon: '元', cls: 'elements', name: '元素記号クイズ',
    desc: '元素記号から元素名を当てる4択クイズ。', version: '1.0.0', notes: '新規アプリです。元素記号クイズができます。',
    category: 'study',
  },
  {
    id: 'historyquiz', icon: '史', cls: 'historyquiz', name: '歴史年号クイズ',
    desc: '歴史の出来事が起きた年を当てる4択クイズ。', version: '1.0.0', notes: '新規アプリです。歴史年号クイズができます。',
    category: 'study',
  },
  {
    id: 'kanjiquiz', icon: '漢', cls: 'kanjiquiz', name: '漢字読みクイズ',
    desc: '漢字の読み方を当てる4択クイズ。', version: '1.0.0', notes: '新規アプリです。漢字の読みクイズができます。',
    category: 'study',
  },
  {
    id: 'capitals', icon: '都', cls: 'capitals', name: '首都クイズ',
    desc: '世界の国の首都を当てる4択クイズ。', version: '1.0.0', notes: '新規アプリです。世界の首都クイズができます。',
    category: 'study',
  },
  {
    id: 'sciencequiz', icon: '理', cls: 'sciencequiz', name: '理科クイズ',
    desc: '理科の基礎知識を問う4択クイズ。', version: '1.0.0', notes: '新規アプリです。理科クイズができます。',
    category: 'study',
  },
  {
    id: 'baseconv', icon: '進', cls: 'baseconv', name: '進数変換',
    desc: '2進数・8進数・10進数・16進数を相互変換します。', version: '1.0.0', notes: '新規アプリです。進数の相互変換ができます。',
    category: 'calc',
  },
  {
    id: 'percent', icon: '％', cls: 'percent', name: '割合計算',
    desc: '何％はいくつか、何％増し・引きなどをまとめて計算。', version: '1.0.0', notes: '新規アプリです。割合の基本計算ができます。',
    category: 'calc',
  },
  {
    id: 'taxcalc', icon: '税', cls: 'taxcalc', name: '税込計算',
    desc: '消費税10％・8％の税込・税抜を相互計算します。', version: '1.0.0', notes: '新規アプリです。税込・税抜の計算ができます。',
    category: 'calc',
  },
  {
    id: 'discount', icon: '割', cls: 'discount', name: '割引計算',
    desc: '定価と割引率から、割引後の価格とお得額を計算。', version: '1.0.0', notes: '新規アプリです。割引価格の計算ができます。',
    category: 'calc',
  },
  {
    id: 'loan', icon: '融', cls: 'loan', name: 'ローン計算',
    desc: '借入額・年利・期間から毎月の返済額（元利均等）を試算。', version: '1.0.0', notes: '新規アプリです。ローン返済の概算ができます。',
    category: 'calc',
  },
  {
    id: 'tip', icon: '礼', cls: 'tip', name: 'チップ計算',
    desc: 'お会計にチップを上乗せして、1人あたりまで計算。海外旅行に。', version: '1.0.0', notes: '新規アプリです。チップと割り勘の計算ができます。',
    category: 'calc',
  },
  {
    id: 'salary', icon: '給', cls: 'salary', name: '時給換算',
    desc: '時給から日給・月収・年収の目安と、月収から時給換算を計算。', version: '1.0.0', notes: '新規アプリです。時給と月収の換算ができます。',
    category: 'calc',
  },
  {
    id: 'pace', icon: '速', cls: 'pace', name: 'ペース計算',
    desc: 'ランニングのペース（1kmあたり）とフル・ハーフの予測タイムを計算。', version: '1.0.0', notes: '新規アプリです。ランニングのペース計算ができます。',
    category: 'calc',
  },
  {
    id: 'aspect', icon: '比', cls: 'aspect', name: 'アスペクト比',
    desc: '画面や画像の縦横比と、比率を保ったサイズを計算します。', version: '1.0.0', notes: '新規アプリです。アスペクト比の計算ができます。',
    category: 'calc',
  },
  {
    id: 'gcd', icon: '約', cls: 'gcd', name: '約数・倍数',
    desc: '最大公約数・最小公倍数と、約数の一覧を調べます。', version: '1.0.0', notes: '新規アプリです。最大公約数・最小公倍数・約数の計算ができます。',
    category: 'calc',
  },
  {
    id: 'prime', icon: '素', cls: 'prime', name: '素数判定',
    desc: '数が素数かどうか、素因数分解と次の素数を表示します。', version: '1.0.0', notes: '新規アプリです。素数判定と素因数分解ができます。',
    category: 'calc',
  },
  {
    id: 'combin', icon: '組', cls: 'combin', name: '順列・組合せ',
    desc: '順列 nPr・組合せ nCr・階乗 n! を計算します。', version: '1.0.0', notes: '新規アプリです。順列・組合せ・階乗の計算ができます。',
    category: 'calc',
  },
  {
    id: 'texttools', icon: '変', cls: 'texttools', name: 'テキスト変換',
    desc: '大文字・小文字、全角・半角、改行削除、逆順などの文字列変換集。', version: '1.0.0', notes: '新規アプリです。文字列の一括変換ができます。',
    category: 'tool',
  },
  {
    id: 'jsonfmt', icon: '整', cls: 'jsonfmt', name: 'JSON整形',
    desc: 'JSONの整形・圧縮・形式チェックを行います。', version: '1.0.0', notes: '新規アプリです。JSONの整形と圧縮ができます。',
    category: 'tool',
  },
  {
    id: 'base64', icon: '符', cls: 'base64', name: 'Base64変換',
    desc: 'テキストとBase64の相互変換。日本語にも対応。', version: '1.0.0', notes: '新規アプリです。Base64のエンコード・デコードができます。',
    category: 'tool',
  },
  {
    id: 'urltool', icon: '鎖', cls: 'urltool', name: 'URLエンコード',
    desc: 'URLエンコード（パーセントエンコーディング）の変換ツール。', version: '1.0.0', notes: '新規アプリです。URLエンコード・デコードができます。',
    category: 'tool',
  },
  {
    id: 'uuid', icon: 'ID', cls: 'uuid', name: 'UUID生成',
    desc: 'UUID（バージョン4）を端末内でまとめて生成します。', version: '1.0.0', notes: '新規アプリです。UUIDの一括生成とコピーができます。',
    category: 'tool',
  },
  {
    id: 'hashtool', icon: '＃', cls: 'hashtool', name: '簡易ハッシュ',
    desc: 'テキストのSHA-256・djb2・FNV-1aハッシュを計算します。', version: '1.0.0', notes: '新規アプリです。ハッシュ値の計算ができます。',
    category: 'tool',
  },
  {
    id: 'passcheck', icon: '検', cls: 'passcheck', name: 'パスワード強度',
    desc: 'パスワードの強さをエントロピーでチェック。送信はしません。', version: '1.0.0', notes: '新規アプリです。パスワード強度のチェックができます。',
    category: 'tool',
  },
  {
    id: 'flashlight', icon: '光', cls: 'flashlight', name: 'ライト',
    desc: '画面を明るく光らせる簡易ライト。暖色モードつき。', version: '1.0.0', notes: '新規アプリです。画面ライトが使えます。',
    category: 'tool',
  },
  {
    id: 'ruler', icon: '定', cls: 'ruler', name: '定規',
    desc: '画面に実物を当てて測る定規。実物で目盛りを調整できます。', version: '1.0.0', notes: '新規アプリです。画面定規（目盛り調整つき）が使えます。',
    category: 'tool',
  },
  {
    id: 'mirror', icon: '鏡', cls: 'mirror', name: 'ミラー',
    desc: '内側カメラの映像を左右反転して映す鏡。映像は送信されません。', version: '1.0.0', notes: '新規アプリです。カメラを使ったミラーが使えます。',
    category: 'tool',
  },
  {
    id: 'voicerec', icon: '録', cls: 'voicerec', name: 'ボイスレコーダー',
    desc: 'マイクで録音して再生・保存できるレコーダー。外部送信なし。', version: '1.0.0', notes: '新規アプリです。音声の録音・再生・保存ができます。',
    category: 'tool',
  },
  {
    id: 'amida', icon: '梯', cls: 'amida', name: 'あみだくじ',
    desc: '参加者と景品を入れるだけで、横線ランダムのあみだくじを作成。', version: '1.0.0', notes: '新規アプリです。あみだくじの作成と結果表示ができます。',
    category: 'tool',
  },
  {
    id: 'teams', icon: '分', cls: 'teams', name: 'チーム分け',
    desc: '名前をシャッフルして指定したチーム数に均等に振り分けます。', version: '1.0.0', notes: '新規アプリです。ランダムなチーム分けができます。',
    category: 'tool',
  },
  {
    id: 'scoreboard', icon: '点', cls: 'scoreboard', name: 'スコアボード',
    desc: '複数プレイヤーの得点を管理。スコア順に並び替え、端末内に保存。', version: '1.0.0', notes: '新規アプリです。得点の記録とランキング表示ができます。',
    category: 'tool',
  },
  {
    id: 'tournament', icon: '勝', cls: 'tournament', name: 'トーナメント表',
    desc: '4人・8人の勝ち抜きトーナメント表。勝者を押して進めます。', version: '1.0.0', notes: '新規アプリです。トーナメント表の作成と進行管理ができます。',
    category: 'tool',
  },
  {
    id: 'reading', icon: '読', cls: 'reading', name: '読書記録',
    desc: '読みたい本・読んだ本を状態と評価つきで記録します。', version: '1.0.0', notes: '新規アプリです。本の記録と状態管理ができます。',
    category: 'life',
  },
  {
    id: 'movie', icon: '映', cls: 'movie', name: '映画記録',
    desc: '観た映画を日付・評価・ひとこと感想つきで記録します。', version: '1.0.0', notes: '新規アプリです。映画の記録ができます。',
    category: 'life',
  },
  {
    id: 'plants', icon: '植', cls: 'plants', name: '水やり記録',
    desc: '植物ごとの水やり間隔を管理し、時期が来たらお知らせ表示。', version: '1.0.0', notes: '新規アプリです。水やり記録と次回時期の表示ができます。',
    category: 'life',
  },
  {
    id: 'inventory', icon: '持', cls: 'inventory', name: '持ち物リスト',
    desc: '持ち物と保管場所・個数を記録。名前と場所で検索できます。', version: '1.0.0', notes: '新規アプリです。持ち物と保管場所の管理ができます。',
    category: 'life',
  },
  {
    id: 'expiry', icon: '期', cls: 'expiry', name: '賞味期限メモ',
    desc: '食品の賞味期限を期限の近い順に表示。過ぎたら警告色に。', version: '1.0.0', notes: '新規アプリです。賞味期限の管理ができます。',
    category: 'life',
  },
  {
    id: 'gift', icon: '贈', cls: 'gift', name: 'プレゼントメモ',
    desc: '誰に何をあげた・もらったかを記録。お返しの管理にも。', version: '1.0.0', notes: '新規アプリです。プレゼントの記録ができます。',
    category: 'life',
  },
  {
    id: 'savings', icon: '貯', cls: 'savings', name: '貯金目標',
    desc: '目標金額と現在の貯金額を記録し、達成率をバーで表示。', version: '1.0.0', notes: '新規アプリです。貯金目標と進捗の管理ができます。',
    category: 'life',
  },
  {
    id: 'subs', icon: '契', cls: 'subs', name: 'サブスク管理',
    desc: 'サブスクの月額と更新日を一覧管理。月額・年額の合計も表示。', version: '1.0.0', notes: '新規アプリです。サブスクの月額管理ができます。',
    category: 'life',
  },
  {
    id: 'sleep', icon: '眠', cls: 'sleep', name: '睡眠記録',
    desc: '就寝・起床時刻を記録し、睡眠時間を自動計算。平均睡眠時間も表示します。', version: '1.0.0', notes: '新規アプリです。就寝・起床時刻の記録と睡眠時間の自動計算ができます。',
    category: 'life',
  },
  {
    id: 'recipe', icon: '料', cls: 'recipe', name: 'レシピ帳',
    desc: '料理のレシピを記録。材料・手順を書き留め、料理名や材料で検索できます。', version: '1.0.0', notes: '新規アプリです。料理のレシピ（材料・手順）の記録と検索ができます。',
    category: 'life',
  },
  {
    id: 'water', icon: '水', cls: 'water', name: '水分記録',
    desc: '飲んだ水の量を記録し、1日の目標に対する進み具合を確認できます。', version: '1.0.0', notes: '新規アプリです。飲水量の記録、1日の目標と進捗バー、直近7日の合計が使えます。',
    category: 'life',
  },
  {
    id: 'traingo', icon: '🚃', cls: 'traingo', name: '電車運転シミュレーター3D',
    desc: '電車でGO風・BVE基準の3D運転シミュ。全5駅をノッチ運転し、定時・停止位置で採点。ATSや対向列車も再現。', version: '1.0.0', notes: '新規アプリです。BVE基準の物理（ノッチ・勾配・ジャーク制限）と走行音で、全5駅・約3.9kmの路線を運転できます。', category: 'game',
  },
  {
    id: 'denshaD', icon: '🚆', cls: 'denshaD', name: '電車でDバトル3D',
    desc: '電車でD風の列車バトル。夜の峠路線でライバルと対決し、カーブのドリフトと溝落としで勝負。', version: '1.0.0', notes: '新規アプリです。カーブで列車を流すドリフト、溝落とし、脱線リスク管理でライバル列車と競えます。', category: 'game',
  },
  {
    id: 'mediaconv', icon: '変', cls: 'mediaconv', name: 'メディア変換',
    desc: '動画を GIF／音声（MP3）／WebM に変換。FFmpeg を端末内で実行し、ファイルは外部送信されません。', version: '1.0.0', notes: '新規アプリです。FFmpeg（WASM）で動画を GIF・MP3・WebM に変換できます。初回のみエンジン読み込みにネット接続が必要です。',
    category: 'tool',
  },
  {
    id: 'touge', icon: '🏎️', cls: 'touge', name: '峠ドリフト3D',
    desc: '市街地・高速・峠を自由に走れる3Dオープンワールド。車種選択（ハチロク風5速／GT-R34風6速）、MT/AT、6視点、チェックポイントレースとフリーローム。', version: '3.0.0', notes: '全面刷新：道路に縛られない自由走行のオープンワールド化（市街地グリッド＋環状高速＋峠、信号・街灯・建物コリジョン付き）。物理を速度ベクトル型（グリップ／ドリフト／衝突／坂）に刷新し加速と操作感を改善。車両モデルを角丸造形＋実影で高精細化。UIはアーケード風メーターと円形ミニマップ、地名表示を採用。',
    category: 'game',
  },
]

