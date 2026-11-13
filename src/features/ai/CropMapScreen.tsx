import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, fetchBranchRefs } from './api';
import { fetchHeatmap, fetchShortage } from './api-g4';
import { units } from './fmt';

type Tab = 'map' | 'short';
const LEADS = [0, 7, 14, 21];

export default function CropMapScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [tab, setTab] = useState<Tab>('map');
  const [branch, setBranch] = useState('');
  const [lead, setLead] = useState(7);
  const ok = s.ready && s.can(AP.digest);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const heat = useQuery({
    queryKey: akey(s.userId, 'heat', branch),
    queryFn: ({ signal }) => fetchHeatmap(s.client!, branch, signal),
    enabled: ok && tab === 'map',
    retry: retryNetworkOnce,
  });
  const short = useQuery({
    queryKey: akey(s.userId, 'short', `${branch}|${lead}`),
    queryFn: ({ signal }) => fetchShortage(s.client!, { branch, horizonDays: 30, leadDays: lead }, signal),
    enabled: ok && tab === 'short',
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const act = tab === 'map' ? heat : short;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={act.isRefetching} onRefresh={() => void act.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiCropMap') }} />
      <Text style={k.title}>{t('ai.cm.title')}</Text>
      <Chips
        options={[
          { value: 'map', label: t('ai.cm.tab.map') },
          { value: 'short', label: t('ai.cm.tab.short') },
        ]}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
      />
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={[
            { value: '', label: t('ai.allBranches') },
            ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={branch}
          onChange={setBranch}
        />
      ) : null}
      {tab === 'map' ? (
        <Gate q={heat} ns="ai" emptyKey="ai.cm.none" isEmpty={false}>
          {heat.data && heat.data.state !== 'OK' ? (
            <Text style={k.warn}>{t('ai.fc.insufficient', { reason: heat.data.reason ?? '-' })}</Text>
          ) : null}
          {(heat.data?.rows ?? []).map((r) => (
            <View key={r.village} style={k.card}>
              <Text style={k.name}>
                {r.village} · {t('ai.cm.acres', { n: units(r.totalAcres) })}
              </Text>
              {r.cells.map((c) => (
                <View key={c.crop} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: Math.max(6, Math.round(c.intensity * 120)),
                      height: 10,
                      backgroundColor: colors.ok,
                      borderRadius: 3,
                    }}
                  />
                  <Text style={k.sub}>
                    {c.crop}: {t('ai.cm.acres', { n: units(c.acres) })}
                  </Text>
                </View>
              ))}
            </View>
          ))}
          {heat.data ? <Text style={k.sub}>{heat.data.rule}</Text> : null}
        </Gate>
      ) : (
        <>
          <Chips
            options={LEADS.map((n) => ({ value: String(n), label: t('ai.cm.lead', { n }) }))}
            value={String(lead)}
            onChange={(v) => setLead(Number(v))}
          />
          <Gate q={short} ns="ai" emptyKey="ai.cm.none" isEmpty={false}>
            {short.data?.state === 'NO_FACTORS' ? <Text style={k.warn}>{t('ai.cm.noFactors')}</Text> : null}
            {short.data && short.data.state === 'INSUFFICIENT_DATA' ? (
              <Text style={k.warn}>{t('ai.fc.insufficient', { reason: short.data.reason ?? '-' })}</Text>
            ) : null}
            {(short.data?.rows ?? []).map((r, i) => (
              <View key={`${r.product}-${r.branch}-${i}`} style={k.card}>
                <Text style={k.name}>
                  {r.product ?? '-'} · {r.branch ?? '-'}
                </Text>
                <Text style={r.status === 'SHORT' ? k.warn : k.ok}>
                  {r.status === 'SHORT' ? t('ai.cm.short', { n: units(r.gap) }) : t('ai.cm.covered')}
                </Text>
                <Text style={k.sub}>
                  {t('ai.cm.figures', {
                    need: units(r.demand),
                    have: units(r.onHand),
                    order: units(r.onOrder),
                  })}
                </Text>
                <Text style={k.sub}>{r.explanation}</Text>
              </View>
            ))}
            {short.data?.unassignedPlans ? (
              <Text style={k.sub}>{t('ai.cm.unassigned', { n: short.data.unassignedPlans })}</Text>
            ) : null}
          </Gate>
        </>
      )}
    </ScrollView>
  );
}
