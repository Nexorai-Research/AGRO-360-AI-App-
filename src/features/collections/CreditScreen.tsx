import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Field, Notice, k, useActionKey } from '../purchase/ui';
import { searchCustomers } from './api';
import { SPERM, creditHold, fetchCredit, setCreditLimit, skey } from './sal-api';
import { validLimit, validReason } from './sal-logic';
import { useSal } from './sal-hook';

export default function CreditScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const limitKey = useActionKey();
  const holdKey = useActionKey();
  const [term, setTerm] = useState('');
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [limit, setLimit] = useState('');
  const [limitReason, setLimitReason] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [tried, setTried] = useState(false);
  const [triedH, setTriedH] = useState(false);

  const found = useQuery({
    queryKey: skey(s.userId, 'credit-find', term.trim()),
    queryFn: ({ signal }) => searchCustomers(s.client!, term.trim(), signal),
    enabled: s.ready && !customer && term.trim().length >= 2,
  });
  const credit = useQuery({
    queryKey: skey(s.userId, 'credit', customer?.id ?? ''),
    queryFn: ({ signal }) => fetchCredit(s.client!, customer!.id, signal),
    enabled: s.ready && customer !== null,
    retry: retryNetworkOnce,
  });

  if (!s.can(SPERM.ledger)) return <StateView state="denied" message={t('credit.denied')} />;

  const a = credit.data?.account;
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.credit') }} />
      <Text style={k.title}>{t('credit.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      {!customer ? (
        <>
          <Field label={t('credit.find')} value={term} onChange={setTerm} />
          {(found.data ?? []).map((c) => (
            <Button
              key={c.id}
              kind="ghost"
              label={c.name}
              onPress={() => (setCustomer({ id: c.id, name: c.name }), s.setMsg(null))}
            />
          ))}
          {found.data && found.data.length === 0 ? <Text style={k.sub}>{t('credit.noCustomer')}</Text> : null}
        </>
      ) : (
        <>
          <Text style={k.name}>{customer.name}</Text>
          <Button
            kind="ghost"
            label={t('credit.change')}
            onPress={() => (setCustomer(null), setLimit(''), setLimitReason(''), setHoldReason(''))}
          />
          <Gate q={credit} ns="credit" emptyKey="credit.noCustomer" isEmpty={false}>
            {a ? (
              <View style={k.card}>
                <Text style={k.sub}>{t('credit.limit', { amount: formatINR(a.creditLimit) })}</Text>
                <Text style={k.sub}>{t('credit.outstanding', { amount: formatINR(a.outstanding) })}</Text>
                <Text style={k.name}>{t('credit.available', { amount: formatINR(a.available) })}</Text>
                {a.hold ? (
                  <Text style={k.error}>{t('credit.onHold', { reason: a.holdReason ?? '' })}</Text>
                ) : null}
                {credit.data!.guarantors.length > 0 ? (
                  <Text style={k.sub}>
                    {t('credit.guarantors', { count: credit.data!.guarantors.length })}
                  </Text>
                ) : null}

                {s.can(SPERM.limit) ? (
                  <>
                    <Field
                      label={t('credit.newLimit')}
                      value={limit}
                      onChange={setLimit}
                      keyboard="decimal-pad"
                      error={tried && !validLimit(limit) ? t('credit.v.limit') : null}
                    />
                    <Field label={t('credit.limitReason')} value={limitReason} onChange={setLimitReason} />
                    <Button
                      label={t('credit.setLimit')}
                      disabled={s.busy}
                      onPress={() => {
                        setTried(true);
                        if (!validLimit(limit)) return;
                        const v = limit.trim();
                        void s.act(
                          t('credit.limitSaved'),
                          () =>
                            setCreditLimit(
                              s.client!,
                              customer.id,
                              v,
                              limitReason.trim(),
                              a.version,
                              limitKey.keyFor(`l|${customer.id}|${v}|${limitReason.trim()}|${a.version}`),
                            ),
                          () => (limitKey.reset(), setLimit(''), setLimitReason(''), setTried(false)),
                        );
                      }}
                    />
                  </>
                ) : null}

                {s.can(SPERM.hold) ? (
                  <>
                    <Field
                      label={t('credit.holdReason')}
                      value={holdReason}
                      onChange={setHoldReason}
                      error={triedH && !validReason(holdReason) ? t('credit.v.reason') : null}
                    />
                    <Button
                      kind="ghost"
                      label={a.hold ? t('credit.release') : t('credit.hold')}
                      disabled={s.busy}
                      onPress={() => {
                        setTriedH(true);
                        if (!validReason(holdReason)) return;
                        const r = holdReason.trim();
                        void s.act(
                          t(a.hold ? 'credit.released' : 'credit.held'),
                          () =>
                            creditHold(
                              s.client!,
                              customer.id,
                              !a.hold,
                              r,
                              holdKey.keyFor(`h|${customer.id}|${a.hold}|${r}`),
                            ),
                          () => (holdKey.reset(), setHoldReason(''), setTriedH(false)),
                        );
                      }}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
          </Gate>
        </>
      )}
    </ScrollView>
  );
}
