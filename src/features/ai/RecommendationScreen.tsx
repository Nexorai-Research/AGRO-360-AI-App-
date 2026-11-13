import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  AI_DECIDE,
  AI_VIEW,
  akey,
  approveAction,
  dryRunAction,
  executeAction,
  fetchAction,
  rejectRecommendation,
  type DryRun,
} from './api';
import { payloadRows } from './fmt';

export const validReason = (r: string) => r.trim().length >= 3 && r.trim().length <= 500;

export default function RecommendationScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSal();
  const kDry = useActionKey();
  const kApp = useActionKey();
  const kExe = useActionKey();
  const kRej = useActionKey();
  // The approval token is single use and lives only here, in memory: it is never saved on the phone.
  const [token, setToken] = useState('');
  const [dry, setDry] = useState<DryRun | null>(null);
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(AI_VIEW) && !!id;
  const q = useQuery({
    queryKey: akey(s.userId, 'action', id ?? ''),
    queryFn: ({ signal }) => fetchAction(s.client!, id!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AI_VIEW)) return <StateView state="denied" message={t('ai.denied')} />;
  const d = q.data;
  const rec = d?.recommendation;
  const open = rec ? ['PRESENTED', 'ACCEPTED'].includes(rec.status) : false;
  const refresh = () => void q.refetch();

  function check() {
    void s.act(
      t('ai.rec.checked'),
      async () => setDry(await dryRunAction(s.client!, id!, kDry.keyFor(id!))),
      () => kDry.reset(),
    );
  }
  function approve() {
    if (!rec) return;
    void s.act(
      t('ai.rec.approved'),
      async () => {
        const a = await approveAction(s.client!, id!, rec.payloadHash, kApp.keyFor(rec.payloadHash));
        // A second person has to approve when the policy asks for two: then no token is issued to this person.
        setToken(a.awaitingSecondApprover ? '' : a.token);
      },
      () => (kApp.reset(), refresh()),
    );
  }
  function execute() {
    const tk = token;
    void s.act(
      t('ai.rec.executed'),
      () => executeAction(s.client!, id!, tk, kExe.keyFor(tk)),
      () => (kExe.reset(), setToken(''), refresh()),
    );
  }
  function reject() {
    setTried(true);
    if (!validReason(reason)) return;
    const r = reason.trim();
    void s.act(
      t('ai.rec.rejected'),
      () => rejectRecommendation(s.client!, id!, r, kRej.keyFor(r)),
      () => (kRej.reset(), setAsk(false), setReason(''), setTried(false), setToken(''), refresh()),
    );
  }

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={refresh} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiRecs') }} />
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Gate q={q} ns="ai" emptyKey="ai.rec.none" isEmpty={false}>
        {d && rec ? (
          <>
            <View style={k.card}>
              <Text style={k.title}>{d.approval.label}</Text>
              <Text style={k.sub}>
                {t(`ai.rec.st.${rec.status}`, { defaultValue: rec.status })} ·{' '}
                {t('ai.rec.expires', { date: rec.expiresAt.slice(0, 10) })}
              </Text>
              <Text style={k.sub}>{t('ai.rec.draftIn', { where: d.approval.draftIn })}</Text>
              {rec.confidence !== null ? (
                <Text style={k.sub}>{t('ai.rec.confidence', { n: Math.round(rec.confidence * 100) })}</Text>
              ) : null}
              {rec.rejectReason ? (
                <Text style={k.warn}>{t('ai.rec.because', { reason: rec.rejectReason })}</Text>
              ) : null}
              {rec.domainRef ? <Text style={k.ok}>{t('ai.rec.draftMade')}</Text> : null}
            </View>
            <View style={k.card}>
              <Text style={k.name}>{t('ai.rec.details')}</Text>
              {payloadRows(rec.payload).map(([a, b]) => (
                <Text key={a} style={k.sub}>
                  {a}: {b}
                </Text>
              ))}
              <Text style={k.sub}>{t('ai.rec.evidence', { n: rec.evidence.length })}</Text>
            </View>
            {d.approval.approvedBy.length > 0 ? (
              <Text style={k.sub}>{t('ai.rec.approvedBy', { n: d.approval.approvedBy.length })}</Text>
            ) : null}
            {d.approval.needsSecondApprover ? <Text style={k.warn}>{t('ai.rec.twoPeople')}</Text> : null}
            {dry ? (
              <View style={k.card}>
                <Text style={dry.allPass ? k.ok : k.warn}>
                  {dry.allPass ? t('ai.rec.allPass') : t('ai.rec.someFail')}
                </Text>
                <Text style={k.sub}>{dry.wouldCreate}</Text>
                {dry.checks.map((c) => (
                  <Text key={c.name} style={c.ok ? k.sub : k.warn}>
                    {c.ok ? '✓' : '✗'} {c.name}: {c.detail}
                  </Text>
                ))}
                <Text style={k.sub}>{t('ai.rec.nothingWritten')}</Text>
              </View>
            ) : null}
            {open ? (
              <View style={k.row}>
                <Button kind="ghost" label={t('ai.rec.check')} disabled={s.busy} onPress={check} />
                {s.can(AI_DECIDE) && d.approval.youMayApprove && !token ? (
                  <Button label={t('ai.rec.approve')} disabled={s.busy} onPress={approve} />
                ) : null}
                {s.can(AI_DECIDE) && token ? (
                  <Button label={t('ai.rec.execute')} disabled={s.busy} onPress={execute} />
                ) : null}
                {s.can(AI_DECIDE) ? (
                  <Button
                    kind="ghost"
                    label={t('ai.rec.reject')}
                    disabled={s.busy}
                    onPress={() => setAsk(true)}
                  />
                ) : null}
              </View>
            ) : null}
            {open && s.can(AI_DECIDE) && !d.approval.youMayApprove && d.approval.whyNot ? (
              <Text style={k.warn}>{d.approval.whyNot}</Text>
            ) : null}
            {ask ? (
              <View style={k.card}>
                <Field
                  label={t('ai.rec.reason')}
                  value={reason}
                  onChange={setReason}
                  multiline
                  error={tried && !validReason(reason) ? t('ai.rec.reasonBad') : null}
                />
                <View style={k.row}>
                  <Button label={t('ai.rec.confirmReject')} disabled={s.busy} onPress={reject} />
                  <Button kind="ghost" label={t('ai.no')} onPress={() => (setAsk(false), setTried(false))} />
                </View>
              </View>
            ) : null}
            <Text style={k.sub}>{t('ai.rec.note')}</Text>
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}
