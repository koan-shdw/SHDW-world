// The void (owner 09-06): swirling black clouds under the gallery and above it, WITH DEPTH ("it looks like water, no depth"):
// stacked sheets of smoke at different heights, scales and drifts, transparent, so they parallax as you walk; the dome closes
// the far end. One shader, domain-warped noise turning slowly, a warm lift where the building's light reaches.
import * as THREE from 'three'

const vert = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`
const frag = /* glsl */ `
uniform float time; uniform vec3 base; uniform vec3 lift; uniform vec3 glowAt; uniform float glowR; uniform float scale; uniform float drift; uniform float alpha; uniform float solid;
uniform float flash; uniform vec3 flashAt; uniform float flashR; uniform float axis; uniform vec2 fade;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8); for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 11.0; a *= 0.5; } return v; }
void main() {
  vec2 p = (axis > 0.5 ? vW.zy : vW.xz) * scale + vec2(drift, -drift * 0.6);   // a standing sheet reads its own plane, not stripes
  float t = time * 0.035;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.35), fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.25));
  float f = fbm(p + 4.0 * r);
  float cloud = smoothstep(0.38, 0.95, f);
  vec3 col = mix(base, lift, cloud * 0.6);
  float g = 1.0 - smoothstep(0.0, glowR, length(vW.xz - glowAt.xz));
  col += vec3(0.12, 0.09, 0.07) * g * (0.3 + 0.7 * cloud);
  // lightning: a bright core in the cloud, a wide wash across everything
  float fl = flash * (0.05 + 0.95 * (1.0 - smoothstep(0.0, flashR, length(vW - flashAt))));
  col += vec3(0.5, 0.52, 0.62) * fl * (0.25 + 0.75 * cloud);
  // a sheet: smoke where the noise is, clear between; the dome and the deep floor are solid
  float a = mix(cloud * alpha * (1.0 - smoothstep(fade.x, fade.y, vW.y)), 1.0, solid);   // fade: gone above fade.y
  gl_FragColor = vec4(col, a);
}`

function smoke(scale: number, drift: number, alpha: number, solid: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, base: { value: new THREE.Color(0x07070a) }, lift: { value: new THREE.Color(0x2c2e36) },
      glowAt: { value: new THREE.Vector3(-2.5, 0, 0) }, glowR: { value: 20 }, scale: { value: scale }, drift: { value: drift }, alpha: { value: alpha }, solid: { value: solid },
      flash: { value: 0 }, flashAt: { value: new THREE.Vector3(60, 40, 0) }, flashR: { value: 45 }, axis: { value: 0 }, fade: { value: new THREE.Vector2(1e9, 1e9 + 1) },
    },
    vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, fog: false, transparent: solid < 1, depthWrite: false,
  })
}

export class Void {
  readonly group = new THREE.Group()
  readonly materials: THREE.ShaderMaterial[] = []
  constructor(room: THREE.Group, floorY = -5.56, radius = 3000) {
    // the dome, solid, the far end
    const sky = smoke(0.0016, 0, 1, 1); this.materials.push(sky)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), sky); dome.renderOrder = -10; dome.frustumCulled = false; this.group.add(dome)
    // the deep floor, solid, far below
    const deep = smoke(0.03, 3, 1, 1); this.materials.push(deep)
    const bed = new THREE.Mesh(new THREE.CircleGeometry(400, 48), deep); bed.rotation.x = -Math.PI / 2; bed.position.y = floorY - 30; bed.renderOrder = -9; this.group.add(bed)
    // sheets below: the depth. Nearest sheet thinnest and finest, deeper sheets coarser and denser
    const below = [[-1.2, 0.16, 0.35], [-3.5, 0.11, 0.45], [-7, 0.08, 0.55], [-13, 0.055, 0.7], [-22, 0.04, 0.85]]
    below.forEach(([dy, sc, al], i) => {
      const m = smoke(sc, i * 2.3, al, 0); this.materials.push(m)
      const s = new THREE.Mesh(new THREE.CircleGeometry(160, 40), m); s.rotation.x = -Math.PI / 2; s.position.y = floorY + dy; s.renderOrder = -8 + i; this.group.add(s)
    })
    // sheets above: the same, over the roof
    const above = [[16, 0.07, 0.5], [26, 0.05, 0.7], [40, 0.035, 0.85]]
    above.forEach(([dy, sc, al], i) => {
      const m = smoke(sc, 7 + i * 1.7, al, 0); this.materials.push(m)
      const s = new THREE.Mesh(new THREE.CircleGeometry(400, 40), m); s.rotation.x = -Math.PI / 2; s.position.y = floorY + dy; s.renderOrder = -8 + i; this.group.add(s)
    })
    // mist across the way (owner 09-07): standing sheets, near ones small and fine, far ones huge and coarse behind the
    // mountain, so the distance layers; the bank at 250 m veils the mountain's foot on the cloud floor (gone above its fade)
    const stand = (x: number, w: number, h: number, cy: number, sc: number, al: number, drift: number, order: number, fade?: [number, number]) => {
      const m = smoke(sc, drift, al, 0); m.uniforms.axis.value = 1; if (fade) (m.uniforms.fade.value as THREE.Vector2).set(fade[0], fade[1]); this.materials.push(m)
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); s.position.set(x, cy, 0); s.rotation.y = -Math.PI / 2; s.renderOrder = order; this.group.add(s)
    }
    stand(38, 900, 500, floorY + 120, 0.05, 0.4, 11, -6)
    stand(82, 900, 500, floorY + 120, 0.035, 0.55, 14.1, -5)
    stand(420, 2600, 1000, floorY + 220, 0.011, 0.25, 17.3, -7)
    stand(950, 3800, 1500, floorY + 380, 0.007, 0.3, 20.5, -8)
    stand(250, 1200, 200, floorY - 90, 0.03, 0.85, 23.7, -4, [floorY - 34, floorY - 18])
    // the old flat void disc goes: the smoke is the void now
    room.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.kind === 'ground') m.visible = false })
  }
  // lightning: a strike every 6 to 14 s at a random spot in the clouds, 200 to 400 ms, sometimes a second strike right after
  flash = 0
  private nextStrike = 4
  private strikeT = -1
  private strikeLen = 0.3
  private second = false
  readonly flashAt = new THREE.Vector3()
  update(t: number): void {
    if (t >= this.nextStrike && this.strikeT < 0) {
      this.strikeT = t; this.strikeLen = 0.2 + Math.random() * 0.2; this.second = Math.random() < 0.35
      this.flashAt.set(20 + Math.random() * 120, 20 + Math.random() * 50, -80 + Math.random() * 160)
      this.nextStrike = t + 6 + Math.random() * 8
    }
    let f = 0
    if (this.strikeT >= 0) {
      const e = (t - this.strikeT) / this.strikeLen
      f = e < 1 ? Math.pow(1 - e, 1.6) * (e < 0.08 ? e / 0.08 : 1) : 0
      if (this.second && e > 0.45 && e < 0.75) f = Math.max(f, Math.pow(1 - (e - 0.45) / 0.3, 1.4) * 0.8)
      if (e >= 1) this.strikeT = -1
    }
    this.flash = f
    for (const m of this.materials) { m.uniforms.time.value = t; m.uniforms.flash.value = f; (m.uniforms.flashAt.value as THREE.Vector3).copy(this.flashAt) }
  }
  set(on: boolean): void { this.group.visible = on }
}
