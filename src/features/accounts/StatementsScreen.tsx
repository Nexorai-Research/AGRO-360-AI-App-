import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check } from '@/ui/kit';
import { BranchProfit, CsvButton, ReconciliationView } from './Parity11';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { StateView } from '../stock/StateView';
import { Card, Chips, Line, Notice, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { todayIST } from '../collections/receipt';
import { rangeOf } from '../reports/api';
import {
  STATEMENT_KINDS,
  STATEMENT_PATH,
  STATEMENT_PERM,
  statementQuery,
  fetchBalanceSheet,
  fetchBook,
  fetchProfitLoss,
  type BsSection,
  type PlSection,
  type StatementKind,
} from './statements-api';

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
  // web parity 11: the web's branch filter and "compare with previous period"
  const [branchId, setBranchId] = useState('');
  const [compare, setCompare] = useState(false);
  const allowed = can(STATEMENT_PERM);
  const branches = useQuery({
    queryKey: ['statements', me?.userId ?? '', 'branches'],
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: { id: string; name: string }[] }>('/branches', { signal })).items,
    enabled: client !== null && me !== null && allowed,
    retry: false,
  });
  const filter = { branchId, compare: kind === 'pl' && compare };
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
      <Text style={kit.title} accessibilityRole="header">
        {t('statements.title')}
      </Text>
      {!allowed ? (
        <StateView state="denied" message={t('statements.denied')} />
      ) : (
        <>
          <Chips
            label={t('statements.which')}
            options={STATEMENT_KINDS.map((k) => ({ id: k, label: t(`statements.kind_${k}`) }))}
            value={kind}
            onChange={setKind}
          />
          {kind !== 'bs' && kind !== 'recon' ? (
            <Chips
              label={t('statements.period')}
              options={PERIODS.map((d) => ({ id: d, label: t('statements.lastDays', { count: Number(d) }) }))}
              value={days}
              onChange={setDays}
            />
          ) : null}
          <Text style={kit.sub}>
            {kind === 'bs' || kind === 'recon'
              ? t('statements.asOn', { date: shortDate(today) })
              : `${shortDate(range.from)} - ${shortDate(range.to)}`}
          </Text>
          {(kind === 'pl' || kind === 'bs' || kind === 'cash' || kind === 'bank') &&
          (branches.data ?? []).length > 1 ? (
            <Chips
              label={t('wp11.branch')}
              options={[
                { id: '', label: t('wp11.allBranches') },
                ...(branches.data ?? []).map((b) => ({ id: b.id, label: b.name })),
              ]}
              value={branchId}
              onChange={setBranchId}
            />
          ) : null}
          {kind === 'pl' ? <Check label={t('wp11.compare')} value={compare} onChange={setCompare} /> : null}
          {kind === 'pl' || kind === 'bs' || kind === 'cash' || kind === 'bank' ? (
            <CsvButton
              path={STATEMENT_PATH[kind]}
              query={statementQuery(
                kind === 'bs' ? { asOn: today } : { from: range.from, to: range.to },
                filter,
              )}
              fileName={`${kind}-${today}.csv`}
            />
          ) : null}
          {kind === 'branch' ? <BranchProfit from={range.from} to={range.to} /> : null}
          {kind === 'recon' ? <ReconciliationView asOn={today} /> : null}

          {kind === 'pl' ? (
            <ReadBox
              {...common}
              queryKey={['statements', uid, 'pl', range.from, range.to, branchId, String(filter.compare)]}
              load={(c, s) => fetchProfitLoss(c, range.from, range.to, s, filter)}
            >
              {(d) => (
                <>
                  <Card>
                    <Line label={t('statements.netSales')} value={formatINR(d.current.netSales)} />
                    <Line label={t('statements.costOfSales')} value={formatINR(d.current.costOfSales)} />
                    <Line
                      label={t('statements.grossProfit')}
                      value={formatINR(d.current.grossProfit)}
                      strong
                    />
                    <Line label={t('statements.expenses')} value={formatINR(d.current.operatingExpenses)} />
                    <Line label={t('statements.otherIncome')} value={formatINR(d.current.otherIncome)} />
                    <Line label={t('statements.netProfit')} value={formatINR(d.current.netProfit)} strong />
                  </Card>
                  {d.previous ? (
                    <Card>
                      <Text style={kit.name}>
                        {t('wp11.previous', {
                          from: shortDate(d.previous.from),
                          to: shortDate(d.previous.to),
                        })}
                      </Text>
                      <Line label={t('statements.netSales')} value={formatINR(d.previous.netSales)} />
                      <Line label={t('statements.grossProfit')} value={formatINR(d.previous.grossProfit)} />
                      <Line
                        label={t('statements.netProfit')}
                        value={formatINR(d.previous.netProfit)}
                        strong
                      />
                    </Card>
                  ) : null}
                  <Sections rows={d.current.sections} empty={t('statements.emptyPl')} />
                </>
              )}
            </ReadBox>
          ) : null}

          {kind === 'bs' ? (
            <ReadBox
              {...common}
              queryKey={['statements', uid, 'bs', today, branchId]}
              load={(c, s) => fetchBalanceSheet(c, today, s, filter)}
            >
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
            <ReadBox
              {...common}
              queryKey={['statements', uid, kind, range.from, range.to, branchId]}
              load={(c, s) => fetchBook(c, kind, range.from, range.to, s, filter)}
            >
              {(d) => (
                <>
                  {d.accounts.length === 0 ? (
                    <StateView state="empty" message={t('statements.emptyBook')} />
                  ) : null}
                  {d.accounts.map((a) => (
                    <Card key={a.accountId}>
                      <Text style={kit.name}>
                        {a.code} {a.name}
                      </Text>
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
