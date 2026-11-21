// Web parity phase 26: what the web's platform console shows about a franchise owner's login (apps/web/src/pages/platform.js) and the
// state names of the GST codes. Pure helpers, no screen code.

/** GST state codes (the first two digits of a GSTIN) with their names, the same list as the web. */
export const STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};
/** "Maharashtra (27)"; a code not in the list reads "State (xx)"; nothing reads "-". */
export const stateName = (code: string | null | undefined) =>
  code ? `${STATES[code] ?? 'State'} (${code})` : '-';
export const stateOptions = Object.keys(STATES)
  .sort()
  .map((code) => ({ id: code, label: `${STATES[code]} (${code})` }));

export interface AdminLogin {
  loginId: string;
  /** ACTIVE, or DEACTIVATED_BY_OWNER when the owner switched their own account off. */
  state: string;
  /** TEMPORARY (the issued password is in use), CHANGED (the owner chose their own), NOT_STORED (the password is not kept). */
  passwordStatus: string;
  passwordIssuedAt?: string | null;
  passwordChangedAt?: string | null;
  stateChangedAt?: string | null;
}
/** The reply of a new franchise and of "Issue a new login". Shown once. */
export interface AdminCredentials {
  status: string;
  loginId?: string;
  temporaryPassword?: string;
  mustChangePassword?: boolean;
  reason?: string;
}

/** The one badge of an owner's account, in the web's order: switched off first, then what is known about the password. */
export function loginStateKey(
  a: AdminLogin | null | undefined,
): 'none' | 'off' | 'changed' | 'temporary' | 'active' {
  if (!a) return 'none';
  if (a.state === 'DEACTIVATED_BY_OWNER') return 'off';
  if (a.passwordStatus === 'CHANGED') return 'changed';
  if (a.passwordStatus === 'TEMPORARY') return 'temporary';
  return 'active';
}

/** The two lines the operator sends to the owner. */
export const loginMessage = (loginId: string, password: string) =>
  `Login ID: ${loginId}\nTemporary password: ${password}`;

/** What the web does with the reply of GET .../admin-login: the password to show, or the reason it cannot be shown. */
export type RevealResult =
  | { kind: 'none' }
  | { kind: 'changed' }
  | { kind: 'notKept' }
  | { kind: 'show'; loginId: string; password: string };
export function revealOutcome(r: { adminLogin: AdminLogin | null; password: string | null }): RevealResult {
  if (!r.adminLogin) return { kind: 'none' };
  if (r.password === null)
    return r.adminLogin.passwordStatus === 'CHANGED' ? { kind: 'changed' } : { kind: 'notKept' };
  return { kind: 'show', loginId: r.adminLogin.loginId, password: r.password };
}
