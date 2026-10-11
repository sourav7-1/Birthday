import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { heartGeometry } from './shapes.ts'
import type { Rig } from './rig.ts'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function usePoints(count: number, place: (i: number) => [number, number, number], material: THREE.ShaderMaterial) {
  const points = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos.set(place(i), i * 3)
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const p = new THREE.Points(g, material)
    p.frustumCulled = false
    return p
  }, [count, material])
  useEffect(() => () => points.geometry.dispose(), [points])
  return points
}

const dustMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uOpacity: { value: 1 }, uSparkle: { value: 0 } },
  vertexShader: /* glsl */ `
    attribute float aSeed; uniform float uTime; uniform float uPixel; uniform float uOpacity; uniform float uSparkle;
    varying float vA;
    void main() {
      vec3 p = position;
      p.y = mod(p.y + uTime * 0.04 * (0.3 + aSeed), 5.5);
      p.x += sin(uTime * 0.13 + aSeed * 20.0) * 0.35;
      p.z += cos(uTime * 0.11 + aSeed * 13.0) * 0.35;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float twinkle = 0.5 + 0.5 * sin(uTime * (0.6 + aSeed * 1.4) + aSeed * 40.0);
      gl_PointSize = uPixel * (1.4 + aSeed * 2.2 + uSparkle * step(0.93, aSeed) * 3.0 * twinkle) * (7.0 / -mv.z);
      vA = uOpacity * (0.2 + 0.6 * twinkle) * (1.0 + uSparkle * step(0.93, aSeed) * 1.5);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying float vA;
    void main() { float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(1.0, 0.83, 0.6, smoothstep(0.5, 0.05, d) * vA * 0.5); }`,
})

const bokehMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uGlow: { value: 0 } },
  vertexShader: /* glsl */ `
    attribute float aSeed; uniform float uTime; uniform float uPixel; uniform float uGlow;
    varying float vA; varying float vSeed;
    void main() {
      vec3 p = position + vec3(sin(uTime * 0.05 + aSeed * 9.0), cos(uTime * 0.04 + aSeed * 7.0) * 0.5, 0.0) * 0.4;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uPixel * (40.0 + aSeed * 70.0);
      vA = (0.05 + aSeed * 0.06) * (1.0 - 0.3 * uGlow);
      vSeed = aSeed;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying float vA; varying float vSeed;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float disc = smoothstep(0.5, 0.44, d) * (0.6 + 0.4 * smoothstep(0.2, 0.47, d));
      vec3 col = mix(vec3(1.0, 0.8, 0.55), vec3(0.95, 0.62, 0.62), step(0.6, vSeed));
      gl_FragColor = vec4(col, disc * vA);
    }`,
})

export function Atmosphere({ rig, count, reduced }: { rig: Rig; count: number; reduced: boolean }) {
  const dust = usePoints(count, () => [rand(-6, 6), rand(0, 5.5), rand(-7, 5)], dustMaterial)
  const bokeh = usePoints(9, (i) => [((i / 8) - 0.5) * 14 + rand(-0.8, 0.8), rand(0.6, 4.8), rand(-12, -7)], bokehMaterial)
  const speed = reduced ? 0.25 : 1
  useFrame(({ clock, size, viewport }) => {
    const t = clock.elapsedTime * speed
    const px = viewport.dpr * Math.min(1.4, size.height / 800)
    dustMaterial.uniforms.uTime.value = t
    dustMaterial.uniforms.uPixel.value = px
    dustMaterial.uniforms.uOpacity.value = rig.dust
    dustMaterial.uniforms.uSparkle.value = rig.finale
    bokehMaterial.uniforms.uTime.value = t
    bokehMaterial.uniforms.uPixel.value = px
    bokehMaterial.uniforms.uGlow.value = rig.finale
  })
  return (
    <>
      <primitive object={dust} />
      <primitive object={bokeh} />
    </>
  )
}

const CONFETTI_COLORS = ['#d8b46a', '#ecd9b0', '#cf9a96', '#f4ece0'].map((c) => new THREE.Color(c))

