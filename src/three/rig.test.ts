import { describe, expect, it, vi } from 'vitest'
import { birthday } from '../config/birthday.ts'
import type { SceneEvent } from '../lib/scene.ts'
import { createRig, sceneTimeline, updateCuts, type Rig, type Sfx } from './rig.ts'
import {
  CAKE_TOP_Y, CANDLE, CUT_LINES, EDGE, KNIFE_CUT_Y, KNIFE_TILT, MESSAGE, SHOTS, SLICE_ANGLE, SLICE_CENTER, SLICE_CENTROID,
  SLICE_DIR, SLICE_OUT, SLICE_YAW, TIER_BOTTOM, TIER_TOP, TIMING, candleAngles, distanceScale, inSlice, knifeYaw, polar,
  splitMessage, BITES, EAT_POINT, EAT_YAW, PICK_LIFT, SHOTS as S, biteBoundary, wrapAngle,
} from './spec.ts'

const finish = (scene: Parameters<typeof sceneTimeline>[0], rig: Rig, reduced = false) => {
  const events: SceneEvent[] = []
  const tl = sceneTimeline(scene, rig, { reduced, dispatch: (e) => events.push(e) })
  tl.progress(1)
  return { events, tl }
}

/** Plays the cutting timeline in 1/60 s steps, running updateCuts each frame like useFrame does. */
function playCut(rig: Rig, onFrame: (t: number) => void = () => {}) {
  const events: SceneEvent[] = [], sounds: [number, Sfx][] = []
  let t = 0
  const tl = sceneTimeline('cutting', rig, { reduced: false, dispatch: (e) => events.push(e), sfx: (s) => sounds.push([t, s]) })
  tl.pause()
  for (; t <= tl.duration() + 0.02; t += 1 / 60) {
    tl.seek(t, false)
    updateCuts(rig)
    onFrame(t)
  }
  return { events, sounds, tl }
}

/** Distance from point (x, z) to the ray from the origin at lathe angle phi. */
const distToRay = (x: number, z: number, phi: number) => {
  const dx = Math.sin(phi), dz = Math.cos(phi), along = x * dx + z * dz
  return along < 0 ? Math.hypot(x, z) : Math.abs(x * dz - z * dx)
}

describe('scene timelines', () => {
  it('intro rises over the lettering, ends lit at the interaction shot, then signals', () => {
    const rig = createRig()
    const tl = sceneTimeline('intro', rig, { reduced: false, dispatch: vi.fn() })
    tl.seek(9.5)
    expect(rig.cam).toMatchObject(SHOTS.hero)
    const events: SceneEvent[] = []
    const tl2 = sceneTimeline('intro', createRig(), { reduced: false, dispatch: (e) => events.push(e) })
    tl2.progress(1)
    expect(events).toEqual(['introDone'])
    expect(tl2.duration()).toBeCloseTo(TIMING.intro, 0)
    tl.progress(1)
    expect(rig.cam).toMatchObject(SHOTS.interaction)
    expect(rig.flames.every((f) => f.v === 1)).toBe(true)
  })
  it('blowing extinguishes every flame, starts smoke, then signals blown', () => {
    const rig = createRig()
    finish('intro', rig)
    expect(finish('blowing', rig).events).toEqual(['blown'])
    expect(rig.flames.every((f) => f.v === 0)).toBe(true)
    expect(rig.smokeAt.every((t) => t > 0)).toBe(true)
  })
  it('cutReady waits for the visitor with the knife above the first line, tip lowered', () => {
    const rig = createRig()
    expect(finish('cutReady', rig).events).toEqual([])
    expect(rig.knife).toMatchObject({ x: 0, z: 0, show: 1 })
    expect(rig.knife.ry).toBeCloseTo(knifeYaw(CUT_LINES[0]), 4)
    expect(rig.knife.tilt).toBeCloseTo(KNIFE_TILT, 4)
    expect(rig.knife.y).toBeGreaterThan(CAKE_TOP_Y)
  })
})

