import { useState, type ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import type { ApiClient } from '@/api/client';
import { formatINR } from '@/money';
import { StateView } from '../stock/StateView';
import { Card, Chips, Gate, Line, isNetwork, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import {
  EXPIRY_WINDOWS,
  KIND_PERM,
  PAGE_ROWS,
  fetchExpiry,
  fetchLedger,
  fetchReorderRules,
  fetchValuation,
  type ExpiryWindow,
  type StockReportKind,
} from './reports-api';

const KINDS: StockReportKind[] = ['expiry', 'ledger', 'reorder', 'valuation'];

/** One read-only query per report; the state texts are shared. */
function Box<T>({ userId, kind, extra, client, enabled, load, children }: {
  userId: string;
  kind: StockReportKind;
  extra: string;
  client: ApiClient | null;
  enabled: boolean;
  load: (c: ApiClient, signal: AbortSignal) => Promise<T>;
  children: (d: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['stockreports', userId, kind, extra],
    queryFn: ({ signal }) => load(client!, signal),
    enabled: enabled && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <Gate query={q} denied={!enabled} deniedText={t('stockReports.denied')} offlineText={t('stockReports.offline')}>
      {q.data ? children(q.data) : null}
    </Gate>
  );
}

function More({ shown, total }: { shown: number; total: number }) {
  const { t } = useTranslation();
  return total > shown ? <Text style={kit.sub}>{t('stockReports.more', { shown, count: total })}</Text> : null;
}

export default function StockReportsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const allowed = KINDS.filter((k) => can(KIND_PERM[k]));
  const [pick, setPick] = useState<StockReportKind>('expiry');
  const [win, setWin] = useState<ExpiryWindow>('30');
  const kind: StockReportKind = allowed.includes(pick) ? pick : (allowed[0] ?? 'expiry');
  const userId = me?.userId ?? '';
  const enabled = client !== null && me !== null && allowed.length > 0;
  const common = { userId, client, enabled };

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">{t('stockReports.title')}</Text>
      {allowed.length === 0 ? (
        <StateView state="denied" message={t('stockReports.denied')} />
      ) : (
        <>
          <Chips label={t('stockReports.which')} options={allowed.map((k) => ({ id: k, label: t(`stockReports.kind_${k}`) }))} value={kind} onChange={setPick} />
          {kind === 'expiry' ? (
            <>
              <Chips label={t('stockReports.window')} options={EXPIRY_WINDOWS.map((w) => ({ id: w, label: w === 'expired' ? t('stockReports.expired') : t('stockReports.withinDays', { count: Number(w) }) }))} value={win} onChange={setWin} />
              <Box {...common} kind="expiry" extra={win} load={(c, s) => fetchExpiry(c, win, s)}>
                {(d) => (
                  <>
                    {d.items.length === 0 ? <StateView state="empty" message={t('stockReports.emptyExpiry')} /> : null}
                    {d.items.map((b) => (
                      <Card key={b.id}>
                        <Text style={kit.name}>{b.skuName}</Text>
                        <Text style={kit.sub}>{b.skuCode} · {t('stockReports.batch', { no: b.batchNo })} · {b.status}</Text>
                        <Line label={t('stockReports.expiry')} value={b.expiryDate ? `${shortDate(b.expiryDate)}${b.daysToExpiry !== null ? ` (${t('stockReports.days', { count: b.daysToExpiry })})` : ''}` : '-'} />
                        <Line label={t('stockReports.onHand')} value={b.onHand} strong />
                        {b.valueAtRisk !== null ? <Line label={t('stockReports.valueAtRisk')} value={formatINR(b.valueAtRisk)} /> : null}
                      </Card>
                    ))}
                    <More shown={d.items.length} total={d.total} />
                  </>
                )}
              </Box>
            </>
          ) : null}
          {kind === 'ledger' ? (
            <Box {...common} kind="ledger" extra="" load={(c, s) => fetchLedger(c, s)}>
              {(d) => (
                <>
                  {d.items.length === 0 ? <StateView state="empty" message={t('stockReports.emptyLedger')} /> : null}
                  {d.items.map((m) => (
                    <Card key={m.id}>
                      <Text style={kit.name}>{m.skuName}</Text>
                      <Text style={kit.sub}>
                        {[shortDate(m.businessDate), t(`stockReports.mv.${m.movementType}`, { defaultValue: m.movementType }), m.warehouseCode, m.batchNo ? t('stockReports.batch', { no: m.batchNo }) : null].filter(Boolean).join(' · ')}
                      </Text>
                      <Line label={t('stockReports.qty')} value={m.qty} strong />
                      <Line label={t('stockReports.balance')} value={m.runningBalance} />
                      {m.value !== null ? <Line label={t('stockReports.value')} value={formatINR(m.value)} /> : null}
                      {m.reasonCode ? <Text style={kit.sub}>{m.reasonCode}</Text> : null}
                    </Card>
                  ))}
                  <More shown={d.items.length} total={d.total} />
                </>
              )}
            </Box>
          ) : null}
          {kind === 'reorder' ? (
            <Box {...common} kind="reorder" extra="" load={(c, s) => fetchReorderRules(c, s)}>
              {(d) => (
                <>
                  {d.items.length === 0 ? <StateView state="empty" message={t('stockReports.emptyReorder')} /> : null}
                  {d.items.map((r, i) => (
                    <Card key={`${r.skuCode}-${r.branchName ?? 'default'}-${i}`}>
                      <Text style={kit.name}>{r.skuName}</Text>
                      <Text style={kit.sub}>{r.skuCode} · {r.branchName ?? t('stockReports.allBranches')}</Text>
                      <Line label={t('stockReports.reorderLevel')} value={r.reorderLevel} strong />
                      <Line label={t('stockReports.minQty')} value={r.minQty} />
                      <Line label={t('stockReports.maxQty')} value={r.maxQty} />
                      <Line label={t('stockReports.reorderQty')} value={r.reorderQty} />
                    </Card>
                  ))}
                  <More shown={d.items.length} total={d.total} />
                </>
              )}
            </Box>
          ) : null}
          {kind === 'valuation' ? (
            <Box {...common} kind="valuation" extra="" load={(c, s) => fetchValuation(c, s)}>
              {(d) => (
                <>
                  <Card>
                    <Line label={t('stockReports.totalValue')} value={formatINR(d.totalValue)} strong />
                    <Line label={t('stockReports.totalQty')} value={d.totalQty} />
                    <Text style={kit.sub}>{t('stockReports.asOn', { date: shortDate(d.asOn) })}</Text>
                    {d.warning ? <Text style={kit.sub}>{d.warning}</Text> : null}
                  </Card>
                  {d.rows.length === 0 ? <StateView state="empty" message={t('stockReports.emptyValuation')} /> : null}
                  {d.rows.slice(0, PAGE_ROWS).map((r, i) => (
                    <Card key={`${r.skuCode}-${r.branchName}-${i}`}>
                      <Text style={kit.name}>{r.skuName}</Text>
                      <Text style={kit.sub}>{r.skuCode} · {r.branchName}</Text>
                      <Line label={t('stockReports.qty')} value={r.qty} />
                      <Line label={t('stockReports.value')} value={formatINR(r.value)} strong />
                      {r.avgCost !== null ? <Line label={t('stockReports.avgCost')} value={formatINR(r.avgCost)} /> : null}
                    </Card>
                  ))}
                  <More shown={Math.min(d.rows.length, PAGE_ROWS)} total={d.rows.length} />
                </>
              )}
            </Box>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
