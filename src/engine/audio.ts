/**
 * WebX ゲームエンジン：サウンド
 * エンジン音（回転数連動）・スキッド音・ユーロビート風 BGM を WebAudio で合成する。
 * 音源ファイルは使わない。
 */
export class GameAudio {
  private ctx: AudioContext | null = null
  private engOsc: OscillatorNode | null = null
  private engSub: OscillatorNode | null = null
  private engGain: GainNode | null = null
  private skidSrc: AudioBufferSourceNode | null = null
  private skidGain: GainNode | null = null
  private bgmTimer: number | null = null
  private step = 0
  muted = false
  started = false

  start() {
    if (this.ctx) { void this.ctx.resume(); this.started = true; return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    // エンジン音：鋸波＋サブ正弦波 → ローパス
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const sub = ctx.createOscillator()
    sub.type = 'square'
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    filter.Q.value = 2
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(filter)
    sub.connect(filter)
    filter.connect(gain).connect(ctx.destination)
    osc.start()
    sub.start()
    this.engOsc = osc
    this.engSub = sub
    this.engGain = gain
    // スキッド音：ループするノイズ → バンドパス
    const len = ctx.sampleRate
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 850
    bp.Q.value = 1.2
    const sg = ctx.createGain()
    sg.gain.value = 0
    src.connect(bp).connect(sg).connect(ctx.destination)
    src.start()
    this.skidSrc = src
    this.skidGain = sg
    this.started = true
    this.startBgm()
  }

  /** rpm: エンジン回転数, load: 0..1 スロットル, skid: 0..1 横滑り量 */
  update(rpm: number, load: number, skid: number) {
    if (!this.ctx || !this.engOsc || !this.engSub || !this.engGain || !this.skidGain) return
    const t = this.ctx.currentTime
    const f = 38 + (rpm / 1000) * 34
    this.engOsc.frequency.setTargetAtTime(f, t, 0.045)
    this.engSub.frequency.setTargetAtTime(f / 2, t, 0.045)
    const target = this.muted ? 0 : 0.02 + load * 0.055 + Math.min(0.02, rpm / 1000 * 0.002)
    this.engGain.gain.setTargetAtTime(target, t, 0.09)
    this.skidGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.16, skid * 0.16), t, 0.05)
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    o.connect(g).connect(ctx.destination)
    o.start(at)
    o.stop(at + dur + 0.02)
  }

  private kick(at: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, at)
    o.frequency.exponentialRampToValueAtTime(42, at + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.13)
    o.connect(g).connect(ctx.destination)
    o.start(at)
    o.stop(at + 0.15)
  }

  private hat(at: number, vol: number) {
    if (!this.ctx) return
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * 0.04)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.value = vol
    src.connect(f).connect(g).connect(ctx.destination)
    src.start(at)
  }

  private startBgm() {
    if (!this.ctx) return
    const ctx = this.ctx
    const bpm = 154
    const stepDur = 60 / bpm / 2
    const bassLine = [55, 0, 55, 55, 0, 55, 0, 55, 65.4, 0, 65.4, 65.4, 0, 65.4, 0, 65.4, 49, 0, 49, 49, 0, 49, 0, 49, 55, 0, 55, 55, 82.4, 0, 73.4, 0]
    const arp = [440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 880]
    let nextAt = ctx.currentTime + 0.06
    const tick = () => {
      if (!this.ctx) return
      while (nextAt < this.ctx.currentTime + 0.14) {
        const s = this.step
        if (!this.muted) {
          if (s % 2 === 0) this.kick(nextAt)
          if (s % 2 === 1) this.hat(nextAt, 0.11)
          const b = bassLine[s % bassLine.length]
          if (b > 0) this.tone(b, nextAt, stepDur * 0.95, 'sawtooth', 0.15)
          if (s % 4 === 2) this.tone(arp[(s >> 2) % arp.length], nextAt, stepDur * 0.9, 'square', 0.04)
        }
        this.step++
        nextAt += stepDur
      }
    }
    tick()
    this.bgmTimer = window.setInterval(tick, 40)
  }

  dispose() {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer)
    try { this.skidSrc?.stop() } catch { /* noop */ }
    if (this.ctx) void this.ctx.close().catch(() => undefined)
    this.ctx = null
    this.started = false
  }
}
