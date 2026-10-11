import gsap from 'gsap'
import type { Scene, SceneEvent } from '../lib/scene.ts'
import {
  CAKE_TOP_Y, CANDLE, CUT_LINES, KNIFE_CUT_Y, KNIFE_HOVER_Y, KNIFE_OFFSTAGE, KNIFE_ROCK_DEPTH, KNIFE_TILT,
  SAW_STROKE, SHOTS, SLICE_LIFT, SLICE_OUT, SLICE_YAW, TIER_TOP, TIMING, knifeYaw,
} from './spec.ts'

export type Sfx = 'puff' | 'touch' | 'slice' | 'board' | 'bite'

/**
 * Everything the 3D scene animates, as plain numbers. GSAP writes it, useFrame
 * reads it — React never re-renders for animation.
 */
export function createRig() {
  return {
    cam: { ...SHOTS.dark },
    /** 0..1 amplitude of the slow idle orbit. */
    sway: 0,
    env: 0,
    key: 0,
    fill: 0,
    rim: 0,
    dust: 1,
    /** 0..1 finale glow (bokeh + sparkle). */
    finale: 0,
    flames: Array.from({ length: CANDLE.count }, () => ({ v: 0 })),
    /** performance.now()/1000 when each candle's smoke started, -1 = none. */
    smokeAt: Array<number>(CANDLE.count).fill(-1),
    /** Tip position, yaw (blade direction) and tilt (heel raised). */
    knife: { ...KNIFE_OFFSTAGE, show: 0 },
    /** 0..1 frosting compression where the tip first touches. */
    dent: 0,
    /** How far each cut has gone, derived from the blade pose by updateCuts — never tweened. */
    cuts: CUT_LINES.map(() => ({ top: 0, depth: 0 })),
    /** Slice outward travel, lift and yaw. */
    slice: 0,
    sliceLift: 0,
    sliceYaw: 0,
    /** performance.now()/1000 when each cut broke out through the side, -1 = not yet. */
    crumbsAt: CUT_LINES.map(() => -1),
    /** 1 while the cut slice may be picked (sliceReady only). */
    selectable: 0,
    /** Gentle warm highlight and float that invite a tap. */
    sliceGlow: 0,
    sliceFloat: 0,
    /** Pickup: straight up (pickLift), then along a curve to the eat point (pick). */
    pickLift: 0,
    pick: 0,
    /** Which slice state is shown: 0 whole, 1 and 2 bitten. */
    bite: 0,
    /** performance.now()/1000 of each bite, for its crumbs. */
    biteAt: [-1, -1],
    /** Small forward nudge at each bite. */
    chew: 0,
    /** The remaining slice sinks away; once gone it stays hidden until a reset. */
    sliceDrop: 0,
    sliceGone: 0,
    confettiAt: -1,
    /** Physics (crumbs, confetti) holds still while the experience is paused. */
    paused: false,
  }
}
export type Rig = ReturnType<typeof createRig>

/**
 * Records how far the blade has cut along each line, from its actual pose. The cut
 * can only ever appear where the edge has passed below the frosting surface. The tip
 * may saw back and forth along the line (never sideways off it); its distance from the
 * cake's axis is taken into account.
 */
export function updateCuts(rig: Rig) {
  const k = rig.knife
  // A cut needs the edge to actually enter the frosting (0.1 mm absorbs tween rounding at rest).
  if (k.show < 0.5 || k.y >= CAKE_TOP_Y - 1e-4) return
  CUT_LINES.forEach((line, i) => {
    if (Math.abs(k.ry - knifeYaw(line)) > 0.01) return
    const along = k.x * Math.sin(line) + k.z * Math.cos(line)
    const off = Math.abs(k.x * Math.cos(line) - k.z * Math.sin(line))
    if (off > 1e-3 || along < -1e-3) return
    const R = TIER_TOP.radius, t = Math.tan(k.tilt)
    // Where the edge crosses the top surface, as a fraction of the radius.
    const top = t < 1e-4 ? 1 : Math.min(1, (along + (CAKE_TOP_Y - k.y) / t) / R)
    // How far down the outer side the edge reaches.
    const depth = Math.max(0, Math.min(1, (CAKE_TOP_Y - (k.y + Math.max(0, R - along) * t)) / TIER_TOP.height))
    rig.cuts[i].top = Math.max(rig.cuts[i].top, top)
    rig.cuts[i].depth = Math.max(rig.cuts[i].depth, depth)
  })
}

