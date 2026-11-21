import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/api/errors';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Card, Line, Notice, kit, useCan, useFailureText } from '../hr/kit';
import { cachedProductCount, offlineOps, prepareOffline, readiness, syncNow } from './offline';
import { offlineKey } from './useOfflineSync';
import type { Op } from './journal';

export const SYNC_PERM = 'integration.sync.use';

const when = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace('T', ' ') : '-');

function OpCard({ o }: { o: Op }) {
  const { t } = useTranslation();
  const booked = o.state === 'APPLIED' ? (o.result as { number?: string; total?: string } | null) : null;
  return (
    <Card>
      <Text style={kit.name}>{o.localNumber}</Text>
      <Text style={kit.sub}>
        {when(o.createdAt)} · {t(`wp14.st.${o.state}`)}
      </Text>
      {o.note?.customerName ? <Line label={t('wp14.customer')} value={o.note.customerName} /> : null}
      {o.note?.lines ? <Line label={t('wp14.lines')} value={String(o.note.lines)} /> : null}
      {o.note?.estimate ? <Line label={t('wp14.estimate')} value={formatINR(o.note.estimate)} /> : null}
      {booked?.number ? <Line label={t('wp14.number')} value={booked.number} strong /> : null}
      {booked?.total ? <Line label={t('wp14.total')} value={formatINR(booked.total)} strong /> : null}
      {o.state === 'CONFLICT' ? (
        <Notice tone="warn" text={t('wp14.conflict', { message: o.error?.message ?? '' })} />
      ) : null}
      {o.state === 'REJECTED' ? (
        <Notice
          tone="error"
          text={t('wp14.rejected', { message: o.error?.message ?? o.error?.code ?? '' })}
        />
      ) : null}
      {o.attempts > 0 && (o.state === 'PENDING' || o.state === 'SENDING') ? (
        <Text style={kit.sub}>{t('wp14.attempts', { count: o.attempts })}</Text>
      ) : null}
    </Card>
  );
}

/** Bills saved without network, whether they are booked, and getting the phone ready to sell offline. */
export function OfflineBillsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const fail = useFailureText();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: offlineKey(userId),
    queryFn: async () => ({
      ops: await offlineOps(userId),
      ready: await readiness(userId),
      products: await cachedProductCount(userId),
    }),
    enabled: !!userId,
  });
  if (!can(SYNC_PERM) || !can('sales.pos.use'))
    return <StateView state="denied" message={t('wp14.denied')} />;
  const refresh = () => void qc.invalidateQueries({ queryKey: offlineKey(userId) });
  const d = q.data;
  const waiting = (d?.ops ?? []).filter((o) => o.state === 'PENDING' || o.state === 'SENDING').length;
  const review = (d?.ops ?? []).filter((o) => o.state === 'CONFLICT').length;

  const run = async (f: () => Promise<void>) => {
    if (busy || !client) return;
    setBusy(true);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg({
        tone: 'error',
        text: e instanceof ApiError && e.code === 'UPGRADE_REQUIRED' ? t('wp14.upgrade') : fail(e),
      });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">
        {t('wp14.title')}
      </Text>
      <Text style={kit.sub}>{t('wp14.hint')}</Text>
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      {d ? (
        <>
          <Card>
            <Text style={kit.name}>{t('wp14.readyTitle')}</Text>
            {d.ready.ok ? (
              <Notice
                tone="ok"
                text={t('wp14.ready', { hours: d.ready.hoursLeft, until: when(d.ready.expiresAt) })}
              />
            ) : (
              <Notice tone="warn" text={t(`wp14.notReady.${d.ready.reason}`)} />
            )}
            <Line
              label={t('wp14.products')}
              value={
                d.products.count
                  ? t('wp14.productsLine', { count: d.products.count, at: when(d.products.at) })
                  : t('wp14.noProducts')
              }
            />
            <Button
              label={busy ? t('common.loading') : t('wp14.prepare')}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const r = await prepareOffline(client!, userId);
                  setMsg({ tone: 'ok', text: t('wp14.prepared', { count: r.products }) });
                })
              }
            />
          </Card>
          <Card>
            <Line label={t('wp14.waiting')} value={String(waiting)} strong />
            <Line label={t('wp14.toReview')} value={String(review)} />
            <Button
              kind="ghost"
              label={t('wp14.sendNow')}
              disabled={busy || waiting === 0}
              onPress={() =>
                void run(async () => {
                  const out = await syncNow(client!, userId, true);
                  if (!out) return;
                  setMsg(
                    out.offline
                      ? { tone: 'warn', text: t('wp14.stillOffline') }
                      : {
                          tone: 'ok',
                          text: t('wp14.sent', {
                            applied: out.applied,
                            conflicts: out.conflicts,
                            rejected: out.rejected,
                          }),
                        },
                  );
                })
              }
            />
          </Card>
          {d.ops.length === 0 ? <StateView state="empty" message={t('wp14.none')} /> : null}
          <View style={{ gap: 10 }}>
            {d.ops.map((o) => (
              <OpCard key={o.clientOpId} o={o} />
            ))}
          </View>
        </>
      ) : (
        <StateView state="loading" />
      )}
    </ScrollView>
  );
}
