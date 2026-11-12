import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { SUPPLIER_PERM } from './supplier-logic';
import { StateView } from '../stock/StateView';
import { PERM, fetchApprovals, fetchOrders, fetchReceipts, fetchSuppliers, key, type OrderRow } from './api';
import { Gate, retryNetworkOnce } from './Gate';
import { Chips, k } from './ui';

type Tab = 'orders' | 'approvals' | 'suppliers' | 'receipts';
const STATUSES = ['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'PART_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'];

export default function PurchaseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);

  const [tab, setTab] = useState<Tab>('orders');
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');

  const orders = useQuery({
    queryKey: key(userId, 'orders', status),
    queryFn: ({ signal }) => fetchOrders(client!, status, signal),
    enabled: ready && tab === 'orders',
    retry: retryNetworkOnce,
  });
  const approvals = useQuery({
    queryKey: key(userId, 'approvals'),
    queryFn: ({ signal }) => fetchApprovals(client!, signal),
    enabled: ready && tab === 'approvals' && can(PERM.approve),
    retry: retryNetworkOnce,
  });
  const suppliers = useQuery({
    queryKey: key(userId, 'suppliers', text),
    queryFn: ({ signal }) => fetchSuppliers(client!, text, signal),
    enabled: ready && tab === 'suppliers',
    retry: retryNetworkOnce,
  });
  const receipts = useQuery({
    queryKey: key(userId, 'receipts'),
    queryFn: ({ signal }) => fetchReceipts(client!, signal),
    enabled: ready && tab === 'receipts',
    retry: retryNetworkOnce,
  });

  if (!can(PERM.view)) return <StateView state="denied" message={t('purchase.denied')} />;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'orders', label: t('purchase.tabOrders') },
    ...(can(PERM.approve) ? [{ value: 'approvals' as Tab, label: t('purchase.tabApprovals') }] : []),
    { value: 'suppliers', label: t('purchase.tabSuppliers') },
    { value: 'receipts', label: t('purchase.tabReceipts') },
  ];
  const open = (id: string) => router.push({ pathname: '/purchase/[id]', params: { id } });

  const orderCard = (o: OrderRow) => (
    <Pressable
      key={o.id}
      accessibilityRole="button"
      accessibilityLabel={`${o.number ?? t('purchase.draft')} ${o.supplierName}`}
      onPress={() => open(o.id)}
      style={k.card}
    >
      <Text style={k.name}>
        {o.number ?? t('purchase.draft')} · {formatINR(o.total)}
      </Text>
      <Text style={k.sub}>{[o.supplierName, o.orderDate, t(`purchase.status.${o.status}`, { defaultValue: o.status })].join(' · ')}</Text>
    </Pressable>
  );

  const active = tab === 'orders' ? orders : tab === 'approvals' ? approvals : tab === 'suppliers' ? suppliers : receipts;

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.purchase') }} />
      <Text style={k.title}>{t('purchase.title')}</Text>
      <Chips options={tabs} value={tab} onChange={(v) => setTab(v as Tab)} />

      {tab === 'orders' ? (
        <>
          <Chips
            options={STATUSES.map((s) => ({ value: s, label: s ? t(`purchase.status.${s}`, { defaultValue: s }) : t('purchase.all') }))}
            value={status}
            onChange={setStatus}
          />
          {can(PERM.create) ? <Button label={t('purchase.newOrder')} onPress={() => router.push('/purchase/order-new')} /> : null}
          <Gate q={orders} ns="purchase" emptyKey="purchase.emptyOrders" isEmpty={(orders.data ?? []).length === 0}>
            {(orders.data ?? []).map(orderCard)}
          </Gate>
        </>
      ) : null}

      {tab === 'approvals' ? (
        <Gate q={approvals} ns="purchase" emptyKey="purchase.emptyApprovals" isEmpty={(approvals.data ?? []).length === 0}>
          {(approvals.data ?? []).map(orderCard)}
        </Gate>
      ) : null}

      {tab === 'suppliers' ? (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('purchase.searchSuppliers')}
            accessibilityLabel={t('purchase.searchSuppliers')}
            style={k.input}
          />
          {can(SUPPLIER_PERM) ? <Button label={t('supplierForm.new')} onPress={() => router.push('/purchase/supplier-form' as never)} /> : null}
          <Gate q={suppliers} ns="purchase" emptyKey="purchase.emptySuppliers" isEmpty={(suppliers.data ?? []).length === 0}>
            {(suppliers.data ?? []).map((s) => (
              <View key={s.id} style={k.card}>
                <Text style={k.name}>{s.name}</Text>
                <Text style={k.sub}>
                  {[s.code, s.gstin ?? t('purchase.noGstin'), t('purchase.creditDays', { days: s.creditDays }), s.status].join(' · ')}
                </Text>
                {can(SUPPLIER_PERM) ? (
                  <Button kind="ghost" label={`${t('supplierForm.edit')} ${s.name}`} onPress={() => router.push({ pathname: '/purchase/supplier-form', params: { id: s.id } } as never)} />
                ) : null}
              </View>
            ))}
          </Gate>
        </>
      ) : null}

      {tab === 'receipts' ? (
        <Gate q={receipts} ns="purchase" emptyKey="purchase.emptyReceipts" isEmpty={(receipts.data ?? []).length === 0}>
          {(receipts.data ?? []).map((g) => (
            <View key={g.id} style={k.card}>
              <Text style={k.name}>
                {g.number ?? t('purchase.draft')} · {formatINR(g.value)}
              </Text>
              <Text style={k.sub}>
                {[g.supplierName, g.receiptDate, g.poNumber ?? t('purchase.noOrder'), t(`purchase.status.${g.status}`, { defaultValue: g.status })].join(' · ')}
              </Text>
            </View>
          ))}
        </Gate>
      ) : null}
    </ScrollView>
  );
}
