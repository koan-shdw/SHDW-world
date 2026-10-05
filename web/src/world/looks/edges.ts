// Outline + dither (REMAKE.md §4.7, theirs): one pass right after the RenderPass, reading its colour and depth.
// Outline: a Sobel on linear depth plus a Sobel on luminance, darkens the edge. Dither: an 8x8 Bayer threshold on
// quantised luminance in gamma space. Both are uniforms, 0 = off, so the dials never recompile.
import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

const vert = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const frag = /* glsl */ `
uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tBayer;
uniform vec2 resolution; uniform float cameraNear; uniform float cameraFar;
uniform float outline; uniform float dither; uniform float levels;
varying vec2 vUv;
float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).r * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float bayer8(vec2 p) { return texture2D(tBayer, p / 8.0).r; }
void main() {
  vec2 px = 1.0 / resolution;
  vec4 c = texture2D(tDiffuse, vUv);
  // --- outline: depth + luminance Sobel
  float d0 = linDepth(vUv);
  float dl = linDepth(vUv - vec2(px.x, 0.0)), dr = linDepth(vUv + vec2(px.x, 0.0));
  float dd = linDepth(vUv - vec2(0.0, px.y)), du = linDepth(vUv + vec2(0.0, px.y));
  float depthEdge = (abs(dl - dr) + abs(dd - du)) / max(d0, 0.05);
  float ll = luma(texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb), lr = luma(texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb);
  float ld = luma(texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb), lu = luma(texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb);
  float lumaEdge = abs(ll - lr) + abs(ld - lu);
  float edge = clamp(smoothstep(0.06, 0.25, depthEdge) + smoothstep(0.35, 0.9, lumaEdge) * 0.6, 0.0, 1.0);
  // Opaque foliage writes a softer outline weight in scene alpha; ordinary surfaces write 1.
  c.rgb *= 1.0 - edge * outline * 0.85 * c.a;
  // --- dither: quantise in gamma space with a Bayer threshold, blend by strength
  if (dither > 0.0) {
    vec3 g = pow(max(c.rgb, 0.0), vec3(1.0 / 2.2));
    float t = bayer8(gl_FragCoord.xy) - 0.5;
    vec3 q = floor(g * levels + t + 0.5) / levels;
    vec3 back = pow(max(q, 0.0), vec3(2.2));
    c.rgb = mix(c.rgb, back, dither);
  }
  gl_FragColor = vec4(c.rgb, 1.0);
  // Preserve opaque depth for volumetric smoke after the composer swaps targets.
  gl_FragDepth = texture2D(tDepth, vUv).r;
}`

/** the 8x8 Bayer matrix as a tiny repeating texture (GLSL ES 1.00 has no bit ops) */
function bayerTexture(): THREE.DataTexture {
  const m2 = [[0, 2], [3, 1]]
  const bayer = (x: number, y: number, n: number): number => n === 2 ? m2[y][x] : 4 * bayer(x % (n / 2), y % (n / 2), n / 2) + m2[Math.floor(y / (n / 2))][Math.floor(x / (n / 2))]
  const data = new Uint8Array(64)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data[y * 8 + x] = Math.round((bayer(x, y, 8) + 0.5) / 64 * 255)
  const t = new THREE.DataTexture(data, 8, 8, THREE.RedFormat, THREE.UnsignedByteType)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true
  return t
}

export class EdgesPass extends Pass {
  readonly uniforms: Record<string, THREE.IUniform>
  private material: THREE.ShaderMaterial
  private quad: FullScreenQuad
  constructor(private camera: THREE.PerspectiveCamera) {
    super()
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: null }, tBayer: { value: bayerTexture() }, resolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
      outline: { value: 1.0 }, dither: { value: 0.35 }, levels: { value: 24.0 },
    }
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth })
    this.quad = new FullScreenQuad(this.material)
    this.needsSwap = true
  }
  setSize(w: number, h: number): void { this.uniforms.resolution.value.set(w, h) }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture
    this.uniforms.tDepth.value = readBuffer.depthTexture
    this.uniforms.cameraNear.value = this.camera.near; this.uniforms.cameraFar.value = this.camera.far
    if (this.renderToScreen) { renderer.setRenderTarget(null); this.quad.render(renderer) }
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); this.quad.render(renderer) }
  }
  dispose(): void { this.material.dispose(); this.quad.dispose() }
}
