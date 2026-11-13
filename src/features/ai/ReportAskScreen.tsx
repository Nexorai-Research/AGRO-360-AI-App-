import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, runReport, saveReportDraft, type ReportAnswer, type ReportAsk } from './api';
import { rupee } from './fmt';

export default function ReportAskScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const kRun = useActionKey();
  const kSave = useActionKey();
  const [q, setQ] = useState('');
  const [tried, setTried] = useState(false);
  const [ans, setAns] = useState<ReportAnswer | null>(null);
  const [last, setLast] = useState<ReportAsk | null>(null);
  const [saved, setSaved] = useState(false);
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const valid = q.trim().length >= 3 && q.trim().length <= 500;
  function ask(body: ReportAsk) {
    setLast(body);
    setSaved(false);
    void s.act(
      t('ai.rp.done'),
      async () => setAns(await runReport(s.client!, body, kRun.keyFor(JSON.stringify(body)))),
      () => kRun.reset(),
    );
  }
  function go(follow: boolean) {
    setTried(true);
    if (!valid) return;
    ask({ question: q.trim(), ...(follow && ans?.memory ? { previous: ans.memory } : {}) });
  }
  function choose(kind: string, id: string) {
    if (!last) return;
    const key = kind === 'branch' ? 'branchId' : kind === 'product' ? 'productId' : 'customerId';
    ask({ ...last, filters: { ...(last.filters ?? {}), ...(ans?.filters ?? {}), [key]: id } });
  }
  function save() {
    if (!last) return;
    void s.act(
      t('ai.rp.saved'),
      async () => {
        await saveReportDraft(s.client!, last, kSave.keyFor(JSON.stringify(last)));
        setSaved(true);
      },
      () => kSave.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiReport') }} />
      <Text style={k.title}>{t('ai.rp.title')}</Text>
      <Text style={k.sub}>{t('ai.rp.intro')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Field
        label={t('ai.rp.question')}
        value={q}
        onChange={setQ}
        multiline
        error={tried && !valid ? t('ai.rp.questionBad') : null}
      />
      <Button label={t('ai.rp.run')} disabled={s.busy} onPress={() => go(false)} />
      {ans?.memory ? (
        <Button kind="ghost" label={t('ai.rp.followUp')} disabled={s.busy} onPress={() => go(true)} />
      ) : null}
      <Button
        kind="ghost"
        label={t('ai.rp.drafts')}
        onPress={() => router.push('/ai-report-drafts' as never)}
      />
      {ans && ans.state !== 'ANSWERED' ? (
        <View style={k.card}>
          <Text style={k.warn}>{ans.message}</Text>
          {ans.options.map((o) => (
            <Button
              key={o.id}
              kind="ghost"
              label={o.label}
              onPress={() => (setQ(o.label), ask({ question: o.label }))}
            />
          ))}
          {ans.ask.map((a) =>
            a.candidates.map((c) => (
              <Button
                key={`${a.kind}-${c.id}`}
                kind="ghost"
                label={c.hint ? `${c.label} (${c.hint})` : c.label}
                disabled={s.busy}
                onPress={() => choose(a.kind, c.id)}
              />
            )),
          )}
        </View>
      ) : null}
      {ans?.state === 'ANSWERED' && ans.summary ? (
        <>
          <View style={k.card}>
            <Text style={k.name}>{ans.summary.title}</Text>
            {(ans.plan?.understood ?? []).map((u) => (
              <Text key={u} style={k.sub}>
                {t('ai.rp.understood', { text: u })}
              </Text>
            ))}
            {ans.summary.paragraphs.map((p) => (
              <Text key={p} style={k.sub}>
                {p}
              </Text>
            ))}
          </View>
          {ans.table ? (
            <View style={k.card}>
              {ans.table.rows.map((r) => (
                <Text key={r.label} style={k.sub}>
                  {r.label}: {rupee(r.value)}
                  {r.sharePct !== null ? ` (${r.sharePct}%)` : ''}
                </Text>
              ))}
              {ans.table.truncated ? <Text style={k.sub}>{t('ai.rp.truncated')}</Text> : null}
            </View>
          ) : null}
          <Button
            kind="ghost"
            label={saved ? t('ai.rp.savedShort') : t('ai.rp.save')}
            disabled={s.busy || saved}
            onPress={save}
          />
          <Text style={k.sub}>{t('ai.rp.note')}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
