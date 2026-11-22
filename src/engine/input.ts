/**
 * WebX ゲームエンジン：入力
 * キーボードとタッチボタンを 1 つの状態に統合する。
 * イベントは「押した瞬間」を取るもの（シフト・カメラ・Nキー長押し判定用）と
 * 「押している間」のものの両方を提供する。
 */
export interface DriveInput {
  steer: number // -1..1
  throttle: boolean
  brake: boolean
  drift: boolean
  neutralHeld: boolean
}

export class Input {
  state: DriveInput = { steer: 0, throttle: false, brake: false, drift: false, neutralHeld: false }
  touch = { steer: 0, throttle: false, brake: false, drift: false }
  private keys = new Set<string>()
  onShiftUp: (() => void) | null = null
  onShiftDown: (() => void) | null = null
  onNeutralTap: (() => void) | null = null
  onCamera: (() => void) | null = null
  private neutralDownAt = 0
  private neutralFired = false
  onNeutralLongPress: (() => void) | null = null
  usesKeyboard = false
  private kd: (e: KeyboardEvent) => void
  private ku: (e: KeyboardEvent) => void

  constructor() {
    this.kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const gameKeys = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'a', 'd', 'w', 's', 'q', 'e', 'n', 'c']
      if (!gameKeys.includes(k)) return
      this.usesKeyboard = true
      if (!e.repeat) {
        if (k === 'e') this.onShiftUp?.()
        if (k === 'q') this.onShiftDown?.()
        if (k === 'c') this.onCamera?.()
        if (k === 'n') { this.neutralDownAt = performance.now(); this.neutralFired = false }
      }
      this.keys.add(k)
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault()
    }
    this.ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'n' && this.keys.has('n')) {
        const held = performance.now() - this.neutralDownAt
        if (held < 450 && !this.neutralFired) this.onNeutralTap?.()
      }
      this.keys.delete(k)
    }
    window.addEventListener('keydown', this.kd)
    window.addEventListener('keyup', this.ku)
  }

  /** 毎フレーム呼ぶ：統合状態の更新と N キー長押し（2秒）の検出 */
  poll() {
    const k = this.keys
    const kbSteer = (k.has('arrowleft') || k.has('a') ? -1 : 0) + (k.has('arrowright') || k.has('d') ? 1 : 0)
    this.state.steer = Math.max(-1, Math.min(1, kbSteer + this.touch.steer))
    this.state.throttle = k.has('arrowup') || k.has('w') || this.touch.throttle
    this.state.brake = k.has('arrowdown') || k.has('s') || this.touch.brake
    this.state.drift = k.has(' ') || this.touch.drift
    this.state.neutralHeld = k.has('n')
    if (k.has('n') && !this.neutralFired && performance.now() - this.neutralDownAt >= 2000) {
      this.neutralFired = true
      this.onNeutralLongPress?.()
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.kd)
    window.removeEventListener('keyup', this.ku)
  }
}
