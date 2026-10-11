# Cinematic 3D Birthday Experience

A countdown that opens, at the chosen moment, into a candle-lit 3D birthday cake:
make a wish, blow out the candles (microphone or button), cut the cake, read the message.

React 19 · TypeScript · Vite · three.js · React Three Fiber · Drei · GSAP. No backend.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run check      # types + lint + tests
npm run build      # production build → dist/
```

## Set the birthday (one file)

Everything personal lives in **`src/config/birthday.ts`**: name, date/time, every line of copy, music, mic sensitivity.
Interface labels (all in Bengali) are in the `ui` object in the same file. The cake-top text is `cakeMessage`.

```ts
target: { local: '2026-10-12T00:00', timeZone: 'Asia/Dhaka' },
```

1. `local` is the wall-clock moment in the birthday person's city, `YYYY-MM-DDTHH:mm`.
2. Give **either** `timeZone` (an IANA name — DST handled automatically) **or** `utcOffset`:
   - Bangladesh: `timeZone: 'Asia/Dhaka'` or `utcOffset: '+06:00'` (identical; Bangladesh has no DST).
   - India `Asia/Kolkata`, UK `Europe/London`, New York `America/New_York`, etc.
3. Save. If anything is wrong (bad date, unknown zone, a time skipped by DST) the page shows a
   diagnostic listing each problem instead of crashing.

Everyone who opens the page counts down to the same absolute instant, wherever they are.

## Preview before the date

In `npm run dev`, add `?preview=<scene>` to the URL:
`countdown`, `intro`, `wish`, `blowing`, `cutReady`, `cutting`, `sliceReady`, `pickup`, `firstBite`, `secondBite`, `message` —
e.g. `http://localhost:5173/?preview=wish`. A badge marks preview mode; it never changes the target.
Preview is disabled in production builds (`allowPreview: import.meta.env.DEV`).

## Deploy

Static site — any static host works. Microphone access requires **HTTPS** (both hosts below provide it).

| | Cloudflare Pages | Vercel |
|---|---|---|
| Framework preset | Vite (or None) | Vite (auto-detected) |
| Build command | `npm run build` | `npm run build` |
| Output directory | `dist` | `dist` |
| Node version | 20+ | 20+ |

No environment variables, rewrites or server functions are needed.

## Assets and licensing

- **3D:** the cake, candles, knife, stand and table are generated in code (`src/three/`). No model files.
- **Fonts:** Cormorant Garamond and Jost from Google Fonts (SIL Open Font License).
- **Sound:** the candle "puff" is synthesised in the browser. Music is optional — put a file you have
  the rights to in `public/` and set `music: { src: '/music.mp3', volume: 0.6 }`. A missing file is ignored.
- Anything you add must be licensed for public web use. Do not add photos or likenesses of people.

## Known limitations

See [docs/ARCHITECTURE.md → Limitations](docs/ARCHITECTURE.md#limitations). In short: time comes from each
visitor's device clock; blow detection is loudness-based; the cake is procedural (no sculpted model);
the cut uses pre-split geometry, not real-time mesh slicing.
