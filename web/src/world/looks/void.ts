// World-space smoke: integrate density up to the visible surface, then composite before tone mapping.
import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import type { Quality } from '../renderer'

const vert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const frag = /* glsl */ `
uniform sampler3D volume;
uniform sampler2D tDepth;
uniform mat4 inverseProjection, cameraWorld;
uniform vec3 eye, flashAt, lightDirection;
uniform float time, flash;
uniform int steps;
varying vec2 vUv;
float noise(vec3 p) { return texture(volume, p / 64.0).r; }
float density(vec3 p) {
  float r = length(p.xz);
  // Clear the occupied building; banks rise around it and wrap the distant text in all three axes.
  float bank = max(smoothstep(14.0, 38.0, r), max(1.0 - smoothstep(-14.0, -7.0, p.y), smoothstep(7.0, 19.0, p.y)));
  if (bank < 0.001) return 0.0;
  vec3 q = p * (0.009 + 0.065 * exp(-r * 0.012));
  float t = time * 0.09;
  q += vec3(t * 0.55, -t * 0.24, t * 0.3);
  // Advected, curling domain warp: continuous 3D density, including between the letter faces.
  vec3 curl = vec3(noise(q * 0.65 + vec3(0, t * 0.18, 0)), noise(q * 0.65 + 19.3), noise(q * 0.65 + 37.1));
  q += (curl - 0.5) * 3.8;
  q.xz += vec2(sin(q.y * 0.7 + t), cos(q.y * 0.7 + t)) * 0.6;
  float n = noise(q) * 0.56 + noise(q * 2.03 + 11.7) * 0.28 + noise(q * 4.07 + 23.1) * 0.14;
  float cloud = smoothstep(0.39, 0.68, n) * smoothstep(0.28, 0.66, noise(q * 0.43 + 33.0));
  return cloud * bank * 0.038 / (1.0 + r * 0.018) * (1.0 - smoothstep(1500.0, 2800.0, length(p)));
}
void main() {
  float depth = texture2D(tDepth, vUv).r;
  vec4 end = inverseProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 viewEnd = end.xyz / end.w;
  float distance = min(length(viewEnd), 2800.0);
  vec3 ray = normalize(mat3(cameraWorld) * viewEnd);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float spread = log(1.0 + distance / 25.0);
  vec3 color = vec3(0.0);
  float transmission = 1.0;
  float previous = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= steps || transmission < 0.015) break;
    float next = (exp(float(i + 1) / float(steps) * spread) - 1.0) * 25.0;
    float ds = next - previous;
    vec3 p = eye + ray * mix(previous, next, 0.2 + jitter * 0.6);
    float d = density(p);
    if (d > 0.00001) {
      float radius = 8.0 + length(p.xz) * 0.055;
      float shade = exp(-density(p + lightDirection * radius) * radius * 4.0);
      float silver = pow(max(dot(ray, lightDirection), 0.0), 8.0);
      vec3 illumination = vec3(0.008, 0.012, 0.018) + vec3(0.11, 0.16, 0.23) * shade * (0.4 + silver);
      if (flash > 0.001) {
        vec3 toFlash = flashAt - p;
        float flashGlow = exp(-length(toFlash) / 420.0);
        float flashShade = exp(-density(p + normalize(toFlash + vec3(0.001)) * radius) * radius * 3.0);
        illumination += vec3(0.55, 0.68, 1.0) * flash * flashGlow * (0.25 + flashShade) * 2.0;
      }
      // Warm spill from the gallery against the cool distant cloud light.
      illumination += vec3(0.16, 0.085, 0.035) * exp(-length(p - vec3(-2.0, -2.0, 0.0)) / 22.0);
      float opacity = 1.0 - exp(-d * ds);
      color += transmission * opacity * illumination;
      transmission *= 1.0 - opacity;
    }
    previous = next;
  }
  gl_FragColor = vec4(color, transmission);
}`

const composite = /* glsl */ `
uniform sampler2D tDiffuse, tDepth, smoke;
uniform vec2 smokeSize;
uniform float near, far;
varying vec2 vUv;
float viewDepth(float d) { return near * far / (far - d * (far - near)); }
void main() {
  float depth = texture2D(tDepth, vUv).r;
  float z = viewDepth(depth);
  vec2 pixel = vUv * smokeSize - 0.5;
  vec2 f = fract(pixel), base = floor(pixel);
  vec4 fog = vec4(0.0);
  float total = 0.0;
  // Depth-aware upsampling keeps the building and lettering edges clear at every quality tier.
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec2 uv = (base + vec2(x, y) + 0.5) / smokeSize;
    float neighbor = viewDepth(texture2D(tDepth, uv).r);
    vec2 weight = mix(1.0 - f, f, vec2(x, y));
    float w = weight.x * weight.y * exp(-abs(neighbor - z) / max(0.15, z * 0.03)) + 0.00001;
    fog += texture2D(smoke, uv) * w;
    total += w;
  }
  fog /= total;
  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * fog.a + fog.rgb, 1.0);
}`

