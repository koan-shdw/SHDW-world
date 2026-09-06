<script lang="ts">
  // Debug panel (backtick): looks, quality, room look, fps. Never part of the shipped screen.
  import { onMount } from 'svelte'
  import { Pane } from 'tweakpane'
  import { bus, type FxKey, type Look, type Quality } from '../bus'
  import { ui } from './state.svelte'
  let host: HTMLElement
  onMount(() => {
    const pane = new Pane({ container: host, title: 'SHDW.world · debug' })
    const k = (window as unknown as { koanHang?: Record<string, unknown> }).koanHang
    const fx = { ...(ui.fx ?? { lut: true, sky: true, plants: true, glass: true, surface: true, outline: true, dither: true, smaa: true }) }
    const params = { quality: ui.quality, look: ui.look, exposure: 1.0, fps: 0, walk: '', works: 0 }
    pane.addBinding(params, 'quality', { options: { full: 'full', balanced: 'balanced', low: 'low' } }).on('change', (ev) => bus.emit('set_quality', { quality: ev.value as Quality }))
    pane.addBinding(params, 'look', { options: { clean: 'clean', wire: 'wire', textured: 'textured' } }).on('change', (ev) => bus.emit('set_look', { look: ev.value as Look }))
    const looks = pane.addFolder({ title: 'looks' })
    for (const key of Object.keys(fx) as FxKey[]) looks.addBinding(fx, key).on('change', (ev) => bus.emit('set_fx', { key, on: !!ev.value }))
    pane.addBinding(params, 'exposure', { min: 0.2, max: 2.5 }).on('change', (ev) => { const r = k?.renderer as { toneMappingExposure: number } | undefined; if (r) r.toneMappingExposure = ev.value })
    pane.addBinding(params, 'fps', { readonly: true, view: 'graph', min: 0, max: 144 })
    pane.addBinding(params, 'walk', { readonly: true })
    pane.addBinding(params, 'works', { readonly: true })
    let frames = 0, t0 = performance.now(), raf = 0
    const tick = () => {
      frames++; const now = performance.now()
      if (now - t0 >= 500) { params.fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now }
      params.walk = ui.walk ? `${ui.walk.levelName} ${ui.walk.x.toFixed(2)} ${ui.walk.z.toFixed(2)}` : ''
      params.works = ui.art?.layout.items.length ?? 0
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); pane.dispose() }
  })
</script>

<div class="debug" bind:this={host}></div>