/** One instanced mesh. Falls around the cake (never through it) and settles on the table. */
export function Confetti({ rig, count }: { rig: Rig; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const sim = useMemo(() => ({
    pos: new Float32Array(count * 3), vel: new Float32Array(count * 3), rot: new Float32Array(count * 3),
    spin: new Float32Array(count * 3), rest: new Uint8Array(count), started: -1,
  }), [count])
  const res = useMemo(() => ({
    geo: new THREE.PlaneGeometry(0.045, 0.026),
    // Self-coloured: backlit flakes between camera and cake would otherwise read as dark specks.
    mat: new THREE.MeshBasicMaterial({ color: '#d9cfc2', side: THREE.DoubleSide }),
  }), [])
  useEffect(() => () => { res.geo.dispose(); res.mat.dispose() }, [res])
  useLayoutEffect(() => {
    for (let i = 0; i < count; i++) ref.current!.setColorAt(i, CONFETTI_COLORS[i % CONFETTI_COLORS.length])
    ref.current!.instanceColor!.needsUpdate = true
  }, [count])

  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), [])

  useFrame(({ clock }, delta) => {
    const mesh = ref.current!
    if (rig.confettiAt < 0) {
      mesh.visible = false
      sim.started = -1
      return
    }
    if (sim.started !== rig.confettiAt) {
      sim.started = rig.confettiAt
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, r = rand(1.55, 2.9)
        sim.pos.set([Math.sin(a) * r, rand(2.3, 3.2), Math.cos(a) * r], i * 3)
        sim.vel.set([Math.sin(a) * rand(0, 0.25), rand(0.2, 0.9), Math.cos(a) * rand(0, 0.25)], i * 3)
        sim.rot.set([rand(0, 6), rand(0, 6), rand(0, 6)], i * 3)
        sim.spin.set([rand(-4, 4), rand(-4, 4), rand(-4, 4)], i * 3)
        sim.rest[i] = 0
      }
    }
    mesh.visible = true
    const dt = rig.paused ? 0 : Math.min(delta, 0.05), t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const k = i * 3
      if (!sim.rest[i]) {
        sim.vel[k + 1] -= 2.0 * dt
        const drag = 1 - 2.2 * dt
        sim.vel[k] = sim.vel[k] * drag + Math.sin(t * 2.6 + i) * 0.25 * dt
        sim.vel[k + 1] *= drag
        sim.vel[k + 2] = sim.vel[k + 2] * drag + Math.cos(t * 2.1 + i) * 0.25 * dt
        for (let j = 0; j < 3; j++) {
          sim.pos[k + j] += sim.vel[k + j] * dt
          sim.rot[k + j] += sim.spin[k + j] * dt
        }
        if (sim.pos[k + 1] <= 0.003) {
          sim.pos[k + 1] = 0.003
          sim.rot[k] = -Math.PI / 2
          sim.rot[k + 1] = 0
          sim.rest[i] = 1
        }
      }
      e.set(sim.rot[k], sim.rot[k + 1], sim.rot[k + 2])
      m.compose(v.set(sim.pos[k], sim.pos[k + 1], sim.pos[k + 2]), q.setFromEuler(e), one)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[res.geo, res.mat, count]} frustumCulled={false} visible={false} castShadow />
}

const HEARTS = 12

/** A few soft hearts drifting slowly upward behind the cake, only in the finale. */
export function FinaleHearts({ rig }: { rig: Rig }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const res = useMemo(() => ({
    geo: heartGeometry().center(),
    mat: new THREE.MeshStandardMaterial({ emissive: '#b8606c', emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0, depthWrite: false }),
    seeds: Array.from({ length: HEARTS }, () => ({
      x: rand(-3.4, 3.4), z: rand(-4.2, -1.4), y: rand(0, 4.2), speed: rand(0.06, 0.13), phase: rand(0, 6), scale: rand(1.4, 2.4),
    })),
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(),
  }), [])
  useEffect(() => () => { res.geo.dispose(); res.mat.dispose() }, [res])
  useLayoutEffect(() => {
    const colors = ['#f0c2bb', '#e7c27a', '#f6e3d6'].map((c) => new THREE.Color(c))
    for (let i = 0; i < HEARTS; i++) ref.current!.setColorAt(i, colors[i % colors.length])
    ref.current!.instanceColor!.needsUpdate = true
  }, [])
  useFrame(({ clock }) => {
    const mesh = ref.current!
    mesh.visible = rig.finale > 0.01
    if (!mesh.visible) return
    res.mat.opacity = 0.5 * rig.finale
    const t = clock.elapsedTime
    res.seeds.forEach((h, i) => {
      res.p.set(h.x + Math.sin(t * 0.3 + h.phase) * 0.2, 0.6 + ((h.y + t * h.speed) % 4.2), h.z)
      res.q.setFromEuler(res.e.set(0, Math.sin(t * 0.5 + h.phase) * 0.6, Math.sin(t * 0.4 + h.phase) * 0.15))
      res.m.compose(res.p, res.q, res.s.setScalar(h.scale))
      mesh.setMatrixAt(i, res.m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[res.geo, res.mat, HEARTS]} visible={false} frustumCulled={false} />
}
