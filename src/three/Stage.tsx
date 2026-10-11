import gsap from 'gsap'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Scene, SceneEvent } from '../lib/scene.ts'
import { Atmosphere, Confetti, FinaleHearts } from './Atmosphere.tsx'
import { Cake, Knife } from './Cake.tsx'
import { Candles } from './Candles.tsx'
import { createRig, sceneTimeline, type Rig, type Sfx } from './rig.ts'
import { EAT_POINT, distanceScale } from './spec.ts'

export type Quality = 'high' | 'low'

export interface StageProps {
  scene: Scene
  dispatch: (e: SceneEvent) => void
  reduced: boolean
  quality: Quality
  /** Sound cues fired from the timelines. */
  sfx: (s: Sfx) => void
  /** Freezes every GSAP timeline and the crumb/confetti physics. */
  paused: boolean
}

/** Builds the scene's GSAP timeline; killing it on change guarantees one owner per property. */
function Director({ rig, scene, dispatch, reduced, sfx, paused }: StageProps & { rig: Rig }) {
  useEffect(() => {
    const tl = sceneTimeline(scene, rig, { reduced, dispatch, sfx })
    // Dev only: lets automated checks seek to an exact beat regardless of frame rate.
    if (import.meta.env.DEV) Object.assign(window, { __timeline: tl })
    return () => { tl.kill() }
  }, [scene, rig, reduced, dispatch, sfx])
  useEffect(() => {
    rig.paused = paused
    if (paused) gsap.globalTimeline.pause()
    else gsap.globalTimeline.resume()
  }, [paused, rig])
  return null
}

const tmp = new THREE.Vector3()

function CameraRig({ rig, reduced }: { rig: Rig; reduced: boolean }) {
  useFrame(({ camera, size, clock }) => {
    const c = rig.cam
    const k = distanceScale(size.width / size.height, size.height, Math.hypot(c.px - c.tx, c.py - c.ty, c.pz - c.tz), c.w)
    // Slow idle orbit of ±3° over 16 s; off for reduced motion.
    const sway = reduced ? 0 : rig.sway * 0.05 * Math.sin((clock.elapsedTime * Math.PI * 2) / 16)
    tmp.set(c.px - c.tx, c.py - c.ty, c.pz - c.tz).multiplyScalar(k).applyAxisAngle(THREE.Object3D.DEFAULT_UP, sway)
    camera.position.set(c.tx + tmp.x, c.ty + tmp.y, c.tz + tmp.z)
    camera.lookAt(c.tx, c.ty, c.tz)
  })
  return null
}

function Lights({ rig, quality }: { rig: Rig; quality: Quality }) {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const key = useRef<THREE.SpotLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const eatTarget = useMemo(() => new THREE.Object3D(), [])
  const eat = useRef<THREE.SpotLight>(null)
  const scene = useThree((s) => s.scene)

  useFrame(() => {
    hemi.current!.intensity = 0.02 + 0.22 * rig.env
    key.current!.intensity = 80 * rig.key
    fill.current!.intensity = 0.32 * rig.fill
    rim.current!.intensity = 1.5 * rig.rim
    // A soft key that follows the slice into the foreground, where the main key's cone does not reach.
    eat.current!.intensity = 22 * rig.pick * (1 - rig.sliceDrop)
    scene.environmentIntensity = 0.32 * rig.env
  })

  const map = quality === 'high' ? 1024 : 512
  return (
    <>
      <primitive object={target} position={[0, 0.9, 0]} />
      <hemisphereLight ref={hemi} args={['#4a2028', '#060304', 0]} />
      <spotLight
        ref={key} target={target} color="#ffdcb4" position={[2.4, 6.4, 3.6]} angle={0.3} penumbra={0.85}
        decay={2} intensity={0} castShadow shadow-mapSize={[map, map]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-near={3} shadow-camera-far={14}
      />
      <directionalLight ref={fill} color="#e9b7b2" position={[-4.5, 2.4, 3]} intensity={0} />
      <directionalLight ref={rim} color="#ffe0ad" position={[-1.2, 4.2, -5.5]} intensity={0} />
      <primitive object={eatTarget} position={EAT_POINT as unknown as [number, number, number]} />
      <spotLight ref={eat} target={eatTarget} color="#ffe2c0" position={[EAT_POINT[0] + 0.6, EAT_POINT[1] + 2.4, EAT_POINT[2] + 1.6]} angle={0.45} penumbra={1} decay={2} intensity={0} />
    </>
  )
}

/** In total darkness nothing is drawn, so unlit shapes never show as silhouettes over the glow. */
function Lit({ rig, children }: { rig: Rig; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => { ref.current!.visible = rig.env + rig.key + rig.rim > 0.002 })
  return <group ref={ref}>{children}</group>
}

/** Velvet tablecloth whose edge dissolves into the dark — no hard rim floating in space. */
function Table() {
  const m = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.55, '#fff')
    grad.addColorStop(1, '#000')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    const alpha = new THREE.CanvasTexture(c)
    return {
      alpha,
      geo: new THREE.CircleGeometry(4.6, 96).rotateX(-Math.PI / 2),
      mat: new THREE.MeshPhysicalMaterial({
        color: '#1e0a0f', roughness: 0.92, sheen: 0.6, sheenRoughness: 0.6, sheenColor: '#5a2430',
        alphaMap: alpha, transparent: true, depthWrite: false,
      }),
    }
  }, [])
  useEffect(() => () => { m.geo.dispose(); m.mat.dispose(); m.alpha.dispose() }, [m])
  return <mesh geometry={m.geo} material={m.mat} receiveShadow renderOrder={-1} />
}

export default function Stage(props: StageProps) {
  const rig = useMemo(() => createRig(), [])
  const { dispatch } = props
  const pick = useCallback(() => dispatch('pick'), [dispatch])
  const high = props.quality === 'high'
  const [dpr, setDpr] = useState(high ? 1.75 : 1.25)
  return (
    <Canvas
      className="stage"
      shadows
      dpr={[1, dpr]}
      camera={{ fov: 35, near: 0.1, far: 60, position: [0, 3.4, 13] }}
      gl={{ antialias: high, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Director {...props} rig={rig} />
      <CameraRig rig={rig} reduced={props.reduced} />
      <Lights rig={rig} quality={props.quality} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.5} color="#ffd8a6" position={[0, 5, 3]} scale={[7, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#f0b8b0" position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffe6c0" position={[3, 3, -6]} scale={[5, 1, 1]} />
      </Environment>
      <Lit rig={rig}>
        <Table />
        <Cake rig={rig} onPick={pick} />
        <Candles rig={rig} />
        <Knife rig={rig} />
      </Lit>
      <Atmosphere rig={rig} count={high ? 520 : 220} reduced={props.reduced} />
      <Confetti rig={rig} count={high ? 150 : 70} />
      <FinaleHearts rig={rig} />
    </Canvas>
  )
}
