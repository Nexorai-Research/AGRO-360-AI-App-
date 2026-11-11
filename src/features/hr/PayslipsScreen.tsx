import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { StateView } from '../stock/StateView';
import { HR_PERM, fetchPayslips, hrKey, type Payslip } from './api';
import { Card, Gate, Line, isNetwork, kit, useCan } from './kit';

/** "2026-10" -> "Oct 2026" (no time zone involved). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const periodName = (p: string): string => {
  const [y, m] = p.split('-');
  const n = MONTHS[Number(m) - 1];
  return n && y ? `${n} ${y}` : p;
};

function Detail({ p }: { p: Payslip }) {
  const { t } = useTranslation();
  return (
    <>
      <Line label={t('payslips.paidDays')} value={`${p.paidDays} / ${p.workingDays}`} />
      {p.earnings.map((e) => (
        <Line key={`e-${e.code}`} label={e.name} value={formatINR(e.amount)} />
      ))}
      {p.incentive !== '0.00' ? <Line label={t('payslips.incentive')} value={formatINR(p.incentive)} /> : null}
      <Line label={t('payslips.gross')} value={formatINR(p.gross)} strong />
      {p.deductions
        .filter((d) => !d.memo)
        .map((d) => (
          <Line key={`d-${d.code}`} label={d.name} value={`- ${formatINR(d.amount)}`} />
        ))}
      {p.advanceRecovery !== '0.00' ? (
        <Line label={t('payslips.advance')} value={`- ${formatINR(p.advanceRecovery)}`} />
      ) : null}
      <Line label={t('payslips.deductions')} value={formatINR(p.totalDeductions)} strong />
      <Line label={t('payslips.paid')} value={formatINR(p.paidAmount)} />
    </>
  );
}

export default function PayslipsScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const userId = me?.userId ?? '';
  const allowed = can(HR_PERM.payslip);
  const [open, setOpen] = useState<string | null>(null);

  const q = useQuery({
    queryKey: hrKey(userId, 'payslips'),
    queryFn: ({ signal }) => fetchPayslips(client!, signal),
    enabled: client !== null && me !== null && allowed,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const items = q.data?.items ?? [];

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">
        {t('payslips.title')}
      </Text>
      <Gate query={q} denied={!allowed} deniedText={t('payslips.denied')} offlineText={t('payslips.offline')}>
        {items.length === 0 ? <StateView state="empty" message={t('payslips.empty')} /> : null}
        {items.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={periodName(p.period)}
            accessibilityState={{ expanded: open === p.id }}
            onPress={() => setOpen(open === p.id ? null : p.id)}
          >
            <Card>
              <Text style={kit.name}>{periodName(p.period)}</Text>
              <Line label={t('payslips.net')} value={formatINR(p.net)} strong />
              {open === p.id ? <Detail p={p} /> : <Text style={kit.sub}>{t('payslips.tapOpen')}</Text>}
            </Card>
          </Pressable>
        ))}
      </Gate>
    </ScrollView>
  );
}
