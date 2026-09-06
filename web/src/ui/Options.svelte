<script lang="ts">
  // Options (GAME-UI §6): Esc. Full-screen dim, tabs left, content right. level · looks · file · theme · keys · about.
  import Chips from './Chips.svelte'
  import Row from './Row.svelte'
  import { bus, type Look, type FxKey, type Quality } from '../bus'
  import { ui } from './state.svelte'
  import { PRESET_THEMES, applyTheme, currentTheme, accentColor } from './themes'
  let { version }: { version: string } = $props()
  const tabs = ['play', 'level', 'looks', 'sound', 'file', 'theme', 'keys', 'about']
  const looks: { id: Look; label: string; tip: string }[] = [
    { id: 'clean', label: 'clean', tip: 'the rebuilt level, plain materials' }, { id: 'wire', label: 'wire', tip: 'clean level with its edges drawn' }, { id: 'textured', label: 'textured', tip: "the scan's own surfaces, baked and tiled" },
  ]
  const fxList: { id: FxKey; label: string; tip: string }[] = [
    { id: 'lut', label: 'lut', tip: 'the film grade · neutral until you drop textures/lut.cube' }, { id: 'sky', label: 'sky', tip: 'the sky dome with drifting clouds' },
    { id: 'plants', label: 'plants', tip: 'the yard plants as swaying cards' }, { id: 'glass', label: 'glass', tip: 'fresnel on the street glass' },
    { id: 'surface', label: 'surface', tip: 'slow noise over the tiles' }, { id: 'outline', label: 'outline', tip: 'ink edges' },
    { id: 'dither', label: 'dither', tip: 'ordered dither on the tones' }, { id: 'smaa', label: 'smaa', tip: 'edge anti-aliasing' },
  ]
  const qualities: { id: Quality; label: string; tip: string }[] = [
    { id: 'full', label: 'full', tip: 'full pixel ratio, every look on' }, { id: 'balanced', label: 'balanced', tip: '1.5 pixel ratio' }, { id: 'low', label: 'low', tip: '1 pixel ratio, no smaa' },
  ]
  let theme = $state(currentTheme())
  const themes = Object.keys(PRESET_THEMES).map((n) => ({ id: n, label: n.toLowerCase(), tip: `theme ${n.toLowerCase()}` }))
  const pickTheme = (v: string) => { applyTheme(v); theme = v; bus.emit('accent', { css: accentColor() }) }
  let eye = $state(160)
  $effect(() => { if (ui.room) eye = ui.room.eyeCm })
  let loadI = $state<HTMLInputElement>()
  const count = $derived(ui.art?.layout.items.length ?? 0)
  bus.on('file_ready', (f) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.json], { type: 'application/json' })); a.download = f.name; a.click()
    bus.toast(f.skipped.length ? `saved · ${f.skipped.length} image(s) too big to travel: ${f.skipped.join(', ')}` : `saved ${f.name}`, f.skipped.length ? 'warn' : 'ok')
  })
  const load = async (f: File) => {
    const text = await f.text()
    if (count && !confirm(`replace the draft (${count} works) with ${f.name}? undoable`)) return
    bus.emit('import_file', { text, name: f.name })
  }
  const back = () => bus.emit('menu_close', {})
</script>

