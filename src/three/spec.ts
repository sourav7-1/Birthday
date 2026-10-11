// Scene dimensions in world units (≈ metres × 4). Table top is y = 0.
// Everything is derived from these so the cake, candles, knife, lettering and slice stay aligned.

export const STAND = { height: 0.42, plateRadius: 1.35 }
/** Gold-edged cake board sitting on the stand. */
export const BOARD = { radius: 1.2, height: 0.03 }
export const TIER_BOTTOM = { radius: 1.05, height: 0.62, base: STAND.height + BOARD.height }
export const TIER_TOP = { radius: 0.7, height: 0.5, base: TIER_BOTTOM.base + TIER_BOTTOM.height }
export const CAKE_TOP_Y = TIER_TOP.base + TIER_TOP.height
/** Frosting edge roundness — the flat area of a tier top ends at radius - EDGE. */
export const EDGE = 0.06

/** Lathe angle convention: phi = 0 points to +z (towards the camera), position = (r·sin φ, y, r·cos φ). */
export const polar = (r: number, phi: number, y: number) => [r * Math.sin(phi), y, r * Math.cos(phi)] as const
const deg = (d: number) => (d * Math.PI) / 180
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * The slice is a 40° wedge of the top tier at the back-right. The front half of the
 * top carries the lettering and the back-left arc the candles, so neither is cut,
 * and a three-quarter camera from the front-right sees the lettering and the
 * exposed interior together.
 */
export const SLICE_CENTER = deg(120)
export const SLICE_ANGLE = deg(40)
export const SLICE_DIR = [Math.sin(SLICE_CENTER), Math.cos(SLICE_CENTER)] as const
export const SLICE_OUT = 0.24
export const SLICE_LIFT = 0.035
export const SLICE_YAW = -0.12
/** Centroid distance of a circular sector — the slice rotates about this point. */
export const SLICE_CENTROID = (2 * TIER_TOP.radius * Math.sin(SLICE_ANGLE / 2)) / (1.5 * SLICE_ANGLE)
export const inSlice = (phi: number) => Math.abs(wrap(phi - SLICE_CENTER)) < SLICE_ANGLE / 2

export const CANDLE = { count: 6, ringRadius: 0.5, radius: 0.028, height: 0.32 }
/** A back-left arc behind the lettering, clear of the slice. */
export const candleAngles = () => Array.from({ length: CANDLE.count }, (_, k) => deg(155 + k * 20))
export const FLAME_Y = CAKE_TOP_Y + CANDLE.height + 0.012

/** The lettering plate lies flat on the front half of the top tier. */
export const MESSAGE = { width: 1.16, depth: 0.48, z: 0.2 }

/** Splits the message into two balanced lines without changing a single word. */
export function splitMessage(text: string, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/)
  if (words.length < 3) return [words.join(' ')]
  let best = [text], bestW = Infinity
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    const w = Math.max(...lines.map(measure))
    if (w < bestW) [best, bestW] = [lines, w]
  }
  return best
}

/** Knife: local +x runs along the blade from the tip (origin) to the handle; the edge is local y = 0. */
export const KNIFE = { bladeLength: 0.95, bladeHeight: 0.15, handleLength: 0.5 }
/** Rotation that lays the blade along the radial line at angle phi. */
export const knifeYaw = (phi: number) => phi - Math.PI / 2
/** First cut, then second — the two straight sides of the wedge. */
export const CUT_LINES = [SLICE_CENTER - SLICE_ANGLE / 2, SLICE_CENTER + SLICE_ANGLE / 2] as const
/** Heel raised so only the tip meets the frosting first. */
export const KNIFE_TILT = 0.42
export const KNIFE_HOVER_Y = CAKE_TOP_Y + 0.3
/** During the rocking cut the tip sinks this far while the blade levels out. */
export const KNIFE_ROCK_DEPTH = 0.06
export const KNIFE_CUT_Y = TIER_TOP.base + 0.004
/** How far the tip slides out along the line on each sawing stroke. */
export const SAW_STROKE = 0.035
export const KNIFE_OFFSTAGE = { x: 2.6, y: 3.6, z: 1.4, ry: knifeYaw(CUT_LINES[0]) + 0.7, tilt: 0.2 }

/** Camera position, look-at target, and w: the subject width (at the target) that must stay in frame. */
export interface Shot { px: number; py: number; pz: number; tx: number; ty: number; tz: number; w: number }
const shot = (p: [number, number, number], t: [number, number, number], w: number): Shot =>
  ({ px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2], w })

