<script lang="ts">
  // The hotbar (GAME-UI §2): ten slots, the library in order, 1-0 picks, the held one wears the accent ring.
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  let { base, onadd }: { base: string; onadd: () => void } = $props()
  const lib = $derived(ui.art?.library ?? [])
  const heldIndex = $derived(ui.art?.held ? lib.findIndex((a) => a.id === ui.art?.held) : -1)
  // more than ten works: the bar shows a window of ten that keeps the held slot in view
  // nine works in a window that keeps the held one in view; the tenth slot (0) is always the post-it (SHOW.md §6)
  const start = $derived(lib.length <= 9 ? 0 : Math.max(0, Math.min(lib.length - 9, heldIndex - 4)))
  const slots = $derived(Array.from({ length: 9 }, (_, i) => ({ i: start + i, a: lib[start + i] ?? null })))
  const noteColour = $derived(ui.door.who === 'YOZO' ? '#4d7cff' : '#e5484d')
  const noteHeld = $derived(ui.art?.held === 'note')
  const keyOf = (i: number) => (i < 9 ? String(i + 1) : i === 9 ? '0' : '')
  const thumb = (a: NonNullable<(typeof lib)[number]>) => a.kind === 'sculpture' ? a.thumb ?? '' : a.thumb ?? a.data ?? `${base}data/art/${a.file}`
  const mine = (a: NonNullable<(typeof lib)[number]>) => !!(a.store || a.data?.startsWith('data:') || a.model?.startsWith('data:'))   // the store's and this browser's leave; the repo's stay

  // the slot ring (GAME-UI §2): click a slot, a small ring at the slot: hold · remove · done. The mouse is free here, it aims
  const openSlotRing = (e: MouseEvent, a: NonNullable<(typeof lib)[number]>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top - 8
    ui.slotRing = { id: a.id, x, y, title: a.title, local: mine(a), placed: !!ui.art?.placed[a.id] }
    ui.ringAim = null; bus.emit('ui_ring', { open: true, x, y })
  }
  // right click on a slot: the held one goes back; a free local one can leave the library
  const remove = (e: MouseEvent, id: string, title: string, local: boolean) => { e.preventDefault(); if (ui.art?.held === id) { bus.emit('hold', { id }); return } if (ui.art?.placed[id]) { bus.toast(`${title} is on the wall`, 'warn'); return } if (!local) { bus.toast('repo works stay', 'warn'); return } if (confirm(`remove ${title} from the library?`)) bus.emit('remove_local', { id }) }
</script>

<div class="hotbar" class:dim={!ui.hud.cross}>
  {#if !lib.length}
    <button class="slot empty wide" onclick={onadd} title="settings › art: drop images or .glb">add art in settings</button>
  {:else}
    {#each slots as s (s.i)}
      {#if s.a}
        <button class="slot" class:held={s.a.id === ui.art?.held} class:placed={!!ui.art?.placed[s.a.id]} title="{s.a.title} · {s.a.w} × {s.a.h} × {s.a.d} cm · {ui.art?.placed[s.a.id] ? 'on the wall · walk up to it, press e' : 'click = hold · right click = remove'}"
          onclick={(e) => openSlotRing(e, s.a!)} oncontextmenu={(e) => remove(e, s.a!.id, s.a!.title, mine(s.a!))}>
          <span class="key">{keyOf(s.i)}</span>
          {#if thumb(s.a)}<img src={thumb(s.a)} alt={s.a.title} />{:else}<span class="model">…</span>{/if}
          {#if ui.art?.placed[s.a.id]}<span class="count">{s.a.kind === 'sculpture' ? 'placed' : 'on wall'}</span>{/if}
        </button>
      {:else}
        <button class="slot empty" onclick={onadd} title="empty · add art in settings"><span class="key">{keyOf(s.i)}</span></button>
      {/if}
    {/each}
    <button class="slot note" class:held={noteHeld} style="--note: {noteColour}" onclick={() => bus.emit('note_open', {})} title="post-it · 0 · a note in your colour, stick it on a wall"><span class="key">0</span><span class="paper"></span></button>
  {/if}
</div>
