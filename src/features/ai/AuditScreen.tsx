import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { P, akey, fetchAuditLog, fetchAuditSummary } from './api-g67';

export default function AuditScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [outcome, setOutcome] = useState('');
  const allowed = s.can(P.audit);
  const sum = useQuery({
    queryKey: akey(s.userId, 'audit-sum'),
    queryFn: ({ signal }) => fetchAuditSummary(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  const log = useQuery({
    queryKey: akey(s.userId, 'audit', outcome),
    queryFn: ({ signal }) => fetchAuditLog(s.client!, { outcome }, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const rows = log.data ?? [];
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={
        <RefreshControl
          refreshing={log.isRefetching}
          onRefresh={() => (void log.refetch(), void sum.refetch())}
        />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiAudit') }} />
      <Text style={k.title}>{t('ai.au.title')}</Text>
      <Text style={k.sub}>{t('ai.au.note')}</Text>
      {(sum.data ?? []).slice(0, 8).map((x, i) => (
        <Text key={i} style={k.sub}>
          {x.tool} · {x.model ?? '-'} · {x.outcome}: {x.calls}
        </Text>
      ))}
      <Chips
        options={['', 'OK', 'DENIED', 'INVALID', 'ERROR', 'TIMEOUT'].map((x) => ({
          value: x,
          label: x || t('ai.au.all'),
        }))}
        value={outcome}
        onChange={setOutcome}
      />
      <Gate q={log} ns="ai" emptyKey="ai.au.none" isEmpty={rows.length === 0}>
        {rows.map((r) => (
          <View key={r.id} style={k.card}>
            <Text style={k.name}>
              {r.tool} · {r.outcome}
            </Text>
            <Text style={k.sub}>{r.summary ?? '-'}</Text>
            <Text style={k.sub}>
              {r.created_at.slice(0, 16).replace('T', ' ')} · {r.model_version ?? '-'}
            </Text>
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}
