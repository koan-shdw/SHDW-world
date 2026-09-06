<script lang="ts">
  // The action ring, Zelda style (owner's pick 09-06): round tiles on a ring, the aimed tile grows, its name on a pill above,
  // the room dims behind. Aim = mouse deltas while locked, the cursor when free, the right stick on a pad. Keys 1-5. Click / A does it.
  import Icon from './Icon.svelte'
  import { bus, type TouchAction } from '../bus'
  import { ui } from './state.svelte'
  interface Slice { id: TouchAction | 'look'; label: string; icon: 'hand' | 'down' | 'swap' | 'turn' | 'look' | 'align' | 'cross'; key: string }
  const t = $derived(ui.touch)
  const at = $derived(ui.anchors['touch'])
  const slices = $derived<Slice[]>(t
    ? [
        { id: 'move', label: 'move', icon: 'hand', key: '1' },
        { id: 'down', label: 'take down', icon: 'down', key: '2' },
        { id: 'swap', label: 'swap', icon: 'swap', key: '3' },
        ...(t.kind === 'sculpture' ? [{ id: 'turn', label: 'turn', icon: 'turn', key: '4' } as Slice, { id: 'look', label: 'look', icon: 'look', key: '5' } as Slice] : [{ id: 'alignWall', label: 'align wall', icon: 'align', key: '4' } as Slice]),
        { id: 'done', label: 'done', icon: 'cross', key: 'esc' },
      ]
    : [])
  const R = 96
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
  const act = (id: Slice['id']) => { if (id === 'look') { ui.lookOpen = true; return } bus.emit('touch_action', { action: id as TouchAction }) }
  $effect(() => bus.on('ring_confirm', () => { if (hot >= 0 && slices[hot]) act(slices[hot].id) }))
  const name = $derived(hot >= 0 && slices[hot] ? slices[hot].label : t?.title ?? '')
</script>

{#if t && at?.visible}
  <div class="ringdim"></div>
  <div class="ring" style="left:{at.x}px; top:{at.y}px" role="menu" aria-label="actions">
    <div class="orbit"></div>
    <div class="name" class:hot={hot >= 0}>{name}</div>
    {#each slices as s, i (s.id)}
      {@const p = pos(i)}
      <button class="tile" class:hot={i === hot} style="--tx:{p.x}px; --ty:{p.y}px; animation-delay: {i * 30}ms" onclick={() => act(s.id)} onmouseenter={() => (ui.ringAim = { x: p.x, y: p.y })} title={s.label}>
        <Icon name={s.icon} size={24} />
        <span class="key">{s.key}</span>
      </button>
    {/each}
  </div>
{/if}
