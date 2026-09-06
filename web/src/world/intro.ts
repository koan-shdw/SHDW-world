// The intro (owner 09-06): you start on the far square of the yard. The CULT plate floats 10 cm off the red wall, small, under
// a spotlight that breathes and flickers and throws its shadow. Walking up: "by YOZO · presented by SHDW.gallery" floats
// 50 cm off the wall, in the space; then the controls float on the path; then Yozo's words write themselves in the sky behind
// you; then koan's essay. Everything is a thing in the world, faded by how far you have walked.
import * as THREE from 'three'
import type { Level } from './room/level'
import type { Loader } from './loader'
import { Text3D } from './text3d'

export const YOZO_QUOTE = [
  '“Cult is a pure frenzy prior to mass consumption, a secret faith bound to a singular aesthetic. Once swallowed by the broader market and known to all, true cult status vanishes.',
  'I claim this title now, while my expression retains its unadulterated purity and carries the heat to pierce deeply into chosen hearts.',
  'What lies here is no crowd-pleasing answer, but a whirlpool of obsession born from pushing a specific aesthetic to its absolute limit.”',
  '— Yozo',
]
export const ESSAY = [
  'CULT',
  'Yozo paints with a line so controlled it is mistaken for print, and uses it to depict a world coming apart. Fifteen new paintings, and the artist’s first works in three dimensions, deepen the universe glimpsed in his sold-out 2025 debut, What If: a near-future Tokyo of graffiti and gangs, Y2K futurism and street-level rebellion. The world of post-Shibuya punk.',
  'Narrative seeps in through the worn edges of things: a scuffed panel, a tagged wall, a character who seems to remember events we never see. Each painting stands alone, yet each feels like a single panel from the same vast epic, its continuity felt rather than stated. The artist keeps the borders of this world deliberately open. It is, in his words, “a melting pot of everything I’ve ever loved,” accumulated consciously and subconsciously over a lifetime and pushed to its aesthetic limit.',
  'The title names the stakes. Cult, for Yozo, is a pure frenzy that exists only before mass consumption: a secret faith bound to a singular aesthetic, one that vanishes the moment everyone knows its name. This exhibition claims that title while the claim can still be made. While the work retains its unadulterated purity, and its heat can still pierce deeply into chosen hearts.',
  'What lies here is a whirlpool of obsession. You are early.',
  '— koan',
  'Exhibition inquiries · info@shdw.gallery',
]

interface Block { text: Text3D; measure: 'point' | 'x'; at: THREE.Vector3; far: number; near: number; gone: number; typed: boolean }

export class Intro {
  readonly group = new THREE.Group()
  readonly spot: THREE.SpotLight
  private blocks: Block[] = []
  private sheen: Text3D[] = []
  private baseIntensity = 18

