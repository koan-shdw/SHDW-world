<script lang="ts">
  import type { Snippet } from 'svelte'
  let { label, tip, children }: { label: string; tip?: string; children: Snippet } = $props()
</script>

<label class="row" title={tip}><span>{label}</span>{@render children()}</label>
