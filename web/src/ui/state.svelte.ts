// UI state (REMAKE.md §2, GAME-UI): what the HTML layer knows, fed by the bus. Svelte 5 runes. The UI never imports world/.
import { bus, type Look, type RoomInfo, type WalkSnapshot, type HudSnapshot, type ArtSnapshot, type LoaderState, type ToastKind, type FxState, type Quality, type TouchSnapshot } from '../bus'

export interface Toast { id: number; msg: string; kind: ToastKind }

export const ui = $state({
  look: 'textured' as Look,
  fx: null as FxState | null,
  quality: 'full' as Quality,
  room: null as RoomInfo | null,
  failed: null as string | null,
  walk: null as WalkSnapshot | null,
  hud: { hint: 'play', cross: false, doorTip: null, hangTip: null } as HudSnapshot,
  art: null as ArtSnapshot | null,
  loader: { active: false, done: 0, total: 0, text: '' } as LoaderState,
  mapShown: false,
  menuShown: false,
  menuTab: 'level',
  touch: null as TouchSnapshot | null,
  debugShown: false,
  toasts: [] as Toast[],
  anchors: {} as Record<string, { x: number; y: number; visible: boolean; text?: string }>,
})

let toastSeq = 0
bus.on('look', ({ look }) => { ui.look = look })
bus.on('fx', ({ state }) => { ui.fx = state })
bus.on('quality', ({ quality }) => { ui.quality = quality })
bus.on('world_ready', (r) => { ui.room = r })
bus.on('world_failed', ({ message }) => { ui.failed = message })
bus.on('walk_state', (w) => { ui.walk = w })
bus.on('hud', (h) => { ui.hud = h })
bus.on('art_state', (a) => { ui.art = a })
bus.on('loader', (l) => { ui.loader = l })
bus.on('map_show', ({ show }) => { ui.mapShown = show })
bus.on('menu', ({ show, tab }) => { ui.menuShown = show; if (tab) ui.menuTab = tab })
bus.on('touch', ({ touch }) => { ui.touch = touch })
bus.on('debug_toggle', () => { ui.debugShown = !ui.debugShown })
bus.on('anchor', (a) => { ui.anchors[a.id] = a })
bus.on('toast', ({ msg, kind, ms }) => {
  const t: Toast = { id: toastSeq++, msg, kind: kind ?? 'ok' }
  ui.toasts.push(t)
  setTimeout(() => { const i = ui.toasts.findIndex((x) => x.id === t.id); if (i >= 0) ui.toasts.splice(i, 1) }, ms ?? 4000)
})

export const nameOf = (id: string): string => ui.art?.library.find((x) => x.id === id)?.title ?? 'work'
