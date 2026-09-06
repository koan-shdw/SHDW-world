<script lang="ts">
  // The hands slot (GAME-UI §3): the held work, bottom right, like the selected weapon. Empty hands = nothing drawn.
  import { ui } from './state.svelte'
  let { base }: { base: string } = $props()
  const held = $derived(ui.art?.held ? ui.art.library.find((a) => a.id === ui.art?.held) ?? null : null)
  const look = $derived(ui.art?.focus && ui.art.focus.placed === null ? ui.art.focus.look : null)
  const thumb = $derived(held ? (held.kind === 'sculpture' ? held.thumb ?? '' : held.data ?? `${base}data/art/${held.file}`) : '')
</script>

{#if held}
  <div class="hands">
    {#if thumb}<img src={thumb} alt={held.title} />{:else}<div class="model">…</div>{/if}
    <div class="txt">
      <div class="title">{held.title}</div>
      <div class="size">{held.w} × {held.h} × {held.d} cm</div>
      {#if held.kind === 'sculpture' && look}<div class="size">{look.plinth ? `plinth ${look.plinth.w} × ${look.plinth.d} × ${look.plinth.h}` : 'no plinth'}</div>{/if}
    </div>
  </div>
{/if}
