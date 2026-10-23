import * as THREE from 'three'
import type { LevelObject } from './level'

type Point = [number, number]
export interface BridgePatch {
  origin: THREE.Vector3; normal: THREE.Vector3; velocity: THREE.Vector3
  release: number; life: number; area: number; vertexStart: number; vertexCount: number
}

// Clip a Voronoi cell against the perpendicular bisector of two seeds.
function clip(polygon: Point[], seed: Point, other: Point): Point[] {
  const nx = other[0] - seed[0], ny = other[1] - seed[1]
  const limit = (other[0] ** 2 + other[1] ** 2 - seed[0] ** 2 - seed[1] ** 2) * 0.5
  const result: Point[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const da = a[0] * nx + a[1] * ny - limit, db = b[0] * nx + b[1] * ny - limit
    if (da <= 0) result.push(a)
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db)
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return result
}

const deformation = `
  uniform float uBridgeTime;
  attribute vec3 bridgeOrigin, bridgeChipOrigin, bridgeVelocity, bridgeSpin;
  attribute vec4 bridgeChip;
  attribute vec2 bridgeLife;
  varying float vBridgeFade;
  vec3 bridgeTurn(vec3 p, vec3 spin, float age) {
    float speed = length(spin), angle = speed * age;
    vec3 axis = spin / max(speed, 0.00001);
    return p * cos(angle) + cross(axis, p) * sin(angle) + axis * dot(axis, p) * (1.0 - cos(angle));
  }
`
const timing = `
  float bridgeAge = clamp(uBridgeTime - bridgeLife.x, 0.0, bridgeLife.y);
  float bridgeFlight = bridgeAge * smoothstep(0.0, 2.5, bridgeAge);
  float bridgeSplit = max(0.0, bridgeAge - 4.5);
  float bridgeShrink = 1.0 - 0.68 * smoothstep(7.0, bridgeLife.y, bridgeAge);
  vBridgeFade = 1.0 - smoothstep(bridgeLife.y * 0.62, bridgeLife.y, bridgeAge);
`

