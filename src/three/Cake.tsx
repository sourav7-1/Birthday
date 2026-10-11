import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { birthday } from '../config/birthday.ts'
import { updateCuts, type Rig } from './rig.ts'
import { heartGeometry } from './shapes.ts'
import {
  BOARD, CAKE_TOP_Y, CUT_LINES, EDGE, KNIFE, MESSAGE, SLICE_ANGLE, SLICE_CENTER, SLICE_CENTROID, SLICE_DIR,
  STAND, TIER_BOTTOM, TIER_TOP, inSlice, knifeYaw, polar, splitMessage,
  EAT_POINT, EAT_TO_CAMERA, EAT_YAW, PICK_LIFT, biteBoundary, wrapAngle,
} from './spec.ts'

// Procedural cake: no model file exists, so everything is built from lathe, shape
// and instanced geometry. The top tier is pre-split into body + slice that share
// exact edges, so the cake looks intact until the slice moves.

const V2 = (x: number, y: number) => new THREE.Vector2(x, y)
const UP = new THREE.Vector3(0, 1, 0)

/** Tier silhouette in (radius, height), with a rounded frosting edge. */
function profile(R: number, H: number) {
  const pts = [V2(0, 0), V2(R - 0.012, 0), V2(R, 0.012)]
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2)
    pts.push(V2(R - EDGE + EDGE * Math.cos(a), H - EDGE + EDGE * Math.sin(a)))
  }
  pts.push(V2(0, H))
  return pts
}

/** Flat cut face at angle phi — the tier profile as a filled shape, inset 4 mm so
 *  its edge never pokes through the frosting of the intact cake. */
function cutFace(R: number, H: number, phi: number) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(profile(R - 0.004, H - 0.004)), 6)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) g.attributes.uv.setXY(i, pos.getX(i) / R, pos.getY(i) / H)
  g.rotateY(knifeYaw(phi))
  return g
}

/** A partial lathe whose u runs over the absolute angle, so body and slice share one
 *  continuous frosting texture and the joint is invisible. */
function arcLathe(points: THREE.Vector2[], segments: number, phiStart: number, phiLength: number) {
  const g = new THREE.LatheGeometry(points, segments, phiStart, phiLength)
  const uv = g.attributes.uv
  const span = phiLength / (Math.PI * 2), start = ((phiStart / (Math.PI * 2)) % 1 + 1) % 1
  for (let i = 0; i < uv.count; i++) uv.setX(i, start + uv.getX(i) * span)
  return g
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const t = new THREE.CanvasTexture(canvas)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Smoothing marks left by a turntable spatula: soft horizontal strokes plus fine grain. */
const spatulaTexture = () => {
  const t = canvasTexture(512, 512, (c) => {
    c.fillStyle = '#808080'
    c.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * 512, h = 1 + Math.random() * 7, v = Math.round(128 + (Math.random() - 0.5) * 70)
      const g = c.createLinearGradient(0, y - h, 0, y + h)
      g.addColorStop(0, 'rgba(128,128,128,0)')
      g.addColorStop(0.5, `rgba(${v},${v},${v},0.55)`)
      g.addColorStop(1, 'rgba(128,128,128,0)')
      c.fillStyle = g
      c.fillRect(Math.random() * 300 - 200, y - h, 300 + Math.random() * 500, h * 2)
    }
    const img = c.getImageData(0, 0, 512, 512)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n))
    }
    c.putImageData(img, 0, 0)
  }, false)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 1)
  return t
}

/** Vanilla sponge with crust lines, cream + berry filling, frosting coat on the outside and top.
 *  The same canvas is the bump map — crumb pores read as an uneven cut surface. */
function interiorTextures() {
  const S = 512
  const color = canvasTexture(S, S, (c) => {
    const band = (from: number, to: number, fill: string) => {
      c.fillStyle = fill
      c.fillRect(0, S * (1 - to), S, S * (to - from))
    }
    band(0, 1, '#ecd09a')
    for (const [a, b] of [[0, 0.02], [0.3, 0.315], [0.6, 0.615]]) band(a, b, '#c99a5c') // baked crust
    for (const [a, b] of [[0.27, 0.3], [0.57, 0.6]]) band(a, b, '#faf3e9') // buttercream
    for (const [a, b] of [[0.255, 0.27], [0.555, 0.57]]) band(a, b, '#b5485a') // strawberry
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = Math.random() < 0.6 ? `rgba(150,105,55,${Math.random() * 0.35})` : `rgba(255,244,215,${Math.random() * 0.3})`
      c.beginPath()
      c.arc(Math.random() * S, Math.random() * S, Math.random() * 2.2, 0, Math.PI * 2)
      c.fill()
    }
    band(0.9, 1, '#f8f1e6')
    c.fillStyle = '#f8f1e6'
    c.fillRect(S - 14, 0, 14, S)
  })
  return { color, bump: new THREE.CanvasTexture(color.image as HTMLCanvasElement) }
}

