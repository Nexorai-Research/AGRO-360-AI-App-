import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage, type ErrorMessage } from '../../api/errors';
import { newId } from '../../device';
import { Button } from '../../ui/Button';
import { Chips } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';
import {
  AREA_UNITS,
  FARM_PERM,
  IRRIGATION_SOURCES,
  OWNERSHIPS,
  SOIL_TYPES,
  archiveFarm,
  createFarm,
  createPlot,
  farmBody,
  farmOk,
  plotBody,
  plotOk,
  type FarmDraft,
  type PlotDraft,
} from './farm-api';
import { fetchFarms } from './more-api';

const emptyFarm: FarmDraft = { name: '', ownership: 'OWNED', areaValue: '', areaUnit: 'ACRE' };
const emptyPlot: PlotDraft = {
  farmId: '',
  name: '',
  areaValue: '',
  areaUnit: 'ACRE',
  soilType: '',
  irrigationSource: '',
};

/** Add a farm, add a plot to a farm, archive a farm. Needs customer.farm. One Idempotency-Key per action, kept on a retry. */
export function FarmEditor({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const allowed = !me?.permissions || me.permissions.includes(FARM_PERM);
  const [mode, setMode] = useState<'farm' | 'plot' | 'archive' | null>(null);
  const [farm, setFarm] = useState<FarmDraft>(emptyFarm);
  const [plot, setPlot] = useState<PlotDraft>(emptyPlot);
  const [archiveId, setArchiveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [key, setKey] = useState<{ k: string; fp: string } | null>(null);
  const keyFor = (fp: string) => {
    if (key && key.fp === fp) return key.k;
    const k = newId();
    setKey({ k, fp });
    return k;
  };
  const farms = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'more', 'farms', customerId],
    queryFn: ({ signal }) => fetchFarms(client!, customerId, signal),
    enabled: mode !== null && client !== null,
  });
  if (!allowed) return null;
  const active = (farms.data ?? []).filter((f) => f.status === 'ACTIVE');

  const open = (m: 'farm' | 'plot' | 'archive') => {
    setMode(m);
    setMsg(null);
    setFailure(null);
    setKey(null);
    setFarm(emptyFarm);
    setPlot(emptyPlot);
    setArchiveId('');
  };
  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      setKey(null);
      setMsg(done);
      setMode(null);
      void qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const units = AREA_UNITS.map((u) => ({ id: u as string, label: t(`farm.unit.${u}`) }));
  const input = (label: string, value: string, on: (v: string) => void, num = false) => (
    <TextInput
      value={value}
      onChangeText={on}
      keyboardType={num ? 'decimal-pad' : 'default'}
      placeholder={label}
      accessibilityLabel={label}
      style={s.input}
    />
  );

  return (
    <View style={s.card}>
      <Text style={s.title}>{t('farm.manage')}</Text>
      {msg ? (
        <Text style={s.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {mode === null ? (
        <View style={s.row}>
          <Button kind="ghost" label={t('farm.addFarm')} onPress={() => open('farm')} />
          <Button kind="ghost" label={t('farm.addPlot')} onPress={() => open('plot')} />
          <Button kind="ghost" label={t('farm.archive')} onPress={() => open('archive')} />
        </View>
      ) : (
        <View style={s.form}>
          {mode === 'farm' ? (
            <>
              {input(t('farm.name'), farm.name, (v) => setFarm({ ...farm, name: v }))}
              <Chips
                label={t('farm.ownership')}
                options={OWNERSHIPS.map((o) => ({ id: o as string, label: t(`customers.more.own.${o}`) }))}
                value={farm.ownership}
                onChange={(v) => setFarm({ ...farm, ownership: v })}
              />
              {input(t('farm.area'), farm.areaValue, (v) => setFarm({ ...farm, areaValue: v }), true)}
              <Chips
                label={t('farm.unitLabel')}
                options={units}
                value={farm.areaUnit}
                onChange={(v) => setFarm({ ...farm, areaUnit: v })}
              />
              {farm.areaValue !== '' && !farmOk(farm) ? (
                <Text style={s.error}>{t('farm.badArea')}</Text>
              ) : null}
            </>
          ) : null}
          {mode === 'plot' ? (
            <>
              <Chips
                label={t('farm.farm')}
                options={active.map((f) => ({ id: f.id, label: f.name }))}
                value={plot.farmId}
                onChange={(v) => setPlot({ ...plot, farmId: v })}
              />
              {input(t('farm.plotName'), plot.name, (v) => setPlot({ ...plot, name: v }))}
              {input(t('farm.area'), plot.areaValue, (v) => setPlot({ ...plot, areaValue: v }), true)}
              <Chips
                label={t('farm.unitLabel')}
                options={units}
                value={plot.areaUnit}
                onChange={(v) => setPlot({ ...plot, areaUnit: v })}
              />
              {plot.areaValue !== '' && !plotOk({ ...plot, farmId: 'x', name: 'x' }) ? (
                <Text style={s.error}>{t('farm.badArea')}</Text>
              ) : null}
              <Chips
                label={t('farm.soil')}
                options={SOIL_TYPES.map((o) => ({ id: o as string, label: t(`farm.soilType.${o}`) }))}
                value={plot.soilType}
                onChange={(v) => setPlot({ ...plot, soilType: v })}
              />
              <Chips
                label={t('farm.irrigation')}
                options={IRRIGATION_SOURCES.map((o) => ({ id: o as string, label: t(`farm.irr.${o}`) }))}
                value={plot.irrigationSource}
                onChange={(v) => setPlot({ ...plot, irrigationSource: v })}
              />
            </>
          ) : null}
          {mode === 'archive' ? (
            <Chips
              label={t('farm.farm')}
              options={active.map((f) => ({ id: f.id, label: f.name }))}
              value={archiveId}
              onChange={setArchiveId}
            />
          ) : null}
          {failure ? (
            <Text style={s.error} accessibilityRole="alert">
              {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
            </Text>
          ) : null}
          <Button
            label={t(
              mode === 'farm' ? 'farm.saveFarm' : mode === 'plot' ? 'farm.savePlot' : 'farm.archiveNow',
            )}
            disabled={
              busy || (mode === 'farm' ? !farmOk(farm) : mode === 'plot' ? !plotOk(plot) : archiveId === '')
            }
            onPress={() => {
              if (mode === 'farm') {
                const body = farmBody(farm);
                void run(
                  () => createFarm(client!, customerId, body, keyFor(`f|${JSON.stringify(body)}`)),
                  t('farm.farmSaved'),
                );
              } else if (mode === 'plot') {
                const body = plotBody(plot);
                void run(
                  () => createPlot(client!, customerId, body, keyFor(`p|${JSON.stringify(body)}`)),
                  t('farm.plotSaved'),
                );
              } else {
                const f = active.find((x) => x.id === archiveId);
                if (f)
                  void run(
                    () =>
                      archiveFarm(
                        client!,
                        customerId,
                        { id: f.id, version: f.version ?? 1 },
                        keyFor(`a|${f.id}|${f.version}`),
                      ),
                    t('farm.archived'),
                  );
              }
            }}
          />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setMode(null)} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    gap: 6,
  },
  title: { fontWeight: '700', color: colors.ink, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 8 },
  ok: { color: colors.ok, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.ink,
  },
});
