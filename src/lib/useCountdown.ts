import { useEffect, useState } from 'react'
import { remaining, startTicker } from './time.ts'

export function useCountdown(targetMs: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (targetMs === null) return
    return startTicker(targetMs, setNow, [document, window])
  }, [targetMs])
  return targetMs === null ? null : remaining(targetMs, now)
}
