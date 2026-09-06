<script lang="ts">
  // Adding works (GAME-UI §2): drop images or .glb anywhere; a small panel above the hotbar takes title + h w d, Enter commits.
  import { bus } from '../bus'
  interface Pending { key: number; name: string; data: string; iw: number; ih: number; title: string; h: number; w: number; d: number; edge: string; kind: 'painting' | 'sculpture'; mw?: number; mh?: number; md?: number; probing?: boolean }
  let pending = $state<Pending[]>([])
  let pick: HTMLInputElement
  let seq = 0
  const readData = (f: File): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
  const readImage = (f: File): Promise<{ data: string; w: number; h: number }> => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => { const img = new Image(); img.onload = () => res({ data: r.result as string, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => rej(new Error('not an image')); img.src = r.result as string }
    r.onerror = () => rej(r.error); r.readAsDataURL(f)
  })
  bus.on('model_probed', ({ key, w, h, d, error }) => {
    const p = pending.find((x) => x.key === key); if (!p) return
    if (error || !h) { bus.toast(`${p.name}: not a model I can read`, 'warn'); pending = pending.filter((x) => x.key !== key); return }
    p.probing = false; p.mw = w; p.mh = h; p.md = d; p.h = h; p.w = w; p.d = d
  })
  const addModel = async (f: File) => {
    const data = await readData(f); const key = seq++
    pending.push({ key, name: f.name, data, iw: 1, ih: 1, title: f.name.replace(/\.[a-z0-9]+$/i, ''), h: 0, w: 0, d: 0, edge: 'wrap', kind: 'sculpture', probing: true })
    bus.emit('probe_model', { data, key })
  }
  const addForm = async (f: File) => {
    if (/\.glb$/i.test(f.name)) { void addModel(f); return }
    let img: { data: string; w: number; h: number }
    try { img = await readImage(f) } catch { bus.toast(`${f.name}: not an image`, 'warn'); return }
    pending.push({ key: seq++, name: f.name, data: img.data, iw: img.w, ih: img.h, title: f.name.replace(/\.[a-z0-9]+$/i, ''), h: 90, w: Math.round(90 * img.w / img.h), d: 4, edge: 'wrap', kind: 'painting' })
  }
  const takeFiles = (files: FileList | null) => { if (files) for (const f of Array.from(files)) void addForm(f) }
  const commit = (p: Pending) => {
    const h = Number(p.h), w = Number(p.w), d = Number(p.d)
    if (!(h > 0 && w > 0 && d >= 0)) { bus.toast('h w d in cm, please', 'warn'); return }
    bus.emit('add_local', { item: { title: p.title || p.name, data: p.data, h, w, d, edge: p.edge, kind: p.kind } })
    pending = pending.filter((x) => x.key !== p.key)
  }
  export function drop(e: DragEvent): void {
    e.preventDefault()
    const fs = e.dataTransfer?.files ?? null
    const jsons = fs ? Array.from(fs).filter((f) => f.name.endsWith('.json')) : []
    if (jsons.length) { void jsons[0].text().then((text) => bus.emit('import_file', { text, name: jsons[0].name })); return }
    takeFiles(fs)
  }
  export function open(): void { pick.click() }
  const onH = (p: Pending) => { if (p.kind === 'sculpture' && p.mh) { p.w = Math.round(Number(p.h) * p.mw! / p.mh); p.d = Math.round(Number(p.h) * p.md! / p.mh) } else p.w = Math.round(Number(p.h) * p.iw / p.ih) }
</script>

<input type="file" accept="image/*,.glb" multiple hidden bind:this={pick} onchange={() => { takeFiles(pick.files); pick.value = '' }} />
{#if pending.length}
  <div class="addpanel">
    <div class="legend">new work · type h w d in cm · enter</div>
    {#each pending as p (p.key)}
      <div class="addrow">
        {#if p.kind === 'sculpture'}<div class="thumb model">{p.probing ? '…' : `${p.mw} × ${p.mh} × ${p.md}`}</div>{:else}<img class="thumb" src={p.data} alt={p.name} />{/if}
        <div class="fields">
          <input type="text" placeholder="title" bind:value={p.title} onkeydown={(e) => { if (e.key === 'Enter') commit(p) }} />
          <input type="number" placeholder="h cm" bind:value={p.h} oninput={() => onH(p)} onkeydown={(e) => { if (e.key === 'Enter') commit(p) }} />
          <input type="number" placeholder="w cm" bind:value={p.w} onkeydown={(e) => { if (e.key === 'Enter') commit(p) }} />
          <input type="number" placeholder="d cm" bind:value={p.d} onkeydown={(e) => { if (e.key === 'Enter') commit(p) }} />
          {#if p.kind === 'painting'}<select bind:value={p.edge}><option value="wrap">wrap</option><option value="white">white</option></select>{/if}
          <button class="chip" onclick={() => commit(p)}>add</button>
          <button class="chip" onclick={() => (pending = pending.filter((x) => x.key !== p.key))}>×</button>
        </div>
      </div>
    {/each}
  </div>
{/if}
