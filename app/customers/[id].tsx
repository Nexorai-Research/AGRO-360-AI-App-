import { useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCustomer360, useCustomerLedger } from '../../src/features/customers/hooks';
import type { Customer360, LedgerEntry } from '../../src/features/customers/types';
import { CreditPanel } from '../../src/features/customers/CreditPanel';
import { CrmActions } from '../../src/features/customers/CrmActions';
import { FarmEditor } from '../../src/features/customers/FarmEditor';
import { LoyaltyAdjust } from '../../src/features/customers/LoyaltyAdjust';
import { MoreSections } from '../../src/features/customers/MoreSections';
import { StaleBanner, StateView, fmtDate, isDenied, useErrorText } from '../../src/features/customers/ui';
import { dec, formatINR } from '../../src/money';
import { Button } from '../../src/ui/Button';
import { colors, radius } from '../../src/ui/theme';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={s.field}>
      <Text style={s.fl}>{label}</Text>
      <Text style={s.fv}>{value}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card} accessibilityRole="summary" accessibilityLabel={title}>
      <Text style={s.h}>{title}</Text>
      {children}
    </View>
  );
}

function Header({
  d,
  canEdit,
  canLedger,
  ledgerOpen,
  onShowLedger,
  ledgerState,
}: {
  d: Customer360;
  canEdit: boolean;
  canLedger: boolean;
  ledgerOpen: boolean;
  onShowLedger: () => void;
  ledgerState: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const p = d.profile;
  const cr = d.credit;
  const seasons = [d.purchases.thisSeason, d.purchases.lastSeason];
  return (
    <View style={s.header}>
      <Card title={p.name}>
        <Field label={t('customers.code')} value={p.code} />
        <Field label={t('customers.mobile')} value={p.mobile} />
        <Field label={t('customers.altMobile')} value={p.altMobile} />
        <Field
          label={t('customers.village')}
          value={[p.village, p.taluka, p.district].filter(Boolean).join(', ')}
        />
        <Field label={t('customers.category')} value={p.categoryName} />
        <Field label={t('customers.gstin')} value={p.gstin} />
        <Field
          label={t('customers.status.label')}
          value={t(`customers.status.${p.status}`, { defaultValue: p.status })}
        />
        {canEdit ? (
          <Button
            kind="ghost"
            label={t('customers.form.edit')}
            onPress={() => router.push({ pathname: '/customers/form', params: { id: p.id } } as never)}
          />
        ) : null}
        {p.mobile ? (
          <Button
            label={`${t('customers.call')} ${p.mobile}`}
            onPress={() => void Linking.openURL(`tel:${p.mobile}`)}
          />
        ) : null}
      </Card>

      <Card title={t('customers.credit')}>
        {cr ? (
          <>
            {cr.hold ? (
              <Text style={s.hold}>
                {t('customers.creditHold')}
                {cr.holdReason ? `: ${cr.holdReason}` : ''}
              </Text>
            ) : null}
            <Field label={t('customers.creditLimit')} value={formatINR(cr.creditLimit)} />
            <Field label={t('customers.outstanding')} value={formatINR(cr.outstanding)} />
            <Field label={t('customers.available')} value={formatINR(cr.available)} />
          </>
        ) : (
          <Text style={s.muted}>{t('customers.creditHidden')}</Text>
        )}
      </Card>

      <Card title={t('customers.seasons')}>
        {seasons.map((x) => (
          <View key={`${x.season}${x.year}`} style={s.line}>
            <Text style={s.fv}>
              {t(`customers.season.${x.season}`, { defaultValue: x.season })} {x.year}
            </Text>
            <Text style={s.fv}>
              {x.invoices} · {formatINR(x.amount)}
            </Text>
          </View>
        ))}
      </Card>

      <Card title={t('customers.recent')}>
        {d.recentPurchases.length === 0 ? <Text style={s.muted}>{t('customers.noPurchases')}</Text> : null}
        {d.recentPurchases.map((l, i) => (
          <View key={`${l.invoice_id}-${i}`} style={s.purchase}>
            <Text style={s.fv}>{l.sku_name}</Text>
            <Text style={s.muted}>
              {l.number} · {fmtDate(l.d)} · {l.qty} × {formatINR(l.unit_price)} = {formatINR(l.line_total)}
            </Text>
            {!dec(l.returned).isZero() ? (
              <Text style={s.warn}>{t('customers.returned', { qty: l.returned })}</Text>
            ) : null}
          </View>
        ))}
      </Card>

      <CreditPanel customerId={p.id} />
      <MoreSections customerId={p.id} />
      <FarmEditor customerId={p.id} />
      <CrmActions customerId={p.id} />
      <LoyaltyAdjust customerId={p.id} />

      {canLedger ? (
        <Card title={t('customers.ledger')}>
          {ledgerOpen ? (
            ledgerState
          ) : (
            <Button kind="ghost" label={t('customers.showLedger')} onPress={onShowLedger} />
          )}
        </Card>
      ) : null}
    </View>
  );
}

function LedgerRow({ e }: { e: LedgerEntry }) {
  return (
    <View style={s.ledgerRow}>
      <View style={s.ledgerL}>
        <Text style={s.fv}>{fmtDate(e.date)}</Text>
        <Text style={s.muted}>{e.purpose || e.sourceType}</Text>
      </View>
      <View style={s.ledgerR}>
        <Text style={s.fv}>
          {dec(e.debit).isZero() ? `- ${formatINR(e.credit)}` : `+ ${formatINR(e.debit)}`}
        </Text>
        <Text style={s.muted}>{formatINR(e.balance)}</Text>
      </View>
    </View>
  );
}

export default function Customer360Screen() {
  const { t } = useTranslation();
  const errText = useErrorText();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const [showLedger, setShowLedger] = useState(false);
  const allowed = !me?.permissions || me.permissions.includes('customer.view');
  const canLedger = !me?.permissions || me.permissions.includes('customer.ledger.view');
  const canEdit = !me?.permissions || me.permissions.includes('customer.update');
  const q = useCustomer360(allowed ? id : '');
  const ledger = useCustomerLedger(id, showLedger && canLedger);

  const title = q.data?.profile.name ?? t('customers.title');
  let body: React.ReactNode;
  if (!allowed || (q.isError && isDenied(q.error))) body = <StateView kind="denied" />;
  else if (q.isPending) body = <StateView kind="loading" />;
  else if (q.isError && !q.data)
    body = <StateView kind="error" error={q.error} onRetry={() => void q.refetch()} />;
  else if (q.data) {
    const ledgerState = ledger.isPending ? (
      <StateView kind="loading" />
    ) : ledger.isError && isDenied(ledger.error) ? (
      <StateView kind="denied" />
    ) : ledger.isError ? (
      <StateView kind="error" error={ledger.error} onRetry={() => void ledger.refetch()} />
    ) : ledger.data ? (
      <View>
        <View style={s.line}>
          <Text style={s.muted}>{t('customers.opening')}</Text>
          <Text style={s.fv}>{formatINR(ledger.data.opening)}</Text>
        </View>
        <View style={s.line}>
          <Text style={s.muted}>{t('customers.closing')}</Text>
          <Text style={s.fv}>{formatINR(ledger.data.closing)}</Text>
        </View>
        {ledger.data.entries.length === 0 ? <Text style={s.muted}>{t('customers.noLedger')}</Text> : null}
      </View>
    ) : null;
    const entries = showLedger && ledger.data ? [...ledger.data.entries].reverse() : [];
    body = (
      <FlatList
        data={entries}
        keyExtractor={(e, i) => `${e.journalId}-${i}`}
        renderItem={({ item }) => <LedgerRow e={item} />}
        initialNumToRender={15}
        windowSize={7}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View>
            {q.isError ? <StaleBanner error={q.error} updatedAt={q.dataUpdatedAt} /> : null}
            <Header
              d={q.data}
              canEdit={canEdit}
              canLedger={canLedger}
              ledgerOpen={showLedger}
              onShowLedger={() => setShowLedger(true)}
              ledgerState={ledgerState}
            />
          </View>
        }
      />
    );
  }

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ headerShown: true, title }} />
      {body}
      {q.isFetching && q.data ? <Text style={s.refresh}>{t('common.loading')}</Text> : null}
      {ledger.isError && !isDenied(ledger.error) && ledger.data ? (
        <Text style={s.warn}>{errText(ledger.error)}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 32 },
  header: { gap: 12, marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  h: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  fl: { color: colors.muted, fontSize: 14 },
  fv: { color: colors.ink, fontSize: 15, flexShrink: 1, textAlign: 'right' },
  muted: { color: colors.muted, fontSize: 13 },
  warn: { color: colors.warn, fontSize: 13 },
  hold: { color: colors.danger, fontWeight: '600' },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  purchase: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  ledgerL: { flex: 1 },
  ledgerR: { alignItems: 'flex-end' },
  refresh: { position: 'absolute', bottom: 8, alignSelf: 'center', color: colors.muted, fontSize: 12 },
});
