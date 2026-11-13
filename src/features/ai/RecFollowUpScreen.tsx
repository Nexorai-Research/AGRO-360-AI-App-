import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { P, VERDICTS, measureOutcome, sendFeedback, type Outcome, type Verdict } from './api-g67';

export const qtyOf = (v: string): number | null | undefined => {
  const x = v.trim();
  if (x === '') return null;
  return /^\d+(\.\d+)?$/.test(x) && Number(x) <= 1_000_000 ? Number(x) : undefined;
};

/** Feedback (any person who can see suggestions) and outcome measuring (a person who can decide) for one suggestion. */
export default function RecFollowUpScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSal();
  const kFb = useActionKey();
  const kOut = useActionKey();
  const [verdict, setVerdict] = useState<Verdict>('HELPFUL');
  const [note, setNote] = useState('');
  const [qty, setQty] = useState('');
  const [tried, setTried] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  if (!s.can(P.view)) return <StateView state="denied" message={t('ai.denied')} />;
  const q = qtyOf(qty);
  const feedback = () => {
    const body = { verdict, ...(note.trim() ? { note: note.trim() } : {}) };
    void s.act(
      t('ai.fu.sent'),
      () => sendFeedback(s.client!, id!, body, kFb.keyFor(JSON.stringify(body))),
      () => kFb.reset(),
    );
  };
  const outcome = () => {
    setTried(true);
    if (q === undefined) return;
    const body = q === null ? {} : { receivedQty: q };
    void s.act(
      t('ai.fu.measured'),
      async () => setOut(await measureOutcome(s.client!, id!, body, kOut.keyFor(JSON.stringify(body)))),
      () => kOut.reset(),
    );
  };
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiRecs') }} />
      <Text style={k.title}>{t('ai.fu.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Text style={k.name}>{t('ai.fu.feedback')}</Text>
      <Chips
        options={VERDICTS.map((v) => ({ value: v, label: t(`ai.fu.v.${v}`) }))}
        value={verdict}
        onChange={(v) => setVerdict(v as Verdict)}
      />
      <Field label={t('ai.fu.note')} value={note} onChange={setNote} multiline />
      <Button label={t('ai.fu.send')} disabled={s.busy} onPress={feedback} />
      {s.can(P.decide) ? (
        <>
          <Text style={k.name}>{t('ai.fu.outcome')}</Text>
          <Text style={k.sub}>{t('ai.fu.outcomeNote')}</Text>
          <Field
            label={t('ai.fu.received')}
            value={qty}
            onChange={setQty}
            keyboard="decimal-pad"
            error={tried && q === undefined ? t('ai.fu.qtyBad') : null}
          />
          <Button kind="ghost" label={t('ai.fu.measure')} disabled={s.busy} onPress={outcome} />
          {out ? (
            <Text style={k.sub}>
              {t('ai.fu.result', {
                qty: out.receivedQty,
                out: out.stockedOut ? t('ai.fu.yes') : t('ai.fu.no'),
              })}{' '}
              · {t(`ai.fu.src.${out.source}`)}
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
