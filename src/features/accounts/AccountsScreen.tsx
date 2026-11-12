import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { todayIST } from '../collections/receipt';
import { daysBefore } from '../attendance/api';
import { StateView } from '../stock/StateView';
import { Card, Chips, Gate, Line, Notice, isNetwork, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { ACCOUNT_PERM, fetchDayBook, fetchLedgers, fetchTrialBalance } from './api';

type Tab = 'day' | 'trial' | 'ledgers';
const DAYS = ['1', '7', '30'] as const;

/** Debit balance shown as "Dr", credit as "Cr". The sign is read from the decimal string. */
export function drCr(balance: string): string {
  const d = dec(balance);
  return `${formatINR(d.abs().toFixed(2))} ${d.isNegative() ? 'Cr' : 'Dr'}`;
}

export default function AccountsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const userId = me?.userId ?? '';
  const today = todayIST();
  const tabs = (
    [
      ['day', ACCOUNT_PERM.reports],
      ['trial', ACCOUNT_PERM.reports],
      ['ledgers', ACCOUNT_PERM.accounts],
    ] as const
  ).filter(([, p]) => can(p));
  const [pick, setPick] = useState<Tab>('day');
  const tab: Tab = tabs.some(([k]) => k === pick) ? pick : (tabs[0]?.[0] ?? 'day');
  const [days, setDays] = useState<(typeof DAYS)[number]>('1');
  const ready = client !== null && me !== null && tabs.length > 0;
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
  const from = daysBefore(today, Number(days) - 1);

  const day = useQuery({
    queryKey: ['accounts', userId, 'day', from, today],
    queryFn: ({ signal }) => fetchDayBook(client!, from, today, signal),
    enabled: ready && tab === 'day',
    retry,
  });
  const trial = useQuery({
    queryKey: ['accounts', userId, 'trial', today],
    queryFn: ({ signal }) => fetchTrialBalance(client!, today, signal),
    enabled: ready && tab === 'trial',
    retry,
  });
  const ledgers = useQuery({
    queryKey: ['accounts', userId, 'ledgers'],
    queryFn: ({ signal }) => fetchLedgers(client!, signal),
    enabled: ready && tab === 'ledgers',
    retry,
  });

  const gate = { deniedText: t('accounts.denied'), offlineText: t('accounts.offline') };
  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">
        {t('accounts.title')}
      </Text>
      {tabs.length === 0 ? (
        <StateView state="denied" message={t('accounts.denied')} />
      ) : (
        <>
          <Chips
            label={t('accounts.which')}
            options={tabs.map(([k]) => ({ id: k, label: t(`accounts.tab_${k}`) }))}
            value={tab}
            onChange={setPick}
          />

          {tab === 'day' ? (
            <>
              <Chips
                label={t('accounts.period')}
                options={DAYS.map((d) => ({
                  id: d,
                  label: t(d === '1' ? 'accounts.today' : 'accounts.lastDays', { count: Number(d) }),
                }))}
                value={days}
                onChange={setDays}
              />
              <Gate query={day} denied={false} {...gate}>
                {day.data ? (
                  <>
                    <Card>
                      <Line label={t('accounts.debit')} value={formatINR(day.data.totals.debit)} />
                      <Line label={t('accounts.credit')} value={formatINR(day.data.totals.credit)} />
                    </Card>
                    {!day.data.balanced ? <Notice tone="error" text={t('accounts.notBalanced')} /> : null}
                    {day.data.journals.length === 0 ? (
                      <StateView state="empty" message={t('accounts.emptyDay')} />
                    ) : null}
                    {day.data.journals.map((j) => (
                      <Card key={j.id}>
                        <Text style={kit.name}>
                          {j.voucherNo ?? j.purpose} · {formatINR(j.debit)}
                        </Text>
                        <Text style={kit.sub}>
                          {shortDate(j.date)} · {j.voucherKind ?? j.sourceType}
                        </Text>
                        {j.narration ? <Text style={kit.sub}>{j.narration}</Text> : null}
                      </Card>
                    ))}
                  </>
                ) : null}
              </Gate>
            </>
          ) : null}

          {tab === 'trial' ? (
            <Gate query={trial} denied={false} {...gate}>
              {trial.data ? (
                <>
                  <Card>
                    <Text style={kit.sub}>{t('accounts.asOn', { date: shortDate(trial.data.to) })}</Text>
                    <Line label={t('accounts.debit')} value={formatINR(trial.data.totals.closingDr)} strong />
                    <Line
                      label={t('accounts.credit')}
                      value={formatINR(trial.data.totals.closingCr)}
                      strong
                    />
                  </Card>
                  {!trial.data.balanced ? <Notice tone="error" text={t('accounts.notBalanced')} /> : null}
                  {trial.data.rows.length === 0 ? (
                    <StateView state="empty" message={t('accounts.emptyTrial')} />
                  ) : null}
                  {trial.data.rows.map((r) => (
                    <Card key={r.accountId}>
                      <Text style={kit.name}>
                        {r.code} · {r.name}
                      </Text>
                      {dec(r.closingDr).isZero() ? null : (
                        <Line label={t('accounts.debit')} value={formatINR(r.closingDr)} />
                      )}
                      {dec(r.closingCr).isZero() ? null : (
                        <Line label={t('accounts.credit')} value={formatINR(r.closingCr)} />
                      )}
                    </Card>
                  ))}
                </>
              ) : null}
            </Gate>
          ) : null}

          {tab === 'ledgers' ? (
            <Gate query={ledgers} denied={false} {...gate}>
              {(ledgers.data?.items ?? []).length === 0 ? (
                <StateView state="empty" message={t('accounts.emptyLedgers')} />
              ) : null}
              {(ledgers.data?.items ?? []).map((a) => (
                <Card key={a.id}>
                  <Text style={kit.name}>
                    {a.code} · {a.name}
                  </Text>
                  <Text style={kit.sub}>{a.groupName ?? a.type}</Text>
                  {a.balance !== undefined ? (
                    <Line label={t('accounts.balance')} value={drCr(a.balance)} strong />
                  ) : null}
                </Card>
              ))}
            </Gate>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
