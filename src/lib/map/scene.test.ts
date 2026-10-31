import { describe, expect, it } from 'vitest';
import type { Servant } from '../servant';
import { createScene } from './scene';

const anna = (extra: Partial<Servant> = {}): Servant => ({
	id: 'anna',
	name: 'Anna & Erik',
	currentLocation: { lat: 10, lng: 20 },
	...extra
});

const servantNamed = (scene: ReturnType<typeof createScene>, id: string, now: number) =>
	scene.at(now).servants.find((s) => s.id === id);

describe('movement', () => {
	it('glides from the old to the new current location over ~1.5 s with easing', () => {
		const scene = createScene();
		scene.update([anna()], 0);
		scene.update([anna({ currentLocation: { lat: 20, lng: 40 } })], 10_000);

		expect(servantNamed(scene, 'anna', 10_000)!.position).toEqual({ lat: 10, lng: 20 });

		const early = servantNamed(scene, 'anna', 10_000 + 375)!.position;
		const mid = servantNamed(scene, 'anna', 10_000 + 750)!.position;
		expect(mid.lat).toBeCloseTo(15);
		expect(mid.lng).toBeCloseTo(30);
		// ease-in: a quarter of the way in time is less than a quarter of the way in distance
		expect(early.lat).toBeGreaterThan(10);
		expect(early.lat).toBeLessThan(12.5);

		expect(servantNamed(scene, 'anna', 10_000 + 1500)!.position).toEqual({ lat: 20, lng: 40 });
		expect(servantNamed(scene, 'anna', 99_000)!.position).toEqual({ lat: 20, lng: 40 });
	});

	it('restarts from where it visibly is when a new poll arrives mid-glide', () => {
		const scene = createScene();
		scene.update([anna()], 0);
		scene.update([anna({ currentLocation: { lat: 20, lng: 20 } })], 10_000);
		const midway = servantNamed(scene, 'anna', 10_750)!.position;
		scene.update([anna({ currentLocation: { lat: 20, lng: 20 } })], 10_750);
		expect(servantNamed(scene, 'anna', 10_750)!.position).toEqual(midway);
	});

	it('matches servants by id, not by name or array order', () => {
		const bo = { id: 'bo', name: 'Bo', currentLocation: { lat: 1, lng: 1 } };
		const scene = createScene();
		scene.update([anna(), bo], 0);
		scene.update([{ ...bo, name: 'Bosse', currentLocation: { lat: 2, lng: 2 } }, anna({ name: 'Anna' })], 10_000);

		expect(servantNamed(scene, 'anna', 10_000)!.position).toEqual({ lat: 10, lng: 20 });
		expect(servantNamed(scene, 'bo', 10_000)!.position).toEqual({ lat: 1, lng: 1 });
		expect(servantNamed(scene, 'bo', 12_000)!.position).toEqual({ lat: 2, lng: 2 });
		expect(servantNamed(scene, 'bo', 12_000)!.name).toBe('Bosse');
	});
});

describe('appearing and disappearing servants', () => {
	it('fades a new servant in over ~400 ms', () => {
		const scene = createScene();
		scene.update([], 0);
		scene.update([anna()], 1_000);
		expect(servantNamed(scene, 'anna', 1_000)!.opacity).toBe(0);
		const half = servantNamed(scene, 'anna', 1_200)!.opacity;
		expect(half).toBeGreaterThan(0);
		expect(half).toBeLessThan(1);
		expect(servantNamed(scene, 'anna', 1_400)!.opacity).toBe(1);
	});

	it('fades a removed servant out and then drops it from the scene', () => {
		const scene = createScene();
		scene.update([anna()], 0);
		scene.update([], 10_000);
		expect(servantNamed(scene, 'anna', 10_000)!.opacity).toBe(1);
		const half = servantNamed(scene, 'anna', 10_200)!.opacity;
		expect(half).toBeGreaterThan(0);
		expect(half).toBeLessThan(1);
		expect(servantNamed(scene, 'anna', 10_400)).toBeUndefined();
	});

	it('fades a servant back in from its current opacity if it reappears mid-fade', () => {
		const scene = createScene();
		scene.update([anna()], 0);
		scene.update([], 10_000);
		const fading = servantNamed(scene, 'anna', 10_200)!.opacity;
		scene.update([anna()], 10_200);
		expect(servantNamed(scene, 'anna', 10_200)!.opacity).toBeCloseTo(fading);
		expect(servantNamed(scene, 'anna', 10_700)!.opacity).toBe(1);
	});
});

