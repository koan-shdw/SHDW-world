import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GhostAsset } from './ghost-asset'
import { createVisitorRig, type VisitorRig } from './visitor-rig'
import { VisitorBehavior, type ReadingTarget } from './visitor-behavior'
import type { ArtItem, Layout } from './art/art'
import type { DoorRuntime, Level } from './room/level'
import type { WalkObstacle, WalkState } from './walk'

const MODELS = [
  new URL('../assets/characters/salaryman-visitor-01.glb', import.meta.url).href,
  new URL('../assets/characters/salaryman-visitor-02.glb', import.meta.url).href,
  new URL('../assets/characters/salaryman-visitor-03.glb', import.meta.url).href,
  new URL('../assets/characters/salaryman-visitor-04.glb', import.meta.url).href,
  new URL('../assets/characters/salaryman-visitor-05.glb', import.meta.url).href,
]
// Reference-derived washes stay continuous across each visitor's clothes, face and hands.
const PALETTES = [
  ['#705b9b', '#c4788e'], ['#7772b9', '#719a88'], ['#697ea9', '#b78b91'],
  ['#756eb2', '#7ea895'], ['#888c73', '#b8799b'],
]
interface Actor { ghost: GhostAsset; rig: VisitorRig; model: THREE.Group; materials: Set<THREE.Material>; textures: Set<THREE.Texture> }

/** Animated spectators share the artwork layout, player position and the existing weather clock. */
export class GhostVisitors {
  readonly group = new THREE.Group()
  readonly behavior: VisitorBehavior
  readonly ready: Promise<void>
  readonly errors: string[] = []
  private actors: (Actor | undefined)[] = []
  private disposed = false
  private lifetime = new AbortController()
  private storm: { at: { x: number; z: number }; due: number } | null = null
  private frustum = new THREE.Frustum()
  private projection = new THREE.Matrix4()
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.25)

  constructor(level: Level) {
    this.group.name = 'CULT gallery visitors'
    this.behavior = new VisitorBehavior(level)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.storm = null }, { signal: this.lifetime.signal })
    this.ready = this.load()
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    // Decode one visitor at a time to avoid five simultaneous mesh/texture allocation spikes.
    for (let id = 0; id < MODELS.length && !this.disposed; id++) {
      try {
        const asset = await loader.loadAsync(MODELS[id])
        const model = new THREE.Group(); model.add(asset.scene); model.rotation.y = -Math.PI / 2
        model.updateMatrixWorld(true)
        const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3())
        if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid character bounds')
        const scale = 1.8 / size.y
        model.scale.setScalar(scale); model.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale)
        const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), originals = new Set<THREE.BufferGeometry>()
        model.traverse(object => {
          const mesh = object as THREE.Mesh
          if (!mesh.isMesh) return
          originals.add(mesh.geometry)
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            materials.add(material)
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
          }
        })
        if (this.disposed) { originals.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); return }
        const rig = createVisitorRig(model, id === 0)
        originals.forEach(geometry => geometry.dispose())
        const ghost = new GhostAsset(model, { lowTint: PALETTES[id][0], highTint: PALETTES[id][1], resolution: 1280, gallery: true })
        ghost.group.visible = false; this.group.add(ghost.group)
        this.actors[id] = { ghost, rig, model, materials, textures }
      } catch (error) {
        const message = `Visitor ${id + 1}: ${(error as Error).message}`
        this.errors.push(message); console.warn(message)
      }
    }
  }

  sync(library: ArtItem[], layout: Layout, readingTarget?: ReadingTarget | null): void {
    if (!this.disposed) this.behavior.sync(library, layout, readingTarget)
  }

  flash(at: { x: number; y: number; z: number }, listener: THREE.Vector3): void {
    // Match the existing thunder's travel delay rather than reacting at the lightning flash.
    this.storm = { at: { x: at.x, z: at.z }, due: performance.now() + (1.4 + Math.hypot(at.x - listener.x, at.y - listener.y, at.z - listener.z) / 343) * 1000 }
  }

  update(dt: number, player: WalkState, reduceMotion: boolean, obstacles: WalkObstacle[], doors: DoorRuntime[]): void {
    if (this.disposed) return
    const now = performance.now()
    const thunder = this.storm && now >= this.storm.due && now - this.storm.due < 1000 ? this.storm.at : undefined
    if (thunder || reduceMotion || (this.storm && now - this.storm.due >= 1000)) this.storm = null
    this.behavior.update(dt, player, { reduceMotion, thunder }, obstacles, doors)
    for (const state of this.behavior.agents) {
      const actor = this.actors[state.id]
      if (!actor) continue
      actor.ghost.group.position.set(state.x, state.y, state.z); actor.ghost.group.rotation.y = state.yaw
      actor.rig.update(dt, state)
    }
  }

  prepare(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, size: { width: number; height: number }): void {
    if (this.disposed) return
    camera.updateMatrixWorld()
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    for (const state of this.behavior.agents) {
      const actor = this.actors[state.id]
      if (!actor) continue
      this.sphere.center.set(state.x, state.y + .95, state.z)
      const distance = camera.position.distanceTo(this.sphere.center)
      actor.ghost.group.visible = state.visible && distance < 18 && this.frustum.intersectsSphere(this.sphere)
      if (!actor.ghost.group.visible) continue
      // Translucent visitors draw in distance order, including their independently composited ink.
      for (const child of actor.ghost.group.children) child.renderOrder = 100 - distance
      actor.ghost.prepare(renderer, camera, size)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.lifetime.abort()
    for (const actor of this.actors) if (actor) {
      actor.ghost.dispose(); actor.rig.dispose(); actor.materials.forEach(m => m.dispose()); actor.textures.forEach(t => t.dispose()); actor.model.clear()
    }
    this.actors.length = 0; this.group.removeFromParent(); this.group.clear()
  }
}
