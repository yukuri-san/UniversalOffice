// App Store のカタログ。新規アプリはここに登録する（コアには入れない）。
// ユーザーはストアからインストール／アンインストールでき、更新はアプリごとに個別処理する。
// アプリを改良したら、そのアプリの version だけを上げる（WebX 本体のバージョンとは独立）。
export interface StoreAppDef {
  id: string
  icon: string
  cls: string
  name: string
  desc: string
  version: string
}

export const STORE_APPS: StoreAppDef[] = [
  {
    id: 'unit',
    icon: '換',
    cls: 'unit',
    name: '単位変換',
    desc: '長さ・重さ・温度・データ量を相互変換するユーティリティ。',
    version: '1.0.0',
  },
  {
    id: 'pomodoro', icon: 'ポ', cls: 'pomodoro', name: 'ポモドーロ',
    desc: '作業25分＋休憩5分の集中タイマー。時間は自由に変更できます。', version: '1.0.0',
  },
  {
    id: 'metronome', icon: '拍', cls: 'metronome', name: 'メトロノーム',
    desc: '40〜208 BPM のクリックでテンポをキープ。楽器練習のお供に。', version: '1.0.0',
  },
  {
    id: 'whitenoise', icon: '音', cls: 'whitenoise', name: '環境音',
    desc: 'ホワイト／ピンク／ブラウンノイズを合成再生。集中や睡眠に。', version: '1.0.0',
  },
  {
    id: 'flashcards', icon: '単', cls: 'flashcards', name: '単語カード',
    desc: '表と裏を登録してめくって覚える暗記カード。端末内に保存。', version: '1.0.0',
  },
  {
    id: 'dice', icon: '🎲', cls: 'dice', name: 'サイコロ',
    desc: '最大5個まで振れるサイコロ。合計も自動表示。', version: '1.0.0',
  },
  {
    id: 'janken', icon: '✊', cls: 'janken', name: 'じゃんけん',
    desc: 'CPU とじゃんけん勝負。勝敗カウント付き。', version: '1.0.0',
  },
  {
    id: 'numguess', icon: '？', cls: 'numguess', name: '数当てゲーム',
    desc: '1〜100 の数をヒントで当てる定番ゲーム。', version: '1.0.0',
  },
  {
    id: 'omikuji', icon: '籤', cls: 'omikuji', name: 'おみくじ',
    desc: '大吉から大凶まで、今日の運勢をどうぞ。', version: '1.0.0',
  },
  {
    id: 'passgen', icon: '鍵', cls: 'passgen', name: 'パスワード生成',
    desc: '長さと文字種を選んで安全なパスワードを端末内で生成。', version: '1.0.0',
  },
  {
    id: 'textcount', icon: '字', cls: 'textcount', name: '文字数カウント',
    desc: '文字数・単語数・行数・バイト数をリアルタイム表示。', version: '1.0.0',
  },
  {
    id: 'colorpicker', icon: '色', cls: 'colorpicker', name: 'カラーピッカー',
    desc: '色を選ぶと HEX／RGB／HSL を表示。タップでコピー、濃淡見本つき。', version: '1.0.0',
  },
  {
    id: 'morse', icon: 'モ', cls: 'morse', name: 'モールス信号',
    desc: '英数字をモールス符号に変換して音でも再生できます。', version: '1.0.0',
  },
  {
    id: 'daycalc', icon: '日', cls: 'daycalc', name: '日数計算',
    desc: '2つの日の間隔と、N日後の日付（曜日つき）を計算。', version: '1.0.0',
  },
  {
    id: 'bmi', icon: '体', cls: 'bmi', name: 'BMI計算',
    desc: '身長と体重から BMI と標準体重の目安を表示。', version: '1.0.0',
  },
  {
    id: 'splitbill', icon: '勘', cls: 'splitbill', name: '割り勘',
    desc: '合計と人数から1人分を計算。100円単位などの丸め対応。', version: '1.0.0',
  },
  {
    id: 'currency', icon: '¥', cls: 'currency', name: '通貨変換',
    desc: '主要11通貨を相互変換（2026年11月時点の目安レート、固定値）。', version: '1.0.0',
  },
  {
    id: 'wareki', icon: '暦', cls: 'wareki', name: '和暦変換',
    desc: '西暦と和暦（明治〜令和）を相互変換。', version: '1.0.0',
  },
]