describe('destinations and lines', () => {
	const settled = (extra: Partial<Servant>) => {
		const scene = createScene();
		scene.update([anna(extra)], 0);
		return scene;
	};

	it('shows no destination or line for a servant without one', () => {
		const scene = settled({});
		expect(scene.at(5_000).destinations).toEqual([]);
		expect(scene.at(5_000).lines).toEqual([]);
	});

	it('shows the destination and a line from the servant to it', () => {
		const scene = settled({ destination: { lat: 30, lng: 50 } });
		const { destinations, lines } = scene.at(5_000);
		expect(destinations).toEqual([
			{
				servantId: 'anna',
				name: 'Anna & Erik',
				position: { lat: 30, lng: 50 },
				opacity: 1,
				color: expect.any(String),
				labelled: true
			}
		]);
		expect(lines).toEqual([
			{ servantId: 'anna', from: { lat: 10, lng: 20 }, to: { lat: 30, lng: 50 }, opacity: 1, color: expect.any(String) }
		]);
	});

	it('moves the line start along with a gliding servant', () => {
		const scene = settled({ destination: { lat: 30, lng: 50 } });
		scene.update([anna({ currentLocation: { lat: 20, lng: 40 }, destination: { lat: 30, lng: 50 } })], 10_000);
		const { lines, servants } = scene.at(10_750);
		expect(lines[0].from).toEqual(servants[0].position);
		expect(lines[0].from.lat).toBeCloseTo(15);
	});

	it('fades a destination in when it is added, and its line with it', () => {
		const scene = settled({});
		scene.update([anna({ destination: { lat: 30, lng: 50 } })], 10_000);
		expect(scene.at(10_000).destinations[0].opacity).toBe(0);
		expect(scene.at(10_000).lines[0].opacity).toBe(0);
		const half = scene.at(10_200);
		expect(half.destinations[0].opacity).toBeGreaterThan(0);
		expect(half.destinations[0].opacity).toBeLessThan(1);
		expect(half.lines[0].opacity).toBeCloseTo(half.destinations[0].opacity);
		expect(scene.at(10_400).destinations[0].opacity).toBe(1);
	});

	it('fades a destination out when it is removed, then drops it and its line', () => {
		const scene = settled({ destination: { lat: 30, lng: 50 } });
		scene.update([anna()], 10_000);
		const half = scene.at(10_200);
		expect(half.destinations[0].opacity).toBeGreaterThan(0);
		expect(half.destinations[0].opacity).toBeLessThan(1);
		expect(half.lines).toHaveLength(1);
		expect(scene.at(10_400).destinations).toEqual([]);
		expect(scene.at(10_400).lines).toEqual([]);
	});

	it('glides a changed destination to its new place', () => {
		const scene = settled({ destination: { lat: 30, lng: 50 } });
		scene.update([anna({ destination: { lat: 50, lng: 70 } })], 10_000);
		expect(scene.at(10_000).destinations[0].position).toEqual({ lat: 30, lng: 50 });
		expect(scene.at(10_750).destinations[0].position.lat).toBeCloseTo(40);
		expect(scene.at(11_500).destinations[0].position).toEqual({ lat: 50, lng: 70 });
		expect(scene.at(10_750).destinations[0].opacity).toBe(1);
	});

	it('fades the destination out together with a removed servant', () => {
		const scene = settled({ destination: { lat: 30, lng: 50 } });
		scene.update([], 10_000);
		expect(scene.at(10_200).destinations[0].opacity).toBeLessThan(1);
		expect(scene.at(10_400).destinations).toEqual([]);
	});
});

