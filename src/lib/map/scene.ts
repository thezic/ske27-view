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
	/** Whether the name is shown here; it is only when there is no Destination to carry it. */
	labelled: boolean;
	photoUrl?: string;
};
export type DestinationVisual = {
	servantId: string;
	name: string;
	position: LatLng;
	opacity: number;
	color: string;
	labelled: boolean;
};
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

/** Starts, updates or ends a glider for a location that may be missing. */
function track(glider: Glider | undefined, target: LatLng | undefined, now: number): Glider | undefined {
	if (!glider) return target && appear(target, now);
	sync(glider, target, now);
	return glider;
}

const prune = (g: Glider | undefined, now: number) => (g && gone(g, now) ? undefined : g);

function visible(g: Glider | undefined, now: number) {
	if (!g || gone(g, now)) return undefined;
	return { position: positionAt(g.position, now), opacity: numberAt(g.opacity, now) };
}

/** A Servant has a Current location, a Destination, or both. */
type Entity = { servant: Servant; current?: Glider; destination?: Glider };

export function createScene(): Scene {
	const entities = new Map<string, Entity>();

	return {
		update(servants, now) {
			for (const [id, entity] of entities) {
				entity.current = prune(entity.current, now);
				entity.destination = prune(entity.destination, now);
				if (!entity.current && !entity.destination) entities.delete(id);
			}

			const incoming = new Set(servants.map((s) => s.id));
			for (const servant of servants) {
				const entity = entities.get(servant.id) ?? { servant };
				entity.servant = servant;
				entity.current = track(entity.current, servant.currentLocation, now);
				entity.destination = track(entity.destination, servant.destination, now);
				entities.set(servant.id, entity);
			}

			for (const [id, entity] of entities) {
				if (incoming.has(id)) continue;
				entity.current = track(entity.current, undefined, now);
				entity.destination = track(entity.destination, undefined, now);
			}
		},

		at(now) {
			const state: SceneState = { servants: [], destinations: [], lines: [] };
			for (const { servant, current, destination } of entities.values()) {
				const { id, name, photoUrl } = servant;
				const color = colorFor(id);
				const here = visible(current, now);
				const there = visible(destination, now);
				// The name sits on the Destination pin, falling back to the Servant marker when there is none.
				const nameOnDestination = !!there && (destination!.present || !here);

				if (here) state.servants.push({ id, name, ...here, color, labelled: !nameOnDestination, ...(photoUrl && { photoUrl }) });
				if (there) state.destinations.push({ servantId: id, name, ...there, color, labelled: nameOnDestination });
				if (here && there) {
					state.lines.push({
						servantId: id,
						from: here.position,
						to: there.position,
						opacity: Math.min(here.opacity, there.opacity),
						color
					});
				}
			}
			return state;
		}
	};
}
