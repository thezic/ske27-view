import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import type { Servant } from '../servant';
import { createLeafletLayer } from './leaflet-layer';
import { createPoller } from './poller';
import { createScene } from './scene';

const POLL_MS = 10_000;
const SWEDEN = { center: [62, 15] as L.LatLngTuple, zoom: 5 };
const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export type MapController = { fitAll(): void; destroy(): void };

type Options = {
	element: HTMLElement;
	cartoApiKey: string;
	onOffline(offline: boolean): void;
	onUnauthorized(): void;
};

/** Wires a Leaflet map to the scene model: polls the servants, animates the scene and draws it. */
export function createMapController({ element, cartoApiKey, onOffline, onUnauthorized }: Options): MapController {
	const map = L.map(element).setView(SWEDEN.center, SWEDEN.zoom);
	L.tileLayer(`${TILES}?key=${encodeURIComponent(cartoApiKey)}`, {
		maxZoom: 19,
		subdomains: 'abcd',
		attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
	}).addTo(map);

	const scene = createScene();
	const layer = createLeafletLayer(L, map);
	let servants: Servant[] = [];
	let fitted = false;

	function fitAll() {
		const points = servants.flatMap((s) => (s.destination ? [s.currentLocation, s.destination] : [s.currentLocation]));
		if (points.length === 0) map.setView(SWEDEN.center, SWEDEN.zoom);
		else map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
	}

	async function poll() {
		try {
			const res = await fetch('/api/servants');
			if (res.status === 401) return onUnauthorized();
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			servants = await res.json();
			onOffline(false);
			scene.update(servants, performance.now());
			// Only the first load fits the viewport, so later refreshes leave the user's zoom and pan alone.
			if (!fitted) {
				fitted = true;
				fitAll();
			}
		} catch {
			onOffline(true);
		}
	}

	const poller = createPoller(poll, POLL_MS);
	let frame = requestAnimationFrame(function draw() {
		layer.render(scene.at(performance.now()));
		frame = requestAnimationFrame(draw);
	});

	return {
		fitAll,
		destroy() {
			poller.destroy();
			cancelAnimationFrame(frame);
			map.remove();
		}
	};
}
