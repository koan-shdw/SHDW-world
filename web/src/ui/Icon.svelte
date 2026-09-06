<script lang="ts">
  // Drawn icons (GAME.md §2): 2 px stroke, rounded caps, 24 px box. One place, no sprite file to ship.
  let { name, size = 22 }: { name: 'hand' | 'hook' | 'down' | 'swap' | 'turn' | 'door' | 'map' | 'cog' | 'cross' | 'check' | 'look' | 'align' | 'back'; size?: number } = $props()
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'hand'}<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 3.5-2.5 6-6 6s-5.5-2-6.5-5l-1.2-3.2a1.4 1.4 0 0 1 2.5-1.2L8 13" />
  {:else if name === 'hook'}<path d="M12 3v4M12 7a5 5 0 0 1 5 5v5H7v-5a5 5 0 0 1 5-5zM9 21h6" />
  {:else if name === 'down'}<path d="M12 4v13M6 11l6 6 6-6M5 21h14" />
  {:else if name === 'swap'}<path d="M4 8h13l-3-3M20 16H7l3 3" />
  {:else if name === 'turn'}<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" />
  {:else if name === 'door'}<path d="M5 3h11v18H5zM16 6l4 1v14l-4 1M12 12v1" />
  {:else if name === 'map'}<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />
  {:else if name === 'cog'}<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
  {:else if name === 'cross'}<path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'check'}<path d="M5 12.5l4.5 4.5L19 7" />
  {:else if name === 'look'}<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
  {:else if name === 'align'}<path d="M4 6h16M4 12h10M4 18h16" />
  {:else if name === 'back'}<path d="M11 6l-6 6 6 6M5 12h14" />
  {/if}
</svg>
