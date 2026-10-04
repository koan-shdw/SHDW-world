<script lang="ts">
  // The first screen (his 09-07 words): "choose your player": YOZO, KOAN or PUBLIC. The word sits under YOZO and KOAN.
  // Right word: you are in as that player. PUBLIC: straight in, look only. Every open starts here.
  import { onMount } from 'svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  let { base }: { base: string } = $props()
  let pick = $state<'YOZO' | 'KOAN' | null>(null)
  let word = $state('')
  let shake = $state(false)
  let field = $state<HTMLInputElement>()
  onMount(() => { bus.emit('door_leave', {}) })                       // the word every time: a remembered door does not skip the screen
  const choose = (p: 'YOZO' | 'KOAN') => { if (pick === p) return; pick = p; word = ''; ui.doorError = ''; setTimeout(() => field?.focus(), 30) }
  const go = () => { if (!pick || !word) return; bus.emit('door_check', { key: word, who: pick }) }
  const pub = () => { bus.emit('door_leave', {}); ui.chosen = true }
  $effect(() => { if (ui.door.open && pick) ui.chosen = true })          // the word was right
  $effect(() => { if (ui.doorError) { shake = true; setTimeout(() => (shake = false), 400) } })
</script>

{#if !ui.chosen && ui.room}
  <div class="intro">
    <img class="logo" src="{base}brand/logo.png" alt="CULT 2026" />
    <div class="choose">choose your player</div>
    <div class="players">
      <div class="player yozo" class:open={pick === 'YOZO'} class:shake={shake && pick === 'YOZO'}>
        <button class="choose-player" onclick={() => choose('YOZO')} aria-expanded={pick === 'YOZO'}><span class="name">YOZO</span></button>
        {#if pick === 'YOZO'}<input aria-label="YOZO word" bind:this={field} type="password" placeholder="the word" bind:value={word} onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); go() } }} />{/if}
      </div>
      <div class="player koan" class:open={pick === 'KOAN'} class:shake={shake && pick === 'KOAN'}>
        <button class="choose-player" onclick={() => choose('KOAN')} aria-expanded={pick === 'KOAN'}><span class="name">KOAN</span></button>
        {#if pick === 'KOAN'}<input aria-label="KOAN word" bind:this={field} type="password" placeholder="the word" bind:value={word} onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); go() } }} />{/if}
      </div>
      <button class="player public" onclick={pub}>
        <span class="name">PUBLIC</span>
      </button>
    </div>
    {#if ui.doorError}<div class="wrong">{ui.doorError}</div>{/if}
  </div>
{/if}
