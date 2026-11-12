import type { ApiClient } from '../../api/client';
import type { FarmView } from './more-api';

// Copied from modules/customer/src/domain/agri.ts and apps/api/src/agri.controller.ts. Needs customer.farm. Areas are decimal strings.
export const FARM_PERM = 'customer.farm';
export const OWNERSHIPS = ['OWNED', 'LEASED', 'SHARED'] as const;
export const PLOT_OWNERSHIPS = ['OWNED', 'LEASED'] as const;
export const AREA_UNITS = ['ACRE', 'HECTARE', 'GUNTHA'] as const;
export const SOIL_TYPES = [
  'ALLUVIAL',
  'BLACK',
  'RED',
  'LATERITE',
  'SANDY',
  'LOAMY',
  'CLAY',
  'OTHER',
] as const;
export const IRRIGATION_SOURCES = [
  'RAINFED',
  'WELL',
  'BOREWELL',
  'CANAL',
  'DRIP',
  'SPRINKLER',
  'RIVER_TANK',
  'OTHER',
] as const;

const base = (id: string) => `/customers/${encodeURIComponent(id)}`;
export interface FarmDraft {
  name: string;
  ownership: string;
  areaValue: string;
  areaUnit: string;
}
export interface PlotDraft {
  farmId: string;
  name: string;
  areaValue: string;
  areaUnit: string;
  soilType: string;
  irrigationSource: string;
}

/** Area: more than 0, at most 1000000, up to 4 decimals. */
export function validArea(v: string): boolean {
  const x = v.trim();
  return /^\d{1,7}(\.\d{1,4})?$/.test(x) && Number(x) > 0 && Number(x) <= 1000000;
}
export const validName = (v: string) => v.trim().length >= 1 && v.trim().length <= 80;
export const farmOk = (d: FarmDraft) =>
  validName(d.name) && (d.areaValue.trim() === '' || (validArea(d.areaValue) && d.areaUnit !== ''));
export const plotOk = (d: PlotDraft) =>
  d.farmId !== '' && validName(d.name) && validArea(d.areaValue) && d.areaUnit !== '';

export const farmBody = (d: FarmDraft) => ({
  name: d.name.trim(),
  ...(d.ownership ? { ownership: d.ownership } : {}),
  ...(d.areaValue.trim() ? { areaValue: d.areaValue.trim(), areaUnit: d.areaUnit } : {}),
});
export const plotBody = (d: PlotDraft) => ({
  farmId: d.farmId,
  name: d.name.trim(),
  areaValue: d.areaValue.trim(),
  areaUnit: d.areaUnit,
  ...(d.soilType ? { soilType: d.soilType } : {}),
  ...(d.irrigationSource ? { irrigationSource: d.irrigationSource } : {}),
});

export const createFarm = (c: ApiClient, id: string, body: Record<string, unknown>, idempotencyKey: string) =>
  c.post<FarmView>(`${base(id)}/farms`, { body, idempotencyKey });
export const createPlot = (c: ApiClient, id: string, body: Record<string, unknown>, idempotencyKey: string) =>
  c.post<unknown>(`${base(id)}/plots`, { body, idempotencyKey });
/** Archiving keeps the history; the farm version goes as If-Match. */
export const archiveFarm = (
  c: ApiClient,
  id: string,
  farm: { id: string; version: number },
  idempotencyKey: string,
) =>
  c.patch<FarmView>(`${base(id)}/farms/${encodeURIComponent(farm.id)}`, {
    body: { status: 'ARCHIVED' },
    version: farm.version,
    idempotencyKey,
  });
