// SHDW.world · the store (docs/SHOW.md §8): one permanent show for SHDW and YOZO. Everyone reads it; writes come through
// the door (the shared word, the Worker secret DOOR, header x-door) and carry a name (header x-who). Per item, never the
// whole layout, so two people editing never wipe each other. Every write is a row in `log`: the history.
// S2 (§5): the artwork lives here too: meta in D1 `art`, the files in R2 (ART), served at /art/<id>.<ext>.
// Deploy: npx.cmd wrangler deploy (from worker/). Schema: npx.cmd wrangler d1 execute shdw-world --remote --file schema.sql

import { items as builtins } from '../../art/index.json'
import { levels, walls } from '../../level/level.json'

interface D1Result<T = unknown> { results: T[]; success: boolean; meta: { changes?: number } }
interface D1Statement { bind(...v: unknown[]): D1Statement; all<T = unknown>(): Promise<D1Result<T>>; first<T = unknown>(col?: string): Promise<T | null>; run(): Promise<D1Result> }
interface D1Database { prepare(sql: string): D1Statement; batch(stmts: D1Statement[]): Promise<D1Result[]> }
interface R2Object { body: ReadableStream; httpMetadata?: { contentType?: string }; httpEtag: string; size: number }
interface R2Bucket { get(key: string): Promise<R2Object | null>; put(key: string, body: ReadableStream | ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>; delete(keys: string | string[]): Promise<void> }
export interface Env { shdw_world: D1Database; ART: R2Bucket; DOOR?: string }

const ORIGINS = new Set(['https://koan-shdw.github.io', 'http://localhost:5374', 'http://localhost:5375'])
const BODY_MAX = 262144
const FILE_MAX = 25 * 1024 * 1024
const HISTORY_PAGE = 200
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'model/gltf-binary': 'glb' }
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', glb: 'model/gltf-binary' }
// ponytail: per-isolate abuse brake for two editors; use an edge rate-limit rule for a larger audience.
const attempts = new Map<string, { count: number; until: number }>()

const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get('origin') ?? ''
  return { 'access-control-allow-origin': ORIGINS.has(o) ? o : 'https://koan-shdw.github.io', 'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,x-door,x-who', 'access-control-max-age': '86400', vary: 'origin' }
}
const json = (req: Request, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(req) } })
const doorOk = (req: Request, env: Env): boolean => !!env.DOOR && req.headers.get('x-door') === env.DOOR
const whoOf = (req: Request): string => (req.headers.get('x-who') ?? '').replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 24) || 'someone'
const idOk = (id: string): boolean => /^[A-Za-z0-9_.:-]{1,80}$/.test(id)

interface Row { id: string; json: string; who: string; ts: number }

