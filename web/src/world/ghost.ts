import * as THREE from 'three'
import type { ArtItem, Layout } from './art/art'
import { floorOf, wallPoint, wallDir, type Level } from './room/level'
import { createGhostCharacter } from './ghost-character'

const SOURCE = 'my-turn-mtqsqgyy'

// One colour field belongs to the whole figure, including its moving head and hands.
function ghostSurface(space: THREE.Matrix4, depth: THREE.Texture, viewport: THREE.Vector2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#9a456a') }, ghostSpace: { value: space }, ghostDepth: { value: depth }, strokes: { value: null }, viewport: { value: viewport }, clipToGhost: { value: new THREE.Matrix4() }, bounds: { value: new THREE.Vector4(-1, -1, 1, 1) }, texel: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.05 }, cameraFar: { value: 4000 } },
    vertexShader: `
      uniform vec4 bounds;
      void main() {
        gl_Position = vec4(mix(bounds.xy, bounds.zw, position.xy * 0.5 + 0.5), 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform sampler2D ghostDepth;
      uniform sampler2D strokes;
      uniform vec2 viewport;
      uniform mat4 clipToGhost;
      uniform vec2 texel;
      uniform float cameraNear;
      uniform float cameraFar;
      float distanceAt(float depth) {
        return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / viewport;
        float nearest = texture2D(ghostDepth, uv).r;
        if (nearest >= 1.0) discard;
        gl_FragDepth = nearest;
        vec4 local = clipToGhost * vec4(uv * 2.0 - 1.0, nearest * 2.0 - 1.0, 1.0);
        vec3 at = local.xyz / local.w;
        float height = smoothstep(0.10, 1.78, at.y + at.x * 0.16);
        float wash = exp(-pow((at.y - 1.14) / 0.38, 2.0));
        float furthest = max(max(texture2D(ghostDepth, uv + vec2(texel.x, 0.0)).r,
                                 texture2D(ghostDepth, uv - vec2(texel.x, 0.0)).r),
                             max(texture2D(ghostDepth, uv + vec2(0.0, texel.y)).r,
                                 texture2D(ghostDepth, uv - vec2(0.0, texel.y)).r));
        float contour = max(texture2D(strokes, uv).r, smoothstep(0.015, 0.055, distanceAt(furthest) - distanceAt(nearest)));
        float alpha = 0.25 + 0.16 * height + 0.05 * wash;
        vec3 colour = tint * mix(0.42, 1.05, height);
        colour = mix(colour, vec3(1.0, 0.99, 0.94), contour);
        alpha = mix(alpha, 0.94, contour);
        gl_FragColor = vec4(colour, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: true,
    // The room outline pass reads alpha as its edge weight. Preserve these drawn white contours.
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.FrontSide,
  })
}

export class GhostVisitor {
  readonly group = new THREE.Group()
  private character: ReturnType<typeof createGhostCharacter>
  private space = new THREE.Matrix4()
  private viewport = new THREE.Vector2(1, 1)
  private depthScene = new THREE.Scene()
  private depthTarget = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) })
  private depthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })
  private depthMeshes: { source: THREE.Mesh; copy: THREE.Mesh }[] = []
  private fill: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private box = new THREE.Box3()
  private corner = new THREE.Vector3()
  private time = 0
  private disposed = false

  constructor(private level: Level) {
    this.group.name = 'MY TURN spectator'
    this.group.visible = false
    this.depthScene.background = new THREE.Color(0x000000)
    const line = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    const surface = ghostSurface(this.space, this.depthTarget.depthTexture!, this.viewport)
    surface.uniforms.strokes.value = this.depthTarget.texture
    const volume = new THREE.MeshBasicMaterial()
    this.character = createGhostCharacter(volume, line)
    this.group.add(this.character.group)
    this.group.traverse(object => {
      const source = object as THREE.Mesh
      if (!source.isMesh) return
      source.layers.set(1)
      const copy = new THREE.Mesh(source.geometry, source.material === line ? line : this.depthMaterial)
      copy.matrixAutoUpdate = false
      this.depthScene.add(copy); this.depthMeshes.push({ source, copy })
    })
    // Composite the complete silhouette once, so overlapping body parts never darken its fill.
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), surface)
    this.fill.name = 'continuous ghost fill'; this.fill.frustumCulled = false
    this.group.add(this.fill)
  }

  sync(library: ArtItem[], layout: Layout): void {
    if (this.disposed) return
    const work = library.find(item => item.id === SOURCE)
    const placed = layout.items.find(item => item.art === SOURCE && item.kind === 'painting' && !item.note)
    const wall = placed && this.level.walls.find(item => item.id === placed.wall)
    this.group.visible = !!(work && placed && wall)
    if (!work || !placed || !wall) return
    const floor = floorOf(this.level, placed.level).floorY
    const centre = placed.u + work.w / 200
    const origin = wallPoint(wall, centre, floor, 1.15)
    const [dx, dz] = wallDir(wall)
    this.group.position.set(origin.x - dx * 0.62, floor, origin.z - dz * 0.62)
    const painting = wallPoint(wall, centre, floor + placed.topY - work.h / 200)
    this.group.rotation.y = Math.atan2(painting.x - this.group.position.x, painting.z - this.group.position.z)
  }

  update(dt: number, reduceMotion: boolean): void {
    if (this.disposed || !this.group.visible) return
    if (!reduceMotion) this.time += Math.min(Math.max(dt, 0), 0.05)
    const t = reduceMotion ? 0 : this.time
    const { torso, head } = this.character
    // A planted visitor studies the work: a slow head inclination and a small change of weight.
    torso.rotation.z = Math.sin(t * 0.32) * 0.012
    torso.rotation.x = Math.sin(t * 0.27) * 0.008
    head.rotation.x = 0.065 + Math.sin(t * 0.43) * 0.025
    head.rotation.y = Math.sin(t * 0.23) * 0.075
    head.rotation.z = Math.sin(t * 0.31) * 0.018
    this.group.updateMatrixWorld(true)
    this.space.copy(this.group.matrixWorld).invert()
  }

  prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera, renderSize?: { width: number; height: number }): void {
    if (this.disposed || !this.group.visible) return
    this.group.updateMatrixWorld(true)
    this.space.copy(this.group.matrixWorld).invert()
    camera.updateMatrixWorld()
    if (renderSize) this.viewport.set(renderSize.width, renderSize.height)
    else renderer.getDrawingBufferSize(this.viewport)
    const scale = Math.min(1, 1536 / Math.max(this.viewport.x, this.viewport.y))
    const width = Math.max(1, Math.round(this.viewport.x * scale)), height = Math.max(1, Math.round(this.viewport.y * scale))
    if (this.depthTarget.width !== width || this.depthTarget.height !== height) this.depthTarget.setSize(width, height)
    const uniforms = this.fill.material.uniforms
    uniforms.clipToGhost.value.copy(this.space).multiply(camera.matrixWorld).multiply(camera.projectionMatrixInverse)
    uniforms.texel.value.set(2 / width, 2 / height)
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      uniforms.cameraNear.value = camera.near; uniforms.cameraFar.value = camera.far
    }
    for (const { source, copy } of this.depthMeshes) copy.matrix.copy(source.matrixWorld)
    this.box.makeEmpty()
    for (const { source } of this.depthMeshes) this.box.expandByObject(source)
    const bounds = uniforms.bounds.value as THREE.Vector4
    bounds.set(1, 1, -1, -1)
    let behind = false
    for (let i = 0; i < 8; i++) {
      this.corner.set(i & 1 ? this.box.max.x : this.box.min.x, i & 2 ? this.box.max.y : this.box.min.y, i & 4 ? this.box.max.z : this.box.min.z).project(camera)
      behind ||= this.corner.z < -1 || this.corner.z > 1
      bounds.x = Math.min(bounds.x, this.corner.x); bounds.y = Math.min(bounds.y, this.corner.y)
      bounds.z = Math.max(bounds.z, this.corner.x); bounds.w = Math.max(bounds.w, this.corner.y)
    }
    if (behind) bounds.set(-1, -1, 1, 1)
    const previous = renderer.getRenderTarget()
    try {
      renderer.setRenderTarget(this.depthTarget); renderer.clear(); renderer.render(this.depthScene, camera)
    } finally { renderer.setRenderTarget(previous) }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    this.group.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      geometries.add(mesh.geometry)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material)
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    this.depthTarget.dispose(); this.depthMaterial.dispose(); this.depthScene.clear(); this.depthMeshes.length = 0
    this.group.removeFromParent()
    this.group.clear()
  }
}
