// The void (owner 09-06): swirling black clouds under the gallery and above it, WITH DEPTH ("it looks like water, no depth"):
// stacked sheets of smoke at different heights, scales and drifts, transparent, so they parallax as you walk; the dome closes
// the far end. One shader, domain-warped noise turning slowly, a warm lift where the building's light reaches.
import * as THREE from 'three'

const vert = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`
const frag = /* glsl */ `
uniform float time; uniform vec3 base; uniform vec3 lift; uniform vec3 glowAt; uniform float glowR; uniform float scale; uniform float drift; uniform float alpha; uniform float solid;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8); for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 11.0; a *= 0.5; } return v; }
void main() {
  vec2 p = vW.xz * scale + vec2(drift, -drift * 0.6);
  float t = time * 0.035;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.35), fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.25));
  float f = fbm(p + 4.0 * r);
  float cloud = smoothstep(0.38, 0.95, f);
  vec3 col = mix(base, lift, cloud * 0.6);
  float g = 1.0 - smoothstep(0.0, glowR, length(vW.xz - glowAt.xz));
  col += vec3(0.12, 0.09, 0.07) * g * (0.3 + 0.7 * cloud);
  // a sheet: smoke where the noise is, clear between; the dome and the deep floor are solid
  float a = mix(cloud * alpha, 1.0, solid);
  gl_FragColor = vec4(col, a);
}`

function smoke(scale: number, drift: number, alpha: number, solid: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, base: { value: new THREE.Color(0x07070a) }, lift: { value: new THREE.Color(0x2c2e36) },
      glowAt: { value: new THREE.Vector3(-2.5, 0, 0) }, glowR: { value: 20 }, scale: { value: scale }, drift: { value: drift }, alpha: { value: alpha }, solid: { value: solid },
    },
    vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, fog: false, transparent: solid < 1, depthWrite: false,
  })
}

export class Void {
  readonly group = new THREE.Group()
  readonly materials: THREE.ShaderMaterial[] = []
  constructor(room: THREE.Group, floorY = -5.56, radius = 90) {
    // the dome, solid, the far end
    const sky = smoke(0.045, 0, 1, 1); this.materials.push(sky)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), sky); dome.renderOrder = -10; dome.frustumCulled = false; this.group.add(dome)
    // the deep floor, solid, far below
    const deep = smoke(0.03, 3, 1, 1); this.materials.push(deep)
    const bed = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), deep); bed.rotation.x = -Math.PI / 2; bed.position.y = floorY - 30; bed.renderOrder = -9; this.group.add(bed)
    // sheets below: the depth. Nearest sheet thinnest and finest, deeper sheets coarser and denser
    const below = [[-1.2, 0.16, 0.35], [-3.5, 0.11, 0.45], [-7, 0.08, 0.55], [-13, 0.055, 0.7], [-22, 0.04, 0.85]]
    below.forEach(([dy, sc, al], i) => {
      const m = smoke(sc, i * 2.3, al, 0); this.materials.push(m)
      const s = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), m); s.rotation.x = -Math.PI / 2; s.position.y = floorY + dy; s.renderOrder = -8 + i; this.group.add(s)
    })
    // sheets above: the same, over the roof
    const above = [[16, 0.07, 0.5], [26, 0.05, 0.7], [40, 0.035, 0.85]]
    above.forEach(([dy, sc, al], i) => {
      const m = smoke(sc, 7 + i * 1.7, al, 0); this.materials.push(m)
      const s = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), m); s.rotation.x = -Math.PI / 2; s.position.y = floorY + dy; s.renderOrder = -8 + i; this.group.add(s)
    })
    // the old flat void disc goes: the smoke is the void now
    room.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.kind === 'ground') m.visible = false })
  }
  update(t: number): void { for (const m of this.materials) m.uniforms.time.value = t }
  set(on: boolean): void { this.group.visible = on }
}
