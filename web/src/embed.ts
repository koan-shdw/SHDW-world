// The embed API (REMAKE.md §4b): window.__shdwWorld.start({ cnt, relativePath }) mounts the whole room into any container.
// (window.__koanHang stays as an alias for one release.)
// Messenger's window.__webgl.start, ours. main.ts uses it for the site; the KOAN site can carry the gallery on a page.
import { mount } from 'svelte'
import App from './ui/App.svelte'
import { applyTheme, currentTheme } from './ui/themes'
import { startWorld, type WorldHandle } from './world'
import './ui/styles.css'

export interface StartOptions { cnt?: HTMLElement; relativePath?: string }
export interface Handle { ready: Promise<WorldHandle | null>; dispose: () => void }

export function start(opts: StartOptions = {}): Handle {
  const cnt = opts.cnt ?? (() => { const d = document.createElement('div'); d.id = 'app'; document.body.prepend(d); return d })()
  const base = opts.relativePath ?? import.meta.env.BASE_URL
  applyTheme(currentTheme())
  let world: WorldHandle | null = null
  const ready = new Promise<WorldHandle | null>((res) => {
    mount(App, { target: cnt, props: { base, version: __APP_VERSION__, onviewport: (el: HTMLElement) => { void startWorld(el, base).then((w) => { world = w; res(w) }) } } })
  })
  return { ready, dispose: () => { world?.dispose(); cnt.innerHTML = '' } }
}

declare global { interface Window { __shdwWorld: { start: typeof start }; __koanHang: { start: typeof start } } }
window.__shdwWorld = { start }; window.__koanHang = window.__shdwWorld
