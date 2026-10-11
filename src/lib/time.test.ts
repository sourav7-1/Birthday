import { afterEach, describe, expect, it, vi } from 'vitest'
import { birthday } from '../config/birthday.ts'
import { msToNextTick, remaining, resolveTarget, startTicker, validateConfig } from './time.ts'

const T = Date.UTC(2026, 9, 11, 18, 0, 0) // 2026-10-12 00:00 in Dhaka

describe('remaining', () => {
  it('splits into days, hours, minutes, seconds', () => {
    const r = remaining(T, T - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)
    expect(r).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false })
  })
  it('rounds partial seconds up, so 0 is shown only at the exact instant', () => {
    expect(remaining(T, T - 1)).toMatchObject({ seconds: 1, done: false })
    expect(remaining(T, T - 999)).toMatchObject({ seconds: 1, done: false })
    expect(remaining(T, T)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true })
  })
  it('never goes negative for past targets', () => {
    expect(remaining(T, T + 86_400_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true })
  })
  it('schedules ticks on the target second boundaries', () => {
    expect(msToNextTick(T, T - 2500)).toBe(500)
    expect(msToNextTick(T, T - 2000)).toBe(1000)
    expect(msToNextTick(T, T + 5)).toBe(1000)
  })
})

describe('resolveTarget', () => {
  it('Bangladesh: IANA zone and explicit offset agree', () => {
    expect(resolveTarget({ local: '2026-10-12T00:00', timeZone: 'Asia/Dhaka' })).toEqual({ ok: true, value: T })
    expect(resolveTarget({ local: '2026-10-12T00:00', utcOffset: '+06:00' })).toEqual({ ok: true, value: T })
  })
  it('handles negative and half-hour offsets', () => {
    expect(resolveTarget({ local: '2026-10-12T00:00', utcOffset: '-05:30' })).toEqual({ ok: true, value: Date.UTC(2026, 9, 12, 5, 30) })
    expect(resolveTarget({ local: '2026-10-12T00:00', timeZone: 'Asia/Kolkata' })).toEqual({ ok: true, value: Date.UTC(2026, 9, 11, 18, 30) })
  })
  it('applies daylight saving for the date in question', () => {
    // New York is UTC-4 in summer, UTC-5 in winter.
    expect(resolveTarget({ local: '2026-07-01T12:00', timeZone: 'America/New_York' })).toEqual({ ok: true, value: Date.UTC(2026, 6, 1, 16) })
    expect(resolveTarget({ local: '2026-12-01T12:00', timeZone: 'America/New_York' })).toEqual({ ok: true, value: Date.UTC(2026, 11, 1, 17) })
    expect(resolveTarget({ local: '2026-07-01T12:00', timeZone: 'Europe/London' })).toEqual({ ok: true, value: Date.UTC(2026, 6, 1, 11) })
  })
  it('rejects a time skipped by DST', () => {
    const r = resolveTarget({ local: '2026-03-08T02:30', timeZone: 'America/New_York' })
    expect(r.ok).toBe(false)
  })
  it('accepts an ambiguous fall-back time (resolves to one valid instant)', () => {
    const r = resolveTarget({ local: '2026-11-01T01:30', timeZone: 'America/New_York' })
    expect(r.ok && [Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30)].includes(r.value)).toBe(true)
  })
  it.each([
    [{ local: '2026-10-12', timeZone: 'Asia/Dhaka' }],
    [{ local: '2026-02-30T00:00', timeZone: 'Asia/Dhaka' }],
    [{ local: '2026-10-12T24:00', timeZone: 'Asia/Dhaka' }],
    [{ local: 'tomorrow', utcOffset: '+06:00' }],
    [{ local: '2026-10-12T00:00', timeZone: 'Mars/Olympus' }],
    [{ local: '2026-10-12T00:00', utcOffset: '6' }],
    [{ local: '2026-10-12T00:00', utcOffset: '+06:00', timeZone: 'Asia/Dhaka' }],
    [{ local: '2026-10-12T00:00' }],
  ])('rejects invalid %j with a message', (target) => {
    const r = resolveTarget(target)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10)
  })
})

describe('validateConfig', () => {
  it('accepts the shipped config', () => expect(validateConfig(birthday).ok).toBe(true))
  it('lists every problem instead of throwing', () => {
    const r = validateConfig({ ...birthday, name: ' ', target: { local: 'x' }, mic: { ...birthday.mic, threshold: 3 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.split('\n')).toHaveLength(3)
  })
})

describe('startTicker', () => {
  afterEach(() => vi.useRealTimers())

  it('re-reads the clock each second and lands exactly on the target', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T - 2300)
    const seen: number[] = []
    const stop = startTicker(T, (now) => seen.push(remaining(T, now).seconds), [])
    vi.advanceTimersByTime(300)
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([3, 2, 1, 0])
    expect(Date.now()).toBe(T)
    stop()
  })

  it('recovers after tab suspension when the page becomes visible', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T - 3_600_000)
    const doc = new EventTarget()
    let last = 0
    const stop = startTicker(T, (now) => (last = now), [doc])
    // Simulate a suspended tab: wall clock jumps 40 minutes, no timers fired.
    vi.setSystemTime(T - 1_200_000)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(remaining(T, last).minutes).toBe(20)
    stop()
  })

  it('removes listeners and timers on cleanup', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T - 10_000)
    const doc = new EventTarget()
    const tick = vi.fn()
    const stop = startTicker(T, tick, [doc])
    stop()
    tick.mockClear()
    doc.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5000)
    expect(tick).not.toHaveBeenCalled()
  })
})
