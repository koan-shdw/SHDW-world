<script lang="ts">
  import { onMount } from 'svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  const active = $derived(!ui.menuShown && !ui.mapShown && !ui.noteField && !ui.touch && !ui.slotRing)
  let moveId: number | null = null, lookId: number | null = null
  let last = { x: 0, y: 0 }
  let stick = $state({ x: 0, y: 0 })
  const stop = () => { moveId = null; lookId = null; stick = { x: 0, y: 0 }; bus.emit('touch_move', { x: 0, y: 0 }) }
  $effect(() => { const on = active; if (!on) stop(); bus.emit('touch_session', { active: on }); return () => { stop(); bus.emit('touch_session', { active: false }) } })
  onMount(() => { const hidden = () => { if (document.hidden) stop() }; window.addEventListener('blur', stop); document.addEventListener('visibilitychange', hidden); return () => { stop(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hidden) } })
  const move = (e: PointerEvent) => {
    if (e.pointerId !== moveId) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2
    const scale = Math.max(1, Math.hypot(x, y) / 40)
    stick = { x: x / scale, y: y / scale }; bus.emit('touch_move', { x: stick.x / 40, y: stick.y / 40 })
  }
  const startMove = (e: PointerEvent) => {
    if (moveId !== null || !active) return
    e.preventDefault(); moveId = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    bus.emit('touch_session', { active: true }); move(e)
  }
  const endMove = (e: PointerEvent) => { if (e.pointerId === moveId) { moveId = null; stick = { x: 0, y: 0 }; bus.emit('touch_move', { x: 0, y: 0 }) } }
  const startLook = (e: PointerEvent) => {
    if (lookId !== null || !active) return
    e.preventDefault(); lookId = e.pointerId; last = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    bus.emit('touch_session', { active: true })
  }
  const look = (e: PointerEvent) => { if (e.pointerId !== lookId) return; bus.emit('touch_look', { dx: e.clientX - last.x, dy: e.clientY - last.y }); last = { x: e.clientX, y: e.clientY } }
  const endLook = (e: PointerEvent) => { if (e.pointerId === lookId) lookId = null }
</script>

{#if active}
  <div class="touch-controls" class:editor={ui.door.open}>
    <button class="touch-walk" aria-label="drag to walk" onpointerdown={startMove} onpointermove={move} onpointerup={endMove} onpointercancel={endMove} onlostpointercapture={endMove}>
      <span class="touch-directions" aria-hidden="true">↑<br />← · →<br />↓</span><i style="transform:translate({stick.x}px,{stick.y}px)"></i><span class="touch-label">walk</span>
    </button>
    <button class="touch-look" aria-label="drag to look" onpointerdown={startLook} onpointermove={look} onpointerup={endLook} onpointercancel={endLook} onlostpointercapture={endLook}><span>drag to look</span></button>
    <div class="touch-buttons">
      {#if ui.hud.doorTip && ui.hud.doorTip !== 'locked'}<button onclick={() => bus.emit('touch_verb', { verb: 'touch' })}>{ui.hud.doorTip} door</button>{/if}
      {#if ui.door.open}
        <button onclick={() => bus.emit('touch_verb', { verb: 'do' })}>{ui.art?.held ? 'place work' : 'touch work'}</button>
        {#if ui.art?.held}<button onclick={() => bus.emit('touch_verb', { verb: 'putback' })}>put back</button>{/if}
      {/if}
      <button onclick={() => bus.emit('touch_verb', { verb: 'map' })}>map</button>
    </div>
  </div>
{:else if ui.mapShown}
  <button class="touch-map-close" onclick={() => bus.emit('touch_verb', { verb: 'back' })}>back to exhibition</button>
{/if}
