// The level: level.json v3 types, loading, and the clean geometry built from it at runtime (SPEC v2 s4).
// Walls with openings (windows with grids, doors with leaves and runtime state, panels), floors, ceilings, stairs with
// checker treads / plywood risers / blue stringers, ribs, lights, aircon, wall boxes, pipes, slabs. No scan.
import * as THREE from 'three'

export type Facing = '+x' | '-x' | '+z' | '-z'
export type Dir = Facing
export interface DoorSpec {
  type: 'slide' | 'swing' | 'metal'; open: boolean; toggle: boolean; leaf: boolean
  face?: 'steel' | 'glass' | 'mesh'; swingOut?: boolean; frame?: boolean; hinge?: 'a' | 'b'; leafSide?: 'front' | 'back'
  jambW?: number; frameMaterial?: string | null; panelAbove?: number; recess?: number; leafH?: number | null
}
export interface GridSpec { uprights?: number[]; cols?: number; bars: number[]; cross: number[]; crossAll?: boolean; frostBelow?: number }
export interface Opening { kind: 'door' | 'window' | 'panel'; u: number; w: number; bottom: number; h: number; door?: DoorSpec; grid?: GridSpec; frame?: string; material?: string }
export interface Wall {
  id: string; name: string; level: string
  a: [number, number]; b: [number, number]
  baseY: number; topY: number; thickness: number; facing: Facing
  openings: Opening[]; noHang: { u: number; w: number }[]
  hang?: boolean; material?: string; note?: string; draw?: boolean; src?: string
}
export interface Surface { level: string; name?: string; poly: [number, number][]; material?: string; draw?: boolean }
export interface Stair {
  id: string; level: string; to: string | null; topBlocked?: number; from: [number, number]; dir: Dir
  width: number; run: number; bottomY: number; topY: number; treads: number; riser: number; tread: number; nosing?: number
  material?: string; treadMaterial?: string; riserMaterial?: string
  stringers?: { height: number; thickness: number; material?: string }
  sideWall?: { side: Facing; height: number; thickness?: number; material?: string }
}
export interface Blocker { level: string; poly: [number, number][] }
export type LevelObject =
  | { kind: 'ribs'; level: string; dir: Dir; pitch: number; depth: number; width: number }
  | { kind: 'light'; level: string; at: [number, number]; size: [number, number]; y?: number }
  | { kind: 'rail'; level: string; z: number; x0: number; x1: number; spots: number[] }
  | { kind: 'track'; level: string; rect: [[number, number], [number, number]]; spots: [number, number][] }
  | { kind: 'aircon'; level: string; at: [number, number]; size: [number, number, number] }
  | { kind: 'slab'; name?: string; box: [[number, number, number], [number, number, number]]; material?: string }
  | { kind: 'wallbox'; wall: string; u: number; y: number; w: number; h: number; d: number; material?: string }
  | { kind: 'pipe'; wall: string; u: number; y0: number; y1: number; r: number; d: number; material?: string }
  | { kind: 'pavegrid'; name?: string; area: [[number, number], [number, number]]; skip?: [[number, number], [number, number]]; cell: number; edge: number; lift: number; tileEvery?: number; material?: string; tileMaterial?: string }
  | { kind: 'block'; name?: string; poly: [number, number][]; h: number; src?: string }
  | { kind: 'road'; name?: string; pts: [number, number][]; w: number; src?: string }
  | { kind: 'ground'; r: number; y: number; src?: string }
  | { kind: 'hedge'; name?: string; along: [[number, number], [number, number]]; y: number; r: number; step: number; material?: string }
  | { kind: 'paving'; name?: string; zone: [[number, number], [number, number]]; zoneTop: number; base: number; cells: { box: [[number, number], [number, number]]; material: string; top: number }[] }
export interface LevelFloor { id: string; name: string; floorY: number; ceilY: number; slab?: number; roof?: number }
export interface Ceiling extends Surface { draw?: boolean }
export interface Level {
  format: string
  eyeHeight: number
  spawn?: { level: string; x: number; z: number; yawDeg: number }
  levels: LevelFloor[]
  floors: Surface[]
  ceilings: Ceiling[]
  walls: Wall[]
  stairs: Stair[]
  blockers: Blocker[]
  objects: LevelObject[]
  sky?: { file?: string; fallback?: string }
  fog?: { color: string; near: number; far: number }
}

export async function loadLevel(url: string): Promise<Level> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`level.json: ${r.status} ${r.statusText}`)
  const lv = (await r.json()) as Level
  if (lv.format !== 'koan-hang-level/3') throw new Error(`level.json: unknown format ${lv.format}`)
  lv.ceilings ??= []; lv.blockers ??= []; lv.objects ??= []
  for (const w of lv.walls) for (const o of w.openings) if (o.kind === 'door' && !o.door) o.door = { type: 'swing', open: true, toggle: false, leaf: false }
  return lv
}

export function floorOf(lv: Level, id: string): LevelFloor {
  const f = lv.levels.find((l) => l.id === id)
  if (!f) throw new Error(`no level ${id}`)
  return f
}

