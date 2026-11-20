export type Lang = 'ja' | 'en' | 'zh' | 'ko' | 'th'

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'ko', label: '한국어' },
  { id: 'th', label: 'ไทย' },
]

type Dict = Record<string, string>

const ja: Dict = {
  start: 'スタート',
  word: 'ワードプロセッサ',
  sheet: 'スプレッドシート',
  note: 'メモ帳',
  calendar: 'カレンダー',
  browser: 'ブラウザ',
  files: 'エクスプローラー',
  settings: '設定',
  desktopHint: 'アイコンをタップしてアプリを開いてください',
  dataLocal: 'データはすべて端末内に保存されます',
  shortcuts: 'キーボードショートカット',
  yourEnv: 'あなたの環境',
  language: '言語',
  theme: 'テーマ',
  settingsTitle: '設定',
  minimize: '最小化',
  maximize: '最大化',
  restore: '元に戻す',
  close: '閉じる',
  tile: '5:3 で並べる',
}

const en: Dict = {
  start: 'Start',
  word: 'Word Processor',
  sheet: 'Spreadsheet',
  note: 'Notepad',
  calendar: 'Calendar',
  browser: 'Browser',
  files: 'Explorer',
  settings: 'Settings',
  desktopHint: 'Tap an icon to open an app',
  dataLocal: 'All data is stored on this device',
  shortcuts: 'Keyboard shortcuts',
  yourEnv: 'Your environment',
  language: 'Language',
  theme: 'Theme',
  settingsTitle: 'Settings',
  minimize: 'Minimize',
  maximize: 'Maximize',
  restore: 'Restore',
  close: 'Close',
  tile: 'Tile 5:3',
}

const zh: Dict = {
  start: '开始',
  word: '文字处理',
  sheet: '电子表格',
  note: '记事本',
  calendar: '日历',
  browser: '浏览器',
  files: '文件资源管理器',
  settings: '设置',
  desktopHint: '点按图标打开应用',
  dataLocal: '所有数据都保存在本设备上',
  shortcuts: '键盘快捷键',
  yourEnv: '您的环境',
  language: '语言',
  theme: '主题',
  settingsTitle: '设置',
  minimize: '最小化',
  maximize: '最大化',
  restore: '还原',
  close: '关闭',
  tile: '以 5:3 平铺',
}

const ko: Dict = {
  start: '시작',
  word: '워드 프로세서',
  sheet: '스프레드시트',
  note: '메모장',
  calendar: '캘린더',
  browser: '브라우저',
  files: '탐색기',
  settings: '설정',
  desktopHint: '아이콘을 눌러 앱을 여세요',
  dataLocal: '모든 데이터는 이 기기에 저장됩니다',
  shortcuts: '키보드 단축키',
  yourEnv: '사용 환경',
  language: '언어',
  theme: '테마',
  settingsTitle: '설정',
  minimize: '최소화',
  maximize: '최대화',
  restore: '복원',
  close: '닫기',
  tile: '5:3으로 나란히',
}

const th: Dict = {
  start: 'เริ่ม',
  word: 'โปรแกรมประมวลผลคำ',
  sheet: 'สเปรดชีต',
  note: 'สมุดบันทึก',
  calendar: 'ปฏิทิน',
  browser: 'เบราว์เซอร์',
  files: 'ตัวสำรวจไฟล์',
  settings: 'การตั้งค่า',
  desktopHint: 'แตะไอคอนเพื่อเปิดแอป',
  dataLocal: 'ข้อมูลทั้งหมดเก็บไว้ในอุปกรณ์นี้',
  shortcuts: 'แป้นพิมพ์ลัด',
  yourEnv: 'สภาพแวดล้อมของคุณ',
  language: 'ภาษา',
  theme: 'ธีม',
  settingsTitle: 'การตั้งค่า',
  minimize: 'ย่อเล็กสุด',
  maximize: 'ขยายใหญ่สุด',
  restore: 'คืนค่า',
  close: 'ปิด',
  tile: 'เรียงแบบ 5:3',
}

export const DICTS: Record<Lang, Dict> = { ja, en, zh, ko, th }

export function translate(lang: Lang, key: string): string {
  return DICTS[lang][key] ?? DICTS.ja[key] ?? key
}
