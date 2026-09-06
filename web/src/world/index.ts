// The world (REMAKE.md §2): three.js only, never touches the DOM it did not make (the canvas). Talks to the UI through the bus.
// Boot: renderer → loader → room → walk → art → keys → loop. Every rule and key from gate 1 (c830ca4) is here unchanged.
import * as THREE from 'three'
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { bus, type Look, type TouchAction } from '../bus'
import type { Placed } from './art/art'
import { Renderer } from './renderer'
import { Loader } from './loader'
import { loadLevel, buildLevel, updateDoors, floorOf, setWireColor, meshAudit, skyLeakAudit, applyTextures, worldUVs, MAPS, type Level } from './room/level'
import { Walker, isTyping } from './walk'
import { Minimap } from './minimap'
import { ArtSystem } from './art/art'
import { Anchors } from './anchors'
import { Looks } from './looks'

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
  const art = new ArtSystem(level, scene, walker, camera, DATA, loader)
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
    bus.emit('art_state', { library: art.library, held: art.held?.id ?? null, layout: art.layout, selected: art.selected, placed, hands: art.hands, focus: f ? { art: f.art.id, placed: f.placed?.id ?? null, look: art.lookOf(f.art, f.placed) } : null })
  }
  art.onChange = artSnapshot
  await art.load()
  artSnapshot()
  walker.onChange = () => art.onLevelChange()

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
    bus.on('hold', ({ id }) => {
      const a = id ? art.library.find((x) => x.id === id) ?? null : null
      art.hold(a && art.held?.id === a.id ? null : a)
      bus.toast(art.held ? `holding ${art.held.title} · look at a wall, click` : 'put down')
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
    bus.on('import_file', ({ text, name }) => { void art.importFile(text).then((r) => bus.toast(`loaded ${name} · ${r.works} works · ${r.art} new images`)).catch((e) => bus.toast((e as Error).message, 'bad')) }),
    bus.on('clear_draft', () => art.clearDraft()),
    bus.on('mount_maps', ({ small, big }) => { minimap = new Minimap(level, small, big) }),
    bus.on('map_click', ({ px, py }) => {
      const hit = minimap?.hit(px, py, walker.state)
      if (hit) { walker.teleport(walker.state.level, hit[0], hit[1]); showMap(false); bus.toast(`moved to ${floorOf(level, walker.state.level).name} floor`) }
      else bus.toast('not a floor there', 'warn')
    }),
    bus.on('map_toggle', () => showMap(!bigShown)),
    bus.on('menu_close', () => closeMenu()),
    bus.on('touch_action', ({ action }) => touchAction(action)),
  )

  // ---- keys (gate 1 rules, GAME-UI §3-§6 shell) -----------------------------------------------------------------
  const toggleDoor = () => {
    const d = walker.nearestDoor(); if (!d) return
    if (!d.opening.door?.toggle) { bus.toast('this door does not open', 'warn'); return }
    d.open = !d.open
  }
  const lock = () => { if (!walker.state.locked) renderer.gl.domElement.requestPointerLock() }
  const openMenu = (tab?: string) => { menuOpen = true; closeTouch(); walker.release(); bus.emit('menu', { show: true, tab }) }
  const closeMenu = () => { if (!menuOpen) return; menuOpen = false; bus.emit('menu', { show: false }); lock() }
  const touchSnap = (p: Placed) => { const a = art.library.find((x) => x.id === p.art); return { placed: p.id, kind: p.kind, title: a?.title ?? 'work', size: a ? `${a.w} × ${a.h} × ${a.d} cm` : '' } }
  const openTouch = (p: Placed) => { touch = p; art.selected = p.id; artSnapshot(); bus.emit('touch', { touch: touchSnap(p) }) }
  const closeTouch = () => { if (!touch) return; touch = null; art.selected = null; anchors.set('touch', null); artSnapshot(); bus.emit('touch', { touch: null }) }
  const touchAction = (action: TouchAction) => {
    const p = touch; if (!p) return
    switch (action) {
      case 'move': closeTouch(); art.selected = p.id; if (art.pickup()) bus.toast(`${art.held?.title} in your hands · look, click puts it back · q puts it down`); break
      case 'down': closeTouch(); art.selected = p.id; if (art.remove()) bus.toast(`${nameOf(p.art)} taken down · ctrl z brings it back`); break
      case 'swap': case 'swapback': { const n = art.swapInPlace(p, action === 'swap' ? 1 : -1); if (n) { bus.toast(`swapped for ${n.title}`); bus.emit('touch', { touch: touchSnap(p) }) } else bus.toast('nothing else of that kind in the library', 'warn'); break }
      case 'turn': case 'turnback': art.selected = p.id; if (art.rotate(action === 'turn' ? 15 : -15)) bus.toast('turned 15°'); break
      case 'alignWall': bus.toast(`${art.snapAll(p.wall)} aligned on this wall`); break
      case 'alignAll': bus.toast(`${art.snapAll()} aligned`); break
      case 'done': closeTouch(); break
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    if (menuOpen) { if (e.code === 'Escape') closeMenu(); return }
    if (bigShown) { if (e.code === 'Escape' || e.code === 'KeyM') showMap(false); return }
    if (e.code === 'Backquote') { bus.emit('debug_toggle', {}); return }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); closeTouch(); bus.toast((e.shiftKey ? art.doRedo() : art.doUndo()) ? (e.shiftKey ? 'redo' : 'undo') : 'nothing to undo'); return }
    if (touch) {
      if (e.code === 'Escape' || e.code === 'KeyE') { closeTouch(); return }
      if (e.code === 'Digit1') { touchAction('move'); return }
      if (e.code === 'Digit2') { touchAction('down'); return }
      if (e.code === 'Digit3') { touchAction(e.shiftKey ? 'swapback' : 'swap'); return }
      if (e.code === 'Digit4') { touchAction(e.shiftKey ? 'turnback' : 'turn'); return }
      if (e.code === 'Comma') { touchAction('swapback'); return }
      if (e.code === 'Period') { touchAction('swap'); return }
      if (e.code === 'KeyR') { touchAction(e.shiftKey ? 'turnback' : 'turn'); return }
      if (e.code === 'Delete' || e.code === 'Backspace') { touchAction('down'); return }
      if (e.code.startsWith('Arrow')) { const st = e.shiftKey ? 10 : 1; const du = e.code === 'ArrowLeft' ? -st : e.code === 'ArrowRight' ? st : 0; const dy = e.code === 'ArrowUp' ? st : e.code === 'ArrowDown' ? -st : 0; art.selected = touch.id; if (art.nudge(du, dy)) e.preventDefault(); return }
      return
    }
    if (e.code === 'Escape') { if (walker.state.locked) { openMenu(); return } openMenu(); return }
    if (!walker.state.locked) return
    if (e.code === 'BracketLeft' || e.code === 'Comma') { art.swap(-1); return }
    if (e.code === 'BracketRight' || e.code === 'Period') { art.swap(1); return }
    if (/^Digit[0-9]$/.test(e.code)) { const n = Number(e.code.slice(5)); const a = art.library[n === 0 ? 9 : n - 1]; if (a) art.hold(art.held?.id === a.id ? null : a); return }
    if (e.code === 'Tab') { e.preventDefault(); const p = art.selectNext(); artSnapshot(); bus.toast(p ? `selected ${nameOf(p.art)} · delete, arrows, e` : 'nothing selected'); return }
    if (e.code === 'KeyH') { art.hands = !art.hands; artSnapshot(); bus.toast(art.hands ? 'hands view on' : 'hands view off'); return }
    if (e.code === 'KeyQ') { art.hold(null); return }
    if (e.code === 'KeyR') { if (art.rotate(e.shiftKey ? -15 : 15)) { artSnapshot(); bus.toast('turned 15°') } return }
    if (e.code === 'Delete' || e.code === 'Backspace') { const t = art.target(); if (t && art.remove()) bus.toast(`${nameOf(t.art)} taken down · ctrl z brings it back`); else bus.toast('look at a hung work, or tab to select one', 'warn'); return }
    if (e.code.startsWith('Arrow')) { const st = e.shiftKey ? 10 : 1; const du = e.code === 'ArrowLeft' ? -st : e.code === 'ArrowRight' ? st : 0; const dy = e.code === 'ArrowUp' ? st : e.code === 'ArrowDown' ? -st : 0; if (art.nudge(du, dy)) e.preventDefault(); return }
    if (e.code === 'KeyE') {
      if (!art.held) { const t = art.target(); if (t) { openTouch(t); return } }
      toggleDoor(); return
    }
    if (e.code === 'KeyM') showMap(true)
    else if (e.key === '?') openMenu('keys')
  }
  window.addEventListener('keydown', onKey)
  const onDown = (e: MouseEvent) => {
    if (!walker.state.locked || e.button !== 0) return
    if (touch) { return }
    const r = art.place()
    if (r === 'placed') bus.toast(art.held?.kind === 'sculpture' ? `placed ${art.held.title} · ctrl z undoes` : `hung ${art.held?.title} · ctrl z undoes · walk up and press e to touch it`)
    else if (r === 'refused') bus.toast(art.preview.why || (art.held?.kind === 'sculpture' ? 'look at the floor' : 'look at a hang wall'), 'warn')
    else if (r === 'picked') bus.toast(`${art.held?.title} in your hands · look, click puts it back · q puts it down`)
  }
  const onWheel = (e: WheelEvent) => { if (!walker.state.locked) return; e.preventDefault(); if (touch) touchAction(e.deltaY > 0 ? 'swap' : 'swapback'); else art.swap(e.deltaY > 0 ? 1 : -1) }
  renderer.gl.domElement.addEventListener('mousedown', onDown)
  renderer.gl.domElement.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('pointerlockchange', () => { if (!walker.state.locked && !menuOpen && !bigShown) { /* the browser let go (esc): the menu opens */ menuOpen = true; closeTouch(); bus.emit('menu', { show: true }) } })

  // ---- loop --------------------------------------------------------------------------------------------------
  let lastWalk = '', lastHud = '', lastFocus = ''
  let elapsed = 0
  const tv = new THREE.Vector3()
  renderer.start((dt) => {
    elapsed += dt; looks.update(elapsed)
    walker.update(dt)
    updateDoors(built.doors, dt)
    art.update()
    const s = walker.state
    const locked = s.locked
    // the touch menu follows its work and closes when you walk away
    if (touch) {
      const p = art.layout.items.find((x) => x.id === touch!.id)
      if (!p) closeTouch()
      else {
        const a = art.library.find((x) => x.id === p.art)
        const c = p.kind === 'sculpture' && p.pos ? tv.set(p.pos[0], p.pos[1] + (a ? a.h / 200 + (p.plinth?.h ?? 0) / 100 : 1), p.pos[2]) : (() => { const w = level.walls.find((x) => x.id === p.wall); if (!w || !a) return tv.set(0, 0, 0); const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1]; const L = Math.hypot(dx, dz) || 1; const uc = p.u + a.w / 200; return tv.set(w.a[0] + dx / L * uc, floorOf(level, p.level).floorY + p.topY - a.h / 200, w.a[1] + dz / L * uc) })()
        if (c.distanceTo(camera.position) > 3.4) closeTouch(); else anchors.set('touch', c)
      }
    }
    let hangTip: string | null = null
    const lookAt = locked && !art.held ? art.lookedAt() : null
    if (locked) {
      const pv = art.preview
      if (art.held) {
        hangTip = art.held.kind === 'sculpture'
          ? (pv.floor ? (pv.ok ? `click · place here · r turns` : `can't place here · ${pv.why}`) : 'look at the floor')
          : (pv.hit ? (pv.ok ? 'click · hang here' : `can't hang here · ${pv.why}`) : 'look at a wall')
      } else if (art.selected && !touch) {
        const sel = art.layout.items.find((p) => p.id === art.selected)
        if (sel) hangTip = `${nameOf(sel.art)} selected · e touch · delete · arrows · tab next`
      }
    }
    const near = locked ? walker.nearestDoor() : null
    const doorTip = near ? (near.opening.door?.toggle ? (near.open ? 'e · close door' : 'e · open door') : 'door · closed') : null
    const hudKey = `${locked}|${menuOpen}|${hangTip}|${doorTip}`
    if (hudKey !== lastHud) { lastHud = hudKey; bus.emit('hud', { hint: locked || menuOpen || bigShown ? null : 'play', cross: locked, doorTip, hangTip }) }
    const fNow = locked ? art.focus() : null; const fKey = fNow ? `${fNow.art.id}|${fNow.placed?.id ?? ''}` : ''
    if (fKey !== lastFocus) { lastFocus = fKey; artSnapshot() }
    const walkKey = `${s.level}|${s.x.toFixed(2)}|${s.z.toFixed(2)}|${s.onStair}|${locked}`
    if (walkKey !== lastWalk) { lastWalk = walkKey; bus.emit('walk_state', { level: s.level, levelName: floorOf(level, s.level).name, x: s.x, z: s.z, onStair: !!s.onStair, locked }) }
    minimap?.draw(s)
    // anchors: the wall widget rides the ghost; a touchable work carries its prompt
    anchors.set('hang-widget', locked && art.held?.kind === 'painting' && art.preview.hit ? art.preview.hit.point : null)
    if (lookAt && !touch) { const a = art.library.find((x) => x.id === lookAt.art); const pf = floorOf(level, lookAt.level).floorY; const w = level.walls.find((x) => x.id === lookAt.wall); if (a && w && lookAt.kind === 'painting') { const [dx, dz] = [w.b[0] - w.a[0], w.b[1] - w.a[1]]; const L = Math.hypot(dx, dz) || 1; const uc = lookAt.u + a.w / 200; anchors.set('work', new THREE.Vector3(w.a[0] + dx / L * uc, pf + lookAt.topY + 0.08, w.a[1] + dz / L * uc), 'e · interact') } else if (a && lookAt.pos) anchors.set('work', new THREE.Vector3(lookAt.pos[0], lookAt.pos[1] + a.h / 100 + (lookAt.plinth?.h ?? 0) / 100 + 0.1, lookAt.pos[2]), 'e · interact') }
    else anchors.set('work', null)
    const sz = renderer.size; anchors.publish(camera, sz.x, sz.y)
  })
  bus.toast(`level built · ${level.walls.length} walls · click to play`)

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
    walker.teleport(lvl, x, z); walker.state.yaw = THREE.MathUtils.degToRad(yawDeg); walker.state.pitch = THREE.MathUtils.degToRad(pitchDeg); walker.update(0.016)
  }
  ;(window as unknown as { koanHang: unknown }).koanHang = {
    walker, level, scene, renderer: renderer.gl, composer: renderer.composer, camera, shot, plan, view, THREE, built, toggleDoor, art, loader, bus, roomBVH,
    setMode: () => undefined, meshAudit: () => meshAudit(level, built.group), skyLeakAudit: () => skyLeakAudit(level, built.group, built.doors),
    quality: (q: 'full' | 'balanced' | 'low') => renderer.setQuality(q), getQuality: () => renderer.quality, smaa: renderer.smaa, looks,
  }

  const dispose = () => {
    for (const off of offs) off()
    window.removeEventListener('keydown', onKey)
    renderer.gl.domElement.removeEventListener('mousedown', onDown); renderer.gl.domElement.removeEventListener('wheel', onWheel)
    renderer.active = false; loader.dispose(); renderer.gl.dispose()
  }
  return { renderer, level, art, walker, dispose }
}
