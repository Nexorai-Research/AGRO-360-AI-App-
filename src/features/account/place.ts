import type { TFunction } from 'i18next';

// Web parity phase 28: where a sign-in came from. The server answers a place name in `location` (and still the masked address in `ip`);
// the web shows the place and keeps the masked address as the hint (apps/web/src/ui.js place()).

export interface Placed {
  ip: string | null;
  location?: string | null;
}
/** The place name; "Not available" when there is an address but no place could be told; "-" when nothing was recorded. */
export const placeText = (t: TFunction, x: Placed) => x.location ?? (x.ip ? t('wp28.notAvailable') : '-');
/** The place with the masked address after it, for one line of a list: "Pune, Maharashtra, India (103.21.*.*)". */
export const placeInline = (t: TFunction, x: Placed) =>
  x.ip ? `${placeText(t, x)} (${x.ip})` : placeText(t, x);
/** One line: the place, then the masked address as the hint ("Location: Pune, Maharashtra, India · address 103.21.*.*"). */
export const placeLine = (t: TFunction, x: Placed) =>
  x.ip
    ? t('wp28.place', { place: placeText(t, x), ip: x.ip })
    : t('wp28.placeOnly', { place: placeText(t, x) });
/** A security event's user id as the web shows it: the franchise-prefixed reference (like 001-...) when the server sends one. */
export const eventUser = (
  e: { userRef?: string | null; userId: string | null },
  short: (id: string) => string,
) => e.userRef ?? (e.userId ? short(e.userId) : '-');