/** Red flesh with seed dimples, for the strawberry lathe (u around, v tip → shoulder). */
const strawberryTexture = () => {
  const t = canvasTexture(256, 256, (c) => {
    const g = c.createLinearGradient(0, 256, 0, 0)
    g.addColorStop(0, '#d8303a')
    g.addColorStop(0.75, '#b5121f')
    g.addColorStop(1, '#8e0f18')
    c.fillStyle = g
    c.fillRect(0, 0, 256, 256)
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 10; col++) {
        const x = (col + (row % 2) * 0.5) * 25.6, y = 14 + row * 20
        c.fillStyle = '#7d0d14'
        c.beginPath(); c.ellipse(x, y, 4.5, 6, 0, 0, Math.PI * 2); c.fill()
        c.fillStyle = '#e9c45a'
        c.beginPath(); c.ellipse(x, y, 1.8, 2.8, 0, 0, Math.PI * 2); c.fill()
      }
  })
  t.wrapS = THREE.RepeatWrapping
  return t
}

/** Soft compression ring where the knife tip presses into the frosting. */
const dentTexture = () =>
  canvasTexture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(90,70,55,0.55)')
    g.addColorStop(0.45, 'rgba(120,95,75,0.25)')
    g.addColorStop(0.7, 'rgba(255,250,240,0.18)')
    g.addColorStop(1, 'rgba(255,250,240,0)')
    c.fillStyle = g
    c.fillRect(0, 0, 64, 64)
  })

const LETTER_FONT = (px: number) => `700 ${px}px "Dancing Script", "Brush Script MT", "Segoe Script", cursive`

/**
 * Piped chocolate lettering, drawn to a transparent texture laid flat on the frosting.
 * A matching height map (soft-blurred glyphs) gives it raised, rounded relief under the lights.
 */
function drawLettering(text: string) {
  const W = 2048, H = Math.round((W * MESSAGE.depth) / MESSAGE.width)
  const color = document.createElement('canvas'), height = document.createElement('canvas')
  color.width = height.width = W
  color.height = height.height = H
  const c = color.getContext('2d')!, h = height.getContext('2d')!
  c.font = LETTER_FONT(100)
  const lines = splitMessage(text, (s) => c.measureText(s).width)
  // The far line may use 94% of the plate; the near line sits where the top is narrower.
  const limits = [0.94, 0.8]
  let px = 400
  lines.forEach((l, i) => { px = Math.min(px, (100 * W * limits[Math.min(i, 1)]) / c.measureText(l).width) })
  px = Math.min(px, (H * 0.9) / (lines.length * 1.05))
  const lineH = px * 1.05, top = (H - lineH * lines.length) / 2 + px * 0.82

  h.fillStyle = '#000'
  h.fillRect(0, 0, W, H)
  for (const ctx of [c, h]) {
    ctx.font = LETTER_FONT(px)
    ctx.textAlign = 'center'
  }
  lines.forEach((line, i) => {
    const y = top + i * lineH
    // Soft cast shadow on the frosting, then the chocolate body, lighter along its top edge.
    c.shadowColor = 'rgba(70,38,20,0.45)'
    c.shadowBlur = px * 0.06
    c.shadowOffsetY = px * 0.035
    c.fillStyle = '#2b140b'
    c.fillText(line, W / 2, y)
    c.shadowColor = 'transparent'
    const g = c.createLinearGradient(0, y - px * 0.8, 0, y + px * 0.2)
    g.addColorStop(0, '#80502f')
    g.addColorStop(0.55, '#4a2716')
    g.addColorStop(1, '#2a130a')
    c.fillStyle = g
    c.fillText(line, W / 2, y)
    h.shadowColor = '#fff'
    h.shadowBlur = px * 0.05
    h.fillStyle = '#fff'
    h.fillText(line, W / 2, y)
  })
  const map = new THREE.CanvasTexture(color)
  map.colorSpace = THREE.SRGBColorSpace
  return { map, bump: new THREE.CanvasTexture(height), lines }
}

function Lettering() {
  const gl = useThree((s) => s.gl)
  const [tex, setTex] = useState<ReturnType<typeof drawLettering> | null>(null)
  useEffect(() => {
    let alive = true
    let made: ReturnType<typeof drawLettering> | null = null
    // Wait (briefly) for the script font; if it never arrives a system script font is used.
    const font = document.fonts?.load(LETTER_FONT(100), birthday.cakeMessage) ?? Promise.resolve()
    Promise.race([font, new Promise((r) => setTimeout(r, 2500))]).catch(() => {}).finally(() => {
      if (!alive) return
      made = drawLettering(birthday.cakeMessage)
      made.map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      setTex(made)
    })
    return () => {
      alive = false
      made?.map.dispose()
      made?.bump.dispose()
    }
  }, [gl])
  const geo = useMemo(() => new THREE.PlaneGeometry(MESSAGE.width, MESSAGE.depth).rotateX(-Math.PI / 2), [])
  useEffect(() => () => geo.dispose(), [geo])
  if (!tex) return null
  return (
    <mesh geometry={geo} position={[0, CAKE_TOP_Y + 0.0015, MESSAGE.z]} renderOrder={1} receiveShadow>
      <meshStandardMaterial
        map={tex.map} bumpMap={tex.bump} bumpScale={6} roughness={0.32} metalness={0}
        transparent alphaTest={0.02} depthWrite={false} polygonOffset polygonOffsetFactor={-2}
      />
    </mesh>
  )
}

