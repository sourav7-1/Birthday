import { Component, lazy, Suspense, useCallback, useEffect, useReducer, useState, type ReactNode } from 'react'
import { birthday, ui } from './config/birthday.ts'
import { initialScene, nextScene, shouldAutoEnter, type Scene, type SceneEvent } from './lib/scene.ts'
import { duckMusic, enableSound, resetMusic, setMuted, sfx } from './lib/sound.ts'
import { validateConfig } from './lib/time.ts'
import { useCountdown } from './lib/useCountdown.ts'
import type { Quality } from './three/Stage.tsx'
import { Countdown } from './ui/Countdown.tsx'
import { CakeTitle, CutPanel, EatingCaption, Finale, SlicePanel, WishPanel } from './ui/Overlay.tsx'

// three.js is ~1 MB; the countdown paints first and the stage streams in behind it.
const Stage = lazy(() => import('./three/Stage.tsx'))

const config = validateConfig(birthday)

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
  return weak || matchMedia('(pointer: coarse)').matches ? 'low' : 'high'
}

function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)'
  const [reduced, set] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => set(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return reduced
}

class StageBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.error('3D stage failed, continuing without it:', e)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Diagnostic({ error }: { error: string }) {
  return (
    <main className="screen diagnostic" role="alert">
      <p className="eyebrow">{ui.diagnostic.eyebrow}</p>
      <h1 className="display">{ui.diagnostic.title}</h1>
      <ul>{error.split('\n').map((e) => <li key={e}>{e}</li>)}</ul>
      <p>{ui.diagnostic.fix} <code>target: {"{ local: '2026-10-12T00:00', timeZone: 'Asia/Dhaka' }"}</code></p>
    </main>
  )
}

export default function App() {
  return config.ok ? <Experience targetMs={config.value} /> : <Diagnostic error={config.error} />
}

/** Without WebGL the 3D timelines never run, so these scenes advance on a timer instead. */
const FALLBACK_NEXT: Partial<Record<Scene, SceneEvent>> = {
  intro: 'introDone', blowing: 'blown', cutting: 'cutDone', pickup: 'picked', firstBite: 'bitten', secondBite: 'eaten',
}

/** Scenes that play on their own and can be paused; interactive scenes wait anyway. */
const PAUSABLE: Scene[] = ['intro', 'blowing', 'cutting', 'pickup', 'firstBite', 'secondBite', 'message']

function Experience({ targetMs }: { targetMs: number }) {
  const [init] = useState(() => {
    const preview = new URLSearchParams(location.search).get('preview')
    const now = Date.now()
    const s = initialScene({ targetMs, nowMs: now, afterTarget: birthday.afterTarget, preview, allowPreview: birthday.allowPreview })
    return { ...s, watchedLive: !s.preview && now < targetMs }
  })
  const [scene, dispatch] = useReducer(nextScene, init.scene)
  const remaining = useCountdown(targetMs)!
  const reduced = useReducedMotion()
  const [quality] = useState(detectQuality)
  const [webgl, setWebgl] = useState(hasWebGL)
  const [sound, setSound] = useState(false)
  const [paused, setPaused] = useState(false)
  const [micStatus, setMicStatus] = useState('')

  useEffect(() => {
    if (shouldAutoEnter({ scene, reached: remaining.done, autoStart: birthday.autoStart, watchedLive: init.watchedLive }))
      dispatch('enter') // no user gesture here, so sound stays off until the visitor enables it
  }, [scene, remaining.done, init.watchedLive])

  useEffect(() => {
    const ev = FALLBACK_NEXT[scene]
    if (webgl || !ev) return
    const t = setTimeout(() => dispatch(ev), 1200)
    return () => clearTimeout(t)
  }, [scene, webgl])

  useEffect(() => {
    document.body.dataset.scene = scene
    if (scene === 'message') duckMusic()
  }, [scene])

  const enter = async () => {
    dispatch('enter')
    setSound(await enableSound())
  }
  const toggleSound = async () => {
    if (sound) {
      setMuted(true)
      setSound(false)
    } else setSound(await enableSound())
  }
  const replay = () => {
    resetMusic()
    setPaused(false)
    dispatch('replay')
  }
  const recut = () => {
    setPaused(false)
    dispatch('recut')
  }
  const onBlow = useCallback(() => dispatch('blow'), [])
  const status = ui.status[scene] ?? micStatus

  return (
    <>
      <div className="backdrop" aria-hidden />
      {webgl && (
        <StageBoundary onError={() => setWebgl(false)}>
          <Suspense fallback={<p className="loading" role="status">{ui.loading}</p>}>
            <Stage scene={scene} dispatch={dispatch} reduced={reduced} quality={quality} sfx={sfx} paused={paused} />
          </Suspense>
        </StageBoundary>
      )}
      <div className="vignette" aria-hidden />

      <div className="hud">
        {init.preview && <a className="badge" href={location.pathname}>{ui.preview} · {scene} — {ui.exitPreview}</a>}
        {webgl && PAUSABLE.includes(scene) && (
          <button className="btn btn-ghost btn-small pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? ui.resume : ui.pause}
          </button>
        )}
        {scene !== 'countdown' && (
          <button className="btn btn-ghost btn-small sound" onClick={toggleSound} aria-pressed={sound}>
            {sound ? ui.soundOn : ui.soundEnable}
          </button>
        )}
      </div>

      {scene === 'countdown' && <Countdown r={remaining} onEnter={enter} />}
      {(scene === 'intro' || scene === 'wish') && (
        <div className="screen stage-ui">
          <CakeTitle scene={scene} />
          {scene === 'wish' && <WishPanel onBlow={onBlow} announce={setMicStatus} />}
        </div>
      )}
      {(scene === 'cutReady' || scene === 'cutting') && (
        <div className="screen stage-ui">
          <CutPanel busy={scene === 'cutting'} onCut={() => dispatch('cut')} />
        </div>
      )}
      {scene === 'sliceReady' && (
        <div className="screen stage-ui">
          <SlicePanel onPick={() => dispatch('pick')} />
        </div>
      )}
      {(scene === 'firstBite' || scene === 'secondBite') && (
        <div className="screen stage-ui">
          <EatingCaption />
        </div>
      )}
      {scene === 'message' && (
        <div className="screen stage-ui finale-ui">
          <Finale onReplay={replay} onRecut={recut} />
        </div>
      )}
      {!webgl && scene !== 'countdown' && (
        <p className="fallback-note">{ui.noWebgl}</p>
      )}
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </>
  )
}
