import { createClient } from '@supabase/supabase-js';
import type { LatLng, Servant } from '#lib/servant';
import { config } from './config';

type Row = {
	id: string;
	couple_names: string;
	event_private: {
		actual_latitude: number | null;
		actual_longitude: number | null;
		home_latitude: number | null;
		home_longitude: number | null;
	} | null;
};

/**
 * The single data source for the map. Reads Servants from Supabase and never writes to it.
 * `event_private.home_*` is the Current location and `event_private.actual_*` the Destination; either may be missing.
 * Servants with neither are left out, since there is nothing to place on the map.
 */
export async function getServants(): Promise<Servant[]> {
	const { SUPABASE_URL, SUPABASE_SECRET_KEY } = config();
	// The secret key is needed: the publishable key may not read event_private.
	const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const { data, error } = await supabase
		.from('events')
		.select('id, couple_names, event_private(actual_latitude, actual_longitude, home_latitude, home_longitude)')
		.is('deleted_at', null);
	if (error) throw new Error(`Could not read servants: ${error.message}`);

	return (data as unknown as Row[]).flatMap((row) => {
		const p = row.event_private;
		const currentLocation = latLng(p?.home_latitude, p?.home_longitude);
		const destination = latLng(p?.actual_latitude, p?.actual_longitude);
		if (!currentLocation && !destination) return [];
		return [
			{
				id: String(row.id),
				name: row.couple_names,
				...(currentLocation && { currentLocation }),
				...(destination && { destination })
			}
		];
	});
}

function latLng(lat: number | null | undefined, lng: number | null | undefined): LatLng | undefined {
	return lat == null || lng == null ? undefined : { lat: Number(lat), lng: Number(lng) };
}
