// The world (REMAKE.md §2): three.js only, never touches the DOM it did not make (the canvas). Talks to the UI through the bus.
// Boot: renderer → loader → room → walk → art → keys → loop. Every rule and key from gate 1 (c830ca4) is here unchanged.
import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { bus, type Look, type TouchAction } from '../bus'
import type { Placed } from './art/art'
import { Renderer } from './renderer'
import { Loader } from './loader'
import { loadLevel, buildLevel, updateDoors, floorOf, setWireColor, meshAudit, skyLeakAudit, applyTextures, worldUVs, MAPS, type Level } from './room/level'
import { Walker } from './walk'
import { Input, type Verb } from './input'
import { Feel } from './feel'
import { Minimap } from './minimap'
import { ArtSystem } from './art/art'
import { Anchors } from './anchors'
import { Looks } from './looks'
import { Intro } from './intro'
import { Store, TICK_MS } from './store'

// three-mesh-bvh: the room's static geometry gets a BVH; raycasts against it are the accelerated kind
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

const LOOK_KEY = 'koan-hang-look'

export interface WorldHandle { renderer: Renderer; level: Level; art: ArtSystem; walker: Walker; dispose: () => void }

export async function startWorld(container: HTMLElement, base: string): Promise<WorldHandle | null> {
  const DATA = `${base}data/`
  const renderer = new Renderer(container)
  const { scene, camera } = renderer
  const loader = new Loader(base, renderer.gl)
  scene.background = new THREE.Color(0xbfd9f2)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8078, 0.55))
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.2); sun.position.set(6, 10, -4); scene.add(sun)

  // ---- room ---------------------------------------------------------------------------------------
  let level: Level
  try { level = await loadLevel(`${DATA}level/level.json`) } catch (e) { bus.emit('world_failed', { message: (e as Error).message }); return null }
  const built = buildLevel(level)
  worldUVs(built.group)
  scene.add(built.group, built.wire)
  if (level.sky?.fallback) scene.background = new THREE.Color(level.sky.fallback)
  if (level.fog) scene.fog = new THREE.Fog(new THREE.Color(level.fog.color), level.fog.near, level.fog.far)
  if (level.sky?.file) {
    loader.image(`${DATA}textures/${level.sky.file}`, 'sky').then((tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; looks.setFlatBackground(tex) }).catch(() => { /* no panorama yet */ })
  }
  // tiles: KTX2 first (textures/ktx2/<name>.ktx2, GPU-compressed, mips baked), the jpg through the bitmap worker when a ktx2 is missing
  const aniso = renderer.gl.capabilities.getMaxAnisotropy()
  const tile = (file: string): Promise<THREE.Texture> => {
    const name = file.replace(/\.[a-z0-9]+$/i, '')
    return loader.texture(`${DATA}textures/ktx2/${name}.ktx2`, 'room', { repeat: true, anisotropy: aniso })
      .catch(() => loader.image(`${DATA}textures/${file}`, 'room', { repeat: true, anisotropy: aniso }))
  }
  let look: Look = 'textured'
  try { const saved = localStorage.getItem(LOOK_KEY); if (saved === 'clean' || saved === 'wire' || saved === 'textured') look = saved } catch { /* private */ }
  const applyLook = () => {
    built.wire.visible = look === 'wire'
    applyTextures(look === 'textured', tile)
    try { localStorage.setItem(LOOK_KEY, look) } catch { /* private */ }
    bus.emit('look', { look })
  }
  applyLook()

  const looks = new Looks(renderer, built.group, new THREE.Color(level.fog?.color ?? level.sky?.fallback ?? 0x232325), DATA)
  const intro = new Intro(level, loader, base); scene.add(intro.group)
  renderer.gl.shadowMap.enabled = true; renderer.gl.shadowMap.type = THREE.PCFSoftShadowMap   // one shadow: the plate on the red wall
  built.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true })

  // the room's BVH: one static mesh of every wall and floor, for occlusion queries (a work behind a wall is not looked at)
  built.group.updateMatrixWorld(true)
  const chunks: Float32Array[] = []; let total = 0
  built.group.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || !m.visible) return
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry
    const pos = g.getAttribute('position'); if (!pos) return
    const arr = new Float32Array(pos.count * 3); const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z }
    chunks.push(arr); total += arr.length
    if (g !== m.geometry) g.dispose()
  })
  const merged = new Float32Array(total); let off = 0
  for (const c of chunks) { merged.set(c, off); off += c.length }
  const roomGeo = new THREE.BufferGeometry(); roomGeo.setAttribute('position', new THREE.BufferAttribute(merged, 3))
  const roomBVH = new MeshBVH(roomGeo)
  const bvhRay = new THREE.Ray()
  const occluder = (origin: THREE.Vector3, dir: THREE.Vector3, far: number): number | null => {
    bvhRay.origin.copy(origin); bvhRay.direction.copy(dir)
    const hit = roomBVH.raycastFirst(bvhRay, THREE.DoubleSide, 0, far)
    return hit ? hit.distance : null
  }

  // ---- walk, art -------------------------------------------------------------------------------------
  const walker = new Walker(level, camera, renderer.gl.domElement)
  walker.doors = built.doors
  walker.teleport('ground', 6.18, 4.3); walker.state.yaw = THREE.MathUtils.degToRad(42.5); walker.applyCamera(1)   // owner 09-06: start on the far square of the yard, facing the door
  const input = new Input(renderer.gl.domElement)
  const feel = new Feel(); feel.reduce = input.settings.reduceMotion
  walker.keys = input.keys
  walker.headBob = input.settings.headBob
  camera.fov = input.settings.fov; camera.updateProjectionMatrix()
  input.onLook = (dx, dy) => walker.look(dx, dy)
  input.onLockChange = (on) => walker.setLocked(on)
  walker.onLevelStep = () => feel.dip(walker.dip, 0.03)
  const art = new ArtSystem(level, scene, walker, camera, DATA, loader)
  const store = new Store()                          // SHOW.md §4: the show's truth
  const ours = (): boolean => store.open           // the door is open in this browser: the bar, the hands, the rings; else look only
  art.feel = feel
  art.occluder = occluder
  art.floorRay = (origin, dir, far) => { bvhRay.origin.copy(origin); bvhRay.direction.copy(dir); const h = roomBVH.raycastFirst(bvhRay, THREE.DoubleSide, 0, far); return h && h.face ? { point: h.point, ny: Math.abs(h.face.normal.y), dist: h.distance } : null }
  art.tileLoader = (name) => { const spec = MAPS[name]; if (!spec) return Promise.reject(new Error(`no tile ${name}`)); return tile(spec.file) }
  // a sculpture's thumbnail: one small render of the model, stored on the item (local) or kept for the session (repo)
  art.onModel = (a, g) => { try { a.thumb = thumbnail(g); artSnapshot() } catch (e) { console.warn('thumbnail failed', e) } }
  const thumbnail = (model: THREE.Group): string => {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x111111)
    const m = model.clone(true); m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.material = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.8 }) })
    const box = new THREE.Box3().setFromObject(m); const size = new THREE.Vector3(); box.getSize(size); const c = new THREE.Vector3(); box.getCenter(c)
    sc.add(m, new THREE.HemisphereLight(0xffffff, 0x666666, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2, 3, 4); sc.add(sun)
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100); const r = Math.max(size.x, size.y, size.z)
    cam.position.set(c.x + r * 1.2, c.y + r * 0.6, c.z + r * 2.2); cam.lookAt(c)
    const rt = new THREE.WebGLRenderTarget(192, 192); renderer.gl.setRenderTarget(rt); renderer.gl.render(sc, cam)
    const px = new Uint8Array(192 * 192 * 4); renderer.gl.readRenderTargetPixels(rt, 0, 0, 192, 192, px); renderer.gl.setRenderTarget(null); rt.dispose()
    const cv = document.createElement('canvas'); cv.width = cv.height = 192; const ctx = cv.getContext('2d')!; const img = ctx.createImageData(192, 192)
    for (let y = 0; y < 192; y++) img.data.set(px.subarray((191 - y) * 192 * 4, (192 - y) * 192 * 4), y * 192 * 4)
    ctx.putImageData(img, 0, 0); return cv.toDataURL('image/jpeg', 0.85)
  }
  const anchors = new Anchors()
  art.mode = 'hang'                                   // GAME-UI §3: you are always walking; holding a work is hanging
  let menuOpen = false
  let touch: Placed | null = null
  const nameOf = (id: string): string => art.library.find((x) => x.id === id)?.title ?? 'work'

  const artSnapshot = () => {
    const placed: Record<string, number> = {}
    for (const p of art.layout.items) placed[p.art] = (placed[p.art] ?? 0) + 1
    const f = art.focus()
    bus.emit('art_state', { library: art.library, held: art.held?.id ?? null, layout: art.layout, selected: art.selected, placed, hands: art.hands, focus: f ? { art: f.art.id, placed: f.placed?.id ?? null, look: art.lookOf(f.art, f.placed), parts: art.partNames(f.art) } : null })
  }
  art.onChange = artSnapshot
  await art.load()
  // the share link (?layout=) is a read-only view: no store, no writes; otherwise the store's show replaces this browser's
  if (new URLSearchParams(location.search).get('layout')) art.store = null
  else { art.store = store; const show = await store.load(); if (show) art.setShow(show) }
  artSnapshot()
  walker.onChange = () => art.onLevelChange()

  bus.emit('play', { settings: { ...input.settings } })
  // the share link (ART.md §4): ?layout=<name> opens a layout from the repo over the draft
  const wanted = new URLSearchParams(location.search).get('layout')
  if (wanted) {
    fetch(`${DATA}layouts/${wanted.replace(/[^a-z0-9_-]+/gi, '-')}.json`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((text) => art.importFile(text)).then(() => bus.toast(`layout ${wanted} loaded from the repo`, 'warn')).catch(() => bus.toast(`no layout called ${wanted} in the repo`, 'bad'))
  }
  bus.emit('world_ready', { hangWalls: level.walls.filter((w) => w.hang !== false).length, stairs: level.stairs.length, doors: built.doors.length, floors: level.levels.length, eyeCm: Math.round(level.eyeHeight * 100), walls: level.walls.length })

  // ---- minimap: the UI hands over two canvases -------------------------------------------------------
  let minimap: Minimap | null = null
  let bigShown = false
  const showMap = (show: boolean) => { bigShown = show; bus.emit('map_show', { show }); if (show) walker.release() }

  // ---- bus: ui → world ---------------------------------------------------------------------------------
  const offs: (() => void)[] = []
  offs.push(
    bus.on('set_look', ({ look: l }) => { look = l; applyLook() }),
    bus.on('set_eye', ({ cm }) => { if (cm >= 100 && cm <= 220) { level.eyeHeight = cm / 100; bus.toast(`eye height ${cm} cm`) } }),
    bus.on('accent', ({ css }) => setWireColor(built.wire, css)),
    bus.on('world_ready', () => setWireColor(built.wire, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#66BDE6')),
    bus.on('door_check', async ({ key, who }) => { const r = await store.check(key, who); bus.emit('door_result', r); if (r.ok && art.store) { const show = await store.load(); if (show) art.setShow(show); artSnapshot() } }),
    bus.on('door_leave', () => { store.leave(); art.hold(null); closeTouch(); artSnapshot() }),
    bus.on('hold', ({ id }) => {
      if (!ours()) return
      const a = id ? art.library.find((x) => x.id === id) ?? null : null
      if (a && art.isPlaced(a.id)) { bus.toast(`${a.title} is on the wall · walk up to it and press e`, 'warn'); return }
      if (a && art.held?.id === a.id) { art.hold(null); bus.toast('put back'); return }
      art.hold(a)
      if (art.held) bus.toast(`holding ${art.held.title} · look at a wall, click`)
    }),
    bus.on('set_play', ({ patch }) => {
      input.setPlay(patch)
      if (patch.fov !== undefined) feel.fov(camera, patch.fov)
      if (patch.reduceMotion !== undefined) feel.reduce = patch.reduceMotion
      if (patch.headBob !== undefined) walker.headBob = patch.headBob
    }),
    bus.on('add_local', ({ item }) => { void art.addLocal(item).then((a) => bus.toast(`${a.title} · ${a.w} × ${a.h} × ${a.d} cm in the library`)) }),
    bus.on('remove_local', ({ id }) => { void art.removeLocal(id) }),
    bus.on('set_guides', ({ patch }) => art.setGuides(patch)),
    bus.on('set_sculpt', ({ patch }) => { if (!art.setLook(patch)) bus.toast('hold or look at a sculpture first', 'warn') }),
    bus.on('rotate', ({ deg }) => { if (!art.rotate(deg)) bus.toast('hold or look at a sculpture first', 'warn'); else artSnapshot() }),
    bus.on('probe_model', ({ data, key }) => {
      loader.model(data, 'art').then((g) => { const b = new THREE.Box3().setFromObject(g); const s = new THREE.Vector3(); b.getSize(s); bus.emit('model_probed', { key, w: Math.round(s.x * 100), h: Math.round(s.y * 100), d: Math.round(s.z * 100) }) })
        .catch((e) => bus.emit('model_probed', { key, w: 0, h: 0, d: 0, error: (e as Error).message }))
    }),
    bus.on('snap_all', ({ wall }) => {
      if (wall === 'looked') { const h = art.hitWall(); if (!h) { bus.toast('look at a wall first', 'warn'); return } bus.toast(`${art.snapAll(h.wall.id)} snapped`) }
      else bus.toast(`${art.snapAll()} snapped`)
    }),
    bus.on('set_name', ({ name }) => { art.layout.name = name || 'draft'; art.autosave(); artSnapshot() }),
    bus.on('export_file', () => { const f = art.exportFile(); bus.emit('file_ready', f) }),
    bus.on('import_file', ({ text, name }) => { void art.importFile(text).then((r) => bus.toast(`loaded ${name} · ${r.works} works · ${r.art} new images${art.lastImportDropped ? ` · ${art.lastImportDropped} duplicate(s) dropped, one of each` : ''}`)).catch((e) => bus.toast((e as Error).message, 'bad')) }),
    bus.on('clear_draft', () => art.clearDraft()),
    bus.on('mount_maps', ({ small, big }) => { minimap = new Minimap(level, small, big) }),
    bus.on('map_click', ({ px, py }) => {
      const hit = minimap?.hit(px, py, walker.state)
      if (hit) { walker.teleport(walker.state.level, hit[0], hit[1]); showMap(false); bus.toast(`moved to ${floorOf(level, walker.state.level).name} floor`) }
      else bus.toast('not a floor there', 'warn')
    }),
    bus.on('map_toggle', () => showMap(!bigShown)),
  )

  // ---- verbs (GAME.md §1): click = do, E = touch, right click / Q = put back, R = turn, 1-0 = pick, wheel = slide ----------
  const toggleDoor = (): boolean => {
    const d = walker.nearestDoor(); if (!d) return false
    if (!d.opening.door?.toggle) { bus.toast('locked', 'warn'); return true }
    d.open = !d.open; return true
  }
  const openMenu = (tab?: string) => { if (menuOpen) return; menuOpen = true; closeTouch(); input.release(); bus.emit('menu', { show: true, tab }) }
  const closeMenu = () => { if (!menuOpen) return; menuOpen = false; bus.emit('menu', { show: false }); void input.lock() }
  let ringKind: 'actions' | 'look' = 'actions'
  const touchSnap = (p: Placed) => { const a = art.library.find((x) => x.id === p.art); return { placed: p.id, kind: p.kind, title: a?.title ?? 'work', size: a ? `${a.w} × ${a.h} × ${a.d} cm` : '', ring: ringKind } }
  const openTouch = (p: Placed, ring: 'actions' | 'look' = 'actions') => { ringKind = ring; touch = p; walker.frozen = true; art.selected = p.id; artSnapshot(); bus.emit('touch', { touch: touchSnap(p) }); const sz = renderer.size; input.openRing(sz.x / 2, sz.y / 2) }
  const closeTouch = () => { if (!touch) return; touch = null; walker.frozen = false; art.selected = null; anchors.set('touch', null); artSnapshot(); input.closeRing(); bus.emit('touch', { touch: null }) }
  const touchAction = (action: TouchAction) => {
    const p = touch; if (!p) return
    switch (action) {
      case 'move': closeTouch(); input.clearClick(); art.selected = p.id; if (art.pickup()) bus.toast(`${art.held?.title} in your hands · click puts it back · right click puts it down`); break
      case 'down': closeTouch(); art.selected = p.id; if (art.remove()) bus.toast(`${nameOf(p.art)} taken down · back in the bar · ctrl z brings it back`); break
      case 'swap': case 'swapback': { const n = art.swapInPlace(p, action === 'swap' ? 1 : -1); if (n) { bus.toast(`swapped for ${n.title}`); bus.emit('touch', { touch: touchSnap(p) }) } else { bus.toast('nothing free of that kind in the bar', 'warn') } break }
      case 'turn': case 'turnback': art.selected = p.id; art.rotate(action === 'turn' ? 15 : -15); break
      case 'alignWall': bus.toast(`${art.snapAll(p.wall)} aligned on this wall`); break
      case 'alignAll': bus.toast(`${art.snapAll()} aligned`); break
      case 'done': closeTouch(); break
    }
  }
  const putBack = () => {
    if (touch) { closeTouch(); return }
    // owner 09-06: right click on a sculpture = its look ring (colours and materials, the sculpture only, never the plinth)
    if (!art.held) { const t = art.target(); if (t && t.kind === 'sculpture') { openTouch(t, 'look'); return } }
    if (art.held) { art.hold(null); bus.toast('put back in the bar'); return }
  }
  input.onVerb = (verb: Verb, e) => {
    if (verb === 'back') { if (menuOpen) closeMenu(); else if (bigShown) showMap(false); else if (touch) closeTouch(); return }
    if (menuOpen) { if (verb === 'menu') closeMenu(); return }
    if (bigShown) { if (verb === 'menu' || verb === 'map') showMap(false); return }
    // the public door (SHOW.md §2): walk, look, the room's doors, the map, settings. Nothing moves.
    if (!ours()) { if (verb === 'touch') { if (!toggleDoor()) bus.toast('nothing to touch here', 'warn') } else if (verb === 'menu') openMenu(); else if (verb === 'map') showMap(true); else if (verb === 'debug') bus.emit('debug_toggle', {}); return }
    switch (verb) {
      case 'menu': openMenu(); break
      case 'keys': openMenu('keys'); break
      case 'debug': bus.emit('debug_toggle', {}); break
      case 'undo': case 'redo': closeTouch(); bus.toast((verb === 'redo' ? art.doRedo() : art.doUndo()) ? verb : 'nothing to undo'); break
      case 'do': {
        if (touch) { input.clearClick(); bus.emit('ring_confirm', {}); input.clearClick(); return }
        if (!art.held) { const t = art.target(); if (t) { openTouch(t); return } }
        const r = art.place()
        if (r === 'placed') bus.toast('down · walk up to it and press e to touch it')
        else if (r === 'refused') bus.toast(art.preview.why || (art.held?.kind === 'sculpture' ? 'look at the floor' : 'look at a hang wall'), 'warn')
        else if (r === 'picked') bus.toast(`${art.held?.title} in your hands`)
        else input.clearClick()
        break
      }
      case 'touch': {
        if (touch) { closeTouch(); return }
        if (!art.held) { const t = art.target(); if (t) { openTouch(t); return } }
        if (!toggleDoor()) bus.toast('nothing to touch here', 'warn')
        break
      }
      case 'putback': putBack(); break
      case 'turn': case 'turnback': if (touch) touchAction(verb); else if (!art.rotate(verb === 'turn' ? 15 : -15)) bus.toast('hold or look at a sculpture first', 'warn'); else artSnapshot(); break
      case 'cycleNext': case 'cyclePrev': if (touch) touchAction(verb === 'cycleNext' ? 'swap' : 'swapback'); else { art.swap(verb === 'cycleNext' ? 1 : -1); } break
      case 'map': showMap(true); break
      case 'hands': art.hands = !art.hands; artSnapshot(); bus.toast(art.hands ? 'hands view on' : 'hands view off'); break
      case 'gap': if (art.held?.kind === 'painting') guideGap(); break
      case 'select': { const p = art.selectNext(); artSnapshot(); bus.toast(p ? `selected ${nameOf(p.art)} · e touch · delete · arrows` : 'nothing selected'); break }
      case 'remove': { if (touch) { touchAction('down'); return } const t = art.target(); if (t && art.remove()) bus.toast(`${nameOf(t.art)} taken down · back in the bar · ctrl z brings it back`); else { bus.toast('look at a hung work, or tab to select one', 'warn'); } break }
    }
    void e
  }
  input.onSlot = (n) => {
    if (menuOpen || !ours()) return
    if (touch) { bus.emit('ring_key', { n }); return }
    const a = art.library[n]; if (!a) { return }
    bus.emit('hold', { id: a.id })
  }
  input.onArrow = (du, dy, e) => {
    if (menuOpen) return
    if (touch) art.selected = touch.id
    else if (art.held?.kind === 'painting') { e.preventDefault(); if (dy) guideHeight(dy); else if (du) guideSnap(du > 0 ? 1 : -1); return }
    if (art.nudge(du, dy)) e.preventDefault()
  }
  // the wall widget (owner 09-06: the mouse is taken, so it is keys and wheel): height, snap line, gap
  const SNAPS = ['top', 'centre', 'bottom', 'free'] as const
  const guideHeight = (cm: number): boolean => { const g = art.layout.guides; if (g.snap === 'free') { bus.toast('free: the crosshair sets the height', 'warn'); return false } const v = Math.max(0, Math.min(400, g[g.snap] + cm)); art.setGuides({ [g.snap]: v } as Partial<typeof g>); bus.emit('widget_flash', { key: 'height' }); return true }
  const guideSnap = (step: number): void => { const g = art.layout.guides; const i = SNAPS.indexOf(g.snap); art.setGuides({ snap: SNAPS[((i + step) % 4 + 4) % 4] }); bus.emit('widget_flash', { key: 'snap' }) }
  const guideGap = (): void => { const g = art.layout.guides; const steps = [0, 5, 10, 20]; const i = steps.indexOf(g.gap); art.setGuides({ gap: steps[(i + 1) % steps.length] }); bus.emit('widget_flash', { key: 'gap' }); bus.toast(`gap ${art.layout.guides.gap} cm`) }
  input.onWheel = (step, big) => {
    if (menuOpen) return
    if (touch) { touchAction(step > 0 ? 'swap' : 'swapback'); return }
    if (art.held?.kind === 'painting') { guideHeight((step > 0 ? -1 : 1) * (big ? 10 : 1)); return }
    art.swap(step)
  }
  // losing the lock (esc) frees the mouse and nothing more: click puts you back; the menu is the settings button top right (owner 09-07)
  bus.on('menu_close', () => closeMenu())
  bus.on('menu_open', () => openMenu())
  bus.on('ui_ring', ({ open, x, y }) => { if (open) input.openRing(x, y); else input.closeRing() })
  // token save (ART.md §4, the owner's path): layouts/<name>.json into the repo through the GitHub contents API
  bus.on('repo_save', ({ name, token }) => {
    const f = art.exportFile(); const path = `layouts/${(name || art.layout.name || 'layout').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.json`
    const api = `https://api.github.com/repos/koan-shdw/SHDW-world/contents/${path}`
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
    const body = (sha?: string) => JSON.stringify({ message: `layout: ${path}`, content: btoa(unescape(encodeURIComponent(f.json))), sha })
    fetch(api, { headers }).then((r) => (r.ok ? r.json() : null)).then((cur) => fetch(api, { method: 'PUT', headers, body: body(cur?.sha) }))
      .then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`); bus.emit('repo_saved', { ok: true, url: `${location.origin}${location.pathname}?layout=${path.slice(8, -5)}` }); bus.toast(`saved to the repo · ${path}`, 'warn') })
      .catch((e) => { bus.emit('repo_saved', { ok: false, error: (e as Error).message }); bus.toast(`repo save failed · ${(e as Error).message}`, 'bad') })
  })
  bus.on('touch_action', ({ action }) => touchAction(action))

  // ---- loop --------------------------------------------------------------------------------------------------
  let lastWalk = '', lastHud = '', lastFocus = ''
  let elapsed = 0
  const tv = new THREE.Vector3()
  const STEP = 1 / 120; let acc = 0
  // SHOW.md §4: every 10 s, send what waits and bring in what the other person did
  const tick = window.setInterval(async () => { const d = await store.tick(); if (d && art.store && art.applyShow(d.items, d.deleted)) artSnapshot() }, TICK_MS)
  renderer.start((dt) => {
    elapsed += dt; looks.update(elapsed)
    // fixed step (GAME.md §1): the walker moves in 1/120 s steps, the camera blends between the last two
    input.pollPad(dt)
    acc += Math.min(dt, 0.1); let steps = 0
    while (acc >= STEP && steps < 12) { walker.snapshot(); walker.update(STEP); acc -= STEP; steps++ }
    walker.applyCamera(Math.min(1, acc / STEP))
    camera.updateMatrixWorld()
    updateDoors(built.doors, dt)
    art.update(dt, elapsed * 6)
    // the click buffer: a click that came just before the ghost turned green still lands
    if (art.held && !touch && art.preview.ok && input.takeClick()) input.onVerb?.('do', new MouseEvent('mousedown'))
    const s = walker.state
    const locked = s.locked
    // the touch menu follows its work and closes when you walk away
    if (touch) {
      const p = art.layout.items.find((x) => x.id === touch!.id)
      if (!p) closeTouch()
      else {
        const a = art.library.find((x) => x.id === p.art)
        const c = p.kind === 'sculpture' && p.pos ? tv.set(p.pos[0], p.pos[1] + (a ? a.h / 200 + (p.plinth?.h ?? 0) / 100 : 1), p.pos[2]) : (() => { const w = level.walls.find((x) => x.id === p.wall); if (!w || !a) return tv.set(0, 0, 0); const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1]; const L = Math.hypot(dx, dz) || 1; const uc = p.u + a.w / 200; return tv.set(w.a[0] + dx / L * uc, floorOf(level, p.level).floorY + p.topY - a.h / 200, w.a[1] + dz / L * uc) })()
        if (c.distanceTo(camera.position) > 2.3) closeTouch(); else anchors.set('touch', c)
      }
    }
    let hangTip: string | null = null
    const lookAt = locked && !art.held ? art.lookedAt() : null
    if (locked) {
      const pv = art.preview
      if (art.held) {
        hangTip = art.held.kind === 'sculpture'
          ? (pv.floor ? (pv.ok ? 'place' : pv.why) : null)
          : (pv.hit ? (pv.ok ? 'hang' : pv.why) : null)
      } else if (art.selected && !touch) {
        const sel = art.layout.items.find((p) => p.id === art.selected)
        if (sel) hangTip = nameOf(sel.art)
      }
    }
    const near = locked ? walker.nearestDoor() : null
    const doorTip = near ? (near.opening.door?.toggle ? (near.open ? 'close' : 'open') : 'locked') : null
    const target = !!lookAt && !touch
    const hudKey = `${locked}|${menuOpen}|${hangTip}|${doorTip}|${target}`
    if (hudKey !== lastHud) { lastHud = hudKey; bus.emit('hud', { hint: locked || menuOpen || bigShown ? null : 'enter', cross: locked, doorTip, hangTip, target }) }
    const fNow = locked ? art.focus() : null; const fKey = fNow ? `${fNow.art.id}|${fNow.placed?.id ?? ''}` : ''
    if (fKey !== lastFocus) { lastFocus = fKey; artSnapshot() }
    const walkKey = `${s.level}|${s.x.toFixed(2)}|${s.z.toFixed(2)}|${s.onStair}|${locked}`
    if (walkKey !== lastWalk) { lastWalk = walkKey; bus.emit('walk_state', { level: s.level, levelName: floorOf(level, s.level).name, x: s.x, z: s.z, onStair: !!s.onStair, locked }) }
    minimap?.draw(s)
    intro.update(elapsed, looks.void.flash, looks.void.flashAt)
    // anchors: the wall widget rides the ghost; a touchable work carries its prompt
    anchors.set('hang-widget', locked && art.held?.kind === 'painting' && art.preview.hit ? art.preview.hit.point : null)
    if (lookAt && !touch) { const a = art.library.find((x) => x.id === lookAt.art); const pf = floorOf(level, lookAt.level).floorY; const w = level.walls.find((x) => x.id === lookAt.wall); if (a && w && lookAt.kind === 'painting') { const [dx, dz] = [w.b[0] - w.a[0], w.b[1] - w.a[1]]; const L = Math.hypot(dx, dz) || 1; const uc = lookAt.u + a.w / 200; anchors.set('work', new THREE.Vector3(w.a[0] + dx / L * uc, pf + lookAt.topY + 0.08, w.a[1] + dz / L * uc), ours() ? 'touch' : a.title) } else if (a && lookAt.pos) anchors.set('work', new THREE.Vector3(lookAt.pos[0], lookAt.pos[1] + a.h / 100 + (lookAt.plinth?.h ?? 0) / 100 + 0.1, lookAt.pos[2]), ours() ? 'touch' : a.title) }
    else anchors.set('work', null)
    const sz = renderer.size; anchors.publish(camera, sz.x, sz.y)
  })

  // ---- debug handle + shot(): renders and posts a JPEG to the dev server (docs/sheet) --------------------------------
  const shot = async (name: string): Promise<string> => {
    renderer.renderOnce()
    const url = renderer.gl.domElement.toDataURL('image/jpeg', 0.92)
    const r = await fetch(`${base}__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url })
    return r.text()
  }
  const plan = async (name: string, x0 = -0.5, z0 = -4.6, x1 = 8.0, z1 = 5.2, maxY = -2.5, ppm = 100): Promise<string> => {
    const w = Math.round((x1 - x0) * ppm), h = Math.round((z1 - z0) * ppm)
    const cam = new THREE.OrthographicCamera(x0, x1, -z0, -z1, 0.1, 50)
    cam.position.set(0, maxY, 0); cam.up.set(0, 0, -1); cam.lookAt(0, -100, 0)
    cam.near = 0.1; cam.far = maxY + 100; cam.updateProjectionMatrix()
    const keep = renderer.size
    renderer.gl.setSize(w, h, false); renderer.gl.render(scene, cam)
    const url = renderer.gl.domElement.toDataURL('image/png')
    renderer.gl.setSize(keep.x, keep.y, false); renderer.resize()
    const r = await fetch(`${base}__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url })
    return r.text()
  }
  const view = (lvl: string, x: number, z: number, yawDeg: number, pitchDeg = 0): void => {
    walker.teleport(lvl, x, z); walker.state.yaw = THREE.MathUtils.degToRad(yawDeg); walker.state.pitch = THREE.MathUtils.degToRad(pitchDeg); walker.snapshot(); walker.update(0.016); walker.applyCamera(1); camera.updateMatrixWorld()
  }
  ;(window as unknown as { koanHang: unknown }).koanHang = {
    walker, level, scene, renderer: renderer.gl, composer: renderer.composer, camera, shot, plan, view, THREE, built, toggleDoor, art, loader, bus, roomBVH,
    setMode: () => undefined, meshAudit: () => meshAudit(level, built.group), skyLeakAudit: () => skyLeakAudit(level, built.group, built.doors),
    input, feel, quality: (q: 'full' | 'balanced' | 'low') => renderer.setQuality(q), getQuality: () => renderer.quality, smaa: renderer.smaa, looks,
  }

  const dispose = () => {
    for (const off of offs) off()
    clearInterval(tick)
    input.onVerb = null; input.onLook = null; input.onSlot = null; input.onArrow = null; input.onWheel = null
    renderer.active = false; loader.dispose(); renderer.gl.dispose()
  }
  return { renderer, level, art, walker, dispose }
}
