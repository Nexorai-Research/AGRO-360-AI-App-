import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider';
import type { ApiClient } from '../../api/client';
import { dec, formatINR } from '../../money';
import { Button } from '../../ui/Button';
import { colors, radius } from '../../ui/theme';
import {
  SECTIONS,
  SECTION_PERM,
  fetchActivity,
  fetchConsents,
  fetchFarms,
  fetchHousehold,
  fetchKyc,
  fetchLoyalty,
  type SectionKey,
} from './more-api';
import { StateView, fmtDate, isDenied, isNetwork } from './ui';

/** One section: closed until the user opens it, then one read-only query. Nothing is loaded for a section that stays closed. */
function Section<T>({
  customerId,
  name,
  load,
  empty,
  children,
}: {
  customerId: string;
  name: SectionKey;
  load: (c: ApiClient, id: string, signal: AbortSignal) => Promise<T>;
  empty: (d: T) => boolean;
  children: (d: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'more', name, customerId],
    enabled: open && client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
    queryFn: ({ signal }) => load(client!, customerId, signal),
  });
  let body: ReactNode = null;
  if (open) {
    if (q.isPending) body = <StateView kind="loading" />;
    else if (q.isError && isDenied(q.error)) body = <StateView kind="denied" />;
    else if (q.isError) body = <StateView kind="error" error={q.error} onRetry={() => void q.refetch()} />;
    else if (q.data !== undefined && empty(q.data))
      body = <Text style={s.muted}>{t(`customers.more.${name}Empty`)}</Text>;
    else if (q.data !== undefined) body = children(q.data);
  }
  return (
    <View style={s.card}>
      <Button
        kind="ghost"
        label={`${open ? '▾' : '▸'} ${t(`customers.more.${name}`)}`}
        onPress={() => setOpen((v) => !v)}
      />
      {body}
    </View>
  );
}

const Row = ({ a, b }: { a: string; b?: string | null }) => (
  <View style={s.row}>
    <Text style={s.fv}>{a}</Text>
    {b ? <Text style={s.muted}>{b}</Text> : null}
  </View>
);

/** Farms, KYC documents, loyalty, household, consent and activity of one customer. Read only. */
export function MoreSections({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const can = (k: SectionKey) => !me?.permissions || me.permissions.includes(SECTION_PERM[k]);
  const shown = SECTIONS.filter(can);
  const secs: Record<SectionKey, ReactNode> = {
    farms: (
      <Section customerId={customerId} name="farms" load={fetchFarms} empty={(d) => d.length === 0}>
        {(d) => (
          <>
            {d.map((f) => (
              <View key={f.id} style={s.item}>
                <Row
                  a={f.name}
                  b={`${t(`customers.more.own.${f.ownership}`, { defaultValue: f.ownership })} · ${f.areaAcres ?? f.plotAcres} ${t('customers.more.acres')}`}
                />
                {f.plots.map((p) => (
                  <Text key={p.id} style={s.muted}>
                    {[p.name, `${p.areaAcres} ${t('customers.more.acres')}`, p.soilType, p.irrigationSource]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ))}
              </View>
            ))}
          </>
        )}
      </Section>
    ),
    kyc: (
      <Section customerId={customerId} name="kyc" load={fetchKyc} empty={(d) => d.length === 0}>
        {(d) => (
          <>
            {d.map((k) => (
              <View key={k.id} style={s.item}>
                <Row a={k.docType} b={k.numberMasked} />
                <Text style={k.expired ? s.warn : s.muted}>
                  {k.expired ? t('customers.more.expired') : k.status}
                  {k.expiresOn ? ` · ${t('customers.more.expiresOn', { date: fmtDate(k.expiresOn) })}` : ''}
                </Text>
              </View>
            ))}
            <Text style={s.muted}>{t('customers.more.kycNote')}</Text>
          </>
        )}
      </Section>
    ),
    loyalty: (
      <Section
        customerId={customerId}
        name="loyalty"
        load={fetchLoyalty}
        empty={(d) => !d.eligible && !d.tier && d.points === 0}
      >
        {(d) => (
          <>
            <Row
              a={d.tier ? d.tier.name : t('customers.more.noTier')}
              b={`${d.points} ${t('customers.more.points')}`}
            />
            <Text style={s.muted}>
              {t('customers.more.spend', { amount: formatINR(d.spend), count: d.invoices })}
            </Text>
            {d.nextTier ? (
              <Text style={s.muted}>
                {t('customers.more.nextTier', {
                  name: d.nextTier.name,
                  amount: formatINR(dec(d.nextTier.minSpend).minus(d.spend).clamp(0, Infinity).toFixed(2)),
                })}
              </Text>
            ) : null}
          </>
        )}
      </Section>
    ),
    household: (
      <Section customerId={customerId} name="household" load={fetchHousehold} empty={(d) => d === null}>
        {(d) =>
          d ? (
            <>
              <Text style={s.fv}>{d.name}</Text>
              {d.members.map((m) => (
                <View key={m.customerId} style={s.item}>
                  <Row a={m.name} b={m.relationship} />
                  <Text style={s.muted}>
                    {[
                      m.code,
                      m.mobile,
                      m.customerId === d.decisionMakerCustomerId ? t('customers.more.decider') : null,
                      m.customerId === d.payerCustomerId ? t('customers.more.payer') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </>
          ) : null
        }
      </Section>
    ),
    consents: (
      <Section customerId={customerId} name="consents" load={fetchConsents} empty={(d) => d.length === 0}>
        {(d) => (
          <>
            {d.map((c) => (
              <Row
                key={`${c.purpose}-${c.channel}`}
                a={`${c.purpose} · ${c.channel}`}
                b={c.granted ? t('customers.more.granted') : t('customers.more.refused')}
              />
            ))}
          </>
        )}
      </Section>
    ),
    activity: (
      <Section customerId={customerId} name="activity" load={fetchActivity} empty={(d) => d.length === 0}>
        {(d) => (
          <>
            {d.map((i) => (
              <View key={i.id} style={s.item}>
                <Row a={i.kind} b={fmtDate(i.occurredAt.slice(0, 10))} />
                <Text style={s.muted}>{i.notes}</Text>
                {i.cropIssue ? (
                  <Text style={s.muted}>{t('customers.more.issue', { text: i.cropIssue })}</Text>
                ) : null}
                {i.advice ? (
                  <Text style={s.muted}>{t('customers.more.advice', { text: i.advice })}</Text>
                ) : null}
                {i.followUpOn ? (
                  <Text style={s.warn}>{t('customers.more.followUp', { date: fmtDate(i.followUpOn) })}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </Section>
    ),
  };
  if (shown.length === 0) return null;
  return (
    <View style={s.wrap} accessibilityLabel={t('customers.more.title')}>
      <Text style={s.h}>{t('customers.more.title')}</Text>
      {shown.map((k) => (
        <View key={k}>{secs[k]}</View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  h: { fontSize: 18, fontWeight: '700', color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    gap: 6,
  },
  item: { paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  fv: { color: colors.ink, fontSize: 15, flexShrink: 1 },
  muted: { color: colors.muted, fontSize: 13 },
  warn: { color: colors.warn, fontSize: 13 },
});
