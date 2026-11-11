import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, k } from '../purchase/ui';
import { PERM, fetchComplaints, key } from './api';

export default function ComplaintsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const ready = client !== null && me !== null && can(PERM.view);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [text, setText] = useState('');

  const q = useQuery({
    queryKey: key(userId, 'list', `${filter}|${text}`),
    queryFn: ({ signal }) => fetchComplaints(client!, { open: filter === 'open', q: text }, signal),
    enabled: ready,
    retry: retryNetworkOnce,
  });

  if (!can(PERM.view)) return <StateView state="denied" message={t('complaints.denied')} />;

  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.complaints') }} />
      <Text style={k.title}>{t('complaints.title')}</Text>
      <Chips
        options={[
          { value: 'open', label: t('complaints.filterOpen') },
          { value: 'all', label: t('complaints.filterAll') },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as 'open' | 'all')}
      />
      <TextInput value={text} onChangeText={setText} placeholder={t('complaints.search')} accessibilityLabel={t('complaints.search')} style={k.input} />
      {can(PERM.create) ? <Button label={t('complaints.new')} onPress={() => router.push('/complaints/new')} /> : null}
      <Gate q={q} ns="complaints" emptyKey="complaints.empty" isEmpty={(q.data ?? []).length === 0}>
        {(q.data ?? []).map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`${c.ticketNo} ${c.customerName ?? ''}`}
            onPress={() => router.push({ pathname: '/complaints/[id]', params: { id: c.id } })}
            style={k.card}
          >
            <Text style={k.name}>
              {c.ticketNo} · {c.customerName ?? '-'}
            </Text>
            <Text style={k.sub}>
              {[t(`complaints.category.${c.category}`, { defaultValue: c.category }), t(`complaints.severity.${c.severity}`, { defaultValue: c.severity }), t(`complaints.status.${c.status}`, { defaultValue: c.status })].join(' · ')}
            </Text>
            {c.overdue ? <Text style={k.error}>{t('complaints.overdue')}</Text> : null}
          </Pressable>
        ))}
      </Gate>
    </ScrollView>
  );
}
