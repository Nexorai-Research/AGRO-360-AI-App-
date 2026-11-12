import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chips, Field, k } from '../purchase/ui';
import type { AccountRef } from './fx-api';

/** Search by code or name, then pick one of the first few matches. A chart can hold hundreds of accounts. */
export function AccountPicker({
  label,
  accounts,
  value,
  onChange,
  error,
}: {
  label: string;
  accounts: AccountRef[];
  value: string;
  onChange: (id: string) => void;
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = accounts
    .filter(
      (a) => needle === '' || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle),
    )
    .slice(0, 8);
  const picked = accounts.find((a) => a.id === value);
  return (
    <View style={k.field}>
      <Text style={k.label}>
        {label}
        {picked ? `: ${picked.code} ${picked.name}` : ''}
      </Text>
      <Field label={t('fx.searchAccount')} value={q} onChange={setQ} />
      <Chips
        options={hits.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
        value={value}
        onChange={onChange}
      />
      {error ? <Text style={k.error}>{error}</Text> : null}
    </View>
  );
}
