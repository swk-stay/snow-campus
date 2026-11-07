// 効果音。音声ファイルを用意する前の仮として、WebAudio で合成する。
// ブラウザの自動再生制限があるので、最初のタップ／キー入力で AudioContext を起こす。

let ctx: AudioContext | null = null

export function unlockAudio() {
  const resume = () => {
    try {
      ctx ??= new AudioContext()
      if (ctx.state === 'suspended') void ctx.resume()
    } catch {
      ctx = null
    }
  }
  addEventListener('pointerdown', resume)
  addEventListener('keydown', resume)
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, vibrato = 0) {
  if (!ctx) return
  const t0 = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (vibrato > 0) {
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 6
    depth.gain.setValueAtTime(0, t0)
    depth.gain.linearRampToValueAtTime(freq * vibrato, t0 + dur * 0.5)
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(t0)
    lfo.stop(t0 + dur)
  }
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.01)
  amp.gain.setValueAtTime(gain, t0 + dur * 0.7)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(amp).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** 完成ファンファーレ「てってれ～！」 */
export function playFanfare() {
  const notes: [number, number, number][] = [
    // [周波数, 開始, 長さ]
    [783.99, 0, 0.11], // て (G5)
    [1046.5, 0.13, 0.11], // っ (C6)
    [1318.5, 0.26, 0.9], // れ～ (E6)
  ]
  for (const [f, t, d] of notes) {
    tone(f, t, d, 'square', 0.06, d > 0.5 ? 0.012 : 0)
    tone(f / 2, t, d, 'triangle', 0.12)
  }
  // キラキラ
  for (let i = 0; i < 6; i++) tone(2093 * (1 + (i % 3) * 0.25), 0.4 + i * 0.07, 0.15, 'sine', 0.03)
}

/** 購入時の「チャリン」 */
export function playCoin() {
  tone(1318.5, 0, 0.08, 'square', 0.04)
  tone(1975.5, 0.07, 0.25, 'square', 0.04)
}

/** ブリザードの「ゴォォォ…」。白色雑音を帯域通過で鳴らし、通す帯域を上下させて風のうなりにする */
export function playBlizzard(duration: number) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const len = Math.ceil(ctx.sampleRate * (duration + 1))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.2
  band.frequency.setValueAtTime(250, t0)
  band.frequency.exponentialRampToValueAtTime(900, t0 + 0.4)
  for (let t = 0.8; t < duration; t += 0.8) band.frequency.exponentialRampToValueAtTime(t % 1.6 < 0.8 ? 600 : 1100, t0 + t)
  band.frequency.exponentialRampToValueAtTime(200, t0 + duration + 1)
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(0.35, t0 + 0.3)
  amp.gain.setValueAtTime(0.35, t0 + duration)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 1)
  src.connect(band).connect(amp).connect(ctx.destination)
  src.start(t0)
  src.stop(t0 + duration + 1.05)
  // 放った瞬間の低いうなり
  tone(70, 0, 0.9, 'sawtooth', 0.08)
  tone(105, 0.05, 0.7, 'triangle', 0.1)
}

/** 構えたときの「キィン」 */
export function playCharge() {
  tone(880, 0, 0.12, 'sine', 0.05)
  tone(1760, 0.06, 0.3, 'sine', 0.04, 0.01)
}
