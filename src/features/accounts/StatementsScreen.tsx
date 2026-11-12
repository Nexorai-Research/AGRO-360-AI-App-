import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { StateView } from '../stock/StateView';
import { Card, Chips, Line, Notice, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { todayIST } from '../collections/receipt';
import { rangeOf } from '../reports/api';
import { STATEMENT_KINDS, STATEMENT_PERM, fetchBalanceSheet, fetchBook, fetchProfitLoss, type BsSection, type PlSection, type StatementKind } from './statements-api';

const PERIODS = ['7', '30', '90'] as const;

function Sections({ rows, empty }: { rows: (PlSection | BsSection)[]; empty: string }) {
  const shown = rows.filter((x) => x.lines.length > 0 || !dec(x.total).isZero());
  if (shown.length === 0) return <StateView state="empty" message={empty} />;
  return (
    <>
      {shown.map((x) => (
        <Card key={x.section}>
          <Line label={x.label} value={formatINR(x.total)} strong />
          {x.lines.map((l) => (
            <Line key={`${l.code}-${l.name}`} label={`${l.code} ${l.name}`} value={formatINR(l.amount)} />
          ))}
        </Card>
      ))}
    </>
  );
}

export default function StatementsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const [kind, setKind] = useState<StatementKind>('pl');
  const [days, setDays] = useState<(typeof PERIODS)[number]>('30');
  const allowed = can(STATEMENT_PERM);
  const today = todayIST();
  const range = rangeOf(today, Number(days));
  const common = {
    client,
    enabled: client !== null && me !== null && allowed,
    deniedText: t('statements.denied'),
    offlineText: t('statements.offline'),
  };
  const uid = me?.userId ?? '';

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">{t('statements.title')}</Text>
      {!allowed ? (
        <StateView state="denied" message={t('statements.denied')} />
      ) : (
        <>
          <Chips label={t('statements.which')} options={STATEMENT_KINDS.map((k) => ({ id: k, label: t(`statements.kind_${k}`) }))} value={kind} onChange={setKind} />
          {kind !== 'bs' ? (
            <Chips label={t('statements.period')} options={PERIODS.map((d) => ({ id: d, label: t('statements.lastDays', { count: Number(d) }) }))} value={days} onChange={setDays} />
          ) : null}
          <Text style={kit.sub}>{kind === 'bs' ? t('statements.asOn', { date: shortDate(today) }) : `${shortDate(range.from)} - ${shortDate(range.to)}`}</Text>

          {kind === 'pl' ? (
            <ReadBox {...common} queryKey={['statements', uid, 'pl', range.from, range.to]} load={(c, s) => fetchProfitLoss(c, range.from, range.to, s)}>
              {(d) => (
                <>
                  <Card>
                    <Line label={t('statements.netSales')} value={formatINR(d.current.netSales)} />
                    <Line label={t('statements.costOfSales')} value={formatINR(d.current.costOfSales)} />
                    <Line label={t('statements.grossProfit')} value={formatINR(d.current.grossProfit)} strong />
                    <Line label={t('statements.expenses')} value={formatINR(d.current.operatingExpenses)} />
                    <Line label={t('statements.otherIncome')} value={formatINR(d.current.otherIncome)} />
                    <Line label={t('statements.netProfit')} value={formatINR(d.current.netProfit)} strong />
                  </Card>
                  <Sections rows={d.current.sections} empty={t('statements.emptyPl')} />
                </>
              )}
            </ReadBox>
          ) : null}

          {kind === 'bs' ? (
            <ReadBox {...common} queryKey={['statements', uid, 'bs', today]} load={(c, s) => fetchBalanceSheet(c, today, s)}>
              {(d) => (
                <>
                  {!d.balanced ? <Notice tone="error" text={t('statements.notBalanced')} /> : null}
                  <Card>
                    <Line label={t('statements.totalAssets')} value={formatINR(d.totalAssets)} strong />
                    <Line label={t('statements.totalLiabilities')} value={formatINR(d.totalLiabilities)} />
                    <Line label={t('statements.totalEquity')} value={formatINR(d.totalEquity)} />
                    <Line label={t('statements.currentYearProfit')} value={formatINR(d.currentYearProfit)} />
                  </Card>
                  <Text style={kit.name}>{t('statements.assets')}</Text>
                  <Sections rows={d.assets} empty={t('statements.emptyBs')} />
                  <Text style={kit.name}>{t('statements.liabilities')}</Text>
                  <Sections rows={d.liabilities} empty={t('statements.emptyBs')} />
                  <Text style={kit.name}>{t('statements.equity')}</Text>
                  <Sections rows={d.equity} empty={t('statements.emptyBs')} />
                </>
              )}
            </ReadBox>
          ) : null}

          {kind === 'cash' || kind === 'bank' ? (
            <ReadBox {...common} queryKey={['statements', uid, kind, range.from, range.to]} load={(c, s) => fetchBook(c, kind, range.from, range.to, s)}>
              {(d) => (
                <>
                  {d.accounts.length === 0 ? <StateView state="empty" message={t('statements.emptyBook')} /> : null}
                  {d.accounts.map((a) => (
                    <Card key={a.accountId}>
                      <Text style={kit.name}>{a.code} {a.name}</Text>
                      <Line label={t('statements.opening')} value={formatINR(a.opening)} />
                      <Line label={t('statements.receipts')} value={formatINR(a.receipts)} />
                      <Line label={t('statements.payments')} value={formatINR(a.payments)} />
                      <Line label={t('statements.closing')} value={formatINR(a.closing)} strong />
                      {a.negative ? <Text style={kit.sub}>{t('statements.negative')}</Text> : null}
                    </Card>
                  ))}
                </>
              )}
            </ReadBox>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
