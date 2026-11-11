import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Notice, kit } from '@/ui/kit';
import { ActionForm, Denied, Loaded, Row, itemsOf, s, useBranchWarehouse, useCan, useFailureText, useGet, useOneShot, useRefresh, type FieldDef } from './kit';

export const ADJ_PERM = { view: 'inventory.view', create: 'inventory.adjust.create', approve: 'inventory.adjust.approve' } as const;
const REASONS = ['DAMAGE', 'LEAKAGE', 'THEFT', 'SAMPLE', 'FOUND', 'OTHER'];

interface Adj {
  id: string;
  number: string;
  adjustmentDate: string;
  reasonCode: string;
  totalValue: string | null;
  status: string;
}
interface BatchRow {
  id: string;
  skuId: string;
  skuCode: string;
  batchNo: string;
  onHand: string;
}

export default function AdjustmentsScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const failText = useFailureText();
  const [mode, setMode] = useState<null | 'new' | { reject: Adj }>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = can(ADJ_PERM.view);
  const list = useGet<{ items: Adj[] }>('/inventory/adjustments', { limit: 100 }, ok);
  const loadForm = mode === 'new';
  const batches = useGet<{ items: BatchRow[] }>('/inventory/batches', { withStockOnly: 'true', limit: 200 }, ok && loadForm);
  const { branches, warehouses } = useBranchWarehouse(ok && loadForm);
  const one = useOneShot(() => {
    setMsg(t('adjust.done'));
    setMode(null);
    refresh();
  });
  if (!ok) return <Denied text={t('adjust.denied')} />;

  const act = (a: Adj, what: 'submit' | 'approve' | 'cancel') =>
    one.run(`${a.id}:${what}`, (key) => client!.post(`/inventory/adjustments/${a.id}/${what}`, { idempotencyKey: key }));

  const newFields: FieldDef[] = [
    { name: 'branchId', label: t('adjust.branch'), kind: 'choice', required: true, options: branches.map((b) => ({ id: b.id, label: b.name })) },
    { name: 'warehouseId', label: t('adjust.warehouse'), kind: 'choice', required: true, options: warehouses.map((w) => ({ id: w.id, label: w.name })) },
    { name: 'reasonCode', label: t('adjust.reason'), kind: 'choice', required: true, options: REASONS.map((r) => ({ id: r, label: t(`adjust.reasons.${r}`) })) },
    {
      name: 'batch',
      label: t('adjust.batch'),
      kind: 'choice',
      required: true,
      options: itemsOf(batches.data).map((b) => ({ id: `${b.skuId}|${b.id}`, label: `${b.skuCode} / ${b.batchNo} (${b.onHand})` })),
    },
    { name: 'qtyDelta', label: t('adjust.qtyDelta'), kind: 'sqty', required: true },
    { name: 'unitCost', label: t('adjust.unitCost'), kind: 'money' },
    { name: 'remarks', label: t('adjust.remarks'), kind: 'text' },
  ];
  const rejecting = typeof mode === 'object' && mode !== null ? mode.reject : null;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('adjust.title')}
      </Text>
      <Text style={kit.sub}>{t('adjust.intro')}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {one.failure ? <Notice tone="error" text={failText(one.failure)} /> : null}
      {can(ADJ_PERM.create) && mode === null ? <Button label={t('adjust.new')} onPress={() => setMode('new')} /> : null}
      {mode === 'new' ? (
        <ActionForm
          title={t('adjust.new')}
          fields={newFields}
          submitLabel={t('adjust.save')}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMsg(t('adjust.saved'));
            setMode(null);
            refresh();
          }}
          send={(v, key) => {
            const [skuId, batchId] = String(v.batch).split('|');
            const line: Record<string, string> = { warehouseId: String(v.warehouseId), skuId: skuId!, batchId: batchId!, qtyDelta: String(v.qtyDelta).trim() };
            if (String(v.unitCost).trim()) line.unitCost = String(v.unitCost).trim();
            const body: Record<string, unknown> = { branchId: v.branchId, reasonCode: v.reasonCode, lines: [line] };
            if (String(v.remarks).trim()) body.remarks = String(v.remarks).trim();
            return client!.post('/inventory/adjustments', { body, idempotencyKey: key });
          }}
        />
      ) : null}
      {rejecting ? (
        <ActionForm
          title={t('adjust.rejectTitle', { number: rejecting.number })}
          fields={[{ name: 'note', label: t('adjust.note'), kind: 'text', required: true }]}
          submitLabel={t('adjust.reject')}
          onCancel={() => setMode(null)}
          onDone={() => {
            setMsg(t('adjust.done'));
            setMode(null);
            refresh();
          }}
          send={(v, key) => client!.post(`/inventory/adjustments/${rejecting.id}/reject`, { body: { note: String(v.note).trim() }, idempotencyKey: key })}
        />
      ) : null}
      <Loaded q={list} empty={t('adjust.empty')} isEmpty={itemsOf(list.data).length === 0} offlineKey="adjust.offline">
        {itemsOf(list.data).map((a) => (
          <Row
            key={a.id}
            title={`${a.number} · ${t(`adjust.status.${a.status}`, { defaultValue: a.status })}`}
            lines={[`${a.adjustmentDate} · ${t(`adjust.reasons.${a.reasonCode}`, { defaultValue: a.reasonCode })}`, a.totalValue === null ? '' : formatINR(a.totalValue)]}
          >
            {a.status === 'DRAFT' && can(ADJ_PERM.create) ? (
              <>
                <Button label={t('adjust.submit')} onPress={() => void act(a, 'submit')} disabled={one.busy} />
                <Button kind="ghost" label={t('adjust.cancel')} onPress={() => void act(a, 'cancel')} disabled={one.busy} />
              </>
            ) : null}
            {a.status === 'SUBMITTED' && can(ADJ_PERM.approve) ? (
              <>
                <Button label={t('adjust.approve')} onPress={() => void act(a, 'approve')} disabled={one.busy} />
                <Button kind="ghost" label={t('adjust.reject')} onPress={() => setMode({ reject: a })} />
              </>
            ) : null}
            {a.status === 'SUBMITTED' && can(ADJ_PERM.create) ? (
              <Button kind="ghost" label={t('adjust.withdraw')} onPress={() => void act(a, 'cancel')} disabled={one.busy} />
            ) : null}
          </Row>
        ))}
      </Loaded>
    </ScrollView>
  );
}
