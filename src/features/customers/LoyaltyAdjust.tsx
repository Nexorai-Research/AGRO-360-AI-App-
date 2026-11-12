import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage, type ErrorMessage } from '../../api/errors';
import { newId } from '../../device';
import { Button } from '../../ui/Button';
import { colors, radius } from '../../ui/theme';
import { LOYALTY_PERM, adjustPoints, validPoints, validPointsReason } from './loyalty-api';

/** Add or take away loyalty points with a reason. Needs crm.loyalty.manage. The server refuses a result below zero. */
export function LoyaltyAdjust({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [key, setKey] = useState<{ k: string; fp: string } | null>(null);
  if (me?.permissions && !me.permissions.includes(LOYALTY_PERM)) return null;
  const ok = validPoints(points) && validPointsReason(reason);

  async function save() {
    if (busy || !client || !ok) return;
    const body = { points: Number(points.trim()), reason: reason.trim() };
    const fp = JSON.stringify(body);
    const k = key && key.fp === fp ? key.k : newId();
    setKey({ k, fp });
    setBusy(true);
    setFailure(null);
    try {
      await adjustPoints(client, customerId, body, k);
      setKey(null);
      setMsg(t('loyaltyAdj.saved'));
      setOpen(false);
      setPoints('');
      setReason('');
      void qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      {msg ? (
        <Text style={s.ok} accessibilityRole="alert">
          {msg}
        </Text>
      ) : null}
      {!open ? (
        <Button
          kind="ghost"
          label={t('loyaltyAdj.open')}
          onPress={() => {
            setOpen(true);
            setMsg(null);
            setFailure(null);
          }}
        />
      ) : (
        <View style={s.form}>
          <TextInput
            value={points}
            onChangeText={setPoints}
            keyboardType="numbers-and-punctuation"
            placeholder={t('loyaltyAdj.points')}
            accessibilityLabel={t('loyaltyAdj.points')}
            style={s.input}
          />
          {points !== '' && !validPoints(points) ? (
            <Text style={s.error}>{t('loyaltyAdj.badPoints')}</Text>
          ) : null}
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={t('loyaltyAdj.reason')}
            accessibilityLabel={t('loyaltyAdj.reason')}
            style={s.input}
          />
          {failure ? (
            <Text style={s.error} accessibilityRole="alert">
              {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
            </Text>
          ) : null}
          <Button label={t('loyaltyAdj.save')} disabled={busy || !ok} onPress={() => void save()} />
          <Button kind="ghost" label={t('pos.back')} onPress={() => setOpen(false)} />
        </View>
      )}
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
  form: { gap: 8 },
  ok: { color: colors.ok, fontWeight: '600' },
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