type Item = { phi?: number; matrix: THREE.Matrix4; color?: THREE.Color }

/** Instance matrices for a ring. Angles are offset half a step so a ring whose count is
 *  a multiple of 9 never straddles a slice edge (the edges sit at 100° and 140°). */
function ring(count: number, r: number, y: number, scale: [number, number, number]) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(...scale)
  return Array.from({ length: count }, (_, k) => {
    const phi = ((k + 0.5) / count) * Math.PI * 2
    q.setFromAxisAngle(UP, phi)
    return { phi, matrix: m.compose(new THREE.Vector3(...polar(r, phi, y)), q, s).clone() }
  })
}

function Instances({ items, geometry, material, shadow = true }: { items: Item[]; geometry: THREE.BufferGeometry; material: THREE.Material; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    items.forEach((it, i) => {
      ref.current!.setMatrixAt(i, it.matrix)
      if (it.color) ref.current!.setColorAt(i, it.color)
    })
    ref.current!.instanceMatrix.needsUpdate = true
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadow} receiveShadow />
}

/** A piped shell: an elongated drop that tapers to a tail, with fine ridges from the star tip. */
function shellGeometry() {
  const g = new THREE.SphereGeometry(0.03, 14, 9)
  const p = g.attributes.position, v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const taper = v.x > 0 ? 1 - 0.6 * (v.x / 0.03) : 1
    const ridge = 1 + 0.07 * Math.sin(10 * Math.atan2(v.y, v.z))
    p.setXYZ(i, v.x, v.y * taper * ridge, v.z * taper * ridge)
  }
  g.computeVertexNormals()
  return g
}


/** Tip at y = 0, shoulders at the top where the calyx sits. */
const strawberryGeometry = () =>
  new THREE.LatheGeometry(
    [[0, 0], [0.008, 0.004], [0.02, 0.018], [0.032, 0.04], [0.041, 0.065], [0.044, 0.085], [0.04, 0.1], [0.026, 0.11], [0, 0.113]]
      .map(([x, y]) => V2(x, y)), 20)

function calyxGeometry() {
  const s = new THREE.Shape()
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.014 : 0.05
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.moveTo(r, 0)
  }
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
}

const mat4 = (pos: readonly number[], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale),
  )

/** Fruit and sugar flowers: a few inside the candle arc on top, and two small clusters on the lower tier. */
function garnish() {
  const top = CAKE_TOP_Y, ledge = TIER_TOP.base
  const deg = (d: number) => (d * Math.PI) / 180
  // Strawberries lie almost on their side, shoulders slightly raised.
  const berry = (r: number, a: number, y: number, yaw: number) =>
    mat4(polar(r, deg(a), y + 0.03), [0, deg(a) + yaw, Math.PI / 2 - 0.25])
  const strawberries = [berry(0.27, 208, top, 0.4), berry(0.2, 238, top, -0.6), berry(0.86, -42, ledge, 0.3), berry(0.84, -18, ledge, -0.5), berry(0.86, 52, ledge, 0.2)]
  const blue = (r: number, a: number, y: number) => mat4(polar(r, deg(a), y + 0.024), [deg(a * 7), deg(a * 3), 0])
  const blueberries = [blue(0.34, 192, top), blue(0.32, 252, top), blue(0.14, 224, top), blue(0.9, -30, ledge), blue(0.8, -52, ledge), blue(0.92, 62, ledge)]
  const flowers = [
    { at: polar(0.83, deg(-30), ledge + 0.02), color: '#f3d4d0', s: 1.1 },
    { at: polar(0.93, deg(-6), ledge + 0.018), color: '#fbf6ee', s: 0.85 },
    { at: polar(0.86, deg(40), ledge + 0.02), color: '#fbf6ee', s: 1 },
    { at: polar(0.3, deg(222), top + 0.02), color: '#f3d4d0', s: 0.8 },
  ]
  const petals: Item[] = [], centres: Item[] = []
  for (const f of flowers) {
    const base = mat4(f.at, [0, f.at[0] * 3, 0], f.s)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      const local = mat4([Math.cos(a) * 0.024, 0.004, Math.sin(a) * 0.024], [0, -a, 0.35], [0.034, 0.009, 0.022])
      petals.push({ matrix: base.clone().multiply(local), color: new THREE.Color(f.color) })
    }
    centres.push({ matrix: base.clone().multiply(mat4([0, 0.012, 0], [0, 0, 0], 0.011)) })
  }
  return {
    strawberries: strawberries.map((matrix) => ({ matrix })),
    calyces: strawberries.map((m) => ({ matrix: m.clone().multiply(mat4([0, 0.112, 0])) })),
    blueberries: blueberries.map((matrix) => ({ matrix })),
    petals,
    centres,
  }
}

