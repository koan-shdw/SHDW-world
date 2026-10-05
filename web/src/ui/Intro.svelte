<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  let { base }: { base: string } = $props()
  let pick = $state<'YOZO' | 'KOAN' | null>(null)
  let word = $state(''), waiting = $state(false)
  let field = $state<HTMLInputElement>()
  onMount(() => { bus.emit('door_leave', {}); return bus.on('door_result', () => { waiting = false }) })
  const choose = async (p: 'YOZO' | 'KOAN') => { pick = p; word = ''; ui.doorError = ''; await tick(); field?.focus() }
  const go = () => { if (!pick || !word || waiting) return; bus.emit('audio_unlock', {}); waiting = true; bus.emit('door_check', { key: word, who: pick }) }
  const enter = () => { bus.emit('audio_unlock', {}); bus.emit('door_leave', {}); ui.chosen = true }
  const sound = () => { bus.emit('audio_unlock', {}); bus.emit('set_play', { patch: { wind: !ui.play?.wind } }) }
  $effect(() => { if (ui.door.open && pick) ui.chosen = true })
  $effect(() => { if (ui.chosen) bus.emit('exhibition_enter', {}) })
</script>

{#if !ui.chosen && ui.room}
  <section class="exhibition-intro" aria-label="CULT exhibition">
    <header><span class="world">SHDW.world</span><button class="sound-toggle" onclick={sound} aria-label={ui.play?.wind ? 'Mute wind' : 'Enable wind'} aria-pressed={ui.play?.wind ?? true}><span class:audible={ui.play?.wind} class="sound-dot"></span>Sound {ui.play?.wind ? 'on' : 'off'}</button></header>
    <div class="invitation">
      <p class="eyebrow">SHDW.gallery presents</p>
      <h1><img src="{base}brand/logo.png" alt="CULT 2026" /></h1>
      <p class="artist">An exhibition by <strong>YOZO</strong></p>
      <p class="description">Explore the gallery at your own pace.</p>
      <button class="enter-exhibition" onclick={enter}>Enter exhibition <span aria-hidden="true">↗</span></button>
      <p class="access-note">Public access · No sign-in required</p>
      <details class="artist-access">
        <summary>Artist access</summary>
        <div class="access-picks">
          {#each ['YOZO', 'KOAN'] as name}<button class:chosen={pick === name} aria-pressed={pick === name} onclick={() => choose(name as 'YOZO' | 'KOAN')}>{name}</button>{/each}
        </div>
        {#if pick}
          <form onsubmit={(event) => { event.preventDefault(); go() }}>
            <label for="access-word">Access word for {pick}</label>
            <div class="access-entry"><input id="access-word" bind:this={field} bind:value={word} type="password" autocomplete="current-password" aria-invalid={!!ui.doorError} aria-describedby={ui.doorError ? 'access-error' : undefined} required /><button type="submit" disabled={waiting || !word}>{waiting ? 'Checking…' : 'Enter'}</button></div>
            {#if ui.doorError}<p id="access-error" class="access-error" role="alert">{ui.doorError}</p>{/if}
          </form>
        {/if}
      </details>
    </div>
    <footer><div class="visit-note">A world to walk through.<span>Headphones recommended</span></div><div class="intro-controls"><div><span>01 / Move</span><strong>{ui.play?.touchControls ? 'Left pad' : 'W A S D'}</strong></div><div><span>02 / Look</span><strong>{ui.play?.touchControls ? 'Drag' : 'Mouse'}</strong></div><div><span>03 / Doors</span><strong>{ui.play?.touchControls ? 'Tap' : 'Click'}</strong></div></div></footer>
  </section>
{/if}

<style>
  .exhibition-intro { position:absolute; inset:0; z-index:60; overflow:auto; display:grid; grid-template-rows:auto 1fr auto; gap:26px; padding:32px clamp(24px,5vw,80px); color:#ecebe6; text-transform:none; font-family:Arial,Helvetica,sans-serif; font-weight:400; background:linear-gradient(90deg,rgba(5,8,12,.97) 0%,rgba(5,8,12,.87) 38%,rgba(5,8,12,.23) 77%,rgba(5,8,12,.17)),linear-gradient(0deg,rgba(5,8,12,.8),transparent 32%); animation:fadein .7s ease-out; }
  header, footer { display:flex; justify-content:space-between; align-items:center; gap:28px; }
  header { border-bottom:1px solid #ffffff22; padding-bottom:22px; }
  .world,.eyebrow,.access-note,.intro-controls span,.visit-note span,.sound-toggle { font-family:var(--mono); font-size:11px; letter-spacing:1.2px; }
  .world { font-size:13px; letter-spacing:2px; }
  .exhibition-intro button { text-transform:none; font-family:inherit; font-weight:500; border-radius:2px; box-shadow:none; }
  .sound-toggle { display:flex; align-items:center; gap:10px; padding:9px 0 9px 14px; background:transparent; border:0; color:#d1d3d4; font-size:12px; }
  .sound-dot { width:6px; height:6px; border:1px solid #8a949c; border-radius:50%; }
  .sound-dot.audible { background:#b2c7cb; border-color:#b2c7cb; box-shadow:0 0 14px #a9d7ea60; }
  .invitation { align-self:center; width:min(100%,510px); padding:10px 0; }
  .eyebrow { margin:0 0 20px; text-transform:uppercase; color:#aeb6ba; letter-spacing:2.4px; }
  h1 { margin:0; line-height:0; }
  h1 img { display:block; width:min(100%,42vh,360px); height:auto; filter:invert(1); }
  .artist { margin:20px 0 8px; font-size:18px; letter-spacing:.3px; }
  .artist strong { font-weight:600; letter-spacing:1.8px; margin-left:5px; }
  .description { margin:0 0 22px; color:#a4aeb7; font-size:14px; line-height:1.6; }
  .enter-exhibition { display:flex; align-items:center; justify-content:space-between; gap:40px; width:min(100%,350px); padding:18px 22px; color:#11171b; background:#e6e7e0; border:1px solid #e6e7e0; font-size:16px; }
  .enter-exhibition span { font-size:25px; line-height:1; }
  .enter-exhibition:hover { background:#fff; border-color:#fff; transform:translateY(-2px); }
  .access-note { margin:10px 0 15px; color:#8d98a2; font-size:10px; letter-spacing:.2px; }
  .artist-access { width:min(100%,350px); font-size:12px; color:#a4aeb7; }
  summary { cursor:pointer; width:fit-content; padding:6px 0; }
  summary:focus-visible { outline:2px solid var(--accent); outline-offset:5px; }
  .access-picks { display:flex; gap:9px; margin:12px 0 15px; }
  .access-picks button { min-width:84px; padding:10px 16px; letter-spacing:1.6px; background:#ffffff06; border:1px solid #ffffff28; color:#a4aeb7; }
  .access-picks button.chosen { background:#dce5e815; border-color:#c4d7df; color:#edf2f4; }
  form label { display:block; margin-bottom:8px; }
  .access-entry { display:flex; gap:8px; }
  .access-entry input { width:100%; min-width:0; border:1px solid #ffffff35; border-radius:2px; padding:11px 12px; color:#fff; background:#0c1015; }
  .access-entry button { padding:10px 16px; color:#131a1e; background:#d6dedf; white-space:nowrap; }
  .access-error { color:#ee9c98; margin:10px 0 0; }
  footer { border-top:1px solid #ffffff22; padding-top:22px; }
  .visit-note { font-size:13px; color:#c2c8cc; }
  .visit-note span { display:block; color:#82919c; margin-top:7px; letter-spacing:.2px; font-size:10px; }
  .intro-controls { display:flex; gap:42px; }
  .intro-controls span { display:block; margin-bottom:8px; font-size:10px; color:#8d9ba6; letter-spacing:.4px; }
  .intro-controls strong { font-weight:400; font-size:13px; letter-spacing:1px; }
  @media(max-width:620px) { .exhibition-intro { padding:22px; gap:18px; background:linear-gradient(90deg,#05080cf5,#05080cc2),linear-gradient(0deg,#05080c,transparent); } header { padding-bottom:16px; } .invitation { padding:8px 0; } h1 img { width:min(78vw,310px); } .eyebrow { margin-bottom:22px; font-size:10px; } .artist { margin-top:22px; font-size:16px; } .description { margin-bottom:22px; font-size:13px; } footer { align-items:start; flex-direction:column; gap:20px; } .intro-controls { width:100%; justify-content:space-between; gap:15px; } }
  @media(max-height:650px) and (min-width:621px) { .exhibition-intro { padding-top:20px; padding-bottom:20px; gap:14px; } .invitation { padding:4px 0; } h1 img { width:250px; } .eyebrow { margin-bottom:14px; } .artist { margin-top:16px; } .description { margin-bottom:16px; } }
  @media(prefers-reduced-motion:reduce) { .exhibition-intro { animation:none; } .enter-exhibition:hover { transform:none; } }
</style>
