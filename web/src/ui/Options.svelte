<script lang="ts">
  // Settings (the button top right; esc backs out): controls · file · keys. Nothing else (owner 09-06). Looks and quality live in the debug panel (backtick).
  import Row from './Row.svelte'
  import AddPanel from './AddPanel.svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  let { base }: { base: string } = $props()
  const tabs = $derived(ui.door.open ? ['controls', 'art', 'file', 'keys', 'the door'] : ['controls', 'the door'])   // SHOW.md §2-3, §5
  let add = $state<AddPanel>()
  const thumbOf = (a: NonNullable<typeof ui.art>['library'][number]) => a.kind === 'sculpture' ? a.thumb ?? '' : a.thumb ?? a.data ?? `${base}data/art/${a.file}`
  const mine = (a: NonNullable<typeof ui.art>['library'][number]) => !!(a.store || a.data?.startsWith('data:') || a.model?.startsWith('data:'))
  const onlyHere = $derived((ui.art?.library ?? []).filter((a) => !a.store && mine(a)))
  const pushAll = () => { for (const a of onlyHere) bus.emit('push_local', { id: a.id }) }
  const removeArt = (a: NonNullable<typeof ui.art>['library'][number]) => { if (confirm(`remove ${a.title} from the library, for everyone?`)) bus.emit('remove_local', { id: a.id }) }
  $effect(() => { if (!tabs.includes(ui.menuTab)) ui.menuTab = 'controls' })
  let word = $state(''), who = $state<'SHDW' | 'YOZO' | null>(null), shake = $state(false)
  const enter = () => { if (!word || !who) return; bus.emit('door_check', { key: word, who }) }
  $effect(() => { if (ui.doorError) { shake = true; setTimeout(() => (shake = false), 400) } })
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
  let token = $state('')
  try { token = localStorage.getItem('shdw-world-token') ?? '' } catch { /* private */ }
  const saveRepo = () => { try { localStorage.setItem('shdw-world-token', token) } catch { /* private */ } bus.emit('repo_save', { name: ui.art?.layout.name ?? 'layout', token }) }
  const copy = (s: string) => { void navigator.clipboard?.writeText(s) }
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value)
</script>