describe('knife ↔ cake contact (acceptance 1–4)', () => {
  const prepared = () => {
    const rig = createRig()
    finish('cutReady', rig)
    return rig
  }

  it('the tip rests on the frosting, with no cut yet, before any downward cutting starts', () => {
    const rig = prepared()
    const contacts: number[] = []
    playCut(rig, (t) => {
      const k = rig.knife
      if (Math.abs(k.y - CAKE_TOP_Y) < 1e-4 && k.tilt > KNIFE_TILT - 1e-3) {
        contacts.push(t)
        // Touching, heel raised: only the tip meets the surface; this line is not yet cut.
        const line = CUT_LINES.findIndex((l) => Math.abs(k.ry - knifeYaw(l)) < 0.01)
        expect(rig.cuts[line].top).toBe(0)
        expect(rig.cuts[line].depth).toBe(0)
      }
    })
    // Contact is held for a visible moment on both lines (≥ 0.3 s each).
    expect(contacts.filter((t) => t < 4).length / 60).toBeGreaterThan(0.3)
    expect(contacts.filter((t) => t > 5).length / 60).toBeGreaterThan(0.3)
  })

  it('the blade stays on its line and the cut only ever covers ground the edge has passed', () => {
    const rig = prepared()
    let prev = rig.cuts.map((c) => ({ ...c }))
    playCut(rig, () => {
      const k = rig.knife
      rig.cuts.forEach((c, i) => {
        // Cuts never shrink, and only grow while the blade is on that line, below the surface.
        expect(c.top).toBeGreaterThanOrEqual(prev[i].top)
        if (c.top > prev[i].top || c.depth > prev[i].depth) {
          expect(k.ry).toBeCloseTo(knifeYaw(CUT_LINES[i]), 2)
          expect(k.y).toBeLessThan(CAKE_TOP_Y)
          // The tip may saw outward along the line, never sideways off it.
          expect(Math.abs(k.x * Math.cos(CUT_LINES[i]) - k.z * Math.sin(CUT_LINES[i]))).toBeLessThan(1e-3)
          // The groove ends exactly where the edge crosses the top surface.
          const along = k.x * Math.sin(CUT_LINES[i]) + k.z * Math.cos(CUT_LINES[i])
          const reach = k.tilt < 1e-4 ? TIER_TOP.radius : along + (CAKE_TOP_Y - k.y) / Math.tan(k.tilt)
          expect(c.top * TIER_TOP.radius).toBeLessThanOrEqual(Math.min(TIER_TOP.radius, reach) + 1e-6)
        }
      })
      prev = rig.cuts.map((c) => ({ ...c }))
    })
    for (const c of rig.cuts) {
      expect(c.top).toBe(1)
      expect(c.depth).toBeCloseTo((CAKE_TOP_Y - KNIFE_CUT_Y) / TIER_TOP.height, 3) // down to the tier below
    }
  })

  it('the slice moves only after both cuts are complete and the knife has lifted clear', () => {
    const rig = prepared()
    let firstMove = -1
    playCut(rig, (t) => {
      if (rig.slice > 0 && firstMove < 0) {
        firstMove = t
        expect(rig.cuts.every((c) => c.top === 1 && c.depth > 0.98)).toBe(true)
        expect(rig.knife.y).toBeGreaterThan(CAKE_TOP_Y)
      }
    })
    expect(firstMove).toBeGreaterThan(0)
  })

  it('fires touch → slice → touch → slice → board, and signals cutDone once', () => {
    const rig = prepared()
    const { events, sounds } = playCut(rig)
    // Per cut: the tip touches, then a sound for each of the two sawing stages.
    expect(sounds.map(([, s]) => s)).toEqual(['touch', 'slice', 'slice', 'touch', 'slice', 'slice', 'board'])
    expect(events).toEqual(['cutDone'])
    expect(rig.slice).toBe(SLICE_OUT)
    expect(rig.sliceLift).toBe(0) // back down on the tier — not floating
    expect(rig.knife.show).toBe(0)
    expect(rig.confettiAt).toBeGreaterThan(0)
    expect(rig.crumbsAt.every((t) => t > 0)).toBe(true)
  })
})

