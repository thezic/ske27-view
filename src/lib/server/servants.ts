import type { LatLng, Servant } from '#lib/servant';

/**
 * The single data source for the map. Today it serves mock data;
 * later it will read from a database without the endpoint changing.
 */
export async function getServants(now = Date.now()): Promise<Servant[]> {
	return MOCKS.map(({ route, periodSeconds, ...servant }) => ({
		...servant,
		currentLocation: along(route, (now / 1000 / periodSeconds) % 1)
	}));
}

type Mock = Omit<Servant, 'currentLocation'> & { route: LatLng[]; periodSeconds: number };

const stockholm = { lat: 59.3293, lng: 18.0686 };
const gothenburg = { lat: 57.7089, lng: 11.9746 };
const malmo = { lat: 55.605, lng: 13.0038 };
const jonkoping = { lat: 57.7826, lng: 14.1618 };
const sundsvall = { lat: 62.3908, lng: 17.3069 };
const orebro = { lat: 59.2753, lng: 15.2134 };
const linkoping = { lat: 58.4108, lng: 15.6214 };
const umea = { lat: 63.8258, lng: 20.263 };

const MOCKS: Mock[] = [
	{
		id: 'anna-erik',
		name: 'Anna & Erik',
		photoUrl: '/mock/anna-erik.svg',
		destination: gothenburg,
		route: [stockholm, orebro, jonkoping, gothenburg, jonkoping, orebro, stockholm],
		periodSeconds: 600
	},
	{
		id: 'maria',
		name: 'Maria',
		photoUrl: '/mock/maria.svg',
		route: [malmo, jonkoping, linkoping, malmo],
		periodSeconds: 480
	},
	{
		id: 'olof',
		name: 'Olof',
		destination: stockholm,
		route: [sundsvall, orebro, stockholm, orebro, sundsvall],
		periodSeconds: 720
	},
	{
		id: 'karin-johan',
		name: 'Karin & Johan',
		route: [umea, sundsvall, umea],
		periodSeconds: 900
	},
	{
		id: 'lars',
		name: 'Lars',
		photoUrl: '/mock/lars.svg',
		destination: malmo,
		route: [gothenburg, malmo, gothenburg],
		periodSeconds: 540
	}
];

/** Position at fraction `t` (0..1) of the total distance along a polyline. */
function along(route: LatLng[], t: number): LatLng {
	const lengths = route.slice(1).map((p, i) => Math.hypot(p.lat - route[i].lat, p.lng - route[i].lng));
	let remaining = t * lengths.reduce((a, b) => a + b, 0);
	for (let i = 0; i < lengths.length; i++) {
		if (remaining <= lengths[i]) {
			const f = lengths[i] === 0 ? 0 : remaining / lengths[i];
			return {
				lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f,
				lng: route[i].lng + (route[i + 1].lng - route[i].lng) * f
			};
		}
		remaining -= lengths[i];
	}
	return route[route.length - 1];
}