// ---- plan helpers ---------------------------------------------------------------
export function wallLength(w: Wall): number { return Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) }
export function wallDir(w: Wall): [number, number] {
  const L = wallLength(w) || 1
  return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L]
}
export function facingNormal(f: Facing): [number, number] {
  switch (f) {
    case '+x': return [1, 0]
    case '-x': return [-1, 0]
    case '+z': return [0, 1]
    case '-z': return [0, -1]
  }
}
export function pointInPoly(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
export function stairRect(s: Stair): { x0: number; x1: number; z0: number; z1: number } {
  const [fx, fz] = s.from, hw = s.width / 2
  switch (s.dir) {
    case '+z': return { x0: fx - hw, x1: fx + hw, z0: fz, z1: fz + s.run }
    case '-z': return { x0: fx - hw, x1: fx + hw, z0: fz - s.run, z1: fz }
    case '+x': return { x0: fx, x1: fx + s.run, z0: fz - hw, z1: fz + hw }
    case '-x': return { x0: fx - s.run, x1: fx, z0: fz - hw, z1: fz + hw }
  }
}
export function stairProgress(s: Stair, x: number, z: number): number {
  const [fx, fz] = s.from
  switch (s.dir) {
    case '+z': return (z - fz) / s.run
    case '-z': return (fz - z) / s.run
    case '+x': return (x - fx) / s.run
    case '-x': return (fx - x) / s.run
  }
}
export function inRect(x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad
}
/** world point of a wall position u (along), y, and offset d in front of the face */
export function wallPoint(w: Wall, u: number, y: number, d = 0): THREE.Vector3 {
  const [dx, dz] = wallDir(w), [nx, nz] = facingNormal(w.facing)
  return new THREE.Vector3(w.a[0] + dx * u + nx * d, y, w.a[1] + dz * u + nz * d)
}

// ---- materials (plain tints now; P3 swaps these for baked textures by name) -----------
const PALETTE: Record<string, { color: number; rough?: number; metal?: number; opacity?: number; emissive?: number }> = {
  'wall-white': { color: 0xf2f2ee, rough: 0.95 },
  'wall-blue': { color: 0x8d9ab5, rough: 0.9 },
  'concrete-polished': { color: 0xb8b3a8, rough: 0.6 },
  'concrete-bare': { color: 0xa9a6a0, rough: 0.95 },
  'concrete-grey': { color: 0x8e8f8d, rough: 0.8 },
  'stone-tiles': { color: 0x9c9a94, rough: 0.95 },
  'corrugated-ceiling': { color: 0xd9d7d2, rough: 0.7, metal: 0.2 },
  'corrugated': { color: 0xc9c8c4, rough: 0.6, metal: 0.4 },
  'concrete': { color: 0xa0a0a0, rough: 0.95 },
  'render': { color: 0xb5aaa0, rough: 0.95 },
  'stair-wood': { color: 0xc49a5a, rough: 0.7 },
  'plywood': { color: 0x9c6a3c, rough: 0.8 },
  'checker': { color: 0x8f9296, rough: 0.45, metal: 0.7 },
  'stringer-blue': { color: 0x2f4f8f, rough: 0.6, metal: 0.3 },
  'stair-nosing': { color: 0x8f9296, rough: 0.5, metal: 0.6 },
  'steel-grey': { color: 0x6e7076, rough: 0.5, metal: 0.6 },
  'steel-black': { color: 0x1c1c1e, rough: 0.5, metal: 0.5 },
  'wood-dark': { color: 0x6b4a2b, rough: 0.8 },
  'glass': { color: 0xa8c8e8, rough: 0.1, metal: 0.1, opacity: 0.18 },
  'block': { color: 0xb9b6b0, rough: 0.95 },
  'road': { color: 0x6f6d6a, rough: 0.95 },
  'ground-plate': { color: 0x232325, rough: 1.0 },
  'glass-frosted': { color: 0xe6e9ea, rough: 0.6, metal: 0.0, opacity: 0.93, emissive: 0x3a3c3e },
  'door-slide': { color: 0xe8e8e4, rough: 0.8 },
  'door-metal': { color: 0x8a8c8f, rough: 0.5, metal: 0.5 },
  'meter-box': { color: 0xf0f0ec, rough: 0.6 },
  'junction-box': { color: 0x9a9c9e, rough: 0.6, metal: 0.3 },
  'pipe-white': { color: 0xe6e6e2, rough: 0.6 },
  'light': { color: 0xffffff, emissive: 0xfff2d8 },
  'aircon': { color: 0xf4f4f2, rough: 0.6, emissive: 0x3a3a38 },
  'rib': { color: 0xc8c6c0, rough: 0.6, metal: 0.3 },
  'gravel': { color: 0x8a8a86, rough: 1 },
  'slate': { color: 0x6f6d74, rough: 1 },
  'concrete-path': { color: 0xb5b2aa, rough: 0.9 },
  'red-tile': { color: 0xa5563a, rough: 0.8 },
  'dirt': { color: 0x6e5a42, rough: 1 },
  'corten': { color: 0x8a3b22, rough: 0.9 },
  'foliage': { color: 0x4f7a3a, rough: 1 },
  'stone': { color: 0x9a968e, rough: 0.9 },
  'corrugated-white': { color: 0xe4e4e0, rough: 0.6, metal: 0.2 },
}
/** P3: the tiles (textures/*.jpg), metres per tile. Courtyard, red wall, dirt, ceiling, frames, stringers: baked from the scan
 *  (textures/make_tiles.py). Floors, walls, treads, risers, doors: stock CC0 from ambientCG (textures/STOCK.md), owner's call 2026-09-03. */
export const MAPS: Record<string, { file: string; tile: number }> = {
  'concrete-path': { file: 'concrete-path.jpg', tile: 2.0 }, 'corten': { file: 'corten.jpg', tile: 1.5 },
  'slate': { file: 'slate.jpg', tile: 0.6 }, 'red-tile': { file: 'red-tile.jpg', tile: 0.6 }, 'concrete': { file: 'concrete.jpg', tile: 1.0 },
  'concrete-polished': { file: 'concrete-floor.jpg', tile: 2.5 }, 'concrete-bare': { file: 'concrete-floor.jpg', tile: 2.5 },
  'concrete-grey': { file: 'concrete-floor.jpg', tile: 2.5 }, 'wall-white': { file: 'wall-white.jpg', tile: 2.0 },
  'corrugated-ceiling': { file: 'corrugated-ceiling.jpg', tile: 1.0 }, 'plywood': { file: 'plywood.jpg', tile: 1.2 },
  'checker': { file: 'checker.jpg', tile: 0.6 }, 'dirt': { file: 'dirt.jpg', tile: 1.0 }, 'door-metal': { file: 'door-metal.jpg', tile: 1.0 },
  'door-slide': { file: 'door-metal.jpg', tile: 1.0 }, 'stringer-blue': { file: 'stringer-blue.jpg', tile: 0.8 },
  'steel-black': { file: 'steel-black.jpg', tile: 0.5 },
}
const texCache = new Map<string, THREE.Texture>()
let texturesOn = false
export type TextureProvider = (file: string) => Promise<THREE.Texture>
/** the textured look: put every tile on its material, or take them all off. `load` is the world's loader (KTX2 first, jpg fallback).
 *  A tile that fails = flat colour + a console line. */
export function applyTextures(on: boolean, load: TextureProvider): void {
  texturesOn = on
  for (const [name, m] of cache) {
    const spec = MAPS[name]; const p = PALETTE[name]
    if (!spec || !p) continue
    if (!on) { m.map = null; m.color.set(p.color); m.needsUpdate = true; continue }
    const cached = texCache.get(name)
    if (cached) { m.map = cached; m.color.set(0xffffff); m.needsUpdate = true; continue }
    load(spec.file).then((tex) => {
      texCache.set(name, tex)
      if (!texturesOn) return
      m.map = tex; m.color.set(0xffffff); m.needsUpdate = true
    }).catch(() => { console.warn(`texture missing: ${spec.file}`); m.map = null; m.color.set(p.color); m.needsUpdate = true })
  }
}
export function texturesAreOn(): boolean { return texturesOn }

/** world-space UVs: every mesh whose material carries a map gets its uv rewritten from world position per face,
 *  so one tile runs in metres across every piece with no seam at piece boundaries. Planar by the face normal's axis. */
export function worldUVs(group: THREE.Group): void {
  group.updateMatrixWorld(true)
  const pos = new THREE.Vector3(), nrm = new THREE.Vector3()
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const name = [...cache.entries()].find(([, mm]) => mm === mats[0])?.[0]
    if (!name || !MAPS[name]) return
    const tile = MAPS[name].tile
    const g = mesh.geometry
    if (!g.attributes.position) return
    if (!g.attributes.normal) g.computeVertexNormals()
    const P = g.attributes.position, N = g.attributes.normal
    const uv = new Float32Array(P.count * 2)
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < P.count; i++) {
      pos.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld)
      nrm.fromBufferAttribute(N, i).applyMatrix3(nm)
      const ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z)
      let u: number, v: number
      if (ay >= ax && ay >= az) { u = pos.x; v = pos.z } else if (ax >= az) { u = pos.z; v = pos.y } else { u = pos.x; v = pos.y }
      uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  })
}