const now = () => performance.now() / 1000
const lit = { env: 1, key: 1, fill: 1, rim: 1 }
const hover = (line: number) => ({ x: 0, z: 0, y: KNIFE_HOVER_Y, ry: knifeYaw(line), tilt: KNIFE_TILT })

function resetCake(rig: Rig) {
  const fresh = createRig()
  Object.assign(rig.knife, fresh.knife)
  rig.cuts.forEach((c) => Object.assign(c, { top: 0, depth: 0 }))
  rig.crumbsAt.fill(-1)
  rig.biteAt.fill(-1)
  Object.assign(rig, {
    dent: 0, slice: 0, sliceLift: 0, sliceYaw: 0, confettiAt: -1,
    selectable: 0, sliceGlow: 0, sliceFloat: 0, pickLift: 0, pick: 0, bite: 0, chew: 0, sliceDrop: 0, sliceGone: 0,
  })
}

/** Ends at the wish pose: cake lit, candles burning, camera at the interaction shot. */
function intro(tl: gsap.core.Timeline, rig: Rig) {
  // Replay: fade to dark first, then reset everything while nothing is visible.
  if (rig.env > 0.01 || rig.key > 0.01) {
    tl.to(rig, { env: 0, key: 0, fill: 0, rim: 0, finale: 0, duration: 1.4, ease: 'power2.inOut' })
    tl.to(rig.flames, { v: 0, duration: 1.0 }, '<')
  }
  tl.add(() => {
    Object.assign(rig.cam, SHOTS.dark)
    resetCake(rig)
    rig.smokeAt.fill(-1)
    rig.sway = 0
  })
  tl.addLabel('start')
  tl.to(rig.cam, { ...SHOTS.wide, duration: 3.6, ease: 'power2.inOut' }, 'start')
  tl.to(rig, { env: 0.45, duration: 2.8, ease: 'sine.inOut' }, 'start+=0.6')
  tl.to(rig, { rim: 1, duration: 2.4, ease: 'sine.inOut' }, 'start+=1.6')
  tl.to(rig, { key: 1, duration: 3.2, ease: 'sine.inOut' }, 'start+=2.6')
  tl.to(rig.cam, { ...SHOTS.approach, duration: 3.0, ease: 'power1.inOut' }, 'start+=3.6')
  rig.flames.forEach((_, i) =>
    tl.to(rig.flames[i], { v: 1, duration: 0.7, ease: 'power2.out' }, `start+=${4.2 + i * 0.22}`))
  tl.to(rig, { fill: 1, env: 1, duration: 2.2, ease: 'sine.inOut' }, 'start+=4.6')
  // Rise over the top tier so the lettering reads, hold, then settle back for the wish.
  tl.to(rig.cam, { ...SHOTS.hero, duration: 2.4, ease: 'power2.inOut' }, 'start+=6.6')
  tl.to(rig.cam, { ...SHOTS.interaction, duration: 2.8, ease: 'power2.inOut' }, 'start+=10.2')
}

function wishPose(tl: gsap.core.Timeline, rig: Rig) {
  tl.to(rig, { ...lit, finale: 0, duration: 1.2, ease: 'sine.inOut' }, 0)
  tl.add(() => resetCake(rig), 0) // preview safety; a no-op after the intro
  tl.to(rig.cam, { ...SHOTS.interaction, duration: 1.6, ease: 'power2.inOut' }, 0)
  tl.to(rig.flames, { v: 1, duration: 0.8 }, 0)
  tl.to(rig, { sway: 1, duration: 3, ease: 'sine.inOut' }, 0.8)
}

function blowing(tl: gsap.core.Timeline, rig: Rig, sfx: (s: Sfx) => void) {
  tl.add(() => sfx('puff'), 0)
  tl.to(rig, { sway: 0, duration: 1.5, ease: 'sine.out' }, 0)
  rig.flames.forEach((_, i) => {
    const at = 0.05 + ((i * 3) % CANDLE.count) * 0.07 // a breath sweeps across, not in index order
    tl.to(rig.flames[i], { v: 0, duration: 0.55, ease: 'power2.in' }, at)
    tl.add(() => { rig.smokeAt[i] = now() }, at + 0.35)
  })
  // Without candles the cake would go flat; keep the key warm, ease the fill down.
  tl.to(rig, { fill: 0.75, duration: 1.2, ease: 'sine.inOut' }, 0.3)
  tl.to({}, { duration: TIMING.blowSettle }) // settle: let the smoke drift
}

