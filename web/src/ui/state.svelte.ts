// UI state (REMAKE.md §2, GAME-UI): what the HTML layer knows, fed by the bus. Svelte 5 runes. The UI never imports world/.
import { bus, type Who, type Look, type RoomInfo, type WalkSnapshot, type HudSnapshot, type ArtSnapshot, type LoaderState, type ToastKind, type FxState, type Quality, type TouchSnapshot, type PlaySettings } from '../bus'

export interface Toast { id: number; msg: string; kind: ToastKind }

export const ui = $state({
  look: 'textured' as Look,
  fx: null as FxState | null,
  quality: 'full' as Quality,
  room: null as RoomInfo | null,
  failed: null as string | null,
  walk: null as WalkSnapshot | null,
  hud: { hint: 'enter', cross: false, doorTip: null, hangTip: null, target: false } as HudSnapshot,
  art: null as ArtSnapshot | null,
  loader: { active: false, done: 0, total: 0, text: '' } as LoaderState,
  mapShown: false,
  menuShown: false,
  menuTab: 'controls',
  touch: null as TouchSnapshot | null,
  play: null as PlaySettings | null,
  debugShown: false,
  toasts: [] as Toast[],
  anchors: {} as Record<string, { x: number; y: number; visible: boolean; text?: string }>,
  ringAim: null as { x: number; y: number } | null,
  widgetFlash: null as string | null,
  ringHot: null as string | null,
  lookOpen: false,
  slotRing: null as { id: string; x: number; y: number; title: string; local: boolean; placed: boolean } | null,
  repo: { url: '', error: '' },
  entered: false,
  door: { open: false, who: null as Who | null },
  doorError: '',
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
bus.on('touch', ({ touch }) => { ui.touch = touch; ui.ringAim = null; ui.ringHot = null; if (!touch) ui.lookOpen = false })
bus.on('ring_aim', (a) => { ui.ringAim = a })
bus.on('repo_saved', (r) => { ui.repo = { url: r.url ?? '', error: r.error ?? '' } })
bus.on('door_state', (d) => { ui.door = d; if (d.open) ui.doorError = '' })
bus.on('door_result', (r) => { ui.doorError = r.ok ? '' : (r.error ?? 'wrong word') })
let flashT = 0
bus.on('widget_flash', ({ key }) => { ui.widgetFlash = key; clearTimeout(flashT); flashT = window.setTimeout(() => (ui.widgetFlash = null), 400) })
bus.on('play', ({ settings }) => { ui.play = settings })
bus.on('debug_toggle', () => { ui.debugShown = !ui.debugShown })
bus.on('anchor', (a) => { ui.anchors[a.id] = a })
bus.on('toast', ({ msg, kind, ms }) => {
  if (!kind || kind === 'ok') return                       // owner 09-06: no chatter, errors only
  const t: Toast = { id: toastSeq++, msg, kind: kind ?? 'ok' }
  ui.toasts.push(t)
  setTimeout(() => { const i = ui.toasts.findIndex((x) => x.id === t.id); if (i >= 0) ui.toasts.splice(i, 1) }, ms ?? 4000)
})

export const nameOf = (id: string): string => ui.art?.library.find((x) => x.id === id)?.title ?? 'work'
