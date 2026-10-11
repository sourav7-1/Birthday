import type { BirthdayConfig } from '../config/birthday.ts'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/

/** Offset (ms) of `timeZone` from UTC at instant `ts`. */
function zoneOffset(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(ts)
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return asUtc - Math.floor(ts / 1000) * 1000
}

/** Turns the configured wall-clock target into one absolute UTC timestamp (ms). */
export function resolveTarget(target: BirthdayConfig['target']): Result<number> {
  const m = LOCAL_RE.exec(target.local ?? '')
  if (!m) return { ok: false, error: `target.local "${target.local}" এই রকম হতে হবে: "2026-10-12T00:00"।` }
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0))
  const wall = Date.UTC(y, mo - 1, d, h, mi, s)
  const back = new Date(wall)
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59 || s > 59)
    return { ok: false, error: `target.local "${target.local}" কোনো সঠিক তারিখ বা সময় নয়।` }

  if (target.timeZone && target.utcOffset)
    return { ok: false, error: 'target.timeZone অথবা target.utcOffset — যেকোনো একটি দাও, দুটো একসাথে নয়।' }

  if (target.utcOffset !== undefined) {
    const o = OFFSET_RE.exec(target.utcOffset)
    if (!o || Number(o[2]) > 14 || Number(o[3]) > 59)
      return { ok: false, error: `target.utcOffset "${target.utcOffset}" এই রকম হতে হবে: "+06:00" বা "-05:30"।` }
    const offMs = (Number(o[2]) * 60 + Number(o[3])) * 60_000 * (o[1] === '-' ? -1 : 1)
    return { ok: true, value: wall - offMs }
  }

  if (target.timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: target.timeZone })
    } catch {
      return { ok: false, error: `target.timeZone "${target.timeZone}" কোনো সঠিক IANA টাইম জোন নয় (যেমন "Asia/Dhaka")।` }
    }
    // Two passes settle the offset across a DST boundary.
    let ts = wall - zoneOffset(wall, target.timeZone)
    ts = wall - zoneOffset(ts, target.timeZone)
    if (ts + zoneOffset(ts, target.timeZone) !== wall)
      return { ok: false, error: `${target.local} সময়টি ${target.timeZone}-এ নেই (ডেলাইট সেভিং পরিবর্তনে বাদ পড়ে)।` }
    return { ok: true, value: ts }
  }

  return { ok: false, error: 'target.timeZone (যেমন "Asia/Dhaka") অথবা target.utcOffset (যেমন "+06:00") দাও।' }
}

export interface Remaining { days: number; hours: number; minutes: number; seconds: number; done: boolean }

/**
 * Whole seconds are rounded UP, so the display reads 00:00:01 until the exact
 * target instant and 0 only once it has actually arrived. Never negative.
 */
export function remaining(targetMs: number, nowMs: number): Remaining {
  const ms = Math.max(0, targetMs - nowMs)
  const total = Math.ceil(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
    done: ms === 0,
  }
}

/** ms until the displayed value next changes — keeps ticks on the target's second boundaries. */
export const msToNextTick = (targetMs: number, nowMs: number) => {
  const ms = targetMs - nowMs
  return ms <= 0 ? 1000 : ms % 1000 || 1000
}

/**
 * Calls onTick(Date.now()) on every displayed-second boundary and whenever the
 * page becomes visible again (timers are throttled/suspended in background tabs).
 * Time is always re-read from the clock, never decremented.
 */
export function startTicker(targetMs: number, onTick: (now: number) => void, wake: EventTarget[]) {
  let timer: ReturnType<typeof setTimeout>
  const tick = () => {
    clearTimeout(timer)
    const now = Date.now()
    onTick(now)
    timer = setTimeout(tick, msToNextTick(targetMs, now))
  }
  const events = ['visibilitychange', 'focus', 'pageshow']
  wake.forEach((t) => events.forEach((e) => t.addEventListener(e, tick)))
  tick()
  return () => {
    clearTimeout(timer)
    wake.forEach((t) => events.forEach((e) => t.removeEventListener(e, tick)))
  }
}

/** Everything that would break the experience, phrased for the developer. */
export function validateConfig(c: BirthdayConfig): Result<number> {
  const t = resolveTarget(c.target)
  const problems = t.ok ? [] : [t.error]
  if (!c.name?.trim()) problems.push('name খালি রাখা যাবে না।')
  if (!c.message?.lines?.length) problems.push('message.lines-এ অন্তত একটি লাইন দাও।')
  if (!c.cakeMessage?.trim()) problems.push('cakeMessage খালি রাখা যাবে না।')
  if (!['gate', 'celebrate', 'message'].includes(c.afterTarget)) problems.push(`afterTarget "${c.afterTarget}" অবশ্যই gate, celebrate অথবা message হতে হবে।`)
  if (!(c.mic.threshold > 0 && c.mic.threshold < 1)) problems.push('mic.threshold ০ থেকে ১-এর মধ্যে হতে হবে।')
  if (!(c.mic.sustainMs >= 0) || !(c.mic.cooldownMs >= 0)) problems.push('mic.sustainMs ও cooldownMs ০ বা তার বেশি হতে হবে।')
  if (c.music && !(c.music.volume >= 0 && c.music.volume <= 1)) problems.push('music.volume ০ থেকে ১-এর মধ্যে হতে হবে।')
  return problems.length ? { ok: false, error: problems.join('\n') } : t
}