function cutReady(tl: gsap.core.Timeline, rig: Rig) {
  // Cutting again from the finale: dim, restore the whole cake while it is dark, light it again.
  const restoring = rig.slice > 0.01 || rig.sliceGone > 0
  if (restoring) tl.to(rig, { key: 0.15, env: 0.25, fill: 0.15, finale: 0, duration: 0.6, ease: 'sine.in' }, 0)
  tl.to(rig, { ...lit, fill: 0.8, sway: 0, finale: 0, duration: 1.2, ease: 'sine.inOut' }, restoring ? 0.7 : 0)
  tl.to(rig.flames, { v: 0, duration: 0.5 }, 0)
  tl.to(rig.cam, { ...SHOTS.cut, duration: 2.4, ease: 'power2.inOut' }, 0)
  tl.add(() => resetCake(rig), restoring ? 0.6 : 0.5)
  tl.to(rig.knife, { show: 1, duration: 0.4 }, 0.6)
  // Enters from the upper right and settles above the first cut line, tip lowered.
  tl.to(rig.knife, { ...hover(CUT_LINES[0]), duration: 1.9, ease: 'power3.out' }, 0.7)
}

/** Short strokes along the blade's own line — the sawing that makes a knife bite. */
function saw(tl: gsap.core.Timeline, rig: Rig, line: number, at: number, duration: number, strokes: number) {
  const step = duration / (strokes * 2)
  const out = { x: Math.sin(line) * SAW_STROKE, z: Math.cos(line) * SAW_STROKE }
  for (let i = 0; i < strokes; i++) {
    tl.to(rig.knife, { ...out, duration: step, ease: 'sine.inOut' }, at + i * 2 * step)
    tl.to(rig.knife, { x: 0, z: 0, duration: step, ease: 'sine.inOut' }, at + (i * 2 + 1) * step)
  }
}

/**
 * One side of the wedge: the tip touches the frosting and rests there, the blade rocks
 * down along the line, then saws down in two stages (with a breath of resistance between)
 * to the lower tier, pauses, and lifts straight out.
 */
function cutLine(tl: gsap.core.Timeline, rig: Rig, i: number, at: number, sfx: (s: Sfx) => void) {
  const line = CUT_LINES[i]
  tl.to(rig.knife, { y: CAKE_TOP_Y, duration: 0.8, ease: 'power2.out' }, at) // tip meets the frosting
  tl.add(() => sfx('touch'), at + 0.8)
  tl.to(rig, { dent: 1, duration: 0.3, ease: 'power2.out' }, at + 0.7)
  // 0.4 s of contact before anything cuts, then the blade rocks down onto its whole length.
  tl.to(rig.knife, { tilt: 0, y: CAKE_TOP_Y - KNIFE_ROCK_DEPTH, duration: 1.0, ease: 'sine.inOut' }, at + 1.2)
  tl.add(() => sfx('slice'), at + 1.2)
  const mid = (CAKE_TOP_Y - KNIFE_ROCK_DEPTH + KNIFE_CUT_Y) / 2
  tl.to(rig.knife, { y: mid, duration: 0.7, ease: 'power1.inOut' }, at + 2.2)
  saw(tl, rig, line, at + 2.2, 0.7, 2)
  // A breath of resistance, then the second stage breaks out through the side: crumbs fall here.
  tl.to(rig.knife, { y: KNIFE_CUT_Y, duration: 0.75, ease: 'power1.inOut' }, at + 3.05)
  saw(tl, rig, line, at + 3.05, 0.75, 2)
  tl.add(() => sfx('slice'), at + 3.05)
  tl.add(() => { rig.crumbsAt[i] = now() }, at + 3.3)
  // Pause at depth, lift straight up, re-raise the heel once clear.
  tl.to(rig.knife, { y: KNIFE_HOVER_Y, duration: 0.6, ease: 'power2.inOut' }, at + 4.15)
  tl.to(rig.knife, { tilt: KNIFE_TILT, duration: 0.4, ease: 'sine.inOut' }, at + 4.45)
}

