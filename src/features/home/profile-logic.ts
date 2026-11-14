/** Plain helpers for the profile card: no screen code here, so they are easy to test. */

/** Roles Keycloak adds to every user. They mean nothing to a shop owner, so they are shown apart. */
const isSystemRole = (r: string) => r === 'offline_access' || r === 'uma_authorization' || r.startsWith('default-roles-');

/** `franchise_admin` -> `Franchise admin`. */
export function prettyRole(role: string): string {
  const words = role.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function splitRoles(roles: string[]): { business: string[]; system: string[] } {
  return {
    business: roles.filter((r) => !isSystemRole(r)).map(prettyRole),
    system: roles.filter(isSystemRole),
  };
}

/** Up to two letters for the avatar. Falls back to a person mark when there is no name. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '')
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.length === 0 ? '?' : parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

const SHORT = new Set(['ai', 'hr', 'gst', 'pos', 'kyc', 'uma']);
/** `compliance` -> `Compliance`, `ai` -> `AI`. */
export function groupTitle(prefix: string): string {
  if (SHORT.has(prefix)) return prefix.toUpperCase();
  const w = prefix.replace(/[_-]+/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export interface PermissionGroup {
  prefix: string;
  title: string;
  items: string[];
}

/** Groups permission names (`module.thing.action`) by their first part, sorted, optionally keeping only those that contain `query`. */
export function groupPermissions(permissions: string[], query = ''): PermissionGroup[] {
  const q = query.trim().toLowerCase();
  const map = new Map<string, string[]>();
  for (const p of [...permissions].sort()) {
    if (q && !p.toLowerCase().includes(q)) continue;
    const prefix = p.split('.')[0] ?? p;
    map.set(prefix, [...(map.get(prefix) ?? []), p]);
  }
  return [...map.entries()].map(([prefix, items]) => ({ prefix, title: groupTitle(prefix), items }));
}
