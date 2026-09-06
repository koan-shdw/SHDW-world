<script lang="ts">
  // The look panel: a sculpture's colour, texture, tile and plinth. Opens from the ring's `look` slice, beside the ring.
  import Chips from './Chips.svelte'
  import Row from './Row.svelte'
  import Icon from './Icon.svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  import type { SculptLook } from '../world/art/art'
  const textures = ['none', 'concrete', 'plaster', 'plywood', 'steel', 'corten', 'slate', 'checker'].map((n) => ({ id: n, label: n, tip: n === 'none' ? 'the tint alone' : `the ${n} tile` }))
  const t = $derived(ui.touch)
  const at = $derived(ui.anchors['touch'])
  const look = $derived(ui.art?.focus && ui.art.focus.placed === t?.placed ? ui.art.focus.look : null)
  const sculpt = (patch: Partial<SculptLook>) => bus.emit('set_sculpt', { patch })
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
  const plinthPatch = (k: 'w' | 'd' | 'h', v: number) => { if (!look?.plinth) return; sculpt({ plinth: { ...look.plinth, [k]: v } }) }
  $effect(() => { if (!t) ui.lookOpen = false })
</script>

{#if t && at?.visible && ui.lookOpen && look}
  <div class="lookpanel" style="left:{Math.min(at.x + 130, window.innerWidth - 270)}px; top:{Math.max(48, at.y - 120)}px">
    <div class="head"><span class="title">{t.title}</span><button class="chip icon" title="close" onclick={() => (ui.lookOpen = false)}><Icon name="cross" size={16} /></button></div>
    <Row label="colour"><input type="color" value={look.colour} oninput={(e) => sculpt({ colour: (e.currentTarget as HTMLInputElement).value })} /></Row>
    <div class="legend">texture</div>
    <Chips options={textures} value={look.texture?.name ?? 'none'} onpick={(n) => sculpt({ texture: n === 'none' ? null : { name: n, cm: look.texture?.cm ?? 60 } })} />
    {#if look.texture}<Row label="tile cm"><input type="number" min="5" max="400" value={look.texture.cm} onchange={(e) => sculpt({ texture: { name: look.texture!.name, cm: num(e) } })} /></Row>{/if}
    <Row label="plinth"><input type="checkbox" checked={!!look.plinth} onchange={(e) => sculpt({ plinth: (e.currentTarget as HTMLInputElement).checked ? { w: 40, d: 40, h: 100, colour: '#f4f4f0' } : null })} /></Row>
    {#if look.plinth}
      <div class="row plinth">
        <label for="tpw">w</label><input id="tpw" type="number" min="5" max="400" value={look.plinth.w} onchange={(e) => plinthPatch('w', num(e))} />
        <label for="tpd">d</label><input id="tpd" type="number" min="5" max="400" value={look.plinth.d} onchange={(e) => plinthPatch('d', num(e))} />
        <label for="tph">h</label><input id="tph" type="number" min="1" max="300" value={look.plinth.h} onchange={(e) => plinthPatch('h', num(e))} />
      </div>
      <Row label="plinth colour"><input type="color" value={look.plinth.colour} oninput={(e) => sculpt({ plinth: { ...look.plinth!, colour: (e.currentTarget as HTMLInputElement).value } })} /></Row>
    {/if}
  </div>
{/if}