function cutting(tl: gsap.core.Timeline, rig: Rig, sfx: (s: Sfx) => void) {
  // Glide (never jump) into place, in case Cut was pressed before the knife arrived.
  tl.to(rig.knife, { ...hover(CUT_LINES[0]), show: 1, duration: 0.6, ease: 'sine.out' }, 0)
  tl.to(rig.cam, { ...SHOTS.cutClose, duration: 3.0, ease: 'sine.inOut' }, 0) // slow push-in
  cutLine(tl, rig, 0, 0.6, sfx)
  tl.to(rig.knife, { ry: knifeYaw(CUT_LINES[1]), duration: 0.6, ease: 'sine.inOut' }, 5.45)
  cutLine(tl, rig, 1, 6.05, sfx)
  tl.to(rig.knife, { x: KNIFE_OFFSTAGE.x, y: KNIFE_OFFSTAGE.y, z: KNIFE_OFFSTAGE.z, duration: 1.0, ease: 'power2.in' }, 10.85)
  tl.to(rig.knife, { show: 0, duration: 0.2 }, 11.65)
  // Only now does the slice move: out, up a little and turning slightly, then down onto the tier below.
  tl.to(rig, { slice: SLICE_OUT, duration: 1.6, ease: 'power2.inOut' }, 11.0)
  tl.to(rig, { sliceLift: SLICE_LIFT, duration: 0.7, ease: 'power2.out' }, 11.0)
  tl.to(rig, { sliceLift: 0, duration: 0.9, ease: 'power2.in' }, 11.7)
  tl.to(rig, { sliceYaw: SLICE_YAW, duration: 1.6, ease: 'sine.inOut' }, 11.0)
  tl.add(() => sfx('board'), 12.6)
  tl.to(rig.cam, { ...SHOTS.afterCut, duration: 2.4, ease: 'sine.inOut' }, 10.7)
  tl.add(() => { rig.confettiAt = now() }, 12.65)
  tl.to({}, { duration: 0 }, TIMING.cutting)
}

/** The cut slice, resting on the tier below, as if the cutting scene had just finished. */
function cutDonePose(tl: gsap.core.Timeline, rig: Rig) {
  tl.add(() => {
    rig.cuts.forEach((c) => Object.assign(c, { top: 1, depth: 1 }))
    Object.assign(rig.knife, KNIFE_OFFSTAGE, { show: 0 })
  }, 0)
  tl.to(rig, { ...lit, fill: 0.8, sway: 0, finale: 0, slice: SLICE_OUT, sliceYaw: SLICE_YAW, sliceLift: 0, duration: 0.6 }, 0)
  tl.to(rig.flames, { v: 0, duration: 0.3 }, 0)
}

