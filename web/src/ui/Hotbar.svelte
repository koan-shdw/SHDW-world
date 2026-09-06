<script lang="ts">
  // The hotbar (GAME-UI §2): ten slots, the library in order, 1-0 picks, the held one wears the accent ring.
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  let { base, onadd }: { base: string; onadd: () => void } = $props()
  const lib = $derived(ui.art?.library ?? [])
  const heldIndex = $derived(ui.art?.held ? lib.findIndex((a) => a.id === ui.art?.held) : -1)
  // more than ten works: the bar shows a window of ten that keeps the held slot in view
  const start = $derived(lib.length <= 10 ? 0 : Math.max(0, Math.min(lib.length - 10, heldIndex - 5)))
  const slots = $derived(Array.from({ length: 10 }, (_, i) => ({ i: start + i, a: lib[start + i] ?? null })))
  const keyOf = (i: number) => (i < 9 ? String(i + 1) : i === 9 ? '0' : '')
  const thumb = (a: NonNullable<(typeof lib)[number]>) => a.kind === 'sculpture' ? a.thumb ?? '' : a.data ?? `${base}data/art/${a.file}`

  // the slot ring (GAME-UI §2): click a slot, a small ring at the slot: hold · remove · done. The mouse is free here, it aims
  const openSlotRing = (e: MouseEvent, a: NonNullable<(typeof lib)[number]>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top - 8
    ui.slotRing = { id: a.id, x, y, title: a.title, local: !!(a.data || a.model?.startsWith('data:')), placed: !!ui.art?.placed[a.id] }
    ui.ringAim = null; bus.emit('ui_ring', { open: true, x, y })
  }
  // right click on a slot: the held one goes back; a free local one can leave the library
  const remove = (e: MouseEvent, id: string, title: string, local: boolean) => { e.preventDefault(); if (ui.art?.held === id) { bus.emit('hold', { id }); return } if (ui.art?.placed[id]) { bus.toast(`${title} is on the wall`, 'warn'); return } if (!local) { bus.toast('repo works stay', 'warn'); return } if (confirm(`remove ${title} from the library?`)) bus.emit('remove_local', { id }) }
</script>

<div class="hotbar" class:dim={!ui.hud.cross}>
  {#if !lib.length}
    <button class="slot empty wide" onclick={onadd} title="drop images or .glb anywhere, or click">drop images here</button>
  {:else}
    {#each slots as s (s.i)}
      {#if s.a}
        <button class="slot" class:held={s.a.id === ui.art?.held} class:placed={!!ui.art?.placed[s.a.id]} title="{s.a.title} · {s.a.w} × {s.a.h} × {s.a.d} cm · {ui.art?.placed[s.a.id] ? 'on the wall · walk up to it, press e' : 'click = hold · right click = remove'}"
          onclick={(e) => openSlotRing(e, s.a!)} oncontextmenu={(e) => remove(e, s.a!.id, s.a!.title, !!(s.a!.data || s.a!.model?.startsWith('data:')))}>
          <span class="key">{keyOf(s.i)}</span>
          {#if thumb(s.a)}<img src={thumb(s.a)} alt={s.a.title} />{:else}<span class="model">…</span>{/if}
          {#if ui.art?.placed[s.a.id]}<span class="count">{s.a.kind === 'sculpture' ? 'placed' : 'on wall'}</span>{/if}
        </button>
      {:else}
        <button class="slot empty" onclick={onadd} title="empty · drop a work here"><span class="key">{keyOf(s.i)}</span></button>
      {/if}
    {/each}
  {/if}
</div>
