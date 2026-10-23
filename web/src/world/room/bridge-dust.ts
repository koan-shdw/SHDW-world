import * as THREE from 'three'

export const BRIDGE_DUST_SECONDS = 12
export interface DustRelease { position: THREE.Vector3; velocity: THREE.Vector3; start: number; size: number }

/** Distant chips disperse into a few soft wisps that retain their direction of travel. */
export class BridgeDust extends THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  constructor(readonly releases: readonly DustRelease[], time: { value: number }) {
    const geometry = new THREE.BufferGeometry()
    const positions: number[] = [], velocities: number[] = [], spreads: number[] = [], lives: number[] = [], seeds: number[] = []
    releases.forEach((release, i) => {
      for (let c = 0; c < 3; c++) {
        const angle = i * 2.399963 + c * Math.PI * 2 / 3
        positions.push(...release.position.toArray()); velocities.push(...release.velocity.toArray())
        spreads.push(Math.cos(angle) * 0.12, Math.sin(angle) * 0.07, Math.sin(angle) * 0.12)
        lives.push(release.start, Math.max(0.04, release.size) * (1.2 + c * 0.2)); seeds.push(i * 0.73 + c * 2.1)
      }
    })
    for (const [name, values, size] of [
      ['position', positions, 3], ['dustVelocity', velocities, 3], ['dustSpread', spreads, 3], ['dustLife', lives, 2], ['dustSeed', seeds, 1],
    ] as [string, number[], number][]) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uHeight: { value: 720 }, uDuration: { value: BRIDGE_DUST_SECONDS }, uColor: { value: new THREE.Color(0x98a0aa) } },
      transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
      vertexShader: `
        uniform float uTime, uHeight, uDuration;
        attribute vec3 dustVelocity, dustSpread;
        attribute vec2 dustLife;
        attribute float dustSeed;
        varying float vAge, vSeed;
        void main() {
          vAge = uTime - dustLife.x; vSeed = dustSeed;
          float age = clamp(vAge, 0.0, uDuration);
          vec3 drift = position + dustVelocity * age + dustSpread * (1.0 - exp(-age * 0.3));
          vec4 view = modelViewMatrix * vec4(drift, 1.0);
          gl_Position = projectionMatrix * view;
          float diameter = dustLife.y + age * 0.024;
          gl_PointSize = clamp(diameter * projectionMatrix[1][1] * uHeight * 0.5 / max(0.01, -view.z), 1.0, 64.0);
          if (vAge < 0.0 || vAge >= uDuration) gl_PointSize = 1.0;
        }`,
      fragmentShader: `
        uniform float uDuration;
        uniform vec3 uColor;
        varying float vAge, vSeed;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x), mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          if (vAge < 0.0 || vAge >= uDuration) discard;
          vec2 p = gl_PointCoord - 0.5;
          float soft = 1.0 - smoothstep(0.05, 0.5, length(p));
          float wisps = 0.55 + 0.45 * noise(p * 7.0 + vec2(vSeed, vAge * 0.12));
          float alpha = soft * soft * wisps * smoothstep(0.0, 0.5, vAge) * (1.0 - smoothstep(2.0, uDuration, vAge)) * 0.22;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }`,
    })
    super(geometry, material)
    this.name = 'bridge dust'; this.frustumCulled = false
    const viewport = new THREE.Vector2()
    this.onBeforeRender = renderer => { material.uniforms.uHeight.value = renderer.getDrawingBufferSize(viewport).y }
  }

  dispose(): void { this.geometry.dispose(); this.material.dispose() }
}
