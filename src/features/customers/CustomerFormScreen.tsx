import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { Button } from '@/ui/Button';
import { Card, Check, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import {
  CPERM,
  createCustomer,
  fetchCustomerCategories,
  fetchCustomerFull,
  updateCustomer,
} from './form-api';
import {
  LANGS,
  draftOf,
  emptyDraft,
  isChanged,
  toBody,
  validateDraft,
  type CustomerDraft,
  type CustomerFull,
  type DraftErrors,
} from './form-logic';

/** Waits for the customer when editing, then mounts the form with it as the starting values. */
export default function CustomerFormScreen() {
  const { me, client } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const cur = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'full', id ?? ''],
    queryFn: ({ signal }) => fetchCustomerFull(client!, id!, signal),
    enabled: client !== null && me !== null && !!id,
  });
  if (id && cur.isPending && cur.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (id && !cur.data && cur.error) {
    const m = errorMessage(cur.error);
    return <StateView state="error" message={m.key} onRetry={() => void cur.refetch()} />;
  }
  return <CustomerForm key={id ?? 'new'} customer={cur.data ?? null} />;
}

function CustomerForm({ customer }: { customer: CustomerFull | null }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const creating = customer === null;
  const can = (p: string) => me?.permissions === undefined || me.permissions.includes(p);
  const allowed = can(creating ? CPERM.create : CPERM.update);
  const ak = useActionKey();
  const [d, setD] = useState<CustomerDraft>(customer ? draftOf(customer) : emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);

  const cats = useQuery({
    queryKey: ['customers', me?.tenantId ?? '', me?.userId ?? '', 'categories'],
    queryFn: ({ signal }) => fetchCustomerCategories(client!, signal),
    enabled: client !== null && me !== null && allowed,
    staleTime: 5 * 60_000,
  });

  const set = <K extends keyof CustomerDraft>(k: K, v: CustomerDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setFailure(null);
    setDup(false);
  };
  const err = (k: keyof CustomerDraft) => (errors[k] ? t(`customers.form.v.${errors[k]}`) : null);

  async function save(confirmDuplicate = false) {
    if (busy || !client) return;
    const e = validateDraft(d);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const changes = toBody(d, customer);
    if (!creating && !isChanged(changes)) {
      setFailure({ key: 'customers.form.nothingChanged', params: { code: 'NOCHANGE' } });
      return;
    }
    const body = { ...changes, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) };
    setBusy(true);
    setFailure(null);
    try {
      const r = creating
        ? await createCustomer(client, body, ak.keyFor(JSON.stringify(body)))
        : await updateCustomer(
            client,
            customer.id,
            customer.version,
            body,
            ak.keyFor(`${customer.id}|${customer.version}|${JSON.stringify(body)}`),
          );
      ak.reset();
      void qc.invalidateQueries({ queryKey: ['customers'] });
      setSaved({ id: r?.id ?? customer?.id ?? '', name: r?.name ?? d.name.trim() });
    } catch (x) {
      if (x instanceof ApiError && x.code === 'DUPLICATE_WARNING') setDup(true);
      else setFailure(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <StateView state="denied" message={t('customers.denied')} />;
  if (saved)
    return (
      <ScrollView contentContainerStyle={kit.page}>
        <Notice
          tone="ok"
          text={t(creating ? 'customers.form.created' : 'customers.form.saved', { name: saved.name })}
        />
        {saved.id ? (
          <Button
            label={t('customers.form.open')}
            onPress={() => router.replace({ pathname: '/customers/[id]', params: { id: saved.id } } as never)}
          />
        ) : null}
        <Button
          kind="ghost"
          label={t('customers.form.backToList')}
          onPress={() => router.replace('/customers' as never)}
        />
      </ScrollView>
    );

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t(creating ? 'customers.form.new' : 'customers.form.edit')}</Text>
      <Field
        label={t('customers.form.name')}
        value={d.name}
        onChange={(v) => set('name', v)}
        error={err('name')}
      />
      <Field
        label={t('customers.mobile')}
        value={d.mobile}
        onChange={(v) => set('mobile', v)}
        keyboard="phone-pad"
        error={err('mobile')}
      />
      <Field
        label={t('customers.altMobile')}
        value={d.altMobile}
        onChange={(v) => set('altMobile', v)}
        keyboard="phone-pad"
        error={err('altMobile')}
      />
      <Check
        label={t('customers.form.sharedMobile')}
        value={d.sharedMobile}
        onChange={(v) => set('sharedMobile', v)}
      />
      <Field
        label={t('customers.village')}
        value={d.village}
        onChange={(v) => set('village', v)}
        error={err('village')}
      />
      <Field
        label={t('customers.form.taluka')}
        value={d.taluka}
        onChange={(v) => set('taluka', v)}
        error={err('taluka')}
      />
      <Field
        label={t('customers.form.district')}
        value={d.district}
        onChange={(v) => set('district', v)}
        error={err('district')}
      />
      <Field
        label={t('customers.form.stateCode')}
        value={d.stateCode}
        onChange={(v) => set('stateCode', v)}
        keyboard="number-pad"
        error={err('stateCode')}
      />
      <Field
        label={t('customers.form.pin')}
        value={d.pin}
        onChange={(v) => set('pin', v)}
        keyboard="number-pad"
        error={err('pin')}
      />
      <Field
        label={t('customers.gstin')}
        value={d.gstin}
        onChange={(v) => set('gstin', v)}
        error={err('gstin')}
      />
      <Chips
        label={t('customers.category')}
        options={(cats.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
        value={d.categoryId}
        onChange={(v) => set('categoryId', v)}
      />
      <Chips
        label={t('customers.form.language')}
        options={LANGS.map((l) => ({ id: l, label: t(`customers.form.lang.${l}`) }))}
        value={d.language as 'en'}
        onChange={(v) => set('language', v)}
      />
      {failure ? (
        <Notice
          tone="error"
          text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
        />
      ) : null}
      {dup ? (
        <Card>
          <Notice tone="warn" text={t('customers.form.duplicate')} />
          <Button label={t('customers.form.createAnyway')} disabled={busy} onPress={() => void save(true)} />
        </Card>
      ) : null}
      <Button
        label={busy ? t('common.loading') : t('customers.form.save')}
        disabled={busy}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}