/** The slice waits to be chosen: it floats a few millimetres and glows softly. */
function sliceReady(tl: gsap.core.Timeline, rig: Rig) {
  cutDonePose(tl, rig)
  tl.to(rig.cam, { ...SHOTS.afterCut, duration: 1.2, ease: 'sine.inOut' }, 0)
  tl.add(() => { rig.selectable = 1 }, 0.6)
  tl.to(rig, { sliceFloat: 1, duration: 1.5, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0.6)
  tl.to(rig, { sliceGlow: 1, duration: 1.9, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0.6)
}

/** Lift straight up clear of the top tier, then a soft curve toward the camera while turning to face it. */
function pickup(tl: gsap.core.Timeline, rig: Rig) {
  tl.add(() => { rig.selectable = 0 }, 0)
  tl.to(rig, { sliceGlow: 1, duration: 0.25, ease: 'power2.out' }, 0) // acknowledge the tap
  tl.to(rig, { sliceGlow: 0, duration: 1.2, ease: 'sine.inOut' }, 0.4)
  tl.to(rig, { sliceFloat: 0, duration: 0.4, ease: 'sine.out' }, 0)
  tl.to(rig, { pickLift: 1, duration: 1.0, ease: 'power2.inOut' }, 0.3)
  tl.to(rig, { pick: 1, duration: 2.4, ease: 'power2.inOut' }, 1.2)
  tl.to(rig.cam, { ...SHOTS.eat, duration: 3.0, ease: 'sine.inOut' }, 0.5)
}

/** One bite: a small push toward the (unseen) eater, the slice swaps to its bitten state at the peak. */
function biteAt(tl: gsap.core.Timeline, rig: Rig, n: 1 | 2, at: number, sfx: (s: Sfx) => void) {
  tl.to(rig, { chew: 1, duration: 0.2, ease: 'power2.out' }, at)
  tl.add(() => {
    rig.bite = n
    rig.biteAt[n - 1] = now()
    sfx('bite')
  }, at + 0.2)
  tl.to(rig, { chew: 0, duration: 0.45, ease: 'sine.inOut' }, at + 0.25)
}

/** Preview safety: start at the eat point (with `bites` already taken) if we did not arrive by the pickup. */
function atEatPoint(tl: gsap.core.Timeline, rig: Rig, bites: number) {
  tl.add(() => {
    if (rig.pick < 1) Object.assign(rig, { slice: SLICE_OUT, sliceYaw: SLICE_YAW, pickLift: 1, pick: 1, selectable: 0 })
    if (rig.bite < bites) rig.bite = bites
    rig.cuts.forEach((c) => Object.assign(c, { top: 1, depth: 1 }))
  }, 0)
  tl.to(rig, { ...lit, fill: 0.8, sway: 0, finale: 0, duration: 0.6 }, 0)
  tl.to(rig.flames, { v: 0, duration: 0.3 }, 0)
  tl.to(rig.cam, { ...SHOTS.eat, duration: 0.6, ease: 'sine.inOut' }, 0)
}

/** A breath at the eat point, the first bite from the tip, then a moment to see it. */
function firstBite(tl: gsap.core.Timeline, rig: Rig, sfx: (s: Sfx) => void) {
  atEatPoint(tl, rig, 0)
  biteAt(tl, rig, 1, 0.7, sfx)
  tl.to({}, { duration: 0 }, 1.9)
}

/** Only after the first: a second, smaller bite; then what is left sinks gently out of frame. */
function secondBite(tl: gsap.core.Timeline, rig: Rig, sfx: (s: Sfx) => void) {
  atEatPoint(tl, rig, 1)
  biteAt(tl, rig, 2, 0.5, sfx)
  tl.to(rig, { sliceDrop: 1, duration: 1.5, ease: 'power2.in' }, 1.8)
  tl.add(() => { rig.sliceGone = 1 }, 3.3)
  tl.to({}, { duration: 0 }, 3.5)
}

function finale(tl: gsap.core.Timeline, rig: Rig) {
  // A breath after the cut, then the light warms and the camera rises to the final frame.
  tl.to(rig, { key: 0.8, fill: 0.55, env: 0.8, rim: 1, finale: 1, slice: SLICE_OUT, sliceLift: 0, sliceYaw: SLICE_YAW, duration: 3, ease: 'sine.inOut' }, 0.8)
  tl.add(() => rig.cuts.forEach((c) => Object.assign(c, { top: 1, depth: 1 })), 0) // preview safety
  tl.to(rig.cam, { ...SHOTS.finale, duration: 4, ease: 'power2.inOut' }, 0.8)
  tl.to(rig.knife, { show: 0, duration: 0.3 }, 0)
  tl.to(rig.flames, { v: 0, duration: 0.3 }, 0)
}

function countdown(tl: gsap.core.Timeline, rig: Rig) {
  tl.to(rig, { env: 0, key: 0, fill: 0, rim: 0, finale: 0, sway: 0, duration: 0.8 }, 0)
  tl.to(rig.cam, { ...SHOTS.dark, duration: 0.8 }, 0)
}

/**
 * One timeline per scene. The caller kills it when the scene changes, so two
 * timelines never animate the same property. Each timeline animates *to* its
 * scene's pose, which also makes preview jumps land correctly.
 */
export function sceneTimeline(
  scene: Scene,
  rig: Rig,
  o: { reduced: boolean; dispatch: (e: SceneEvent) => void; sfx?: (s: Sfx) => void },
) {
  const tl = gsap.timeline()
  const sfx = o.sfx ?? (() => {})
  switch (scene) {
    case 'countdown': countdown(tl, rig); break
    case 'intro': intro(tl, rig); tl.add(() => o.dispatch('introDone')); break
    case 'wish': wishPose(tl, rig); break
    case 'blowing': blowing(tl, rig, sfx); tl.add(() => o.dispatch('blown')); break
    case 'cutReady': cutReady(tl, rig); break
    case 'cutting': cutting(tl, rig, sfx); tl.add(() => o.dispatch('cutDone')); break
    case 'sliceReady': sliceReady(tl, rig); break
    case 'pickup': pickup(tl, rig); tl.add(() => o.dispatch('picked')); break
    case 'firstBite': firstBite(tl, rig, sfx); tl.add(() => o.dispatch('bitten')); break
    case 'secondBite': secondBite(tl, rig, sfx); tl.add(() => o.dispatch('eaten')); break
    case 'message': finale(tl, rig); break
  }
  // Reduced motion: same states, far less travel time. Idle sway is disabled in CameraRig.
  if (o.reduced) tl.timeScale(4)
  return tl
}
