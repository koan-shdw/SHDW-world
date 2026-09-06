// Input (GAME.md §1): raw pointer lock, verbs on keys, a click buffer, the browser's context menu suppressed.
// Look applies on the mouse event itself, never a frame late. One sensitivity number. No smoothing, no acceleration.
import { bus } from '../bus'

export type Verb = 'do' | 'touch' | 'putback' | 'turn' | 'turnback' | 'cycleNext' | 'cyclePrev' | 'map' | 'menu' | 'hands' | 'select' | 'undo' | 'redo' | 'remove' | 'debug' | 'keys'
export interface PlaySettings { sensitivity: number; fov: number; reduceMotion: boolean; headBob: boolean }
const PLAY_KEY = 'shdw-world-play'
export const defaultPlay = (): PlaySettings => ({ sensitivity: 1.0, fov: 75, reduceMotion: false, headBob: true })

export class Input {
  readonly keys = new Set<string>()
  settings: PlaySettings = defaultPlay()
  locked = false
  rawSupported: boolean | null = null
  /** a click arrives here; the world reads and clears it when the moment is right (120 ms buffer) */
  clickAt = 0
  onLook: ((dx: number, dy: number) => void) | null = null
  onVerb: ((verb: Verb, e: KeyboardEvent | MouseEvent) => void) | null = null
  onSlot: ((n: number) => void) | null = null
  onArrow: ((du: number, dy: number, e: KeyboardEvent) => void) | null = null
  onWheel: ((step: number) => void) | null = null
  onLockChange: ((locked: boolean) => void) | null = null
  /** while a ring is open the mouse aims it instead of the camera */
  ringOpen = false
  private ringVec = { x: 0, y: 0 }
  private padPrev = new Map<number, boolean>()
  padActive = false
  static BASE_LOOK = 0.0022
  static BUFFER_MS = 120

