import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage, type ErrorMessage } from '../../api/errors';
import { newId } from '../../device';
import { Button } from '../../ui/Button';
import { Chips } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';
import { CHANNELS, CRM_PERM, KINDS, emptyInteraction, fetchPurposes, interactionBody, interactionOk, postInteraction, putConsent, validDay, type InteractionDraft } from './crm-api';

/** Record a consent answer and log a call or visit. Needs customer.consent / customer.interaction. One Idempotency-Key per action, kept on a retry. */
export function CrmActions({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const can = (p: string) => !me?.permissions || me.permissions.includes(p);
  const [mode, setMode] = useState<'consent' | 'interaction' | null>(null);
  const [purpose, setPurpose] = useState('');
  const [channel, setChannel] = useState('');
  const [granted, setGranted] = useState<'yes' | 'no' | ''>('');
  const [ix, setIx] = useState<InteractionDraft>(emptyInteraction);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [key, setKey] = useState<{ k: string; fp: string } | null>(null);
  const keyFor = (fp: string) => {
    if (key && key.fp === fp) return key.k;
    const k = newId();
    setKey({ k, fp });
    return k;
  };
  const purposes = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'purposes'],
    queryFn: ({ signal }) => fetchPurposes(client!, signal),
    enabled: mode === 'consent' && client !== null,
    staleTime: 5 * 60_000,
  });
  if (!can(CRM_PERM.consent) && !can(CRM_PERM.interaction)) return null;

  const open = (m: 'consent' | 'interaction') => {
    setMode(m);
    setMsg(null);
    setFailure(null);
    setKey(null);
    setPurpose('');
    setChannel('');
    setGranted('');
    setIx(emptyInteraction);
  };
  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      setKey(null);
      setMsg(done);
      setMode(null);
      void qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const field = (label: string, value: string, on: (v: string) => void, multi = false) => (
    <TextInput value={value} onChangeText={on} placeholder={label} accessibilityLabel={label} multiline={multi} style={[s.input, multi && s.multi]} />
  );
  const consentOk = purpose !== '' && channel !== '' && granted !== '';
  const ixOk = interactionOk(ix);

  return (
    <View style={s.card}>
      <Text style={s.title}>{t('crm.title')}</Text>
      {msg ? <Text style={s.ok} accessibilityRole="alert">{msg}</Text> : null}
      {mode === null ? (
        <View style={s.row}>
          {can(CRM_PERM.consent) ? <Button kind="ghost" label={t('crm.recordConsent')} onPress={() => open('consent')} /> : null}
          {can(CRM_PERM.interaction) ? <Button kind="ghost" label={t('crm.logInteraction')} onPress={() => open('interaction')} /> : null}
        </View>
      ) : (
        <View style={s.form}>
          {mode === 'consent' ? (
            <>
              <Chips label={t('crm.purpose')} options={(purposes.data ?? []).map((p) => ({ id: p.code, label: p.name || p.code }))} value={purpose} onChange={setPurpose} />
              <Chips label={t('crm.channel')} options={CHANNELS.map((c) => ({ id: c as string, label: c }))} value={channel} onChange={setChannel} />
              <Chips label={t('crm.answer')} options={[{ id: 'yes' as const, label: t('crm.agreed') }, { id: 'no' as const, label: t('crm.refused') }]} value={granted} onChange={setGranted} />
            </>
          ) : (
            <>
              <Chips label={t('crm.kind')} options={KINDS.map((k) => ({ id: k as string, label: t(`crm.kinds.${k}`) }))} value={ix.kind} onChange={(v) => setIx({ ...ix, kind: v })} />
              {field(t('crm.notes'), ix.notes, (v) => setIx({ ...ix, notes: v }), true)}
              {field(t('crm.cropIssue'), ix.cropIssue, (v) => setIx({ ...ix, cropIssue: v }))}
              {field(t('crm.advice'), ix.advice, (v) => setIx({ ...ix, advice: v }))}
              {field(t('crm.followUp'), ix.followUpOn, (v) => setIx({ ...ix, followUpOn: v }))}
              {ix.followUpOn !== '' && !validDay(ix.followUpOn) ? <Text style={s.error}>{t('crm.badDate')}</Text> : null}
            </>
          )}
          {failure ? <Text style={s.error} accessibilityRole="alert">{t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}</Text> : null}
          <Button
            label={t(mode === 'consent' ? 'crm.saveConsent' : 'crm.saveInteraction')}
            disabled={busy || (mode === 'consent' ? !consentOk : !ixOk)}
            onPress={() => {
              if (mode === 'consent') {
                const b = { purpose, channel, granted: granted === 'yes' };
                void run(() => putConsent(client!, customerId, b, keyFor(`c|${JSON.stringify(b)}`)), t('crm.consentSaved'));
              } else {
                const b = interactionBody(ix);
                void run(() => postInteraction(client!, customerId, b, keyFor(`i|${JSON.stringify(b)}`)), t('crm.interactionSaved'));
              }
            }}
          />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setMode(null)} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, borderWidth: 1, borderColor: colors.line, padding: 8, gap: 6 },
  title: { fontWeight: '700', color: colors.ink, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 8 },
  ok: { color: colors.ok, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius, paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff', color: colors.ink },
  multi: { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
});
