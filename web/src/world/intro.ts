// The intro (owner 09-06/07): you start on the far square of the yard. The CULT letters float 10 cm off the red wall under a
// spotlight that breathes and flickers and throws their shadow. Yozo's words stand opposite the door as a mountain: solid
// upright letters 300 m out, you look up at them, lit by the light and the lightning (mountain.ts). Nothing else floats in
// the yard: he will instruct the rest.
import * as THREE from 'three'
import type { Level } from './room/level'
import type { Loader } from './loader'
import { Mountain } from './mountain'

export const YOZO_QUOTE = [
  '“Cult is a pure frenzy prior to mass consumption, a secret faith bound to a singular aesthetic. Once swallowed by the broader market and known to all, true cult status vanishes.',
  'I claim this title now, while my expression retains its unadulterated purity and carries the heat to pierce deeply into chosen hearts.',
  'What lies here is no crowd-pleasing answer, but a whirlpool of obsession born from pushing a specific aesthetic to its absolute limit.”',
  '— Yozo',
]

export class Intro {
  readonly group = new THREE.Group()
  readonly spot: THREE.SpotLight
  readonly mountain: Mountain
  private baseIntensity = 18

  constructor(lv: Level, loader: Loader, base: string) {
    const wall = lv.walls.find((w) => w.id === 'c-5')
    const floorY = lv.levels.find((l) => l.id === 'ground')?.floorY ?? -5.54
    const cx = wall ? (wall.a[0] + wall.b[0]) / 2 : 2.05, wz = wall ? wall.a[1] : -3.12, top = wall ? wall.topY : floorY + 1.75
    const face = wz + (wall?.thickness ?? 0.14) / 2
    // the letters: the PNG's alpha is the shape (63.7 % of it is clear), 2.07 m wide (80 % of the wall, then 10 % smaller), 10 cm off the face
    const W = 2.07, H = W * 656 / 1034
    const cy = (floorY + top) / 2 + 0.02
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat)
    plate.position.set(cx, cy, face + 0.10)
    plate.castShadow = true; plate.userData = { kind: 'intro-plate' }
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 })   // the shadow is the letters too
    plate.customDepthMaterial = depth
    this.group.add(plate)
    loader.image(`${base}brand/logo.png`, 'room', { anisotropy: 8 }).then((tex) => {
      mat.map = tex; mat.needsUpdate = true          // the map's own alpha is the shape (an alphaMap would read the green channel)
      depth.map = tex; depth.needsUpdate = true
    }).catch(() => undefined)
    // the spotlight: from above and in front, aimed at the letters; it breathes and flickers; it casts their shadow on the red
    this.spot = new THREE.SpotLight(0xfff1dc, this.baseIntensity, 8, 0.38, 0.6, 1.3)
    this.spot.position.set(cx + 0.3, top + 1.6, face + 1.7)
    this.spot.target.position.set(cx, cy, face)
    this.spot.castShadow = true; this.spot.shadow.mapSize.set(1024, 1024); this.spot.shadow.bias = -0.0005; this.spot.shadow.camera.near = 0.3; this.spot.shadow.camera.far = 8
    this.group.add(this.spot, this.spot.target)

    // the word of god: Yozo's quote as a mountain 300 m out opposite the door, upright, its foot 20 m down on the cloud floor
    this.mountain = new Mountain(YOZO_QUOTE, 300, floorY - 20, base)
    this.group.add(this.mountain.group)
  }

  /** every frame: the flicker; the lightning reaches the mountain */
  update(t: number, flash: number, flashAt: THREE.Vector3): void {
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.7 + 1.3) * 0.3 + Math.sin(t * 29.1 + 2.1) * 0.2
    const drop = Math.sin(t * 0.37) > 0.985 ? 0.55 : 1
    this.spot.intensity = this.baseIntensity * (0.94 + 0.06 * n) * drop
    this.mountain.update(t, flash, flashAt)
  }
}
