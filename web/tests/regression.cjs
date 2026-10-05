// Actual Worker + client modules, isolated SQLite/R2 and browser stubs. Node 22.13+.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'shdw-test-'));
require('esbuild').buildSync({ stdin: { contents: `export {default as worker} from './worker/src/index.ts'; export {Store} from './web/src/world/store.ts'; export {ArtSystem} from './web/src/world/art/art.ts'; export {Input} from './web/src/world/input.ts'; export {Walker} from './web/src/world/walk.ts'; export {buildLevel} from './web/src/world/room/level.ts'; export {Void} from './web/src/world/looks/void.ts'; export {EdgesPass} from './web/src/world/looks/edges.ts'; export * as THREE from './web/node_modules/three/build/three.module.js';`, resolveDir: root, loader: 'ts' }, outfile: path.join(scratch, 'project.cjs'), bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env.VITE_STORE': '"http://local.test"' }, logLevel: 'silent' });
const { worker, Store, ArtSystem, Input, Walker, buildLevel, Void, EdgesPass, THREE } = require(path.join(scratch, 'project.cjs'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const memory = new Map();
global.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
global.window = { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) };
global.document = { addEventListener() {}, removeEventListener() {} };
const level = JSON.parse(fs.readFileSync(path.join(root, 'level/level.json')));
const meta = { id: 'test-art', kind: 'painting', title: 'Test', w: 30, h: 30, d: 2, edge: 'wrap', ext: 'png', ts: 1 };
const placed = { id: 'test-item', art: meta.id, kind: 'painting', wall: 'g-north', level: 'ground', u: 1, topY: 2, snap: null };

test('volumetric smoke retains surface depth, scales quality, and respects reduced motion and sky off', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 4000), room = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); room.add(wall);
  const smoke = new Void(room, camera), edges = new EdgesPass(camera);
  const read = new THREE.WebGLRenderTarget(1280, 720, { depthTexture: new THREE.DepthTexture(1280, 720) });
  const write = read.clone(), calls = []; let target;
  const renderer = { setRenderTarget: t => { target = t; }, render: mesh => calls.push({ target, material: mesh.material }) };
  edges.render(renderer, write, read);
  assert.equal(calls[0].material.uniforms.tDepth.value, read.depthTexture);
  assert.equal(calls[0].material.depthWrite, true, 'smoke must receive scene depth after the outline pass swaps targets');
  assert.match(calls[0].material.fragmentShader, /gl_FragDepth\s*=\s*texture2D\(tDepth/);
  smoke.setSize(2560, 1440); smoke.render(renderer, read, write);
  const fog = calls[1], composite = calls[2];
  assert.equal(fog.target.width, 960); assert.equal(fog.target.height, 540);
  assert.equal(fog.material.uniforms.volume.value.isData3DTexture, true);
  assert.equal(fog.material.uniforms.tDepth.value, write.depthTexture);
  assert.equal(composite.material.uniforms.tDiffuse.value, write.texture);
  assert.equal(composite.material.uniforms.smoke.value, fog.target.texture);
  assert.equal(composite.target, read);
  const fullSteps = fog.material.uniforms.steps.value;
  smoke.setQuality('balanced'); assert.ok(fog.material.uniforms.steps.value < fullSteps); assert.equal(fog.target.width, 720);
  smoke.setQuality('low'); assert.equal(fog.target.width, 480); assert.ok(fog.material.uniforms.steps.value < 40);
  smoke.setSize(390, 844); assert.equal(fog.target.width, 195); assert.equal(fog.target.height, 422);
  assert.equal(wall.castShadow, true); assert.equal(smoke.light.castShadow, true);
  smoke.update(5); smoke.update(5.4);
  assert.ok(smoke.flash > 0 && smoke.light.intensity > 0.8);
  assert.deepEqual(smoke.light.position, smoke.flashAt, 'cloud glow and exterior lighting share the source');
  smoke.update(5.5, true); assert.equal(smoke.flash, 0); assert.equal(smoke.light.intensity, 0.8);
  assert.equal(fog.material.uniforms.time.value, 0); assert.equal(fog.material.uniforms.flash.value, 0);
  smoke.set(false); smoke.update(30); assert.equal(smoke.enabled, false); assert.equal(smoke.group.visible, false); assert.equal(smoke.flash, 0);
  smoke.set(true); assert.equal(smoke.enabled, true); assert.equal(smoke.group.visible, true);
  let disposed = 0;
  for (const resource of [fog.target, fog.material.uniforms.volume.value, fog.material, composite.material]) resource.addEventListener('dispose', () => disposed++);
  smoke.dispose(); assert.equal(disposed, 4);
  edges.dispose(); read.dispose(); write.dispose(); wall.geometry.dispose(); wall.material.dispose();
});

test('bridge keeps its attachment and breaks into deterministic, shrinking cubes at the far end', () => {
  const before = JSON.stringify(level), room = buildLevel(level).group, again = buildLevel(level).group;
  assert.equal(JSON.stringify(level), before, 'rendering must not change collision or source data');
  assert.equal(room.getObjectByName('bridge end'), undefined, 'no solid end cap behind the fragments');
  const fragments = room.children.filter(m => m.name.endsWith(' fragments'));
  assert.equal(fragments.length, 4);
  const near = [], far = [], matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (const mesh of fragments) {
    assert.ok(mesh.isInstancedMesh && mesh.count > 0 && mesh.count < 500);
    assert.deepEqual(mesh.instanceMatrix.array, again.getObjectByName(mesh.name).instanceMatrix.array);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); assert.ok(matrix.elements.every(Number.isFinite)); matrix.decompose(p, q, s);
      if (p.x > 4.3) { assert.ok(Math.abs(s.x - s.y) < 1e-6 && Math.abs(s.x - s.z) < 1e-6); (p.x < 5.2 ? near : far).push(s.x); }
    }
    const name = mesh.name.replace(' fragments', ''), source = level.objects.find(o => o.name === name);
    const base = new THREE.Box3().setFromObject(room.getObjectByName(name));
    assert.ok(Math.abs(base.min.x - source.box[0][0]) < 1e-6, 'bridge stays attached to the building');
    assert.ok(base.max.x < source.box[1][0] - 1, 'the outer end is replaced, not covered with particles');
  }
  assert.ok(near.length > 10 && far.length > 10);
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(far) < mean(near) * 0.65, 'fragments shrink into the void');
  for (const g of [room, again]) g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
});
const note = { ...placed, id: 'note-one', art: 'note', note: { text: 'PRIVATE TEST NOTE', who: 'YOZO' } };
function environment() {
  const sql = new DatabaseSync(':memory:'); sql.exec(fs.readFileSync(path.join(root, 'worker/schema.sql'), 'utf8'));
  class Statement {
    constructor(query, args = []) { this.query = query; this.args = args; }
    bind(...args) { return new Statement(this.query, args); }
    execute() { const q = sql.prepare(this.query); if (q.columns().length) return { results: q.all(...this.args), success: true, meta: {} }; const r = q.run(...this.args); return { results: [], success: true, meta: { changes: r.changes } }; }
    async all() { return this.execute(); }
    async run() { return this.execute(); }
    async first(col) { const r = this.execute().results[0]; return r ? col ? r[col] : r : null; }
  }
  const objects = new Map();
  return { sql, env: { DOOR: 'test-only', shdw_world: { prepare: q => new Statement(q), batch: async ss => { sql.exec('BEGIN'); try { const r = ss.map(s => s.execute()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } } }, ART: { get: async k => objects.get(k) ?? null, put: async (k, body) => objects.set(k, { body }), delete: async ks => { for (const k of [ks].flat()) objects.delete(k); } } } };
}
const request = (env, url, method = 'GET', body, auth = false) => worker.fetch(new Request('http://local.test' + url, { method, headers: { 'content-type': 'application/json', ...(auth ? { 'x-door': 'test-only', 'x-who': 'KOAN' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
const read = async (env, url = '/show', auth = false) => { const r = await request(env, url, 'GET', undefined, auth); assert.equal(r.status, 200); return r.json(); };
const put = async (env, p) => { if (p.art !== 'note' && !(await read(env)).art.some(a => a.id === p.art)) await request(env, '/art/' + p.art, 'PUT', {...meta, id:p.art}, true); const r = await request(env, '/show/items/' + p.id, 'PUT', p, true); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
function art() { const a = new ArtSystem(level, new THREE.Scene(), { state: { level: 'ground', yaw: 0 } }, new THREE.PerspectiveCamera(), '', {}); a.rebuild = () => {}; return a; }
function store() { memory.clear(); const s = new Store(); s.door = { key: 'test-only', who: 'KOAN' }; return s; }

test('new edit survives completion of the request it replaced', async () => {
  let release; const sent = [];
  global.fetch = async (_, init) => { sent.push(JSON.parse(init.body)); if (sent.length === 1) await new Promise(r => release = r); return new Response('{}'); };
  const s = store(); s.queue({ op: 'put', id: placed.id, item: { ...placed, topY: 1 } }); s.queue({ op: 'put', id: placed.id, item: { ...placed, topY: 2 } });
  release(); await new Promise(setImmediate);
  assert.deepEqual(sent.map(p => p.topY), [1, 2]); assert.equal(s.pending.length, 0); s.dispose();
});
test('failed writes and debounced edits survive reload', async () => {
  global.fetch = async () => new Response('{"error":"too big"}', { status: 413 });
  const s = store(); s.put(placed); assert.ok(memory.get('shdw-world-pending'));
  s.park(); await s.flush(); assert.equal(s.pending.length, 1);
  const next = new Store(); next.door = s.door; assert.deepEqual(next.overlay([]), [placed]); s.dispose(); next.dispose();
});
test('undo/redo touches only the local action and refuses intervening edits', () => {
  const a = art(); a.setShow([placed], [meta]); a.commit(); a.layout.items[0].topY = 3; a.autosave();
  a.applyShow([{ ...placed, id: 'other-person', art: 'other-art' }], []);
  assert.equal(a.doUndo(), true); assert.equal(a.layout.items.find(p => p.id === placed.id).topY, 2); assert.ok(a.layout.items.some(p => p.id === 'other-person'));
  assert.equal(a.doRedo(), true); a.applyShow([{ ...placed, topY: 4 }], []);
  assert.equal(a.doUndo(), false); assert.equal(a.layout.items.find(p => p.id === placed.id).topY, 4);
});
test('empty show stays empty; pending edits overlay after login', () => {
  const a = art(); const s = store(); a.store = s; a.layout.items = [placed]; a.setShow([], []); assert.deepEqual(a.layout.items, []);
  s.put(placed); a.setShow([], [meta]); assert.deepEqual(a.layout.items, [placed]); s.dispose();
});
test('public full and delta reads exclude notes; editors receive them', async () => {
  const { env } = environment(); await put(env, note);
  for (const url of ['/show', '/show?since=1']) { assert.equal((await read(env, url)).items.length, 0); assert.equal((await read(env, url, true)).items[0].note.text, note.note.text); }
  const r = await request(env, '/show/history'); assert.equal(r.status, 401);
});
test('client authenticates both kinds of show read', async () => {
  const headers = []; global.fetch = async (_, init) => { headers.push(init.headers); return Response.json({ version: 1, items: [], deleted: [], art: [], artDeleted: [] }); };
  const s = store(); await s.load(); await s.since(); assert.ok(headers.every(h => h['x-door'] === 'test-only')); s.dispose();
});
test('concurrent writes get distinct committed cursors; intermediate poll misses nothing', async () => {
  const { env } = environment(); const batch = env.shdw_world.batch; let writes = 0, release;
  env.shdw_world.batch = async ss => { if (ss[0].query.includes('CASE WHEN EXISTS') && ++writes === 2) await new Promise(r => release = r); return batch(ss); };
  const now = Date.now; Date.now = () => 2000000000000;
  try {
    const first = put(env, { ...placed, id: 'one' }); const second = put(env, { ...placed, id: 'two', art: 'test-art-2' });
    const a = await first; const midway = await read(env); release(); const b = await second;
    assert.ok(b.version > a.version); const delta = await read(env, '/show?since=' + (midway.version + 1)); assert.deepEqual(delta.items.map(p => p.id), ['two']);
  } finally { Date.now = now; }
});
test('latest state wins after delete/recreate; clear allocates unique history cursors', async () => {
  const { env, sql } = environment(); await put(env, placed); await request(env, '/show/items/' + placed.id, 'DELETE', undefined, true); await put(env, placed);
  const d = await read(env, '/show?since=1'); assert.equal(d.items.length, 1); assert.deepEqual(d.deleted, []);
  await put(env, { ...note }); await request(env, '/show/items', 'DELETE', undefined, true);
  assert.equal((await read(env, '/show', true)).items.length, 0);
  const rows = sql.prepare('SELECT ts FROM log').all(); assert.equal(new Set(rows.map(r => r.ts)).size, rows.length);
});
test('notes move and import independently; exports carry uploaded artwork references', async () => {
  const a = art(); a.library = [meta]; a.layout.items = [note]; a.target = () => note; a.noteItem = p => ({ ...meta, id: 'note', note: p.note }); a.hold = x => a.held = x;
  assert.equal(a.pickup(), true); assert.equal(a.held.note.text, note.note.text);
  await a.importFile(JSON.stringify({ format: 'koan-hang-layout/2', items: [note, { ...note, id: 'note-two', u: 2 }] })); assert.equal(a.layout.items.length, 2);
  a.setShow([placed], [meta]); const out = JSON.parse(a.exportFile().json); assert.equal(out.art[0].id, meta.id); assert.match(out.art[0].data, /^http/);
});
test('cycling skips placed originals and reaches free work', () => {
  const a = art(); a.library = [meta, { ...meta, id: 'free' }]; a.layout.items = [placed]; a.hold = x => a.held = x;
  a.swap(1); assert.equal(a.held.id, 'free');
});
test('invalid placements are rejected; one original is enforced atomically', async () => {
  const { env } = environment();
  assert.equal((await request(env, '/show/items/bad', 'PUT', {}, true)).status, 400);
  assert.equal((await request(env, '/show/items/bad', 'PUT', { ...placed, u: null }, true)).status, 400);
  await request(env, '/art/' + meta.id, 'PUT', meta, true);
  const results = await Promise.all(['one', 'two'].map(id => request(env, '/show/items/' + id, 'PUT', { ...placed, id }, true)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await read(env)).items.length, 1);
});
test('history pagination does not lose legacy rows with equal timestamps', async () => {
  const { env, sql } = environment(); for (let i = 0; i < 205; i++) sql.prepare('INSERT INTO log VALUES (100, ?, ?, ?, NULL)').run('KOAN', 'delete', 'old-' + i);
  const first = await read(env, '/show/history', true); assert.equal(first.rows.length, 200);
  const last = await read(env, '/show/history?beforeId=' + first.rows.at(-1).cursor, true); assert.equal(last.rows.length, 5);
  assert.equal(new Set([...first.rows, ...last.rows].map(r => r.cursor)).size, 205);
});
test('keyboard intent survives an idle gamepad and disconnected pads release keys', () => {
  let pads = [{ connected: true, axes: [0, 0, 0, 0], buttons: [] }];
  Object.defineProperty(global, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  const input = new Input({ addEventListener() {} }); input.locked = true;
  input.key({ code: 'KeyW', target: null }); input.pollPad(1/60); assert.equal(input.keys.has('KeyW'), true);
  pads[0].axes[0] = 1; input.pollPad(1/60); assert.equal(input.keys.has('KeyD'), true);
  pads = []; input.pollPad(1/60); assert.equal(input.keys.has('KeyD'), false); assert.equal(input.keys.has('KeyW'), true);
});
test('Escape works in text fields; free-mouse rings receive number keys', () => {
  const input = new Input({ addEventListener() {} }); const verbs = [], slots = [];
  input.onVerb = v => verbs.push(v); input.key({ code: 'Escape', target: { tagName: 'INPUT' } }); assert.deepEqual(verbs, ['back']);
  input.ringOpen = true; input.onSlot = n => slots.push(n); input.key({ code: 'Digit9', target: null }); assert.deepEqual(slots, [8]);
});
test('out-of-bounds nudges are rolled back before saving', () => {
  const a = art(); a.setShow([placed], [meta]); a.target = () => a.layout.items[0]; a.nudge(10000, 10000); assert.deepEqual(a.layout.items, [placed]);
});
test('rebuild reuses artwork geometry; removal disposes owned resources', () => {
  const a = new ArtSystem(level, new THREE.Scene(), { state: { level: 'ground', yaw: 0 } }, new THREE.PerspectiveCamera(), '', { image: () => new Promise(() => {}) });
  a.setShow([placed], [meta]); const mesh = a.group.children[0].children[0]; let disposed = 0; mesh.geometry.addEventListener('dispose', () => disposed++);
  for (let i = 0; i < 50; i++) { a.layout.items[0].u += .001; a.rebuild(); assert.equal(a.group.children[0].children[0].geometry, mesh.geometry); }
  a.layout.items = []; a.rebuild(); assert.equal(disposed, 1); a.dispose();
});
test('backup restores show, private notes and file bytes into an isolated empty store', async () => {
  const { pathToFileURL } = require('node:url'); const { backup, restore } = await import(pathToFileURL(path.join(root, 'worker/backup.mjs')));
  const source = environment(), dest = environment(); const base = 'http://local.test';
  const fetcher = env => (url, init) => worker.fetch(new Request(url, init), env);
  await request(source.env, '/art/' + meta.id, 'PUT', meta, true);
  await source.env.ART.put(meta.id + '.png', Buffer.from('test-file-bytes'));
  await put(source.env, placed); await put(source.env, note);
  const directory = path.join(scratch, 'backup'); await backup(base, 'test-only', directory, fetcher(source.env));
  const restored = await restore(base, 'test-only', directory, fetcher(dest.env));
  assert.equal(restored.items.length, 2); assert.equal(restored.art[0].title, meta.title); assert.equal(restored.items.find(p=>p.note).note.text, note.note.text);
  assert.equal(await (await request(dest.env, '/art/' + meta.id + '.png')).text(), 'test-file-bytes');
  await assert.rejects(restore(base, 'test-only', directory, fetcher(dest.env)), /empty destination/);
});
test('artwork sync follows server versions, regardless of browser clock', async () => {
  const a = art(); a.setShow([], [meta]); a.store = { open: true, updateArt: async () => 10 };
  await a.updateArt(meta.id, { title: 'local title' });
  assert.equal(a.applyArt([{ ...meta, title: 'remote title', ts: 11 }], []), true);
  assert.equal(a.library[0].title, 'remote title');
});

test('sculpture textures wait for decoded image data before reaching materials', async () => {
  const a = art(); let ready;
  a.loader = { image: () => new Promise(resolve => ready = resolve) };
  assert.equal(a.tile('custom', 20, 'http://local.test/tile.png'), null);
  const image = { width: 8, height: 8 }; ready(new THREE.Texture(image)); await new Promise(setImmediate);
  const texture = a.tile('custom', 20, 'http://local.test/tile.png');
  assert.equal(texture.image, image); assert.equal(texture.repeat.x, 5); texture.dispose(); a.dispose();
});

test('a rejected edit survives reload while unrelated saves continue and retry succeeds', async () => {
  const s = store(); const sent = []; let reject = true;
  global.fetch = async (url, init) => { sent.push(url); return reject && url.endsWith('/bad') ? Response.json({ error: 'invalid placement' }, { status: 400 }) : Response.json({ ok: true }); };
  s.queue({ op: 'put', id: 'bad', item: { ...placed, id: 'bad' } });
  s.queue({ op: 'put', id: 'good', item: { ...placed, id: 'good' } }); await new Promise(setImmediate);
  assert.equal(sent.length, 2); assert.equal(s.pending.length, 1); assert.equal(s.pending[0].error, 'invalid placement');
  await s.flush(); assert.equal(sent.length, 2); s.dispose();
  const reopened = new Store(); reopened.door = { key: 'test-only', who: 'KOAN' };
  assert.equal(reopened.overlay([])[0].id, 'bad'); assert.equal(reopened.pending[0].error, 'invalid placement');
  reject = false; await reopened.retry(); assert.equal(reopened.pending.length, 0); assert.equal(memory.has('shdw-world-pending'), false); reopened.dispose();
});

test('an obsolete rejection cannot block its replacement; a rejected clear preserves ordering', async () => {
  const s = store(); let release;
  global.fetch = async () => { if (!release) return new Promise(r => release = r); return Response.json({ ok: true }); };
  s.queue({ op: 'put', id: placed.id, item: placed }); s.queue({ op: 'put', id: placed.id, item: { ...placed, topY: 3 } });
  release(Response.json({ error: 'old rejected' }, { status: 409 })); await new Promise(setImmediate); assert.equal(s.pending.length, 0);
  let calls = 0; global.fetch = async () => { calls++; return Response.json({ error: 'clear rejected' }, { status: 400 }); };
  s.clear(); s.queue({ op: 'put', id: placed.id, item: placed }); await new Promise(setImmediate);
  assert.equal(calls, 1); assert.equal(s.pending.length, 2); s.dispose();
});

test('artwork removal and placement check references inside the write transaction', async () => {
  for (const heldOp of ['placement', 'removal']) {
    const { env, sql } = environment(); await request(env, '/art/' + meta.id, 'PUT', meta, true);
    const batch = env.shdw_world.batch; let release, reached; const waiting = new Promise(r => reached = r);
    env.shdw_world.batch = async ss => {
      const query = ss[0].query;
      if ((heldOp === 'placement' ? query.includes('CASE WHEN EXISTS') : query.includes("'art-delete'")) && !release) { reached(); await new Promise(r => release = r); }
      return batch(ss);
    };
    const placement = () => request(env, '/show/items/' + placed.id, 'PUT', placed, true);
    const removal = () => request(env, '/art/' + meta.id, 'DELETE', undefined, true);
    const pending = heldOp === 'placement' ? placement() : removal(); await waiting;
    const winner = await (heldOp === 'placement' ? removal() : placement()); assert.equal(winner.status, 200);
    const logs = sql.prepare('SELECT COUNT(*) AS n FROM log').get().n; release(); assert.equal((await pending).status, 409);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM log').get().n, logs);
    const show = await read(env); assert.equal(show.items.length, heldOp === 'placement' ? 0 : 1); assert.equal(show.art.length, show.items.length);
  }
  const { env } = environment(); await put(env, placed);
  assert.equal((await request(env, '/art/' + meta.id, 'PUT', { ...meta, kind: 'sculpture' }, true)).status, 409);
  assert.equal((await read(env)).art[0].kind, 'painting');
});

test('touch walks and looks without pointer lock, shares collision code, and stops on pause', async () => {
  const listeners = new Map(); const oldWindow = window, oldDocument = document;
  global.window = { ...oldWindow, addEventListener: (name, fn) => listeners.set(name, fn) };
  global.document = { ...oldDocument, addEventListener: (name, fn) => listeners.set(name, fn) };
  let locks = 0;
  const dom = { addEventListener() {}, requestPointerLock() { locks++; } };
  const input = new Input(dom); input.settings.touchControls = true;
  const walker = new Walker(level, new THREE.PerspectiveCamera(), dom);
  walker.teleport('ground', 6.18, 4.3); walker.state.yaw = 0; walker.keys = input.keys;
  input.onLockChange = on => walker.setLocked(on); input.onLook = (x, y) => walker.look(x, y);
  try {
    await input.lock(); assert.equal(locks, 0); assert.equal(walker.state.locked, true);
    input.touchMove(0, -1); input.touchLook(30, -20); input.pollPad(1/60);
    assert.equal(input.keys.has('KeyW'), true); assert.ok(walker.state.yaw < 0); assert.ok(walker.state.pitch > 0);
    const start = walker.state.z; walker.update(1/60); assert.ok(walker.state.z < start);
    input.touchMove(0, 0); const stopped = walker.state.z; walker.update(1/60); assert.equal(walker.state.z, stopped);
    input.touchMove(0, -1); input.release(); assert.equal(walker.state.locked, false); assert.equal(input.keys.size, 0);
    const yaw = walker.state.yaw; input.touchLook(100, 100); assert.equal(walker.state.yaw, yaw);
    input.setTouchActive(true); input.touchMove(0, -1); listeners.get('blur')(); assert.equal(input.active, false); assert.equal(input.keys.size, 0);
    input.setTouchActive(true); input.touchMove(0, -1); document.hidden = true; listeners.get('visibilitychange')(); assert.equal(input.keys.size, 0);
    input.dispose();
  } finally { global.window = oldWindow; global.document = oldDocument; }
});
