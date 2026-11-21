import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Chips, Field, kit } from '@/ui/kit';
import { IRRIGATION_SOURCES } from './farm-api';
import { AREA_UNITS, SEASONS, fetchCrops } from './plans-api';

// Web parity phase 22 (pages/customers.js, "New customer: land & farm"): the land of a new customer is entered with the registration,
// so the profile opens with its acreage. It is saved right after the customer is created; a failure there never undoes the
// registration (the person is told to add it from the customer's Farms section).

export interface LandDraft {
  areaValue: string;
  areaUnit: string;
  plotName: string;
  irrigationSource: string;
  cropId: string;
  season: string;
}
export const emptyLand = (): LandDraft => ({
  areaValue: '',
  areaUnit: 'ACRE',
  plotName: 'Main plot',
  irrigationSource: '',
  cropId: '',
  season: 'KHARIF',
});
/** A farmer category asks for the land (the web's rule: a category named farmer, grower or kisan). */
export const isFarmerCategory = (name: string | undefined) => !!name && /farmer|grower|kisan/i.test(name);
export const hasLand = (l: LandDraft) => l.areaValue.trim() !== '' && Number(l.areaValue) > 0;
/** Empty is fine (skipped); typed, it must be a number above 0 with at most 2 decimals. */
export const landError = (l: LandDraft) =>
  l.areaValue.trim() === ''
    ? null
    : /^\d+(\.\d{1,2})?$/.test(l.areaValue.trim()) && Number(l.areaValue) > 0
      ? null
      : 'area';

/** The first plot, then (if a crop was chosen) its crop plan for this season, like the web. Returns false when the land could not be saved. */
export async function saveRegistrationLand(
  c: ApiClient,
  customerId: string,
  l: LandDraft,
  newKey: () => string,
  year = new Date().getFullYear(),
): Promise<boolean> {
  if (!hasLand(l)) return true;
  const base = `/customers/${encodeURIComponent(customerId)}`;
  try {
    const plot = await c.post<{ id?: string }>(`${base}/plots`, {
      body: {
        name: l.plotName.trim() || 'Main plot',
        areaValue: l.areaValue.trim(),
        areaUnit: l.areaUnit || 'ACRE',
        ...(l.irrigationSource ? { irrigationSource: l.irrigationSource } : {}),
      },
      idempotencyKey: newKey(),
    });
    if (l.cropId && plot?.id)
      await c.post(`${base}/crop-plans`, {
        body: {
          season: l.season || 'KHARIF',
          seasonYear: year,
          cropId: l.cropId,
          plotId: plot.id,
          areaValue: l.areaValue.trim(),
          areaUnit: l.areaUnit || 'ACRE',
        },
        idempotencyKey: newKey(),
      });
    return true;
  } catch {
    return false;
  }
}

export function RegisterLandFields({
  value,
  onChange,
  farmer,
  canCrop,
}: {
  value: LandDraft;
  onChange: (v: LandDraft) => void;
  farmer: boolean;
  canCrop: boolean;
}) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const crops = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'crops'],
    queryFn: ({ signal }) => fetchCrops(client!, signal),
    enabled: client !== null && canCrop,
    staleTime: 5 * 60_000,
  });
  const set = (k: keyof LandDraft) => (v: string) => onChange({ ...value, [k]: v });
  const err = landError(value);
  return (
    <View style={{ gap: 8 }}>
      <Text style={kit.name}>{t('wp22.title')}</Text>
      <Text style={kit.sub}>{t(farmer ? 'wp22.farmerHint' : 'wp22.hint')}</Text>
      <Field
        label={t('wp22.area')}
        value={value.areaValue}
        onChange={set('areaValue')}
        keyboard="decimal-pad"
        error={err ? t('wp22.v.area') : null}
      />
      <Chips
        label={t('wp22.unit')}
        options={AREA_UNITS.map((u) => ({ id: u, label: t(`wp17.l.unit.${u}`) }))}
        value={value.areaUnit as (typeof AREA_UNITS)[number]}
        onChange={set('areaUnit')}
      />
      <Field label={t('wp22.plotName')} value={value.plotName} onChange={set('plotName')} />
      <Chips
        label={t('wp22.irrigation')}
        options={[
          { id: '', label: '-' },
          ...IRRIGATION_SOURCES.map((x) => ({ id: x as string, label: x.toLowerCase().replace('_', ' ') })),
        ]}
        value={value.irrigationSource}
        onChange={set('irrigationSource')}
      />
      {(crops.data ?? []).length > 0 ? (
        <>
          <Chips
            label={t('wp22.crop')}
            options={[
              { id: '', label: '-' },
              ...(crops.data ?? []).map((c) => ({ id: c.id, label: c.name })),
            ]}
            value={value.cropId}
            onChange={set('cropId')}
          />
          {value.cropId ? (
            <Chips
              label={t('wp22.season')}
              options={SEASONS.map((s) => ({
                id: s as string,
                label: t(`customers.plans.season.${s}`, { defaultValue: s }),
              }))}
              value={value.season}
              onChange={set('season')}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
