export type LatLng = { lat: number; lng: number };

export type Servant = {
	/** Stable across polls. */
	id: string;
	/** A person or a couple, e.g. "Anna & Erik". */
	name: string;
	currentLocation: LatLng;
	destination?: LatLng;
	photoUrl?: string;
};