describe('servants with only a destination', () => {
	const bo: Servant = { id: 'bo', name: 'Bo', destination: { lat: 30, lng: 50 } };

	it('shows only the destination, with no servant marker or line', () => {
		const scene = createScene();
		scene.update([bo], 0);
		const { servants, destinations, lines } = scene.at(5_000);
		expect(servants).toEqual([]);
		expect(lines).toEqual([]);
		expect(destinations).toMatchObject([{ servantId: 'bo', position: { lat: 30, lng: 50 }, opacity: 1 }]);
	});

	it('fades in, and out again when removed', () => {
		const scene = createScene();
		scene.update([bo], 0);
		expect(scene.at(0).destinations[0].opacity).toBe(0);
		expect(scene.at(400).destinations[0].opacity).toBe(1);
		scene.update([], 10_000);
		expect(scene.at(10_200).destinations[0].opacity).toBeLessThan(1);
		expect(scene.at(10_400).destinations).toEqual([]);
	});

	it('gains a servant marker and line once the current location becomes known', () => {
		const scene = createScene();
		scene.update([bo], 0);
		scene.update([{ ...bo, currentLocation: { lat: 10, lng: 20 } }], 10_000);
		const { servants, lines } = scene.at(10_400);
		expect(servants).toMatchObject([{ id: 'bo', position: { lat: 10, lng: 20 }, opacity: 1 }]);
		expect(lines).toMatchObject([{ servantId: 'bo', from: { lat: 10, lng: 20 }, to: { lat: 30, lng: 50 }, opacity: 1 }]);
	});

	it('is dropped once the destination has faded out and there is no current location', () => {
		const scene = createScene();
		scene.update([bo], 0);
		scene.update([{ id: 'bo', name: 'Bo' }], 10_000);
		scene.update([], 20_000);
		expect(scene.at(20_000)).toEqual({ servants: [], destinations: [], lines: [] });
	});
});

describe('name label', () => {
	const labels = (scene: ReturnType<typeof createScene>, now: number) => {
		const { servants, destinations } = scene.at(now);
		return { servant: servants[0]?.labelled, destination: destinations[0]?.labelled };
	};

	it('goes on the destination pin when there is a destination', () => {
		const scene = createScene();
		scene.update([anna({ destination: { lat: 30, lng: 50 } })], 0);
		expect(labels(scene, 5_000)).toEqual({ servant: false, destination: true });
	});

	it('falls back to the servant marker when there is no destination', () => {
		const scene = createScene();
		scene.update([anna()], 0);
		expect(labels(scene, 5_000)).toEqual({ servant: true, destination: undefined });
	});

	it('moves to the servant marker as soon as the destination starts fading out', () => {
		const scene = createScene();
		scene.update([anna({ destination: { lat: 30, lng: 50 } })], 0);
		scene.update([anna()], 10_000);
		expect(labels(scene, 10_200)).toEqual({ servant: true, destination: false });
	});

	it('stays on a fading destination when there is no servant marker to move to', () => {
		const scene = createScene();
		scene.update([{ id: 'bo', name: 'Bo', destination: { lat: 30, lng: 50 } }], 0);
		scene.update([], 10_000);
		expect(labels(scene, 10_200)).toEqual({ servant: undefined, destination: true });
	});
});

describe('appearance', () => {
	it('keeps a servant colour identical across polls and scene instances', () => {
		const a = createScene();
		const b = createScene();
		a.update([anna()], 0);
		b.update([anna()], 99_999);
		const first = servantNamed(a, 'anna', 5_000)!.color;
		a.update([anna({ currentLocation: { lat: 1, lng: 1 } })], 10_000);
		expect(servantNamed(a, 'anna', 20_000)!.color).toBe(first);
		expect(servantNamed(b, 'anna', 200_000)!.color).toBe(first);
	});

	it('draws colours from a palette of 8', () => {
		const scene = createScene();
		scene.update(
			Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, name: 'x', currentLocation: { lat: 0, lng: 0 } })),
			0
		);
		expect(new Set(scene.at(5_000).servants.map((s) => s.color)).size).toBe(8);
	});

	it('shows a photo only for servants that have one', () => {
		const scene = createScene();
		scene.update([anna({ photoUrl: '/a.svg' }), { id: 'bo', name: 'Bo', currentLocation: { lat: 0, lng: 0 } }], 0);
		expect(servantNamed(scene, 'anna', 5_000)).toMatchObject({ photoUrl: '/a.svg' });
		expect(servantNamed(scene, 'bo', 5_000)!.photoUrl).toBeUndefined();
	});
});