describe('slice separation (acceptance 5–6)', () => {
  /** Slice outline points (top-down) for a given outward travel and yaw. */
  const outline = (out: number, yaw: number) => {
    const pivot = [SLICE_DIR[0] * SLICE_CENTROID, SLICE_DIR[1] * SLICE_CENTROID]
    const pts: [number, number][] = [[0, 0]]
    for (let f = -1; f <= 1.001; f += 0.25) {
      const [x, , z] = polar(TIER_TOP.radius, SLICE_CENTER + (f * SLICE_ANGLE) / 2, 0)
      pts.push([x, z])
    }
    // Points along both straight cut faces too.
    for (const line of CUT_LINES) for (let r = 0.1; r < TIER_TOP.radius; r += 0.1) {
      const [x, , z] = polar(r, line, 0)
      pts.push([x, z])
    }
    return pts.map(([x, z]) => {
      const dx = x - pivot[0], dz = z - pivot[1], c = Math.cos(yaw), s = Math.sin(yaw)
      // three.js rotation.y: x' = x cos + z sin, z' = −x sin + z cos
      return [pivot[0] + dx * c + dz * s + SLICE_DIR[0] * out, pivot[1] - dx * s + dz * c + SLICE_DIR[1] * out]
    })
  }

  it('never clips into the remaining cake while it moves out and turns', () => {
    for (let f = 0.05; f <= 1.001; f += 0.05)
      for (const [x, z] of outline(SLICE_OUT * f, SLICE_YAW * f))
        // Any part of the slice still within the top tier's radius must be inside the emptied wedge.
        if (Math.hypot(x, z) < TIER_TOP.radius) expect(inSlice(Math.atan2(x, z))).toBe(true)
  })
  it('ends resting on the flat top of the lower tier, not over its edge', () => {
    for (const [x, z] of outline(SLICE_OUT, SLICE_YAW)) expect(Math.hypot(x, z)).toBeLessThan(TIER_BOTTOM.radius - EDGE)
    expect(TIER_TOP.base).toBeCloseTo(TIER_BOTTOM.base + TIER_BOTTOM.height)
  })
})

describe('lettering (acceptance 7)', () => {
  it('keeps the exact wording and spelling', () => {
    expect(birthday.cakeMessage).toBe('Happy Birthday to My Love Eshu')
    const lines = splitMessage(birthday.cakeMessage, (s) => s.length)
    expect(lines.join(' ')).toBe('Happy Birthday to My Love Eshu')
    expect(lines).toHaveLength(2)
  })
  it('sits inside the flat top, clear of the slice wedge and the candles', () => {
    const z0 = MESSAGE.z - MESSAGE.depth / 2
    // Glyphs use at most 94% of the plate width (far line) and 80% (near line).
    const halfW = (MESSAGE.width * 0.94) / 2
    // The two lines are centred and use at most 90% of the plate depth.
    const zNear = z0 + MESSAGE.depth * 0.95
    for (const [x, z] of [[-halfW, z0], [halfW, z0], [-halfW, MESSAGE.z], [halfW, MESSAGE.z], [(-MESSAGE.width * 0.8) / 2, zNear], [(MESSAGE.width * 0.8) / 2, zNear]]) {
      expect(inSlice(Math.atan2(x, z))).toBe(false)
      expect(Math.hypot(x, z)).toBeLessThan(TIER_TOP.radius - EDGE)
    }
    for (const a of candleAngles()) {
      const [x, , z] = polar(CANDLE.ringRadius, a, 0)
      expect(z < z0 || Math.abs(x) > halfW).toBe(true)
    }
  })
})

describe('replay (acceptance 10)', () => {
  it('restores the intact cake, knife, cuts, crumbs, flames and confetti — every time', () => {
    const rig = createRig()
    for (let round = 0; round < 3; round++) {
      finish('intro', rig)
      finish('blowing', rig)
      finish('cutReady', rig)
      playCut(rig)
      for (const s of ['sliceReady', 'pickup', 'firstBite', 'secondBite', 'message'] as const) finish(s, rig)
      expect(rig.sliceGone).toBe(1)
      expect(finish('intro', rig).events).toEqual(['introDone'])
      expect(rig).toMatchObject({
        slice: 0, sliceLift: 0, sliceYaw: 0, dent: 0, crumbsAt: [-1, -1], confettiAt: -1, finale: 0,
        selectable: 0, pickLift: 0, pick: 0, bite: 0, biteAt: [-1, -1], sliceDrop: 0, sliceGone: 0, sliceGlow: 0,
      })
      expect(rig.cuts).toEqual([{ top: 0, depth: 0 }, { top: 0, depth: 0 }])
      expect(rig.smokeAt.every((t) => t === -1)).toBe(true)
      expect(rig.knife.show).toBe(0)
      expect(rig.flames.every((f) => f.v === 1)).toBe(true)
    }
  })
  it('killing a timeline stops it writing to the rig', () => {
    const rig = createRig()
    sceneTimeline('intro', rig, { reduced: false, dispatch: vi.fn() }).kill()
    expect(rig.key).toBe(0)
  })
  it('reduced motion reaches the same state in a quarter of the time', () => {
    const tl = sceneTimeline('intro', createRig(), { reduced: true, dispatch: vi.fn() })
    expect(tl.totalDuration() / tl.timeScale()).toBeCloseTo(TIMING.intro / 4, 0)
  })
})