<div class="options" role="dialog" aria-label="options">
  <div class="panel">
    <div class="mark">SHDW<b>.world</b></div>
    <div class="body">
      <div class="tabs">
        {#each tabs as t (t)}<button class="tab" class:on={ui.menuTab === t} onclick={() => (ui.menuTab = t)}>{t}</button>{/each}
        <span class="spacer"></span>
        <button class="tab back" onclick={back}>back <small>esc</small></button>
      </div>
      <div class="content">
        {#if ui.menuTab === 'play' && ui.play}
          <Row label="mouse" tip="how far a hand move turns you · raw input, no smoothing"><input type="range" min="0.3" max="3" step="0.05" value={ui.play.sensitivity} oninput={(e) => bus.emit('set_play', { patch: { sensitivity: Number((e.currentTarget as HTMLInputElement).value) } })} /></Row>
          <div class="note">sensitivity {ui.play.sensitivity.toFixed(2)}</div>
          <Row label="field of view" tip="60 narrow · 75 default · 100 wide"><input type="range" min="60" max="100" step="1" value={ui.play.fov} oninput={(e) => bus.emit('set_play', { patch: { fov: Number((e.currentTarget as HTMLInputElement).value) } })} /></Row>
          <div class="note">fov {ui.play.fov}</div>
          <Row label="head bob" tip="the small rise and fall while walking"><input type="checkbox" checked={ui.play.headBob} onchange={(e) => bus.emit('set_play', { patch: { headBob: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
          <Row label="reduce motion" tip="every move lands at once, no pops, no shakes"><input type="checkbox" checked={ui.play.reduceMotion} onchange={(e) => bus.emit('set_play', { patch: { reduceMotion: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
        {:else if ui.menuTab === 'sound' && ui.sound}
          <Row label="mute"><input type="checkbox" checked={ui.sound.muted} onchange={(e) => bus.emit('set_sound', { patch: { muted: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
          <Row label="master"><input type="range" min="0" max="1" step="0.05" value={ui.sound.master} oninput={(e) => bus.emit('set_sound', { patch: { master: Number((e.currentTarget as HTMLInputElement).value) } })} /></Row>
          <Row label="ui"><input type="range" min="0" max="1" step="0.05" value={ui.sound.ui} oninput={(e) => bus.emit('set_sound', { patch: { ui: Number((e.currentTarget as HTMLInputElement).value) } })} /></Row>
          <Row label="world"><input type="range" min="0" max="1" step="0.05" value={ui.sound.world} oninput={(e) => bus.emit('set_sound', { patch: { world: Number((e.currentTarget as HTMLInputElement).value) } })} /></Row>
          <div class="note">the sounds are synthesised placeholders · real ones drop in by name</div>
        {:else if ui.menuTab === 'level'}
          <div class="legend">look</div>
          <Chips options={looks} value={ui.look} onpick={(v) => bus.emit('set_look', { look: v })} />
          <Row label="eye height cm" tip="camera height above the floor · 160 = average eye"><input type="number" min="100" max="220" step="1" bind:value={eye} onchange={() => bus.emit('set_eye', { cm: Number(eye) })} /></Row>
          {#if ui.room}<div class="note">{ui.room.hangWalls} hang walls · {ui.room.stairs} stairs · {ui.room.doors} doors · {ui.room.floors} floors</div>{/if}
          {#if ui.walk}<div class="note">{ui.walk.levelName} · x {ui.walk.x.toFixed(2)} z {ui.walk.z.toFixed(2)}</div>{/if}
        {:else if ui.menuTab === 'looks'}
          {#if ui.fx}
            <div class="fx">
              {#each fxList as f (f.id)}<label class="fxrow" title={f.tip}><input type="checkbox" checked={ui.fx[f.id]} onchange={(e) => bus.emit('set_fx', { key: f.id, on: (e.currentTarget as HTMLInputElement).checked })} />{f.label}</label>{/each}
            </div>
            <div class="legend">quality</div>
            <Chips options={qualities} value={ui.quality} onpick={(q) => bus.emit('set_quality', { quality: q })} />
          {/if}
        {:else if ui.menuTab === 'file'}
          <Row label="name"><input type="text" placeholder="layout name" value={ui.art?.layout.name ?? 'draft'} onchange={(e) => bus.emit('set_name', { name: (e.currentTarget as HTMLInputElement).value })} /></Row>
          <div class="chips">
            <button class="chip" title="download this layout as a .json (send it, drop it back here)" onclick={() => bus.emit('export_file', {})}>save file</button>
            <button class="chip" onclick={() => loadI?.click()}>load file</button>
            <button class="chip" onclick={() => { if (confirm('take every work off the walls? undoable')) bus.emit('clear_draft', {}) }}>clear</button>
          </div>
          <input type="file" accept=".json" hidden bind:this={loadI} onchange={() => { if (loadI?.files?.[0]) void load(loadI.files[0]); if (loadI) loadI.value = '' }} />
          <div class="note">draft autosaved in this browser · {count} works · save file to send it</div>
        {:else if ui.menuTab === 'theme'}
          <Chips options={themes} value={theme} onpick={pickTheme} />
        {:else if ui.menuTab === 'keys'}
          <table class="keys">
            <tbody>
              <tr><td>w a s d</td><td>walk · shift = run</td></tr>
              <tr><td>mouse</td><td>look · click = take the mouse</td></tr>
              <tr><td>1-9 0 · scroll · , .</td><td>pick a work from the bar · again = put it back</td></tr>
              <tr><td>right click · q</td><td>put the held work back · close the touch menu</td></tr>
              <tr><td>click</td><td>hang or place the held work where you look</td></tr>
              <tr><td>e</td><td>touch the work you look at · move, take down, swap, turn · or the door</td></tr>
              <tr><td>tab</td><td>select the next hung work · delete, arrows act on it</td></tr>
              <tr><td>arrows</td><td>nudge 1 cm · shift = 10 cm</td></tr>
              <tr><td>r</td><td>turn a sculpture 15° · shift back</td></tr>
              <tr><td>q · h</td><td>put down · hands view</td></tr>
              <tr><td>ctrl z · ctrl shift z</td><td>undo · redo</td></tr>
              <tr><td>m</td><td>plan of this floor · click on it = go there</td></tr>
              <tr><td>esc</td><td>this menu · closes what is open</td></tr>
              <tr><td>`</td><td>debug panel</td></tr>
            </tbody>
          </table>
        {:else}
          <div class="about">
            <div class="mark big">SHDW<b>.world</b></div>
            <div class="note">hang real art in a real room · {version}</div>
            <div class="note">built on the Messenger pattern by abeto.co</div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
