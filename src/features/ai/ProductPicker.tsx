import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { k } from '../purchase/ui';
import { searchAiProducts, type ProductRef } from './api';

/** Type 2 or more letters, pick one product. Waits 300 ms after typing so a fast typist makes one call. */
export function ProductPicker({
  value,
  onPick,
}: {
  value: ProductRef | null;
  onPick: (p: ProductRef | null) => void;
}) {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  const res = useQuery({
    queryKey: ['ai', 'product-search', me?.userId ?? '', q],
    queryFn: ({ signal }) => searchAiProducts(client!, q, signal),
    enabled: !!client && q.length >= 2 && !value,
  });
  if (value)
    return (
      <View style={k.card}>
        <Text style={k.name}>{value.name}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ai.pc.change')}
          onPress={() => (onPick(null), setText(''), setQ(''))}
        >
          <Text style={k.ok}>{t('ai.pc.change')}</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={k.field}>
      <Text style={k.label}>{t('ai.pc.search')}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        accessibilityLabel={t('ai.pc.search')}
        autoCorrect={false}
        style={k.input}
      />
      {res.isError ? (
        <Text style={k.error}>{t('errors.generic', { code: 'SEARCH', correlationId: '-' })}</Text>
      ) : null}
      {(res.data ?? []).map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={p.name}
          onPress={() => onPick(p)}
          style={k.card}
        >
          <Text style={k.name}>{p.name}</Text>
          {p.code ? <Text style={k.sub}>{p.code}</Text> : null}
        </Pressable>
      ))}
      {q.length >= 2 && res.data && res.data.length === 0 ? (
        <Text style={k.sub}>{t('ai.pc.none')}</Text>
      ) : null}
    </View>
  );
}
