import { useState, type ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { ApiClient } from '@/api/client';
import { dec, formatINR } from '@/money';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { Bar, Card, Chips, Gate, Line, isNetwork, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import {
  REPORT_GROUPS,
  REPORT_NEEDS,
  fetchCollections,
  fetchLosses,
  fetchProfit,
  fetchSales,
  fetchTax,
  rangeOf,
  type Range,
  type ReportKind,
} from './api';

const KINDS: ReportKind[] = ['sales', 'profit', 'collections', 'tax', 'losses'];
const PERIODS = ['7', '30', '90'] as const;

/** A percentage string from the server as a bar width. Only a picture; the numbers shown stay strings. */
const width = (p: string | null) => (p === null ? 0 : dec(p).toNumber());
const signed = (p: string) => `${dec(p).isNegative() ? '' : '+'}${p}%`;

interface Props {
  client: ApiClient | null;
  userId: string;
  range: Range;
  group: string;
  enabled: boolean;
}

/** One query per report; the state texts are the same for all of them. */
function Box<T>({
  props,
  kind,
  load,
  children,
}: {
  props: Props;
  kind: ReportKind;
  load: (c: ApiClient, signal: AbortSignal) => Promise<T>;
  children: (d: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['reports', props.userId, kind, props.range.from, props.range.to, props.group],
    queryFn: ({ signal }) => load(props.client!, signal),
    enabled: props.enabled && props.client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Gate query={q} denied={!props.enabled} deniedText={t('reports.denied')} offlineText={t('reports.offline')}>
      {q.data ? children(q.data) : null}
    </Gate>
  );
}

function Sales(p: Props) {
  const { t } = useTranslation();
  return (
    <Box props={p} kind="sales" load={(c, s) => fetchSales(c, p.range, p.group, s)}>
      {(d) => (
        <>
          <Card>
            <Line label={t('reports.netSales')} value={formatINR(d.totals.netSales)} strong />
            <Line label={t('reports.bills')} value={String(d.totals.bills)} />
            {d.totals.avgBill ? <Line label={t('reports.avgBill')} value={formatINR(d.totals.avgBill)} /> : null}
            <Line label={t('reports.discount')} value={formatINR(d.totals.discount)} />
            {d.totals.margin !== null ? <Line label={t('reports.margin')} value={formatINR(d.totals.margin)} /> : null}
            {d.previous.changePct ? (
              <Text style={kit.sub}>{t('reports.vsPrevious', { change: signed(d.previous.changePct) })}</Text>
            ) : null}
          </Card>
          {d.rows.length === 0 ? <StateView state="empty" message={t('reports.empty')} /> : null}
          {d.rows.map((r) => (
            <Card key={r.key}>
              <Text style={kit.name}>{r.label}</Text>
              <Line label={t('reports.netSales')} value={formatINR(r.netSales)} />
              <Line label={t('reports.quantity')} value={r.quantity} />
              {r.margin !== null ? <Line label={t('reports.margin')} value={formatINR(r.margin)} /> : null}
              {r.sharePct ? (
                <>
                  <Bar pct={width(r.sharePct)} label={`${r.sharePct}%`} />
                  <Text style={kit.sub}>{t('reports.share', { pct: r.sharePct })}</Text>
                </>
              ) : null}
            </Card>
          ))}
          {d.truncated ? <Text style={kit.sub}>{t('reports.truncated')}</Text> : null}
        </>
      )}
    </Box>
  );
}

function Profit(p: Props) {
  const { t } = useTranslation();
  return (
    <Box props={p} kind="profit" load={(c, s) => fetchProfit(c, p.range, p.group, s)}>
      {(d) => (
        <>
          <Card>
            <Line label={t('reports.netSales')} value={formatINR(d.totals.netSales)} />
            <Line label={t('reports.cost')} value={formatINR(d.totals.cost)} />
            <Line label={t('reports.margin')} value={formatINR(d.totals.margin)} strong />
            {d.totals.marginPct ? <Line label={t('reports.marginPct')} value={`${d.totals.marginPct}%`} /> : null}
          </Card>
          {d.rows.length === 0 ? <StateView state="empty" message={t('reports.empty')} /> : null}
          {d.rows.map((r) => (
            <Card key={r.key}>
              <Text style={kit.name}>{r.label}</Text>
              <Line label={t('reports.netSales')} value={formatINR(r.netSales)} />
              <Line label={t('reports.margin')} value={formatINR(r.margin)} strong />
              {r.marginPct ? (
                <>
                  <Bar pct={width(r.marginPct)} label={`${r.marginPct}%`} />
                  <Text style={kit.sub}>{t('reports.marginPctOf', { pct: r.marginPct })}</Text>
                </>
              ) : null}
            </Card>
          ))}
          {d.leakage.belowCost.length > 0 ? (
            <Card>
              <Text style={kit.name}>{t('reports.belowCost')}</Text>
              {d.leakage.belowCost.map((x) => (
                <Line key={x.key} label={x.label} value={formatINR(x.loss)} />
              ))}
            </Card>
          ) : null}
          <Card>
            <Line label={t('reports.returnedValue')} value={formatINR(d.leakage.returns.returnedValue)} />
            <Line label={t('reports.marginLost')} value={formatINR(d.leakage.returns.marginLost)} />
          </Card>
        </>
      )}
    </Box>
  );
}

function Collections(p: Props) {
  const { t } = useTranslation();
  return (
    <Box props={p} kind="collections" load={(c, s) => fetchCollections(c, p.range, p.group, s)}>
      {(d) => (
        <>
          <Card>
            <Line label={t('reports.due')} value={formatINR(d.totals.due)} />
            <Line label={t('reports.collected')} value={formatINR(d.totals.collected)} strong />
            {d.totals.efficiencyPct ? <Line label={t('reports.efficiency')} value={`${d.totals.efficiencyPct}%`} /> : null}
            <Text style={kit.name}>{t('reports.ageing')}</Text>
            <Line label={t('reports.notDue')} value={formatINR(d.ageing.notDue)} />
            <Line label={t('reports.d30')} value={formatINR(d.ageing.days1to30)} />
            <Line label={t('reports.d60')} value={formatINR(d.ageing.days31to60)} />
            <Line label={t('reports.d90')} value={formatINR(d.ageing.days61to90)} />
            <Line label={t('reports.over90')} value={formatINR(d.ageing.over90)} />
          </Card>
          {d.rows.length === 0 ? <StateView state="empty" message={t('reports.empty')} /> : null}
          {d.rows.map((r) => (
            <Card key={r.key}>
              <Text style={kit.name}>{r.label}</Text>
              <Line label={t('reports.due')} value={formatINR(r.due)} />
              <Line label={t('reports.collected')} value={formatINR(r.collected)} />
              <Line label={t('reports.outstanding')} value={formatINR(r.outstanding)} strong />
              {r.efficiencyPct ? (
                <>
                  <Bar pct={width(r.efficiencyPct)} label={`${r.efficiencyPct}%`} />
                  <Text style={kit.sub}>{t('reports.efficiencyOf', { pct: r.efficiencyPct })}</Text>
                </>
              ) : null}
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}

function Tax(p: Props) {
  const { t } = useTranslation();
  return (
    <Box props={p} kind="tax" load={(c, s) => fetchTax(c, p.range, s)}>
      {(d) => (
        <>
          <Card>
            <Line label={t('reports.outputTax')} value={formatINR(d.totals.outputTax)} />
            <Line label={t('reports.inputTax')} value={formatINR(d.totals.inputTax)} />
            <Line label={t('reports.netPayable')} value={formatINR(d.totals.netPayable)} strong />
          </Card>
          <Text style={kit.name}>{t('reports.outputByRate')}</Text>
          {d.output.map((r) => (
            <Card key={`o-${r.ratePct}`}>
              <Line label={t('reports.rate', { rate: r.ratePct })} value={formatINR(r.tax)} strong />
              <Line label={t('reports.taxable')} value={formatINR(r.taxable)} />
              <Line label="CGST / SGST / IGST" value={`${formatINR(r.cgst)} / ${formatINR(r.sgst)} / ${formatINR(r.igst)}`} />
            </Card>
          ))}
          <Text style={kit.name}>{t('reports.inputByRate')}</Text>
          {d.input.map((r) => (
            <Card key={`i-${r.ratePct}`}>
              <Line label={t('reports.rate', { rate: r.ratePct })} value={formatINR(r.tax)} strong />
              <Line label={t('reports.taxable')} value={formatINR(r.taxable)} />
            </Card>
          ))}
          {d.months.map((m) => (
            <Card key={m.month}>
              <Text style={kit.name}>{m.month}</Text>
              <Line label={t('reports.outputTax')} value={formatINR(m.outputTax)} />
              <Line label={t('reports.inputTax')} value={formatINR(m.inputTax)} />
              <Line label={t('reports.netPayable')} value={formatINR(m.netPayable)} strong />
            </Card>
          ))}
          <Text style={kit.sub}>{t('reports.taxNote')}</Text>
        </>
      )}
    </Box>
  );
}

function Losses(p: Props) {
  const { t } = useTranslation();
  return (
    <Box props={p} kind="losses" load={(c, s) => fetchLosses(c, p.range, p.group, s)}>
      {(d) => (
        <>
          <Card>
            <Line label={t('reports.lossValue')} value={formatINR(d.totals.lossValue)} strong />
            <Line label={t('reports.returnedToSuppliers')} value={formatINR(d.totals.returnedToSuppliers)} />
            <Line label={t('reports.netLoss')} value={formatINR(d.totals.netLoss)} />
            {d.totals.lossPctOfCostSold ? (
              <Text style={kit.sub}>{t('reports.lossPct', { pct: d.totals.lossPctOfCostSold })}</Text>
            ) : null}
          </Card>
          {d.rows.length === 0 ? <StateView state="empty" message={t('reports.emptyLoss')} /> : null}
          {d.rows.map((r) => (
            <Card key={r.key}>
              <Text style={kit.name}>{r.label}</Text>
              <Line label={t('reports.lossValue')} value={formatINR(r.value)} strong />
              <Line label={t('reports.quantity')} value={r.quantity} />
              {r.sharePct ? <Bar pct={width(r.sharePct)} label={`${r.sharePct}%`} /> : null}
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}

export default function ReportsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const allowed = KINDS.filter((k) => can(REPORT_NEEDS[k]));
  const [pick, setPick] = useState<ReportKind>('sales');
  const [days, setDays] = useState<(typeof PERIODS)[number]>('30');
  const [groups, setGroups] = useState<Record<string, string>>({});

  const kind: ReportKind = allowed.includes(pick) ? pick : (allowed[0] ?? 'sales');
  const options = REPORT_GROUPS[kind];
  const group = groups[kind] ?? options[0] ?? '';
  const range = rangeOf(todayIST(), Number(days));
  const props: Props = {
    client,
    userId: me?.userId ?? '',
    range,
    group,
    enabled: client !== null && me !== null && allowed.length > 0,
  };

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">
        {t('reports.title')}
      </Text>
      {allowed.length === 0 ? (
        <StateView state="denied" message={t('reports.denied')} />
      ) : (
        <>
          <Chips
            label={t('reports.which')}
            options={allowed.map((k) => ({ id: k, label: t(`reports.kind_${k}`) }))}
            value={kind}
            onChange={setPick}
          />
          <Chips
            label={t('reports.period')}
            options={PERIODS.map((d) => ({ id: d, label: t('reports.lastDays', { count: Number(d) }) }))}
            value={days}
            onChange={setDays}
          />
          {options.length > 0 ? (
            <Chips
              label={t('reports.groupBy')}
              options={options.map((o) => ({ id: o, label: t(`reports.group_${o}`) }))}
              value={group}
              onChange={(g) => setGroups({ ...groups, [kind]: g })}
            />
          ) : null}
          <Text style={kit.sub}>
            {shortDate(range.from)} - {shortDate(range.to)}
          </Text>
          {kind === 'sales' ? <Sales {...props} /> : null}
          {kind === 'profit' ? <Profit {...props} /> : null}
          {kind === 'collections' ? <Collections {...props} /> : null}
          {kind === 'tax' ? <Tax {...props} /> : null}
          {kind === 'losses' ? <Losses {...props} /> : null}
        </>
      )}
    </ScrollView>
  );
}
