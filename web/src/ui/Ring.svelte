<script lang="ts">
  // The action ring, Zelda style (owner's pick 09-06): round tiles on a ring, the aimed tile grows, its name on a pill above,
  // the room dims behind. Aim = mouse deltas while locked, the cursor when free, the right stick on a pad. Keys 1-9. Click / A does it.
  // Two rings: click = actions; right click on a sculpture = the look ring (colour · material · done), the sculpture only.
  import Icon from './Icon.svelte'
  import { bus, type TouchAction } from '../bus'
  import { ui } from './state.svelte'
  type IconName = 'hand' | 'down' | 'swap' | 'turn' | 'look' | 'align' | 'cross' | 'back' | 'check'
  interface Slice { id: string; label: string; icon?: IconName; colour?: string; img?: string; key: string }
  let { base }: { base: string } = $props()
  const t = $derived(ui.touch)
  const at = $derived(ui.anchors['touch'])
  let page = $state<'actions' | 'look' | 'colour' | 'material' | 'parts' | 'slot'>('actions')
  $effect(() => { page = t?.ring ?? 'actions' })
  const slot = $derived(ui.slotRing)
  $effect(() => { if (slot) page = 'slot' })
  let part = $state<string | null>(null)                       // the part a colour pick goes to; null = the whole sculpture
  let upload = $state<HTMLInputElement>()
  const parts = $derived(ui.art?.focus?.parts ?? [])
  const closeSlot = () => { ui.slotRing = null; bus.emit('ui_ring', { open: false, x: 0, y: 0 }) }
  const onUpload = async () => {
    const f = upload?.files?.[0]; if (!f) return
    const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
    bus.emit('set_sculpt', { patch: { texture: { name: 'custom', cm: look?.texture?.cm ?? 60, url } } })
    if (upload) upload.value = ''
  }
  const look = $derived(ui.art?.focus && ui.art.focus.placed === t?.placed ? ui.art.focus.look : null)
  const COLOURS: [string, string][] = [['white', '#f2f2ee'], ['ink', '#1a1a1a'], ['sky', '#66BDE6'], ['coral', '#c25959'], ['yellow', '#f3c258'], ['green', '#8cc48c'], ['pink', '#d4537e'], ['slate', '#647A87']]
  const MATERIALS: [string, string | null][] = [['none', null], ['concrete', 'concrete.jpg'], ['plaster', 'wall-white.jpg'], ['plywood', 'plywood.jpg'], ['steel', 'steel-black.jpg'], ['corten', 'corten.jpg'], ['slate', 'slate.jpg'], ['checker', 'checker.jpg']]
  const slices = $derived.by<Slice[]>(() => {
    if (slot) return [{ id: 's:hold', label: slot.placed ? 'on the wall' : 'hold', icon: 'hand', key: '1' }, ...(slot.local && !slot.placed ? [{ id: 's:remove', label: 'remove', icon: 'down' as IconName, key: '2' }] : []), { id: 's:done', label: 'done', icon: 'cross', key: 'esc' }]
    if (!t) return []
    if (page === 'parts') return [{ id: 'p:', label: 'whole', colour: look?.colour ?? '#f2f2ee', key: '1' }, ...parts.slice(0, 6).map((n, i) => ({ id: `p:${n}`, label: n.slice(0, 10), colour: look?.parts?.[n] ?? look?.colour ?? '#f2f2ee', key: String(i + 2) })), { id: 'back', label: 'back', icon: 'back' as IconName, key: '9' }]
    if (page === 'colour') return [...COLOURS.map(([n, c], i) => ({ id: `c:${c}`, label: n, colour: c, key: String(i + 1) })), { id: 'back', label: 'back', icon: 'back' as IconName, key: '9' }]
    if (page === 'material') return [...MATERIALS.map(([n, f], i) => ({ id: `m:${n}`, label: n, img: f ? `${base}data/textures/${f}` : undefined, icon: f ? undefined : ('cross' as IconName), key: String(i + 1) })), { id: 'upload', label: 'your image', icon: 'hand' as IconName, key: '9' }, { id: 'back', label: 'back', icon: 'back' as IconName, key: '0' }]
    if (page === 'look') return [{ id: 'colour', label: 'colour', colour: look?.colour ?? '#f2f2ee', key: '1' }, { id: 'material', label: 'material', icon: 'look', key: '2' }, ...(parts.length > 1 ? [{ id: 'parts', label: 'parts', icon: 'align' as IconName, key: '3' }] : []), { id: 'done', label: 'done', icon: 'cross', key: 'esc' }]
    if (t.note) return [{ id: 'move', label: 'move', icon: 'hand', key: '1' }, { id: 'down', label: 'take down', icon: 'down', key: '2' }, { id: 'done', label: 'done', icon: 'cross', key: 'esc' }]
    return [
      { id: 'move', label: 'move', icon: 'hand', key: '1' },
      { id: 'down', label: 'take down', icon: 'down', key: '2' },
      { id: 'swap', label: 'swap', icon: 'swap', key: '3' },
      ...(t.kind === 'sculpture' ? [{ id: 'turn', label: 'turn', icon: 'turn' as IconName, key: '4' }, { id: 'look', label: 'look', icon: 'look' as IconName, key: '5' }] : [{ id: 'alignWall', label: 'align wall', icon: 'align' as IconName, key: '4' }]),
      { id: 'done', label: 'done', icon: 'cross', key: 'esc' },
    ]
  })
  const R = $derived(slices.length > 6 ? 118 : 96)
  const aim = $derived(ui.ringAim)
  const hot = $derived.by(() => {
    if (!slices.length || !aim || Math.hypot(aim.x, aim.y) < 16) return -1
    const a = Math.atan2(aim.y, aim.x)
    const n = slices.length; const step = (Math.PI * 2) / n
    let best = -1, bd = Infinity
    slices.forEach((_, i) => { const sa = -Math.PI / 2 + i * step; const d = Math.abs(((a - sa + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (d < bd) { bd = d; best = i } })
    return bd <= step / 2 + 0.01 ? best : -1
  })
  $effect(() => { ui.ringHot = hot >= 0 && slices[hot] ? slices[hot].id : null })
  const pos = (i: number) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, slices.length); return { x: Math.cos(a) * R, y: Math.sin(a) * R } }
  const act = (id: string) => {
    if (id === 's:hold') { if (slot && !slot.placed) bus.emit('hold', { id: slot.id }); closeSlot(); return }
    if (id === 's:remove') { if (slot && confirm(`remove ${slot.title} from the library?`)) bus.emit('remove_local', { id: slot.id }); closeSlot(); return }
    if (id === 's:done') { closeSlot(); return }
    if (id === 'parts') { page = 'parts'; return }
    if (id.startsWith('p:')) { part = id.slice(2) || null; page = 'colour'; return }
    if (id === 'upload') { upload?.click(); return }
    if (id === 'look') { page = 'look'; return }
    if (id === 'colour') { page = 'colour'; return }
    if (id === 'material') { page = 'material'; return }
    if (id === 'back') { page = part ? 'parts' : 'look'; if (page === 'parts') part = null; return }
    if (id.startsWith('c:')) { if (part) bus.emit('set_sculpt', { patch: { parts: { ...(look?.parts ?? {}), [part]: id.slice(2) } } }); else bus.emit('set_sculpt', { patch: { colour: id.slice(2) } }); return }      // stays open: test the next one
    if (id.startsWith('m:')) { const n = id.slice(2); bus.emit('set_sculpt', { patch: { texture: n === 'none' ? null : { name: n, cm: look?.texture?.cm ?? 60 } } }); return }
    bus.emit('touch_action', { action: id as TouchAction })
  }
  $effect(() => bus.on('ring_confirm', () => { if (hot >= 0 && slices[hot]) act(slices[hot].id) }))
  $effect(() => bus.on('touch', ({ touch }) => { if (!touch) part = null }))
  $effect(() => bus.on('ring_key', ({ n }) => { const s = slices[n]; if (s && s.key !== 'esc') act(s.id) }))
  const name = $derived(hot >= 0 && slices[hot] ? slices[hot].label : slot ? slot.title : page === 'colour' ? (part ? part.slice(0, 12) : 'colour') : page === 'material' ? 'material' : page === 'parts' ? 'parts' : t?.title ?? '')
  const ringAt = $derived(slot ? { x: slot.x, y: slot.y, visible: true } : at)
  const isOn = (s: Slice) => (s.id.startsWith('c:') && (part ? look?.parts?.[part] : look?.colour)?.toLowerCase() === s.id.slice(2).toLowerCase()) || (s.id.startsWith('m:') && (look?.texture?.name ?? 'none') === s.id.slice(2))
</script>

<input type="file" accept="image/*" hidden bind:this={upload} onchange={onUpload} />
{#if (t || slot) && ringAt?.visible}
  {#if !slot}<div class="ringdim"></div>{/if}
  <div class="ring" style="left:{ringAt.x}px; top:{ringAt.y}px; --r:{R}px" role="menu" aria-label="actions">
    <div class="orbit"></div>
    <div class="name" class:hot={hot >= 0}>{name}</div>
    {#each slices as s, i (page + s.id)}
      {@const p = pos(i)}
      <button class="tile" class:hot={i === hot} class:on={isOn(s)} class:swatch={!!s.colour} style="--tx:{p.x}px; --ty:{p.y}px; animation-delay: {i * 25}ms; {s.colour ? `background:${s.colour}` : ''}{s.img ? `background-image:url(${s.img})` : ''}" onclick={() => act(s.id)} onmouseenter={() => (ui.ringAim = { x: p.x, y: p.y })} title={s.label}>
        {#if s.icon}<Icon name={s.icon} size={24} />{/if}
        <span class="key">{s.key}</span>
      </button>
    {/each}
  </div>
{/if}
