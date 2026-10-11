import { birthday } from '../config/birthday.ts'

// Sound is optional everywhere: every method silently does nothing when audio is
// unavailable, blocked by autoplay policy, or muted.

let ctx: AudioContext | null = null
let music: HTMLAudioElement | null = null
let muted = true
let musicBroken = false

/** Must be called from a user gesture. Resolves to whether sound is now playing/allowed. */
export async function enableSound(): Promise<boolean> {
  try {
    ctx ??= new AudioContext()
    await ctx.resume()
  } catch {
    return false
  }
  setMuted(false)
  if (birthday.music && !musicBroken) {
    music ??= Object.assign(new Audio(birthday.music.src), { loop: true, volume: birthday.music.volume })
    music.onerror = () => (musicBroken = true) // missing file: keep going without music
    await music.play().catch(() => {})
  }
  return ctx.state === 'running'
}

export function setMuted(m: boolean) {
  muted = m
  if (music) music.muted = m
}

/** Soft fade for the finale, so the music sits under the message. */
export function duckMusic(volume = 0.5) {
  if (!music || !birthday.music) return
  const from = music.volume, to = birthday.music.volume * volume, t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 2500)
    if (music) music.volume = from + (to - from) * k
    if (k < 1) requestAnimationFrame(step)
  }
  step()
}

/** Back to the start for a replay. */
export function resetMusic() {
  if (!music || !birthday.music) return
  music.currentTime = 0
  music.volume = birthday.music.volume
}

/** Filtered noise burst with a decay curve — the basis of every soft effect here. */
function noise(seconds: number, freq: number, q: number, volume: number, curve = 2) {
  if (!ctx || muted || ctx.state !== 'running') return
  const len = Math.round(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** curve
  const src = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  src.buffer = buf
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  gain.gain.value = volume
  src.connect(filter).connect(gain).connect(ctx.destination)
  src.onended = () => src.disconnect()
  src.start()
}

/** A soft low knock — the slice settling on the tier below. */
function thump() {
  if (!ctx || muted || ctx.state !== 'running') return
  const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime
  osc.frequency.setValueAtTime(160, t)
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.2)
  gain.gain.setValueAtTime(0.18, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
  osc.connect(gain).connect(ctx.destination)
  osc.onended = () => osc.disconnect()
  osc.start(t)
  osc.stop(t + 0.26)
}

export type SoundEffect = 'puff' | 'touch' | 'slice' | 'board' | 'bite'

/** All effects are synthesised (no audio files) and silent unless the visitor enabled sound. */
export function sfx(name: SoundEffect) {
  if (name === 'puff') noise(0.6, 900, 0.6, 0.35) // candles going out
  else if (name === 'touch') noise(0.08, 3200, 1.2, 0.12, 3) // steel meeting frosting
  else if (name === 'slice') noise(1.1, 1700, 0.8, 0.1, 0.8) // blade drawing through sponge
  else if (name === 'bite') noise(0.16, 2400, 0.7, 0.1, 1.5) // a soft bite into sponge
  else thump()
}