const cache = new Map<string, THREE.MeshStandardMaterial>()
export function mat(name: string): THREE.MeshStandardMaterial {
  let m = cache.get(name)
  if (m) return m
  const p = PALETTE[name] ?? PALETTE['wall-white']
  m = new THREE.MeshStandardMaterial({ color: p.color, roughness: p.rough ?? 0.9, metalness: p.metal ?? 0, side: THREE.DoubleSide }); m.name = name
  if (p.opacity !== undefined) { m.transparent = true; m.opacity = p.opacity; m.depthWrite = false }
  if (p.emissive !== undefined) { m.emissive = new THREE.Color(p.emissive); m.emissiveIntensity = 1.4 }
  cache.set(name, m)
  return m
}

// ---- geometry -------------------------------------------------------------------------
function bbox(poly: [number, number][]): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  return { x0, x1, z0, z1 }
}
/** a box of size (alongWall, height, depth) on a wall at u (centre), y (centre), d (centre offset from the face, + = into the room) */
function wallBox(w: Wall, len: number, h: number, depth: number, u: number, y: number, d: number, material: string): THREE.Mesh {
  const [dx, dz] = wallDir(w)
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, depth), mat(material))
  m.rotation.y = Math.atan2(-dz, dx)
  m.position.copy(wallPoint(w, u, y, d))
  return m
}

export interface DoorRuntime {
  id: string; wall: Wall; opening: Opening; open: boolean; t: number
  pivot: THREE.Object3D; type: DoorSpec['type']; slideDir: 1 | -1
}
export interface Built { group: THREE.Group; wire: THREE.Group; doors: DoorRuntime[]; lights: THREE.PointLight[] }

