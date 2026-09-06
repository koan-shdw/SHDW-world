// P4 gate 1: the library, hold-walk-look-click hanging, the HANG widget, layouts (docs/ART.md §1-4, §6).
import * as THREE from 'three'
import { type Level, type Wall, wallLength, wallDir, wallPoint, floorOf } from '../room/level'
import type { Walker } from '../walk'
import type { Loader } from '../loader'
import type { Feel } from '../feel'

export type SnapLine = 'top' | 'centre' | 'bottom' | 'free'
export type Kind = 'painting' | 'sculpture'
export interface Plinth { w: number; d: number; h: number; colour: string }
export interface TexPick { name: string; cm: number }
/** the look of a sculpture: tint, tile, plinth (null = no plinth). Defaults live on the ArtItem, each placed copy keeps its own */
export interface SculptLook { colour: string; texture: TexPick | null; plinth: Plinth | null }
export interface ArtItem { id: string; kind: Kind; title: string; file?: string; data?: string; model?: string; thumb?: string; w: number; h: number; d: number; edge: string; colour?: string; texture?: TexPick | null; plinth?: Plinth | null }
export interface Placed { id: string; art: string; kind: Kind; wall: string; level: string; u: number; topY: number; snap: SnapLine | null; pos?: [number, number, number]; yaw?: number; colour?: string; texture?: TexPick | null; plinth?: Plinth | null }
export const TEXTURE_CHIPS: { name: string; tile: string | null }[] = [
  { name: 'none', tile: null }, { name: 'concrete', tile: 'concrete' }, { name: 'plaster', tile: 'wall-white' }, { name: 'plywood', tile: 'plywood' },
  { name: 'steel', tile: 'steel-black' }, { name: 'corten', tile: 'corten' }, { name: 'slate', tile: 'slate' }, { name: 'checker', tile: 'checker' },
]
export const defaultPlinth = (): Plinth => ({ w: 40, d: 40, h: 100, colour: '#f4f4f0' })
export interface Guides { snap: SnapLine; top: number; centre: number; bottom: number; gap: number; show: boolean }
export interface Layout { format: 'koan-hang-layout/2'; name: string; guides: Guides; items: Placed[]; art?: ArtItem[] }

const DRAFT_KEY = 'koan-hang-draft'
const DB_NAME = 'koan-hang', STORE = 'art'

/** local art (his dropped images) lives in IndexedDB: data URLs are too big for localStorage */
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE) }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error) }) } catch { return undefined }
}
async function idbSet(key: string, val: unknown): Promise<void> {
  try { const db = await idb(); await new Promise<void>((res, rej) => { const q = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key); q.onsuccess = () => res(); q.onerror = () => rej(q.error) }) } catch { /* private mode: the session keeps it in memory */ }
}

export interface HangHit { wall: Wall; u: number; y: number; point: THREE.Vector3; dist: number }
export interface FloorHit { point: THREE.Vector3; dist: number }
export interface Preview { hit: HangHit | null; floor?: FloorHit | null; u0: number; top: number; ok: boolean; why: string }

const defaultGuides = (): Guides => ({ snap: 'top', top: 200, centre: 150, bottom: 100, gap: 10, show: true })

export class ArtSystem {
  library: ArtItem[] = []
  layout: Layout = { format: 'koan-hang-layout/2', name: 'shdw-world-layout', guides: defaultGuides(), items: [] }
  held: ArtItem | null = null
  selected: string | null = null                 // a hung work picked with Tab: glows, takes delete / arrows / e
  hands = true                                    // the held work shows in your hands until a wall takes it (H toggles)
  static REACH = 3.0                              // metres: only works this close can be grabbed
  mode: 'walk' | 'hang' | 'level' = 'walk'
  preview: Preview = { hit: null, u0: 0, top: 0, ok: false, why: '' }
  onChange: (() => void) | null = null          // library or layout changed: cards redraw
  /** the room's BVH: distance to the nearest wall along a ray, so a work behind a wall is not 'looked at' */
  occluder: ((origin: THREE.Vector3, dir: THREE.Vector3, far: number) => number | null) | null = null
  /** the room's BVH again: where the crosshair ray meets a floor (point + face normal y) */
  floorRay: ((origin: THREE.Vector3, dir: THREE.Vector3, far: number) => { point: THREE.Vector3; ny: number; dist: number } | null) | null = null
  /** the app's tiles for the texture chips, by MAPS name */
  tileLoader: ((name: string) => Promise<THREE.Texture>) | null = null
  heldYaw = 0                                     // R turns the held sculpture 15 degrees
  private models = new Map<string, THREE.Group>()
  private modelPending = new Set<string>()
  private tiles = new Map<string, THREE.Texture>()
  onModel: ((a: ArtItem, g: THREE.Group) => void) | null = null   // a model landed: thumbnail time
  feel: Feel | null = null                                          // the response envelope (GAME.md §1)
  sfx: ((name: string, at?: THREE.Vector3) => void) | null = null
  static CONE = THREE.MathUtils.degToRad(10)                        // forgiving aim: the nearest touchable inside this cone
  private lastHit: string | null = null                             // the wall / floor the ghost is on, for the snap moment
  private handTarget = new THREE.Vector3(); private handQuat = new THREE.Quaternion(); private handTmp = new THREE.Vector3()
  readonly group = new THREE.Group()              // placed works
  private ghost: THREE.Group | null = null
  private handMesh: THREE.Group | null = null
  private guideLines = new THREE.Group()
  private meshes = new Map<string, THREE.Group>()
  private textures = new Map<string, THREE.Texture>()
  private undo: string[] = []; private redo: string[] = []
  private base: string
  private local: ArtItem[] = []
  private seq = 0
  lastImportDropped = 0

