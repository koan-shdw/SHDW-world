import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Point = [number, number, number]
type Ring = [y: number, width: number, depth: number, x?: number, z?: number]

// Authored from the suited outline figures in MY TURN. The strokes describe clothing
// and facial features; the surfaces supply volume when the visitor is seen in profile.
export function createGhostCharacter(surfaceMaterial: THREE.Material, lineMaterial: THREE.Material): {
  group: THREE.Group; head: THREE.Group; torso: THREE.Group
} {
  const group = new THREE.Group(); group.name = 'MY TURN — suited visitor'
  const torso = new THREE.Group(); torso.name = 'posture'; torso.position.y = 1.07
  const head = new THREE.Group(); head.name = 'gaze'; head.position.y = 0.41
  group.add(torso); torso.add(head)
  const origins = new Map<THREE.Group, number>([[group, 0], [torso, 1.07], [head, 1.48]])
  const batches = new Map<THREE.Group, Map<THREE.Material, THREE.BufferGeometry[]>>()

  function add(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material): void {
    // Merge like materials within each animated body part, keeping draw calls bounded.
    if (parent !== head && material === lineMaterial) {
      const positions = geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        const z = positions.getZ(i)
        if (Math.abs(z) > 0.02) positions.setZ(i, z + Math.sign(z) * 0.0045)
      }
    }
    // The upper back, collar and head share one forward curve, keeping the neck connected.
    if (parent !== group) {
      const positions = geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i), x = positions.getX(i)
        const bend = THREE.MathUtils.smoothstep(y, 1.04, 1.47)
        const shoulder = parent === torso ? Math.exp(-(((y - 1.34) / 0.10) ** 2)) * Math.min(1, Math.abs(x) / 0.16) : 0
        positions.setY(i, y - bend * 0.012 - shoulder * 0.009)
        positions.setZ(i, positions.getZ(i) + bend * 0.037 + shoulder * 0.013)
      }
      geometry.computeVertexNormals()
    }
    geometry.translate(0, -(origins.get(parent) ?? 0), 0)
    if (parent === head) geometry.translate(0, -0.058, 0.014)
    const plain = geometry.index ? geometry.toNonIndexed() : geometry
    plain.deleteAttribute('uv'); plain.deleteAttribute('tangent')
    let materials = batches.get(parent)
    if (!materials) { materials = new Map(); batches.set(parent, materials) }
    const pieces = materials.get(material) ?? []; pieces.push(plain); materials.set(material, pieces)
    if (plain !== geometry) geometry.dispose()
  }

  function stroke(parent: THREE.Group, points: Point[], radius = 0.0018, closed = false): void {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.06)
    add(parent, new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius * 1.3, 6, closed), lineMaterial)
  }

  function angularStroke(parent: THREE.Group, points: Point[], radius = 0.0015): void {
    const curve = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < points.length; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])))
    add(parent, new THREE.TubeGeometry(curve, points.length * 8, radius * 1.3, 6, false), lineMaterial)
  }

  function loft(rings: Ring[], face = false): THREE.BufferGeometry {
    const count = 32, vertices: number[] = [], indices: number[] = []
    for (const [y, width, depth, x = 0, z = 0] of rings) {
      for (let j = 0; j < count; j++) {
        const angle = j / count * Math.PI * 2, c = Math.cos(angle)
        // A flatter facial plane and defined jaw avoid a featureless spherical head.
        vertices.push(x + Math.sin(angle) * width, y, z + (face && c > 0 ? Math.pow(c, 0.48) : c) * depth)
      }
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < count; j++) {
      const a = i * count + j, b = i * count + (j + 1) % count
      indices.push(a, b, a + count, b, b + count, a + count)
    }
    for (const end of [0, rings.length - 1]) {
      const [y, , , x = 0, z = 0] = rings[end], centre = vertices.length / 3
      vertices.push(x, y, z)
      for (let j = 0; j < count; j++) {
        const a = end * count + j, b = end * count + (j + 1) % count
        indices.push(...(end === 0 ? [centre, b, a] : [centre, a, b]))
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals()
    return g
  }

  function limb(parent: THREE.Group, points: Point[], radii: number[], material: THREE.Material, flatten = 1): void {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal')
    const segments = 28, sides = 12, frames = curve.computeFrenetFrames(segments, false)
    const positions: number[] = [], indices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, at = curve.getPointAt(t), u = t * (radii.length - 1)
      const k = Math.min(radii.length - 2, Math.floor(u)), f = u - k, r = THREE.MathUtils.lerp(radii[k], radii[k + 1], f)
      for (let j = 0; j < sides; j++) {
        const angle = j / sides * Math.PI * 2
        const p = at.clone().addScaledVector(frames.normals[i], Math.cos(angle) * r).addScaledVector(frames.binormals[i], Math.sin(angle) * r * flatten)
        positions.push(p.x, p.y, p.z)
      }
    }
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides
      indices.push(a, b, a + sides, b, b + sides, a + sides)
    }
    // Closed ends keep the shoulder and wrist sections solid in the depth pass.
    for (const end of [0, segments]) {
      const at = curve.getPointAt(end / segments), centre = positions.length / 3
      positions.push(at.x, at.y, at.z)
      for (let j = 0; j < sides; j++) {
        const a = end * sides + j, b = end * sides + (j + 1) % sides
        indices.push(...(end === 0 ? [centre, b, a] : [centre, a, b]))
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals()
    add(parent, g, material)
  }

  function patch(parent: THREE.Group, outline: Point[], material: THREE.Material): void {
    const positions = outline.flat(), indices: number[] = []
    for (let i = 1; i < outline.length - 1; i++) indices.push(0, i + 1, i)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); add(parent, g, material)
  }

  // Narrow, straight trouser legs with a relaxed, slightly unequal stance.
  for (const side of [-1, 1]) {
    const x = side * 0.078
    add(group, loft([[0.08, 0.058, 0.052, x, 0.008], [0.12, 0.061, 0.055, x, 0.002], [0.26, 0.060, 0.054, x + side * 0.005, 0], [0.44, 0.062, 0.059, x + side * 0.007, 0.001], [0.55, 0.063, 0.063, x + side * 0.006, 0.005], [0.73, 0.070, 0.077, x, 0.001], [0.87, 0.076, 0.080, x, 0]]), surfaceMaterial)
    stroke(group, [[x, 0.12, 0.058], [x + side * 0.005, 0.26, 0.055], [x + side * 0.007, 0.44, 0.061], [x + side * 0.006, 0.55, 0.069], [x, 0.74, 0.081]], 0.0014)
    stroke(group, [[x, 0.14, -0.054], [x + side * 0.006, 0.49, -0.060], [x, 0.75, -0.078]], 0.0013)
    stroke(group, [[x - 0.050, 0.108, 0.031], [x, 0.096, 0.061], [x + 0.049, 0.108, 0.031]], 0.0015)
    add(group, loft([[0.012, 0.049, 0.112, x, 0.035], [0.031, 0.053, 0.117, x, 0.036], [0.059, 0.051, 0.108, x, 0.031], [0.089, 0.044, 0.073, x, 0.013], [0.113, 0.037, 0.046, x, -0.001]]), surfaceMaterial)
    stroke(group, [[x - 0.048, 0.026, 0.025], [x - 0.039, 0.026, 0.126], [x, 0.026, 0.151], [x + 0.039, 0.026, 0.126], [x + 0.048, 0.026, 0.025]], 0.0016)
    stroke(group, [[x - 0.040, 0.064, 0.078], [x, 0.075, 0.089], [x + 0.040, 0.064, 0.078]], 0.0013)
  }

  // A straight office jacket hangs from narrow, sloping shoulders.
  const jacket: Ring[] = [[0.79, 0.150, 0.078], [0.83, 0.159, 0.087], [0.94, 0.158, 0.089], [1.06, 0.159, 0.091], [1.19, 0.169, 0.094], [1.30, 0.179, 0.089], [1.35, 0.185, 0.076], [1.39, 0.148, 0.062], [1.445, 0.059, 0.042]]
  add(torso, loft(jacket), surfaceMaterial)
  function cloth(x: number, y: number, lift = 0.002): Point {
    let lo = jacket[0], hi = jacket[1]
    for (let i = 1; i < jacket.length; i++) {
      lo = jacket[i - 1]; hi = jacket[i]
      if (y <= hi[0]) break
    }
    const t = THREE.MathUtils.clamp((y - lo[0]) / (hi[0] - lo[0]), 0, 1)
    const width = THREE.MathUtils.lerp(lo[1], hi[1], t), depth = THREE.MathUtils.lerp(lo[2], hi[2], t)
    return [x, y, depth * Math.sqrt(Math.max(0, 1 - (x / width) ** 2)) + lift]
  }
  // Sample long contours onto the curved jacket rather than cutting through its chest or hem.
  function clothingContour(points: Point[], radius: number, closed = false): void {
    const vertices = closed ? [...points, points[0]] : points, sampled: Point[] = []
    for (let i = 1; i < vertices.length; i++) for (let j = 0; j < 6; j++) {
      sampled.push(cloth(THREE.MathUtils.lerp(vertices[i - 1][0], vertices[i][0], j / 6), THREE.MathUtils.lerp(vertices[i - 1][1], vertices[i][1], j / 6), 0.006))
    }
    const last = vertices[vertices.length - 1]; sampled.push(cloth(last[0], last[1], 0.006))
    angularStroke(torso, sampled, radius)
  }
  add(torso, loft([[1.414, 0.047, 0.039, 0, -0.006], [1.442, 0.040, 0.033, 0, -0.004], [1.468, 0.034, 0.031, 0, 0.003], [1.494, 0.037, 0.033, 0, 0.012], [1.510, 0.040, 0.035, 0, 0.014]]), surfaceMaterial)
  stroke(torso, [[-0.030, 1.482, 0.026], [-0.022, 1.459, 0.034], [-0.013, 1.438, 0.037]], 0.0008)
  stroke(torso, [[0.032, 1.481, 0.025], [0.025, 1.459, 0.033]], 0.0007)
  patch(torso, [cloth(-0.046, 1.438), cloth(0.046, 1.438), cloth(0.034, 1.284), cloth(0, 1.132), cloth(-0.034, 1.284)], surfaceMaterial)
  for (const side of [-1, 1]) {
    const p = (x: number, y: number, z: number): Point => [x * side, y, z]
    const c = (x: number, y: number): Point => cloth(x * side, y)
    angularStroke(torso, [c(0.046, 1.439), c(0.067, 1.408), c(0.091, 1.379), c(0.078, 1.360), c(0.102, 1.348), c(0.018, 1.132)], 0.0018)
    angularStroke(torso, [c(0.044, 1.443), c(0.036, 1.389), c(0.012, 1.414), c(0.005, 1.432)], 0.00155)
    clothingContour([c(0.018, 1.132), c(0.022, 1.027), c(0.027, 0.900), c(0.043, 0.830), c(0.086, 0.806), c(0.145, 0.815)], 0.00165)
    angularStroke(torso, [c(0.062, 1.016), c(0.133, 1.021), c(0.131, 0.994), c(0.066, 0.991), c(0.062, 1.016)], 0.00125)
    // Slim sleeves connect inside the shoulder; the watcher keeps one hand behind him.
    if (side === -1) {
      limb(torso, [p(0.128, 1.360, 0), p(0.181, 1.322, 0), p(0.204, 1.201, 0.001), p(0.212, 1.053, 0.010), p(0.212, 0.910, 0.027), p(0.210, 0.831, 0.042)], [0.050, 0.054, 0.050, 0.043, 0.036, 0.032], surfaceMaterial, 0.86)
      stroke(torso, [p(0.193, 1.303, 0.044), p(0.213, 1.202, 0.046), p(0.219, 1.051, 0.048), p(0.220, 0.913, 0.056), p(0.218, 0.833, 0.066)], 0.0012)
      stroke(torso, [p(0.190, 0.845, 0.060), p(0.211, 0.840, 0.074), p(0.233, 0.843, 0.049)], 0.0015)
      limb(torso, [p(0.210, 0.831, 0.044), p(0.210, 0.793, 0.047), p(0.205, 0.750, 0.055), p(0.196, 0.725, 0.054)], [0.026, 0.032, 0.026, 0.013], surfaceMaterial, 0.57)
      stroke(torso, [p(0.195, 0.800, 0.063), p(0.181, 0.776, 0.072), p(0.186, 0.758, 0.070)], 0.0013)
      for (let finger = 0; finger < 3; finger++) {
        const x = 0.198 + finger * 0.009
        stroke(torso, [p(x, 0.768, 0.072), p(x - 0.005, 0.739, 0.071), p(x - 0.009, 0.727, 0.060)], 0.0010)
      }
      angularStroke(torso, [p(0.191, 1.062, 0.047), p(0.212, 1.045, 0.052), p(0.226, 1.047, 0.046)], 0.0011)
    } else {
      limb(torso, [p(0.128, 1.358, 0), p(0.179, 1.320, 0), p(0.211, 1.207, -0.012), p(0.224, 1.075, -0.065), p(0.195, 0.988, -0.130), p(0.128, 0.927, -0.160)], [0.050, 0.053, 0.049, 0.043, 0.037, 0.031], surfaceMaterial, 0.87)
      stroke(torso, [p(0.194, 1.302, 0.042), p(0.220, 1.201, 0.028), p(0.233, 1.076, -0.034), p(0.216, 0.994, -0.103), p(0.146, 0.928, -0.138)], 0.0012)
      stroke(torso, [p(0.136, 0.949, -0.186), p(0.148, 0.944, -0.169), p(0.141, 0.929, -0.140), p(0.122, 0.909, -0.145)], 0.0014)
      limb(torso, [p(0.128, 0.929, -0.160), p(0.101, 0.913, -0.177), p(0.071, 0.899, -0.183), p(0.045, 0.892, -0.181)], [0.026, 0.031, 0.029, 0.015], surfaceMaterial, 0.52)
      for (let finger = 0; finger < 3; finger++) {
        const z = -0.194 + finger * 0.010
        stroke(torso, [p(0.097, 0.900, z), p(0.070, 0.884, z - 0.004), p(0.045, 0.886, z - 0.001)], 0.0010)
      }
    }
  }
  angularStroke(torso, [cloth(-0.127, 1.288), cloth(-0.077, 1.296)], 0.0015)
  stroke(torso, [[0, 1.442, -0.044], [0, 1.304, -0.092], [0, 1.064, -0.094], [0, 0.808, -0.086]], 0.0013)
  stroke(torso, [[-0.168, 1.361, -0.036], [-0.091, 1.411, -0.045], [0, 1.444, -0.044], [0.091, 1.411, -0.045], [0.168, 1.361, -0.036]], 0.0014)
  const knot: Point[] = [cloth(-0.014, 1.422, 0.006), cloth(0.014, 1.422, 0.006), cloth(0.018, 1.404, 0.006), cloth(0.008, 1.382, 0.006), cloth(-0.008, 1.382, 0.006), cloth(-0.018, 1.404, 0.006)]
  patch(torso, knot, surfaceMaterial)
  angularStroke(torso, [...knot, knot[0]], 0.00125)
  const tie: Point[] = [cloth(-0.008, 1.382, 0.005), cloth(-0.028, 1.170, 0.005), cloth(0, 1.133, 0.005), cloth(0.028, 1.170, 0.005), cloth(0.008, 1.382, 0.005)]
  patch(torso, [...tie].reverse(), surfaceMaterial)
  clothingContour(tie, 0.0013, true)
  angularStroke(torso, [cloth(-0.003, 1.379, 0.006), cloth(0, 1.349, 0.006)], 0.0009)
  for (const [x, y] of [[0.018, 1.111], [0.022, 0.978]]) {
    stroke(torso, Array.from({ length: 9 }, (_, i): Point => cloth(x + Math.cos(i / 9 * Math.PI * 2) * 0.005, y + Math.sin(i / 9 * Math.PI * 2) * 0.005)), 0.0011, true)
  }

  // Separate cheekbones, cheek hollows, jaw corners and chin instead of an oval mask.
  const faceRings = [
    [1.542, 0.013, 0.069, 0.033], [1.548, 0.028, 0.077, 0.016],
    [1.559, 0.046, 0.079, -0.006], [1.574, 0.064, 0.072, -0.030],
    [1.586, 0.074, 0.070, -0.045], [1.602, 0.078, 0.071, -0.057],
    [1.619, 0.084, 0.076, -0.066], [1.632, 0.086, 0.073, -0.072],
    [1.649, 0.083, 0.063, -0.078], [1.667, 0.081, 0.060, -0.080],
    [1.692, 0.080, 0.062, -0.080], [1.718, 0.076, 0.060, -0.076],
    [1.743, 0.065, 0.052, -0.064], [1.764, 0.043, 0.033, -0.044],
    [1.777, 0.005, -0.004, -0.022],
  ]
  function faceSection(y: number): number[] {
    let lo = faceRings[0], hi = faceRings[1]
    for (let i = 1; i < faceRings.length; i++) {
      lo = faceRings[i - 1]; hi = faceRings[i]
      if (y <= hi[0]) break
    }
    const t = THREE.MathUtils.clamp((y - lo[0]) / (hi[0] - lo[0]), 0, 1)
    return lo.map((value, i) => THREE.MathUtils.lerp(value, hi[i], t))
  }
  function facialZ(x: number, y: number): number {
    const [, width, front, back] = faceSection(y), centre = (front + back) / 2
    const c = Math.sqrt(Math.max(0, 1 - (x / width) ** 2))
    const bump = (cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((Math.abs(x) - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))
    return centre + (front - centre) * Math.pow(c, 0.58)
      + c * (0.006 * bump(0.053, 1.629, 0.023, 0.018)
      - 0.005 * bump(0.039, 1.659, 0.025, 0.013)
      - 0.004 * bump(0.052, 1.599, 0.017, 0.013)
      + 0.003 * bump(0, 1.589, 0.026, 0.009))
  }
  const faceVertices: number[] = [], faceIndices: number[] = [], faceSides = 64
  for (const [y, width, front, back] of faceRings) for (let j = 0; j < faceSides; j++) {
    const angle = j / faceSides * Math.PI * 2, x = Math.sin(angle) * width, c = Math.cos(angle)
    const z = c >= 0 ? facialZ(x, y) : (front + back) / 2 + c * (front - back) / 2
    faceVertices.push(x, y, z)
  }
  for (let i = 0; i < faceRings.length - 1; i++) for (let j = 0; j < faceSides; j++) {
    const a = i * faceSides + j, b = i * faceSides + (j + 1) % faceSides
    faceIndices.push(a, b, a + faceSides, b, b + faceSides, a + faceSides)
  }
  for (const end of [0, faceRings.length - 1]) {
    const [y, , front, back] = faceRings[end], centre = faceVertices.length / 3
    faceVertices.push(0, y, (front + back) / 2)
    for (let j = 0; j < faceSides; j++) {
      const a = end * faceSides + j, b = end * faceSides + (j + 1) % faceSides
      faceIndices.push(...(end === 0 ? [centre, b, a] : [centre, a, b]))
    }
  }
  const faceGeometry = new THREE.BufferGeometry()
  faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faceVertices, 3)); faceGeometry.setIndex(faceIndices); faceGeometry.computeVertexNormals()
  add(head, faceGeometry, surfaceMaterial)
  function faceLine(points: [number, number][], radius: number): void {
    const sampled: Point[] = []
    for (let i = 1; i < points.length; i++) for (let j = 0; j < 4; j++) {
      const x = THREE.MathUtils.lerp(points[i - 1][0], points[i][0], j / 4), y = THREE.MathUtils.lerp(points[i - 1][1], points[i][1], j / 4)
      sampled.push([x, y, facialZ(x, y) + 0.0026])
    }
    const [x, y] = points[points.length - 1]; sampled.push([x, y, facialZ(x, y) + 0.0026])
    stroke(head, sampled, radius)
  }

  function solid(points: Point[], faces: number[][]): THREE.BufferGeometry {
    const centre = new THREE.Vector3()
    for (const p of points) centre.add(new THREE.Vector3(...p))
    centre.divideScalar(points.length)
    const indices: number[] = []
    for (const face of faces) for (let i = 1; i < face.length - 1; i++) {
      const a = new THREE.Vector3(...points[face[0]]), b = new THREE.Vector3(...points[face[i]]), c = new THREE.Vector3(...points[face[i + 1]])
      const normal = b.clone().sub(a).cross(c.clone().sub(a)), middle = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(centre)
      indices.push(...(normal.dot(middle) > 0 ? [face[0], face[i], face[i + 1]] : [face[0], face[i + 1], face[i]]))
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3)); g.setIndex(indices); g.computeVertexNormals()
    return g
  }

  add(head, solid([[-0.007, 1.657, 0.061], [0.007, 1.657, 0.061], [-0.010, 1.615, 0.078], [0.010, 1.615, 0.078], [0, 1.627, 0.097], [0, 1.611, 0.081], [0, 1.634, 0.060]], [[0, 1, 4], [0, 4, 2], [1, 3, 4], [2, 4, 5], [3, 5, 4], [0, 2, 6], [1, 6, 3], [0, 6, 1], [2, 5, 6], [3, 6, 5]]), surfaceMaterial)
  for (const side of [-1, 1]) {
    add(head, loft([[1.605, 0.005, 0.010, side * 0.078, -0.013], [1.615, 0.011, 0.015, side * 0.085, -0.014], [1.643, 0.012, 0.016, side * 0.085, -0.014], [1.654, 0.007, 0.011, side * 0.080, -0.014]]), surfaceMaterial)
    stroke(head, [[side * 0.084, 1.611, -0.001], [side * 0.095, 1.624, -0.001], [side * 0.094, 1.645, -0.004], [side * 0.083, 1.651, -0.003]], 0.0010)
    stroke(head, [[side * 0.087, 1.620, 0.003], [side * 0.083, 1.634, 0.006], [side * 0.089, 1.642, 0.002]], 0.00075)
    const f = (x: number, y: number): [number, number] => [x * side, y]
    // Open lower lids and iris arcs retain the sparse drawn eyes of the paintings.
    faceLine([f(0.014, 1.658), f(0.028, 1.662), f(0.044, 1.664), f(0.059, 1.661), f(0.064, 1.658)], 0.00112)
    faceLine([f(0.023, 1.653), f(0.035, 1.651), f(0.046, 1.653)], 0.0005)
    faceLine([f(0.053, 1.655), f(0.060, 1.658)], 0.00056)
    faceLine([f(0.032, 1.663), f(0.031, 1.658), f(0.034, 1.653), f(0.039, 1.654), f(0.041, 1.658), f(0.041, 1.663)], 0.00062)
    faceLine([f(0.014, 1.676), f(0.032, 1.679), f(0.048, 1.677), f(0.061, 1.674)], 0.00125)
    faceLine([f(0.060, 1.626), f(0.064, 1.621)], 0.00048)
    faceLine([f(0.067, 1.575), f(0.047, 1.556), f(0.025, 1.547)], 0.0007)
  }
  stroke(head, [[-0.004, 1.648, 0.074], [-0.006, 1.632, 0.094], [-0.003, 1.622, 0.098]], 0.0008)
  stroke(head, [[0.003, 1.614, 0.086], [0.009, 1.616, 0.083]], 0.00075)
  faceLine([[-0.019, 1.589], [-0.006, 1.591], [0.009, 1.590], [0.019, 1.588]], 0.00075)
  faceLine([[0.001, 1.581], [0.009, 1.582]], 0.00045)

  // The short side part exposes the forehead; broad swept locks end at the temples.
  const hp: number[] = [], hi: number[] = [], sides = 48, rows = 10
  function hairPoint(t: number, angle: number): Point {
    const c = Math.cos(angle), s = Math.sin(angle), radius = Math.max(0.0001, Math.cos(t * Math.PI / 2)), rise = Math.sin(t * Math.PI / 2)
    let lower = 1.646 + Math.max(0, c) * (0.073 + 0.004 * Math.sin(angle * 3))
    const a = Math.abs(Math.atan2(s, c)), nape = [[1.57, 1.643], [1.78, 1.628], [1.97, 1.642], [2.20, 1.621], [2.42, 1.638], [2.64, 1.618], [2.84, 1.634], [Math.PI, 1.625]]
    if (a > nape[0][0]) for (let i = 1; i < nape.length; i++) if (a <= nape[i][0]) {
      const [ax, ay] = nape[i - 1], [bx, by] = nape[i]
      lower = THREE.MathUtils.lerp(ay, by, (a - ax) / (bx - ax)); break
    }
    const depth = 0.082 - Math.max(0, -c) * Math.max(0, 1 - t / 0.3) * 0.009
    return [s * 0.089 * radius, THREE.MathUtils.lerp(lower, 1.786, rise), -0.014 + c * depth * radius]
  }
  for (let i = 0; i <= rows; i++) for (let j = 0; j < sides; j++) hp.push(...hairPoint(i / rows, j / sides * Math.PI * 2))
  for (let i = 0; i < rows; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides
    hi.push(a, b, a + sides, b, b + sides, a + sides)
  }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setIndex(hi); hg.computeVertexNormals(); add(head, hg, surfaceMaterial)
  function hairLock(points: Point[], widths: number[], thickness: number[], draw = false): void {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal')
    const count = 18, around = 8, pos: number[] = [], idx: number[] = []
    function cross(t: number, angle: number): THREE.Vector3 {
      const centre = path.getPoint(t), direction = path.getTangent(t).normalize()
      const across = new THREE.Vector3(1, 0, 0).addScaledVector(direction, -direction.x).normalize(), front = direction.clone().cross(across).normalize()
      const at = t * (widths.length - 1), i = Math.min(widths.length - 2, Math.floor(at)), f = at - i
      return centre.addScaledVector(across, Math.cos(angle) * THREE.MathUtils.lerp(widths[i], widths[i + 1], f)).addScaledVector(front, Math.sin(angle) * THREE.MathUtils.lerp(thickness[i], thickness[i + 1], f))
    }
    for (let i = 0; i <= count; i++) for (let j = 0; j < around; j++) { const p = cross(i / count, j / around * Math.PI * 2); pos.push(p.x, p.y, p.z) }
    for (let i = 0; i < count; i++) for (let j = 0; j < around; j++) {
      const a = i * around + j, b = i * around + (j + 1) % around
      idx.push(a, b, a + around, b, b + around, a + around)
    }
    const root = path.getPoint(0), centre = pos.length / 3; pos.push(root.x, root.y, root.z)
    for (let j = 0; j < around; j++) idx.push(centre, (j + 1) % around, j)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
    add(head, g, surfaceMaterial)
    if (draw) {
      const edge = [0.30, 0.52, 0.76, 0.98].map(t => cross(t, Math.PI * 0.28).toArray() as Point)
      angularStroke(head, edge, 0.0013)
    }
  }
  hairLock([[0.023, 1.766, 0.040], [-0.010, 1.751, 0.063], [-0.044, 1.720, 0.067], [-0.069, 1.684, 0.037]], [0.014, 0.019, 0.013, 0], [0.007, 0.009, 0.007, 0])
  hairLock([[0.017, 1.776, 0.020], [-0.020, 1.765, 0.046], [-0.061, 1.735, 0.042], [-0.083, 1.694, 0.010]], [0.013, 0.017, 0.013, 0], [0.007, 0.009, 0.006, 0])
  hairLock([[0.029, 1.762, 0.042], [0.047, 1.743, 0.060], [0.069, 1.713, 0.044], [0.078, 1.668, 0.009]], [0.012, 0.015, 0.009, 0], [0.007, 0.008, 0.005, 0])
  hairLock([[-0.078, 1.706, -0.004], [-0.086, 1.681, -0.002], [-0.080, 1.652, 0.006]], [0.007, 0.007, 0], [0.005, 0.005, 0])
  hairLock([[0.079, 1.702, -0.005], [0.085, 1.678, -0.002], [0.080, 1.654, 0.004]], [0.006, 0.006, 0], [0.004, 0.004, 0])
  // Short overlapping swept sections replace the single zigzag hairline.
  stroke(head, [[0.024, 1.765, 0.050], [0.016, 1.748, 0.071], [-0.007, 1.731, 0.078], [-0.032, 1.718, 0.078], [-0.047, 1.705, 0.068]], 0.00085)
  stroke(head, [[-0.018, 1.743, 0.074], [-0.041, 1.726, 0.070], [-0.062, 1.705, 0.050], [-0.071, 1.687, 0.038]], 0.0008)
  stroke(head, [[0.030, 1.751, 0.069], [0.043, 1.736, 0.071], [0.062, 1.718, 0.055], [0.072, 1.696, 0.038]], 0.00085)
  stroke(head, [[0.020, 1.776, 0.034], [0.010, 1.772, 0.047], [-0.007, 1.763, 0.061]], 0.00065)

  for (const [parent, materials] of batches) for (const [material, pieces] of materials) {
    const geometry = mergeGeometries(pieces, false)
    if (!geometry) throw new Error('Ghost character geometry could not be merged')
    for (const piece of pieces) piece.dispose()
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = false; mesh.receiveShadow = false
    mesh.name = material === lineMaterial ? 'drawn contours' : 'transparent volume'
    parent.add(mesh)
  }
  return { group, head, torso }
}