export class Void extends Pass {
  readonly group = new THREE.Group()
  readonly light = new THREE.DirectionalLight(0xadc7ff, 0.8)
  readonly flashAt = new THREE.Vector3(160, 95, -100)
  flash = 0
  private nextStrike = 5
  private strikeT = -1
  private strikeLen = 0.8
  private quality: Quality = 'full'
  private size = new THREE.Vector2(1, 1)
  readonly noise: THREE.Data3DTexture
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  private material: THREE.ShaderMaterial
  private composite: THREE.ShaderMaterial
  private quad = new FullScreenQuad()

  constructor(room: THREE.Group, private camera: THREE.PerspectiveCamera) {
    super()
    const data = new Uint8Array(64 ** 3)
    let seed = 709
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed >>> 24 }
    this.noise = new THREE.Data3DTexture(data, 64, 64, 64)
    this.noise.format = THREE.RedFormat
    this.noise.minFilter = this.noise.magFilter = THREE.LinearFilter
    this.noise.wrapS = this.noise.wrapT = this.noise.wrapR = THREE.RepeatWrapping
    this.noise.needsUpdate = true
    this.light.position.copy(this.flashAt)
    this.light.target.position.set(-2, -1, 0)
    this.light.castShadow = true
    this.light.shadow.mapSize.set(1024, 1024)
    Object.assign(this.light.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 600 })
    this.light.shadow.camera.updateProjectionMatrix()
    this.light.shadow.normalBias = 0.035
    this.group.add(this.light, this.light.target)
    this.material = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms: {
      volume: { value: this.noise }, tDepth: { value: null }, inverseProjection: { value: camera.projectionMatrixInverse },
      cameraWorld: { value: camera.matrixWorld }, eye: { value: new THREE.Vector3() }, time: { value: 0 }, flash: { value: 0 },
      flashAt: { value: this.flashAt }, lightDirection: { value: this.flashAt.clone().normalize() }, steps: { value: 56 },
    } })
    this.composite = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: composite, depthTest: false, depthWrite: false, uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null }, smoke: { value: this.target.texture }, smokeSize: { value: new THREE.Vector2(1, 1) },
      near: { value: camera.near }, far: { value: camera.far },
    } })
    room.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (m.userData.kind === 'ground') m.visible = false
      if ([m.material].flat().every(material => !material.transparent)) m.castShadow = true
    })
  }

  setQuality(quality: Quality): void {
    if (quality === this.quality) return
    this.quality = quality
    this.material.uniforms.steps.value = quality === 'full' ? 56 : quality === 'balanced' ? 40 : 28
    this.setSize(this.size.x, this.size.y)
  }
  setSize(w: number, h: number): void {
    this.size.set(w, h)
    // ponytail: capped half-resolution volume; add temporal reconstruction only if mobile profiling needs it.
    const cap = this.quality === 'full' ? 960 : this.quality === 'balanced' ? 720 : 480
    const scale = Math.min(0.5, cap / Math.max(w, h))
    const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale))
    this.target.setSize(width, height)
    this.composite.uniforms.smokeSize.value.set(width, height)
  }
  update(t: number, reduce = false): void {
    if (!reduce && t >= this.nextStrike && this.strikeT < 0) {
      this.strikeT = t; this.strikeLen = 0.8 + Math.random() * 0.6
      this.flashAt.set(120 + Math.random() * 180, 70 + Math.random() * 100, -160 + Math.random() * 260)
      this.light.position.copy(this.flashAt)
      this.nextStrike = t + 9 + Math.random() * 9
    }
    const e = this.strikeT < 0 ? 1 : (t - this.strikeT) / this.strikeLen
    this.flash = !reduce && e >= 0 && e < 1 ? Math.sin(e * Math.PI) ** 2 : 0
    if (reduce || e >= 1) this.strikeT = -1
    this.material.uniforms.time.value = reduce ? 0 : t
    this.material.uniforms.flash.value = this.enabled ? this.flash : 0
    this.material.uniforms.lightDirection.value.copy(this.flashAt).sub(this.light.target.position).normalize()
    this.light.intensity = 0.8 + this.flash * 3.2
    if (!this.enabled) this.flash = 0
  }
  set(on: boolean): void { this.enabled = on; this.group.visible = on; if (!on) this.flash = 0 }
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDepth.value = read.depthTexture
    this.material.uniforms.eye.value.setFromMatrixPosition(this.camera.matrixWorld)
    this.quad.material = this.material
    renderer.setRenderTarget(this.target); this.quad.render(renderer)
    this.composite.uniforms.tDiffuse.value = read.texture
    this.composite.uniforms.tDepth.value = read.depthTexture
    this.composite.uniforms.near.value = this.camera.near; this.composite.uniforms.far.value = this.camera.far
    this.quad.material = this.composite
    renderer.setRenderTarget(this.renderToScreen ? null : write); this.quad.render(renderer)
  }
  dispose(): void {
    this.noise.dispose(); this.target.dispose(); this.material.dispose(); this.composite.dispose(); this.quad.dispose()
    this.light.dispose(); this.group.removeFromParent()
  }
}
