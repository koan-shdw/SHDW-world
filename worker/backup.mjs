// A portable snapshot of the current show and its referenced R2 files. No credentials in the archive.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeFile = name => /^[A-Za-z0-9_.:-]+\.(jpg|png|webp|glb)$/.test(name) && !name.includes('..');
const checked = async response => { if (!response.ok) throw new Error(`store returned ${response.status}`); return response; };
const headers = key => ({ 'x-door': key, 'x-who': 'KOAN', 'content-type': 'application/json' });
export async function backup(base, key, dir, fetcher = fetch) {
  await checked(await fetcher(base + '/door', { method: 'POST', headers: headers(key) }));
  const show = await (await checked(await fetcher(base + '/show', { headers: headers(key) }))).json();
  const files = new Set();
  for (const a of show.art) { files.add(`${a.id}.${a.ext ?? (a.kind === 'sculpture' ? 'glb' : 'jpg')}`); if (a.hasThumb) files.add(`${a.id}.thumb.jpg`); }
  for (const p of [...show.items, ...show.art]) if (p.texture?.url) {
    const url = new URL(p.texture.url); if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/art/')) throw new Error('external custom texture must be archived separately');
    files.add(decodeURIComponent(url.pathname.slice(5)));
  }
  await mkdir(join(dir, 'files'), { recursive: true });
  const entries = [];
  for (const name of files) {
    if (!safeFile(name)) throw new Error('invalid asset name');
    const r = await checked(await fetcher(base + '/art/' + encodeURIComponent(name)));
    const bytes = Buffer.from(await r.arrayBuffer());
    await writeFile(join(dir, 'files', name), bytes);
    entries.push({ name, type: r.headers.get('content-type'), sha256: hash(bytes) });
  }
  const end = await (await checked(await fetcher(base + '/show', { headers: headers(key) }))).json();
  if (end.version !== show.version) throw new Error('show changed during backup; repeat while editors are idle');
  const manifest = { format: 'shdw-backup/1', source: base, created: new Date().toISOString(), show, files: entries };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
export async function restore(base, key, dir, fetcher = fetch) {
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  if (m.format !== 'shdw-backup/1') throw new Error('unsupported backup');
  // Verify every byte before the first write.
  const files = [];
  for (const f of m.files) { if (!safeFile(f.name)) throw new Error('invalid asset name'); const bytes = await readFile(join(dir, 'files', f.name)); if (hash(bytes) !== f.sha256) throw new Error(`checksum failed: ${f.name}`); files.push({ ...f, bytes }); }
  await checked(await fetcher(base + '/door', { method: 'POST', headers: headers(key) }));
  const current = await (await checked(await fetcher(base + '/show', { headers: headers(key) }))).json();
  if (current.items.length || current.art.length) throw new Error('restore requires an empty destination');
  for (const f of files) {
    const thumb = f.name.endsWith('.thumb.jpg'), id = f.name.replace(thumb ? /\.thumb\.jpg$/ : /\.[^.]+$/, '');
    await checked(await fetcher(`${base}/art/${encodeURIComponent(id)}/${thumb ? 'thumb' : 'file'}`, { method: 'PUT', headers: { ...headers(key), 'content-type': f.type }, body: f.bytes }));
  }
  const rebase = p => { const { who, ts, ...copy } = p; if (copy.texture?.url?.startsWith(m.source + '/art/')) copy.texture = { ...copy.texture, url: base + copy.texture.url.slice(m.source.length) }; return copy; };
  for (const a of m.show.art) await checked(await fetcher(base + '/art/' + encodeURIComponent(a.id), { method: 'PUT', headers: headers(key), body: JSON.stringify(rebase(a)) }));
  for (const p of m.show.items) await checked(await fetcher(base + '/show/items/' + encodeURIComponent(p.id), { method: 'PUT', headers: headers(key), body: JSON.stringify(rebase(p)) }));
  const result = await (await checked(await fetcher(base + '/show', { headers: headers(key) }))).json();
  if (result.items.length !== m.show.items.length || result.art.length !== m.show.art.length) throw new Error('restore count mismatch');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, directory, remote] = process.argv.slice(2), base = process.env.SHDW_STORE?.replace(/\/$/, ''), key = process.env.SHDW_DOOR;
  try {
    if (!base || !key || !directory || !['backup', 'restore'].includes(mode)) throw new Error('set SHDW_STORE and SHDW_DOOR, then: node worker/backup.mjs backup|restore DIRECTORY [--allow-remote]');
    if (mode === 'restore' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname) && remote !== '--allow-remote') throw new Error('remote restore requires --allow-remote and an empty destination');
    const result = await (mode === 'backup' ? backup : restore)(base, key, resolve(directory));
    console.log(`${mode} verified: ${result.show?.items.length ?? result.items.length} placements`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
