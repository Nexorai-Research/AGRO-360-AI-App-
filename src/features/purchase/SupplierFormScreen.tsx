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
  SUPPLIER_PERM,
  SUPPLIER_TYPES,
  createSupplier,
  draftOfSupplier,
  emptySupplier,
  fetchSupplier,
  supplierBody,
  updateSupplier,
  validateSupplier,
  type SupplierDraft,
  type SupplierErrors,
  type SupplierFull,
} from './supplier-logic';

/** Waits for the supplier when editing, then mounts the form with it as the starting values. */
export default function SupplierFormScreen() {
  const { me, client } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const cur = useQuery({
    queryKey: ['purchase', 'supplier-one', me?.userId ?? '', id ?? ''],
    queryFn: ({ signal }) => fetchSupplier(client!, id!, signal),
    enabled: client !== null && me !== null && !!id,
  });
  if (id && cur.isPending && cur.fetchStatus !== 'idle') return <StateView state="loading" />;
  if (id && !cur.data && cur.error)
    return (
      <StateView state="error" message={errorMessage(cur.error).key} onRetry={() => void cur.refetch()} />
    );
  return <SupplierForm key={id ?? 'new'} supplier={cur.data ?? null} />;
}

function SupplierForm({ supplier }: { supplier: SupplierFull | null }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const creating = supplier === null;
  const allowed = !me?.permissions || me.permissions.includes(SUPPLIER_PERM);
  const ak = useActionKey();
  const [d, setD] = useState<SupplierDraft>(supplier ? draftOfSupplier(supplier) : emptySupplier);
  const [errors, setErrors] = useState<SupplierErrors>({});
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const set = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setFailure(null);
    setDup(false);
  };
  const err = (k: keyof SupplierDraft) => (errors[k] ? t(`supplierForm.v.${errors[k]}`) : null);

  async function save(confirmDuplicate = false) {
    if (busy || !client) return;
    const e = validateSupplier(d);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const changes = supplierBody(d, supplier);
    if (!creating && Object.keys(changes).length === 0) {
      setFailure({ key: 'supplierForm.nothingChanged', params: { code: 'NOCHANGE' } });
      return;
    }
    const body = { ...changes, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) };
    setBusy(true);
    setFailure(null);
    try {
      const r = creating
        ? await createSupplier(client, body, ak.keyFor(JSON.stringify(body)))
        : await updateSupplier(
            client,
            supplier.id,
            supplier.version,
            body,
            ak.keyFor(`${supplier.id}|${supplier.version}|${JSON.stringify(body)}`),
          );
      ak.reset();
      void qc.invalidateQueries({ queryKey: ['purchase'] });
      setSaved(r?.name ?? d.name.trim());
    } catch (x) {
      if (x instanceof ApiError && x.code === 'DUPLICATE_WARNING') setDup(true);
      else setFailure(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <StateView state="denied" message={t('supplierForm.denied')} />;
  if (saved)
    return (
      <ScrollView contentContainerStyle={kit.page}>
        <Notice
          tone="ok"
          text={t(creating ? 'supplierForm.created' : 'supplierForm.saved', { name: saved })}
        />
        <Button label={t('supplierForm.back')} onPress={() => router.replace('/purchase' as never)} />
      </ScrollView>
    );
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title}>{t(creating ? 'supplierForm.new' : 'supplierForm.edit')}</Text>
      <Field
        label={t('supplierForm.name')}
        value={d.name}
        onChange={(v) => set('name', v)}
        error={err('name')}
      />
      <Chips
        label={t('supplierForm.type')}
        options={SUPPLIER_TYPES.map((x) => ({ id: x as string, label: t(`supplierForm.types.${x}`) }))}
        value={d.type}
        onChange={(v) => set('type', v)}
      />
      <Field
        label={t('supplierForm.stateCode')}
        value={d.stateCode}
        onChange={(v) => set('stateCode', v)}
        keyboard="number-pad"
        error={err('stateCode')}
      />
      <Field label="GSTIN" value={d.gstin} onChange={(v) => set('gstin', v)} error={err('gstin')} />
      <Field label="PAN" value={d.pan} onChange={(v) => set('pan', v)} error={err('pan')} />
      <Field
        label={t('supplierForm.address')}
        value={d.address}
        onChange={(v) => set('address', v)}
        error={err('address')}
      />
      <Field
        label={t('supplierForm.creditDays')}
        value={d.creditDays}
        onChange={(v) => set('creditDays', v)}
        keyboard="number-pad"
        error={err('creditDays')}
      />
      <Field
        label={t('supplierForm.creditLimit')}
        value={d.creditLimit}
        onChange={(v) => set('creditLimit', v)}
        keyboard="decimal-pad"
        error={err('creditLimit')}
      />
      <Field
        label={t('supplierForm.leadTime')}
        value={d.leadTimeDays}
        onChange={(v) => set('leadTimeDays', v)}
        keyboard="number-pad"
        error={err('leadTimeDays')}
      />
      <Field
        label={t('supplierForm.terms')}
        value={d.paymentTerms}
        onChange={(v) => set('paymentTerms', v)}
        error={err('paymentTerms')}
      />
      <Check
        label={t('supplierForm.tds')}
        value={d.tdsApplicable}
        onChange={(v) => set('tdsApplicable', v)}
      />
      <Check
        label={t('supplierForm.tcs')}
        value={d.tcsApplicable}
        onChange={(v) => set('tcsApplicable', v)}
      />
      {failure ? (
        <Notice
          tone="error"
          text={t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
        />
      ) : null}
      {dup ? (
        <Card>
          <Notice tone="warn" text={t('supplierForm.duplicate')} />
          <Button label={t('supplierForm.saveAnyway')} disabled={busy} onPress={() => void save(true)} />
        </Card>
      ) : null}
      <Button
        label={busy ? t('common.loading') : t('supplierForm.save')}
        disabled={busy}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}
