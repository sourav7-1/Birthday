import * as THREE from 'three'

/** A small piped heart (≈5 cm), extruded with a soft bevel. Used on the cake and in the finale. */
export function heartGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.5)
  s.bezierCurveTo(0.62, 0.02, 0.55, 0.66, 0, 0.3)
  s.bezierCurveTo(-0.55, 0.66, -0.62, 0.02, 0, -0.5)
  return new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 3, curveSegments: 10 })
    .scale(0.05, 0.05, 0.05)
}
