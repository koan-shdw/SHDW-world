// The store (docs/SHOW.md §4, §8): the one file that talks to the Worker. The show's truth lives there, not in the
// browser. Reads are open (the public door reads the same show); writes go through the door (the shared word + your name),
// per item, 1.5 s after the last change to that item, and wait in a pending queue when the store is away. A 10 s tick
// brings in what the other person did.
import { bus, type Who, type HistoryRow } from '../bus'
import type { Placed, ArtItem } from './art/art'
import type { Prepped } from './art/upload'

export const STORE: string = (import.meta.env.VITE_STORE as string | undefined) || 'https://shdw-world-show.shdwart.workers.dev'   // VITE_STORE in web/.env.local points a dev build at `wrangler dev`
const DOOR_KEY = 'shdw-world-door'
const PENDING_KEY = 'shdw-world-pending'
export const DEBOUNCE_MS = 1500
export const TICK_MS = 10000

export interface Door { key: string; who: Who }
export interface ShowItem extends Placed { who?: string; ts?: number }
export interface ArtMeta extends Omit<ArtItem, 'store'> { who?: string; ts?: number; ext?: string; hasThumb?: boolean }
export interface Show { items: ShowItem[]; art: ArtMeta[] }
export interface Changes { items: ShowItem[]; deleted: string[]; art: ArtMeta[]; artDeleted: string[] }
type Pending = { op: 'put'; id: string; item: Placed } | { op: 'del'; id: string } | { op: 'clear' }

/** the store's copy of an item, without the store's own stamps */
export const strip = (p: ShowItem): Placed => { const { who, ts, ...rest } = p; void who; void ts; return rest as Placed }
export const artUrl = (id: string, ext: string): string => `${STORE}/art/${encodeURIComponent(id)}.${ext}`

export class Store {
  door: Door | null = null
  version = 0
  private timers = new Map<string, number>()
  private waiting = new Map<string, Placed>()     // debounced puts not yet queued
  private pending: Pending[] = []
  private sending = false
  private away = false

  constructor() {
    try { const d = localStorage.getItem(DOOR_KEY); if (d) { const j = JSON.parse(d) as Door; if (j.key && (j.who === 'SHDW' || j.who === 'YOZO')) this.door = j } } catch { /* private */ }
    try { const p = localStorage.getItem(PENDING_KEY); if (p) this.pending = JSON.parse(p) as Pending[] } catch { /* fresh */ }
    window.addEventListener('pagehide', () => this.park())
    bus.emit('door_state', { open: this.open, who: this.door?.who ?? null })
  }

