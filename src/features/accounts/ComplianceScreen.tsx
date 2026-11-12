import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { Card, Chips, Gate, Line, Notice, isNetwork, kit, useCan } from '../hr/kit';
import { shortDate } from '../hr/logic';
import {
  COMPLIANCE_PERM,
  fetchGstr3b,
  fetchHsn,
  fetchItc,
  monthRange,
  previousMonth,
} from './compliance-api';

type Tab = 'gstr3b' | 'hsn' | 'itc';
type Which = 'this' | 'last';

export default function ComplianceScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const userId = me?.userId ?? '';
  const allowed = can(COMPLIANCE_PERM);
  const ready = client !== null && me !== null && allowed;

  const [tab, setTab] = useState<Tab>('gstr3b');
  const [which, setWhich] = useState<Which>('this');
  const thisMonth = todayIST().slice(0, 7);
  const period = which === 'this' ? thisMonth : previousMonth(thisMonth);
  const range = monthRange(period);
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

  const g = useQuery({
    queryKey: ['compliance', userId, 'gstr3b', period],
    queryFn: ({ signal }) => fetchGstr3b(client!, period, signal),
    enabled: ready && tab === 'gstr3b',
    retry,
  });
  const hsn = useQuery({
    queryKey: ['compliance', userId, 'hsn', period],
    queryFn: ({ signal }) => fetchHsn(client!, range.from, range.to, signal),
    enabled: ready && tab === 'hsn',
    retry,
  });
  const itc = useQuery({
    queryKey: ['compliance', userId, 'itc', period],
    queryFn: ({ signal }) => fetchItc(client!, period, signal),
    enabled: ready && tab === 'itc',
    retry,
  });
  const active = tab === 'gstr3b' ? g : tab === 'hsn' ? hsn : itc;

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">
        {t('compliance.title')}
      </Text>
      <Text style={kit.sub}>{t('compliance.viewOnly')}</Text>
      {allowed ? (
        <>
          <Chips
            label={t('compliance.which')}
            options={[
              { id: 'gstr3b', label: t('compliance.tab_gstr3b') },
              { id: 'hsn', label: t('compliance.tab_hsn') },
              { id: 'itc', label: t('compliance.tab_itc') },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Chips
            label={t('compliance.month')}
            options={[
              { id: 'this', label: t('compliance.thisMonth', { month: thisMonth }) },
              { id: 'last', label: t('compliance.lastMonth', { month: previousMonth(thisMonth) }) },
            ]}
            value={which}
            onChange={setWhich}
          />
        </>
      ) : null}
      <Gate
        query={active}
        denied={!allowed}
        deniedText={t('compliance.denied')}
        offlineText={t('compliance.offline')}
      >
        {tab === 'gstr3b' && g.data ? (
          <>
            <Notice
              tone={g.data.matchesGstr1 ? 'ok' : 'warn'}
              text={t(g.data.matchesGstr1 ? 'compliance.matches' : 'compliance.noMatch')}
            />
            <Card>
              <Text style={kit.name}>{t('compliance.outward')}</Text>
              <Line label={t('compliance.taxable')} value={formatINR(g.data.outward.taxable)} />
              <Line label="CGST" value={formatINR(g.data.outward.cgst)} />
              <Line label="SGST" value={formatINR(g.data.outward.sgst)} />
              <Line label="IGST" value={formatINR(g.data.outward.igst)} />
              <Line label={t('compliance.exempt')} value={formatINR(g.data.exempt.taxable)} />
            </Card>
            <Card>
              <Text style={kit.name}>{t('compliance.itcNet')}</Text>
              <Line label="CGST" value={formatINR(g.data.itc.net.cgst)} />
              <Line label="SGST" value={formatINR(g.data.itc.net.sgst)} />
              <Line label="IGST" value={formatINR(g.data.itc.net.igst)} />
            </Card>
            <Card>
              <Text style={kit.name}>{t('compliance.payable')}</Text>
              <Line label="CGST" value={formatINR(g.data.payable.cgst)} />
              <Line label="SGST" value={formatINR(g.data.payable.sgst)} />
              <Line label="IGST" value={formatINR(g.data.payable.igst)} />
              <Line label={t('compliance.total')} value={formatINR(g.data.payable.total)} strong />
            </Card>
            <Text style={kit.sub}>{t('compliance.reviewOnly')}</Text>
          </>
        ) : null}

        {tab === 'hsn' && hsn.data ? (
          <>
            <Card>
              <Line label={t('compliance.taxable')} value={formatINR(hsn.data.totals.taxable)} />
              <Line label={t('compliance.tax')} value={formatINR(hsn.data.totals.tax)} strong />
            </Card>
            {hsn.data.rows.length === 0 ? (
              <StateView state="empty" message={t('compliance.emptyHsn')} />
            ) : null}
            {hsn.data.rows.map((r) => (
              <Card key={`${r.hsn}-${r.rate}-${r.uqc}`}>
                <Text style={kit.name}>
                  {r.hsn} · {r.rate}%
                </Text>
                <Text style={kit.sub}>{r.description}</Text>
                <Line label={`${t('compliance.quantity')} (${r.uqc})`} value={r.qty} />
                <Line label={t('compliance.taxable')} value={formatINR(r.taxable)} />
                <Line label={t('compliance.value')} value={formatINR(r.value)} strong />
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'itc' && itc.data ? (
          <>
            <Card>
              <Line label={t('compliance.tax')} value={formatINR(itc.data.totals.tax)} />
              <Line label={t('compliance.eligible')} value={formatINR(itc.data.totals.eligible)} strong />
              <Line label={t('compliance.blocked')} value={formatINR(itc.data.totals.blocked)} />
            </Card>
            {itc.data.rows.length === 0 ? (
              <StateView state="empty" message={t('compliance.emptyItc')} />
            ) : null}
            {itc.data.rows.map((b) => (
              <Card key={b.billId}>
                <Text style={kit.name}>
                  {b.number} · {b.supplierName}
                </Text>
                <Text style={kit.sub}>
                  {shortDate(b.date)} · {t(`compliance.status_${b.status}`, { defaultValue: b.status })}
                </Text>
                <Line label={t('compliance.tax')} value={formatINR(b.tax)} />
                {b.reason ? <Text style={kit.sub}>{b.reason}</Text> : null}
              </Card>
            ))}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}
