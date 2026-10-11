// Local-only blow detection. Audio is analysed in memory frame by frame and
// discarded — nothing is recorded, stored or uploaded.

export interface BlowOptions { threshold: number; sustainMs: number; cooldownMs: number }

export const rms = (buf: Float32Array) => {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

/**
 * Triggers when the level stays above max(threshold, 2.5 × room noise) for sustainMs.
 * Short dips (< 120 ms) inside a blow are tolerated; single spikes are not enough.
 * ponytail: loudness only — talking or a loud room near the mic can also trigger it,
 * which is why the threshold is user-adjustable and the manual button always exists.
 */
export class BlowDetector {
  floor = 0
  private start: number | null = null
  private lastAbove = -Infinity
  private lastTrigger = -Infinity
  private firstT: number | null = null
  opts: BlowOptions
  private calibrateMs: number
  constructor(opts: BlowOptions, calibrateMs = 600) {
    this.opts = opts
    this.calibrateMs = calibrateMs
  }

  setThreshold(threshold: number) {
    this.opts = { ...this.opts, threshold }
  }

  push(level: number, t: number): boolean {
    this.firstT ??= t
    const calibrating = t - this.firstT < this.calibrateMs
    const limit = Math.max(this.opts.threshold, this.floor * 2.5)
    if (calibrating || level < limit) {
      // Room noise follows quiet frames slowly; during calibration it learns faster.
      this.floor += (Math.min(level, this.opts.threshold) - this.floor) * (calibrating ? 0.2 : 0.02)
      if (t - this.lastAbove > 120) this.start = null
      return false
    }
    this.lastAbove = t
    this.start ??= t
    if (t - this.start >= this.opts.sustainMs && t - this.lastTrigger >= this.opts.cooldownMs) {
      this.lastTrigger = t
      this.start = null
      return true
    }
    return false
  }
}

export type MicStatus = 'off' | 'requesting' | 'listening' | 'denied' | 'no-device' | 'unsupported' | 'error'

export interface MicDeps {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>
  AudioContext?: typeof AudioContext
  secure: boolean
  now: () => number
}

export const browserMicDeps = (): MicDeps => ({
  mediaDevices: navigator.mediaDevices,
  AudioContext: window.AudioContext,
  secure: window.isSecureContext,
  now: () => performance.now(),
})

export function micErrorStatus(e: unknown): MicStatus {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'no-device'
  return 'error'
}

/**
 * Opens the mic and calls onBlow when the detector fires. Returns stop(), which
 * releases every track and audio node; safe to call more than once, even mid-request.
 */
export function startMic(
  deps: MicDeps,
  detector: BlowDetector,
  on: { status: (s: MicStatus) => void; level?: (l: number) => void; blow: () => void },
): () => void {
  let stopped = false
  let cleanup = () => {}
  const stop = () => {
    stopped = true
    cleanup()
    cleanup = () => {}
  }
  if (!deps.secure || !deps.mediaDevices?.getUserMedia || !deps.AudioContext) {
    on.status('unsupported')
    return stop
  }
  on.status('requesting')
  deps.mediaDevices
    // Browser noise suppression erases the breathy noise we are looking for.
    .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    .then((stream) => {
      const tracks = stream.getTracks()
      if (stopped) return tracks.forEach((t) => t.stop())
      const ctx = new deps.AudioContext!()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        const level = rms(buf)
        on.level?.(level)
        if (detector.push(level, deps.now())) on.blow()
      }, 30)
      cleanup = () => {
        clearInterval(timer)
        source.disconnect()
        analyser.disconnect()
        tracks.forEach((t) => t.stop())
        void ctx.close().catch(() => {})
        on.status('off')
      }
      void ctx.resume().catch(() => {})
      on.status('listening')
    })
    .catch((e) => {
      if (!stopped) on.status(micErrorStatus(e))
    })
  return stop
}
