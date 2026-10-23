// The intro: the red wall stays lit by a spotlight that breathes and flickers. Yozo's words stand opposite the door as a mountain: solid
// upright letters 60 m tall, 400 m out, a column 900 m wide and 1.6 km tall starting below the ground that you crane your neck
// at, lit by the light and the lightning (mountain.ts). Nothing else floats in the yard: he will instruct the rest.
import * as THREE from 'three'
import type { Level } from './room/level'
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

  constructor(lv: Level, base: string) {
    const wall = lv.walls.find((w) => w.id === 'c-5')
    const floorY = lv.levels.find((l) => l.id === 'ground')?.floorY ?? -5.54
    const cx = wall ? (wall.a[0] + wall.b[0]) / 2 : 2.05, wz = wall ? wall.a[1] : -3.12, top = wall ? wall.topY : floorY + 1.75
    const face = wz + (wall?.thickness ?? 0.14) / 2
    const cy = (floorY + top) / 2 + 0.02
    // Keep the existing illumination on the red wall after removing its lettering.
    this.spot = new THREE.SpotLight(0xfff1dc, this.baseIntensity, 8, 0.38, 0.6, 1.3)
    this.spot.position.set(cx + 0.3, top + 1.6, face + 1.7)
    this.spot.target.position.set(cx, cy, face)
    this.spot.castShadow = true; this.spot.shadow.mapSize.set(1024, 1024); this.spot.shadow.bias = -0.0005; this.spot.shadow.camera.near = 0.3; this.spot.shadow.camera.far = 8
    this.group.add(this.spot, this.spot.target)

    // the word of god: Yozo's quote as a column 400 m out opposite the door, upright, its bottom line 250 m below the yard floor (owner: start lower, then 3 lines lower), its top 73° up
    this.mountain = new Mountain(YOZO_QUOTE, 400, floorY - 250, base)
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
