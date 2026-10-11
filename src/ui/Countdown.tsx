import { birthday, fill, ui } from '../config/birthday.ts'
import type { Remaining } from '../lib/time.ts'

const pad = (n: number) => String(n).padStart(2, '0')
/** Bengali numerals: ০১২৩৪৫৬৭৮৯ */
const bn = (s: string | number) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)])

function Unit({ value, label, index }: { value: number; label: string; index: number }) {
  return (
    <div className="unit reveal" style={{ '--d': `${1.1 + index * 0.15}s` } as React.CSSProperties}>
      <span className="digits" aria-hidden>
        {/* Each digit sits in a fixed-width slot and re-mounts on change to replay its fade. */}
        {bn(pad(value)).split('').map((d, i, all) => <span className="digit" key={`${all.length - i}-${d}`}>{d}</span>)}
      </span>
      <span className="unit-label">{label}</span>
    </div>
  )
}

export function Countdown({ r, onEnter }: { r: Remaining; onEnter: () => void }) {
  const spoken = fill(ui.timeLeft, { d: bn(r.days), h: bn(r.hours), m: bn(r.minutes), s: bn(r.seconds) })
  return (
    <main className="screen countdown">
      <p className="eyebrow reveal">{fill(ui.forName, { name: birthday.name })}</p>
      <h1 className="display reveal" style={{ '--d': '0.3s' } as React.CSSProperties}>
        {r.done ? birthday.intro.ready : birthday.intro.title}
      </h1>
      <p className="lede reveal" style={{ '--d': '0.7s' } as React.CSSProperties}>{birthday.intro.subtitle}</p>
      {birthday.showCountdown && (
        <div className="clock" role="timer" aria-label={spoken}>
          <Unit value={r.days} label={ui.units.days} index={0} />
          <Unit value={r.hours} label={ui.units.hours} index={1} />
          <Unit value={r.minutes} label={ui.units.minutes} index={2} />
          <Unit value={r.seconds} label={ui.units.seconds} index={3} />
        </div>
      )}
      {r.done && (
        <button className="btn btn-primary reveal" style={{ '--d': '0.4s' } as React.CSSProperties} onClick={onEnter} autoFocus>
          {ui.enter}
        </button>
      )}
    </main>
  )
}
