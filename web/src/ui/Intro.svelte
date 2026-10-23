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
  const enter = () => { if (!ui.room) return; bus.emit('audio_unlock', {}); bus.emit('door_leave', {}); ui.chosen = true }
  const sound = () => { bus.emit('audio_unlock', {}); bus.emit('set_play', { patch: { wind: !ui.play?.wind } }) }
  $effect(() => { if (ui.door.open && pick) ui.chosen = true })
  $effect(() => { if (ui.chosen) bus.emit('exhibition_enter', {}) })
</script>

{#if !ui.chosen && !ui.failed}
  <section class="exhibition-intro" aria-label="CULT exhibition">
    <div class="poster">
      <h1><img src="{base}brand/yozo-cult-title.svg" alt="YOZO “CULT”" /></h1>
      <div class="event">
        <img class="shdw" src="{base}brand/shdw-mark.svg" alt="SHDW.gallery" />
        <div class="event-info"><p class="venue">SO1 HARAJUKU</p><p class="dates"><span>11-11</span><span>15-11</span></p></div>
      </div>
      <div class="entry">
        <button class="enter-exhibition" onclick={enter} disabled={!ui.room}><span>{ui.room ? 'Enter exhibition' : 'Loading…'}</span><span class="arrow" aria-hidden="true">↗</span></button>
        <div class="tools">
          {#if ui.room}
            <details class="artist-access">
              <summary>Artist access</summary>
              <div class="access-panel">
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
              </div>
            </details>
          {/if}
          <button class="sound-toggle" onclick={sound} disabled={!ui.play} aria-label={ui.play?.wind ? 'Mute sound' : 'Enable sound'} aria-pressed={ui.play?.wind ?? true}><span class:audible={ui.play?.wind} class="sound-dot"></span>Sound {ui.play?.wind ? 'on' : 'off'}</button>
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  .exhibition-intro { position:absolute; inset:0; z-index:60; overflow:auto; background:linear-gradient(90deg,#06070ae3,#06070a99 46%,#06070a1f 82%); color:#fff; font-family:Arial,Helvetica,sans-serif; font-weight:400; text-transform:none; }
  .poster { position:relative; display:flex; flex-direction:column; width:46%; min-width:360px; max-width:680px; min-height:100%; padding:clamp(28px,4vw,72px); }
  h1 { margin:clamp(24px,7vh,90px) 0 auto; line-height:0; }
  h1 img { display:block; width:100%; height:auto; filter:invert(1); }
  .event { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; margin-top:64px; margin-bottom:38px; }
  .shdw { width:52px; height:52px; flex:none; background:#fff; filter:invert(1); }
  .event-info { text-align:right; }
  .venue { margin:0 0 10px; font-size:clamp(13px,1.55vw,25px); letter-spacing:.06em; line-height:1; white-space:nowrap; }
  .dates { display:flex; justify-content:flex-end; gap:.22em; margin:0; font-weight:700; font-size:clamp(28px,3.6vw,65px); line-height:1; letter-spacing:-.045em; white-space:nowrap; }
  .exhibition-intro button { font-family:inherit; text-transform:none; border-radius:0; box-shadow:none; transform:none; }
  .enter-exhibition { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:70px; padding:18px 22px; border:1px solid #fff; background:#fff; color:#101010; font-size:16px; font-weight:700; }
  .enter-exhibition:hover { background:#dedede; border-color:#dedede; }
  .enter-exhibition:disabled { opacity:1; background:#eee; border-color:#eee; color:#777; }
  .arrow { font-size:31px; font-weight:400; line-height:1; }
  .tools { display:flex; justify-content:space-between; align-items:center; gap:20px; min-height:52px; padding-top:10px; font-size:12px; }
  .artist-access { position:relative; }
  summary { cursor:pointer; list-style:none; padding:12px 0; }
  summary::-webkit-details-marker { display:none; }
  summary:hover { text-decoration:underline; text-underline-offset:4px; }
  button:focus-visible, summary:focus-visible { outline:2px solid #fff; outline-offset:5px; }
  .access-panel button:focus-visible { outline-color:#101010; }
  .sound-toggle { display:flex; align-items:center; gap:8px; padding:12px 0; min-height:40px; margin-left:auto; background:transparent; border:0; color:inherit; font-size:12px; font-weight:400; }
  .sound-toggle:hover { background:transparent; text-decoration:underline; text-underline-offset:4px; }
  .sound-dot { width:6px; height:6px; border:1px solid currentColor; border-radius:50%; }
  .sound-dot.audible { background:currentColor; }
  .access-panel { position:absolute; bottom:calc(100% + 14px); left:0; z-index:1; width:min(340px,calc(100vw - 48px)); padding:22px; color:#101010; background:#fff; border:1px solid #101010; box-shadow:0 12px 40px #0002; }
  .access-picks { display:flex; gap:8px; }
  .access-picks button { flex:1; min-height:44px; padding:10px; background:#fff; border:1px solid #bbb; color:#101010; font-size:14px; }
  .access-picks button.chosen { background:#101010; border-color:#101010; color:#fff; }
  form label { display:block; margin:20px 0 8px; font-size:12px; }
  .access-entry { display:flex; gap:8px; }
  .access-entry input { width:100%; min-width:0; border:1px solid #aaa; border-radius:0; padding:12px; color:#101010; background:#fff; font:16px Arial,Helvetica,sans-serif; }
  .access-entry input:focus-visible { outline:2px solid #101010; outline-offset:2px; }
  .access-entry button { padding:10px 14px; color:#fff; background:#101010; white-space:nowrap; font-size:13px; }
  .access-error { color:#a11c23; margin:12px 0 0; font-size:12px; }
  @media (max-width:760px) {
    .exhibition-intro { background:linear-gradient(90deg,#06070acc,#06070a6b),linear-gradient(0deg,#06070ab3,transparent 55%); }
    .poster { width:100%; min-width:0; max-width:none; padding:28px; min-height:100%; }
    h1 { margin-top:clamp(28px,7vh,72px); margin-bottom:auto; }
    h1 img { max-width:560px; }
    .event { margin-top:100px; margin-bottom:26px; gap:14px; }
    .shdw { width:44px; height:44px; }
    .venue { font-size:16px; }
    .dates { font-size:38px; }
    .enter-exhibition { min-height:60px; padding:14px 18px; }
    .tools { min-height:48px; }
  }
  @media (max-height:580px) and (min-width:761px) { .poster { padding:24px 36px; } h1 { margin-top:10px; max-width:320px; } .event { margin-top:35px; margin-bottom:22px; } .enter-exhibition { min-height:56px; } }
  @media (max-width:380px) { .poster { padding:22px; } .dates { font-size:32px; } .venue { font-size:14px; } .shdw { width:38px; height:38px; } }
</style>
