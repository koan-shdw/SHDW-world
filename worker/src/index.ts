// SHDW.world · the store (docs/SHOW.md §8): one permanent show for SHDW and YOZO. Everyone reads it; writes come through
// the door (the shared word, the Worker secret DOOR, header x-door) and carry a name (header x-who). Per item, never the
// whole layout, so two people editing never wipe each other. Every write is a row in `log`: the history.
// Deploy: npx.cmd wrangler deploy (from worker/). Schema: npx.cmd wrangler d1 execute shdw-world --remote --file schema.sql

interface D1Result<T = unknown> { results: T[]; success: boolean; meta: { changes?: number } }
interface D1Statement { bind(...v: unknown[]): D1Statement; all<T = unknown>(): Promise<D1Result<T>>; first<T = unknown>(col?: string): Promise<T | null>; run(): Promise<D1Result> }
interface D1Database { prepare(sql: string): D1Statement; batch(stmts: D1Statement[]): Promise<D1Result[]> }
export interface Env { shdw_world: D1Database; DOOR?: string }

const ORIGINS = new Set(['https://koan-shdw.github.io', 'http://localhost:5374', 'http://localhost:5375'])
const BODY_MAX = 262144
const HISTORY_PAGE = 200

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

const version = async (db: D1Database): Promise<number> => {
  const v = await db.prepare('SELECT MAX(ts) AS v FROM (SELECT ts FROM items UNION ALL SELECT ts FROM log)').first<number>('v')
  return v ?? 0
}
const stamp = async (db: D1Database): Promise<number> => Math.max(Date.now(), (await version(db)) + 1)   // always newer than the newest row

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const db = env.shdw_world
    try {
      // the door: is the word right?
      if (path === '/door' && req.method === 'POST') return doorOk(req, env) ? json(req, { ok: true }) : json(req, { ok: false, error: env.DOOR ? 'wrong word' : 'no word set on the store yet' }, 401)

      // the show: everything, or what changed since a version (plus what was taken down since)
      if (path === '/show' && req.method === 'GET') {
        const since = Number(url.searchParams.get('since') ?? '')
        const v = await version(db)
        if (Number.isFinite(since) && since > 0) {
          const rows = await db.prepare('SELECT id, json, who, ts FROM items WHERE ts >= ? ORDER BY ts').bind(since).all<Row>()
          const gone = await db.prepare("SELECT DISTINCT id FROM log WHERE op = 'delete' AND ts >= ?").bind(since).all<{ id: string }>()
          return json(req, { version: v, items: rows.results.map(parse), deleted: gone.results.map((r) => r.id) })
        }
        const rows = await db.prepare('SELECT id, json, who, ts FROM items ORDER BY ts').all<Row>()
        return json(req, { version: v, items: rows.results.map(parse), deleted: [] })
      }

      // the history: newest first, a page at a time (the door only: it carries names)
      if (path === '/show/history' && req.method === 'GET') {
        if (!doorOk(req, env)) return json(req, { error: 'the door' }, 401)
        const before = Number(url.searchParams.get('before') ?? '') || Number.MAX_SAFE_INTEGER
        const rows = await db.prepare('SELECT ts, who, op, id, json FROM log WHERE ts < ? ORDER BY ts DESC LIMIT ?').bind(before, HISTORY_PAGE).all<{ ts: number; who: string; op: string; id: string; json: string | null }>()
        return json(req, { rows: rows.results.map((r) => ({ ts: r.ts, who: r.who, op: r.op, id: r.id, item: r.json ? JSON.parse(r.json) : null })) })
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
          if (!item || typeof item !== 'object' || Array.isArray(item)) return json(req, { error: 'not an item' }, 400)
          item.id = id
          const body = JSON.stringify(item)
          const ts = await stamp(db)
          const before = await db.prepare('SELECT id FROM items WHERE id = ?').bind(id).first<string>('id')
          await db.batch([
            db.prepare('INSERT INTO items (id, json, who, ts) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, who = excluded.who, ts = excluded.ts').bind(id, body, who, ts),
            db.prepare('INSERT INTO log (ts, who, op, id, json) VALUES (?, ?, ?, ?, ?)').bind(ts, who, before ? 'move' : 'hang', id, body),
          ])
          return json(req, { ok: true, version: ts })
        }
        if (req.method === 'DELETE' && id) {
          if (!idOk(id)) return json(req, { error: 'bad id' }, 400)
          const ts = await stamp(db)
          const was = await db.prepare('SELECT json FROM items WHERE id = ?').bind(id).first<string>('json')
          await db.batch([
            db.prepare('DELETE FROM items WHERE id = ?').bind(id),
            db.prepare('INSERT INTO log (ts, who, op, id, json) VALUES (?, ?, ?, ?, ?)').bind(ts, who, 'delete', id, was ?? null),
          ])
          return json(req, { ok: true, version: ts })
        }
        if (req.method === 'DELETE' && !id) {
          // clear: every work off the walls, each one its own delete row so a room that is open elsewhere drops them too
          const ts = await stamp(db)
          const rows = await db.prepare('SELECT id, json FROM items').all<{ id: string; json: string }>()
          const stmts = rows.results.map((r, i) => db.prepare('INSERT INTO log (ts, who, op, id, json) VALUES (?, ?, ?, ?, ?)').bind(ts + i, who, 'delete', r.id, r.json))
          stmts.push(db.prepare('DELETE FROM items'))
          if (stmts.length) await db.batch(stmts)
          return json(req, { ok: true, version: ts + Math.max(0, rows.results.length - 1), cleared: rows.results.length })
        }
        return json(req, { error: 'method' }, 405)
      }
      return json(req, { error: 'not here' }, 404)
    } catch (e) {
      return json(req, { error: (e as Error).message }, 500)
    }
  },
}

const parse = (r: Row): Record<string, unknown> => ({ ...(JSON.parse(r.json) as Record<string, unknown>), id: r.id, who: r.who, ts: r.ts })
