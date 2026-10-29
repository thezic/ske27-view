import type * as Leaflet from 'leaflet';
import type { DestinationVisual, SceneState, ServantVisual } from './scene';

type L = typeof Leaflet;

const el = (tag: string, className: string, parent?: HTMLElement) => {
	const node = document.createElement(tag);
	node.className = className;
	parent?.append(node);
	return node;
};

function servantIcon(L: L, s: ServantVisual) {
	const root = el('div', 'servant');
	root.style.setProperty('--color', s.color);
	if (s.photoUrl) {
		const img = el('img', 'avatar', root) as HTMLImageElement;
		img.src = s.photoUrl;
		img.alt = '';
	} else {
		el('div', 'pin', root);
	}
	el('div', 'label', root).textContent = s.name;
	return L.divIcon({ html: root, className: 'servant-icon', iconSize: [0, 0] });
}

function destinationIcon(L: L, d: DestinationVisual) {
	const root = el('div', 'destination');
	root.style.setProperty('--color', d.color);
	el('div', 'pin', root);
	return L.divIcon({ html: root, className: 'destination-icon', iconSize: [0, 0] });
}

type Entry<M> = { marker: M; signature: string };

/** Draws a scene onto a Leaflet map: markers for servants and destinations, dashed polylines between them. */
export function createLeafletLayer(L: L, map: Leaflet.Map) {
	const servants = new Map<string, Entry<Leaflet.Marker>>();
	const destinations = new Map<string, Entry<Leaflet.Marker>>();
	const lines = new Map<string, Leaflet.Polyline>();

	function sync<V extends { opacity: number }, K extends string>(
		store: Map<K, Entry<Leaflet.Marker>>,
		visuals: (V & { key: K; position: Leaflet.LatLngLiteral; signature: string })[],
		icon: (v: V) => Leaflet.DivIcon
	) {
		const seen = new Set<K>();
		for (const v of visuals) {
			seen.add(v.key);
			let entry = store.get(v.key);
			if (!entry) {
				entry = { marker: L.marker(v.position, { icon: icon(v), interactive: false, keyboard: false }).addTo(map), signature: v.signature };
				store.set(v.key, entry);
			} else if (entry.signature !== v.signature) {
				entry.marker.setIcon(icon(v));
				entry.signature = v.signature;
			}
			entry.marker.setLatLng(v.position);
			entry.marker.setOpacity(v.opacity);
		}
		for (const [key, entry] of store) {
			if (!seen.has(key)) {
				entry.marker.remove();
				store.delete(key);
			}
		}
	}

	return {
		render(state: SceneState) {
			sync(
				servants,
				state.servants.map((s) => ({ ...s, key: s.id, signature: `${s.name}|${s.color}|${s.photoUrl ?? ''}` })),
				(s) => servantIcon(L, s)
			);
			sync(
				destinations,
				state.destinations.map((d) => ({ ...d, key: d.servantId, signature: d.color })),
				(d) => destinationIcon(L, d)
			);

			const seen = new Set<string>();
			for (const line of state.lines) {
				seen.add(line.servantId);
				const points: Leaflet.LatLngLiteral[] = [line.from, line.to];
				let polyline = lines.get(line.servantId);
				if (!polyline) {
					polyline = L.polyline(points, { color: line.color, weight: 2, dashArray: '6 8', interactive: false }).addTo(map);
					lines.set(line.servantId, polyline);
				}
				polyline.setLatLngs(points);
				polyline.setStyle({ color: line.color, opacity: line.opacity * 0.8 });
			}
			for (const [id, polyline] of lines) {
				if (!seen.has(id)) {
					polyline.remove();
					lines.delete(id);
				}
			}
		}
	};
}
