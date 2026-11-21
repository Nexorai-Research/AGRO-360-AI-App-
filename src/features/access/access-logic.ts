// Web parity phases 34 and 35: the Access control editor of the web (apps/web/src/pages/access.js). One editor is used twice: the platform
// ticks what a whole franchise may use, and a franchise admin ticks what one person may use. Pure rules, no screen code.

export interface CatalogueItem {
  code: string;
  module?: string;
  description?: string | null;
  enabled: boolean;
}

/** The menus, in the order of the web's header. */
export const MODULES = [
  'Administration',
  'Operations',
  'Setup',
  'Customers',
  'Accounts',
  'AI & intelligence',
  'Reports & analytics',
  'Staff & payroll',
  'Other features',
] as const;
export type Menu = (typeof MODULES)[number];

/** permission area (the first part of a code) -> [menu, page], the same table as the web. */
const AREAS: Record<string, [Menu, string]> = {
  identity: ['Administration', 'Users, roles and security'],
  product: ['Operations', 'Products'],
  pricing: ['Operations', 'Products'],
  inventory: ['Operations', 'Inventory'],
  purchase: ['Operations', 'Purchases'],
  sales: ['Operations', 'Sales and billing'],
  pos: ['Operations', 'Sales and billing'],
  receipt: ['Operations', 'Sales and billing'],
  agri: ['Operations', 'Agri advice'],
  integration: ['Setup', 'Integrations and jobs'],
  customer: ['Customers', 'Customers'],
  credit: ['Customers', 'Collections and credit'],
  crm: ['Customers', 'Complaints and engagement'],
  territory: ['Customers', 'Villages and territories'],
  comms: ['Customers', 'Messages'],
  privacy: ['Customers', 'Customer privacy'],
  finance: ['Accounts', 'Accounting'],
  compliance: ['Accounts', 'Compliance and tax'],
  ai: ['AI & intelligence', 'AI and intelligence'],
  reports: ['Reports & analytics', 'Reports'],
  hr: ['Staff & payroll', 'Staff and payroll'],
};
export function placeOf(code: string): [Menu, string] {
  const area = code.split('.')[0]!;
  if (area === 'org')
    return code.startsWith('org.document')
      ? ['Administration', 'Documents']
      : ['Setup', 'Settings and configuration'];
  return AREAS[area] ?? ['Other features', 'Other'];
}
/** "sales.invoice.cancel" -> "Invoice cancel". */
export function featureName(code: string): string {
  const s = code.split('.').slice(1).join(' ').replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** A key for the translated name of a menu or page ("Staff & payroll" -> "staff_payroll"). */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export type Tree = Map<string, Map<string, CatalogueItem[]>>;
/** Menu -> page -> the features, only those that can be switched (enabled). */
export function buildTree(catalogue: CatalogueItem[]): Tree {
  const tree: Tree = new Map(MODULES.map((m) => [m, new Map()]));
  for (const p of catalogue) {
    if (!p.enabled) continue;
    const [m, pg] = placeOf(p.code);
    const pages = tree.get(m)!;
    if (!pages.has(pg)) pages.set(pg, []);
    pages.get(pg)!.push(p);
  }
  return tree;
}
export const codesOf = (pages: Map<string, CatalogueItem[]>) => [...pages.values()].flat().map((p) => p.code);

/** How many of the codes are on, and whether that is all, or some. */
export function stateOf(codes: string[], draft: Set<string>) {
  const n = codes.filter((c) => draft.has(c)).length;
  return { n, all: n === codes.length && n > 0, some: n > 0 && n < codes.length };
}

/** Switch many features on or off; a locked feature is never changed. Returns a new set. */
export function setMany(
  draft: Set<string>,
  codes: string[],
  value: boolean,
  byCode: Map<string, CatalogueItem>,
  lockedWhy: (p: CatalogueItem) => string | null,
): Set<string> {
  const next = new Set(draft);
  for (const c of codes) {
    const p = byCode.get(c);
    if (!p || lockedWhy(p)) continue;
    if (value) next.add(c);
    else next.delete(c);
  }
  return next;
}
export function setOne(draft: Set<string>, code: string, value: boolean): Set<string> {
  const next = new Set(draft);
  if (value) next.add(code);
  else next.delete(code);
  return next;
}
/** What the save bar says: how many were turned on and off since the editor was drawn. */
export function changes(draft: Set<string>, was: Set<string>) {
  return {
    added: [...draft].filter((c) => !was.has(c)).length,
    removed: [...was].filter((c) => !draft.has(c)).length,
  };
}
export type Show = 'all' | 'on' | 'off';
/** The search box and the All / On / Off filter, like the web: the search reads the name, the description and the page. */
export function matches(p: CatalogueItem, page: string, needle: string, show: Show, draft: Set<string>) {
  if (show === 'on' && !draft.has(p.code)) return false;
  if (show === 'off' && draft.has(p.code)) return false;
  const n = needle.trim().toLowerCase();
  return !n || `${featureName(p.code)} ${p.description ?? ''} ${page}`.toLowerCase().includes(n);
}

// ---- one person (phase 35) --------------------------------------------------------------------------------------------------------------------
export interface UserAccess {
  userId: string;
  username: string;
  fullName: string;
  status: string;
  roles: { id?: string; name: string }[];
  fullAccess: boolean;
  /** What the person can use now (role, plus extras, minus what was taken away). */
  effective: string[];
  granted: string[];
  denied: string[];
  fromRole: string[];
}
/** The short note under a feature: where it comes from. */
export function originOf(s: UserAccess, code: string): 'extra' | 'taken' | 'role' | '' {
  return s.granted.includes(code)
    ? 'extra'
    : s.denied.includes(code)
      ? 'taken'
      : s.fromRole.includes(code)
        ? 'role'
        : '';
}
/** Why a feature cannot be changed for this person, or null; the reasons and their order are the web's. */
export function userLockedWhy(
  s: UserAccess,
  held: Set<string>,
  code: string,
): 'fullAccess' | 'deactivated' | 'cannotGive' | 'cannotTake' | null {
  if (s.fullAccess) return 'fullAccess';
  if (s.status === 'DEACTIVATED') return 'deactivated';
  if (!held.has(code) && !s.effective.includes(code)) return 'cannotGive';
  if (!held.has(code)) return 'cannotTake';
  return null;
}