export function buildLevel(lv: Level): Built {
  const group = new THREE.Group(); group.name = 'level'
  const wire = new THREE.Group(); wire.name = 'level-wire'
  const wireMat = new THREE.LineBasicMaterial({ color: 0x00ff9f, transparent: true, opacity: 0.6 })
  const doors: DoorRuntime[] = []
  const lights: THREE.PointLight[] = []
  const wallById = new Map(lv.walls.map((w) => [w.id, w]))
  const addWire = (g: THREE.BufferGeometry, m: THREE.Mesh) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), wireMat); l.position.copy(m.position); l.rotation.copy(m.rotation); wire.add(l) }

  for (const w of lv.walls) {
    if (w.draw === false) continue   // walk-only entry of a merged line (one skin)
    const L = wallLength(w), H = w.topY - w.baseY, t = w.thickness
    const material = w.material ?? 'wall-white'
    const tag = <M extends THREE.Object3D>(m: M, kind: string): M => { m.userData = { ...m.userData, kind, wall: w.id }; return m }
    // wall columns between openings; boxes below / above each opening
    const cuts = [0, L]
    for (const o of w.openings) cuts.push(Math.max(0, o.u), Math.min(L, o.u + o.w))
    cuts.sort((p, q) => p - q)
    for (let i = 0; i + 1 < cuts.length; i++) {
      const u0 = cuts[i], u1 = cuts[i + 1]
      if (u1 - u0 < 1e-4) continue
      const um = (u0 + u1) / 2
      // every opening over this column (one skin stacks them): solid wall only in the vertical gaps between them
      const over = w.openings.filter((op) => um > op.u && um < op.u + op.w).sort((p, q) => p.bottom - q.bottom)
      const spans: [number, number][] = []
      let yCur = 0
      for (const op of over) { if (op.bottom - yCur > 1e-3) spans.push([yCur, op.bottom]); yCur = Math.max(yCur, op.bottom + op.h) }
      if (H - yCur > 1e-3) spans.push([yCur, H])
      for (const [y0, y1] of spans) {
        const m = tag(wallBox(w, u1 - u0, y1 - y0, t, um, w.baseY + (y0 + y1) / 2, -t / 2, material), 'wall')
        group.add(m); addWire(m.geometry, m)
      }
    }
    // corner posts: where a window or door reaches a wall end, fill the corner volume behind the neighbouring wall's face
    const ops = w.openings.filter((o) => o.kind !== 'panel')
    const ps = t - 0.02
    if (ops.some((o) => o.u < t + 0.011)) group.add(tag(wallBox(w, ps, H - 0.02, ps, -t / 2, w.baseY + H / 2, -t / 2, material), 'post'))
    if (ops.some((o) => o.u + o.w > L - t - 0.011)) group.add(tag(wallBox(w, ps, H - 0.02, ps, L + t / 2, w.baseY + H / 2, -t / 2, material), 'post'))
    for (const o of w.openings) {
      const uc = o.u + o.w / 2, yc = w.baseY + o.bottom + o.h / 2
      if (o.kind === 'panel') {
        group.add(wallBox(w, o.w, o.h, t, uc, yc, -t / 2, o.material ?? 'corrugated'))
      } else if (o.kind === 'window') {
        const frame = o.frame ?? 'steel-grey', bar = 0.05, deep = 0.08
        const topShy = 0.01, sillDrop = o.bottom < 0.001 ? 0.01 : 0
        const y0 = w.baseY + o.bottom - sillDrop, y1 = w.baseY + o.bottom + o.h - topShy
        group.add(tag(wallBox(w, o.w, bar, deep, uc, y0 + bar / 2, -t / 2, frame), 'frame')) // sill sinks 1 cm into the floor
        group.add(tag(wallBox(w, o.w, bar, deep, uc, y1 - bar / 2, -t / 2, frame), 'frame'))
        group.add(tag(wallBox(w, bar, y1 - y0 - 2 * bar, deep, o.u + bar / 2, (y0 + y1) / 2, -t / 2, frame), 'frame'))
        group.add(tag(wallBox(w, bar, y1 - y0 - 2 * bar, deep, o.u + o.w - bar / 2, (y0 + y1) / 2, -t / 2, frame), 'frame'))
        const g = o.grid ?? { bars: [], cross: [] }
        const ups: number[] = g.uprights ? g.uprights.slice() : []
        if (!g.uprights && g.cols) for (let c = 1; c < g.cols; c++) ups.push((o.w * c) / g.cols)
        for (const uu of ups) group.add(tag(wallBox(w, bar, y1 - y0 - 2 * bar, deep, o.u + uu, (y0 + y1) / 2, -t / 2, frame), 'frame'))
        for (const hb of g.bars) if (hb > o.bottom && hb < o.bottom + o.h) group.add(tag(wallBox(w, o.w - 2 * bar, bar, deep - 0.01, uc, w.baseY + hb, -t / 2, frame), 'frame'))
        // cross bars: an X over a pane (index into the pane list) or over the whole opening
        const edges = [0, ...ups.sort((p, q) => p - q), o.w]
        const above = g.bars.filter((b) => b > o.bottom && b < o.bottom + o.h)
        const lowest = above.length ? Math.max(o.bottom, Math.min(...above)) : o.bottom   // no bar in the opening: the X spans the whole pane
        const crosses: [number, number][] = g.crossAll ? [[0, o.w]] : (g.cross ?? []).map((c) => [edges[c] ?? 0, edges[c + 1] ?? o.w])
        for (const [c0, c1] of crosses) {
          const cw = c1 - c0, cu = o.u + c0 + cw / 2, h = o.bottom + o.h - lowest, yy = w.baseY + lowest + h / 2
          if (!(cw > 0.01) || !(h > 0.01)) continue
          const len = Math.hypot(cw, h), ang = Math.atan2(h, cw)
          for (const sgn of [1, -1]) { const m = tag(wallBox(w, len, 0.03, 0.03, cu, yy, -t / 2 + 0.06, frame), 'cross'); m.rotateZ(sgn * ang); group.add(m) }
        }
        if (g.frostBelow && g.frostBelow > o.bottom && g.frostBelow < o.bottom + o.h) {
          // frosted panes below a height (the ground floor of the back grid), clear above
          const fh = g.frostBelow - o.bottom
          group.add(wallBox(w, o.w - bar, fh - bar / 2, 0.01, uc, w.baseY + o.bottom + fh / 2, -t / 2, 'glass-frosted'))
          const gl = wallBox(w, o.w - bar, o.h - fh - bar / 2, 0.01, uc, w.baseY + o.bottom + fh + (o.h - fh) / 2, -t / 2, 'glass'); gl.userData = { kind: 'glass', wall: w.id, u: o.u, bottom: o.bottom }; group.add(gl)
        } else { const gl = wallBox(w, o.w - bar, o.h - bar, 0.01, uc, yc, -t / 2, 'glass'); gl.userData = { kind: 'glass', wall: w.id, u: o.u, bottom: o.bottom }; group.add(gl) }
      } else if (o.door) {
        const d = o.door
        const frameM = d.frameMaterial ?? (d.type === 'metal' || w.level === 'ground' ? 'steel-grey' : 'steel-black')
        const jamb = d.frame === false ? 0.005 : (d.jambW ?? 0.05)
        const leafH = Math.min(d.leafH ?? Math.min(o.h, 2.05), d.frame === false ? o.h : o.h - 0.055)   // the leaf stops under the frame head
        if (d.frame !== false) {
          group.add(tag(wallBox(w, jamb, o.h - 0.05, t + 0.04, o.u + jamb / 2, yc - 0.025, -t / 2, frameM), 'frame'))
          group.add(tag(wallBox(w, jamb, o.h - 0.05, t + 0.04, o.u + o.w - jamb / 2, yc - 0.025, -t / 2, frameM), 'frame'))
          group.add(tag(wallBox(w, o.w, 0.05, t + 0.04, uc, w.baseY + o.bottom + o.h - 0.025, -t / 2, frameM), 'frame'))
        }
        if (d.panelAbove && d.panelAbove > 0.01 && o.h - leafH > 0.011) {
          // a metal panel filling the opening above the leaf
          const ph = Math.min(d.panelAbove, o.h - leafH - 0.06)
          if (ph > 0.01) group.add(tag(wallBox(w, o.w - jamb * 2, ph, 0.05, uc, w.baseY + o.bottom + leafH + ph / 2, -t / 2 - (d.recess ?? 0), 'door-metal'), 'panel-above'))
        }
        if (d.leaf) {
          const pivot = new THREE.Object3D()
          const leafW = o.w - jamb * 2
          if (d.type === 'slide') {
            pivot.add(tag(wallBox(w, leafW, leafH - 0.01, 0.04, uc, w.baseY + o.bottom + (leafH - 0.01) / 2, d.leafSide === 'back' ? -(t + 0.05) : 0.05, 'door-slide'), 'leaf'))
          } else if (d.type === 'swing') {
            const hb = d.hinge === 'b' ? -1 : 1
            pivot.position.copy(wallPoint(w, hb > 0 ? o.u + jamb : o.u + o.w - jamb, w.baseY + o.bottom, 0))
            const [dx, dz] = wallDir(w)
            pivot.rotation.y = Math.atan2(-dz, dx)
            const lx = hb * leafW / 2
            if (d.face === 'glass') {
              const fr = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH - 0.005, 0.04), mat('steel-grey')); fr.position.set(lx, leafH / 2 + 0.0025, 0)
              const gl = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.16, leafH - 0.16, 0.01), mat('glass')); gl.position.set(lx, leafH / 2, 0)
              pivot.add(fr, gl)
            } else {
              const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH - 0.005, 0.05), mat('door-metal')); leaf.position.set(lx, leafH / 2 + 0.0025, 0)
              const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10), mat('steel-grey')); handle.rotation.z = Math.PI / 2; handle.position.set(hb * (leafW - 0.1), 1.0, 0.05)
              pivot.add(leaf, handle)
            }
          } else {
            if (d.recess) group.add(tag(wallBox(w, o.w - 2 * jamb - 0.01, 0.06, (d.recess ?? 0) + t, uc, w.baseY + o.bottom + 0.03 - 0.01, -((d.recess ?? 0) + t) / 2, 'concrete'), 'threshold')) // threshold under a recessed door
            pivot.add(tag(wallBox(w, leafW, leafH - 0.005, 0.05, uc, w.baseY + o.bottom + leafH / 2 + 0.0025, -t / 2 - (d.recess ?? 0), 'door-metal'), 'leaf'))
            if (d.face === 'mesh') pivot.add(wallBox(w, 0.18, leafH * 0.55, 0.06, uc, w.baseY + o.bottom + leafH * 0.55, -t / 2 - (d.recess ?? 0), 'steel-black'))
            const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), mat('steel-grey'))
            lock.rotation.x = Math.PI / 2; lock.position.copy(wallPoint(w, o.u + o.w - 0.12, w.baseY + o.bottom + 1.0, -t / 2 - (d.recess ?? 0) + 0.04)); pivot.add(lock)
          }
          pivot.userData = { kind: 'door-pivot', wall: w.id }; pivot.traverse((c) => { if (c !== pivot) c.userData = { kind: c.userData.kind ?? 'leaf', wall: w.id } }); group.add(pivot)
          const slideDir: 1 | -1 = o.u + o.w / 2 < L / 2 ? 1 : -1
          doors.push({ id: `${w.id}:${o.u.toFixed(2)}`, wall: w, opening: o, open: d.open, t: d.open ? 1 : 0, pivot, type: d.type, slideDir })
        }
      }
    }
  }
  // floors: solid slabs (top at floorY, going down by the level's slab thickness); the underside is the ceiling below
  for (const f of lv.floors) {
    if (f.draw === false) continue
    const L = floorOf(lv, f.level), th = L.slab ?? 0.2
    const sh = new THREE.Shape(f.poly.map(([x, z]) => new THREE.Vector2(x, z)))
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false })
    g.rotateX(Math.PI / 2) // (x, y, z) -> (x, -z, y): the extrusion goes down, shape y becomes world z
    g.translate(0, L.floorY, 0)
    const m = new THREE.Mesh(g, mat(f.material ?? 'concrete-bare')); m.userData = { kind: 'floor', level: f.level, name: f.name }; group.add(m); addWire(g, m)
  }
  for (const c of lv.ceilings) {
    if (c.draw === false) continue
    const L = floorOf(lv, c.level), th = L.roof ?? 0.15
    const sh = new THREE.Shape(c.poly.map(([x, z]) => new THREE.Vector2(x, z)))
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false })
    g.rotateX(-Math.PI / 2) // extrusion goes up from the ceiling plane
    g.scale(1, 1, -1)
    g.translate(0, L.ceilY, 0)
    group.add(new THREE.Mesh(g, mat(c.material ?? 'corrugated-ceiling')))
  }
  // stairs: one solid sawtooth body (extruded side profile), stringer plates outside it clipped flush at the top floor,
  // checker plates 1 cm proud on every tread including the top one, which is flush with the landing. No shared faces.
  for (const s of lv.stairs) {
    const r = stairRect(s), rise = s.topY - s.bottomY
    const risers = s.treads + 1, stepRun = s.run / risers, riser = rise / risers
    const st = s.stringers ?? { height: 0.25, thickness: 0.03, material: 'stringer-blue' }
    const fullW = s.width, bodyW = fullW - 2 * st.thickness
    const along = s.dir === '+z' || s.dir === '-z'
    // profile in (u along the flight, y above bottomY)
    const prof = new THREE.Shape()
    prof.moveTo(0, 0.003)
    for (let i = 0; i < risers; i++) { prof.lineTo(i * stepRun, (i + 1) * riser); prof.lineTo((i + 1) * stepRun, (i + 1) * riser) }
    const d = 0.18, xb = Math.min(s.run, (d * s.run) / rise)
    prof.lineTo(s.run, rise - d); prof.lineTo(xb, 0.003); prof.closePath()
    const body = new THREE.ExtrudeGeometry(prof, { depth: bodyW, bevelEnabled: false })
    // stringer profile: 5 cm under the nosing line to st.height above it, clipped flush at the top floor
    const sp = new THREE.Shape()
    const xc = (s.run * (rise - st.height)) / rise
    sp.moveTo(0, -0.05); sp.lineTo(s.run, rise - 0.05); sp.lineTo(s.run, rise); sp.lineTo(xc, rise); sp.lineTo(0, st.height); sp.closePath()
    const plate = () => new THREE.ExtrudeGeometry(sp, { depth: st.thickness, bevelEnabled: false })
    // place: shape x -> flight direction, shape y -> up, extrusion -> across the flight
    const place = (g: THREE.BufferGeometry, across0: number) => {
      // across0 = world coordinate where the extrusion starts (x for +z/-z flights, z for +x/-x)
      switch (s.dir) {
        case '+z': g.rotateY(-Math.PI / 2); g.scale(-1, 1, 1); g.translate(across0, s.bottomY, r.z0); break // sx->z, sz->x
        case '-z': g.rotateY(Math.PI / 2); g.translate(across0, s.bottomY, r.z1); break
        case '+x': g.translate(r.x0, s.bottomY, across0); break
        case '-x': g.rotateY(Math.PI); g.scale(1, 1, -1); g.translate(r.x1, s.bottomY, across0); break
      }
      return g
    }
    const a0 = along ? r.x0 : r.z0 // start of the width
    const bodyMesh = new THREE.Mesh(place(body, a0 + st.thickness), mat(s.riserMaterial ?? 'plywood'))
    bodyMesh.userData = { kind: 'stair-body', stair: s.id }; group.add(bodyMesh)
    const inset = lv.stairs.some((q) => q.to === s.level) ? 0.001 : 0
    for (const off of [0, fullW - st.thickness]) {
      const pm = new THREE.Mesh(place(plate(), a0 + off + (off ? -inset : inset)), mat(st.material ?? 'stringer-blue'))
      pm.userData = { kind: 'stringer', stair: s.id }; group.add(pm)
    }
    // checker plates: 1 cm thick, 2 mm above each tread top, the body width
    for (let i = 0; i < risers; i++) {
      const top = s.bottomY + (i + 1) * riser + 0.002
      const u0 = i * stepRun, u1 = (i + 1) * stepRun
      const tm = new THREE.Mesh(new THREE.BoxGeometry(along ? bodyW : u1 - u0, 0.01, along ? u1 - u0 : bodyW), mat(s.treadMaterial ?? 'checker'))
      const um = (u0 + u1) / 2
      const cw = a0 + st.thickness + bodyW / 2
      if (s.dir === '+z') tm.position.set(cw, top + 0.005, r.z0 + um)
      else if (s.dir === '-z') tm.position.set(cw, top + 0.005, r.z1 - um)
      else if (s.dir === '+x') tm.position.set(r.x0 + um, top + 0.005, cw)
      else tm.position.set(r.x1 - um, top + 0.005, cw)
      tm.userData = { kind: 'tread', stair: s.id, index: i }; group.add(tm)
    }
  }
  // objects
  for (const o of lv.objects) {
    if (o.kind === 'ribs') {
      const cy = floorOf(lv, o.level).ceilY
      for (const c of lv.ceilings) {
        if (c.level !== o.level) continue
        const b = bbox(c.poly), alongX = o.dir === '+x' || o.dir === '-x'
        const span = alongX ? b.z1 - b.z0 : b.x1 - b.x0
        const count = Math.floor(span / o.pitch)
        const g = new THREE.BoxGeometry(alongX ? b.x1 - b.x0 : o.width, o.depth, alongX ? o.width : b.z1 - b.z0)
        const im = new THREE.InstancedMesh(g, mat('rib'), count)
        const M = new THREE.Matrix4()
        for (let i = 0; i < count; i++) {
          const p = (i + 0.5) * o.pitch
          M.makeTranslation(alongX ? (b.x0 + b.x1) / 2 : b.x0 + p, cy - o.depth / 2, alongX ? b.z0 + p : (b.z0 + b.z1) / 2)
          im.setMatrixAt(i, M)
        }
        group.add(im)
      }
    } else if (o.kind === 'light') {
      const cy = o.y ?? floorOf(lv, o.level).ceilY
      if (o.size[0] > 0) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.size[0], 0.06, o.size[1]), mat('light'))
        m.position.set(o.at[0], cy - 0.09, o.at[1]); group.add(m)
      }
      const pl = new THREE.PointLight(0xfff0d0, 14, 9, 2); pl.position.set(o.at[0], cy - 0.25, o.at[1]); group.add(pl); lights.push(pl)
    } else if (o.kind === 'track') {
      // a rectangle of lighting track under the ceiling, spotlights clipped on it; each spot is one tilted piece
      const cy = floorOf(lv, o.level).ceilY
      const [[x0, z0], [x1, z1]] = o.rect
      for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
        const alongX = ax !== bx
        const r = new THREE.Mesh(new THREE.BoxGeometry(alongX ? bx - ax + 0.03 : 0.022, alongX ? 0.03 : 0.022, alongX ? 0.03 : bz - az), mat('steel-black'))
        r.position.set((ax + bx) / 2, cy - 0.065, (az + bz) / 2); r.userData = { kind: 'track' }; group.add(r)
      }
      const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2
      for (const [sx, sz] of o.spots) {
        const spot = new THREE.Group()
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.10, 6), mat('steel-black')); arm.position.set(0, -0.05, 0)
        const head = new THREE.Group(); head.position.set(0, -0.12, 0)
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.13, 14), mat('steel-black')); body.position.set(0, -0.065, 0)
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 14), mat('light')); lens.rotation.x = -Math.PI / 2; lens.position.set(0, -0.131, 0)
        head.add(body, lens)
        // aim the head toward the room centre, tilted 30 degrees from straight down
        head.rotation.y = Math.atan2(cxm - sx, czm - sz)
        head.rotateX(Math.PI / 6)
        spot.add(arm, head); spot.position.set(sx, cy - 0.08, sz); group.add(spot)
        const pl = new THREE.PointLight(0xfff0d0, 3.0, 7, 2); pl.position.set(sx, cy - 0.32, sz); group.add(pl); lights.push(pl)
      }
    } else if (o.kind === 'rail') {
      // a track under the ceiling with spotlights clipped on it
      const cy = floorOf(lv, o.level).ceilY
      const rail = new THREE.Mesh(new THREE.BoxGeometry(o.x1 - o.x0, 0.03, 0.03), mat('steel-black'))
      rail.position.set((o.x0 + o.x1) / 2, cy - 0.065, o.z); group.add(rail)
      for (const sx of o.spots) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.10, 6), mat('steel-black')); arm.position.set(sx, cy - 0.13, o.z); group.add(arm)
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 12), mat('steel-black')); head.rotation.x = Math.PI / 6; head.position.set(sx, cy - 0.24, o.z); group.add(head)
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), mat('light')); lens.rotation.x = -Math.PI / 2 + Math.PI / 6; lens.position.set(sx, cy - 0.30, o.z + 0.03); group.add(lens)
        const pl = new THREE.PointLight(0xfff0d0, 3.5, 7, 2); pl.position.set(sx, cy - 0.35, o.z); group.add(pl); lights.push(pl)
      }
    } else if (o.kind === 'aircon') {
      const cy = floorOf(lv, o.level).ceilY
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.size[0], o.size[1], o.size[2]), mat('aircon'))
      m.position.set(o.at[0], cy - o.size[1] / 2, o.at[1]); group.add(m)
    } else if (o.kind === 'slab') {
      const [p0, p1] = o.box
      const m = new THREE.Mesh(new THREE.BoxGeometry(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), mat(o.material ?? 'concrete'))
      m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2); group.add(m)
    } else if (o.kind === 'wallbox') {
      const w = wallById.get(o.wall); if (!w) continue
      group.add(wallBox(w, o.w, o.h, o.d, o.u, w.baseY + o.y, o.d / 2, o.material ?? 'junction-box'))
    } else if (o.kind === 'pipe') {
      const w = wallById.get(o.wall); if (!w) continue
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.y1 - o.y0, 10), mat(o.material ?? 'pipe-white'))
      m.position.copy(wallPoint(w, o.u, w.baseY + (o.y0 + o.y1) / 2, o.d)); group.add(m)
    } else if (o.kind === 'pavegrid') {
      // concrete-edged squares over an area, gravel between, a red tile every n-th cell; the skip box (the path) is left out
      const [[x0, z0], [x1, z1]] = o.area, y = floorOf(lv, 'ground').floorY
      const inSkip = (x: number, z: number) => !!o.skip && x > o.skip[0][0] && x < o.skip[1][0] && z > o.skip[0][1] && z < o.skip[1][1]
      const nx = Math.floor((x1 - x0) / o.cell), nz = Math.floor((z1 - z0) / o.cell)
      let k = 0
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const cxp = x0 + (i + 0.5) * o.cell, czp = z0 + (j + 0.5) * o.cell
        if (inSkip(cxp, czp)) continue
        const e = new THREE.Mesh(new THREE.BoxGeometry(o.cell, o.lift, o.edge), mat(o.material ?? 'concrete')); e.position.set(cxp, y + o.lift / 2, z0 + j * o.cell); group.add(e)
        const e2 = new THREE.Mesh(new THREE.BoxGeometry(o.edge, o.lift, o.cell), mat(o.material ?? 'concrete')); e2.position.set(x0 + i * o.cell, y + o.lift / 2, czp); group.add(e2)
        if (o.tileEvery && (k++ % o.tileEvery) === 1) {
          const tl = new THREE.Mesh(new THREE.BoxGeometry(o.cell - o.edge, o.lift * 0.8, o.cell - o.edge), mat(o.tileMaterial ?? 'red-tile')); tl.position.set(cxp, y + o.lift * 0.4, czp); group.add(tl)
        }
      }
    } else if (o.kind === 'paving') {
      // a paving patch: one concrete slab for the zone (its top = the strips), each cell a box on it at its own measured top
      const [[zx0, zz0], [zx1, zz1]] = o.zone
      const zone = new THREE.Mesh(new THREE.BoxGeometry(zx1 - zx0, o.zoneTop - o.base, zz1 - zz0), mat('concrete'))
      zone.position.set((zx0 + zx1) / 2, (o.zoneTop + o.base) / 2, (zz0 + zz1) / 2); group.add(zone)
      for (const c of o.cells) {
        const [[x0, z0], [x1, z1]] = c.box, h = Math.max(0.01, c.top - o.zoneTop + 0.02)
        const fill = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.01, h, z1 - z0 - 0.01), mat(c.material)); fill.position.set((x0 + x1) / 2, c.top - h / 2, (z0 + z1) / 2)
        fill.userData = { kind: 'cell', material: c.material }; group.add(fill)
      }
    } else if (o.kind === 'block') {
      // a neighbouring building: its map footprint extruded up from the ground, one plain grey
      const y0 = floorOf(lv, 'ground').floorY
      const sh = new THREE.Shape(o.poly.map(([x, z]) => new THREE.Vector2(x, z)))
      const g = new THREE.ExtrudeGeometry(sh, { depth: o.h, bevelEnabled: false })
      g.rotateX(Math.PI / 2); g.translate(0, y0 + o.h, 0)   // like the floors: shape y -> world z, extrusion goes down from the roof to the ground
      const m = new THREE.Mesh(g, mat('block')); m.userData = { kind: 'block', name: o.name }; group.add(m)
    } else if (o.kind === 'road') {
      const y0 = floorOf(lv, 'ground').floorY - 0.01
      for (let i = 0; i + 1 < o.pts.length; i++) {
        const [ax, az] = o.pts[i], [bx, bz] = o.pts[i + 1], L = Math.hypot(bx - ax, bz - az)
        if (L < 0.05) continue
        const m = new THREE.Mesh(new THREE.BoxGeometry(L + o.w * 0.5, 0.02, o.w), mat('road'))
        m.position.set((ax + bx) / 2, y0, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax); m.userData = { kind: 'road' }; group.add(m)
      }
    } else if (o.kind === 'ground') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(o.r, 48), mat('ground-plate')); m.rotation.x = -Math.PI / 2; m.position.y = o.y; m.userData = { kind: 'ground' }; group.add(m)
    } else if (o.kind === 'hedge') {
      const [[ax, az], [bx, bz]] = o.along, L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / o.step))
      for (let i = 0; i <= n; i++) {
        const t = i / n, m = new THREE.Mesh(new THREE.SphereGeometry(o.r * (0.8 + 0.4 * ((i * 7) % 3) / 2), 10, 8), mat(o.material ?? 'foliage'))
        m.position.set(ax + (bx - ax) * t, o.y + o.r * 0.6, az + (bz - az) * t + (((i * 5) % 3) - 1) * 0.12); m.scale.y = 0.7; group.add(m)
      }
    }
  }
  return { group, wire, doors, lights }
}