  constructor(private lv: Level, private scene: THREE.Scene, private walker: Walker, private camera: THREE.Camera, base: string, private loader: Loader) {
    this.base = base
    scene.add(this.group, this.guideLines)
  }

  // ---- library ----------------------------------------------------------------------------
  async load(): Promise<void> {
    let repo: ArtItem[] = []
    try { const r = await fetch(`${this.base}art/index.json`); if (r.ok) repo = ((await r.json()).items ?? []).map((i: ArtItem) => ({ ...i, kind: i.kind ?? 'painting', edge: i.edge ?? 'wrap' })) } catch { /* no repo art yet */ }
    this.local = (await idbGet<ArtItem[]>('items')) ?? []
    this.library = [...repo, ...this.local]
    try { const d = localStorage.getItem(DRAFT_KEY); if (d) { const j = JSON.parse(d) as Layout; if (j.format === 'koan-hang-layout/2') this.layout = { ...j, guides: { ...defaultGuides(), ...j.guides } } } } catch { /* fresh */ }
    this.rebuild(); this.onChange?.()
  }
  /** his dropped image: title + h w d in cm; the image travels as a data URL */
  async addLocal(item: Omit<ArtItem, 'id' | 'kind'> & { data: string; kind?: Kind }): Promise<ArtItem> {
    const id = `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'work'}-${Date.now().toString(36)}`
    const a: ArtItem = { ...item, id, kind: item.kind ?? 'painting', edge: item.edge ?? 'wrap' }
    if (a.kind === 'sculpture') { a.model = a.data; a.data = undefined; a.colour = a.colour ?? '#f2f2ee'; a.texture = a.texture ?? null; a.plinth = a.plinth === undefined ? defaultPlinth() : a.plinth }
    this.local.push(a); this.library.push(a)
    await idbSet('items', this.local)
    this.onChange?.()
    return a
  }
  async removeLocal(id: string): Promise<void> {
    this.local = this.local.filter((a) => a.id !== id); this.library = this.library.filter((a) => a.id !== id)
    this.layout.items = this.layout.items.filter((p) => p.art !== id)
    await idbSet('items', this.local); this.rebuild(); this.autosave(); this.onChange?.()
  }
  updateLocal(id: string, patch: Partial<ArtItem>): void {
    const a = this.library.find((x) => x.id === id); if (!a) return
    Object.assign(a, patch); void idbSet('items', this.local); this.textures.delete(id); this.rebuild(); this.onChange?.()
  }
  placedCount(artId: string): number { return this.layout.items.filter((p) => p.art === artId).length }

