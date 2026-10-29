import type { LatLng, Servant } from '../servant';

const MOVE_MS = 1500;
const FADE_MS = 400;

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#e91e90'];

export type ServantVisual = {
	id: string;
	name: string;
	position: LatLng;
	opacity: number;
	color: string;
	photoUrl?: string;
};
export type DestinationVisual = { servantId: string; position: LatLng; opacity: number; color: string };
export type LineVisual = { servantId: string; from: LatLng; to: LatLng; opacity: number; color: string };
export type SceneState = { servants: ServantVisual[]; destinations: DestinationVisual[]; lines: LineVisual[] };

export type Scene = {
	/** Feed in the result of a poll. */
	update(servants: Servant[], now: number): void;
	/** The visual state of the map at `now`. */
	at(now: number): SceneState;
};

export function colorFor(id: string): string {
	let hash = 2166136261;
	for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
	return PALETTE[(hash >>> 0) % PALETTE.length];
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Tween<T> = { from: T; to: T; start: number; duration: number; ease: (t: number) => number };

const linear = (t: number) => t;
const settled = <T>(value: T): Tween<T> => ({ from: value, to: value, start: 0, duration: 0, ease: linear });
const progress = (tw: Tween<unknown>, now: number) =>
	tw.duration === 0 ? 1 : Math.min(1, Math.max(0, (now - tw.start) / tw.duration));
const finished = (tw: Tween<unknown>, now: number) => now >= tw.start + tw.duration;

function numberAt(tw: Tween<number>, now: number) {
	return tw.from + (tw.to - tw.from) * tw.ease(progress(tw, now));
}
function positionAt(tw: Tween<LatLng>, now: number): LatLng {
	const t = tw.ease(progress(tw, now));
	if (t === 1) return tw.to;
	return { lat: tw.from.lat + (tw.to.lat - tw.from.lat) * t, lng: tw.from.lng + (tw.to.lng - tw.from.lng) * t };
}

const moveTo = (tw: Tween<LatLng>, to: LatLng, now: number): Tween<LatLng> => ({
	from: positionAt(tw, now),
	to,
	start: now,
	duration: MOVE_MS,
	ease: easeInOutCubic
});
const fadeTo = (tw: Tween<number>, to: number, now: number): Tween<number> => ({
	from: numberAt(tw, now),
	to,
	start: now,
	duration: FADE_MS,
	ease: linear
});
const sameLocation = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

type Glider = { position: Tween<LatLng>; opacity: Tween<number>; present: boolean };

function appear(at: LatLng, now: number): Glider {
	return { position: settled(at), opacity: fadeTo(settled(0), 1, now), present: true };
}

/** Brings a glider in line with the latest known location (or its absence). */
function sync(glider: Glider, target: LatLng | undefined, now: number) {
	if (!target) {
		if (glider.present) glider.opacity = fadeTo(glider.opacity, 0, now);
		glider.present = false;
		return;
	}
	if (!glider.present) glider.opacity = fadeTo(glider.opacity, 1, now);
	glider.present = true;
	if (!sameLocation(glider.position.to, target)) glider.position = moveTo(glider.position, target, now);
}

const gone = (g: Glider, now: number) => !g.present && finished(g.opacity, now);

type Entity = Glider & { servant: Servant; destination?: Glider };

export function createScene(): Scene {
	const entities = new Map<string, Entity>();

	return {
		update(servants, now) {
			for (const [id, entity] of entities) {
				if (gone(entity, now)) entities.delete(id);
				else if (entity.destination && gone(entity.destination, now)) delete entity.destination;
			}

			const incoming = new Set(servants.map((s) => s.id));
			for (const servant of servants) {
				let entity = entities.get(servant.id);
				if (entity) sync(entity, servant.currentLocation, now);
				else {
					entity = { ...appear(servant.currentLocation, now), servant };
					entities.set(servant.id, entity);
				}
				entity.servant = servant;

				if (servant.destination) {
					if (!entity.destination) entity.destination = appear(servant.destination, now);
					else sync(entity.destination, servant.destination, now);
				} else if (entity.destination) sync(entity.destination, undefined, now);
			}

			for (const [id, entity] of entities) {
				if (incoming.has(id)) continue;
				sync(entity, undefined, now);
				if (entity.destination) sync(entity.destination, undefined, now);
			}
		},

		at(now) {
			const state: SceneState = { servants: [], destinations: [], lines: [] };
			for (const entity of entities.values()) {
				if (gone(entity, now)) continue;
				const { id, name, photoUrl } = entity.servant;
				const color = colorFor(id);
				const position = positionAt(entity.position, now);
				const opacity = numberAt(entity.opacity, now);
				state.servants.push({ id, name, position, opacity, color, ...(photoUrl && { photoUrl }) });

				const dest = entity.destination;
				if (!dest || gone(dest, now)) continue;
				const destPosition = positionAt(dest.position, now);
				const destOpacity = numberAt(dest.opacity, now);
				state.destinations.push({ servantId: id, position: destPosition, opacity: destOpacity, color });
				state.lines.push({
					servantId: id,
					from: position,
					to: destPosition,
					opacity: Math.min(opacity, destOpacity),
					color
				});
			}
			return state;
		}
	};
}
