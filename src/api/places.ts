import { apiFetch } from './client';
import type { ConfirmedAddress } from '../components/AddressAutocompleteField';

// NOT CURRENTLY WIRED UP — AddressAutocompleteField.tsx was reverted back
// to the direct Photon/OSM call (see kiwifix_address_geocoding memory)
// because the backend endpoints this file calls (/places/autocomplete,
// /places/details) haven't been deployed to kiwifix-backend yet. This file
// is ready to use again once that backend PR lands — see the handed-off
// PlacesController code in that memory. Until then, nothing in the app
// imports this file.
//
// Calls the backend's Google Places (New) proxy (see PlacesController in
// kiwifix-backend — the API key lives server-side only, never shipped in
// this app). Replaces the old direct-from-mobile Photon/OSM call, which had
// known NZ suburb-tagging accuracy issues (see kiwifix_address_geocoding
// memory). sessionToken groups a search+select together for Google's
// Autocomplete session billing (free), so callers must reuse the same
// token across keystrokes and discard it after fetchPlaceDetails resolves.

export type PlacePrediction = { placeId: string; text: string };

export function searchPlaces(input: string, sessionToken: string) {
  return apiFetch<{ predictions: PlacePrediction[] }>(
    `/places/autocomplete?input=${encodeURIComponent(input)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
  );
}

export function fetchPlaceDetails(placeId: string, sessionToken: string) {
  return apiFetch<ConfirmedAddress>(
    `/places/details?placeId=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
  );
}
