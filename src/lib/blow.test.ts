import { describe, expect, it, vi } from 'vitest'
import { BlowDetector, micErrorStatus, rms, startMic, type MicDeps, type MicStatus } from './blow.ts'

const opts = { threshold: 0.12, sustainMs: 450, cooldownMs: 2500 }

/** Feeds `level` every 30 ms from t0 for `ms`; returns trigger times. */
function feed(d: BlowDetector, level: number | ((t: number) => number), t0: number, ms: number) {
  const hits: number[] = []
  for (let t = t0; t < t0 + ms; t += 30) if (d.push(typeof level === 'number' ? level : level(t), t)) hits.push(t)
  return hits
}

describe('BlowDetector', () => {
  it('computes RMS', () => expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5))

  it('fires on a sustained blow, once', () => {
    const d = new BlowDetector(opts)
    feed(d, 0.01, 0, 1000)
    const hits = feed(d, 0.4, 1000, 1200)
    expect(hits).toHaveLength(1)
    expect(hits[0] - 1000).toBeGreaterThanOrEqual(450)
  })
  it('ignores a brief spike (clap, knock)', () => {
    const d = new BlowDetector(opts)
    feed(d, 0.01, 0, 1000)
    expect(feed(d, (t) => (t < 1150 ? 0.9 : 0.01), 1000, 1000)).toHaveLength(0)
  })
  it('tolerates short dips inside one blow', () => {
    const d = new BlowDetector(opts)
    feed(d, 0.01, 0, 1000)
    expect(feed(d, (t) => (t % 240 < 30 ? 0.05 : 0.4), 1000, 700)).toHaveLength(1)
  })
  it('steady background noise below threshold never fires', () => {
    expect(feed(new BlowDetector(opts), (t) => 0.06 + 0.03 * Math.sin(t / 50), 0, 10_000)).toHaveLength(0)
  })
  it('a loud room raises the bar, a real blow still clears it', () => {
    const d = new BlowDetector(opts)
    expect(feed(d, 0.2, 0, 5000)).toHaveLength(0)
    expect(feed(d, 0.6, 5000, 800)).toHaveLength(1)
  })
  it('respects the cooldown', () => {
    const d = new BlowDetector(opts)
    feed(d, 0.01, 0, 1000)
    expect(feed(d, 0.5, 1000, 2000)).toHaveLength(1)
  })
})

function fakeDeps(over: Partial<MicDeps> = {}) {
  const track = { stop: vi.fn() }
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const analyser = { fftSize: 0, disconnect: vi.fn(), getFloatTimeDomainData: (b: Float32Array) => b.fill(0) }
  const ctx = { createMediaStreamSource: () => source, createAnalyser: () => analyser, close: vi.fn(async () => {}), resume: vi.fn(async () => {}) }
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }) as unknown as MediaStream)
  const deps: MicDeps = {
    mediaDevices: { getUserMedia },
    AudioContext: function () { return ctx } as unknown as typeof AudioContext,
    secure: true,
    now: () => 0,
    ...over,
  }
  return { deps, track, source, analyser, ctx, getUserMedia }
}
const flush = () => new Promise((r) => setTimeout(r, 0))
const statuses = () => {
  const list: MicStatus[] = []
  return { list, on: { status: (s: MicStatus) => list.push(s), blow: vi.fn() } }
}

describe('startMic', () => {
  it('permission granted → listening; stop releases tracks and nodes', async () => {
    const f = fakeDeps()
    const s = statuses()
    const stop = startMic(f.deps, new BlowDetector(opts), s.on)
    await flush()
    expect(s.list).toEqual(['requesting', 'listening'])
    expect(f.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ noiseSuppression: false }) })
    stop()
    stop() // idempotent
    expect(f.track.stop).toHaveBeenCalledTimes(1)
    expect(f.source.disconnect).toHaveBeenCalled()
    expect(f.analyser.disconnect).toHaveBeenCalled()
    expect(f.ctx.close).toHaveBeenCalled()
    expect(s.list.at(-1)).toBe('off')
  })
  it('permission denied', async () => {
    const s = statuses()
    startMic(fakeDeps({ mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotAllowedError')) } }).deps, new BlowDetector(opts), s.on)
    await flush()
    expect(s.list).toEqual(['requesting', 'denied'])
  })
  it('missing microphone', async () => {
    const s = statuses()
    startMic(fakeDeps({ mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('no', 'NotFoundError')) } }).deps, new BlowDetector(opts), s.on)
    await flush()
    expect(s.list).toEqual(['requesting', 'no-device'])
  })
  it('unsupported browser or insecure (http) page', () => {
    for (const over of [{ mediaDevices: undefined }, { secure: false }, { AudioContext: undefined }]) {
      const s = statuses()
      startMic(fakeDeps(over).deps, new BlowDetector(opts), s.on)
      expect(s.list).toEqual(['unsupported'])
    }
  })
  it('stopping while the permission prompt is open still releases the mic', async () => {
    const f = fakeDeps()
    const s = statuses()
    const stop = startMic(f.deps, new BlowDetector(opts), s.on)
    stop()
    await flush()
    expect(f.track.stop).toHaveBeenCalled()
    expect(s.list).toEqual(['requesting'])
  })
  it('maps unknown errors', () => expect(micErrorStatus(new Error('x'))).toBe('error'))
})
