import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  P,
  akey,
  fetchActionSetting,
  fetchPolicies,
  saveActionSetting,
  savePolicy,
  type Policy,
  type PolicyEdit,
} from './api-g67';

/** '' means "no limit" (null); otherwise a number above 0. Returns undefined when the text is not valid. */
export const limitOf = (v: string): number | null | undefined => {
  const x = v.trim();
  if (x === '') return null;
  if (!/^\d+(\.\d+)?$/.test(x)) return undefined;
  const n = Number(x);
  return n > 0 && n <= 1_000_000_000 ? n : undefined;
};
export const ttlOf = (v: string): number | undefined =>
  /^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 15 ? Number(v) : undefined;

function PolicyCard({ p, onSaved }: { p: Policy; onSaved: () => void }) {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [distinct, setDistinct] = useState(p.requireDistinctActor);
  const [second, setSecond] = useState(p.requireSecondApprover);
  const [ttl, setTtl] = useState(String(p.ttlMinutes));
  const [owner, setOwner] = useState(p.ownerAboveQty === null ? '' : String(p.ownerAboveQty));
  const [secondAbove, setSecondAbove] = useState(
    p.secondApproverAbove === null ? '' : String(p.secondApproverAbove),
  );
  const [tried, setTried] = useState(false);
  const ownerV = limitOf(owner);
  const secondV = limitOf(secondAbove);
  const ttlV = ttlOf(ttl);
  const save = () => {
    setTried(true);
    if (ttlV === undefined || ownerV === undefined || secondV === undefined) return;
    const body: PolicyEdit = {
      requireDistinctActor: distinct,
      requireSecondApprover: second,
      ttlMinutes: ttlV,
      ownerAboveQty: ownerV,
      secondApproverAbove: secondV,
    };
    void s.act(
      t('ai.po.saved'),
      () => savePolicy(s.client!, p.action, p.version, body, key.keyFor(JSON.stringify(body))),
      () => (key.reset(), setTried(false), onSaved()),
    );
  };
  const onOff = [
    { value: 'yes', label: t('ai.po.yes') },
    { value: 'no', label: t('ai.po.no') },
  ];
  return (
    <View style={k.card}>
      <Text style={k.name}>{t(`ai.po.action.${p.action}`, { defaultValue: p.action })}</Text>
      {p.isDefault ? <Text style={k.sub}>{t('ai.po.default')}</Text> : null}
      <Text style={k.sub}>{t('ai.po.distinct')}</Text>
      <Chips options={onOff} value={distinct ? 'yes' : 'no'} onChange={(v) => setDistinct(v === 'yes')} />
      <Text style={k.sub}>{t('ai.po.second')}</Text>
      <Chips options={onOff} value={second ? 'yes' : 'no'} onChange={(v) => setSecond(v === 'yes')} />
      <Field
        label={t('ai.po.ttl')}
        value={ttl}
        onChange={setTtl}
        keyboard="numeric"
        error={tried && ttlV === undefined ? t('ai.po.ttlBad') : null}
      />
      <Field
        label={t('ai.po.ownerAbove')}
        value={owner}
        onChange={setOwner}
        keyboard="decimal-pad"
        error={tried && ownerV === undefined ? t('ai.po.limitBad') : null}
      />
      <Field
        label={t('ai.po.secondAbove')}
        value={secondAbove}
        onChange={setSecondAbove}
        keyboard="decimal-pad"
        error={tried && secondV === undefined ? t('ai.po.limitBad') : null}
      />
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Button label={t('ai.po.save')} disabled={s.busy} onPress={save} />
    </View>
  );
}

export default function PoliciesScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const qc = useQueryClient();
  const kSet = useActionKey();
  const [budget, setBudget] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const allowed = s.can(P.govern);
  const pq = useQuery({
    queryKey: akey(s.userId, 'policies'),
    queryFn: ({ signal }) => fetchPolicies(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  const sq = useQuery({
    queryKey: akey(s.userId, 'action-setting'),
    queryFn: ({ signal }) => fetchActionSetting(s.client!, signal),
    enabled: s.ready && allowed,
    retry: retryNetworkOnce,
  });
  if (!allowed) return <StateView state="denied" message={t('ai.denied')} />;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['ai'] });
  const cur = sq.data;
  const bText = budget ?? (cur?.reorderBudget == null ? '' : String(cur.reorderBudget));
  const tText = transfer ?? (cur?.transferCostPerUnit == null ? '' : String(cur.transferCostPerUnit));
  const bV = limitOf(bText);
  const tV = limitOf(tText);
  const saveSettings = () => {
    setTried(true);
    if (!cur || bV === undefined || tV === undefined) return;
    const body = { reorderBudget: bV, transferCostPerUnit: tV };
    void s.act(
      t('ai.po.saved'),
      () => saveActionSetting(s.client!, cur.version, body, kSet.keyFor(JSON.stringify(body))),
      () => (kSet.reset(), setBudget(null), setTransfer(null), setTried(false), refresh()),
    );
  };
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiPolicies') }} />
      <Text style={k.title}>{t('ai.po.title')}</Text>
      <Text style={k.sub}>{t('ai.po.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={pq} ns="ai" emptyKey="ai.po.none" isEmpty={(pq.data ?? []).length === 0}>
        {(pq.data ?? []).map((p) => (
          <PolicyCard key={`${p.action}-${p.version}`} p={p} onSaved={refresh} />
        ))}
      </Gate>
      <Gate q={sq} ns="ai" emptyKey="ai.po.none" isEmpty={false}>
        {cur ? (
          <View style={k.card}>
            <Text style={k.name}>{t('ai.po.settings')}</Text>
            <Field
              label={t('ai.po.budget')}
              value={bText}
              onChange={setBudget}
              keyboard="decimal-pad"
              error={tried && bV === undefined ? t('ai.po.limitBad') : null}
            />
            <Field
              label={t('ai.po.transfer')}
              value={tText}
              onChange={setTransfer}
              keyboard="decimal-pad"
              error={tried && tV === undefined ? t('ai.po.limitBad') : null}
            />
            <Button label={t('ai.po.save')} disabled={s.busy} onPress={saveSettings} />
          </View>
        ) : null}
      </Gate>
    </ScrollView>
  );
}