function useCakeAssets() {
  const a = useMemo(() => {
    const spatula = spatulaTexture()
    const interior = interiorTextures()
    const berry = strawberryTexture()
    const dent = dentTexture()
    const frosting = { roughness: 0.55, sheen: 0.5, sheenRoughness: 0.5, clearcoat: 0.06, clearcoatRoughness: 0.6, bumpMap: spatula, bumpScale: 1.2 }
    return {
      spatula, interiorMap: interior.color, interiorBump: interior.bump, berry, dent,
      ivory: new THREE.MeshPhysicalMaterial({ color: '#f8f1e6', sheenColor: '#fff8ee', ...frosting }),
      // The slice's own frosting: wins the joint overlap, and can glow softly when it invites a tap.
      sliceIvory: new THREE.MeshPhysicalMaterial({ color: '#f8f1e6', sheenColor: '#fff8ee', ...frosting, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, emissive: '#ffcf9a', emissiveIntensity: 0 }),
      blush: new THREE.MeshPhysicalMaterial({ color: '#efc8c3', sheenColor: '#ffe6e1', ...frosting }),
      piping: new THREE.MeshPhysicalMaterial({ color: '#fbf5ec', roughness: 0.5, sheen: 0.6, sheenColor: '#fffaf2' }),
      pearl: new THREE.MeshPhysicalMaterial({ color: '#f6efe6', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 1, sheenColor: '#ffe9f0' }),
      gold: new THREE.MeshStandardMaterial({ color: '#d9b36c', metalness: 1, roughness: 0.26 }),
      porcelain: new THREE.MeshPhysicalMaterial({ color: '#ece6de', roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
      boardTop: new THREE.MeshStandardMaterial({ color: '#dcc28d', metalness: 0.75, roughness: 0.38 }),
      boardEdge: new THREE.MeshStandardMaterial({ color: '#e4bf72', metalness: 1, roughness: 0.14, envMapIntensity: 2 }),
      inside: new THREE.MeshStandardMaterial({ map: interior.color, bumpMap: interior.bump, bumpScale: 2.5, roughness: 0.85, side: THREE.DoubleSide, emissive: '#3a2410', emissiveIntensity: 0.18 }),
      strawberry: new THREE.MeshPhysicalMaterial({ map: berry, bumpMap: berry, bumpScale: 1.5, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
      calyx: new THREE.MeshStandardMaterial({ color: '#4c7a33', roughness: 0.7, side: THREE.DoubleSide }),
      blueberry: new THREE.MeshPhysicalMaterial({ color: '#2b3254', roughness: 0.55, sheen: 1, sheenColor: '#9aa6c8', sheenRoughness: 0.4 }),
      petal: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.65, sheen: 0.6, sheenColor: '#ffffff' }),
      groove: new THREE.MeshBasicMaterial({ color: '#6a5442', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      dentMat: new THREE.MeshBasicMaterial({ map: dent, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      crumb: new THREE.MeshStandardMaterial({ color: '#e2c38a', roughness: 0.9 }),
      shell: shellGeometry(),
      pearlGeo: new THREE.SphereGeometry(0.016, 14, 10),
      dragee: new THREE.SphereGeometry(0.011, 10, 8),
      heart: heartGeometry(),
      strawberryGeo: strawberryGeometry(),
      calyxGeo: calyxGeometry(),
      blueberryGeo: new THREE.SphereGeometry(0.024, 14, 10),
      petalGeo: new THREE.SphereGeometry(1, 12, 8),
      crumbGeo: new THREE.IcosahedronGeometry(1, 0),
    }
  }, [])
  useEffect(() => () => Object.values(a).forEach((v) => v.dispose()), [a])
  return a
}

type Assets = ReturnType<typeof useCakeAssets>

/** The visible cut: a groove across the top and down the side, exactly as far as the blade has gone. */
function CutMarks({ rig, a }: { rig: Rig; a: Assets }) {
  const tops = useRef<THREE.Mesh[]>([])
  const sides = useRef<THREE.Mesh[]>([])
  const dent = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => ({
    top: new THREE.PlaneGeometry(1, 0.007).translate(0.5, 0, 0).rotateX(-Math.PI / 2),
    side: new THREE.PlaneGeometry(0.007, 1).translate(0, -0.5, 0),
    dent: new THREE.CircleGeometry(0.06, 24).rotateX(-Math.PI / 2),
  }), [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  useFrame(() => {
    updateCuts(rig)
    // The grooves sit in the joint; once the slice has opened a real gap they are no longer needed.
    const open = rig.slice > 0.03
    rig.cuts.forEach((c, i) => {
      tops.current[i].visible = !open && c.top > 0.001
      tops.current[i].scale.x = Math.max(0.001, c.top * (TIER_TOP.radius - EDGE))
      sides.current[i].visible = !open && c.depth > 0.001
      sides.current[i].scale.y = Math.max(0.001, c.depth * (TIER_TOP.height - EDGE))
    })
    dent.current!.visible = rig.slice < 0.002 && rig.dent > 0.01
    dent.current!.scale.setScalar(Math.max(0.001, rig.dent))
  })

  return (
    <>
      {CUT_LINES.map((line, i) => {
        const [sx, sy, sz] = polar(TIER_TOP.radius + 0.0015, line, CAKE_TOP_Y - EDGE)
        return (
          <group key={i}>
            <mesh ref={(m) => { if (m) tops.current[i] = m }} geometry={geo.top} material={a.groove}
              position-y={CAKE_TOP_Y + 0.0012} rotation-y={knifeYaw(line)} visible={false} />
            <mesh ref={(m) => { if (m) sides.current[i] = m }} geometry={geo.side} material={a.groove}
              position={[sx, sy, sz]} rotation-y={line} visible={false} />
          </group>
        )
      })}
      <mesh ref={dent} geometry={geo.dent} material={a.dentMat} position-y={CAKE_TOP_Y + 0.0011} visible={false} />
    </>
  )
}

/** Roll at the eat point (radians): tips the top toward the camera so the bite outline reads. */
const ROLL = -0.35

const CRUMB_SLOTS = 8
/** Crumb bursts: the two cuts, then the two bites. */
const BURSTS = 4

/**
 * Crumbs only where something actually broke the cake: where each cut broke out through
 * the side (settling on the tier below, on the cake's side of the cut so the slice never
 * slides over them) and along each fresh bite edge (falling to the table).
 */
function Crumbs({ rig, a, slice }: { rig: Rig; a: Assets; slice: React.RefObject<THREE.Group | null> }) {
  const N = CRUMB_SLOTS * BURSTS
  const ref = useRef<THREE.InstancedMesh>(null)
  const sim = useMemo(() => ({
    pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), size: new Float32Array(N), floor: new Float32Array(N),
    live: new Uint8Array(N), started: Array<number>(BURSTS).fill(-1),
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(),
  }), [N])
  useFrame((_, delta) => {
    const mesh = ref.current!
    const times = [...rig.crumbsAt, ...rig.biteAt]
    times.forEach((at, b) => {
      if (at === sim.started[b]) return
      sim.started[b] = at
      for (let j = 0; j < CRUMB_SLOTS; j++) {
        const i = b * CRUMB_SLOTS + j, k = i * 3
        sim.live[i] = at >= 0 ? 1 : 0
        if (at < 0) continue
        sim.size[i] = 0.005 + Math.random() * 0.007
        if (b < 2) {
          const away = (b === 0 ? -1 : 1) * (0.01 + Math.random() * 0.05)
          const [x, , z] = polar(TIER_TOP.radius + 0.008 + Math.random() * 0.02, CUT_LINES[b] + away, 0)
          sim.pos.set([x, TIER_TOP.base + 0.05 + Math.random() * 0.4, z], k)
          sim.vel.set([x * 0.12, Math.random() * 0.08, z * 0.12], k)
          sim.floor[i] = TIER_TOP.base + sim.size[i] * 0.6
        } else {
          const edge = biteBoundary(b - 1, 12)
          const [x, z] = edge[Math.floor(Math.random() * edge.length)]
          sim.p.set(x, 0.04 + Math.random() * (TIER_TOP.height - 0.06), z)
          slice.current?.localToWorld(sim.p)
          sim.pos.set([sim.p.x, sim.p.y, sim.p.z], k)
          sim.vel.set([(Math.random() - 0.5) * 0.16, Math.random() * 0.12, (Math.random() - 0.5) * 0.16], k)
          sim.floor[i] = sim.size[i] * 0.6 // the table
        }
      }
    })
    const any = sim.live.some((v) => v)
    mesh.visible = any
    if (!any) return
    const dt = rig.paused ? 0 : Math.min(delta, 0.05)
    for (let i = 0; i < N; i++) {
      const k = i * 3
      if (sim.live[i] && sim.pos[k + 1] > sim.floor[i]) {
        sim.vel[k + 1] -= 3.2 * dt
        for (let j = 0; j < 3; j++) sim.pos[k + j] += sim.vel[k + j] * dt
        if (sim.pos[k + 1] <= sim.floor[i]) sim.pos[k + 1] = sim.floor[i]
      }
      sim.q.setFromAxisAngle(UP, i * 1.7)
      sim.m.compose(sim.p.set(sim.pos[k], sim.pos[k + 1], sim.pos[k + 2]), sim.q, sim.s.setScalar(sim.live[i] ? sim.size[i] : 0))
      mesh.setMatrixAt(i, sim.m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[a.crumbGeo, a.crumb, N]} visible={false} frustumCulled={false} />
}

/**
 * The slice after a bite, built as real geometry: the same outer frosting band, a flat top and
 * base trimmed to the bite, the two cut faces shortened, and a new vertical wall along the
 * scalloped bite edge that shows the sponge and cream layers.
 */
function bittenSlice(bite: number) {
  const { radius: R, height: H } = TIER_TOP
  const a0 = SLICE_CENTER - SLICE_ANGLE / 2, a1 = SLICE_CENTER + SLICE_ANGLE / 2
  const edge = biteBoundary(bite)
  const rA = Math.hypot(...edge[0]), rB = Math.hypot(...edge[edge.length - 1])
  /** Top-view outline of what remains, inside radius `outer`, as (x, z). */
  const outline = (outer: number) => {
    const pts: [number, number][] = [edge[0]]
    for (let i = 0; i <= 16; i++) {
      const phi = a0 + (i / 16) * SLICE_ANGLE
      pts.push([outer * Math.sin(phi), outer * Math.cos(phi)])
    }
    return [...pts, ...[...edge].reverse().slice(0, -1)]
  }
  // ShapeGeometry lies in XY; rotating about X lays it flat (up: z = −y, down: z = y).
  const cap = (outer: number, y: number, up: boolean) =>
    new THREE.ShapeGeometry(new THREE.Shape(outline(outer).map(([x, z]) => V2(x, up ? -z : z))))
      .rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0)
  const face = (phi: number, r0: number) => {
    const pts = profile(R, H)
    pts[0] = V2(r0, 0)
    pts[pts.length - 1] = V2(r0, H)
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 6)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) g.attributes.uv.setXY(i, pos.getX(i) / R, pos.getY(i) / H)
    return g.rotateY(knifeYaw(phi))
  }
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  edge.forEach(([x, z], j) => {
    pos.push(x, 0, z, x, H, z)
    const u = 0.05 + (0.85 * j) / (edge.length - 1) // stay clear of the frosting column at u ≈ 1
    uv.push(u, 0, u, 1)
    if (j) {
      const b = (j - 1) * 2
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  })
  const wall = new THREE.BufferGeometry()
  wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  wall.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  wall.setIndex(idx)
  wall.computeVertexNormals()
  return {
    side: arcLathe(profile(R, H).slice(1, -1), 14, a0, SLICE_ANGLE),
    top: cap(R - EDGE, H, true),
    bottom: cap(R - 0.012, 0, false),
    faceA: face(a0, rA),
    faceB: face(a1, rB),
    wall,
  }
}

/** Horizontal axis across the slice: rotating about it lifts the tip toward the viewer. */
const PITCH_AXIS = new THREE.Vector3(SLICE_DIR[1], 0, -SLICE_DIR[0])
/** The slice's long axis (centroid → tip): rolling about it shows the top, and the bite outline, to the camera. */
const ROLL_AXIS = new THREE.Vector3(-SLICE_DIR[0], 0, -SLICE_DIR[1])

export function Cake({ rig, onPick }: { rig: Rig; onPick: () => void }) {
  const a = useCakeAssets()
  const sliceMove = useRef<THREE.Group>(null)
  const sliceInner = useRef<THREE.Group>(null)
  const whole = useRef<THREE.Group>(null)
  const bitten = useRef<THREE.Group[]>([])

  const geo = useMemo(() => {
    const { radius: R1, height: H1 } = TIER_BOTTOM
    const { radius: R2, height: H2 } = TIER_TOP
    const half = SLICE_ANGLE / 2
    const standPts = [
      [0, 0], [0.55, 0], [0.56, 0.014], [0.5, 0.03], [0.24, 0.07], [0.13, 0.15], [0.105, 0.28],
      [0.15, 0.345], [1.28, 0.375], [STAND.plateRadius, 0.395], [STAND.plateRadius - 0.02, STAND.height], [0, STAND.height],
    ].map(([x, y]) => V2(x, y))
    return {
      stand: new THREE.LatheGeometry(standPts, 96),
      board: new THREE.CylinderGeometry(BOARD.radius, BOARD.radius, BOARD.height, 128),
      bottom: new THREE.LatheGeometry(profile(R1, H1), 128),
      body: arcLathe(profile(R2, H2), 112, SLICE_CENTER + half, Math.PI * 2 - SLICE_ANGLE),
      // Same surface, overlapping the body by a hair; the slice's depth offset wins the overlap,
      // so there is neither a crack nor a visible step at the joint.
      slice: arcLathe(profile(R2, H2), 14, SLICE_CENTER - half - 0.003, SLICE_ANGLE + 0.006),
      faceA: cutFace(R2, H2, CUT_LINES[0]),
      faceB: cutFace(R2, H2, CUT_LINES[1]),
      hit: new THREE.SphereGeometry(0.42, 12, 8),
      bitten: [bittenSlice(1), bittenSlice(2)],
    }
  }, [])
  useEffect(() => () => {
    const { bitten: b, ...rest } = geo
    ;[...Object.values(rest), ...b.flatMap((v) => Object.values(v))].forEach((g) => g.dispose())
  }, [geo])
  // Invisible, larger-than-the-slice target so a fingertip finds it easily.
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }), [])
  useEffect(() => () => hitMat.dispose(), [hitMat])

  const items = useMemo(() => {
    const B = TIER_BOTTOM, T = TIER_TOP
    // Top tier rings (multiples of 9) are split between body and slice.
    const split = (list: ReturnType<typeof ring>) => ({
      body: list.filter((r) => !inSlice(r.phi)),
      slice: list.filter((r) => inSlice(r.phi)),
    })
    return {
      bottomBase: ring(80, B.radius + 0.004, 0.022, [1.5, 0.75, 1]),
      bottomTop: ring(72, B.radius - 0.032, B.height - 0.004, [1.4, 0.8, 1.1]),
      bottomGold: ring(110, B.radius + 0.004, B.height * 0.55, [1, 1, 1]),
      hearts: ring(12, B.radius - 0.006, B.height * 0.3, [1, 1, 1]),
      topPearls: split(ring(54, T.radius + 0.006, 0.016, [1, 1, 1])),
      topEdge: split(ring(54, T.radius - 0.032, T.height - 0.004, [1.35, 0.8, 1.1])),
      topGold: split(ring(72, T.radius + 0.004, T.height * 0.45, [1, 1, 1])),
      garnish: garnish(),
    }
  }, [])

  const tmp = useMemo(() => ({
    rest: new THREE.Vector3(), end: new THREE.Vector3(), ctrl: new THREE.Vector3(), pos: new THREE.Vector3(),
    yaw: new THREE.Quaternion(), pitch: new THREE.Quaternion(), roll: new THREE.Quaternion(),
  }), [])

  useFrame(() => {
    const m = sliceMove.current!
    // At rest: out along its bisector, up a touch, a slight turn — plus a gentle float when it can be picked.
    const d = SLICE_CENTROID + rig.slice
    tmp.rest.set(SLICE_DIR[0] * d, rig.sliceLift + 0.022 * rig.sliceFloat, SLICE_DIR[1] * d)
    let yaw = rig.sliceYaw, pitch = 0, roll = 0
    if (rig.pickLift > 0 || rig.pick > 0) {
      // Straight up first, then a soft arc (quadratic Bézier, raised control point) to the eat point.
      tmp.rest.y += PICK_LIFT * rig.pickLift
      const t = rig.pick
      tmp.end.set(EAT_POINT[0], EAT_POINT[1] - TIER_TOP.base, EAT_POINT[2])
      tmp.ctrl.copy(tmp.rest).add(tmp.end).multiplyScalar(0.5)
      tmp.ctrl.y += 0.45
      tmp.pos.copy(tmp.rest).multiplyScalar((1 - t) ** 2).addScaledVector(tmp.ctrl, 2 * (1 - t) * t).addScaledVector(tmp.end, t * t)
      yaw = rig.sliceYaw + wrapAngle(EAT_YAW - rig.sliceYaw) * t
      pitch = 0.16 * Math.sin(Math.PI * t) + 0.12 * t
      roll = ROLL * t
      tmp.pos.x += EAT_TO_CAMERA[0] * 0.07 * rig.chew
      tmp.pos.y += EAT_TO_CAMERA[1] * 0.07 * rig.chew - 1.6 * rig.sliceDrop
      tmp.pos.z += EAT_TO_CAMERA[2] * 0.07 * rig.chew
    } else tmp.pos.copy(tmp.rest)
    m.position.copy(tmp.pos)
    m.quaternion.copy(tmp.yaw.setFromAxisAngle(UP, yaw))
      .multiply(tmp.pitch.setFromAxisAngle(PITCH_AXIS, pitch))
      .multiply(tmp.roll.setFromAxisAngle(ROLL_AXIS, roll))
    m.visible = rig.sliceGone < 0.5
    whole.current!.visible = rig.bite === 0
    bitten.current.forEach((g, i) => { g.visible = rig.bite === i + 1 })
    a.sliceIvory.emissiveIntensity = 0.16 * rig.sliceGlow
    if (!rig.selectable && document.body.style.cursor === 'pointer') document.body.style.cursor = ''
  })

  const g = items.garnish
  const [cx, cz] = [SLICE_DIR[0] * SLICE_CENTROID, SLICE_DIR[1] * SLICE_CENTROID]
  return (
    <group>
      <mesh geometry={geo.stand} material={a.porcelain} castShadow receiveShadow />
      <mesh geometry={geo.board} material={[a.boardEdge, a.boardTop, a.boardTop]} position-y={STAND.height + BOARD.height / 2} castShadow receiveShadow />

      <group position-y={TIER_BOTTOM.base}>
        <mesh geometry={geo.bottom} material={a.blush} castShadow receiveShadow />
        <Instances items={items.bottomBase} geometry={a.shell} material={a.piping} />
        <Instances items={items.bottomTop} geometry={a.shell} material={a.piping} />
        <Instances items={items.bottomGold} geometry={a.dragee} material={a.gold} shadow={false} />
        <Instances items={items.hearts} geometry={a.heart} material={a.piping} shadow={false} />
      </group>

      <group position-y={TIER_TOP.base}>
        <mesh geometry={geo.body} material={a.ivory} castShadow receiveShadow />
        <mesh geometry={geo.faceA} material={a.inside} />
        <mesh geometry={geo.faceB} material={a.inside} />
        <Instances items={items.topPearls.body} geometry={a.pearlGeo} material={a.pearl} shadow={false} />
        <Instances items={items.topEdge.body} geometry={a.shell} material={a.piping} />
        <Instances items={items.topGold.body} geometry={a.dragee} material={a.gold} shadow={false} />
        <group ref={sliceMove}>
          <group ref={sliceInner} position={[-cx, 0, -cz]}>
            <group ref={whole}>
              <mesh geometry={geo.slice} material={a.sliceIvory} castShadow receiveShadow />
              <mesh geometry={geo.faceA} material={a.inside} />
              <mesh geometry={geo.faceB} material={a.inside} />
            </group>
            {geo.bitten.map((b, i) => (
              <group key={i} ref={(el) => { if (el) bitten.current[i] = el }} visible={false}>
                <mesh geometry={b.side} material={a.sliceIvory} castShadow />
                <mesh geometry={b.top} material={a.sliceIvory} castShadow />
                <mesh geometry={b.bottom} material={a.inside} />
                <mesh geometry={b.faceA} material={a.inside} />
                <mesh geometry={b.faceB} material={a.inside} />
                <mesh geometry={b.wall} material={a.inside} />
              </group>
            ))}
            <Instances items={items.topPearls.slice} geometry={a.pearlGeo} material={a.pearl} shadow={false} />
            <Instances items={items.topEdge.slice} geometry={a.shell} material={a.piping} />
            <Instances items={items.topGold.slice} geometry={a.dragee} material={a.gold} shadow={false} />
            <mesh
              geometry={geo.hit} material={hitMat} position={[cx, TIER_TOP.height / 2, cz]}
              onClick={(e) => { e.stopPropagation(); if (rig.selectable) onPick() }}
              onPointerOver={() => { if (rig.selectable) document.body.style.cursor = 'pointer' }}
              onPointerOut={() => { document.body.style.cursor = '' }}
            />
          </group>
        </group>
      </group>

      <Instances items={g.strawberries} geometry={a.strawberryGeo} material={a.strawberry} />
      <Instances items={g.calyces} geometry={a.calyxGeo} material={a.calyx} shadow={false} />
      <Instances items={g.blueberries} geometry={a.blueberryGeo} material={a.blueberry} shadow={false} />
      <Instances items={g.petals} geometry={a.petalGeo} material={a.petal} shadow={false} />
      <Instances items={g.centres} geometry={a.petalGeo} material={a.gold} shadow={false} />
      <Lettering />
      <CutMarks rig={rig} a={a} />
      <Crumbs rig={rig} a={a} slice={sliceInner} />
    </group>
  )
}

/** A stainless cake knife. Origin at the blade tip; tilt raises the heel so the tip leads. */
export function Knife({ rig }: { rig: Rig }) {
  const ref = useRef<THREE.Group>(null)
  const parts = useMemo(() => {
    const { bladeLength: L, bladeHeight: H, handleLength } = KNIFE
    const s = new THREE.Shape()
    s.moveTo(0, 0.004)
    s.quadraticCurveTo(0.004, 0, 0.05, 0)
    s.lineTo(L, 0)
    s.lineTo(L, H)
    s.lineTo(0.16, H)
    s.quadraticCurveTo(0.02, H * 0.95, 0, 0.004)
    const blade = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 16 })
    blade.translate(0, 0, -0.002)
    return {
      blade,
      bolster: new THREE.CylinderGeometry(0.024, 0.024, 0.04, 16).rotateZ(Math.PI / 2).translate(L + 0.02, H * 0.55, 0),
      handle: new THREE.CapsuleGeometry(0.028, handleLength - 0.06, 6, 16).rotateZ(Math.PI / 2).scale(1, 1.05, 0.7)
        .translate(L + 0.04 + handleLength / 2, H * 0.55, 0),
      // Satin stainless: partly diffuse so it reads bright under the key light even against a dark room.
      steel: new THREE.MeshPhysicalMaterial({ color: '#e4e8ec', metalness: 0.7, roughness: 0.22, envMapIntensity: 6, clearcoat: 0.6, clearcoatRoughness: 0.08 }),
      handleMat: new THREE.MeshPhysicalMaterial({ color: '#efe7da', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      gold: new THREE.MeshStandardMaterial({ color: '#d9b36c', metalness: 1, roughness: 0.26 }),
    }
  }, [])
  useEffect(() => () => Object.values(parts).forEach((p) => p.dispose()), [parts])

  useFrame(() => {
    const k = rig.knife
    ref.current!.visible = k.show > 0.01
    ref.current!.position.set(k.x, k.y, k.z)
    // Euler XYZ applies tilt (z) first, then yaw (y): the tilt stays in the blade's own plane.
    ref.current!.rotation.set(0, k.ry, k.tilt)
  })

  return (
    <group ref={ref} visible={false}>
      <mesh geometry={parts.blade} material={parts.steel} castShadow />
      <mesh geometry={parts.bolster} material={parts.gold} castShadow />
      <mesh geometry={parts.handle} material={parts.handleMat} castShadow />
    </group>
  )
}
