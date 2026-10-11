import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Rig } from './rig.ts'
import { CAKE_TOP_Y, CANDLE, candleAngles, polar } from './spec.ts'

// Lives for the whole app inside the single canvas, so shared resources are module-level.
const FLAME_H = 0.1
const flameGeometry = new THREE.LatheGeometry(
  Array.from({ length: 14 }, (_, i) => {
    const t = i / 13
    return new THREE.Vector2(0.021 * Math.sin(Math.PI * t) ** 0.7 * (1 - 0.5 * t), t * FLAME_H)
  }),
  16,
)
const waxGeometry = new THREE.CylinderGeometry(CANDLE.radius, CANDLE.radius * 1.04, CANDLE.height, 20).translate(0, CANDLE.height / 2 - 0.012, 0)
const wickGeometry = new THREE.CylinderGeometry(0.0035, 0.004, 0.032, 6).translate(0, CANDLE.height + 0.004, 0)
const wickMaterial = new THREE.MeshStandardMaterial({ color: '#1a120e', roughness: 1 })
const glowTexture = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,214,150,1)')
  grad.addColorStop(0.25, 'rgba(255,170,90,0.35)')
  grad.addColorStop(1, 'rgba(255,140,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

const flameVertex = /* glsl */ `
  uniform float uTime; uniform float uSeed;
  varying float vH; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 p = position;
    float h = clamp(p.y / ${FLAME_H.toFixed(3)}, 0.0, 1.0);
    float bend = h * h;
    p.x += (sin(uTime * 2.1 + uSeed) * 0.6 + sin(uTime * 3.7 + uSeed * 1.7) * 0.4) * 0.012 * bend;
    p.z += cos(uTime * 1.7 + uSeed * 2.3) * 0.008 * bend;
    p.y *= 0.94 + 0.06 * sin(uTime * 4.3 + uSeed);
    vH = h;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`
const flameFragment = /* glsl */ `
  uniform float uLit;
  varying float vH; varying vec3 vN; varying vec3 vV;
  void main() {
    float facing = clamp(dot(vN, vV), 0.0, 1.0);
    vec3 col = mix(vec3(0.92, 0.36, 0.07), vec3(1.0, 0.7, 0.3), smoothstep(0.1, 0.6, facing));
    col = mix(col, vec3(1.0, 0.96, 0.86), smoothstep(0.55, 0.95, facing) * (1.0 - vH * 0.7));
    col = mix(vec3(0.22, 0.3, 0.85), col, smoothstep(0.02, 0.2, vH));
    float a = smoothstep(0.0, 0.55, facing) * uLit * (1.0 - 0.5 * smoothstep(0.7, 1.0, vH));
    gl_FragColor = vec4(col, a);
  }`

function Candle({ rig, index, phi }: { rig: Rig; index: number; phi: number }) {
  const flame = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const glow = useRef<THREE.Sprite>(null)
  const seed = index * 1.37 + 0.4
  const m = useMemo(() => ({
    flame: new THREE.ShaderMaterial({
      vertexShader: flameVertex, fragmentShader: flameFragment, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uLit: { value: 0 } },
    }),
    wax: new THREE.MeshStandardMaterial({ color: '#f3e8d6', roughness: 0.55, emissive: '#ff9a4a', emissiveIntensity: 0 }),
    glow: new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
  }), [seed])

  useFrame(({ clock }) => {
    const lit = rig.flames[index].v
    const t = clock.elapsedTime
    // Smooth layered sines: a gentle breathing flicker, never a random blink.
    const flick = 0.9 + 0.06 * Math.sin(t * 7.3 + seed) + 0.04 * Math.sin(t * 12.7 + seed * 2.1)
    flame.current!.visible = lit > 0.005
    const w = 1.3 * (0.75 + 0.25 * lit)
    flame.current!.scale.set(w, 1.35 * lit * (0.96 + 0.06 * Math.sin(t * 2.3 + seed)), w)
    m.flame.uniforms.uTime.value = t
    m.flame.uniforms.uLit.value = Math.min(1, lit * 1.4)
    light.current!.intensity = 0.55 * lit * flick
    m.glow.opacity = 0.3 * lit * flick
    m.wax.emissiveIntensity = 0.12 * lit
  })

  const [x, , z] = polar(CANDLE.ringRadius, phi, 0)
  return (
    <group position={[x, CAKE_TOP_Y, z]}>
      <mesh geometry={waxGeometry} material={m.wax} castShadow />
      <mesh geometry={wickGeometry} material={wickMaterial} />
      <mesh ref={flame} geometry={flameGeometry} material={m.flame} position-y={CANDLE.height + 0.008} />
      <sprite ref={glow} material={m.glow} position-y={CANDLE.height + 0.06} scale={0.5} />
      <pointLight ref={light} color="#ffad5c" distance={3.2} decay={2} position-y={CANDLE.height + 0.06} intensity={0} />
    </group>
  )
}

const PUFFS = 12
const SMOKE_LIFE = 2.6

function Smoke({ rig }: { rig: Rig }) {
  const angles = candleAngles()
  const points = useMemo(() => {
    const n = angles.length * PUFFS
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha;
          gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); if (vA <= 0.0) discard;
          gl_FragColor = vec4(0.78, 0.74, 0.7, smoothstep(0.5, 0.0, d) * vA); }`,
    })
    const pts = new THREE.Points(g, mat)
    pts.frustumCulled = false
    return pts
  }, [angles.length])

  useFrame(({ size, viewport }) => {
    const now = performance.now() / 1000
    const g = points.geometry
    const pos = g.attributes.position as THREE.BufferAttribute
    const alpha = g.attributes.aAlpha as THREE.BufferAttribute
    const sz = g.attributes.aSize as THREE.BufferAttribute
    ;(points.material as THREE.ShaderMaterial).uniforms.uScale.value = size.height * viewport.dpr * 0.9
    angles.forEach((phi, c) => {
      const [x, , z] = polar(CANDLE.ringRadius, phi, 0)
      for (let j = 0; j < PUFFS; j++) {
        const i = c * PUFFS + j
        const age = now - rig.smokeAt[c] - j * 0.08
        if (rig.smokeAt[c] < 0 || age < 0 || age > SMOKE_LIFE) {
          alpha.setX(i, 0)
          continue
        }
        pos.setXYZ(i,
          x + Math.sin(age * 2.2 + j) * 0.03 * age,
          CAKE_TOP_Y + CANDLE.height + 0.03 + age * 0.32,
          z + Math.cos(age * 1.6 + j * 1.3) * 0.025 * age)
        alpha.setX(i, 0.16 * (1 - age / SMOKE_LIFE) * Math.min(1, age * 5))
        sz.setX(i, 0.05 + age * 0.13)
      }
    })
    pos.needsUpdate = alpha.needsUpdate = sz.needsUpdate = true
  })

  return <primitive object={points} />
}

export function Candles({ rig }: { rig: Rig }) {
  return (
    <group>
      {candleAngles().map((phi, i) => <Candle key={i} rig={rig} index={i} phi={phi} />)}
      <Smoke rig={rig} />
    </group>
  )
}
