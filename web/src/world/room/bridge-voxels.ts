import * as THREE from 'three'

type Cell = {
  mesh: THREE.InstancedMesh; index: number
  position: THREE.Vector3; rotation: THREE.Quaternion; size: THREE.Vector3; tint: THREE.Color
  release: number; split: number; fadeAt: number; end: number
  velocity: THREE.Vector3; spin: THREE.Euler; scatter: THREE.Vector3[]
}

const smooth = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b)
// Starts at rest and approaches a steady drift without a launch or a downward arc.
const drift = (t: number) => t - 4 * (1 - Math.exp(-t / 4))

/** The original boxes are the bridge: moving one also removes that piece of wall. */
export class VoxelBridge {
  readonly shell: THREE.InstancedMesh
  readonly chips: THREE.InstancedMesh
  readonly cells: Cell[] = []
  readonly duration: number
  private fade: THREE.InstancedBufferAttribute
  private lastTime = -1
  private piece = new THREE.Object3D()
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  private rotation = new THREE.Quaternion()
  private turn = new THREE.Quaternion()
  private angles = new THREE.Euler()
  private offset = new THREE.Vector3()
  private tint = new THREE.Color()

  constructor(name: string, box: [number[], number[]], readonly fragments: THREE.InstancedMesh) {
    const [a, b] = box, end = b[0] - 1.35, material = fragments.material as THREE.MeshStandardMaterial
    const nx = Math.ceil((end - a[0]) / .26), ny = Math.ceil((b[1] - a[1]) / .26), nz = Math.ceil((b[2] - a[2]) / .26)
    const dx = (end - a[0]) / nx, dy = (b[1] - a[1]) / ny, dz = (b[2] - a[2]) / nz
    this.shell = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, nx * ny * nz)
    this.shell.name = name
    let index = 0
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      this.piece.position.set(a[0] + (x + .5) * dx, a[1] + (y + .5) * dy, a[2] + (z + .5) * dz)
      this.piece.scale.set(dx, dy, dz); this.piece.updateMatrix()
      this.shell.setMatrixAt(index++, this.piece.matrix)
    }
    this.shell.computeBoundingBox(); this.shell.computeBoundingSphere()

    let seed = Math.round(a[1] * 1234 + a[2] * 5678) >>> 0
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const matrix = new THREE.Matrix4()
    for (const mesh of [this.shell, fragments]) {
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      for (let i = 0; i < mesh.count; i++) {
        const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), size = new THREE.Vector3(), tint = new THREE.Color(1, 1, 1)
        mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, size)
        if (mesh.instanceColor) mesh.getColorAt(i, tint)
        const loose = mesh === fragments ? fragments.userData.bridgeLoose.get(i) : undefined
        if (loose) { position.copy(loose.origin); rotation.identity() }
        let release = loose ? 0 : Math.max(2, 10 + (4.05 - position.x) * 100 + (random() - .5) * 42)
        const split = 38 + random() * 42
        const velocity = new THREE.Vector3(.008 + random() * .014, .022 + random() * .022, (position.z < .06 ? -1 : 1) * (.003 + random() * .008))
        const fadeAt = Math.max(split + 32, 3.2 / velocity.y + 4)
        const scatter = Array.from({ length: 8 }, () => new THREE.Vector3((random() - .5) * .022, .002 + random() * .016, (random() - .5) * .022))
        if (loose) {
          // The opening cloud is already partway through the same journey as newly shed material.
          release = -loose.progress * (fadeAt + 48)
        }
        this.cells.push({ mesh, index: i, position, rotation, size, tint, release, split, fadeAt, end: fadeAt + 48,
          velocity, scatter, spin: new THREE.Euler((random() - .5) * .006, (random() - .5) * .009, (random() - .5) * .006) })
      }
    }
    this.duration = Math.max(...this.cells.map(c => c.release + c.end))

    const geometry = new THREE.BoxGeometry(1, 1, 1), faded = material.clone()
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(this.cells.length * 8), 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('bridgeFade', this.fade)
    faded.alphaHash = true
    faded.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float bridgeFade; varying float vBridgeFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBridgeFade = bridgeFade;')
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBridgeFade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vBridgeFade;')
    }
    faded.customProgramCacheKey = () => 'bridge-voxel-fade'
    this.chips = new THREE.InstancedMesh(geometry, faded, this.cells.length * 8)
    this.chips.name = `${name} split fragments`; this.chips.frustumCulled = false; this.chips.count = 0
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.chips.setColorAt(0, this.tint); this.chips.instanceColor!.setUsage(THREE.DynamicDrawUsage)
    this.update(0)
  }

  update(time: number, reduceMotion = false): void {
    if (reduceMotion || time === this.lastTime || (time >= this.duration && this.lastTime >= this.duration)) return
    this.lastTime = time
    let count = 0, shellCount = 0, fragmentCount = 0
    for (const cell of this.cells) {
      const age = Math.max(0, time - cell.release)
      if (age >= cell.end) { cell.mesh.setMatrixAt(cell.index, this.hidden); continue }
      if (cell.mesh === this.shell) shellCount++; else fragmentCount++
      this.piece.position.copy(cell.position).addScaledVector(cell.velocity, drift(age))
      this.piece.scale.copy(cell.size)
      const spinTime = Math.min(age, cell.split)
      this.angles.set(cell.spin.x * spinTime, cell.spin.y * spinTime, cell.spin.z * spinTime)
      this.turn.setFromEuler(this.angles); this.rotation.copy(cell.rotation).multiply(this.turn)
      this.piece.quaternion.copy(this.rotation)
      if (age < cell.split) {
        this.piece.updateMatrix(); cell.mesh.setMatrixAt(cell.index, this.piece.matrix)
        continue
      }
      cell.mesh.setMatrixAt(cell.index, this.hidden)
      const spread = drift(age - cell.split), fade = 1 - smooth(cell.fadeAt, cell.end, age)
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
        // Children initially tile their parent's volume, then their cracks open upward.
        this.offset.set((x - .5) * cell.size.x / 2, (y - .5) * cell.size.y / 2, (z - .5) * cell.size.z / 2).applyQuaternion(this.rotation)
        this.piece.position.copy(cell.position).addScaledVector(cell.velocity, drift(age)).add(this.offset)
        this.piece.position.addScaledVector(cell.scatter[x * 4 + y * 2 + z], spread)
        this.piece.scale.copy(cell.size).multiplyScalar(.5 * (.55 + .45 * fade))
        this.piece.updateMatrix(); this.chips.setMatrixAt(count, this.piece.matrix)
        this.chips.setColorAt(count, cell.tint); this.fade.setX(count++, fade)
      }
    }
    this.shell.count = shellCount ? this.shell.instanceMatrix.count : 0
    this.fragments.count = fragmentCount ? this.cells.length - this.shell.instanceMatrix.count : 0
    this.chips.count = count
    this.shell.instanceMatrix.needsUpdate = true; this.fragments.instanceMatrix.needsUpdate = true
    this.chips.instanceMatrix.needsUpdate = true; this.chips.instanceColor!.needsUpdate = true; this.fade.needsUpdate = true
  }

  dispose(): void {
    for (const mesh of [this.shell, this.fragments, this.chips]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose() }
    ;(this.chips.material as THREE.Material).dispose()
  }
}
