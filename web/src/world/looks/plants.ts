// Individually curved leaves on branching stems. Two instanced draws share the same wind and shadow motion.
import * as THREE from 'three'

function leafGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = []
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 4; x++) {
    const t = y / 8, side = x / 2 - 1, width = Math.pow(Math.sin(Math.PI * t), 0.8) * 0.23
    positions.push(side * width, t, Math.sin(Math.PI * t) * (0.055 * (1 - Math.abs(side)) - 0.045 * side * side) - 0.1 * t * t)
    uv.push(x / 4, t)
    if (y < 8 && x < 4) { const a = y * 5 + x; indices.push(a, a + 1, a + 5, a + 1, a + 6, a + 5) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(indices); g.computeVertexNormals()
  return g
}

function leafTexture(): THREE.DataTexture {
  const w = 128, h = 256, data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = Math.abs(x / (w - 1) - 0.5), v = y / (h - 1)
    const midrib = Math.exp(-u * 180), branch = Math.abs(((v * 9 - u * 2.8 + 3) % 1) - 0.5)
    const veins = midrib * 0.13 + Math.exp(-branch * 100) * (1 - u * 1.5) * 0.065
    const grain = Math.sin(x * 127.1 + y * 311.7) * 0.012
    const tone = Math.min(1, 0.76 + Math.sin(v * Math.PI) * 0.13 - u * 0.12 + veins + grain), i = (y * w + x) * 4
    data[i] = Math.round(tone * 245); data[i + 1] = Math.round(tone * 255); data[i + 2] = Math.round(tone * 231); data[i + 3] = 255
  }
  const texture = new THREE.DataTexture(data, w, h)
  texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.anisotropy = 8; texture.needsUpdate = true
  return texture
}

export class Plants {
  readonly group = new THREE.Group()
  private hidden: THREE.Mesh[] = []
  private uniforms = { time: { value: 0 } }
  private on = true
  private texture: THREE.DataTexture | null = null
  private depth: THREE.MeshDepthMaterial | null = null

  constructor(room: THREE.Group) {
    room.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.type === 'SphereGeometry' && (m.material as THREE.Material).name === 'foliage') this.hidden.push(m) })
    if (!this.hidden.length) return
    this.texture = leafTexture()
    const leaves = new THREE.MeshStandardMaterial({ map: this.texture, bumpMap: this.texture, bumpScale: 0.0012, side: THREE.DoubleSide, roughness: 0.62 })
    const bark = new THREE.MeshStandardMaterial({ color: 0x594935, roughness: 0.95 })
    this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide })
    for (const material of [leaves, bark, this.depth]) material.onBeforeCompile = shader => {
      shader.uniforms.uPlantTime = this.uniforms.time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uPlantTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 plantPosition = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          float height = max(0.0, plantPosition.y + 4.3);
          float breeze = sin(uPlantTime * 0.85 + plantPosition.x * 1.4 + plantPosition.z) * 0.012
            + sin(uPlantTime * 1.7 + plantPosition.x * 3.1) * 0.004;
          transformed += inverse(mat3(instanceMatrix)) * vec3(breeze * height, 0.0, breeze * height * 0.55);`)
      // Opaque scene alpha carries outline strength; fine foliage keeps its natural silhouette.
      if (material !== this.depth) shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = 0.12;')
      // Thin leaves scatter some ambient sky light through their shaded undersides.
      if (material === leaves) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.12;')
    }
    const leafMatrices: THREE.Matrix4[] = [], stemMatrices: THREE.Matrix4[] = [], colors: THREE.Color[] = []
    const up = new THREE.Vector3(0, 1, 0), dark = new THREE.Color(0x3d5735), olive = new THREE.Color(0x91a265)
    let seed = 71
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const stem = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const delta = b.clone().sub(a)
      stemMatrices.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize()), new THREE.Vector3(radius, delta.length(), radius)))
    }
    for (const sphere of this.hidden) {
      sphere.updateWorldMatrix(true, false)
      const center = new THREE.Vector3(), scale = new THREE.Vector3()
      sphere.matrixWorld.decompose(center, new THREE.Quaternion(), scale)
      const radius = (sphere.geometry as THREE.SphereGeometry).parameters.radius
      const rx = radius * scale.x, ry = radius * scale.y, rz = radius * scale.z
      // The hedge grows behind the sign; front shoots reach forward over its top.
      const root = center.clone().add(new THREE.Vector3(0, -ry * 1.1, -rz))
      stem(root, center.clone().add(new THREE.Vector3(0, ry * 0.5, 0)), 0.009)
      for (let shoot = 0; shoot < 10; shoot++) {
        const angle = shoot * 2.39996 + rnd() * 0.65
        const start = root.clone().lerp(center, 0.15 + rnd() * 0.45)
        const end = center.clone().add(new THREE.Vector3(Math.cos(angle) * rx * (0.45 + rnd() * 0.6), ry * (0.1 + rnd() * 1.15), Math.sin(angle) * rz * (0.45 + rnd() * 0.6)))
        const middle = start.clone().lerp(end, 0.5); middle.y += ry * 0.15
        stem(start, middle, 0.004); stem(middle, end, 0.0025)
        for (let node = 0; node < 7; node++) for (let side = -1; side <= 1; side += 2) {
          const t = 0.16 + node * 0.13 + (side > 0 ? 0.02 : 0)
          const anchor = t < 0.5 ? start.clone().lerp(middle, t * 2) : middle.clone().lerp(end, t * 2 - 1)
          const azimuth = angle + side * (0.85 + rnd() * 0.8)
          const direction = new THREE.Vector3(Math.cos(azimuth), -0.45 + rnd() * 1.4, Math.sin(azimuth)).normalize()
          const base = anchor.clone().addScaledVector(direction, 0.012)
          stem(anchor, base, 0.0012)
          const x = new THREE.Vector3().crossVectors(direction, up).normalize(), z = new THREE.Vector3().crossVectors(x, direction).normalize()
          const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, direction, z))
          rotation.multiply(new THREE.Quaternion().setFromAxisAngle(up, (rnd() - 0.5) * 2.2))
          const length = (0.115 + rnd() * 0.085) * (0.7 + rx * 0.6) * (1.12 - t * 0.25)
          leafMatrices.push(new THREE.Matrix4().compose(base, rotation, new THREE.Vector3(length * (0.85 + rnd() * 0.3), length, length)))
          colors.push(dark.clone().lerp(olive, rnd() * 0.55 + t * 0.35))
        }
      }
    }
    const leafMesh = new THREE.InstancedMesh(leafGeometry(), leaves, leafMatrices.length)
    const stemMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 1, 1, 5), bark, stemMatrices.length)
    for (const [mesh, matrices] of [[leafMesh, leafMatrices], [stemMesh, stemMatrices]] as const) {
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
      mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = this.depth
      mesh.userData = { kind: 'plants' }; mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += 0.05
      this.group.add(mesh)
    }
    leafMesh.name = 'individual leaves'; stemMesh.name = 'branching stems'
    colors.forEach((color, i) => leafMesh.setColorAt(i, color)); leafMesh.instanceColor!.needsUpdate = true
    this.set(true)
  }
  set(on: boolean): void { this.on = on; this.group.visible = on; for (const m of this.hidden) m.visible = !on }
  get enabled(): boolean { return this.on }
  update(t: number): void { this.uniforms.time.value = t }
  dispose(): void {
    this.set(false); this.group.removeFromParent()
    for (const object of this.group.children) { const mesh = object as THREE.InstancedMesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose() }
    this.texture?.dispose(); this.depth?.dispose()
  }
}
