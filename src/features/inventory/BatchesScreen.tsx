import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { dec } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { PERM, blockBatch, fetchBatches, ikey, type BatchStock } from './api';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

export default function BatchesScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);
  const ak = useActionKey();
  const [open, setOpen] = useState<{ id: string; release: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({ queryKey: ikey(userId, 'batches'), queryFn: ({ signal }) => fetchBatches(client!, signal), enabled: ready, retry: (n, e) => isNetwork(e) && n < 1 });

  async function submit(b: BatchStock, release: boolean) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await blockBatch(client!, b.id, release, reason.trim(), ak.keyFor(`${b.id}|${release}|${reason.trim()}`));
      ak.reset();
      setMsg(t(release ? 'batches.released' : 'batches.blocked', { batch: b.batchNo }));
      setOpen(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!can(PERM.view)) return <StateView state="denied" message={t('batches.denied')} />;
  if (list.isPending && list.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (list.error) {
    const m = errorMessage(list.error);
    return <StateView state={isNetwork(list.error) ? 'offline' : 'error'} message={isNetwork(list.error) ? t('batches.offline') : t(m.key, { ...m.params, correlationId: m.params.correlationId ?? '-' })} onRetry={() => void list.refetch()} />;
  }

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t('batches.title')}</Text>
      {msg ? <Notice tone="ok" text={msg} /> : null}
      {failure ? <Notice tone="error" text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })} /> : null}
      {(list.data ?? []).length === 0 ? <Text style={kit.sub}>{t('batches.empty')}</Text> : null}
      {(list.data ?? []).map((b) => (
        <Card key={b.id}>
          <Text style={kit.name}>{b.skuName} · {b.batchNo}</Text>
          <Text style={kit.sub}>{[b.status, b.expiryDate ? t('batches.expires', { date: b.expiryDate }) : null, t('batches.onHand', { qty: dec(b.onHand).toString() })].filter(Boolean).join(' · ')}</Text>
          {b.status === 'ACTIVE' && can(PERM.block) ? <Button kind="ghost" label={t('batches.block')} onPress={() => { ak.reset(); setReason(''); setOpen({ id: b.id, release: false }); }} /> : null}
          {b.status === 'QUARANTINED' && can(PERM.unblock) ? <Button kind="ghost" label={t('batches.release')} onPress={() => { ak.reset(); setReason(''); setOpen({ id: b.id, release: true }); }} /> : null}
          {open?.id === b.id ? (
            <>
              <Field label={t('adjust.rejectReason')} value={reason} onChange={setReason} />
              <Button label={t(open.release ? 'batches.release' : 'batches.block')} disabled={busy || !reason.trim()} onPress={() => void submit(b, open.release)} />
            </>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}
