import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Notice, kit } from '@/ui/kit';
import { ActionForm, Denied, Loaded, Row, Tabs, itemsOf, s, useCan, useGet, useRefresh, type FieldDef } from './kit';

export const BATCH_PERM = {
  view: 'inventory.view',
  manage: 'inventory.batch.manage',
  unblock: 'inventory.batch.unblock',
  approve: 'inventory.batch.extend.approve',
} as const;

export interface BatchRow {
  id: string;
  skuCode: string;
  skuName: string;
  batchNo: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  onHand: string;
  valueAtRisk: string | null;
  status: string;
}
export interface Extension {
  id: string;
  skuCode: string;
  batchNo: string;
  newExpiry: string;
  reason: string;
  documentRef: string;
}
type Tab = 'near' | 'expired' | 'ext';
type Act =
  | { kind: 'block' | 'release' | 'extend'; batch: BatchRow }
  | { kind: 'approve' | 'reject'; ext: Extension };

export default function BatchesScreen() {
  const { t } = useTranslation();
  const { client } = useAuth();
  const can = useCan();
  const refresh = useRefresh();
  const [tab, setTab] = useState<Tab>('near');
  const [act, setAct] = useState<Act | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = can(BATCH_PERM.view);
  const near = useGet<{ items: BatchRow[] }>('/inventory/batches', { expiringWithinDays: 60, limit: 100 }, ok && tab === 'near');
  const expired = useGet<{ items: BatchRow[] }>('/inventory/batches', { expired: 'true', limit: 100 }, ok && tab === 'expired');
  const exts = useGet<{ items: Extension[] }>('/inventory/batch-extensions', { status: 'PENDING' }, ok && tab === 'ext');
  if (!ok) return <Denied text={t('batches.denied')} />;

  const q = tab === 'near' ? near : tab === 'expired' ? expired : exts;
  const rows = itemsOf(q.data as { items: unknown[] } | undefined);

  const fieldsOf = (a: Act): FieldDef[] =>
    a.kind === 'extend'
      ? [
          { name: 'newExpiry', label: t('batches.newExpiry'), kind: 'date', required: true },
          { name: 'reason', label: t('batches.reason'), kind: 'text', required: true },
          { name: 'documentRef', label: t('batches.documentRef'), kind: 'text', required: true },
        ]
      : a.kind === 'approve' || a.kind === 'reject'
        ? [{ name: 'note', label: t('batches.note'), kind: 'text', required: true }]
        : [{ name: 'reason', label: t('batches.reason'), kind: 'text', required: true }];

  function send(a: Act, v: Record<string, string | boolean>, key: string) {
    const trim = (k: string) => String(v[k]).trim();
    if ('ext' in a)
      return client!.post(`/inventory/batch-extensions/${a.ext.id}/${a.kind}`, { body: { note: trim('note') }, idempotencyKey: key });
    const path = `/inventory/batches/${a.batch.id}`;
    if (a.kind === 'extend')
      return client!.post(`${path}/extend`, { body: { newExpiry: trim('newExpiry'), reason: trim('reason'), documentRef: trim('documentRef') }, idempotencyKey: key });
    return client!.post(`${path}/${a.kind === 'block' ? 'block' : 'unblock'}`, { body: { reason: trim('reason') }, idempotencyKey: key });
  }

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('batches.title')}
      </Text>
      <Tabs
        label={t('batches.title')}
        value={tab}
        onChange={(x) => {
          setTab(x);
          setAct(null);
        }}
        tabs={[
          { id: 'near', label: t('batches.near') },
          { id: 'expired', label: t('batches.expired') },
          { id: 'ext', label: t('batches.extensions') },
        ]}
      />
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {act ? (
        <ActionForm
          key={`${act.kind}:${'ext' in act ? act.ext.id : act.batch.id}`}
          title={t(`batches.act.${act.kind}`)}
          hint={act.kind === 'extend' ? t('batches.extendHint') : undefined}
          fields={fieldsOf(act)}
          submitLabel={t(`batches.act.${act.kind}`)}
          onCancel={() => setAct(null)}
          onDone={() => {
            setMsg(t('batches.done'));
            setAct(null);
            refresh();
          }}
          send={(v, key) => send(act, v, key)}
        />
      ) : null}
      <Loaded q={q} empty={t(`batches.empty.${tab}`)} isEmpty={rows.length === 0} offlineKey="batches.offline">
        {tab === 'ext'
          ? itemsOf(exts.data).map((x) => (
              <Row key={x.id} title={`${x.skuCode} / ${x.batchNo}`} lines={[t('batches.extLine', { date: x.newExpiry }), x.reason, x.documentRef]}>
                {can(BATCH_PERM.approve) ? (
                  <>
                    <Button label={t('batches.act.approve')} onPress={() => setAct({ kind: 'approve', ext: x })} />
                    <Button kind="ghost" label={t('batches.act.reject')} onPress={() => setAct({ kind: 'reject', ext: x })} />
                  </>
                ) : null}
              </Row>
            ))
          : itemsOf(tab === 'near' ? near.data : expired.data).map((b) => (
              <Row
                key={b.id}
                title={`${b.skuName} · ${b.batchNo}`}
                lines={[
                  `${b.expiryDate ?? '-'}${b.daysToExpiry === null ? '' : ` (${t('batches.days', { count: b.daysToExpiry })})`}`,
                  t('batches.onHand', { qty: b.onHand }),
                  b.valueAtRisk === null ? t('batches.valueHidden') : t('batches.atRisk', { amount: formatINR(b.valueAtRisk) }),
                  t(`batches.status.${b.status}`, { defaultValue: b.status }),
                ]}
              >
                {b.status === 'ACTIVE' && can(BATCH_PERM.manage) ? <Button kind="ghost" label={t('batches.act.block')} onPress={() => setAct({ kind: 'block', batch: b })} /> : null}
                {b.status === 'QUARANTINED' && can(BATCH_PERM.unblock) ? <Button kind="ghost" label={t('batches.act.release')} onPress={() => setAct({ kind: 'release', batch: b })} /> : null}
                {['EXPIRED', 'ACTIVE', 'QUARANTINED'].includes(b.status) && can(BATCH_PERM.manage) ? (
                  <Button kind="ghost" label={t('batches.act.extend')} onPress={() => setAct({ kind: 'extend', batch: b })} />
                ) : null}
              </Row>
            ))}
      </Loaded>
    </ScrollView>
  );
}
