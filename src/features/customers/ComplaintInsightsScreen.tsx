import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { Card, Notice, kit, useActionKey } from '@/ui/kit';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { useAction } from '../hr/kit';
import { CRMPERM, fetchTrends, slaSweep } from './crm-admin-api';
import { Panel, Row, s, useCrm } from './crm-kit';

const label = (x: string) => x.replace(/_/g, ' ').toLowerCase();

export default function ComplaintInsightsScreen() {
  const { t } = useTranslation();
  const { client, can, reload } = useCrm();
  const keys = useActionKey();
  const act = useAction(keys);
  const [note, setNote] = useState<string | null>(null);
  const ok = can(CRMPERM.complaintResolve);
  if (!ok) return <StateView state="denied" message={t('cus.denied')} />;
  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Stack.Screen options={{ headerShown: true, title: t('cus.insights.title') }} />
      <Text style={kit.title}>{t('cus.insights.title')}</Text>
      <Button
        label={act.busy ? t('common.loading') : t('cus.insights.sweep')}
        disabled={act.busy}
        onPress={() =>
          void act.run(
            async () => {
              const r = await slaSweep(client!, keys.keyFor('sweep'));
              setNote(t('cus.insights.escalated', { count: r?.escalated ?? 0 }));
            },
            t('cus.saved'),
            reload,
          )
        }
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {note ? <Notice tone="ok" text={note} /> : null}
      <Panel name={['trends']} load={fetchTrends}>
        {(r) => {
          const cats = Object.entries(r.byCategory ?? {});
          const sev = Object.entries(r.bySeverity ?? {});
          return (
            <View style={{ gap: 10 }}>
              <Card>
                <Row
                  title={t('cus.insights.summary')}
                  lines={[
                    t('cus.insights.counts', { total: r.total, open: r.open, late: r.breached }),
                    r.avgResolutionHours === null
                      ? null
                      : t('cus.insights.avgHours', { hours: r.avgResolutionHours }),
                    r.avgRating === null ? null : t('cus.insights.avgRating', { rating: r.avgRating }),
                  ]}
                />
              </Card>
              <Text style={s.h}>{t('cus.insights.byBatch')}</Text>
              {(r.byBatch ?? []).length === 0 ? (
                <StateView state="empty" message={t('cus.insights.noBatch')} />
              ) : null}
              {(r.byBatch ?? []).slice(0, 30).map((b) => (
                <Card key={b.batchNo}>
                  <Row title={b.batchNo} lines={[t('cus.insights.complaints', { count: b.complaints })]} />
                </Card>
              ))}
              <Text style={s.h}>{t('cus.insights.byCategory')}</Text>
              {cats.length === 0 ? <StateView state="empty" message={t('cus.insights.none')} /> : null}
              {cats.map(([k, n]) => (
                <Card key={k}>
                  <Row title={label(k)} lines={[t('cus.insights.complaints', { count: n })]} />
                </Card>
              ))}
              <Text style={s.h}>{t('cus.insights.bySeverity')}</Text>
              {sev.length === 0 ? <StateView state="empty" message={t('cus.insights.none')} /> : null}
              {sev.map(([k, n]) => (
                <Card key={k}>
                  <Row title={label(k)} lines={[t('cus.insights.complaints', { count: n })]} />
                </Card>
              ))}
            </View>
          );
        }}
      </Panel>
    </ScrollView>
  );
}
