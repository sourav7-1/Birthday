import { describe, expect, it } from 'vitest'
import { initialScene, nextScene, shouldAutoEnter, type Scene, type SceneEvent } from './scene.ts'

const base = { targetMs: 1000, afterTarget: 'gate' as const, preview: null, allowPreview: true }

describe('initialScene', () => {
  it('counts down before the target', () => {
    expect(initialScene({ ...base, nowMs: 0 })).toEqual({ scene: 'countdown', preview: false })
  })
  it('after the target follows afterTarget', () => {
    expect(initialScene({ ...base, nowMs: 2000 }).scene).toBe('countdown')
    expect(initialScene({ ...base, nowMs: 2000, afterTarget: 'celebrate' }).scene).toBe('intro')
    expect(initialScene({ ...base, nowMs: 2000, afterTarget: 'message' }).scene).toBe('message')
  })
  it('preview jumps to a scene without touching the target', () => {
    expect(initialScene({ ...base, nowMs: 0, preview: 'wish' })).toEqual({ scene: 'wish', preview: true })
  })
  it('ignores preview when disabled or unknown', () => {
    expect(initialScene({ ...base, nowMs: 0, preview: 'wish', allowPreview: false }).scene).toBe('countdown')
    expect(initialScene({ ...base, nowMs: 0, preview: 'party' }).scene).toBe('countdown')
  })
})

describe('nextScene', () => {
  const run = (from: Scene, events: SceneEvent[]) => events.reduce(nextScene, from)

  it('walks the whole experience', () => {
    expect(run('countdown', ['enter', 'introDone', 'blow', 'blown', 'cut', 'cutDone', 'pick', 'picked', 'bitten', 'eaten'])).toBe('message')
  })
  it('the slice can only be picked once cutting has finished, and only once', () => {
    expect(run('cutting', ['pick'])).toBe('cutting')
    expect(run('cutReady', ['pick', 'picked'])).toBe('cutReady')
    expect(run('cutting', ['cutDone', 'pick', 'pick'])).toBe('pickup')
  })
  it('the second bite comes only after the first', () => {
    expect(run('pickup', ['bitten', 'eaten'])).toBe('pickup')
    expect(run('pickup', ['picked', 'eaten'])).toBe('firstBite')
    expect(run('pickup', ['picked', 'bitten', 'eaten'])).toBe('message')
  })
  it('cut again returns from the finale to a whole cake ready to cut', () => {
    expect(run('message', ['recut'])).toBe('cutReady')
    expect(run('firstBite', ['recut'])).toBe('firstBite')
  })
  it('ignores duplicate and out-of-order events', () => {
    expect(run('wish', ['blow', 'blow'])).toBe('blowing')
    expect(run('blowing', ['blow', 'cut'])).toBe('blowing')
    expect(run('cutReady', ['cut', 'cut', 'blow'])).toBe('cutting')
    expect(run('countdown', ['blow', 'cut', 'cutDone'])).toBe('countdown')
    expect(run('message', ['enter', 'cutDone'])).toBe('message')
  })
  it('replay returns to the intro from anywhere, repeatedly', () => {
    expect(run('message', ['replay'])).toBe('intro')
    expect(run('message', ['replay', 'introDone', 'blow', 'blown', 'cut', 'cutDone', 'replay'])).toBe('intro')
    for (const s of ['sliceReady', 'pickup', 'firstBite', 'secondBite'] as Scene[]) expect(run(s, ['replay'])).toBe('intro')
  })
})

describe('shouldAutoEnter', () => {
  const o = { scene: 'countdown' as Scene, reached: true, autoStart: true, watchedLive: true }
  it('enters automatically for a visitor watching the countdown hit zero', () => expect(shouldAutoEnter(o)).toBe(true))
  it('waits for a manual Enter otherwise', () => {
    expect(shouldAutoEnter({ ...o, autoStart: false })).toBe(false)
    expect(shouldAutoEnter({ ...o, reached: false })).toBe(false)
    expect(shouldAutoEnter({ ...o, watchedLive: false })).toBe(false) // opened after the target, or preview
    expect(shouldAutoEnter({ ...o, scene: 'intro' })).toBe(false) // already entered: fires once
  })
  it('manual enter works whether or not the target was reached', () => {
    expect(nextScene('countdown', 'enter')).toBe('intro')
  })
})
