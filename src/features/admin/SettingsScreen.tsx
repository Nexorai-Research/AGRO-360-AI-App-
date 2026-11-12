import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { PERM, adminKey, fetchBranches, fetchCompany, fetchPaymentModes, fetchPolicies } from './api';
import { Card, isNetwork, k, useAccess } from './kit';
import { maskTail } from './logic';

/** View only. Every change to these settings is made on the web app. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const ready = client !== null && userId !== '';
  const seeCompany = can(PERM.company);
  const seeConfig = can(PERM.config);
  const opts = { retry: false as const };

  const company = useQuery({
    queryKey: adminKey(userId, 'company'),
    queryFn: ({ signal }) => fetchCompany(client!, signal),
    enabled: ready && seeCompany,
    ...opts,
  });
  const branches = useQuery({
    queryKey: adminKey(userId, 'branches'),
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: ready && seeConfig,
    ...opts,
  });
  const modes = useQuery({
    queryKey: adminKey(userId, 'modes'),
    queryFn: ({ signal }) => fetchPaymentModes(client!, signal),
    enabled: ready && seeConfig,
    ...opts,
  });
  const policies = useQuery({
    queryKey: adminKey(userId, 'policies'),
    queryFn: ({ signal }) => fetchPolicies(client!, signal),
    enabled: ready && seeConfig,
    ...opts,
  });

  if (!seeCompany && !seeConfig) return <StateView state="denied" message={t('settings.denied')} />;

  const all = [
    seeCompany ? company : null,
    seeConfig ? branches : null,
    seeConfig ? modes : null,
    seeConfig ? policies : null,
  ].filter((q): q is typeof company => q !== null);
  if (all.every((q) => q.isPending && q.fetchStatus !== 'idle')) return <StateView state="loading" />;
  if (all.every((q) => q.error) && all.some((q) => isNetwork(q.error)))
    return (
      <StateView
        state="offline"
        message={t('settings.offline')}
        onRetry={() => all.forEach((q) => void q.refetch())}
      />
    );

  const failed = (q: { error: unknown; refetch: () => unknown }) => (
    <Card>
      <Text style={k.error}>{isNetwork(q.error) ? t('settings.offline') : t('settings.sectionFailed')}</Text>
      <Button kind="ghost" label={t('common.retry')} onPress={() => void q.refetch()} />
    </Card>
  );
  const line = (label: string, v: string | null | undefined) =>
    v ? (
      <Text key={label} style={k.sub}>
        {label}: {v}
      </Text>
    ) : null;
  const c = company.data;

  return (
    <ScrollView contentContainerStyle={k.page}>
      <Text style={k.title}>{t('settings.title')}</Text>
      <Text style={k.sub}>{t('settings.hint')}</Text>

      {seeCompany ? (
        <>
          <Text style={k.h2}>{t('settings.company')}</Text>
          {company.error ? failed(company) : null}
          {c ? (
            <Card>
              <Text style={k.name}>{c.tradeName ?? c.legalName}</Text>
              {line(t('settings.legalName'), c.legalName)}
              {line('GSTIN', c.gstin)}
              {line('PAN', c.pan)}
              {line(t('settings.address'), c.address)}
              {line(t('settings.phone'), c.contactPhone)}
              {line(t('settings.email'), c.contactEmail)}
              {line(t('settings.bank'), c.bankName)}
              {line(t('settings.accountNumber'), maskTail(c.bankAccountNumber))}
              {line('IFSC', c.bankIfsc)}
            </Card>
          ) : null}
        </>
      ) : null}

      {seeConfig ? (
        <>
          <Text style={k.h2}>{t('settings.branches')}</Text>
          {branches.error ? failed(branches) : null}
          {branches.data?.items.length === 0 ? <Text style={k.sub}>{t('settings.none')}</Text> : null}
          {branches.data?.items.map((b) => (
            <Card key={b.id}>
              <Text style={k.name}>
                {b.name} ({b.code})
              </Text>
              <Text style={k.sub}>
                {t(b.status === 'ACTIVE' ? 'settings.active' : 'settings.inactive')}
                {b.isHeadOffice ? ` · ${t('settings.headOffice')}` : ''}
              </Text>
              {line(t('settings.address'), b.address)}
            </Card>
          ))}

          <Text style={k.h2}>{t('settings.paymentModes')}</Text>
          {modes.error ? failed(modes) : null}
          {modes.data ? (
            <Card>
              {modes.data.items.length === 0 ? <Text style={k.sub}>{t('settings.none')}</Text> : null}
              {modes.data.items.map((m) => (
                <Text key={m.code} style={k.sub}>
                  {m.code}: {t(m.enabled ? 'settings.on' : 'settings.off')}
                </Text>
              ))}
            </Card>
          ) : null}

          <Text style={k.h2}>{t('settings.policies')}</Text>
          {policies.error ? failed(policies) : null}
          {policies.data ? (
            <Card>
              <Text style={k.sub}>
                {t('settings.costing', { value: policies.data.costingMethod.effective })}
              </Text>
              {Object.entries(policies.data.settings).map(([key, s]) => (
                <Text key={key} style={k.sub}>
                  {s.description || key}: {String(s.value)}
                  {s.customised ? '' : ` (${t('settings.default')})`}
                </Text>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
      <Text style={k.sub}>{t('settings.notBuilt')}</Text>
    </ScrollView>
  );
}
