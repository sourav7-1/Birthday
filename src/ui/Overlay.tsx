import { useEffect, useMemo, useRef, useState } from 'react'
import { birthday, ui } from '../config/birthday.ts'
import type { Scene } from '../lib/scene.ts'
import { BlowDetector, browserMicDeps, startMic, type MicStatus } from '../lib/blow.ts'
import { TIMING } from '../three/spec.ts'

const delay = (s: number) => ({ '--d': `${s}s` }) as React.CSSProperties

export function CakeTitle({ scene }: { scene: Scene }) {
  // Captured at mount: during the intro the title waits for the cake reveal; on preview it shows at once.
  const [fromIntro] = useState(scene === 'intro')
  return (
    <header className="cake-title">
      <p className="eyebrow reveal" style={delay(fromIntro ? TIMING.introTitleAt : 0)}>{birthday.cakeTitle}</p>
      <h1 className="display reveal" style={delay(fromIntro ? TIMING.introTitleAt + 0.5 : 0.2)}>{birthday.name}</h1>
    </header>
  )
}

/** Sensitivity 0..1 ↔ RMS threshold 0.4..0.03 (more sensitive = lower threshold). */
const toThreshold = (s: number) => 0.4 - s * 0.37
const toSensitivity = (t: number) => (0.4 - t) / 0.37

export function WishPanel({ onBlow, announce }: { onBlow: () => void; announce: (s: string) => void }) {
  const [status, setStatus] = useState<MicStatus>('off')
  const [level, setLevel] = useState(0)
  const [sens, setSens] = useState(() => toSensitivity(birthday.mic.threshold))
  const detector = useMemo(() => new BlowDetector({ ...birthday.mic }), [])
  useEffect(() => detector.setThreshold(toThreshold(sens)), [detector, sens])
  const stopMic = useRef<(() => void) | null>(null)

  // Leaving the wish scene (blow, replay, unmount) always releases the microphone.
  useEffect(() => () => stopMic.current?.(), [])

  const update = (s: MicStatus) => {
    setStatus(s)
    announce(ui.mic[s])
  }
  const start = () => {
    stopMic.current?.()
    stopMic.current = startMic(browserMicDeps(), detector, { status: update, level: setLevel, blow: onBlow })
  }
  const stop = () => {
    stopMic.current?.()
    stopMic.current = null
    update('off')
    setLevel(0)
  }
  const listening = status === 'listening' || status === 'requesting'

  return (
    <section className="panel wish" aria-labelledby={birthday.wishPrompt ? 'wish-prompt' : undefined}>
      {birthday.wishPrompt && <p id="wish-prompt" className="prompt reveal">{birthday.wishPrompt}</p>}
      <div className="actions reveal" style={delay(0.4)}>
        <button className="btn btn-primary btn-large" onClick={onBlow}>{ui.blow}</button>
        {listening
          ? <button className="btn btn-ghost" onClick={stop}>{ui.micStop}</button>
          : <button className="btn btn-ghost" onClick={start}>{ui.micStart}</button>}
      </div>
      <p className="mic-status reveal" style={delay(0.6)}>
        <span className={`mic-dot ${status}`} aria-hidden />
        {ui.mic[status]}
      </p>
      {status === 'listening' && (
        <div className="mic-tools">
          <div className="meter" aria-hidden>
            <span style={{ width: `${Math.min(100, (level / Math.max(0.01, toThreshold(sens))) * 70)}%` }} />
            <i style={{ left: '70%' }} />
          </div>
          <label className="sens" title={ui.sensitivityHint}>
            {ui.sensitivity}
            <input type="range" min={0} max={1} step={0.01} value={sens} onChange={(e) => setSens(Number(e.target.value))} />
          </label>
          <p className="fine">{ui.micPrivacy}</p>
        </div>
      )}
    </section>
  )
}

export function CutPanel({ onCut, busy }: { onCut: () => void; busy: boolean }) {
  return (
    <section className="panel cut">
      <p className="prompt reveal" style={delay(1.6)}>{birthday.cutPrompt}</p>
      {!busy && (
        <div className="actions reveal" style={delay(2.2)}>
          <button className="btn btn-primary btn-large" onClick={onCut}>{ui.cut}</button>
        </div>
      )}
    </section>
  )
}

/** The invitation to pick up the slice. Tapping the slice itself works too; this button is for
 *  keyboards, screen readers, and anyone who would rather tap text. */
export function SlicePanel({ onPick }: { onPick: () => void }) {
  return (
    <section className="panel slice">
      <div className="actions reveal" style={delay(0.6)}>
        <button className="btn btn-primary btn-large slice-prompt" onClick={onPick}>{birthday.slicePrompt}</button>
      </div>
    </section>
  )
}

export function EatingCaption() {
  return (
    <section className="panel eating">
      <p className="prompt reveal" style={delay(TIMING.eatingCaptionAt)}>{birthday.eatingCaption}</p>
    </section>
  )
}

export function Finale({ onReplay, onRecut }: { onReplay: () => void; onRecut: () => void }) {
  const { heading, lines, signature } = birthday.message
  const t0 = TIMING.finaleHeadingAt
  const end = t0 + 1.6 + lines.length * TIMING.finaleLineGap
  return (
    <section className="finale" aria-live="polite">
      <h1 className="display finale-heading reveal slow" style={delay(t0)}>{heading}</h1>
      {lines.map((l, i) => (
        <p className="finale-line reveal" key={i} style={delay(t0 + 1.4 + i * TIMING.finaleLineGap)}>{l}</p>
      ))}
      {signature && <p className="signature reveal" style={delay(end)}>{signature}</p>}
      <div className="finale-actions reveal" style={delay(end + 0.8)}>
        <button className="btn btn-ghost btn-small" onClick={onRecut}>{ui.recut}</button>
        <button className="btn btn-ghost btn-small" onClick={onReplay}>{ui.replay}</button>
      </div>
    </section>
  )
}
