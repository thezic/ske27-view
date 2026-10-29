<script lang="ts">
	import { goto } from '$app/navigation';
	import { createMapController, type MapController } from '#lib/map/map-controller';

	let { data } = $props();

	let map = $state<MapController>();
	let offline = $state(false);

	function attachMap(element: HTMLElement) {
		const controller = createMapController({
			element,
			cartoApiKey: data.cartoApiKey,
			onOffline: (value) => (offline = value),
			onUnauthorized: () => goto('/login')
		});
		map = controller;

		return () => {
			controller.destroy();
			map = undefined;
		};
	}
</script>

<svelte:head><title>Kartan</title></svelte:head>

<div class="map" {@attach attachMap}></div>
<button class="fit" type="button" onclick={() => map?.fitAll()}>Visa alla</button>
{#if offline}
	<span class="offline" role="status" title="Kunde inte uppdatera" aria-label="Kunde inte uppdatera"></span>
{/if}

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
	}
	.map {
		position: fixed;
		inset: 0;
	}
	.fit {
		position: fixed;
		z-index: 1000;
		left: 10px;
		bottom: 24px;
		font: 12px system-ui, sans-serif;
		padding: 4px 8px;
		border: 1px solid rgb(0 0 0 / 0.25);
		border-radius: 4px;
		background: rgb(255 255 255 / 0.85);
		cursor: pointer;
	}
	.offline {
		position: fixed;
		z-index: 1000;
		top: 12px;
		right: 12px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #d93025;
		box-shadow: 0 0 0 2px rgb(255 255 255 / 0.8);
	}
</style>
