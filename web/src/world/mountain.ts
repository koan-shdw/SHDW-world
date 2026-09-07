// The mountain (owner 09-07: "so far away and so big that it looks like it has perspective, a genuine mountain in the
// distance, the colour illuminated by the lighting, not flat white"): Yozo's words as solid Helvetica letters cut deep like
// stone, one upright block 400 m out opposite the door, 1.6 km wide and 900 m tall, wider than the view (owner: "MASSIVE
// MONUMENTAL GIGANTIC, you have to look up to see it"): the bottom line 24° up above the roofline, the top 70° up, hazed, into
// the clouds. Sized by the look-up angle, never to fit the screen. Lit by a cool key light, a slow sweep, and the lightning.
import * as THREE from 'three'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface MountainOpts { width: number; size: number; depth: number; lean: number; lineHeight: number; paraGap: number }
const DEFAULTS: MountainOpts = { width: 1640, size: 60, depth: 17, lean: 0, lineHeight: 1.22, paraGap: 0.6 }

const vert = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vL = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const frag = /* glsl */ `
uniform float uTime; uniform float uFlash; uniform vec3 uFlashAt;
uniform vec3 uKey; uniform vec3 uKeyCol; uniform vec3 uSkyCol; uniform vec3 uGroundCol; uniform vec3 uAlbedo; uniform vec3 uHaze; uniform vec2 uHazeRange;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 7.0; a *= 0.5; } return v; }
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  // the stone: a grain, coarse and fine
  float g = fbm(vec2(vL.x * 0.025 + vL.z * 0.02, vL.y * 0.025)) * 0.7 + fbm(vL.xy * 0.12) * 0.3;
  vec3 alb = uAlbedo * (0.78 + 0.44 * g);
  // the key light: a moon behind moving cloud, so a slow sweep of brightness crosses the face
  float s1 = 0.5 + 0.5 * sin(vL.x * 0.0032 - uTime * 0.085 + vL.y * 0.0015);
  float s2 = 0.5 + 0.5 * sin(vL.y * 0.0048 + uTime * 0.047 - vL.x * 0.0021);
  float band = 0.4 + 0.6 * (0.35 + 0.65 * s1) * (0.5 + 0.5 * s2);
  float nl = max(dot(N, uKey), 0.0);
  float wrap = max(dot(N, uKey) * 0.5 + 0.5, 0.0);
  vec3 light = uKeyCol * (nl + wrap * wrap * 0.3) * band;
  vec3 hemi = mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5);
  // the lightning, from the clouds between you and the words
  vec3 Lf = normalize(uFlashAt - vW);
  float fl = uFlash * (0.2 + 0.8 * max(dot(N, Lf), 0.0));
  vec3 col = alb * (light + hemi) + alb * vec3(0.6, 0.66, 0.85) * fl * 3.5;
  // a rim against the sky
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uSkyCol * rim * 0.7;
  // aerial perspective: the far rows and the deep faces go to the sky's grey; the sky itself lifts in a flash
  float h = smoothstep(uHazeRange.x, uHazeRange.y, distance(cameraPosition, vW));
  col = mix(col, uHaze * (1.0 + 1.2 * uFlash), h);
  gl_FragColor = vec4(col, 1.0);
}`

export class Mountain {
  readonly group = new THREE.Group()
  readonly opts: MountainOpts
  private tilt = new THREE.Group()
  private mesh: THREE.Mesh | null = null
  private mat: THREE.ShaderMaterial

  /** `footX, footY`: where the last baseline stands in the world; the block faces -x (the yard) */
  constructor(private lines: string[], footX: number, footY: number, base: string, opts: Partial<MountainOpts> = {}) {
    this.opts = { ...DEFAULTS, ...opts }
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uFlash: { value: 0 }, uFlashAt: { value: new THREE.Vector3(60, 40, 0) },
        uKey: { value: new THREE.Vector3(-0.8, 0.55, -0.25).normalize() },    // from your upper left, mostly frontal: the fronts read, the sides sit darker
        uKeyCol: { value: new THREE.Color(0.8, 0.85, 1.0).multiplyScalar(1.2) },
        uSkyCol: { value: new THREE.Color(0.16, 0.18, 0.25) },
        uGroundCol: { value: new THREE.Color(0.05, 0.05, 0.06) },
        uAlbedo: { value: new THREE.Color(0.5, 0.5, 0.52) },
        uHaze: { value: new THREE.Color(0.035, 0.04, 0.055) },
        uHazeRange: { value: new THREE.Vector2(500, 2200) },   // the bottom rows clear, the top rows a third into the sky's grey
      },
      vertexShader: vert, fragmentShader: frag, fog: false,
    })
    this.group.position.set(footX, footY, 0); this.group.rotation.y = -Math.PI / 2   // local +z = toward the yard, +x = reading direction
    this.tilt.rotation.x = -THREE.MathUtils.degToRad(this.opts.lean)                 // the top leans away
    this.group.add(this.tilt)
    fetch(`${base}brand/helvetica-bold.typeface.json`).then((r) => r.json()).then((json) => this.build(new FontLoader().parse(json))).catch((e) => console.warn('mountain font', e))
  }

  private build(font: Font): void {
    const { width, size, depth, lineHeight, paraGap } = this.opts
    const data = font.data as unknown as { glyphs: Record<string, { ha: number }>; resolution: number }
    const k = size / data.resolution
    const adv = (s: string): number => { let w = 0; for (const ch of s) w += (data.glyphs[ch] ?? data.glyphs['?']).ha * k; return w }
    // wrap each paragraph to the width
    const rows: { text: string; para: number }[] = []
    this.lines.forEach((line, para) => {
      let cur = ''
      for (const wd of line.split(' ')) { const t = cur ? `${cur} ${wd}` : wd; if (adv(t) > width && cur) { rows.push({ text: cur, para }); cur = wd } else cur = t }
      rows.push({ text: cur, para })
    })
    // rows from the top down, a gap between paragraphs, left aligned; then the block lifted so the last baseline is the foot
    const pitch = size * lineHeight, gap = size * paraGap
    let y = 0, para = rows[0]?.para ?? 0
    const parts: THREE.BufferGeometry[] = []
    for (const r of rows) {
      if (r.para !== para) { y -= gap; para = r.para }
      const g = new TextGeometry(r.text, { font, size, depth, curveSegments: 4, bevelEnabled: false })
      g.translate(-width / 2, y, -depth)                                              // the front face on the block's plane, the mass behind
      parts.push(g); y -= pitch
    }
    const geo = mergeGeometries(parts); parts.forEach((p) => p.dispose())
    if (!geo) return
    geo.translate(0, -(y + pitch), 0)
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.tilt.add(this.mesh)
  }

  update(t: number, flash: number, flashAt: THREE.Vector3): void {
    const u = this.mat.uniforms
    u.uTime.value = t; u.uFlash.value = flash; (u.uFlashAt.value as THREE.Vector3).copy(flashAt)
  }
}
