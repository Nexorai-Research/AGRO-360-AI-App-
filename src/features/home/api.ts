import type { ApiClient } from '@/api/client';
import type { Amount } from '@/money';

// Shapes copied by hand from the backend: modules/reporting/src/application/dashboards.ts (ownerDashboard) and domain/tiles.ts.
// M13 UC-223 is DONE on the backend. The endpoint needs the permission `reports.sales`; tiles the user may not see are left out by the server.
export const OWNER_DASHBOARD_PERMISSION = 'reports.sales';

export type TileState = 'OK' | 'NO_ACTIVITY' | 'INSUFFICIENT_DATA';
export type TileUnit = 'money' | 'count' | 'percent';

export interface Tile {
  id: string;
  label: string;
  state: TileState;
  /** Decimal string, or null when the server could not answer. */
  value: Amount | null;
  unit: TileUnit;
  previous: Amount | null;
  changePct: string | null;
  period: { from: string; to: string };
  asOf: string;
  link: string;
  hint: string | null;
}

export interface Ranked {
  id: string | null;
  label: string;
  netSales: Amount;
}

export interface OwnerDashboard {
  period: string;
  from: string;
  to: string;
  asOf: string;
  tiles: Tile[];
  trend: { day: string; netSales: Amount }[];
  topProducts: Ranked[];
  topCustomers: Ranked[];
  branches: Ranked[];
}

/** The tiles shown on the phone, in this order. Other tiles the server sends (margin, purchases, cash...) are for later screens. */
export const HOME_TILE_IDS = [
  'net_sales',
  'bills',
  'receivables_outstanding',
  'receivables_overdue',
  'low_stock_count',
  'expiry_exposure',
  'stock_value',
] as const;

export const homeKey = (userId: string, period: string) => ['home', 'owner', userId, period] as const;

export function fetchOwnerDashboard(client: ApiClient, period = 'today', signal?: AbortSignal) {
  return client.get<OwnerDashboard>('/reports/dashboard/owner', { query: { period }, signal });
}

export function pickHomeTiles(d: OwnerDashboard): Tile[] {
  const byId = new Map(d.tiles.map((t) => [t.id, t]));
  return HOME_TILE_IDS.flatMap((id) => {
    const t = byId.get(id);
    return t ? [t] : [];
  });
}
