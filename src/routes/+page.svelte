<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Servant } from '#lib/servant';
	import { createScene } from '#lib/map/scene';
	import { createLeafletLayer } from '#lib/map/leaflet-layer';

	const POLL_MS = 10_000;
	const SWEDEN = { center: [62, 15] as [number, number], zoom: 5 };

	let mapElement: HTMLDivElement;
	let offline = $state(false);
	let fitAll = $state<() => void>(() => {});

	onMount(() => {
		let disposed = false;
		let cleanup = () => {};

		(async () => {
			const L = await import('leaflet');
			if (disposed) return;

			const map = L.map(mapElement, { zoomControl: true, attributionControl: true }).setView(SWEDEN.center, SWEDEN.zoom);
			L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
				maxZoom: 19,
				subdomains: 'abcd',
				attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
			}).addTo(map);

			const scene = createScene();
			const layer = createLeafletLayer(L, map);
			let latest: Servant[] = [];
			let fitted = false;

			fitAll = () => {
				const points = latest.flatMap((s) => (s.destination ? [s.currentLocation, s.destination] : [s.currentLocation]));
				if (points.length === 0) map.setView(SWEDEN.center, SWEDEN.zoom);
				else map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
			};

			let inFlight = false;
			async function poll() {
				if (inFlight) return;
				inFlight = true;
				try {
					const res = await fetch('/api/servants');
					if (res.status === 401) {
						await goto('/login');
						return;
					}
					if (!res.ok) throw new Error(String(res.status));
					latest = await res.json();
					offline = false;
					scene.update(latest, performance.now());
					if (!fitted) {
						fitted = true;
						fitAll();
					}
				} catch {
					offline = true;
				} finally {
					inFlight = false;
				}
			}

			let timer: ReturnType<typeof setInterval> | undefined;
			const start = () => {
				poll();
				timer = setInterval(poll, POLL_MS);
			};
			const stop = () => clearInterval(timer);
			const onVisibility = () => {
				stop();
				if (document.visibilityState === 'visible') start();
			};
			document.addEventListener('visibilitychange', onVisibility);
			if (document.visibilityState === 'visible') start();

			let frame = requestAnimationFrame(function draw() {
				layer.render(scene.at(performance.now()));
				frame = requestAnimationFrame(draw);
			});

			cleanup = () => {
				stop();
				cancelAnimationFrame(frame);
				document.removeEventListener('visibilitychange', onVisibility);
				map.remove();
			};
		})();

		return () => {
			disposed = true;
			cleanup();
		};
	});
</script>

<svelte:head><title>Kartan</title></svelte:head>

<div class="map" bind:this={mapElement}></div>
<button class="fit" onclick={() => fitAll()}>Visa alla</button>
{#if offline}<span class="offline" title="Kunde inte uppdatera" role="status" aria-label="Kunde inte uppdatera"></span>{/if}

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

	/* Leaflet marker contents are created outside Svelte, hence :global */
	:global(.servant-icon),
	:global(.destination-icon) {
		overflow: visible;
	}
	/* The marker's coordinate is the centre of the avatar or pin; the label hangs below it. */
	:global(.servant) {
		position: absolute;
		transform: translate(-50%, -50%);
		font-family: system-ui, sans-serif;
	}
	:global(.servant .avatar) {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid var(--color);
		background: #fff;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}
	:global(.servant .pin),
	:global(.destination .pin) {
		width: 22px;
		height: 22px;
		border-radius: 50% 50% 50% 0;
		transform: rotate(-45deg);
		background: var(--color);
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.4);
	}
	:global(.servant .label) {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 2px;
		padding: 1px 6px;
		border-radius: 8px;
		background: rgb(255 255 255 / 0.9);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
	}
	:global(.destination) {
		position: absolute;
		transform: translate(-50%, -50%);
	}
	:global(.destination .pin) {
		width: 12px;
		height: 12px;
		opacity: 0.55;
		filter: saturate(0.6);
	}
</style>
