# Architecture

## Modules

| Concern | File | Notes |
|---|---|---|
| Birthday configuration | `src/config/birthday.ts` | The only place personal data and copy live. |
| Time + countdown logic | `src/lib/time.ts`, `src/lib/useCountdown.ts` | Pure functions + a thin React hook. |
| Scene state machine | `src/lib/scene.ts` | Pure reducer; guards against duplicate/out-of-order events. |
| Blow detection | `src/lib/blow.ts` | Pure detector + injectable mic pipeline (testable without a browser). |
| Audio | `src/lib/sound.ts` | Optional music, synthesised puff, autoplay-safe. |
| Orchestration (UI) | `src/App.tsx` | Config validation, auto/manual start, sound, WebGL fallback. |
| Overlays | `src/ui/Countdown.tsx`, `src/ui/Overlay.tsx` | DOM text and controls. |
| 3D stage (one canvas) | `src/three/Stage.tsx` | Lights, table, environment, camera rig, director. Lazy-loaded. |
| Scene timelines | `src/three/rig.ts` | One GSAP timeline per scene, writing to a plain-number "rig". |
| Dimensions, shots, timing | `src/three/spec.ts` | Shared by geometry, timelines, DOM delays and tests. |
| Cake, stand, knife | `src/three/Cake.tsx` | Procedural geometry; top tier pre-split into body + slice; piped-chocolate lettering; cut grooves, contact dent, crumbs. |
| Candles, flames, smoke | `src/three/Candles.tsx` | Shader flames, per-candle point light, points smoke. |
| Dust, bokeh, confetti | `src/three/Atmosphere.tsx` | One draw call each. |

### Data flow

```
birthday.ts ─▶ validateConfig ─▶ targetMs ─▶ useCountdown ─▶ <Countdown>
                                    │
                         initialScene / nextScene (useReducer)
                                    │ scene
             ┌──────────────────────┴───────────────────────┐
        DOM overlays (React)                       <Stage> (one R3F canvas)
                                                     Director: sceneTimeline(scene, rig)
                                                     ── GSAP writes rig numbers
                                                     useFrame reads rig → three objects
                                                     timeline end ─▶ dispatch(event)
```

**React state** holds only discrete things (scene, mic status, sound on/off).
**The rig** (`createRig()`) holds every animated value as plain numbers; GSAP writes it and `useFrame`
reads it, so animation never causes React re-renders.

## Scene state diagram

```
             target reached & autoStart & watched live
 countdown ───────────────────────────────────────────┐
     │  "শুরু করো" (manual)                              ▼
     └─────────────────────────────────────────────▶ intro ──(timeline end)──▶ wish
                                                                              │ blow (mic or button)
                                                                              ▼
 sliceReady ◀──(timeline end)── cutting ◀──"কেক কাটো"── cutReady ◀─(timeline end)─ blowing
     │ tap the 3D slice, or the "কেকের টুকরোটিতে স্পর্শ করো" button                ▲
     ▼                                                                            │ recut ("আবার কেক কাটো")
  pickup ──(end)──▶ firstBite ──(end)──▶ secondBite ──(end)──▶ message ───────────┘
                                                                  │
                                                                  └── replay ("আবার দেখো") ──▶ intro
```

- Events only act in their own scene (`nextScene`), so double clicks, a mic trigger racing a click,
  or a stale timeline callback are no-ops. Interactive scenes (`wish`, `cutReady`) never auto-advance.
- Phase 7 states map to the brief's names: SLICE_READY = `sliceReady`, SLICE_PICKUP = `pickup`,
  FIRST_BITE = `firstBite`, SECOND_BITE = `secondBite`, ROMANTIC_FINALE = `message`. The slice is
  only selectable in `sliceReady` (`rig.selectable`), so it can't be picked mid-cut or twice.
- Phase-4 state names map as: *cake revealing* = `intro`, *cake visible / wish* = `wish`,
  *candles extinguished* = end of `blowing` → `cutReady`, *cake cutting* = `cutting`, *reset* = `replay`.
- **Opening after the target** (`afterTarget`): `gate` shows 00:00:00:00 with an Enter button (gives a
  user gesture so sound can start), `celebrate` starts the intro, `message` jumps to the finale.
- **No WebGL / 3D crash**: an error boundary drops the canvas; `intro`, `blowing` and `cutting`
  advance on a 1.2 s timer so the experience still completes as text and buttons.

## Countdown rules

- `remaining(target, now)` is recomputed from `Date.now()` each tick — never a decremented counter.
- Seconds are rounded **up**, so `00:00:00:00` appears exactly at the target, not one second early or late.
- Ticks are scheduled on the target's second boundaries (`msToNextTick`), and also run on
  `visibilitychange`, `focus` and `pageshow`, so a suspended tab is correct the instant it returns.
- Negative values are clamped to zero. All timers and listeners are removed on unmount.

### Synchronisation

All visitors count down to the same absolute UTC instant. A static frontend can only read each
**device's own clock**: a phone set 2 minutes fast will open 2 minutes early. Typical network-synced
clocks are within a second, but this cannot be guaranteed without a shared time source (e.g. a server
time endpoint), which this project intentionally does not include.

## Animation standards

