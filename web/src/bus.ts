// The event bus (REMAKE.md §2). The only way world/ and ui/ talk. Typed, synchronous, no framework.
import type { ArtItem, Layout, Guides, SculptLook, Placed, Kind } from './world/art/art'

export type Mode = 'walk' | 'hang' | 'level'
export type Look = 'clean' | 'wire' | 'textured'
export type ToastKind = 'ok' | 'warn' | 'bad'
export type Quality = 'full' | 'balanced' | 'low'
export type FxKey = 'lut' | 'sky' | 'plants' | 'glass' | 'surface' | 'outline' | 'dither' | 'smaa'
export type FxState = Record<FxKey, boolean>
export type Who = 'SHDW' | 'YOZO'

export interface PlaySettings { sensitivity: number; fov: number; reduceMotion: boolean; headBob: boolean }


export interface WalkSnapshot { level: string; levelName: string; x: number; z: number; onStair: boolean; locked: boolean }
export interface HudSnapshot { hint: 'enter' | null; cross: boolean; doorTip: string | null; hangTip: string | null; target: boolean }
export type TouchAction = 'move' | 'down' | 'swap' | 'swapback' | 'turn' | 'turnback' | 'done' | 'alignWall' | 'alignAll'
export interface TouchSnapshot { placed: string; kind: Kind; title: string; size: string; ring: 'actions' | 'look' }
export interface Focus { art: string; placed: string | null; look: SculptLook; parts: string[] }
export interface ArtSnapshot { library: ArtItem[]; held: string | null; layout: Layout; selected: string | null; placed: Record<string, number>; hands: boolean; focus: Focus | null }
export type { Placed }
export interface RoomInfo { hangWalls: number; stairs: number; doors: number; floors: number; eyeCm: number; walls: number }
export interface LoaderState { active: boolean; done: number; total: number; text: string }

export interface Events {
  // world → ui
  world_ready: RoomInfo
  world_failed: { message: string }
  walk_state: WalkSnapshot
  hud: HudSnapshot
  art_state: ArtSnapshot
  menu: { show: boolean; tab?: string }
  play: { settings: PlaySettings }
  widget_flash: { key: 'height' | 'snap' | 'gap' }   // the wall widget lights the value a key just changed
  ring_aim: { x: number; y: number }            // the ring's aim vector, from mouse deltas or the right stick
  ring_confirm: Record<string, never>            // click / A while the ring is open: do the hot slice
  ring_key: { n: number }                          // 1-9 while a ring is open: that slice
  touch: { touch: TouchSnapshot | null }
  look: { look: Look }
  fx: { state: FxState }
  quality: { quality: Quality }
  toast: { msg: string; kind?: ToastKind; ms?: number }
  loader: LoaderState
  file_ready: { name: string; json: string; skipped: string[] }
  map_show: { show: boolean }
  anchor: { id: string; x: number; y: number; visible: boolean; text?: string }   // R3: world points the UI follows (HANG widget, work labels)
  // ui → world
  menu_close: Record<string, never>
  menu_open: Record<string, never>
  door_state: { open: boolean; who: Who | null }      // SHOW.md §3: the door in this browser
  door_check: { key: string; who: Who }
  door_result: { ok: boolean; error?: string }
  door_leave: Record<string, never>
  set_play: { patch: Partial<PlaySettings> }
  touch_action: { action: TouchAction }
  set_look: { look: Look }
  set_fx: { key: FxKey; on: boolean }
  set_quality: { quality: Quality }
  set_eye: { cm: number }
  accent: { css: string }
  hold: { id: string | null }
  add_local: { item: Omit<ArtItem, 'id' | 'kind'> & { data: string; kind?: 'painting' | 'sculpture' } }
  remove_local: { id: string }
  set_guides: { patch: Partial<Guides> }
  set_sculpt: { patch: Partial<SculptLook> }
  ui_ring: { open: boolean; x: number; y: number }          // a ring opened by the UI with the mouse free (the bar)
  repo_save: { name: string; token: string }
  repo_saved: { ok: boolean; url?: string; error?: string }
  rotate: { deg: number }
  probe_model: { data: string; key: number }
  model_probed: { key: number; w: number; h: number; d: number; error?: string }
  snap_all: { wall: 'looked' | 'all' }
  set_name: { name: string }
  export_file: Record<string, never>
  import_file: { text: string; name: string }
  clear_draft: Record<string, never>
  mount_maps: { small: HTMLCanvasElement; big: HTMLCanvasElement }
  map_click: { px: number; py: number }
  map_toggle: Record<string, never>
  render_active: { active: boolean }
  debug_toggle: Record<string, never>
}

type Handler<T> = (payload: T) => void

export class Bus {
  private handlers = new Map<keyof Events, Set<Handler<unknown>>>()
  on<K extends keyof Events>(name: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(name)
    if (!set) { set = new Set(); this.handlers.set(name, set) }
    set.add(fn as Handler<unknown>)
    return () => { set!.delete(fn as Handler<unknown>) }
  }
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.handlers.get(name); if (!set) return
    for (const fn of Array.from(set)) { try { fn(payload) } catch (e) { console.error(`bus ${String(name)}:`, e) } }
  }
  toast(msg: string, kind: ToastKind = 'ok', ms?: number): void { this.emit('toast', { msg, kind, ms }) }
}

export const bus = new Bus()
