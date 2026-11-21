// ロック画面用 PIN の保存（ハッシュ化して端末内に保存する。本格的な認証ではなく簡易ロック用）
export function hashPin(pin: string): string {
  let h = 5381
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0
  }
  return `h${h.toString(16)}`
}

export function getPin(): { hash: string; len: number } | null {
  const hash = localStorage.getItem('webx-pin-hash')
  const len = Number(localStorage.getItem('webx-pin-len'))
  if (!hash || !len) return null
  return { hash, len }
}

export function setPin(pin: string): void {
  localStorage.setItem('webx-pin-hash', hashPin(pin))
  localStorage.setItem('webx-pin-len', String(pin.length))
}

export function clearPin(): void {
  localStorage.removeItem('webx-pin-hash')
  localStorage.removeItem('webx-pin-len')
}
