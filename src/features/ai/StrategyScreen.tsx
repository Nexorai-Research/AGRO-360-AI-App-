import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  AI_STRATEGY,
  AP,
  akey,
  decideStrategy,
  fetchBranchRefs,
  fetchStrategies,
  generateStrategy,
  type StoredStrategy,
} from './api';
import { fetchHealthScore } from './api-g5';
import { rupee } from './fmt';

const NEED_DECIDE = 'ai.recommendation.decide';

function Card({
  st,
  busy,
  canDecide,
  onDecide,
}: {
  st: StoredStrategy;
  busy: boolean;
  canDecide: boolean;
  onDecide: (s: StoredStrategy, d: 'APPROVE' | 'REJECT', note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const c = st.content;
  return (
    <View style={k.card}>
      <Text style={k.name}>
        {t(`ai.st.kind.${st.kind}`)} · {st.periodLabel}
      </Text>
      <Text style={st.status === 'APPROVED' ? k.ok : st.status === 'REJECTED' ? k.warn : k.sub}>
        {t(`ai.st.status.${st.status}`)}
      </Text>
      <Text style={k.sub}>{c.notice}</Text>
      {c.findings.map((f) => (
        <View key={f.area + f.finding}>
          <Text style={k.name}>
            {t(`ai.st.area.${f.area}`)} · {f.status}
          </Text>
          <Text style={k.sub}>{f.finding}</Text>
          <Text style={k.sub}>{t('ai.st.action', { text: f.action })}</Text>
        </View>
      ))}
      {c.targets.map((x) => (
        <View key={x.name}>
          <Text style={k.ok}>
            {x.name}: {x.unit === 'rupees' ? rupee(x.value) : `${x.value}%`}
          </Text>
          <Text style={k.sub}>{x.formula}</Text>
        </View>
      ))}
      {c.roadmap?.milestones.map((m) => (
        <Text key={m.month} style={k.sub}>
          {t('ai.st.milestone', { n: m.month, amount: rupee(m.salesTarget) })}
        </Text>
      ))}
      {c.notAvailable.map((n) => (
        <Text key={n} style={k.sub}>
          {t('ai.st.skipped', { text: n })}
        </Text>
      ))}
      {st.decisionNote ? <Text style={k.sub}>{st.decisionNote}</Text> : null}
      {st.status === 'DRAFT' && canDecide ? (
        <>
          <Field label={t('ai.st.note')} value={note} onChange={setNote} />
          <Button label={t('ai.st.approve')} disabled={busy} onPress={() => onDecide(st, 'APPROVE', note)} />
          <Button
            kind="ghost"
            label={t('ai.st.reject')}
            disabled={busy || note.trim().length < 3}
            onPress={() => onDecide(st, 'REJECT', note)}
          />
        </>
      ) : null}
    </View>
  );
}

export default function StrategyScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const qc = useQueryClient();
  const kGen = useActionKey();
  const kDec = useActionKey();
  const [branch, setBranch] = useState('');
  const allowed = s.can(AP.digest) && s.can(AI_STRATEGY);
  const on = s.ready && allowed;
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: on,
    retry: retryNetworkOnce,
  });
  const cur = branch || branches.data?.[0]?.id || '';
  const list = useQuery({
    queryKey: akey(s.userId, 'strategies'),
    queryFn: ({ signal }) => fetchStrategies(s.client!, signal),
    enabled: on,
    retry: retryNetworkOnce,
  });
  const health = useQuery({
    queryKey: akey(s.userId, 'health', cur),
    queryFn: ({ signal }) => fetchHealthScore(s.client!, cur, signal),
    enabled: on && cur !== '',
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const refresh = () => void qc.invalidateQueries({ queryKey: akey(s.userId, 'strategies') });
  function gen(kind: 'MONTHLY' | 'QUARTERLY') {
    const body = { kind, ...(cur ? { branch: cur } : {}) };
    void s.act(
      t('ai.st.generated'),
      async () => {
        const r = await generateStrategy(s.client!, body, kGen.keyFor(JSON.stringify(body)));
        if (r.state !== 'OK') throw new Error(r.reason ?? 'insufficient');
      },
      () => (kGen.reset(), refresh()),
    );
  }
  function decide(st: StoredStrategy, decision: 'APPROVE' | 'REJECT', note: string) {
    // exactly the content that was on screen: the server refuses if it changed
    const body = { decision, payloadHash: st.payloadHash, ...(note.trim() ? { note: note.trim() } : {}) };
    void s.act(
      decision === 'APPROVE' ? t('ai.st.approved') : t('ai.st.rejected'),
      () => decideStrategy(s.client!, st.id, body, kDec.keyFor(`${st.id}|${JSON.stringify(body)}`)),
      () => (kDec.reset(), refresh()),
    );
  }
  const h = health.data;
  return (
    <ScrollView
      contentContainerStyle={k.page}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiStrategy') }} />
      <Text style={k.title}>{t('ai.st.title')}</Text>
      <Text style={k.sub}>{t('ai.st.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={cur}
          onChange={setBranch}
        />
      ) : null}
      {h ? (
        <View style={k.card}>
          <Text
            style={[
              k.name,
              { color: h.band === 'AT_RISK' ? colors.danger : h.band === 'WATCH' ? colors.warn : colors.ok },
            ]}
          >
            {h.score === null ? t('ai.st.noScore') : t('ai.st.score', { n: h.score })}
          </Text>
          {!h.complete ? <Text style={k.sub}>{t('ai.st.partial')}</Text> : null}
          {h.components.map((c) => (
            <Text key={c.key} style={k.sub}>
              {c.label}: {c.available ? `${c.points}/${c.max}` : t('ai.st.notMeasured')}. {c.explanation}
            </Text>
          ))}
        </View>
      ) : null}
      <Button label={t('ai.st.genMonthly')} disabled={s.busy} onPress={() => gen('MONTHLY')} />
      <Button
        kind="ghost"
        label={t('ai.st.genQuarterly')}
        disabled={s.busy}
        onPress={() => gen('QUARTERLY')}
      />
      <Gate q={list} ns="ai" emptyKey="ai.st.none" isEmpty={(list.data ?? []).length === 0}>
        {(list.data ?? []).map((x) => (
          <Card key={x.id} st={x} busy={s.busy} canDecide={s.can(NEED_DECIDE)} onDecide={decide} />
        ))}
      </Gate>
    </ScrollView>
  );
}
