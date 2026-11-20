export type Platform = 'windows' | 'mac' | 'ipad' | 'android' | 'other'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  const platform = navigator.platform || ''
  // iPadOS は Mac と名乗るので、タッチ対応で見分ける
  if (/iPad/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ipad'
  if (/Win/.test(platform) || /Windows/.test(ua)) return 'windows'
  if (/Mac/.test(platform) || /Macintosh/.test(ua)) return 'mac'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export function platformLabel(p: Platform): string {
  switch (p) {
    case 'windows': return 'Windows'
    case 'mac': return 'macOS'
    case 'ipad': return 'iPadOS'
    case 'android': return 'Android'
    default: return 'その他'
  }
}

/** その環境での「Mod」キー（Windows=Ctrl、Mac/iPad=⌘）の表示名 */
export function modLabel(p: Platform): string {
  return p === 'mac' || p === 'ipad' ? '⌘' : 'Ctrl'
}

/** イベントがその環境の Mod キーを押しているか（Windows=Ctrl、Mac/iPad=Cmd、それ以外はどちらでも） */
export function isMod(e: KeyboardEvent | React.KeyboardEvent, p: Platform): boolean {
  if (p === 'mac' || p === 'ipad') return e.metaKey
  if (p === 'windows') return e.ctrlKey
  return e.ctrlKey || e.metaKey
}
