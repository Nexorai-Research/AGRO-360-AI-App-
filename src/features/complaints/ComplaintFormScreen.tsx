import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { searchCustomers } from '../customers/api';
import { StateView } from '../stock/StateView';
import { Chips, Field, Notice, k, useActionKey, useErrorText } from '../purchase/ui';
import { CATEGORIES, PERM, SEVERITIES, createComplaint, key } from './api';
import { buildComplaintBody, complaintErrors, type ComplaintDraft } from './logic';

export default function ComplaintFormScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const errText = useErrorText();
  const { me, client } = useAuth();
  const userId = me?.userId ?? '';
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const actionKey = useActionKey();

  const [d, setD] = useState<ComplaintDraft>({ customerId: '', category: '', severity: 'MEDIUM', description: '', batchNo: '' });
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const found = useQuery({
    queryKey: key(userId, 'customers', term),
    queryFn: ({ signal }) => searchCustomers(client!, { q: term, limit: 8, signal }),
    enabled: client !== null && can(PERM.create) && term.trim().length >= 2,
  });

  if (!can(PERM.create)) return <StateView state="denied" message={t('complaints.deniedCreate')} />;

  const errors = complaintErrors(d);
  const has = (e: (typeof errors)[number]) => tried && errors.includes(e);

  async function save() {
    setTried(true);
    if (errors.length > 0 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const body = buildComplaintBody(d);
      const r = await createComplaint(client!, body, actionKey.keyFor(JSON.stringify(body)));
      actionKey.reset();
      router.replace({ pathname: '/complaints/[id]', params: { id: r.id } });
    } catch (e) {
      setFailure(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('complaints.new') }} />
      <Field label={t('complaints.customer')} value={term} onChange={setTerm} />
      {picked ? <Text style={k.ok}>{t('complaints.picked', { name: picked })}</Text> : null}
      {(found.data ?? []).map((c) => (
        <Button
          key={c.id}
          kind="ghost"
          label={`${c.name}${c.village ? ` · ${c.village}` : ''}`}
          onPress={() => {
            setD({ ...d, customerId: c.id });
            setPicked(c.name);
            setTerm('');
          }}
        />
      ))}
      {has('customer') ? <Text style={k.error}>{t('complaints.v.customer')}</Text> : null}

      <Text style={k.label}>{t('complaints.categoryLabel')}</Text>
      <Chips options={CATEGORIES.map((c) => ({ value: c, label: t(`complaints.category.${c}`) }))} value={d.category} onChange={(v) => setD({ ...d, category: v })} />
      {has('category') ? <Text style={k.error}>{t('complaints.v.category')}</Text> : null}

      <Text style={k.label}>{t('complaints.severityLabel')}</Text>
      <Chips options={SEVERITIES.map((c) => ({ value: c, label: t(`complaints.severity.${c}`) }))} value={d.severity} onChange={(v) => setD({ ...d, severity: v })} />

      <Field label={t('complaints.description')} value={d.description} onChange={(v) => setD({ ...d, description: v })} multiline error={has('description') ? t('complaints.v.description') : null} />
      <Field label={t('complaints.batch')} value={d.batchNo} onChange={(v) => setD({ ...d, batchNo: v })} autoCapitalize="characters" error={has('batch') ? t('complaints.v.batch') : null} />

      {failure ? <Notice tone="error" text={failure} /> : null}
      <Button label={t('complaints.save')} disabled={busy} onPress={() => void save()} />
    </ScrollView>
  );
}