  /** the work's image, decoded in the loader's worker; the material gets it the moment it lands, no rebuild */
  private texture(a: ArtItem): THREE.Texture {
    let t = this.textures.get(a.id)
    if (!t) {
      const holder = new THREE.Texture(); holder.colorSpace = THREE.SRGBColorSpace; holder.anisotropy = 8; holder.flipY = false
      this.textures.set(a.id, holder); t = holder
      this.loader.image(a.data ?? `${this.base}art/${a.file}`, 'art', { anisotropy: 8 }).then((tex) => {
        holder.image = tex.image; holder.generateMipmaps = true; holder.minFilter = THREE.LinearMipmapLinearFilter; holder.needsUpdate = true
      }).catch((e) => console.warn(`art image failed: ${a.title}`, e))
    }
    return t
  }
  /** the prepared GLB for a sculpture, cached; a placeholder box until it lands */
  private model(a: ArtItem): THREE.Group | null {
    const g = this.models.get(a.id); if (g) return g
    if (!this.modelPending.has(a.id)) {
      this.modelPending.add(a.id)
      const src = a.model && (a.model.startsWith('data:') || a.model.startsWith('blob:')) ? a.model : `${this.base}art/${a.model}`
      this.loader.model(src, 'art').then((scene) => { this.models.set(a.id, scene); this.modelPending.delete(a.id); this.onModel?.(a, scene); this.rebuild(); if (this.held?.id === a.id) this.hold(a) })
        .catch((e) => { console.warn(`model failed: ${a.title}`, e); this.modelPending.delete(a.id) })
    }
    return null
  }
  private tile(name: string, cm: number): THREE.Texture | null {
    const chip = TEXTURE_CHIPS.find((c) => c.name === name); if (!chip?.tile || !this.tileLoader) return null
    let t = this.tiles.get(chip.tile)
    if (!t) {
      t = new THREE.Texture(); this.tiles.set(chip.tile, t)
      const key = chip.tile
      this.tileLoader(key).then((tex) => { this.tiles.set(key, tex); this.rebuild() }).catch(() => undefined)
    }
    const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.setScalar(100 / Math.max(5, cm)); c.needsUpdate = true
    return c
  }
  /** a sculpture: the model tinted and tiled, standing on its plinth (or the floor). Local origin = the plinth's floor centre */
  private sculptMesh(a: ArtItem, look: SculptLook, ghost = false): THREE.Group {
    const g = new THREE.Group()
    const ph = look.plinth ? look.plinth.h / 100 : 0
    if (look.plinth) {
      const pm = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.plinth.colour), roughness: 0.9 })
      const box = new THREE.Mesh(new THREE.BoxGeometry(look.plinth.w / 100, ph, look.plinth.d / 100), pm)
      box.position.y = ph / 2; box.userData = { kind: 'plinth' }; g.add(box)
    }
    const src = this.model(a)
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.colour), roughness: 0.85, metalness: look.texture?.name === 'steel' || look.texture?.name === 'checker' ? 0.5 : 0 })
    if (look.texture) { const t = this.tile(look.texture.name, look.texture.cm); if (t) mat.map = t }
    if (src) {
      const m = src.clone(true)
      const box = new THREE.Box3().setFromObject(m); const size = new THREE.Vector3(); box.getSize(size)
      const k = size.y > 0 ? (a.h / 100) / size.y : 1     // typed height rules, aspect kept
      m.scale.setScalar(k); m.position.set(-(box.min.x + box.max.x) / 2 * k, ph - box.min.y * k, -(box.min.z + box.max.z) / 2 * k)
      m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.material = mat; mm.castShadow = true } })
      g.add(m)
    } else {
      const ph2 = new THREE.Mesh(new THREE.BoxGeometry(a.w / 100, a.h / 100, a.d / 100), mat); ph2.position.y = ph + a.h / 200; g.add(ph2)
    }
    if (ghost) g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.transparent = true; mm.opacity = 0.6; mm.depthWrite = false; m.material = mm } })
    return g
  }
  lookOf(a: ArtItem, p?: Placed | null): SculptLook {
    return { colour: p?.colour ?? a.colour ?? '#f2f2ee', texture: p?.texture !== undefined ? p.texture : (a.texture ?? null), plinth: p?.plinth !== undefined ? p.plinth : (a.plinth === undefined ? defaultPlinth() : a.plinth) }
  }
  /** a painting: a box w × h × d, the image on the front, the edge per `edge` */
  private meshFor(a: ArtItem, ghost = false, p?: Placed | null): THREE.Group {
    if (a.kind === 'sculpture') return this.sculptMesh(a, this.lookOf(a, p), ghost)
    const w = a.w / 100, h = a.h / 100, d = Math.max(0.005, a.d / 100)
    const tex = this.texture(a)
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 })
    const edgeM = a.edge === 'wrap' ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 })
      : new THREE.MeshStandardMaterial({ color: a.edge === 'white' ? 0xf4f4f0 : new THREE.Color(a.edge), roughness: 0.8 })
    const back = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 })
    const mats = [edgeM, edgeM, edgeM, edgeM, front, back]   // +x -x +y -y +z -z: the image faces +z
    const g = new THREE.Group()
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats)
    m.position.z = d / 2      // the back face sits on the wall plane
    m.userData = { kind: 'art' }
    g.add(m)
    if (ghost) for (const mm of mats) { mm.transparent = true; mm.opacity = 0.6; mm.depthWrite = false }
    return g
  }
  private placeMesh(g: THREE.Group, w: Wall, uc: number, yc: number): void {
    const [dx, dz] = wallDir(w)
    g.position.copy(wallPoint(w, uc, yc, 0))
    // local +z must point off the wall into the room: the wall's facing normal
    const n = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[w.facing] as [number, number]
    g.rotation.y = Math.atan2(n[0], n[1])
    void dx; void dz
  }

  // ---- layout --------------------------------------------------------------------------------
  rebuild(): void {
    this.layout.items = this.layout.items.filter((p) => this.library.some((a) => a.id === p.art))   // an item whose work is gone is dropped, never crashes the room
    this.group.clear()   // every placed mesh, whatever the map says
    this.meshes.clear()
    for (const p of this.layout.items) {
      const a = this.library.find((x) => x.id === p.art); if (!a) continue
      if (a.kind === 'sculpture') {
        if (!p.pos) continue
        const g = this.meshFor(a, false, p); g.position.set(p.pos[0], p.pos[1], p.pos[2]); g.rotation.y = p.yaw ?? 0
        g.userData = { placed: p.id }; this.group.add(g); this.meshes.set(p.id, g); continue
      }
      const w = this.lv.walls.find((x) => x.id === p.wall)
      if (!w) continue
      const g = this.meshFor(a)
      const floorY = floorOf(this.lv, p.level).floorY
      this.placeMesh(g, w, p.u + a.w / 200, floorY + p.topY - a.h / 200)
      g.userData = { placed: p.id }
      this.group.add(g); this.meshes.set(p.id, g)
    }
    this.drawGuides()
  }
  private snapshot(): string { return JSON.stringify({ items: this.layout.items, guides: this.layout.guides }) }
  private commit(): void { this.undo.push(this.snapshot()); if (this.undo.length > 100) this.undo.shift(); this.redo = [] }
  private restore(s: string): void { const j = JSON.parse(s); this.layout.items = j.items; this.layout.guides = j.guides; this.rebuild(); this.autosave(); this.onChange?.() }
  doUndo(): boolean { const s = this.undo.pop(); if (!s) return false; this.redo.push(this.snapshot()); this.restore(s); return true }
  doRedo(): boolean { const s = this.redo.pop(); if (!s) return false; this.undo.push(this.snapshot()); this.restore(s); return true }
  autosave(): void { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(this.layout)) } catch { /* private */ } }
  /** the file Yozo sends back: the layout plus every local image it uses (data URLs), under 2 MB each */
  exportFile(): { name: string; json: string; skipped: string[] } {
    const used = new Set(this.layout.items.map((p) => p.art))
    const skipped: string[] = []
    const art = this.local.filter((a) => used.has(a.id)).filter((a) => { const ok = Math.max(a.data?.length ?? 0, a.model?.length ?? 0) < 2_000_000 * 1.37; if (!ok) skipped.push(a.title); return ok })
    const out: Layout = { ...this.layout, art }
    return { name: `${this.layout.name || 'layout'}.json`, json: JSON.stringify(out, null, 1), skipped }
  }
  async importFile(text: string): Promise<{ works: number; art: number }> {
    const j = JSON.parse(text) as Layout
    if (j.format !== 'koan-hang-layout/2' && (j as { format: string }).format !== 'koan-hang-layout/1') throw new Error('not a KOAN.hang layout')
    let added = 0
    for (const a of j.art ?? []) if (!this.library.find((x) => x.id === a.id)) { this.local.push(a); this.library.push(a); added++ }
    if (added) await idbSet('items', this.local)
    this.commit()
    const seen = new Set<string>(); const seenArt = new Set<string>(); let dropped = 0
    const once = (j.items ?? []).filter((p) => { if (seenArt.has(p.art)) { dropped++; return false } seenArt.add(p.art); return true })
    this.lastImportDropped = dropped
    this.layout = { format: 'koan-hang-layout/2', name: j.name || 'layout', guides: { ...defaultGuides(), ...(j.guides ?? {}) }, items: once.map((p) => { let id = p.id || `p-${(this.seq++).toString(36)}`; while (seen.has(id)) id = `${id}-${(this.seq++).toString(36)}`; seen.add(id); return { ...p, id, kind: p.kind ?? 'painting', level: p.level ?? 'ground', snap: p.snap ?? null } }) }
    this.rebuild(); this.autosave(); this.onChange?.()
    return { works: this.layout.items.length, art: added }
  }
  clearDraft(): void { this.commit(); this.layout.items = []; this.rebuild(); this.autosave(); this.onChange?.() }
  setGuides(patch: Partial<Guides>): void {
    this.commit()
    Object.assign(this.layout.guides, patch)
    // works snapped to a moved line move with it
    for (const p of this.layout.items) {
      const a = this.library.find((x) => x.id === p.art); if (!a || !p.snap || p.snap === 'free') continue
      p.topY = this.topFor(p.snap, a.h)
    }
    this.rebuild(); this.autosave(); this.onChange?.()
  }
  /** top of the work in metres above the floor for a snap line and a work height in cm */
  private topFor(snap: SnapLine, hcm: number): number {
    const g = this.layout.guides
    return snap === 'top' ? g.top / 100 : snap === 'centre' ? g.centre / 100 + hcm / 200 : g.bottom / 100 + hcm / 100
  }

  // ---- holding and placing ------------------------------------------------------------------
  /** GAME.md §0 law 1: one of each. A work on the wall stays on the wall until you touch it there */
  isPlaced(id: string): boolean { return this.layout.items.some((p) => p.art === id) }
  hold(a: ArtItem | null): void {
    if (a && this.isPlaced(a.id)) return
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null }
    if (this.handMesh) { this.scene.remove(this.handMesh); this.handMesh = null }
    this.lastHit = null
    this.held = a
    if (a) {
      this.ghost = this.meshFor(a, true); this.ghost.visible = false; this.scene.add(this.ghost)
      // in your hands: lower right of the view, scaled so the long side is 35 cm, tilted a touch
      const hm = this.meshFor(a); const k = 0.35 / Math.max(a.w, a.h, a.kind === 'sculpture' ? a.h + (this.lookOf(a).plinth?.h ?? 0) : 0) * 100
      hm.scale.setScalar(k); hm.visible = false; this.scene.add(hm); this.handMesh = hm   // in the scene, lagging the camera (GAME.md: alive in the hand)
      this.handTarget.set(0.26, a.kind === 'sculpture' ? -0.32 : -0.2, -0.62)
      this.placeHand(1); this.feel?.handsIn(hm, hm.position.y); this.sfx?.('pick')
    }
    this.onChange?.()
  }
  /** the hands view: a camera-relative rest point, followed with a lag, swaying with the walk */
  private placeHand(k: number, sway = 0): void {
    const hm = this.handMesh; if (!hm) return
    this.handTmp.copy(this.handTarget); this.handTmp.y += Math.sin(sway) * 0.006; this.handTmp.x += Math.cos(sway * 0.5) * 0.004
    this.handTmp.applyMatrix4(this.camera.matrixWorld)
    hm.position.lerp(this.handTmp, k)
    this.handQuat.copy(this.camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, -0.45, 0.06)))
    hm.quaternion.slerp(this.handQuat, k)
  }
  /** Tab: the next hung work becomes the selected one (glows); after the last, none */
  selectNext(): Placed | null {
    const ids = this.layout.items.map((p) => p.id)
    if (!ids.length) { this.selected = null; return null }
    const i = this.selected ? ids.indexOf(this.selected) : -1
    this.selected = i + 1 < ids.length ? ids[i + 1] : null
    return this.layout.items.find((p) => p.id === this.selected) ?? null
  }
  /** the work a key acts on: the Tab-selected one, else the one under the crosshair within reach */
  target(): Placed | null { return (this.selected && this.layout.items.find((p) => p.id === this.selected)) || this.lookedAt() }
  private glow(): void {
    const look = this.selected ? null : this.lookedAt()
    for (const [id, g] of this.meshes) {
      // the glow sits on the edges and back, never on the image: selected = bright, looked at = faint
      const e = id === this.selected ? 0.3 : look && id === look.id ? 0.07 : 0
      g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const mm of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) { if (mm.map) continue; mm.emissive.setRGB(0, e, e * 0.62) } })
    }
  }
  swap(step: number): void {
    if (!this.library.length) return
    const i = this.held ? this.library.findIndex((x) => x.id === this.held!.id) : -1
    this.hold(this.library[((i + step) % this.library.length + this.library.length) % this.library.length])
  }
  hangWalls(): Wall[] { return this.lv.walls.filter((w) => w.hang !== false && w.draw !== false) }

  /** the hang wall under the crosshair: a ray against each hang wall's front face plane */
  hitWall(): HangHit | null {
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir)
    const o = this.camera.position
    let best: HangHit | null = null
    for (const w of this.hangWalls()) {
      const n = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[w.facing] as [number, number]
      const denom = dir.x * n[0] + dir.z * n[1]
      if (denom >= -1e-6) continue   // the face must look at us
      const t = ((w.a[0] - o.x) * n[0] + (w.a[1] - o.z) * n[1]) / denom
      if (t <= 0 || t > 12) continue
      const p = new THREE.Vector3(o.x + dir.x * t, o.y + dir.y * t, o.z + dir.z * t)
      const [dx, dz] = wallDir(w); const L = wallLength(w)
      const u = (p.x - w.a[0]) * dx + (p.z - w.a[1]) * dz
      if (u < 0 || u > L || p.y < w.baseY || p.y > w.topY) continue
      if (!best || t < best.dist) best = { wall: w, u, y: p.y, point: p, dist: t }
    }
    return best
  }
  /** where the held work would go, and whether it may: inside the wall, off openings and no-hang strips, off other works */
  private plan(a: ArtItem, hit: HangHit, level: string): Preview {
    const w = hit.wall, L = wallLength(w), W = a.w / 100, H = a.h / 100, g = this.layout.guides
    const floorY = floorOf(this.lv, level).floorY
    let u0 = hit.u - W / 2
    let top = g.snap === 'free' ? hit.y + H / 2 : floorY + this.topFor(g.snap, a.h)
    // gap snap: an edge `gap` from a neighbour on this wall, and the wall's centre
    const gap = g.gap / 100
    const others = this.layout.items.filter((p) => p.wall === w.id).flatMap((p) => { const b = this.library.find((x) => x.id === p.art); return b ? [{ u0: p.u, u1: p.u + b.w / 100 }] : [] })
    for (const o of others) {
      if (Math.abs(u0 - (o.u1 + gap)) < 0.15) u0 = o.u1 + gap
      if (Math.abs(u0 + W - (o.u0 - gap)) < 0.15) u0 = o.u0 - gap - W
    }
    if (Math.abs(u0 + W / 2 - L / 2) < 0.10) u0 = L / 2 - W / 2
    const u1 = u0 + W, bottom = top - H
    let why = ''
    if (u0 < 0.02 || u1 > L - 0.02) why = 'off the wall'
    else if (top > w.topY - 0.02) why = 'above the wall'
    else if (bottom < floorY + 0.02) why = 'into the floor'
    else {
      const bt = bottom - w.baseY, tp = top - w.baseY
      for (const o of w.openings) if (o.kind !== 'panel' && u1 > o.u && u0 < o.u + o.w && tp > o.bottom && bt < o.bottom + o.h) { why = `over the ${o.kind}`; break }
      if (!why) for (const s of w.noHang) if (u1 > s.u && u0 < s.u + s.w) { why = 'no-hang strip'; break }
      if (!why) for (const p of this.layout.items.filter((p) => p.wall === w.id)) {
        const b = this.library.find((x) => x.id === p.art); if (!b) continue
        const pf = floorOf(this.lv, p.level).floorY
        const ptop = pf + p.topY, pbot = ptop - b.h / 100
        if (u1 > p.u && u0 < p.u + b.w / 100 && top > pbot && bottom < ptop) { why = 'over another work'; break }
      }
    }
    return { hit, u0, top, ok: !why, why }
  }
  /** every frame in hang mode: move the ghost and the guides */
  update(dt = 0.016, sway = 0): void {
    const active = this.mode === 'hang' && this.walker.state.locked
    if (this.handMesh) this.placeHand(1 - Math.exp(-dt / 0.09), sway)
    this.guideLines.visible = this.mode === 'hang' && this.layout.guides.show
    if (active) this.glow()
    if (!this.ghost || !this.held) { this.preview = { hit: null, u0: 0, top: 0, ok: false, why: '' }; return }
    if (this.held.kind === 'sculpture') { this.updateSculpt(active); return }
    const hit = active ? this.hitWall() : null
    if (this.handMesh) this.handMesh.visible = active && this.hands && !hit
    const hitKey = hit ? hit.wall.id : null
    if (hitKey !== this.lastHit) { this.lastHit = hitKey; if (hit) { this.feel?.snap(this.ghost); this.sfx?.('snap', hit.point) } }
    if (!hit) { this.ghost.visible = false; this.preview = { hit: null, u0: 0, top: 0, ok: false, why: '' }; return }
    const pv = this.plan(this.held, hit, this.walker.state.level)
    this.preview = pv
    this.ghost.visible = true
    this.placeMesh(this.ghost, hit.wall, pv.u0 + this.held.w / 200, pv.top - this.held.h / 200)
    this.ghost.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const mm of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) { mm.color.set(pv.ok ? 0xffffff : 0xff6a5a); mm.emissive.set(pv.ok ? 0x000000 : 0x331100) } })
  }
  /** click: hang the held work where the ghost is; or pick up the work under the crosshair when holding nothing */
  place(): 'placed' | 'refused' | 'picked' | 'nothing' {
    if (!this.held) return this.pickup() ? 'picked' : 'nothing'
    const pv = this.preview
    if (this.held.kind === 'sculpture') {
      if (!pv.floor || !pv.ok) { if (this.ghost && pv.floor) { this.feel?.refuse(this.ghost, new THREE.Vector3(1, 0, 0)); this.sfx?.('nope', pv.floor.point) } return 'refused' }
      this.commit()
      const look = this.lookOf(this.held)
      const fp = pv.floor.point
      const sid = `s-${Date.now().toString(36)}-${(this.seq++).toString(36)}`
      this.layout.items.push({ id: sid, art: this.held.id, kind: 'sculpture', wall: '', level: this.walker.state.level, u: 0, topY: 0, snap: null, pos: [fp.x, fp.y, fp.z], yaw: this.ghostYaw(), colour: look.colour, texture: look.texture, plinth: look.plinth })
      this.rebuild(); this.autosave()
      const gm = this.meshes.get(sid); if (gm) this.feel?.land(gm); this.sfx?.('stone', fp)
      this.hold(null)                                           // GAME.md §0 law 2: down means down
      return 'placed'
    }
    if (!pv.hit || !pv.ok) { if (this.ghost && pv.hit) { const [dx, dz] = wallDir(pv.hit.wall); this.feel?.refuse(this.ghost, new THREE.Vector3(dx, 0, dz)); this.sfx?.('nope', pv.hit.point) } return 'refused' }
    this.commit()
    const floorY = floorOf(this.lv, this.walker.state.level).floorY
    const g = this.layout.guides
    const pid = `p-${Date.now().toString(36)}-${(this.seq++).toString(36)}`
    this.layout.items.push({ id: pid, art: this.held.id, kind: 'painting', wall: pv.hit.wall.id, level: this.walker.state.level, u: pv.u0, topY: pv.top - floorY, snap: g.snap === 'free' ? null : g.snap })
    this.rebuild(); this.autosave()
    const gm = this.meshes.get(pid); if (gm) this.feel?.land(gm); this.sfx?.('land', pv.hit.point)
    this.hold(null)                                             // GAME.md §0 law 2: down means down
    return 'placed'
  }
  /** the placed work under the crosshair */
  /** forgiving aim (GAME.md §1): the nearest placed work whose centre sits inside the cone, within reach, not behind a wall */
  lookedAt(): Placed | null {
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir)
    const eye = this.camera.position
    this.group.updateMatrixWorld(true)
    let best: { p: Placed; ang: number } | null = null
    const c = new THREE.Vector3(), to = new THREE.Vector3()
    for (const [id, g] of this.meshes) {
      const p = this.layout.items.find((x) => x.id === id); if (!p) continue
      new THREE.Box3().setFromObject(g).getCenter(c)
      to.copy(c).sub(eye); const d = to.length(); if (d > ArtSystem.REACH + 0.6) continue
      to.divideScalar(d); const ang = Math.acos(THREE.MathUtils.clamp(to.dot(dir), -1, 1))
      const a = this.library.find((x) => x.id === p.art); const half = a ? Math.max(a.w, a.h) / 200 : 0.3
      const cone = ArtSystem.CONE + Math.atan2(half, Math.max(d, 0.3)) * 0.6      // a big work near you is easy to mean
      if (ang > cone) continue
      const wallD = this.occluder?.(eye, to, d)
      if (wallD !== null && wallD !== undefined && wallD < d - 0.15) continue
      if (!best || ang < best.ang) best = { p, ang }
    }
    return best?.p ?? null
  }
  pickup(): boolean {
    const p = this.target(); if (!p) return false
    this.selected = null
    const a = this.library.find((x) => x.id === p.art); if (!a) return false
    this.commit()
    this.layout.items = this.layout.items.filter((x) => x.id !== p.id)
    this.rebuild(); this.autosave(); this.hold(a)
    return true
  }
  remove(): boolean {
    const p = this.target(); if (!p) return false
    this.selected = null
    this.commit(); this.layout.items = this.layout.items.filter((x) => x.id !== p.id)
    const g = this.meshes.get(p.id)
    if (g && this.feel) {
      // the mesh flies toward your lower right and shrinks, then the layout rebuilds without it
      this.meshes.delete(p.id); g.userData = {}
      const toward = new THREE.Vector3(0.35, -0.3, -0.7).applyMatrix4(this.camera.matrixWorld)
      this.sfx?.('whoosh', g.position)
      this.feel.takeDown(g, toward, () => { this.group.remove(g); this.rebuild(); this.onChange?.() })
      this.autosave(); this.onChange?.(); return true
    }
    this.rebuild(); this.autosave(); this.onChange?.(); return true
  }
  /** arrows: slide the looked-at work along its wall or up, in cm */
  nudge(du: number, dy: number): boolean {
    const p = this.target(); if (!p) return false
    this.commit()
    if (p.kind === 'sculpture' && p.pos) {
      const yaw = this.walker.state.yaw; const fwd = [-Math.sin(yaw), -Math.cos(yaw)], right = [Math.cos(yaw), -Math.sin(yaw)]
      p.pos[0] += (right[0] * du + fwd[0] * dy) / 100; p.pos[2] += (right[1] * du + fwd[1] * dy) / 100
      this.rebuild(); this.autosave(); this.onChange?.(); return true
    }
    p.u += du / 100; p.topY += dy / 100; if (dy) p.snap = null
    this.rebuild(); this.autosave(); this.onChange?.(); return true
  }
  /** snap every work on a wall (or all) to the active line */
  snapAll(wallId?: string): number {
    const g = this.layout.guides; if (g.snap === 'free') return 0
    this.commit(); let n = 0
    for (const p of this.layout.items) {
      if (p.kind === 'sculpture' || (wallId && p.wall !== wallId)) continue
      const a = this.library.find((x) => x.id === p.art); if (!a) continue
      p.topY = this.topFor(g.snap, a.h); p.snap = g.snap; n++
    }
    this.rebuild(); this.autosave(); this.onChange?.(); return n
  }
  // ---- sculptures -----------------------------------------------------------------------------
  /** the floor under the crosshair on this level, within 6 m, face pointing up */
  hitFloor(): FloorHit | null {
    if (!this.floorRay) return null
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir)
    const h = this.floorRay(this.camera.position, dir, 6)
    if (!h || h.ny < 0.7) return null
    const fy = floorOf(this.lv, this.walker.state.level).floorY
    if (Math.abs(h.point.y - fy) > 0.2) return null
    return { point: h.point, dist: h.dist }
  }
  private ghostYaw(): number { return this.walker.state.yaw + this.heldYaw }
  private updateSculpt(active: boolean): void {
    const floor = active ? this.hitFloor() : null
    if (this.handMesh) this.handMesh.visible = active && this.hands && !floor
    if (!floor || !this.held || !this.ghost) { if (this.ghost) this.ghost.visible = false; this.preview = { hit: null, floor: null, u0: 0, top: 0, ok: false, why: 'look at the floor' }; return }
    const look = this.lookOf(this.held)
    const r = Math.max(look.plinth?.w ?? this.held.w, look.plinth?.d ?? this.held.d) / 200
    let why = ''
    for (const p of this.layout.items) {
      if (p.kind !== 'sculpture' || !p.pos || p.level !== this.walker.state.level) continue
      const a = this.library.find((x) => x.id === p.art); const r2 = a ? Math.max(p.plinth?.w ?? a.w, p.plinth?.d ?? a.d) / 200 : 0.3
      if (Math.hypot(p.pos[0] - floor.point.x, p.pos[2] - floor.point.z) < r + r2) { why = 'over another work'; break }
    }
    this.preview = { hit: null, floor, u0: 0, top: 0, ok: !why, why }
    this.ghost.visible = true; this.ghost.position.copy(floor.point); this.ghost.rotation.y = this.ghostYaw()
    this.ghost.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mm = m.material as THREE.MeshStandardMaterial; mm.emissive.set(why ? 0x331100 : 0x000000) } })
  }
  /** R: turn the held sculpture, or the selected / looked-at one, by `deg` */
  rotate(deg: number): boolean {
    if (this.held?.kind === 'sculpture') { this.heldYaw += THREE.MathUtils.degToRad(deg); return true }
    const p = this.target(); if (!p || p.kind !== 'sculpture') return false
    this.commit(); p.yaw = (p.yaw ?? 0) + THREE.MathUtils.degToRad(deg); this.rebuild(); this.autosave()
    const g = this.meshes.get(p.id); if (g && this.feel) { g.rotation.y = p.yaw - THREE.MathUtils.degToRad(deg); this.feel.turn(g, p.yaw) }
    this.sfx?.('turn', g?.position); this.onChange?.(); return true
  }
  /** touch menu `swap`: the next library work of the same kind takes this spot (same wall, u, snap; same floor point, yaw) */
  swapInPlace(p: Placed, step: number): ArtItem | null {
    const same = this.library.filter((a) => a.kind === p.kind && (a.id === p.art || !this.isPlaced(a.id))); if (same.length < 2) return null
    const i = same.findIndex((a) => a.id === p.art); const next = same[((i + step) % same.length + same.length) % same.length]
    this.commit(); p.art = next.id
    if (p.kind === 'painting' && p.snap) p.topY = this.topFor(p.snap, next.h)
    if (p.kind === 'sculpture') { p.colour = next.colour ?? p.colour; p.texture = next.texture ?? p.texture; p.plinth = next.plinth === undefined ? p.plinth : next.plinth }
    this.rebuild(); this.autosave(); this.onChange?.(); return next
  }
  /** the sculpture the HANG card's look fields act on: the held one (its defaults) or the targeted placed one */
  focus(): { art: ArtItem; placed: Placed | null } | null {
    if (this.held?.kind === 'sculpture') return { art: this.held, placed: null }
    const p = this.target(); if (!p || p.kind !== 'sculpture') return null
    const a = this.library.find((x) => x.id === p.art); return a ? { art: a, placed: p } : null
  }
  /** picker, texture chips, plinth fields: onto the focused work (and onto the held work's defaults) */
  setLook(patch: Partial<SculptLook>): boolean {
    const f = this.focus(); if (!f) return false
    if (f.placed) { this.commit(); Object.assign(f.placed, patch); this.rebuild(); this.autosave() }
    else { Object.assign(f.art, patch); if (this.local.includes(f.art)) void idbSet('items', this.local); this.hold(f.art) }
    this.onChange?.(); return true
  }
  private drawGuides(): void {
    this.guideLines.clear()
    const g = this.layout.guides
    if (g.snap === 'free') return
    const hcm = this.held?.h ?? 0
    const y = floorOf(this.lv, this.walker.state.level).floorY + (g.snap === 'top' ? g.top / 100 : g.snap === 'centre' ? g.centre / 100 : g.bottom / 100)
    void hcm
    const mat = new THREE.LineDashedMaterial({ color: 0x00ff9f, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8 })
    for (const w of this.hangWalls()) {
      if (y < w.baseY || y > w.topY) continue
      const pts = [wallPoint(w, 0.02, y, 0.005), wallPoint(w, wallLength(w) - 0.02, y, 0.005)]
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); line.computeLineDistances()
      this.guideLines.add(line)
    }
  }
  /** the guides follow the walker's floor */
  onLevelChange(): void { this.drawGuides() }
}

export function readImage(file: File): Promise<{ data: string; w: number; h: number }> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => { const img = new Image(); img.onload = () => res({ data: r.result as string, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => rej(new Error('not an image')); img.src = r.result as string }
    r.onerror = () => rej(r.error); r.readAsDataURL(file)
  })
}
