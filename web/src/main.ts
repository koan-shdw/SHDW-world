// SHDW.world — the site's entry: mount the room into #app through the embed API. Nothing else lives here (REMAKE.md §2).
import { start } from './embed'

// a stale page (the browser or the CDN holding an old index.html) reloads itself once when the site has moved on
const base = import.meta.env.BASE_URL
if (!import.meta.env.DEV) {
  fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((v: { version?: string } | null) => {
    if (v?.version && v.version !== __APP_VERSION__ && sessionStorage.getItem('shdw-reloaded') !== v.version) { sessionStorage.setItem('shdw-reloaded', v.version); location.reload() }
  }).catch(() => undefined)
}
const h = start({ cnt: document.getElementById('app')! })
h.ready.then((w) => { if (!w) console.error('SHDW.world: the world did not start') }).catch((e) => { console.error(e); alert(`SHDW.world failed: ${(e as Error).message}`) })