  get open(): boolean { return !!this.door }
  get who(): Who | null { return this.door?.who ?? null }
  hasPending(id: string): boolean { return this.waiting.has(id) || this.pending.some((p) => p.op !== 'clear' && p.id === id) }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (this.door) { h['x-door'] = this.door.key; h['x-who'] = this.door.who }
    return h
  }

  // ---- the door -------------------------------------------------------------------------------
  async check(key: string, who: Who): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await fetch(`${STORE}/door`, { method: 'POST', headers: { 'x-door': key, 'x-who': who } })
      const j = (await r.json()) as { ok: boolean; error?: string }
      if (r.ok && j.ok) { this.door = { key, who }; try { localStorage.setItem(DOOR_KEY, JSON.stringify(this.door)) } catch { /* private */ } bus.emit('door_state', { open: true, who }); return { ok: true } }
      return { ok: false, error: j.error ?? 'wrong word' }
    } catch { return { ok: false, error: 'the store is away' } }
  }
  leave(): void {
    this.door = null; try { localStorage.removeItem(DOOR_KEY) } catch { /* private */ }
    bus.emit('door_state', { open: false, who: null })
  }

  // ---- reads ----------------------------------------------------------------------------------
  async load(): Promise<Show | null> {
    try {
      const r = await fetch(`${STORE}/show`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = (await r.json()) as { version: number; items: ShowItem[]; art?: ArtMeta[] }
      this.version = j.version; this.away = false
      return { items: j.items, art: j.art ?? [] }
    } catch { this.gone(); return null }
  }
  async since(): Promise<Changes | null> {
    try {
      const r = await fetch(`${STORE}/show?since=${this.version + 1}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = (await r.json()) as { version: number; items: ShowItem[]; deleted: string[]; art?: ArtMeta[]; artDeleted?: string[] }
      this.version = Math.max(this.version, j.version); this.away = false
      return { items: j.items, deleted: j.deleted, art: j.art ?? [], artDeleted: j.artDeleted ?? [] }
    } catch { this.gone(); return null }
  }
  /** SHOW.md §5: the file, the thumb, then the meta; the work is in the store for everyone when this returns */
  async uploadArt(id: string, meta: ArtMeta, prepped: Prepped): Promise<ArtMeta> {
    if (!this.door) throw new Error('the door')
    const h = this.headers()
    const f = await fetch(`${STORE}/art/${encodeURIComponent(id)}/file`, { method: 'PUT', headers: { ...h, 'content-type': prepped.type }, body: prepped.blob })
    if (!f.ok) throw new Error(f.status === 413 ? 'too big for the store' : f.status === 401 ? 'the door' : `the store said ${f.status}`)
    const { ext } = (await f.json()) as { ext: string }
    if (prepped.thumb) { const t = await fetch(`${STORE}/art/${encodeURIComponent(id)}/thumb`, { method: 'PUT', headers: { ...h, 'content-type': 'image/jpeg' }, body: prepped.thumb }); if (!t.ok) throw new Error(`the store said ${t.status}`) }
    const full: ArtMeta = { ...meta, id, ext, hasThumb: !!prepped.thumb }
    const m = await fetch(`${STORE}/art/${encodeURIComponent(id)}`, { method: 'PUT', headers: h, body: JSON.stringify(full) })
    if (!m.ok) throw new Error(`the store said ${m.status}`)
    return full
  }
  async deleteArt(id: string): Promise<void> {
    if (!this.door) throw new Error('the door')
    const r = await fetch(`${STORE}/art/${encodeURIComponent(id)}`, { method: 'DELETE', headers: this.headers() })
    if (!r.ok) throw new Error(`the store said ${r.status}`)
  }
  async history(before?: number): Promise<HistoryRow[] | null> {
    try {
      const r = await fetch(`${STORE}/show/history${before ? `?before=${before}` : ''}`, { headers: this.headers(), cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      return ((await r.json()) as { rows: HistoryRow[] }).rows
    } catch { return null }
  }

  // ---- writes (the door only) -------------------------------------------------------------------
  put(item: Placed): void {
    if (!this.door) return
    this.waiting.set(item.id, item)
    const t = this.timers.get(item.id); if (t) clearTimeout(t)
    this.timers.set(item.id, window.setTimeout(() => { this.timers.delete(item.id); const it = this.waiting.get(item.id); this.waiting.delete(item.id); if (it) this.queue({ op: 'put', id: item.id, item: it }) }, DEBOUNCE_MS))
  }
  del(id: string): void {
    if (!this.door) return
    const t = this.timers.get(id); if (t) { clearTimeout(t); this.timers.delete(id) }
    this.waiting.delete(id)
    this.queue({ op: 'del', id })
  }
  clear(): void {
    if (!this.door) return
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear(); this.waiting.clear(); this.pending = []
    this.queue({ op: 'clear' })
  }
  private queue(p: Pending): void {
    if (p.op !== 'clear') this.pending = this.pending.filter((q) => q.op === 'clear' || q.id !== p.id)   // one pending write per item, the newest
    this.pending.push(p); this.save(); void this.flush()
  }
  private save(): void { try { if (this.pending.length) localStorage.setItem(PENDING_KEY, JSON.stringify(this.pending)); else localStorage.removeItem(PENDING_KEY) } catch { /* private */ } }
  /** the tab is going: what is still debouncing joins the queue, so it goes out on the next open */
  private park(): void {
    for (const [id, it] of this.waiting) { this.pending = this.pending.filter((q) => q.op === 'clear' || q.id !== id); this.pending.push({ op: 'put', id, item: it }) }
    this.waiting.clear(); for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); this.save()
  }
  async flush(): Promise<void> {
    if (this.sending || !this.door) return
    this.sending = true
    try {
      while (this.pending.length) {
        const p = this.pending[0]
        const url = p.op === 'clear' ? `${STORE}/show/items` : `${STORE}/show/items/${encodeURIComponent(p.id)}`
        const r = await fetch(url, { method: p.op === 'put' ? 'PUT' : 'DELETE', headers: this.headers(), body: p.op === 'put' ? JSON.stringify(strip(p.item as ShowItem)) : undefined })
        if (r.status === 401) { const j = (await r.json().catch(() => ({}))) as { error?: string }; bus.toast(`not saved · ${j.error ?? 'the door'}`, 'bad'); this.leave(); return }
        if (r.status === 413) { bus.toast('not saved · that one is too big for the store', 'bad'); this.pending.shift(); this.save(); continue }
        if (!r.ok) throw new Error(String(r.status))
        this.pending.shift(); this.save(); this.away = false          // the version moves only on reads: a write by the other person just before mine must still come in
      }
    } catch { this.gone() } finally { this.sending = false }
  }
  private gone(): void { if (!this.away) { this.away = true; bus.toast('not saved · the store is away', 'warn') } }

  /** every 10 s: send what waits, then bring in what changed */
  async tick(): Promise<Changes | null> {
    if (this.pending.length) await this.flush()
    return this.since()
  }
}
