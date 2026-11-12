import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import { retryNetworkOnce } from '../purchase/Gate';
import type { CartLine } from './cart';

export interface PickBatch {
  id: string;
  batchNo: string;
  expiryDate: string | null;
  available: string;
  status: string;
}

/** First to expire first; a batch without an expiry date goes last (the same order the server uses to pick by FEFO). */
export function fefoOrder(list: PickBatch[]): PickBatch[] {
  return list
    .slice()
    .sort((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'));
}
/** A batch other than the first in FEFO order is an override and needs a reason. */
export const needsFefoReason = (list: PickBatch[], id: string): boolean => {
  const first = fefoOrder(list)[0];
  return !!first && first.id !== id;
};
export const cropCaptureOk = (l: Pick<CartLine, 'crop' | 'targetPest' | 'dose'>): boolean => {
  const any = [l.crop, l.targetPest, l.dose].some((v) => (v ?? '').trim() !== '');
  return !any || [l.crop, l.targetPest, l.dose].every((v) => (v ?? '').trim() !== '');
};

/** Crop-protection capture and batch pick for one bill line. Nothing here prices anything: the server decides. */
export default function LineExtras({
  line,
  onPatch,
  canBatch,
}: {
  line: CartLine;
  onPatch: (p: Partial<CartLine>) => void;
  canBatch: boolean;
}) {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const [crop, setCrop] = useState(false);
  const [pick, setPick] = useState(false);

  const batches = useQuery({
    queryKey: ['pos', 'batches', me?.userId ?? '', line.skuId, line.warehouseId],
    queryFn: async ({ signal }) => {
      const r = await client!.get<{ items: PickBatch[] }>('/inventory/batches', {
        query: { product: line.skuId, warehouse: line.warehouseId, withStockOnly: 'true', limit: 50 },
        signal,
      });
      return r.items;
    },
    enabled: client !== null && pick,
    retry: retryNetworkOnce,
  });
  const list = fefoOrder(batches.data ?? []);
  const m = batches.error ? errorMessage(batches.error) : null;
  const chosen = line.batchId ? (batches.data ?? []).find((b) => b.id === line.batchId) : undefined;
  const override = !!line.batchId && needsFefoReason(batches.data ?? [], line.batchId);

  return (
    <View style={s.box}>
      <View style={s.row}>
        <Button kind="ghost" label={`${t('pos.cropToggle')} ${line.name}`} onPress={() => setCrop(!crop)} />
        {canBatch ? (
          <Button
            kind="ghost"
            label={`${t('pos.batchToggle')} ${line.name}`}
            onPress={() => setPick(!pick)}
          />
        ) : null}
      </View>
      {line.batchNo ? <Text style={s.sub}>{t('pos.batchPicked', { no: line.batchNo })}</Text> : null}
      {crop ? (
        <View style={s.gap}>
          <Text style={s.sub}>{t('pos.cropHint')}</Text>
          {(
            [
              ['crop', 'pos.crop'],
              ['targetPest', 'pos.pest'],
              ['dose', 'pos.dose'],
            ] as const
          ).map(([f, label]) => (
            <TextInput
              key={f}
              value={line[f] ?? ''}
              onChangeText={(v) => onPatch({ [f]: v })}
              accessibilityLabel={`${t(label)} ${line.name}`}
              placeholder={t(label)}
              style={s.input}
            />
          ))}
        </View>
      ) : null}
      {pick ? (
        <View style={s.gap}>
          {batches.isPending && batches.fetchStatus !== 'idle' ? (
            <Text style={s.sub}>{t('common.loading')}</Text>
          ) : null}
          {m ? (
            <Text style={s.error}>
              {t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })}
            </Text>
          ) : null}
          {batches.data && list.length === 0 ? <Text style={s.sub}>{t('pos.noBatches')}</Text> : null}
          {list.map((b, i) => (
            <Button
              key={b.id}
              kind={line.batchId === b.id ? 'primary' : 'ghost'}
              label={`${b.batchNo}${b.expiryDate ? ` · ${b.expiryDate}` : ''} · ${b.available}${i === 0 ? ` · ${t('pos.fefoFirst')}` : ''}`}
              onPress={() =>
                onPatch({
                  batchId: b.id,
                  batchNo: b.batchNo,
                  fefoOverrideReason: i === 0 ? '' : line.fefoOverrideReason,
                })
              }
            />
          ))}
          {line.batchId ? (
            <Button
              kind="ghost"
              label={t('pos.batchAuto')}
              onPress={() =>
                onPatch({ batchId: undefined, batchNo: undefined, fefoOverrideReason: undefined })
              }
            />
          ) : null}
          {override ? (
            <>
              <Text style={s.sub}>{t('pos.fefoWarn', { no: chosen?.batchNo ?? line.batchNo ?? '' })}</Text>
              <TextInput
                value={line.fefoOverrideReason ?? ''}
                onChangeText={(v) => onPatch({ fefoOverrideReason: v })}
                accessibilityLabel={`${t('pos.fefoReason')} ${line.name}`}
                placeholder={t('pos.fefoReason')}
                style={s.input}
              />
              {(line.fefoOverrideReason ?? '').trim().length < 3 ? (
                <Text style={s.error}>{t('pos.fefoReasonNeeded')}</Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap: { gap: 6 },
  sub: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
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
