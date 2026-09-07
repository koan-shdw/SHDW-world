<script lang="ts">
  // The post-it field (SHOW.md §6): pick the note slot, this small paper opens under the crosshair with the mouse free.
  // Type, enter: the note is in your hands. esc: no note.
  import { bus } from '../bus'
  import { ui } from './state.svelte'
  let text = $state('')
  let ta = $state<HTMLTextAreaElement>()
  $effect(() => { if (ui.noteField) { text = ''; setTimeout(() => ta?.focus(), 30) } })
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (text.trim()) bus.emit('note_text', { text: text.trim() }); else bus.emit('note_cancel', {}) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bus.emit('note_cancel', {}) }
  }
</script>

{#if ui.noteField}
  <div class="notefield" style="--note: {ui.door.who === 'YOZO' ? '#4d7cff' : '#e5484d'}">
    <textarea bind:this={ta} bind:value={text} maxlength="140" rows="4" placeholder="a note · enter puts it in your hands · esc" onkeydown={key}></textarea>
    <div class="num">{ui.door.who ?? ''} · {text.length} / 140</div>
  </div>
{/if}