export const SHOTS = {
  dark: shot([0, 4.2, 15], [0, 1.2, 0], 4.0),
  wide: shot([0, 4.0, 12.5], [0, 0.9, 0], 4.0),
  approach: shot([2.4, 3.9, 9.0], [0, 0.9, 0], 3.4),
  /** Looking down onto the top tier so the lettering reads clearly during the reveal. */
  hero: shot([0, 4.3, 3.4], [0, 1.35, 0.1], 1.9),
  /** Cake in the middle band, high enough to read the top: title above, controls below. */
  interaction: shot([0, 4.6, 7.2], [0, 0.85, 0], 3.3),
  /** Three-quarter from the right (~55°): the knife, the top, and the outer side of both
   *  cut lines are in view; the lettering stays readable at an angle. */
  cut: shot([3.9, 4.2, 2.8], [0.15, 1.05, -0.1], 3.0),
  /** A gentle push-in — close enough to see the blade bite, wide enough to see the whole wedge. */
  cutClose: shot([3.3, 3.85, 2.45], [0.2, 1.12, -0.15], 2.8),
  /** Swings a little toward the front to show the slice, its layers and the lettering together. */
  afterCut: shot([3.2, 3.55, 3.3], [0.35, 1.0, -0.2], 3.0),
  /** Cake in the lower third, dark space above for the message. */
  finale: shot([0.6, 3.85, 10.2], [0, 3.0, 0], 3.2),
  /** In front of the cake, looking at the spot where the lifted slice is "eaten". */
  // w is generous: the slice sits halfway to the camera, so it needs the target plane framed wide.
  eat: shot([1.6, 2.6, 4.4], [0.3, 1.3, 0.6], 2.4),
}

// --- Slice pickup and the bites -------------------------------------------------------

/** How far the slice rises straight up before travelling — clears the top tier and its lettering. */
export const PICK_LIFT = 0.62
/** Where the slice's origin (base centroid) stops: halfway from the eat shot's target to its camera,
 *  a little low so the whole slice sits in the middle of the frame. Never closer than ~2 units. */
export const EAT_POINT = (() => {
  const s = SHOTS.eat
  return [s.tx + (s.px - s.tx) * 0.5, s.ty + (s.py - s.ty) * 0.5 - 0.25, s.tz + (s.pz - s.tz) * 0.5] as const
})()
/** Unit vector from the eat point toward the camera (used for the small "bite" nudge). */
export const EAT_TO_CAMERA = (() => {
  const s = SHOTS.eat, d = [s.px - EAT_POINT[0], s.py - EAT_POINT[1], s.pz - EAT_POINT[2]]
  const l = Math.hypot(d[0], d[1], d[2])
  return d.map((v) => v / l) as [number, number, number]
})()
/**
 * Yaw that presents the slice three-quarter on: its tip points 60° to the viewer's left of the
 * camera, so each bite reads as a scalloped notch in the silhouette and across the top, and the
 * fresh bite wall faces the light — rather than the tip pointing straight at the lens, where a
 * bite would barely change the outline.
 */
export const EAT_YAW = (() => {
  const toCam = Math.atan2(SHOTS.eat.px - EAT_POINT[0], SHOTS.eat.pz - EAT_POINT[2])
  return wrap(toCam - Math.PI / 3 - (SLICE_CENTER + Math.PI))
})()
export { wrap as wrapAngle }

/**
 * Bites are taken from the slice's tip. Each is a disc centred just outside the tip (where an
 * unseen eater would be), with a scalloped, tooth-marked rim; the second is larger.
 */
export const BITES = [{ radius: 0.27 }, { radius: 0.42 }]
const BITE_CENTRE_BACK = 0.1

/**
 * The bite edge as points (x, z) in tier-local coordinates, from the first cut line to the second.
 * Everything nearer the tip than this curve has been eaten.
 */
export function biteBoundary(bite: number, steps = 28): [number, number][] {
  const rho = BITES[bite - 1].radius
  const pc = [-BITE_CENTRE_BACK * Math.sin(SLICE_CENTER), -BITE_CENTRE_BACK * Math.cos(SLICE_CENTER)]
  const a0 = SLICE_CENTER - SLICE_ANGLE / 2
  return Array.from({ length: steps + 1 }, (_, j) => {
    const s = j / steps, phi = a0 + s * SLICE_ANGLE
    const u = [Math.sin(phi), Math.cos(phi)]
    // Ray from the tip along phi meets the bite circle at r (the far intersection).
    const b = u[0] * pc[0] + u[1] * pc[1]
    const r = b + Math.sqrt(b * b - (pc[0] ** 2 + pc[1] ** 2) + rho * rho)
    const teeth = 0.014 * Math.sin(Math.PI * 4 * s) ** 2 // four soft tooth scallops
    return [(r + teeth) * u[0], (r + teeth) * u[1]] as [number, number]
  })
}

const TAN_HALF_FOV = Math.tan((35 / 2) * (Math.PI / 180))

/**
 * How far to pull the camera back along its view line so a shot's subject (width w at
 * distance `dist`) fits the screen: narrow portrait screens back off until it fits; short
 * landscape screens (phones on their side) back off a little to clear the text. Never closer.
 */
export const distanceScale = (aspect: number, height: number, dist: number, w: number) =>
  Math.min(2.8, Math.max(1, w / (2 * TAN_HALF_FOV * aspect * dist), height < 520 && aspect > 1 ? 1.3 : 1))

/** Seconds — the single source for DOM reveal delays that accompany the 3D timelines. */
export const TIMING = {
  introTitleAt: 10.6,
  intro: 13.0,
  blowSettle: 1.4,
  cutting: 13.4,
  /** Bengali caption during the bites. */
  eatingCaptionAt: 0.5,
  finaleHeadingAt: 1.8,
  finaleLineGap: 1.1,
}