/** animate door leaves toward their open state; slide = translate along the wall, swing = rotate about the hinge */
export function updateDoors(doors: DoorRuntime[], dt: number): void {
  for (const d of doors) {
    const target = d.open ? 1 : 0
    if (Math.abs(d.t - target) < 1e-3) { d.t = target } else d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt / 0.6)
    const ease = d.t * d.t * (3 - 2 * d.t)
    if (d.type === 'slide') {
      const [dx, dz] = wallDir(d.wall)
      const s = d.slideDir * (d.opening.w - 0.06) * ease
      d.pivot.position.set(dx * s, 0, dz * s)
    } else if (d.type === 'swing') {
      const [dx, dz] = wallDir(d.wall), [nx, nz] = facingNormal(d.wall.facing)
      const base = Math.atan2(-dz, dx)
      const hb = d.opening.door?.hinge === 'b' ? -1 : 1
      const dot = hb * (dz * nx - dx * nz)
      const sign = (d.opening.door?.swingOut ? -1 : 1) * (dot > 0 ? 1 : -1)
      d.pivot.rotation.y = base + sign * (Math.PI / 2) * ease
    }
  }
}

/** Mesh audit: measures the BUILT geometry against the level numbers. Returns PASS/FAIL lines. */
export function meshAudit(lv: Level, group: THREE.Group): string[] {
  const out: string[] = []
  const ok = (c: boolean, m: string) => out.push((c ? 'PASS  ' : 'FAIL  ') + m)
  const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o)
  const kids = group.children
  // no geometry with a NaN vertex, no mesh at a NaN position
  {
    let bad = 0
    group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (!Number.isFinite(m.position.x) || !Number.isFinite(m.position.y) || !Number.isFinite(m.position.z)) { bad++; return }
      const P = m.geometry.attributes.position
      if (P) for (let i = 0; i < P.count; i++) if (!Number.isFinite(P.getX(i)) || !Number.isFinite(P.getY(i)) || !Number.isFinite(P.getZ(i))) { bad++; break }
    })
    ok(bad === 0, `no NaN geometry (${bad} meshes)`)
  }
  // every window opening of every drawn wall has its glass, and no solid wall piece sits over the opening's centre
  for (const w of lv.walls) {
    if (w.draw === false) continue
    for (const o of w.openings) {
      if (o.kind !== 'window') continue
      const c = wallPoint(w, o.u + o.w / 2, w.baseY + o.bottom + o.h / 2, -w.thickness / 2)
      const glass = kids.find((k) => k.userData.kind === 'glass' && k.userData.wall === w.id && Math.abs(k.userData.u - o.u) < 0.011 && Math.abs(k.userData.bottom - o.bottom) < 0.011)
      ok(!!glass, `window ${w.id} u ${o.u} y ${o.bottom}: glass built`)
      const covered = kids.filter((k) => k.userData.wall === w.id && !k.userData.kind).some((k) => box(k).expandByScalar(-0.005).containsPoint(c))
      ok(!covered, `window ${w.id} u ${o.u} y ${o.bottom}: no solid wall over it`)
    }
  }
  // no two same-facing faces on one plane with overlapping area (that is the striped flicker the owner sees)
  {
    const items: { o: THREE.Object3D; b: THREE.Box3; tag: string }[] = []
    group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh || !((o as THREE.Mesh).geometry instanceof THREE.BoxGeometry)) return
      const r = o.rotation
      const axisAligned = Math.abs((r.y / (Math.PI / 2)) % 1) < 1e-3 && Math.abs(r.x) < 1e-3 && Math.abs(r.z) < 1e-3
      const k = o.userData.kind
      if (!axisAligned || k === 'block' || k === 'road' || k === 'ground' || k === 'glass' || k === 'floor' || k === 'ceiling') return
      items.push({ o, b: new THREE.Box3().setFromObject(o), tag: `${k ?? 'mesh'} ${o.userData.wall ?? o.userData.name ?? o.userData.stair ?? ''}`.trim() })
    })
    const eps = 2e-3, ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.01
    const fights: string[] = []
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i].b, B = items[j].b
      if (A.max.x < B.min.x - eps || B.max.x < A.min.x - eps || A.max.y < B.min.y - eps || B.max.y < A.min.y - eps || A.max.z < B.min.z - eps || B.max.z < A.min.z - eps) continue
      for (const ax of ['x', 'y', 'z'] as const) {
        const o1 = ax === 'x' ? 'y' : 'x', o2 = ax === 'z' ? 'y' : 'z'
        for (const side of ['min', 'max'] as const) {
          if (Math.abs(A[side][ax] - B[side][ax]) < eps && ov(A.min[o1], A.max[o1], B.min[o1], B.max[o1]) && ov(A.min[o2], A.max[o2], B.min[o2], B.max[o2]))
            fights.push(`${items[i].tag} | ${items[j].tag} ${ax}${side} at ${A[side][ax].toFixed(2)}`)
        }
      }
    }
    ok(fights.length === 0, `no two faces share a plane: ${fights.length} pairs` + (fights.length ? ' e.g. ' + fights.slice(0, 12).join('; ') : ''))
  }
  // nothing floats: every context block and slab bottom sits on the ground plate or another mesh top (within 2 cm)
  const gY = floorOf(lv, 'ground').floorY
  for (const k of kids.filter((o) => o.userData.kind === 'block')) {
    const b = box(k); ok(Math.abs(b.min.y - gY) < 0.021, `block '${k.userData.name}' stands on the ground (${b.min.y.toFixed(3)})`)
  }
  for (const s of lv.stairs) {
    const r = stairRect(s)
    const body = kids.find((o) => o.userData.kind === 'stair-body' && o.userData.stair === s.id)
    const plates = kids.filter((o) => o.userData.kind === 'stringer' && o.userData.stair === s.id)
    const treads = kids.filter((o) => o.userData.kind === 'tread' && o.userData.stair === s.id)
    if (!body) { ok(false, `stair ${s.id}: body missing`); continue }
    const b = box(body)
    const zEnd = s.dir === '+z' ? b.max.z : s.dir === '-z' ? b.min.z : s.dir === '+x' ? b.max.x : b.min.x
    const zTarget = s.dir === '+z' ? r.z1 : s.dir === '-z' ? r.z0 : s.dir === '+x' ? r.x1 : r.x0
    ok(Math.abs(b.max.y - s.topY) < 0.011, `stair ${s.id}: body top ${b.max.y.toFixed(3)} = landing floor ${s.topY}`)
    ok(Math.abs(b.min.y - s.bottomY) < 0.011, `stair ${s.id}: body foot ${b.min.y.toFixed(3)} = floor ${s.bottomY}`)
    ok(Math.abs(zEnd - zTarget) < 0.011, `stair ${s.id}: body reaches the landing edge ${zEnd.toFixed(3)} vs ${zTarget.toFixed(3)}`)
    const whole = plates.reduce((acc, p) => acc.union(box(p)), b.clone())
    ok(Math.abs((s.dir === '+z' || s.dir === '-z' ? whole.max.x - whole.min.x : whole.max.z - whole.min.z) - s.width) < 0.011, `stair ${s.id}: body + stringers width = ${s.width}`)
    for (const p of plates) ok(box(p).max.y <= s.topY + 0.011, `stair ${s.id}: stringer top ${box(p).max.y.toFixed(3)} not above the landing floor ${s.topY}`)
    ok(treads.length === s.treads + 1, `stair ${s.id}: ${treads.length} tread plates = ${s.treads + 1}`)
    const topTread = treads.find((t) => t.userData.index === s.treads)
    if (topTread) ok(Math.abs(box(topTread).min.y - s.topY) < 0.02, `stair ${s.id}: top tread flush with the landing (${box(topTread).min.y.toFixed(3)})`)
    // the floors of the target level reach the flight's edge and the landing edge
    if (s.to) {
      const floors = kids.filter((o) => o.userData.kind === 'floor' && o.userData.level === s.to)
      const edge = s.dir === '+z' || s.dir === '-z' ? r.x1 : r.z1
      const reaches = floors.some((f) => { const fb = box(f); return Math.abs((s.dir === '+z' || s.dir === '-z' ? fb.min.x : fb.min.z) - edge) < 0.011 })
      ok(reaches, `stair ${s.id}: a floor of ${s.to} starts at the flight edge ${edge.toFixed(3)}`)
      const landing = floors.some((f) => { const fb = box(f); return Math.abs((s.dir === '+z' ? fb.min.z : s.dir === '-z' ? fb.max.z : s.dir === '+x' ? fb.min.x : fb.max.x) - zTarget) < 0.011 })
      ok(landing, `stair ${s.id}: a floor of ${s.to} starts at the landing edge ${zTarget.toFixed(3)}`)
    }
  }
  // slabs: every floor slab is as thick as the level says and its top is at floorY
  for (const f of kids.filter((o) => o.userData.kind === 'floor')) {
    const L = floorOf(lv, f.userData.level), fb = box(f)
    ok(Math.abs(fb.max.y - L.floorY) < 0.011 && Math.abs(fb.max.y - fb.min.y - (L.slab ?? 0.2)) < 0.011, `floor '${f.userData.name}' (${L.id}): top ${fb.max.y.toFixed(3)} thick ${(fb.max.y - fb.min.y).toFixed(3)}`)
  }
  return out
}

