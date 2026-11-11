import { useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/auth/AuthProvider';
import { MAX_LIMIT, PAGE } from '../../src/features/customers/api';
import { useCustomerSearch, useDebounced } from '../../src/features/customers/hooks';
import type { CustomerSummary } from '../../src/features/customers/types';
import { StaleBanner, StateView, isDenied } from '../../src/features/customers/ui';
import { Button } from '../../src/ui/Button';
import { colors, radius } from '../../src/ui/theme';

function Row({ c, onOpen }: { c: CustomerSummary; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={s.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.name}, ${c.code}`}
        onPress={onOpen}
        style={s.rowMain}
      >
        <Text style={s.name}>{c.name}</Text>
        <Text style={s.meta}>{[c.code, c.village, c.categoryName].filter(Boolean).join(' · ')}</Text>
        <View style={s.badges}>
          <Text style={[s.badge, c.status !== 'ACTIVE' && s.badgeOff]}>
            {t(`customers.status.${c.status}`, { defaultValue: c.status })}
          </Text>
          {c.creditHold ? <Text style={[s.badge, s.badgeBad]}>{t('customers.creditHold')}</Text> : null}
        </View>
      </Pressable>
      {c.mobile ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('customers.call')} ${c.name}`}
          onPress={() => void Linking.openURL(`tel:${c.mobile}`)}
          style={s.call}
        >
          <Text style={s.callTxt}>{t('customers.call')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function CustomersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me } = useAuth();
  const [text, setText] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useDebounced(text, 300);
  const allowed = !me?.permissions || me.permissions.includes('customer.view');
  const query = useCustomerSearch(q, limit, allowed);

  const data = query.data;
  const body =
    !allowed || (query.isError && isDenied(query.error)) ? (
      <StateView kind="denied" />
    ) : query.isPending ? (
      <StateView kind="loading" />
    ) : query.isError && !data ? (
      <StateView kind="error" error={query.error} onRetry={() => void query.refetch()} />
    ) : (
      <FlatList
        data={data}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Row
            c={item}
            onOpen={() => router.push({ pathname: '/customers/[id]', params: { id: item.id } })}
          />
        )}
        initialNumToRender={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          query.isError && query.dataUpdatedAt ? (
            <StaleBanner error={query.error} updatedAt={query.dataUpdatedAt} />
          ) : undefined
        }
        ListEmptyComponent={<StateView kind="empty" />}
        ListFooterComponent={
          data && data.length >= limit && limit < MAX_LIMIT ? (
            <Button
              kind="ghost"
              label={t('customers.loadMore')}
              disabled={query.isFetching}
              onPress={() => setLimit((l) => Math.min(l + PAGE, MAX_LIMIT))}
            />
          ) : undefined
        }
        contentContainerStyle={s.list}
      />
    );

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ headerShown: true, title: t('customers.title') }} />
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setLimit(PAGE);
        }}
        placeholder={t('customers.search')}
        accessibilityLabel={t('customers.search')}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={s.input}
      />
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  input: {
    minHeight: 48,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  list: { gap: 8, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowMain: { flex: 1, minHeight: 64, padding: 12, gap: 2 },
  name: { fontSize: 17, fontWeight: '600', color: colors.ink },
  meta: { color: colors.muted, fontSize: 13 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: {
    fontSize: 12,
    color: colors.ok,
    backgroundColor: colors.brandSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeOff: { color: colors.muted, backgroundColor: colors.line },
  badgeBad: { color: colors.danger, backgroundColor: 'rgba(180, 35, 42, 0.12)' },
  call: {
    minWidth: 64,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  callTxt: { color: colors.brand, fontWeight: '600' },
});