describe('cake geometry', () => {
  it('no candle sits in the wedge or near a cut line', () => {
    for (const a of candleAngles()) {
      expect(inSlice(a)).toBe(false)
      const [x, , z] = polar(CANDLE.ringRadius, a, 0)
      for (const line of CUT_LINES) expect(distToRay(x, z, line)).toBeGreaterThan(CANDLE.radius + 0.05)
    }
  })
  it('the knife cuts down to, but not into, the lower tier', () => {
    expect(KNIFE_CUT_Y).toBeGreaterThan(TIER_TOP.base)
    expect(KNIFE_CUT_Y - TIER_TOP.base).toBeLessThan(0.01)
  })
  it('knifeYaw lays the blade along the radial line', () => {
    for (const phi of [0, 0.3, -1.2, SLICE_CENTER]) {
      const a = knifeYaw(phi)
      expect(Math.cos(a)).toBeCloseTo(Math.sin(phi))
      expect(-Math.sin(a)).toBeCloseTo(Math.cos(phi))
    }
  })
  it('portrait screens pull the camera back, landscape is untouched', () => {
    const dist = (s: (typeof SHOTS)[keyof typeof SHOTS]) => Math.hypot(s.px - s.tx, s.py - s.ty, s.pz - s.tz)
    const visibleWidth = (s: (typeof SHOTS)[keyof typeof SHOTS], aspect: number, height: number) =>
      2 * Math.tan((17.5 * Math.PI) / 180) * aspect * dist(s) * distanceScale(aspect, height, dist(s), s.w)
    for (const [name, s] of Object.entries(SHOTS)) {
      expect(distanceScale(16 / 9, 900, dist(s), s.w), name).toBe(1) // desktop: shots as designed
      for (const [aspect, h] of [[390 / 844, 844], [360 / 780, 780], [820 / 1180, 1180]])
        expect(visibleWidth(s, aspect, h), `${name} @ ${aspect.toFixed(2)}`).toBeGreaterThanOrEqual(s.w - 1e-9)
    }
    expect(distanceScale(844 / 390, 390, 8, 3)).toBe(1.3)
  })
})

