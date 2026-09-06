<script lang="ts">
  // The wall widget (GAME-UI §5): only while holding a painting and a wall is under the crosshair; rides beside the ghost.
  import Chips from './Chips.svelte'
  import Row from './Row.svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  import type { SnapLine, Guides } from '../world/art/art'
  const snaps: { id: SnapLine; label: string; tip: string }[] = [
    { id: 'top', label: 'top', tip: 'the top edge sits on the line' }, { id: 'centre', label: 'centre', tip: 'the centre sits on the line' },
    { id: 'bottom', label: 'bottom', tip: 'the bottom edge sits on the line' }, { id: 'free', label: 'free', tip: 'hang it where the crosshair is' },
  ]
  const g = $derived(ui.art?.layout.guides ?? null)
  const at = $derived(ui.anchors['hang-widget'])
  const height = $derived(g && g.snap !== 'free' ? g[g.snap] : 0)
  const setHeight = (v: number) => { if (!g || g.snap === 'free') return; const patch: Partial<Guides> = {}; patch[g.snap] = v; bus.emit('set_guides', { patch }) }
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
</script>

{#if g && at?.visible && ui.hud.cross}
  <div class="widget" style="left:{Math.min(at.x + 28, window.innerWidth - 240)}px; top:{Math.max(48, Math.min(window.innerHeight - 220, at.y - 60))}px">
    <div class="legend">snap line</div>
    <Chips options={snaps} value={g.snap} onpick={(v) => bus.emit('set_guides', { patch: { snap: v } })} />
    <Row label="height cm" tip="the line, in cm above this floor"><input type="number" min="0" max="400" step="1" value={height} disabled={g.snap === 'free'} onchange={(e) => setHeight(num(e))} /></Row>
    <input type="range" min="0" max="400" step="1" value={height} disabled={g.snap === 'free'} oninput={(e) => setHeight(num(e))} />
    <Row label="gap cm" tip="edge-to-edge snap distance between neighbours"><input type="number" min="0" max="200" step="1" value={g.gap} onchange={(e) => bus.emit('set_guides', { patch: { gap: num(e) } })} /></Row>
    <Row label="show guide"><input type="checkbox" checked={g.show} onchange={(e) => bus.emit('set_guides', { patch: { show: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
  </div>
{/if}