  constructor(private dom: HTMLElement) {
    try { const s = localStorage.getItem(PLAY_KEY); if (s) Object.assign(this.settings, JSON.parse(s)) } catch { /* private */ }
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; if (!this.locked) this.keys.clear(); this.onLockChange?.(this.locked) })
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) { if (this.ringOpen) this.aimAbs(e.clientX, e.clientY); return }
      if (this.ringOpen) { this.ringVec.x = Math.max(-140, Math.min(140, this.ringVec.x + e.movementX)); this.ringVec.y = Math.max(-140, Math.min(140, this.ringVec.y + e.movementY)); bus.emit('ring_aim', { x: this.ringVec.x, y: this.ringVec.y }); return }
      this.onLook?.(e.movementX * Input.BASE_LOOK * this.settings.sensitivity, e.movementY * Input.BASE_LOOK * this.settings.sensitivity)
    })
    document.addEventListener('contextmenu', (e) => { e.preventDefault() })            // the game owns the right button
    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) { if (e.button === 0) void this.lock(); return }
      if (e.button === 0) { this.clickAt = performance.now(); this.onVerb?.('do', e) }
      else if (e.button === 2) this.onVerb?.('putback', e)
    })
    dom.addEventListener('wheel', (e) => { if (!this.locked) return; e.preventDefault(); this.onWheel?.(e.deltaY > 0 ? 1 : -1) }, { passive: false })
    window.addEventListener('keydown', (e) => this.key(e))
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  private key(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.code === 'Escape') { this.onVerb?.('menu', e); return }
    if (e.code === 'Backquote') { this.onVerb?.('debug', e); return }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.onVerb?.(e.shiftKey ? 'redo' : 'undo', e); return }
    this.keys.add(e.code)
    if (!this.locked) return
    switch (e.code) {
      case 'KeyE': this.onVerb?.('touch', e); break
      case 'KeyQ': this.onVerb?.('putback', e); break
      case 'KeyR': this.onVerb?.(e.shiftKey ? 'turnback' : 'turn', e); break
      case 'KeyM': this.onVerb?.('map', e); break
      case 'KeyH': this.onVerb?.('hands', e); break
      case 'Tab': e.preventDefault(); this.onVerb?.('select', e); break
      case 'Delete': case 'Backspace': this.onVerb?.('remove', e); break
      case 'BracketLeft': case 'Comma': this.onVerb?.('cyclePrev', e); break
      case 'BracketRight': case 'Period': this.onVerb?.('cycleNext', e); break
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        const st = e.shiftKey ? 10 : 1
        this.onArrow?.(e.code === 'ArrowLeft' ? -st : e.code === 'ArrowRight' ? st : 0, e.code === 'ArrowUp' ? st : e.code === 'ArrowDown' ? -st : 0, e); break
      }
      default:
        if (/^Digit[0-9]$/.test(e.code)) { const n = Number(e.code.slice(5)); this.onSlot?.(n === 0 ? 9 : n - 1) }
        else if (e.key === '?') this.onVerb?.('keys', e)
    }
  }

  ringCentre = { x: 0, y: 0 }
  openRing(cx: number, cy: number): void { this.ringOpen = true; this.ringVec = { x: 0, y: 0 }; this.ringCentre = { x: cx, y: cy }; bus.emit('ring_aim', { x: 0, y: 0 }) }
  closeRing(): void { this.ringOpen = false }
  private aimAbs(x: number, y: number): void { bus.emit('ring_aim', { x: x - this.ringCentre.x, y: y - this.ringCentre.y }) }

  /** the pad (GAME.md: controller ready): left stick walks, right stick looks or aims the ring, A do, B put back, X touch, Y turn, bumpers cycle, start menu, back map */
  pollPad(dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const pad = Array.from(pads).find((p) => p && p.connected); if (!pad) { this.padActive = false; return }
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v)
    const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0), rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0)
    const walk = (code: string, on: boolean) => { if (on) this.keys.add(code); else this.keys.delete(code) }
    walk('KeyW', ly < -0.3); walk('KeyS', ly > 0.3); walk('KeyA', lx < -0.3); walk('KeyD', lx > 0.3); walk('ShiftLeft', !!pad.buttons[10]?.pressed)
    if (this.ringOpen) { if (Math.hypot(rx, ry) > 0.3) bus.emit('ring_aim', { x: rx * 120, y: ry * 120 }) }
    else if (rx || ry) this.onLook?.(rx * 2.4 * dt * this.settings.sensitivity, ry * 2.0 * dt * this.settings.sensitivity)
    const edge = (i: number, verb: Verb) => { const now = !!pad.buttons[i]?.pressed; const was = this.padPrev.get(i) ?? false; this.padPrev.set(i, now); if (now && !was) { this.padActive = true; this.onVerb?.(verb, new MouseEvent('mousedown')) } }
    edge(0, 'do'); edge(1, 'putback'); edge(2, 'touch'); edge(3, 'turn'); edge(4, 'cyclePrev'); edge(5, 'cycleNext'); edge(9, 'menu'); edge(8, 'map')
  }

  /** raw movement when the browser has it (Chromium, Windows/macOS), plain lock otherwise. Needs a user gesture */
  async lock(): Promise<void> {
    if (this.locked) return
    const el = this.dom as HTMLElement & { requestPointerLock: (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined }
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true })
      if (p) { await p; this.rawSupported = true; return }
      this.rawSupported = false
    } catch (e) {
      if ((e as Error).name === 'NotSupportedError') { this.rawSupported = false; try { await (el.requestPointerLock() as Promise<void> | undefined) } catch { /* denied */ } }
      else if ((e as Error).name !== 'SecurityError') { try { await (el.requestPointerLock() as Promise<void> | undefined) } catch { /* denied */ } }
    }
  }
  release(): void { if (document.pointerLockElement === this.dom) document.exitPointerLock() }

  /** the buffered click, if one landed within the window; consuming it clears it */
  takeClick(): boolean { const ok = this.clickAt > 0 && performance.now() - this.clickAt <= Input.BUFFER_MS; if (ok) this.clickAt = 0; return ok }
  clearClick(): void { this.clickAt = 0 }

  setPlay(patch: Partial<PlaySettings>): void {
    Object.assign(this.settings, patch)
    try { localStorage.setItem(PLAY_KEY, JSON.stringify(this.settings)) } catch { /* private */ }
    bus.emit('play', { settings: { ...this.settings } })
  }
}
