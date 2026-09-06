<script lang="ts">
  // The wall widget (GAME.md §5, owner 09-06): the mouse is taken while you hold, so this is a readout of keys and wheel.
  // wheel / up down = height (shift 10) · left right = snap line · g = gap. The value a key just changed lights.
  import { ui } from './state.svelte'
  const g = $derived(ui.art?.layout.guides ?? null)
  const at = $derived(ui.anchors['hang-widget'])
  const height = $derived(g && g.snap !== 'free' ? g[g.snap] : null)
</script>

{#if g && at?.visible && ui.hud.cross}
  <div class="widget" style="left:{Math.min(at.x + 28, window.innerWidth - 250)}px; top:{Math.max(48, Math.min(window.innerHeight - 180, at.y - 60))}px">
    <div class="wrow" class:lit={ui.widgetFlash === 'snap'}><span class="k">← →</span><span class="v">{g.snap}</span></div>
    <div class="wrow" class:lit={ui.widgetFlash === 'height'}><span class="k">wheel ↑ ↓</span><span class="v num">{height === null ? 'free' : `${height} cm`}</span></div>
    <div class="wrow" class:lit={ui.widgetFlash === 'gap'}><span class="k">g</span><span class="v num">gap {g.gap} cm</span></div>
  </div>
{/if}
