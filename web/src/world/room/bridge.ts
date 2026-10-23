import * as THREE from 'three'
import type { LevelObject } from './level'

interface Fragment {
  index: number
  home: THREE.Vector3
  origin: THREE.Vector3
  spin: THREE.Euler
  drift: THREE.Vector3
  size: number
  phase: number
  duration: number
}

/** A fixed broken edge feeds a reusable pool of eight-piece crumbling blocks. */
export class BridgeFragments extends THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  private fragments: Fragment[] = []
  private piece = new THREE.Object3D()
  private offset = new THREE.Vector3()
  private clusterRotation = new THREE.Quaternion()
  private fade: THREE.InstancedBufferAttribute
  private reduced = false
  declare customDepthMaterial: THREE.MeshDepthMaterial

  constructor(o: Extract<LevelObject, { kind: 'slab' }>, start: number, source: THREE.MeshStandardMaterial) {
    const [a, b] = o.box, cell = 0.26, layers = 14
    const ny = Math.ceil((b[1] - a[1]) / cell), nz = Math.ceil((b[2] - a[2]) / cell)
    const dy = (b[1] - a[1]) / ny, dz = (b[2] - a[2]) / nz
    super(new THREE.BoxGeometry(1, 1, 1), source.clone(), ny * nz * layers * 8)
    this.name = `${o.name} fragments`
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(this.count).fill(1), 1).setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('fragmentFade', this.fade)
    this.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    for (const material of [this.material, this.customDepthMaterial]) {
      // Alpha hashing keeps fading debris in the scene depth used by smoke and outlines.
      material.alphaHash = true
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float fragmentFade; varying float vFragmentFade;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFragmentFade = fragmentFade;')
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vFragmentFade;')
          .replace('#include <alphahash_fragment>', 'diffuseColor.a *= vFragmentFade;\n#include <alphahash_fragment>')
      }
    }
    let seed = Math.round(a[1] * 1234 + a[2] * 5678), count = 0
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const tint = new THREE.Color(), piece = this.piece
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      const edge = 1 + Math.floor(random() * 4)
      for (let i = 0; i < layers; i++) {
        const loose = Math.max(0, (i - edge) / (layers - 1 - edge))
        if (loose > 0 && random() < loose * 0.7) continue
        const size = cell * Math.pow(1 - loose, 1.5) + 0.012, spread = loose * loose
        piece.position.set(start + (i + 0.5) * cell + spread * (0.7 + random() * 0.8),
          a[1] + (y + 0.5) * dy + spread * (random() - 0.35) * 2.1,
          a[2] + (z + 0.5) * dz + spread * (random() - 0.5) * 2.8)
        piece.scale.set(loose ? size : cell, loose ? size : dy, loose ? size : dz)
        piece.rotation.set((random() - 0.5) * loose, (random() - 0.5) * loose, (random() - 0.5) * loose)
        tint.setScalar(loose ? 0.78 + random() * 0.22 : 1)
        if (loose) {
          this.fragments.push({ index: count, home: piece.position.clone(), spin: piece.rotation.clone(), size,
            origin: new THREE.Vector3(start + (edge + 1.5) * cell, a[1] + (y + 0.5) * dy, a[2] + (z + 0.5) * dz),
            drift: new THREE.Vector3(3.4 + size * 5, (piece.position.y - a[1] - (y + 0.5) * dy) * 1.5 + 0.2,
              (piece.position.z - a[2] - (z + 0.5) * dz) * 1.8), phase: loose * 0.95, duration: 10 + tint.r * 5 + size * 9 })
          for (let c = 0; c < 8; c++) this.setColorAt(count++, tint)
        } else {
          piece.updateMatrix(); this.setMatrixAt(count, piece.matrix); this.setColorAt(count++, tint)
        }
      }
    }
    this.count = count
    this.update(0, true)
    this.computeBoundingBox(); this.boundingBox!.expandByScalar(5)
    this.boundingSphere = this.boundingBox!.getBoundingSphere(new THREE.Sphere())
  }

  update(t: number, reduce = false): void {
    if (reduce && this.reduced) return
    this.reduced = reduce
    const piece = this.piece, smooth = THREE.MathUtils.smoothstep
    for (const f of this.fragments) {
      const age = (t / f.duration + f.phase) % 1
      const split = reduce ? 0 : smooth(age, 0.22, 0.72)
      const size = reduce ? f.size : 0.26 * (1 - age * 0.65)
      const alpha = reduce ? 1 : smooth(age, 0, 0.09) * (1 - smooth(age, 0.62, 1))
      piece.rotation.copy(f.spin)
      if (!reduce) piece.rotation.set(f.spin.x + age * 3, f.spin.y + age * 2, f.spin.z + age * 4)
      this.clusterRotation.copy(piece.quaternion)
      for (let c = 0; c < 8; c++) {
        this.offset.set(c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1)
          .multiplyScalar(size * 0.25 + split * (0.13 + age * 0.22)).applyQuaternion(this.clusterRotation)
        piece.position.copy(reduce ? f.home : f.origin)
        if (!reduce) {
          piece.position.addScaledVector(f.drift, age)
          piece.position.y += Math.sin(age * 5 + f.phase * 8) * age * 0.12
        }
        piece.position.add(this.offset)
        piece.quaternion.copy(this.clusterRotation)
        if (split) piece.rotateX(split * (c - 3.5) * 0.4)
        piece.scale.setScalar(Math.max(0.00001, size * 0.5 * (1 - split * 0.45)))
        piece.updateMatrix(); this.setMatrixAt(f.index + c, piece.matrix)
        this.fade.setX(f.index + c, alpha)
      }
    }
    this.instanceMatrix.needsUpdate = true; this.fade.needsUpdate = true
  }

  override dispose(): this {
    this.geometry.dispose(); this.material.dispose(); this.customDepthMaterial.dispose(); return super.dispose()
  }
}