/** Each piece occupies the corridor shell until its own surface patch detaches once. */
export class BridgeDecay extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  readonly patches: BridgePatch[] = []
  readonly time = { value: 0 }
  readonly finishedAt: number
  declare customDepthMaterial: THREE.MeshDepthMaterial

  constructor(slab: Extract<LevelObject, { kind: 'slab' }>, material: THREE.MeshStandardMaterial) {
    super(new THREE.BufferGeometry(), material.clone())
    this.name = slab.name ?? 'bridge'
    this.userData.bridgeDecay = true
    const [a, b] = slab.box, wall = b[2] - a[2] < b[1] - a[1]
    const surfaceAxis = wall ? 1 : 2, thicknessAxis = wall ? 2 : 1
    const outward = wall ? (slab.name?.endsWith('a') ? -1 : 1) : (slab.name?.includes('floor') ? -1 : 1)
    const normal = new THREE.Vector3().setComponent(thicknessAxis, outward)
    const u0 = a[0], u1 = b[0], v0 = a[surfaceAxis], v1 = b[surfaceAxis]
    const thickness = b[thicknessAxis] - a[thicknessAxis]
    const mid = (a[thicknessAxis] + b[thicknessAxis]) * 0.5
    const map = (u: number, v: number, depth = mid) => new THREE.Vector3(u, wall ? v : depth, wall ? depth : v)
    let state = Math.round((a[1] + 10) * 12347 + (a[2] + 10) * 7919)
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
    const cols = Math.ceil((u1 - u0) / 0.32), rows = Math.ceil((v1 - v0) / 0.34), seeds: Point[] = []
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) seeds.push([
      u0 + (x + 0.22 + random() * 0.56) * (u1 - u0) / cols,
      v0 + (y + 0.22 + random() * 0.56) * (v1 - v0) / rows,
    ])
    const values: Record<string, number[]> = {
      position: [], normal: [], uv: [], bridgeOrigin: [], bridgeChipOrigin: [], bridgeVelocity: [], bridgeSpin: [], bridgeChip: [], bridgeLife: [],
    }
    const sizes: Record<string, number> = { position: 3, normal: 3, uv: 2, bridgeOrigin: 3, bridgeChipOrigin: 3, bridgeVelocity: 3, bridgeSpin: 3, bridgeChip: 4, bridgeLife: 2 }
    let end = 0
    for (const seed of seeds) {
      let polygon: Point[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
      for (const other of seeds) if (other !== seed) polygon = clip(polygon, seed, other)
      if (polygon.length < 3) continue
      const center: Point = [polygon.reduce((s, p) => s + p[0], 0) / polygon.length, polygon.reduce((s, p) => s + p[1], 0) / polygon.length]
      const origin = map(...center)
      // A broad uneven front starts partly eroded and travels back to the building over eight minutes.
      const initialEdge = u1 - 0.75 + Math.sin(center[1] * 3.4 + mid * 2.1) * 0.12 + Math.sin(center[1] * 7.1) * 0.035
      const release = (initialEdge - center[0]) / (u1 - 0.75 - u0) * 444 + (random() - 0.5) * 3
      const life = 16 + random() * 5
      const velocity = normal.clone().multiplyScalar(0.055 + random() * 0.045)
      velocity.x = 0.075 + random() * 0.065
      if (wall) velocity.y = 0.015 + random() * 0.025
      const spin = new THREE.Vector3((random() - 0.5) * 0.12, (random() - 0.5) * 0.12, (random() - 0.5) * 0.12)
      const patch: BridgePatch = { origin, normal: normal.clone(), velocity, release, life, area: 0, vertexStart: values.position.length / 3, vertexCount: 0 }
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length]
        const chipOrigin = map((center[0] + p[0] + q[0]) / 3, (center[1] + p[1] + q[1]) / 3)
        const chipVelocity = chipOrigin.clone().sub(origin).multiplyScalar(0.14).addScaledVector(normal, random() * 0.018)
        const chipSpin = (random() - 0.5) * 3
        patch.area += Math.abs((p[0] - center[0]) * (q[1] - center[1]) - (q[0] - center[0]) * (p[1] - center[1])) * 0.5
        const vertices = [map(...center, mid - thickness * 0.5), map(...p, mid - thickness * 0.5), map(...q, mid - thickness * 0.5),
          map(...center, mid + thickness * 0.5), map(...p, mid + thickness * 0.5), map(...q, mid + thickness * 0.5)]
        for (const tri of [[0, 1, 2], [3, 4, 5], [0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]]) {
          let [pa, pb, pc] = tri.map(index => vertices[index])
          const n = new THREE.Vector3().crossVectors(pb.clone().sub(pa), pc.clone().sub(pa)).normalize()
          if (n.dot(pa.clone().add(pb).add(pc).multiplyScalar(1 / 3).sub(chipOrigin)) < 0) { [pb, pc] = [pc, pb]; n.negate() }
          for (const point of [pa, pb, pc]) {
            values.position.push(...point.toArray()); values.normal.push(...n.toArray()); values.uv.push(point.x, point.getComponent(surfaceAxis))
            values.bridgeOrigin.push(...origin.toArray()); values.bridgeChipOrigin.push(...chipOrigin.toArray())
            values.bridgeVelocity.push(...velocity.toArray()); values.bridgeSpin.push(...spin.toArray())
            values.bridgeChip.push(...chipVelocity.toArray(), chipSpin); values.bridgeLife.push(release, life)
          }
        }
      }
      patch.vertexCount = values.position.length / 3 - patch.vertexStart
      this.patches.push(patch); end = Math.max(end, release + life)
    }
    this.finishedAt = end
    for (const name of Object.keys(values)) this.geometry.setAttribute(name, new THREE.Float32BufferAttribute(values[name], sizes[name]))
    this.geometry.computeBoundingBox(); this.geometry.boundingBox!.expandByScalar(6)
    this.geometry.boundingSphere = this.geometry.boundingBox!.getBoundingSphere(new THREE.Sphere())
    this.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: this.material.side })
    for (const surface of [this.material, this.customDepthMaterial]) {
      surface.alphaHash = true
      surface.onBeforeCompile = shader => {
        shader.uniforms.uBridgeTime = this.time
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + deformation)
          .replace('void main() {', 'void main() {\n' + timing)
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            objectNormal = bridgeTurn(bridgeTurn(objectNormal, bridgeSpin * bridgeChip.w, bridgeSplit), bridgeSpin, bridgeFlight);`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec3 chip = bridgeTurn((position - bridgeChipOrigin) * bridgeShrink, bridgeSpin * bridgeChip.w, bridgeSplit);
            transformed = bridgeOrigin + bridgeTurn(bridgeChipOrigin - bridgeOrigin + chip + bridgeChip.xyz * bridgeSplit, bridgeSpin, bridgeFlight)
              + bridgeVelocity * bridgeFlight + vec3(0.0, -0.002 * bridgeFlight * bridgeFlight, 0.0);`)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vBridgeFade;')
          .replace('#include <alphahash_fragment>', 'diffuseColor.a *= vBridgeFade;\n#include <alphahash_fragment>')
      }
    }
    this.castShadow = this.receiveShadow = true
    this.update(0)
  }

  update(elapsed: number, reduceMotion = false): void {
    if (!reduceMotion) this.time.value = Math.max(0, elapsed)
    this.visible = this.time.value < this.finishedAt
  }

  dispose(): void { this.geometry.dispose(); this.material.dispose(); this.customDepthMaterial.dispose() }
}