describe('slice pickup and bites (Phase 7)', () => {
  const cutDone = () => {
    const rig = createRig()
    finish('cutReady', rig)
    playCut(rig)
    return rig
  }
  /** Runs a scene's timeline for `seconds` (sliceReady repeats forever, so it is never "finished"). */
  const run = (scene: Parameters<typeof sceneTimeline>[0], rig: Rig, seconds?: number) => {
    const events: SceneEvent[] = [], sounds: Sfx[] = []
    const tl = sceneTimeline(scene, rig, { reduced: false, dispatch: (e) => events.push(e), sfx: (s) => sounds.push(s) })
    tl.pause()
    if (seconds === undefined) tl.progress(1)
    else for (let t = 0; t <= seconds; t += 1 / 30) tl.seek(t, false)
    tl.kill()
    return { events, sounds }
  }

  it('is not selectable during cutting, becomes selectable only in sliceReady, and floats + glows there', () => {
    const rig = createRig()
    finish('cutReady', rig)
    let selectableWhileCutting = false
    playCut(rig, () => { if (rig.selectable) selectableWhileCutting = true })
    expect(selectableWhileCutting).toBe(false)
    run('sliceReady', rig, 2)
    expect(rig.selectable).toBe(1)
    expect(rig.slice).toBe(SLICE_OUT) // still resting on the tier below until touched
    expect(rig.pick + rig.pickLift).toBe(0)
    expect(rig.sliceFloat + rig.sliceGlow).toBeGreaterThan(0)
  })
  it('pickup locks selection, lifts first, then travels to the eat point and turns to face the camera', () => {
    const rig = cutDone()
    run('sliceReady', rig, 1)
    const tl = sceneTimeline('pickup', rig, { reduced: false, dispatch: vi.fn() })
    tl.pause()
    tl.seek(0.05, false)
    expect(rig.selectable).toBe(0)
    let prev = 0
    for (let t = 0.05; t <= tl.duration(); t += 0.05) {
      tl.seek(t, false)
      if (rig.pick > 0) expect(rig.pickLift).toBeGreaterThan(0.9) // lifted clear before travelling
      expect(rig.pick).toBeGreaterThanOrEqual(prev) // smooth, one-way travel: no jumps back
      expect(rig.pick - prev).toBeLessThan(0.06)
      prev = rig.pick
    }
    tl.progress(1)
    expect(rig.pick).toBe(1)
    expect(rig.cam).toMatchObject(S.eat)
  })
  it('the lifted slice clears the top tier before it travels over it', () => {
    // Slice base after the lift vs. the top of the top tier (both in tier-local heights).
    expect(PICK_LIFT).toBeGreaterThan(TIER_TOP.height + 0.05)
  })
  it('the eat point keeps the slice well in front of the camera and inside the frame', () => {
    const cam = [S.eat.px, S.eat.py, S.eat.pz], tgt = [S.eat.tx, S.eat.ty, S.eat.tz]
    const view = tgt.map((v, i) => v - cam[i]), len = Math.hypot(...view)
    const toEat = EAT_POINT.map((v, i) => v - cam[i])
    const depth = toEat.reduce((s, v, i) => s + (v * view[i]) / len, 0)
    // Slice is ~0.5 tall and ~0.5 wide: at this depth it fits the 35° vertical field with room to spare.
    expect(depth).toBeGreaterThan(1.8)
    expect(0.6 / (2 * depth * Math.tan((35 * Math.PI) / 360))).toBeLessThan(0.5)
    expect(Number.isFinite(EAT_YAW)).toBe(true)
    expect(Math.abs(wrapAngle(EAT_YAW))).toBeLessThanOrEqual(Math.PI)
  })
  it('first bite, then (only after it) the second; crumbs at each; the rest sinks away', () => {
    const rig = cutDone()
    run('sliceReady', rig, 1)
    run('pickup', rig)
    const first = run('firstBite', rig)
    expect(first.events).toEqual(['bitten'])
    expect(first.sounds).toEqual(['bite'])
    expect(rig.bite).toBe(1)
    expect(rig.biteAt[0]).toBeGreaterThan(0)
    expect(rig.biteAt[1]).toBe(-1)
    expect(rig.sliceGone).toBe(0)
    const second = run('secondBite', rig)
    expect(second.events).toEqual(['eaten'])
    expect(rig.bite).toBe(2)
    expect(rig.biteAt[1]).toBeGreaterThan(rig.biteAt[0])
    expect(rig.sliceDrop).toBe(1)
    expect(rig.sliceGone).toBe(1)
  })
  it('bites are real, nested geometry: each edge stays inside the slice, and the second goes deeper', () => {
    const half = SLICE_ANGLE / 2
    const depthOf = (b: number) => Math.min(...biteBoundary(b).map(([x, z]) => Math.hypot(x, z)))
    expect(depthOf(2)).toBeGreaterThan(depthOf(1) + 0.08)
    // The second bite removes less new cake than the first (a smaller bite), measured along the bisector.
    expect(depthOf(2) - depthOf(1)).toBeLessThan(depthOf(1))
    for (const b of [1, 2]) {
      const edge = biteBoundary(b)
      expect(edge.length).toBeGreaterThan(10)
      for (const [x, z] of edge) {
        const r = Math.hypot(x, z), phi = Math.atan2(x, z)
        expect(Math.abs(wrapAngle(phi - SLICE_CENTER))).toBeLessThanOrEqual(half + 1e-6)
        // Never reaches the outer frosting band or piping: the outside of the slice stays intact.
        expect(r).toBeLessThan(TIER_TOP.radius - EDGE - 0.1)
        expect(r).toBeGreaterThan(0.1)
      }
      // Ends exactly on the two cut faces.
      expect(Math.atan2(edge[0][0], edge[0][1])).toBeCloseTo(CUT_LINES[0], 6)
      expect(Math.atan2(edge.at(-1)![0], edge.at(-1)![1])).toBeCloseTo(CUT_LINES[1], 6)
    }
    expect(BITES).toHaveLength(2)
  })
  it('cut again from the finale restores the whole slice, uncut, with the knife back on the first line', () => {
    const rig = cutDone()
    for (const s of ['sliceReady', 'pickup', 'firstBite', 'secondBite', 'message'] as const) {
      if (s === 'sliceReady') run(s, rig, 1)
      else run(s, rig)
    }
    expect(rig.sliceGone).toBe(1)
    run('cutReady', rig)
    expect(rig).toMatchObject({ slice: 0, bite: 0, pick: 0, pickLift: 0, sliceGone: 0, sliceDrop: 0, selectable: 0, finale: 0 })
    expect(rig.cuts).toEqual([{ top: 0, depth: 0 }, { top: 0, depth: 0 }])
    expect(rig.knife.ry).toBeCloseTo(knifeYaw(CUT_LINES[0]), 4)
  })
})
