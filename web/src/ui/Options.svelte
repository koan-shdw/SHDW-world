<script lang="ts">
  // Settings (Esc): controls · file · keys. Nothing else (owner 09-06). Looks and quality live in the debug panel (backtick).
  import Row from './Row.svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  const tabs = ['controls', 'file', 'keys']
  let eye = $state(160)
  $effect(() => { if (ui.room) eye = ui.room.eyeCm })
  let loadI = $state<HTMLInputElement>()
  const count = $derived(ui.art?.layout.items.length ?? 0)
  bus.on('file_ready', (f) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.json], { type: 'application/json' })); a.download = f.name; a.click()
    if (f.skipped.length) bus.toast(`${f.skipped.length} image(s) too big to travel: ${f.skipped.join(', ')}`, 'warn')
  })
  const load = async (f: File) => {
    const text = await f.text()
    if (count && !confirm(`replace the draft (${count} works) with ${f.name}?`)) return
    bus.emit('import_file', { text, name: f.name })
  }
  const back = () => bus.emit('menu_close', {})
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
</script>

<div class="options" role="dialog" aria-label="settings">
  <div class="panel">
    <div class="mark">SHDW<b>.world</b></div>
    <div class="body">
      <div class="tabs">
        {#each tabs as t (t)}<button class="tab" class:on={ui.menuTab === t} onclick={() => (ui.menuTab = t)}>{t}</button>{/each}
        <span class="spacer"></span>
        <button class="tab back" onclick={back}>back <small>esc</small></button>
      </div>
      <div class="content">
        {#if ui.menuTab === 'controls' && ui.play}
          <Row label="mouse"><input type="range" min="0.3" max="3" step="0.05" value={ui.play.sensitivity} oninput={(e) => bus.emit('set_play', { patch: { sensitivity: num(e) } })} /></Row>
          <Row label="field of view"><input type="range" min="60" max="100" step="1" value={ui.play.fov} oninput={(e) => bus.emit('set_play', { patch: { fov: num(e) } })} /></Row>
          <Row label="eye height cm"><input type="number" min="100" max="220" step="1" bind:value={eye} onchange={() => bus.emit('set_eye', { cm: Number(eye) })} /></Row>
          <Row label="head bob"><input type="checkbox" checked={ui.play.headBob} onchange={(e) => bus.emit('set_play', { patch: { headBob: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
          <Row label="reduce motion"><input type="checkbox" checked={ui.play.reduceMotion} onchange={(e) => bus.emit('set_play', { patch: { reduceMotion: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
        {:else if ui.menuTab === 'file'}
          <Row label="name"><input type="text" placeholder="layout name" value={ui.art?.layout.name ?? ''} onchange={(e) => bus.emit('set_name', { name: (e.currentTarget as HTMLInputElement).value })} /></Row>
          <div class="chips">
            <button class="chip" onclick={() => bus.emit('export_file', {})}>save file</button>
            <button class="chip" onclick={() => loadI?.click()}>load file</button>
            <button class="chip" onclick={() => { if (confirm('take every work off the walls?')) bus.emit('clear_draft', {}) }}>clear</button>
          </div>
          <input type="file" accept=".json" hidden bind:this={loadI} onchange={() => { if (loadI?.files?.[0]) void load(loadI.files[0]); if (loadI) loadI.value = '' }} />
          <div class="note">{count} works · saved in this browser</div>
        {:else}
          <table class="keys">
            <tbody>
              <tr><td>w a s d</td><td>walk · shift run</td></tr>
              <tr><td>mouse</td><td>look</td></tr>
              <tr><td>1-9 0 · [ ]</td><td>pick a work · again puts it back</td></tr>
              <tr><td>click</td><td>hang · place · open the ring on a work</td></tr>
              <tr><td>e</td><td>touch a work · a door</td></tr>
              <tr><td>right click · q</td><td>put back · close</td></tr>
              <tr><td>wheel · up down</td><td>holding: the height · shift 10</td></tr>
              <tr><td>left right · g</td><td>holding: the snap line · the gap</td></tr>
              <tr><td>r</td><td>turn a sculpture · shift back</td></tr>
              <tr><td>arrows</td><td>on a work: nudge 1 cm · shift 10</td></tr>
              <tr><td>tab · delete</td><td>next hung work · take it down</td></tr>
              <tr><td>ctrl z</td><td>undo · shift redo</td></tr>
              <tr><td>m · esc</td><td>map · settings</td></tr>
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  </div>
</div>