| Rule | Implementation |
|---|---|
| One owner per property | One GSAP timeline per scene; `Director` kills it on scene change before building the next. |
| Each scene animates **to** its pose | Previews and replays land correctly from any prior state. |
| Discrete vs. continuous | Scene = React state. Camera, lights, flames, knife, slice = rig numbers via refs. |
| Text reveals | CSS `.reveal` with delays taken from `TIMING` in `spec.ts` (same clock as the 3D). |
| Easing | Camera: `power2.inOut` / `power1.inOut`. Lights: `sine.inOut`. Exits: `power2.in`. UI: `cubic-bezier(.22,1,.36,1)`. No bounce/elastic anywhere. |
| Durations | UI 240 ms / 600 ms / 1.4 s / 2.4 s. Camera moves 2.2–4 s. Intro 9.6 s, cutting 7.6 s. |
| Idle motion | ±3° camera sway over 16 s in `wish` only. Dust drifts at ~0.04 units/s. |
| Reduced motion | Timelines run 4× faster, sway off, dust slowed, CSS reveals shown immediately. |
| Cleanup | Timelines killed on scene change/unmount; geometries, materials and canvas textures disposed on unmount; mic tracks/nodes released when leaving `wish`. |
| Replay | `intro` fades to dark, then resets camera, knife, slice, smoke and confetti while nothing is visible, then relights the candles. |

### Timings (seconds)

| Scene | Beats |
|---|---|
| intro (13.0) | 0 dolly from dark → wide · 0.6 environment fades up · 1.6 rim light · 2.6 warm key reveals cake · 3.6 dolly to approach · 4.2–5.3 candles ignite one by one · 6.6 rise over the top tier (hero shot, lettering readable) · 10.2 settle at interaction shot · 10.6 name reveals |
| blowing (~2.3) | flames out in a sweep (0.07 s stagger) · smoke 0.35 s after each · fill eases down · 1.4 s settle |
| cutReady | camera to three-quarter shot (2.4) · knife enters from upper right 0.7–2.6, settles above line A with the heel raised · button appears 2.2 |
| cutting (12.2) | slow push-in 0–3 · **line A:** tip descends 0.6–1.4 and touches (dent + *touch* sound) · 0.4 s contact · rock down 1.8–2.8 (*slice* sound; groove grows behind the edge) · press to the lower tier 2.8–3.8 · pause · lift 4.15 · rotate to line B 4.85 · **line B:** same beats from 5.45 · knife withdraws 9.6 · crumbs 9.7 · slice slides out, lifts 3.5 cm, turns 7° and settles 9.75–11.35 (*board* sound) · camera to after-cut shot 9.4 · confetti 11.4 |
| sliceReady | camera to after-cut shot · slice floats ±2 cm and glows softly (repeating) until tapped |
| pickup (3.6) | tap acknowledged (glow) · lifts 0.62 straight up 0.3–1.3 (clears the top tier) · curved Bézier path to the eat point 1.2–3.6, turning three-quarter to camera with a small pitch and roll · camera moves to the eat shot |
| firstBite (1.9) | 0.7 s pause · small push toward the camera · swaps to the first bitten geometry at the peak, crumbs fall from the new edge · settle |
| secondBite (3.5) | 0.5 s pause · second, smaller bite (deeper, nested edge) · 1.8 the rest sinks out of frame · hidden at 3.3 |
| message | 0.8 lights warm + camera rises (4 s) · drifting hearts · heading 1.8 · lines every 1.1 s · signature · cut again / replay |

## Testing

`npm test` (vitest, 58 tests): countdown arithmetic, exact target instant, past/invalid dates,
IANA zones and offsets incl. DST gaps/overlaps, tab-suspension recovery, listener cleanup,
preview, automatic and manual transitions, duplicate-event guards, blow detection (sustained vs.
spike, background noise, cooldown), mic permission granted/denied/missing/unsupported/cleanup,
timeline end states, knife alignment with the cut lines, slice placement, replay ×3, reduced motion.

Browser verification was done with headless Chrome (SwiftShader WebGL): full run from a live
countdown hitting zero through to the finale, three replays, and phone/tablet/landscape layouts.

## Limitations

- **Clock:** depends on each device's clock (see Synchronisation).
- **Blow detection** is loudness over time with an adaptive noise floor. Talking, wind or a loud room
  near the mic can trigger it; a soft blow far from the mic may not. Sensitivity is adjustable and the
  button always works. Needs HTTPS and a browser with `getUserMedia` + Web Audio.
- **Cake** is procedural lathe/shape geometry with shader flames — premium-looking, but not a sculpted
  or photoscanned model. A faint hairline can be visible at the slice joint under grazing light.
- **Bites** are prebuilt geometry, not real-time removal: two bitten states of the slice (trimmed top and
  base caps, shortened cut faces, a scalloped vertical bite wall showing the layers). The swap is instant at
  the peak of a small push. No mouth, teeth or hands are drawn. The outer frosting band of the slice stays
  intact, so the bites read best from the three-quarter angle used.
- **Cutting** uses pre-split, exactly aligned geometry (body + slice + flat interior faces) and an
  authored GSAP animation. It is not real-time mesh slicing; the cut location is fixed (100°–140°,
  back-right). The visible groove is not tweened: `updateCuts` derives it every frame from the
  blade's pose, so it can only appear where the edge has passed below the frosting. The "dent" is
  a shaded decal, not real surface deformation. Crumbs land on the lower tier (the surface under the
  slice), not on the board.
- **Lettering** is a high-resolution texture (with a height map for relief) lying 1.5 mm above the
  frosting, not modelled 3D text. It uses Dancing Script from Google Fonts; offline, a system script
  font is substituted.
- **Depth of field** is not used (it would need a post-processing pass); the CSS bokeh suggests it.
- **Fonts** load from Google Fonts; offline, the system serif/sans fallbacks are used.
- **Bundle:** the 3D chunk is ~295 kB gzip, lazy-loaded behind the countdown.
