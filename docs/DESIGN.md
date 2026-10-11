# Visual design specification

**Intent:** the opening and closing shots of a quiet romantic short film. One warm subject in a dark
room. Contrast and negative space do the work — most of the frame stays dark.

**Never:** people, silhouettes, faces, avatars, portraits or human-shaped models. No cartoon styling,
no neon, no card-heavy UI, no everything-glows.

## Tokens (`src/index.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#070407` | Page background (near-black, burgundy undertone) |
| `--burgundy` / `--wine` | `#2a0c14` / `#4a1622` | Background depth, floor glow |
| `--amber` | `#f2b66d` | Warm light, active mic indicator |
| `--champagne` | `#ecd9b0` | Highlights, focus ring, preview badge |
| `--gold` | `#d6ad62` | Eyebrow labels, hairlines, accents (sparingly) |
| `--blush` | `#d9a5a2` | Secondary accent, piping, error indicator |
| `--cream` | `#f4ece0` | Digits, primary text on dark |
| `--text` / `--muted` / `--faint` | cream at 100 / 62 / 38 % | Body text hierarchy |
| `--serif` | Cormorant Garamond | Display, digits, prompts, message |
| `--sans` | Jost | Labels, buttons, status |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | All UI entrances |
| `--t-fast/med/slow/cine` | 240 / 600 / 1400 / 2400 ms | UI durations |

3D colours: ivory buttercream `#f8f1e6` (top tier), blush buttercream `#efc8c3` (lower tier), piping
`#fbf5ec`, pearls `#f6efe6`, champagne gold `#d9b36c`, gold board edge `#e4bf72`, chocolate lettering
`#2b140b → #80502f`, strawberry `#b5121f`, blueberry `#2b3254`, porcelain stand `#ece6de`, velvet
cloth `#1e0a0f` with `#5a2430` sheen, wax `#f3e8d6`.

## Cake build

| Part | How |
|---|---|
| Tiers | Lathe profiles with rounded frosting edges; spatula-stroke bump map + fine grain |
| Piping | Instanced shell drops (tapered, ridged) at every tier edge; 12 piped hearts on the lower tier |
| Pearls / dragées | Instanced lustrous pearls at the top-tier base, gold dragée lines on both tiers |
| Garnish | Lathe strawberries with seed texture and calyx, blueberries with bloom sheen, 5-petal sugar flowers |
| Board | Gold-foil board with a mirror-gold edge on a porcelain stand |
| Lettering | "Happy Birthday to My Love Eshu" (from `cakeMessage`), balanced onto two lines, piped-chocolate texture + relief map, front half of the top |
| Slice | 40° wedge at the back-right, same lathe as the body; interior faces show three sponge layers with crust lines, buttercream and strawberry filling, crumb pores |

## Typography

- Display: Cormorant Garamond 300, `clamp(2rem, 5.6vw, 4.4rem)`, line-height 1.08, balanced wrap.
- Digits: Cormorant 300 in fixed `0.56em` slots (no layout shift), lining numerals.
- Labels: Jost 400, 0.64–0.72 rem, uppercase, 0.3 em tracking, gold or faint cream.
- Prompts: Cormorant italic. Message lines: Cormorant 400 at ≥ 1.08 rem with a soft dark text-shadow.

## Lighting

| Light | Role | Notes |
|---|---|---|
| Hemisphere | Barely-there ambient | 0.02–0.24, burgundy sky / black ground |
| Key spot | Warm champagne from front-right-above | Narrow cone, soft penumbra, the only shadow caster; makes the cake the brightest object |
| Fill | Muted blush from the left | Keeps shadow detail, low |
| Rim | Champagne from behind | Separates cake from background |
| Candle points ×6 | Warm amber, 3.2 unit falloff | Gentle layered-sine flicker, fade with the flame |
| Environment | Three local light-formers | Reflections on gold, steel and porcelain only; no HDR download |

Background glow and vignette are CSS layers behind/over a transparent canvas — no post-processing.

## Atmosphere

- Dust: 520 points (220 on low quality), drift ~0.04 units/s, twinkle, additive, low alpha.
- Bokeh: 9 large soft discs far behind the cake; brighter rims like real lens bokeh.
- Smoke: 12 soft points per candle for 2.6 s after it goes out.
- Confetti: 150 (70 low) gold / champagne / blush / ivory flakes, falls *around* the cake and settles on
  the cloth before the message appears, never over the text.

## Composition

| Shot | Frame |
|---|---|
| Countdown | Pure type over glow; 3D geometry hidden while dark. |
| Wish | Name at top, cake in the middle band, prompt + controls at the bottom over a dark scrim. |
| Cut | Three-quarter from the front-right: both cut lines broadside, lettering readable, interior visible after the slice moves. |
| Finale | Cake in the lower third, message in the dark space above, replay tucked bottom-right (bottom-centre on phones). |

Portrait screens pull the camera back (`distanceScale`) so the full stand fits; short landscape phones
pull back slightly and compact the text.

## Asset requirements

Current build needs **no binary assets**. Optional:

| Asset | Where | Requirements |
|---|---|---|
| Music | `public/*.mp3` + `music` in config | Licensed for web use; ≤ 3 MB; loops cleanly |
| Sculpted cake (future) | `public/models/*.glb` | Must include intact cake + matching slice mesh with interior faces, Draco/meshopt-compressed, ≤ 3 MB, CC0 or purchased licence |

## Development checklist

- [x] Config in one file, validated, with diagnostics
- [x] Countdown: exact target, DST/timezone, tab recovery, no layout shift
- [x] Single canvas, lazy-loaded; WebGL failure fallback
- [x] Lighting hierarchy, atmosphere, cinematic camera with reduced-motion handling
- [x] Procedural cake, candles with independent flames, smoke
- [x] Mic + button blow-out; privacy; cleanup
- [x] Pre-split slice, knife choreography, confetti
- [x] Finale, replay (×3 verified)
- [x] Phone / tablet / landscape layouts verified in headless Chrome
- [ ] Optional: licensed music file
- [ ] Optional: replace procedural cake with a sculpted GLB (keep `spec.ts` dimensions)
- [ ] Test on real iOS Safari and Android Chrome hardware (only emulated viewports were tested)
