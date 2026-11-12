import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage, type ErrorMessage } from '../../api/errors';
import { newId } from '../../device';
import { dec, formatINR } from '../../money';
import { Button } from '../../ui/Button';
import { colors, radius } from '../../ui/theme';
import {
  CRPERM,
  fetchCredit,
  holdCredit,
  putCreditLimit,
  releaseCredit,
  validHoldReason,
  validLimit,
  validSeason,
} from './credit-api';
import { StateView, fmtDate, isDenied } from './ui';

/** Credit review of one customer with the limit and hold actions. Closed until opened; every write has one key kept on a retry. */
export function CreditPanel({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const can = (p: string) => !me?.permissions || me.permissions.includes(p);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'limit' | 'hold' | 'release' | null>(null);
  const [limit, setLimit] = useState('');
  const [season, setSeason] = useState('');
  const [reason, setReason] = useState('');
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
  const q = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'credit', customerId],
    queryFn: ({ signal }) => fetchCredit(client!, customerId, signal),
    enabled: open && client !== null && can(CRPERM.view),
  });
  if (!can(CRPERM.view)) return null;
  const a = q.data?.account;

  const show = (m: 'limit' | 'hold' | 'release') => {
    setMode(m);
    setMsg(null);
    setFailure(null);
    setReason('');
    setKey(null);
    if (m === 'limit' && a) {
      setLimit(dec(a.creditLimit).toFixed(2));
      setSeason(a.seasonLimit ? dec(a.seasonLimit).toFixed(2) : '');
    }
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

  const limitOk = validLimit(limit) && validSeason(season);
  const reasonOk = validHoldReason(reason);
  return (
    <View style={s.card}>
      <Button
        kind="ghost"
        label={`${open ? '▾' : '▸'} ${t('credit.title')}`}
        onPress={() => setOpen((v) => !v)}
      />
      {open && q.isPending ? <StateView kind="loading" /> : null}
      {open && q.isError ? (
        isDenied(q.error) ? (
          <StateView kind="denied" />
        ) : (
          <StateView kind="error" error={q.error} onRetry={() => void q.refetch()} />
        )
      ) : null}
      {open && q.data && a ? (
        <>
          {msg ? (
            <Text style={s.ok} accessibilityRole="alert">
              {msg}
            </Text>
          ) : null}
          {a.hold ? (
            <Text style={s.hold}>
              {t('customers.creditHold')}
              {a.holdReason ? `: ${a.holdReason}` : ''}
            </Text>
          ) : null}
          <Text style={s.fv}>
            {t('customers.creditLimit')}: {formatINR(a.creditLimit)}
          </Text>
          {a.seasonLimit ? (
            <Text style={s.fv}>
              {t('credit.seasonLimit')}: {formatINR(a.seasonLimit)}
            </Text>
          ) : null}
          <Text style={s.fv}>
            {t('customers.outstanding')}: {formatINR(a.outstanding)}
          </Text>
          <Text style={s.fv}>
            {t('customers.available')}: {formatINR(a.available)}
          </Text>
          {q.data.history.slice(0, 5).map((h, i) => (
            <Text key={`l${i}`} style={s.muted}>
              {t('credit.limitChange', {
                date: fmtDate(h.changedAt.slice(0, 10)),
                from: formatINR(h.oldLimit),
                to: formatINR(h.newLimit),
              })}
              {h.reason ? ` · ${h.reason}` : ''}
            </Text>
          ))}
          {q.data.holds.slice(0, 5).map((h, i) => (
            <Text key={`h${i}`} style={s.muted}>
              {t('credit.holdChange', {
                date: fmtDate(h.at.slice(0, 10)),
                action: h.action,
                source: h.source,
              })}
              {h.reason ? ` · ${h.reason}` : ''}
            </Text>
          ))}
          {mode === null ? (
            <View style={s.row}>
              {can(CRPERM.limit) ? (
                <Button kind="ghost" label={t('credit.setLimit')} onPress={() => show('limit')} />
              ) : null}
              {can(CRPERM.hold) && !a.hold ? (
                <Button kind="ghost" label={t('credit.hold')} onPress={() => show('hold')} />
              ) : null}
              {can(CRPERM.hold) && a.hold ? (
                <Button kind="ghost" label={t('credit.release')} onPress={() => show('release')} />
              ) : null}
            </View>
          ) : (
            <View style={s.form}>
              {mode === 'limit' ? (
                <>
                  <TextInput
                    value={limit}
                    onChangeText={setLimit}
                    keyboardType="decimal-pad"
                    placeholder={t('customers.creditLimit')}
                    accessibilityLabel={t('customers.creditLimit')}
                    style={s.input}
                  />
                  <TextInput
                    value={season}
                    onChangeText={setSeason}
                    keyboardType="decimal-pad"
                    placeholder={t('credit.seasonLimit')}
                    accessibilityLabel={t('credit.seasonLimit')}
                    style={s.input}
                  />
                  {limit !== '' && !limitOk ? <Text style={s.error}>{t('credit.badAmount')}</Text> : null}
                </>
              ) : null}
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={t('credit.reason')}
                accessibilityLabel={t('credit.reason')}
                style={s.input}
              />
              {failure ? (
                <Text style={s.error} accessibilityRole="alert">
                  {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
                </Text>
              ) : null}
              <Button
                label={t(
                  mode === 'limit'
                    ? 'credit.saveLimit'
                    : mode === 'hold'
                      ? 'credit.holdNow'
                      : 'credit.releaseNow',
                )}
                disabled={
                  busy ||
                  (mode === 'limit'
                    ? !limitOk || limit === '' || (reason !== '' && reason.length > 500)
                    : !reasonOk)
                }
                onPress={() => {
                  if (mode === 'limit') {
                    const body = {
                      creditLimit: limit.trim(),
                      seasonLimit: season.trim() === '' ? null : season.trim(),
                      ...(reason.trim() ? { reason: reason.trim() } : {}),
                    };
                    void run(
                      () =>
                        putCreditLimit(
                          client!,
                          customerId,
                          a.version,
                          body,
                          keyFor(`l|${a.version}|${JSON.stringify(body)}`),
                        ),
                      t('credit.limitSaved'),
                    );
                  } else if (mode === 'hold')
                    void run(
                      () => holdCredit(client!, customerId, reason.trim(), keyFor(`h|${reason.trim()}`)),
                      t('credit.held'),
                    );
                  else
                    void run(
                      () => releaseCredit(client!, customerId, reason.trim(), keyFor(`r|${reason.trim()}`)),
                      t('credit.released'),
                    );
                }}
              />
              <Button kind="ghost" label={t('pos.back')} onPress={() => setMode(null)} />
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    gap: 6,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 8 },
  fv: { color: colors.ink, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  ok: { color: colors.ok, fontWeight: '600' },
  hold: { color: colors.danger, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.ink,
  },
});