// Allocate inside the log INSERT, in the same transaction as the item mutation.
// Keeping millisecond-shaped cursors also preserves existing clients and history dates.
const NEXT = '(SELECT MAX(?, COALESCE(MAX(ts), 0) + 1) FROM (SELECT ts FROM log UNION ALL SELECT ts FROM items UNION ALL SELECT ts FROM art))'
const CURRENT = '(SELECT MAX(ts) FROM log)'
class WriteConflict extends Error {}
const write = async (db: D1Database, stmts: D1Statement[], conflict = 'original already placed'): Promise<number> => {
  const result = await db.batch([...stmts, db.prepare(`SELECT ${CURRENT} AS version`)])
  if (result[0].meta.changes === 0) throw new WriteConflict(conflict)
  return (result.at(-1)!.results[0] as { version: number }).version ?? 0
}
const parse = (r: Row): Record<string, unknown> => ({ ...(JSON.parse(r.json) as Record<string, unknown>), id: r.id, who: r.who, ts: r.ts })
const finite = (v: unknown, min = -10000, max = 10000): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const textOk = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const lookOk = (p: Record<string, unknown>): boolean => {
  if (p.colour !== undefined && !/^#[\da-f]{6}$/i.test(String(p.colour))) return false
  if (p.texture != null && (!record(p.texture) || !textOk(p.texture.name, 40) || !finite(p.texture.cm, 5, 10000) || (p.texture.url !== undefined && (!textOk(p.texture.url, 2048) || !/^https?:\/\//.test(p.texture.url))))) return false
  if (p.plinth != null && (!record(p.plinth) || !['w', 'h', 'd'].every(k => finite((p.plinth as Record<string, unknown>)[k], 0.1, 10000)) || !/^#[\da-f]{6}$/i.test(String(p.plinth.colour)))) return false
  return p.parts === undefined || (record(p.parts) && Object.keys(p.parts).length <= 100 && Object.entries(p.parts).every(([k, v]) => k.length <= 100 && /^#[\da-f]{6}$/i.test(String(v))))
}
const itemOk = (p: Record<string, unknown>): boolean => {
  if (!textOk(p.art, 80) || !idOk(p.art) || !levels.some((f) => f.id === p.level) || !finite(p.u) || !finite(p.topY) || ![null, 'top', 'centre', 'bottom', 'free'].includes(p.snap as string | null) || !lookOk(p)) return false
  if (p.art === 'note' ? !record(p.note) || !textOk(p.note.text, 2000) || !['KOAN', 'YOZO'].includes(String(p.note.who)) : p.note !== undefined) return false
  return p.kind === 'painting' ? walls.some((w) => w.id === p.wall && w.hang !== false && w.draw !== false) : p.kind === 'sculpture' && p.art !== 'note' && Array.isArray(p.pos) && p.pos.length === 3 && p.pos.every(v => finite(v)) && (p.yaw === undefined || finite(p.yaw))
}
const metaOk = (p: Record<string, unknown>): boolean => ['painting', 'sculpture'].includes(String(p.kind)) && textOk(p.title, 300) && finite(p.w, 0.1) && finite(p.h, 0.1) && finite(p.d, 0) && textOk(p.edge, 30) && lookOk(p)

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const db = env.shdw_world
    try {
      const protectedRoute = path === '/door' || path === '/show/history' || path.startsWith('/show/items') || (path.startsWith('/art/') && !['GET', 'HEAD'].includes(req.method))
      if (protectedRoute) {
        const ip = req.headers.get('cf-connecting-ip') ?? 'local', now = Date.now()
        const prior = attempts.get(ip)
        if (prior && prior.until > now && prior.count >= 20) return json(req, { error: 'too many attempts · try again in a minute' }, 429)
        if (doorOk(req, env)) attempts.delete(ip)
        else { if (attempts.size >= 10000) attempts.delete(attempts.keys().next().value!); attempts.set(ip, { count: prior && prior.until > now ? prior.count + 1 : 1, until: prior && prior.until > now ? prior.until : now + 60000 }) }
      }
      // the door: is the word right?
      if (path === '/door' && req.method === 'POST') return doorOk(req, env) ? json(req, { ok: true }) : json(req, { ok: false, error: env.DOOR ? 'wrong word' : 'no word set on the store yet' }, 401)

      // the show: everything (items + the library), or what changed since a version (plus what was taken down since)
      if (path === '/show' && req.method === 'GET') {
        const since = Number(url.searchParams.get('since') ?? '')
        const from = Number.isFinite(since) && since > 0 ? since : 0
        // One read transaction: the returned cursor and all four collections describe the same snapshot.
        const [v, rows, gone, art, artGone] = await db.batch([
          db.prepare('SELECT COALESCE(MAX(ts), 0) AS v FROM (SELECT ts FROM items UNION ALL SELECT ts FROM log UNION ALL SELECT ts FROM art)'),
          db.prepare('SELECT id, json, who, ts FROM items WHERE ts >= ? ORDER BY ts').bind(from),
          db.prepare("SELECT DISTINCT id FROM log WHERE op = 'delete' AND ts >= ? AND NOT EXISTS (SELECT 1 FROM items WHERE items.id = log.id)").bind(from),
          db.prepare('SELECT id, json, who, ts FROM art WHERE ts >= ? ORDER BY ts').bind(from),
          db.prepare("SELECT DISTINCT id FROM log WHERE op = 'art-delete' AND ts >= ? AND NOT EXISTS (SELECT 1 FROM art WHERE art.id = log.id)").bind(from),
        ])
        const visible = (rows.results as Row[]).map(parse).filter((p) => doorOk(req, env) || (p.art !== 'note' && !p.note))
        return json(req, { version: (v.results[0] as { v: number }).v, items: visible, deleted: from ? gone.results.map((r) => (r as Row).id) : [], art: (art.results as Row[]).map(parse), artDeleted: from ? artGone.results.map((r) => (r as Row).id) : [] })
      }

      // the history: newest first, a page at a time (the door only: it carries names)
      if (path === '/show/history' && req.method === 'GET') {
        if (!doorOk(req, env)) return json(req, { error: 'the door' }, 401)
        const before = Number(url.searchParams.get('before') ?? '') || Number.MAX_SAFE_INTEGER
        const beforeId = Number(url.searchParams.get('beforeId') ?? '') || Number.MAX_SAFE_INTEGER
        const rows = await db.prepare('SELECT rowid AS cursor, ts, who, op, id, json FROM log WHERE ts < ? AND rowid < ? ORDER BY rowid DESC LIMIT ?').bind(before, beforeId, HISTORY_PAGE).all<{ cursor: number; ts: number; who: string; op: string; id: string; json: string | null }>()
        return json(req, { rows: rows.results.map((r) => ({ cursor: r.cursor, ts: r.ts, who: r.who, op: r.op, id: r.id, item: r.json ? JSON.parse(r.json) : null })) })
      }

      // the artwork's files: /art/<id>.<ext> and /art/<id>.thumb.jpg, from R2, cached a year (a new file gets a new id)
      const f = path.match(/^\/art\/([A-Za-z0-9_.:-]+)\.(thumb\.jpg|jpg|png|webp|glb)$/)
      if (f && (req.method === 'GET' || req.method === 'HEAD')) {
        const key = `${f[1]}.${f[2]}`
        const o = await env.ART.get(key)
        if (!o) return json(req, { error: 'no such file' }, 404)
        const ct = o.httpMetadata?.contentType ?? MIME[f[2] === 'thumb.jpg' ? 'jpg' : f[2]] ?? 'application/octet-stream'
        return new Response(o.body, { headers: { 'content-type': ct, 'cache-control': 'public, max-age=31536000, immutable', etag: o.httpEtag, 'access-control-allow-origin': '*' } })
      }

      // the artwork's meta and files: the door, per work
      const a = path.match(/^\/art\/([^/]+)(?:\/(file|thumb))?$/)
      if (a) {
        if (!doorOk(req, env)) return json(req, { error: env.DOOR ? 'the door' : 'no word set on the store yet' }, 401)
        const who = whoOf(req)
        const id = decodeURIComponent(a[1])
        if (!idOk(id)) return json(req, { error: 'bad id' }, 400)
        if (req.method === 'PUT' && a[2] === 'file') {
          const ct = (req.headers.get('content-type') ?? '').split(';')[0].trim()
          const ext = EXT[ct]; if (!ext) return json(req, { error: 'jpg, png, webp or glb' }, 415)
          const len = Number(req.headers.get('content-length') ?? '0'); if (len > FILE_MAX) return json(req, { error: 'too big' }, 413)
          const body = await req.arrayBuffer(); if (body.byteLength > FILE_MAX) return json(req, { error: 'too big' }, 413)
          await env.ART.put(`${id}.${ext}`, body, { httpMetadata: { contentType: ct } })
          return json(req, { ok: true, url: `${url.origin}/art/${id}.${ext}`, ext })
        }
        if (req.method === 'PUT' && a[2] === 'thumb') {
          const body = await req.arrayBuffer(); if (body.byteLength > FILE_MAX) return json(req, { error: 'too big' }, 413)
          await env.ART.put(`${id}.thumb.jpg`, body, { httpMetadata: { contentType: 'image/jpeg' } })
          return json(req, { ok: true, url: `${url.origin}/art/${id}.thumb.jpg` })
        }
        if (req.method === 'PUT' && !a[2]) {
          const text = await req.text(); if (text.length > BODY_MAX) return json(req, { error: 'too big' }, 413)
          let meta: Record<string, unknown>
          try { meta = JSON.parse(text) } catch { return json(req, { error: 'not json' }, 400) }
          if (!record(meta) || !metaOk(meta)) return json(req, { error: 'invalid artwork title, dimensions or appearance' }, 400)
          meta.id = id
          const body = JSON.stringify(meta)
          const compatible = "NOT EXISTS (SELECT 1 FROM items WHERE json_extract(json, '$.art') = ? AND json_extract(json, '$.kind') <> ?)"
          const ts = await write(db, [
            db.prepare(`INSERT INTO log (ts, who, op, id, json) SELECT ${NEXT}, ?, 'art', ?, ? WHERE ${compatible}`).bind(Date.now(), who, id, body, id, meta.kind),
            db.prepare(`INSERT INTO art (id, json, who, ts) SELECT ?, ?, ?, ${CURRENT} WHERE ${compatible} ON CONFLICT(id) DO UPDATE SET json = excluded.json, who = excluded.who, ts = excluded.ts`).bind(id, body, who, id, meta.kind),
          ], 'take the work down before changing its kind')
          return json(req, { ok: true, version: ts })
        }
        if (req.method === 'DELETE' && !a[2]) {
          const unused = "NOT EXISTS (SELECT 1 FROM items WHERE json_extract(json, '$.art') = ?)"
          const ts = await write(db, [
            db.prepare(`INSERT INTO log (ts, who, op, id, json) SELECT ${NEXT}, ?, 'art-delete', ?, (SELECT json FROM art WHERE id = ?) WHERE ${unused}`).bind(Date.now(), who, id, id, id),
            db.prepare(`DELETE FROM art WHERE id = ? AND ${unused}`).bind(id, id),
          ], 'take the work down before removing it from the library')
          // Retain immutable files so a mistaken library removal can be recovered from history/backup.
          return json(req, { ok: true, version: ts })
        }
        return json(req, { error: 'method' }, 405)
      }

      // writes: the door, then per item
      const m = path.match(/^\/show\/items(?:\/([^/]+))?$/)
      if (m) {
        if (!doorOk(req, env)) return json(req, { error: env.DOOR ? 'the door' : 'no word set on the store yet' }, 401)
        const who = whoOf(req)
        const id = m[1] ? decodeURIComponent(m[1]) : null
        if (req.method === 'PUT' && id) {
          if (!idOk(id)) return json(req, { error: 'bad id' }, 400)
          const text = await req.text()
          if (text.length > BODY_MAX) return json(req, { error: 'too big' }, 413)
          let item: Record<string, unknown>
          try { item = JSON.parse(text) } catch { return json(req, { error: 'not json' }, 400) }
          if (!record(item) || !itemOk(item)) return json(req, { error: 'invalid placement or note' }, 400)
          item.id = id
          const body = JSON.stringify(item)
          // Reference, kind and originality checks run in the same transaction as both writes.
          const available = "(? = 1 OR (COALESCE((SELECT json_extract(json, '$.kind') FROM art WHERE id = ?), ?) = ? AND NOT EXISTS (SELECT 1 FROM items WHERE json_extract(json, '$.art') = ? AND id <> ?)))"
          const check = [item.art === 'note' ? 1 : 0, item.art, builtins.find(a => a.id === item.art)?.kind ?? null, item.kind, item.art, id]
          const ts = await write(db, [
            db.prepare(`INSERT INTO log (ts, who, op, id, json) SELECT ${NEXT}, ?, CASE WHEN EXISTS (SELECT 1 FROM items WHERE id = ?) THEN 'move' ELSE 'hang' END, ?, ? WHERE ${available}`).bind(Date.now(), who, id, id, body, ...check),
            db.prepare(`INSERT INTO items (id, json, who, ts) SELECT ?, ?, ?, ${CURRENT} WHERE ${available} ON CONFLICT(id) DO UPDATE SET json = excluded.json, who = excluded.who, ts = excluded.ts`).bind(id, body, who, ...check),
          ], 'artwork unavailable, kind changed, or original already placed')
          return json(req, { ok: true, version: ts })
        }
        if (req.method === 'DELETE' && id) {
          if (!idOk(id)) return json(req, { error: 'bad id' }, 400)
          const ts = await write(db, [
            db.prepare(`INSERT INTO log (ts, who, op, id, json) VALUES (${NEXT}, ?, 'delete', ?, (SELECT json FROM items WHERE id = ?))`).bind(Date.now(), who, id, id),
            db.prepare('DELETE FROM items WHERE id = ?').bind(id),
          ])
          return json(req, { ok: true, version: ts })
        }
        if (req.method === 'DELETE' && !id) {
          // clear: every work off the walls, each one its own delete row so a room that is open elsewhere drops them too
          const result = await db.batch([
            db.prepare(`INSERT INTO log (ts, who, op, id, json) SELECT ${NEXT} + ROW_NUMBER() OVER (ORDER BY id) - 1, ?, 'delete', id, json FROM items`).bind(Date.now(), who),
            db.prepare('DELETE FROM items'),
            db.prepare(`SELECT ${CURRENT} AS version`),
          ])
          return json(req, { ok: true, version: (result[2].results[0] as { version: number }).version ?? 0, cleared: result[1].meta.changes ?? 0 })
        }
        return json(req, { error: 'method' }, 405)
      }
      return json(req, { error: 'not here' }, 404)
    } catch (e) {
      const message = (e as Error).message
      return json(req, { error: message }, e instanceof WriteConflict ? 409 : 500)
    }
  },
}
