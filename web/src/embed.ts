// The embed API (REMAKE.md §4b): window.__shdwWorld.start({ cnt, relativePath }) mounts the whole room into any container.
// (window.__koanHang stays as an alias for one release.)
// Messenger's window.__webgl.start, ours. main.ts uses it for the site; the KOAN site can carry the gallery on a page.
import { mount, unmount } from 'svelte'
import { bus } from './bus'
import { resetUi } from './ui/state.svelte'
import App from './ui/App.svelte'
import { applyTheme, currentTheme } from './ui/themes'
import { startWorld, type WorldHandle } from './world'
import './ui/styles.css'

export interface StartOptions { cnt?: HTMLElement; relativePath?: string }
export interface Handle { ready: Promise<WorldHandle | null>; dispose: () => void }

export function start(opts: StartOptions = {}): Handle {
  const cnt = opts.cnt ?? (() => { const d = document.createElement('div'); d.id = 'app'; document.body.prepend(d); return d })()
  const base = opts.relativePath ?? import.meta.env.BASE_URL
  resetUi(); applyTheme(currentTheme())
  let world: WorldHandle | null = null
  let disposed = false
  let app: ReturnType<typeof mount>
  const ready = new Promise<WorldHandle | null>((res, reject) => {
    app = mount(App, { target: cnt, props: { base, version: __APP_VERSION__, onviewport: (el: HTMLElement) => {
      void startWorld(el, base).then((w) => { if (disposed) { w?.dispose(); res(null) } else { world = w; res(w) } }).catch((e) => { bus.emit('world_failed', { message: (e as Error).message }); reject(e) })
    } } })
  })
  return { ready, dispose: () => { if (disposed) return; disposed = true; world?.dispose(); void unmount(app) } }
}

declare global { interface Window { __shdwWorld: { start: typeof start }; __koanHang: { start: typeof start } } }
window.__shdwWorld = { start }; window.__koanHang = window.__shdwWorld