  constructor(lv: Level, loader: Loader, base: string) {
    const wall = lv.walls.find((w) => w.id === 'c-5')
    const floorY = lv.levels.find((l) => l.id === 'ground')?.floorY ?? -5.54
    const cx = wall ? (wall.a[0] + wall.b[0]) / 2 : 2.05, wz = wall ? wall.a[1] : -3.12, top = wall ? wall.topY : floorY + 1.75
    const face = wz + (wall?.thickness ?? 0.14) / 2
    // the plate: 80 % of the wall's width, 10 cm off the face, casting its shadow onto the wall
    const W = 2.3, H = W * 656 / 1034
    const cy = (floorY + top) / 2 + 0.02
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15 })
    const plate = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.012), mat)
    plate.position.set(cx, cy, face + 0.10)
    plate.castShadow = true; plate.userData = { kind: 'intro-plate' }
    this.group.add(plate)
    loader.image(`${base}brand/logo.png`, 'room', { anisotropy: 8 }).then((tex) => { mat.map = tex; mat.needsUpdate = true }).catch(() => undefined)
    // the spotlight: from above and in front, aimed at the plate; it breathes and flickers; it casts the plate's shadow
    this.spot = new THREE.SpotLight(0xfff1dc, this.baseIntensity, 8, 0.38, 0.6, 1.3)
    this.spot.position.set(cx + 0.3, top + 1.6, face + 1.7)
    this.spot.target.position.set(cx, cy, face)
    this.spot.castShadow = true; this.spot.shadow.mapSize.set(1024, 1024); this.spot.shadow.bias = -0.0005; this.spot.shadow.camera.near = 0.3; this.spot.shadow.camera.far = 8
    this.group.add(this.spot, this.spot.target)

    // the words, in the space
    const eye = floorY + 1.6
    const spawn = new THREE.Vector3(6.18, eye, 4.3)
    const faceTo = (m: THREE.Object3D, from: THREE.Vector3) => { const d = from.clone().sub(m.position); m.rotation.y = Math.atan2(d.x, d.z) }
    const title = new Text3D(['by YOZO', 'presented by SHDW.gallery'], { width: 2.8, size: 0.17, align: 'center', shadow: 'rgba(0,0,0,.55)', lineHeight: 1.2 })
    title.mesh.position.set(cx, top + 0.55, face + 0.5); faceTo(title.mesh, spawn)   // above the plate, in front of the hedge
    const controls = new Text3D(['w a s d   walk', 'mouse   look', 'click   hang', 'e   touch', 'esc   settings'], { width: 1.6, size: 0.13, shadow: 'rgba(0,0,0,.55)', lineHeight: 1.4 })
    controls.mesh.position.set(3.4, eye + 0.1, 1.0); faceTo(controls.mesh, spawn)
    // the word of god (owner 09-06): one giant block far opposite the door, taking the whole sky, light moving across it
    // always there, from the first frame (owner): 200 m wide at 150 m, the whole sky opposite the door
    const quote = new Text3D(YOZO_QUOTE, { width: 200, size: 7.5, shadow: 'rgba(0,0,0,.5)', lineHeight: 1.22, weight: 800, sheen: true })
    quote.mesh.position.set(150, eye + 74, 1.0); quote.mesh.rotation.y = -Math.PI / 2
    const essay = new Text3D(ESSAY, { width: 200, size: 4.4, shadow: 'rgba(0,0,0,.5)', lineHeight: 1.22, weight: 700, sheen: true })
    essay.mesh.position.set(150, eye + 74 - quote.height / 2 - essay.height / 2 - 4, 1.0); essay.mesh.rotation.y = -Math.PI / 2
    quote.opacity = 1; essay.opacity = 1
    for (const t of [title, controls, quote, essay]) this.group.add(t.mesh)
    this.sheen = [quote, essay]
    this.blocks = [
      { text: title, measure: 'point', at: new THREE.Vector3(cx, 0, face), far: 8.5, near: 4.2, gone: 1.3, typed: false },
      { text: controls, measure: 'point', at: controls.mesh.position.clone(), far: 4.8, near: 2.8, gone: 1.0, typed: false },
    ]
  }

  /** every frame: the flicker, and each block's presence from how far you have walked */
  update(t: number, walkerPos: { x: number; z: number }): void {
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.7 + 1.3) * 0.3 + Math.sin(t * 29.1 + 2.1) * 0.2
    const drop = Math.sin(t * 0.37) > 0.985 ? 0.55 : 1
    this.spot.intensity = this.baseIntensity * (0.94 + 0.06 * n) * drop
    for (const s of this.sheen) s.update(t)
    for (const b of this.blocks) {
      const d = b.measure === 'x' ? Math.max(0, walkerPos.x - 0.35) : Math.hypot(b.at.x - walkerPos.x, b.at.z - walkerPos.z)
      const inA = THREE.MathUtils.clamp((b.far - d) / (b.far - b.near), 0, 1)
      const outA = b.gone < 0 ? 1 : THREE.MathUtils.clamp((d - b.gone) / Math.max(0.2, (b.near - b.gone) * 0.6), 0, 1)
      const alpha = Math.min(inA, outA)
      b.text.opacity = alpha
      if (b.typed) b.text.draw(inA)
    }
  }
}
