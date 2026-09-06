<script lang="ts">
  // The HTML layer, game shell (GAME-UI.md): mark, crosshair, prompt, hotbar, hands, touch menu, wall widget, options, maps, toasts.
  // Svelte 5. Talks to the world only through the bus.
  import { onMount } from 'svelte'
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  import Hotbar from './Hotbar.svelte'
  import Hands from './Hands.svelte'
  import TouchMenu from './TouchMenu.svelte'
  import Ring from './Ring.svelte'
  import WallWidget from './WallWidget.svelte'
  import Options from './Options.svelte'
  import AddPanel from './AddPanel.svelte'
  import Debug from './Debug.svelte'

  let { base, version, onviewport }: { base: string; version: string; onviewport: (el: HTMLElement) => void } = $props()
  let viewport: HTMLElement
  let small: HTMLCanvasElement, big: HTMLCanvasElement
  let add = $state<AddPanel>()
  onMount(() => {
    const off = bus.on('world_ready', () => bus.emit('mount_maps', { small, big }))   // the world listens once it exists
    onviewport(viewport)
    return off
  })
  // every button: hover and press sounds (GAME.md §1), one delegated listener
  const uiHover = (e: MouseEvent) => { const t = (e.target as HTMLElement).closest?.('button'); if (t && !t.disabled) bus.emit('sfx', { name: 'hover' }) }
  const uiClick = (e: MouseEvent) => { const t = (e.target as HTMLElement).closest?.('button, input[type=checkbox]'); if (t) bus.emit('sfx', { name: 'click' }) }
  $effect(() => { if (ui.hud.cross) ui.entered = true })
  const mapClick = (e: MouseEvent) => { const r = big.getBoundingClientRect(); bus.emit('map_click', { px: e.clientX - r.left, py: e.clientY - r.top }) }
</script>

<div class="viewport" bind:this={viewport} ondragover={(e) => e.preventDefault()} ondrop={(e) => add?.drop(e)} role="presentation">
  {#if ui.failed}
    <div class="loading"><div>SHDW.world</div><div class="txt">level.json failed: {ui.failed}</div></div>
  {:else if !ui.room}
    <div class="loading"><div>SHDW.world</div><div class="txt">loading the room…</div></div>
  {/if}
  {#if ui.loader.active}
    <div class="loadbar" title={ui.loader.text}><i style="width:{ui.loader.total ? Math.round(100 * ui.loader.done / ui.loader.total) : 0}%"></i><span>{ui.loader.text}</span></div>
  {/if}
  {#if ui.room && !ui.entered}
    <div class="title"><div class="mark big">SHDW<b>.world</b></div><div class="enter">press anywhere to enter</div><div class="keys">w a s d walk · mouse look · click hang · e touch · esc menu</div></div>
  {:else if ui.hud.hint === 'play' && ui.room}
    <div class="hint">click to play<small>w a s d walk · mouse look · click hang · e touch · esc menu</small></div>
  {/if}
  <div class="crosshair" class:target={ui.hud.target} hidden={!ui.hud.cross}></div>
  <div class="doortip" hidden={!ui.hud.doorTip}>{ui.hud.doorTip}</div>
  <div class="hangtip" hidden={!ui.hud.hangTip}>{ui.hud.hangTip}</div>
  {#if ui.anchors['work']?.visible && !ui.touch}<div class="worklabel" style="left:{ui.anchors['work'].x}px; top:{ui.anchors['work'].y}px">{ui.anchors['work'].text}</div>{/if}
  <Ring />
  <TouchMenu />
  <WallWidget />
</div>

<svelte:document onmouseover={uiHover} onclick={uiClick} />
<div class="mark top">SHDW<b>.world</b></div>

<div class="bottom" class:dim={!ui.hud.cross}>
  <AddPanel bind:this={add} />
  <Hotbar {base} onadd={() => add?.open()} />
</div>
<Hands {base} />

<canvas class="minimap" bind:this={small}></canvas>
<canvas class="bigmap" bind:this={big} hidden={!ui.mapShown} onclick={mapClick}></canvas>

<div class="toasts">
  {#each ui.toasts as t (t.id)}<div class="toast {t.kind}">{t.msg}</div>{/each}
</div>

{#if ui.menuShown}<Options {version} />{/if}
{#if ui.debugShown}<Debug />{/if}