<div class="options" role="dialog" aria-label="settings">
  <div class="panel">
    <div class="head"><img class="logo" src="{base}brand/logo.png" alt="CULT 2026" /><span class="show">CULT by YOZO · presented by SHDW.gallery</span></div>
    <div class="body">
      <div class="tabs">
        {#each tabs as t (t)}<button class="tab" class:on={ui.menuTab === t} onclick={() => (ui.menuTab = t)}>{t}</button>{/each}
        <span class="spacer"></span>
        <button class="tab back" onclick={back}>back</button>
      </div>
      <div class="content">
        {#if ui.menuTab === 'controls' && ui.play}
          <Row label="mouse"><input type="range" min="0.3" max="3" step="0.05" value={ui.play.sensitivity} oninput={(e) => bus.emit('set_play', { patch: { sensitivity: num(e) } })} /></Row>
          <Row label="view"><input type="range" min="60" max="100" step="1" value={ui.play.fov} oninput={(e) => bus.emit('set_play', { patch: { fov: num(e) } })} /></Row>
          <Row label="eye height cm"><input type="number" min="100" max="220" step="1" bind:value={eye} onchange={() => bus.emit('set_eye', { cm: Number(eye) })} /></Row>
          <Row label="head bob"><input type="checkbox" checked={ui.play.headBob} onchange={(e) => bus.emit('set_play', { patch: { headBob: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
          <Row label="reduce motion"><input type="checkbox" checked={ui.play.reduceMotion} onchange={(e) => bus.emit('set_play', { patch: { reduceMotion: (e.currentTarget as HTMLInputElement).checked } })} /></Row>
        {:else if ui.menuTab === 'art'}
          <div class="chips"><button class="chip" onclick={() => add?.open()}>choose files</button><span class="note">or drop images or .glb anywhere · title, h w d in cm, enter · it goes to the store, for everyone</span></div>
          <AddPanel bind:this={add} />
          <div class="legend">the library · {ui.art?.library.length ?? 0} works</div>
          {#if onlyHere.length}<div class="chips"><span class="note">{onlyHere.length} work{onlyHere.length > 1 ? 's' : ''} only in this browser · YOZO cannot see {onlyHere.length > 1 ? 'them' : 'it'} yet</span><button class="chip" onclick={pushAll}>all to the store</button></div>{/if}
          <div class="artlist">
            {#each ui.art?.library ?? [] as a (a.id)}
              <div class="artrow">
                {#if thumbOf(a)}<img class="thumb" src={thumbOf(a)} alt={a.title} />{:else}<div class="thumb model">…</div>{/if}
                <div class="who"><b>{a.title}</b><span class="num">{a.h} × {a.w} × {a.d} cm</span>{#if ui.art?.placed[a.id]}<span class="tag">{a.kind === 'sculpture' ? 'placed' : 'on wall'}</span>{/if}{#if !mine(a)}<span class="tag">built in</span>{/if}{#if !a.store && mine(a)}<span class="tag">this browser only</span>{/if}</div>
                {#if !a.store && mine(a)}<button class="chip" onclick={() => bus.emit('push_local', { id: a.id })}>to the store</button>{/if}
                <button class="chip" disabled={!mine(a) || !!ui.art?.placed[a.id]} onclick={() => removeArt(a)}>remove</button>
              </div>
            {/each}
          </div>
        {:else if ui.menuTab === 'file'}
          <Row label="name"><input type="text" placeholder="layout name" value={ui.art?.layout.name ?? ''} onchange={(e) => bus.emit('set_name', { name: (e.currentTarget as HTMLInputElement).value })} /></Row>
          <div class="chips">
            <button class="chip" onclick={() => bus.emit('export_file', {})}>save file</button>
            <button class="chip" onclick={() => loadI?.click()}>load file</button>
            <button class="chip" onclick={() => { if (confirm('take every work off the walls?')) bus.emit('clear_draft', {}) }}>clear</button>
          </div>
          <input type="file" accept=".json" hidden bind:this={loadI} onchange={() => { if (loadI?.files?.[0]) void load(loadI.files[0]); if (loadI) loadI.value = '' }} />
          <div class="note">{count} works · saved in this browser</div>
          <div class="legend">the repo</div>
          <Row label="github token"><input type="password" placeholder="ghp_…" bind:value={token} /></Row>
          <div class="chips"><button class="chip" onclick={saveRepo} disabled={!token}>save to repo</button>{#if ui.repo.url}<button class="chip" onclick={() => copy(ui.repo.url)}>copy share link</button>{/if}</div>
          {#if ui.repo.url}<div class="note num">{ui.repo.url}</div>{/if}
          {#if ui.repo.error}<div class="note" style="color: var(--bad)">{ui.repo.error}</div>{/if}
          <div class="note">a layout in the repo opens at ?layout=name · Yozo saves a file, you drop it here, save to repo, send the link</div>
        {:else if ui.menuTab === 'the door'}
          {#if ui.door.open}
            <div class="note">you are in as <b>{ui.door.who}</b> · every change saves itself · the public sees the show, not the tools</div>
            <div class="chips"><button class="chip" onclick={() => bus.emit('door_leave', {})}>leave</button></div>
          {:else}
            <Row label="the word"><input type="password" class:shake placeholder="the shared word" bind:value={word} onkeydown={(e) => { if (e.key === 'Enter') enter() }} /></Row>
            <div class="chips">
              <button class="chip who shdw" class:on={who === 'SHDW'} onclick={() => (who = 'SHDW')}>SHDW</button>
              <button class="chip who yozo" class:on={who === 'YOZO'} onclick={() => (who = 'YOZO')}>YOZO</button>
              <span class="spacer"></span>
              <button class="chip" disabled={!word || !who} onclick={enter}>enter</button>
            </div>
            {#if ui.doorError}<div class="note" style="color: var(--bad)">{ui.doorError}</div>{/if}
            <div class="note">the door is for SHDW and YOZO · it stays open on this machine</div>
          {/if}
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
              <tr><td>m</td><td>map</td></tr>
              <tr><td>esc</td><td>back · frees the mouse, click puts you back</td></tr>
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  </div>
</div>
