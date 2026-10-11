import type { AfterTarget } from '../config/birthday.ts'

/**
 * countdown → intro → wish → blowing → cutReady → cutting → sliceReady → pickup → firstBite → secondBite → message
 *               ↑                        ↑______________________________ recut __________________________________|
 *               |_______________________________________ replay ______________________________________________|
 */
export const SCENES = ['countdown', 'intro', 'wish', 'blowing', 'cutReady', 'cutting', 'sliceReady', 'pickup', 'firstBite', 'secondBite', 'message'] as const
export type Scene = (typeof SCENES)[number]
export type SceneEvent = 'enter' | 'introDone' | 'blow' | 'blown' | 'cut' | 'cutDone' | 'pick' | 'picked' | 'bitten' | 'eaten' | 'recut' | 'replay'

const FLOW: Record<Exclude<SceneEvent, 'replay'>, [from: Scene, to: Scene]> = {
  enter: ['countdown', 'intro'],
  introDone: ['intro', 'wish'],
  blow: ['wish', 'blowing'],
  blown: ['blowing', 'cutReady'],
  cut: ['cutReady', 'cutting'],
  cutDone: ['cutting', 'sliceReady'],
  pick: ['sliceReady', 'pickup'],
  picked: ['pickup', 'firstBite'],
  bitten: ['firstBite', 'secondBite'],
  eaten: ['secondBite', 'message'],
  /** From the finale: restore the whole cake and cut it again. */
  recut: ['message', 'cutReady'],
}

/** Events only fire from their own scene, so duplicates and stale callbacks are no-ops. */
export function nextScene(scene: Scene, ev: SceneEvent): Scene {
  if (ev === 'replay') return 'intro'
  const [from, to] = FLOW[ev]
  return scene === from ? to : scene
}

export function initialScene(o: {
  targetMs: number
  nowMs: number
  afterTarget: AfterTarget
  preview: string | null
  allowPreview: boolean
}): { scene: Scene; preview: boolean } {
  if (o.allowPreview && o.preview && (SCENES as readonly string[]).includes(o.preview))
    return { scene: o.preview as Scene, preview: true }
  if (o.nowMs < o.targetMs) return { scene: 'countdown', preview: false }
  const scene = o.afterTarget === 'celebrate' ? 'intro' : o.afterTarget === 'message' ? 'message' : 'countdown'
  return { scene, preview: false }
}

/**
 * Fire 'enter' by itself only for a visitor who was watching the live countdown
 * (opened before the target, not in preview). Late visitors get `afterTarget`.
 */
export const shouldAutoEnter = (o: { scene: Scene; reached: boolean; autoStart: boolean; watchedLive: boolean }) =>
  o.autoStart && o.reached && o.watchedLive && o.scene === 'countdown'