/** Sky-leak audit: from points inside every room, cast rays in all directions; a ray that hits nothing is a hole.
 *  Rays leaving through an OPEN doorway to the outside (the front door) are not holes. Returns PASS/FAIL lines. */
export function skyLeakAudit(lv: Level, group: THREE.Group, doors: DoorRuntime[]): string[] {
  const out: string[] = []
  const ray = new THREE.Raycaster(); ray.far = 60
  const meshes: THREE.Object3D[] = []
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o) })
  // open doors to the outside: their opening rectangles let rays out legitimately
  const exits = doors.filter((d) => d.open && d.wall.id === 'g-east').map((d) => ({ w: d.wall, o: d.opening }))
  const throughExit = (origin: THREE.Vector3, dir: THREE.Vector3): boolean => {
    for (const e of exits) {
      const [nx, nz] = facingNormal(e.w.facing)
      const p0 = wallPoint(e.w, 0, 0, 0)
      const denom = dir.x * nx + dir.z * nz
      if (Math.abs(denom) < 1e-6) continue
      const tt = ((p0.x - origin.x) * nx + (p0.z - origin.z) * nz) / denom
      if (tt < 0) continue
      const hit = origin.clone().addScaledVector(dir, tt)
      const [dx, dz] = wallDir(e.w)
      const u = (hit.x - e.w.a[0]) * dx + (hit.z - e.w.a[1]) * dz, y = hit.y - e.w.baseY
      if (u > e.o.u && u < e.o.u + e.o.w && y > e.o.bottom && y < e.o.bottom + e.o.h) return true
    }
    return false
  }
  const dirs: THREE.Vector3[] = []
  for (let i = 0; i < 400; i++) { // fibonacci sphere
    const y = 1 - (i / 399) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963
    dirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r))
  }
  for (const f of lv.floors) {
    if (f.name === 'courtyard') continue
    const L = floorOf(lv, f.level)
    // sample points: the poly's centroid and points 40 cm inside each corner
    const cx = f.poly.reduce((a, p) => a + p[0], 0) / f.poly.length, cz = f.poly.reduce((a, p) => a + p[1], 0) / f.poly.length
    const pts: [number, number][] = [[cx, cz], ...f.poly.map(([x, z]) => [x + (cx > x ? 0.4 : -0.4), z + (cz > z ? 0.4 : -0.4)] as [number, number])]
    for (const [x, z] of pts) {
      if (!pointInPoly(x, z, f.poly)) continue
      const origin = new THREE.Vector3(x, L.floorY + 1.5, z)
      let leaks = 0; let sample = ''
      for (const d of dirs) {
        ray.set(origin, d)
        const hits = ray.intersectObjects(meshes, false)
        if (hits.length === 0 && !throughExit(origin, d)) { leaks++; if (!sample) sample = `dir ${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)}` }
      }
      out.push((leaks === 0 ? 'PASS  ' : 'FAIL  ') + `no sky through the walls from '${f.name}' (${L.id}) at ${x.toFixed(2)},${z.toFixed(2)}${leaks ? `: ${leaks} rays escape, first ${sample}` : ''}`)
    }
  }
  return out
}

export function doorCentre(d: DoorRuntime): THREE.Vector3 {
  return wallPoint(d.wall, d.opening.u + d.opening.w / 2, d.wall.baseY + 1, 0)
}

export function setWireColor(wire: THREE.Group, css: string): void {
  wire.traverse((o) => {
    const m = (o as THREE.LineSegments).material as THREE.LineBasicMaterial | undefined
    if (m && m.isLineBasicMaterial) m.color.set(css)
  })
}
