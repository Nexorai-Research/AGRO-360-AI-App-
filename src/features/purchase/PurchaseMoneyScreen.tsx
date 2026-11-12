import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { StateView } from '../stock/StateView';
import { Card, Chips, Line, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { AGEING_BUCKETS, MONEY_PERM, MONEY_ROWS, fetchAgeing, fetchBills, fetchPayments, fetchReturns, type MoneyKind } from './money-api';

const KINDS: MoneyKind[] = ['bills', 'payments', 'returns', 'ageing'];

export default function PurchaseMoneyScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const allowed = KINDS.filter((k) => can(MONEY_PERM[k]));
  const [pick, setPick] = useState<MoneyKind>('bills');
  const [openOnly, setOpenOnly] = useState<'open' | 'all'>('open');
  const kind: MoneyKind = allowed.includes(pick) ? pick : (allowed[0] ?? 'bills');
  const userId = me?.userId ?? '';
  const common = {
    client,
    enabled: client !== null && me !== null && allowed.length > 0,
    deniedText: t('purchaseMoney.denied'),
    offlineText: t('purchaseMoney.offline'),
  };
  const key = (k: string, extra = '') => ['purchasemoney', userId, k, extra];

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">{t('purchaseMoney.title')}</Text>
      {allowed.length === 0 ? (
        <StateView state="denied" message={t('purchaseMoney.denied')} />
      ) : (
        <>
          <Chips label={t('purchaseMoney.which')} options={allowed.map((k) => ({ id: k, label: t(`purchaseMoney.kind_${k}`) }))} value={kind} onChange={setPick} />
          {kind === 'bills' ? (
            <>
              <Chips
                label={t('purchaseMoney.show')}
                options={[{ id: 'open' as const, label: t('purchaseMoney.openBills') }, { id: 'all' as const, label: t('purchaseMoney.allBills') }]}
                value={openOnly}
                onChange={setOpenOnly}
              />
              <ReadBox {...common} queryKey={key('bills', openOnly)} load={(c, s) => fetchBills(c, openOnly === 'open', s)}>
                {(d) => (
                  <>
                    {d.length === 0 ? <StateView state="empty" message={t('purchaseMoney.emptyBills')} /> : null}
                    {d.map((b) => (
                      <Card key={b.id}>
                        <Text style={kit.name}>{b.supplierName}</Text>
                        <Text style={kit.sub}>{[b.number ?? b.supplierInvoiceNo, shortDate(b.invoiceDate), b.status].join(' · ')}</Text>
                        <Line label={t('purchaseMoney.total')} value={formatINR(b.total)} />
                        <Line label={t('purchaseMoney.paid')} value={formatINR(b.paid)} />
                        <Line label={t('purchaseMoney.outstanding')} value={formatINR(b.outstanding)} strong />
                        <Text style={kit.sub}>{t('purchaseMoney.due', { date: shortDate(b.dueDate) })} · {t('purchaseMoney.match', { status: b.matchStatus })}</Text>
                      </Card>
                    ))}
                    {d.length >= MONEY_ROWS ? <Text style={kit.sub}>{t('purchaseMoney.more', { shown: MONEY_ROWS })}</Text> : null}
                  </>
                )}
              </ReadBox>
            </>
          ) : null}
          {kind === 'payments' ? (
            <ReadBox {...common} queryKey={key('payments')} load={(c, s) => fetchPayments(c, s)}>
              {(d) => (
                <>
                  {d.length === 0 ? <StateView state="empty" message={t('purchaseMoney.emptyPayments')} /> : null}
                  {d.map((p) => (
                    <Card key={p.id}>
                      <Text style={kit.name}>{p.supplierName}</Text>
                      <Text style={kit.sub}>{[p.number, shortDate(p.paymentDate), p.modeCode, p.reference].filter(Boolean).join(' · ')}</Text>
                      <Line label={t('purchaseMoney.amount')} value={formatINR(p.amount)} strong />
                      {!dec(p.tdsWithheld).isZero() ? <Line label={t('purchaseMoney.tds')} value={formatINR(p.tdsWithheld)} /> : null}
                      <Line label={t('purchaseMoney.cashPaid')} value={formatINR(p.cashPaid)} />
                      {!dec(p.advance).isZero() ? <Line label={t('purchaseMoney.advance')} value={formatINR(p.advance)} /> : null}
                    </Card>
                  ))}
                  {d.length >= MONEY_ROWS ? <Text style={kit.sub}>{t('purchaseMoney.more', { shown: MONEY_ROWS })}</Text> : null}
                </>
              )}
            </ReadBox>
          ) : null}
          {kind === 'returns' ? (
            <ReadBox {...common} queryKey={key('returns')} load={(c, s) => fetchReturns(c, s)}>
              {(d) => (
                <>
                  {d.length === 0 ? <StateView state="empty" message={t('purchaseMoney.emptyReturns')} /> : null}
                  {d.map((r) => (
                    <Card key={r.id}>
                      <Text style={kit.name}>{r.supplierName}</Text>
                      <Text style={kit.sub}>{[r.number, shortDate(r.returnDate), r.billNumber ? t('purchaseMoney.againstBill', { no: r.billNumber }) : null].filter(Boolean).join(' · ')}</Text>
                      <Line label={t('purchaseMoney.total')} value={formatINR(r.total)} strong />
                      <Text style={kit.sub}>{r.reason}</Text>
                    </Card>
                  ))}
                  {d.length >= MONEY_ROWS ? <Text style={kit.sub}>{t('purchaseMoney.more', { shown: MONEY_ROWS })}</Text> : null}
                </>
              )}
            </ReadBox>
          ) : null}
          {kind === 'ageing' ? (
            <ReadBox {...common} queryKey={key('ageing')} load={(c, s) => fetchAgeing(c, s)}>
              {(d) => (
                <>
                  <Card>
                    <Line label={t('purchaseMoney.totalPayable')} value={formatINR(d.total)} strong />
                    {AGEING_BUCKETS.map((b) => (
                      <Line key={b} label={t(`purchaseMoney.bucket.${b}`)} value={formatINR(d.totals[b])} />
                    ))}
                    <Text style={kit.sub}>{t('purchaseMoney.asOf', { date: shortDate(d.asOf) })}</Text>
                  </Card>
                  {d.rows.length === 0 ? <StateView state="empty" message={t('purchaseMoney.emptyAgeing')} /> : null}
                  {d.rows.map((r) => (
                    <Card key={r.supplierId}>
                      <Text style={kit.name}>{r.supplierName}</Text>
                      <Line label={t('purchaseMoney.outstanding')} value={formatINR(r.total)} strong />
                      {AGEING_BUCKETS.filter((b) => !dec(r.buckets[b]).isZero()).map((b) => (
                        <Line key={b} label={t(`purchaseMoney.bucket.${b}`)} value={formatINR(r.buckets[b])} />
                      ))}
                      {!dec(r.unallocatedAdvance).isZero() ? <Text style={kit.sub}>{t('purchaseMoney.advanceNote', { amount: formatINR(r.unallocatedAdvance) })}</Text> : null}
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
