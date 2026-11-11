import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage, type ErrorMessage } from '@/api/errors';
import { newId } from '@/device';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/ui/theme';
import {
  PERM,
  branchesKey,
  customersKey,
  fetchBranches,
  fetchReceiptModes,
  modesKey,
  postReceipt,
  searchCustomers,
  type Branch,
  type CustomerLite,
  type ReceiptView,
} from './api';
import {
  createKeyKeeper,
  emptyDraft,
  todayIST,
  validateDraft,
  toBody,
  type DraftErrors,
  type DraftField,
  type ReceiptDraft,
} from './receipt';

const isNetwork = (e: unknown) => e instanceof ApiError && e.code === 'NETWORK';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T | '';
  onChange: (id: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.chips}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          accessibilityRole="radio"
          accessibilityLabel={o.label}
          accessibilityState={{ selected: value === o.id }}
          onPress={() => onChange(o.id)}
          style={[s.chip, value === o.id && s.chipOn]}
        >
          <Text style={[s.chipTxt, value === o.id && s.chipTxtOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ReceiptFormScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = me?.permissions === undefined || me.permissions.includes(PERM.receipt);

  const [draft, setDraft] = useState<ReceiptDraft>(emptyDraft);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<ErrorMessage | null>(null);
  const [lostAnswer, setLostAnswer] = useState(false);
  const [done, setDone] = useState<ReceiptView | null>(null);
  const [busy, setBusy] = useState(false);

  // One key per user action, kept across retries while the request body is unchanged. The receipt date is fixed when the form opens,
  // so a retry after midnight still sends the same body and therefore the same key.
  const keeper = useRef(createKeyKeeper(newId));
  const receiptDate = useRef(todayIST());
  const sending = useRef(false);

  const q = useDebounced(search.trim(), 300);
  const ready = client !== null && me !== null && allowed;

  const modes = useQuery({
    queryKey: modesKey(userId),
    queryFn: ({ signal }) => fetchReceiptModes(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const branches = useQuery({
    queryKey: branchesKey(userId),
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: ready,
    staleTime: 5 * 60_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const found = useQuery({
    queryKey: customersKey(userId, q),
    queryFn: ({ signal }) => searchCustomers(client!, q, signal),
    enabled: ready && q.length >= 2 && customer === null,
    staleTime: 30_000,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  // The branch list needs a permission some collectors do not hold. If they have exactly one branch in their token, use that.
  const scope =
    me && Array.isArray(me.branchScope)
      ? (me.branchScope as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
  const branchChoices: Branch[] =
    branches.data ?? (scope.length === 1 ? [{ id: scope[0]!, name: t('collections.myBranch') }] : []);
  // A single branch is chosen for the user (derived, not stored); with several, the user picks one.
  const soleBranch = branchChoices.length === 1 ? branchChoices[0]!.id : '';
  const effective: ReceiptDraft = { ...draft, branchId: draft.branchId || soleBranch };

  const set = (k: DraftField, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setFailure(null);
    setLostAnswer(false);
  };

  // Offline: a receipt moves money, so it is only saved online. There is no connectivity listener yet: offline is recognised when a call fails for lack of network.
  const offline = isNetwork(modes.error) || isNetwork(branches.error);

  async function submit() {
    if (sending.current || !client) return;
    const errs = validateDraft(effective);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setLostAnswer(false);
    const body = toBody(effective, receiptDate.current);
    const key = keeper.current.keyFor(body);
    try {
      const r = await postReceipt(client, body, key);
      keeper.current.reset();
      setDone(r);
      // dues and tasks changed on the server: do not show the old numbers
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
    } catch (e) {
      setFailure(errorMessage(e));
      setLostAnswer(isNetwork(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function another() {
    keeper.current.reset();
    receiptDate.current = todayIST();
    setDraft(emptyDraft);
    setCustomer(null);
    setSearch('');
    setErrors({});
    setFailure(null);
    setLostAnswer(false);
    setDone(null);
  }

  if (!allowed) {
    return (
      <View style={s.page}>
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.line}>{t('collections.receipt.denied')}</Text>
        </View>
      </View>
    );
  }

  if (done) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.ok}>{t('collections.receipt.success', { number: done.number })}</Text>
          <Text style={s.line}>
            {t('collections.receipt.amountLine', { amount: formatINR(done.amount) })}
          </Text>
          <Text style={s.line}>
            {t('collections.receipt.allocatedLine', { amount: formatINR(done.allocated) })}
          </Text>
          <Text style={s.line}>
            {t('collections.receipt.onAccountLine', { amount: formatINR(done.onAccount) })}
          </Text>
        </View>
        <Button label={t('collections.receipt.another')} onPress={another} />
        <Button kind="ghost" label={t('collections.receipt.back')} onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const loading =
    (modes.isPending && modes.fetchStatus !== 'idle') ||
    (branches.isPending && branches.fetchStatus !== 'idle' && branchChoices.length === 0);
  const modeOptions = (modes.data ?? []).map((m) => ({ id: m.code, label: m.code }));
  const err = (k: DraftField) =>
    errors[k] ? <Text style={s.fieldError}>{t(`collections.v.${errors[k]}`)}</Text> : null;
  const loadFailure = !offline && modes.error ? errorMessage(modes.error) : null;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{t('collections.receipt.title')}</Text>

      {offline ? (
        <View style={s.offline} accessibilityRole="alert">
          <Text style={s.offlineTxt}>{t('collections.receipt.offlineBlocked')}</Text>
          <Button
            kind="ghost"
            label={t('collections.receipt.checkAgain')}
            onPress={() => {
              void modes.refetch();
              void branches.refetch();
            }}
          />
        </View>
      ) : null}

      {loading ? (
        <View style={s.center} accessibilityLabel={t('common.loading')}>
          <ActivityIndicator color={colors.brand} />
          <Text style={s.sub}>{t('common.loading')}</Text>
        </View>
      ) : null}

      {loadFailure ? (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.error}>
            {t(loadFailure.key, {
              ...loadFailure.params,
              correlationId: loadFailure.params.correlationId ?? '-',
            })}
          </Text>
          <Button label={t('common.retry')} onPress={() => void modes.refetch()} />
        </View>
      ) : null}

      <Text style={s.label}>{t('collections.receipt.customer')}</Text>
      {customer ? (
        <View style={s.selected}>
          <Text style={s.name}>{customer.name}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('collections.receipt.changeCustomer')}
            onPress={() => {
              setCustomer(null);
              set('customerId', '');
            }}
            style={s.link}
          >
            <Text style={s.linkTxt}>{t('collections.receipt.changeCustomer')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.gap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('collections.receipt.searchCustomer')}
            accessibilityLabel={t('collections.receipt.searchCustomer')}
            autoCorrect={false}
            style={s.input}
          />
          {found.isFetching ? <ActivityIndicator color={colors.brand} /> : null}
          {found.error ? (
            <Text style={s.error}>
              {t(errorMessage(found.error).key, {
                ...errorMessage(found.error).params,
                correlationId: errorMessage(found.error).params.correlationId ?? '-',
              })}
            </Text>
          ) : null}
          {q.length >= 2 && found.data && found.data.length === 0 ? (
            <Text style={s.sub}>{t('collections.receipt.noCustomers')}</Text>
          ) : null}
          {(found.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              onPress={() => {
                setCustomer(c);
                set('customerId', c.id);
              }}
              style={s.result}
            >
              <Text style={s.name}>{c.name}</Text>
              {c.village || c.mobile ? (
                <Text style={s.sub}>{[c.village, c.mobile].filter(Boolean).join(' · ')}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
      {err('customerId')}

      {branchChoices.length > 1 ? (
        <>
          <Text style={s.label}>{t('collections.receipt.branch')}</Text>
          <Chips
            label={t('collections.receipt.branch')}
            options={branchChoices.map((b) => ({ id: b.id, label: b.name }))}
            value={draft.branchId}
            onChange={(v) => set('branchId', v)}
          />
        </>
      ) : null}
      {err('branchId')}

      <Text style={s.label}>{t('collections.receipt.mode')}</Text>
      <Chips
        label={t('collections.receipt.mode')}
        options={modeOptions}
        value={draft.modeCode}
        onChange={(v) => set('modeCode', v)}
      />
      {err('modeCode')}

      <Text style={s.label}>{t('collections.receipt.amount')}</Text>
      <TextInput
        value={draft.amount}
        onChangeText={(v) => set('amount', v)}
        placeholder="0.00"
        accessibilityLabel={t('collections.receipt.amount')}
        keyboardType="decimal-pad"
        style={s.input}
      />
      {err('amount')}

      <Text style={s.label}>{t('collections.receipt.reference')}</Text>
      <TextInput
        value={draft.reference}
        onChangeText={(v) => set('reference', v)}
        accessibilityLabel={t('collections.receipt.reference')}
        autoCorrect={false}
        style={s.input}
      />

      {draft.modeCode === 'CHEQUE' ? (
        <>
          <Text style={s.label}>{t('collections.receipt.chequeNo')}</Text>
          <TextInput
            value={draft.chequeNo}
            onChangeText={(v) => set('chequeNo', v)}
            accessibilityLabel={t('collections.receipt.chequeNo')}
            style={s.input}
          />
          {err('chequeNo')}
          <Text style={s.label}>{t('collections.receipt.chequeBank')}</Text>
          <TextInput
            value={draft.chequeBank}
            onChangeText={(v) => set('chequeBank', v)}
            accessibilityLabel={t('collections.receipt.chequeBank')}
            style={s.input}
          />
          {err('chequeBank')}
          <Text style={s.label}>{t('collections.receipt.chequeDate')}</Text>
          <TextInput
            value={draft.chequeDate}
            onChangeText={(v) => set('chequeDate', v)}
            placeholder="YYYY-MM-DD"
            accessibilityLabel={t('collections.receipt.chequeDate')}
            autoCorrect={false}
            style={s.input}
          />
          {err('chequeDate')}
        </>
      ) : null}

      {failure ? (
        <View style={s.card} accessibilityRole="alert">
          <Text style={s.error}>
            {t(failure.key, { ...failure.params, correlationId: failure.params.correlationId ?? '-' })}
          </Text>
          {lostAnswer ? <Text style={s.line}>{t('collections.receipt.lostAnswer')}</Text> : null}
        </View>
      ) : null}

      <Button
        label={busy ? t('collections.receipt.saving') : t('collections.receipt.save')}
        disabled={busy || offline || loading}
        onPress={() => void submit()}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  label: { color: colors.ink, fontWeight: '600', marginTop: 4 },
  sub: { color: colors.muted, fontSize: 13 },
  line: { color: colors.ink },
  ok: { color: colors.ok, fontWeight: '700', fontSize: 18 },
  error: { color: colors.danger },
  fieldError: { color: colors.danger, fontSize: 13 },
  center: { alignItems: 'center', gap: 8, padding: 16 },
  gap: { gap: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 6,
  },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.ink, fontSize: 15 },
  chipTxtOn: { color: colors.brandInk, fontWeight: '600' },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  name: { color: colors.ink, fontWeight: '600', fontSize: 16 },
  result: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  link: { minHeight: 44, justifyContent: 'center' },
  linkTxt: { color: colors.info, fontWeight: '600' },
  offline: { backgroundColor: '#fff4dd', borderRadius: radius, padding: 12, gap: 8 },
  offlineTxt: { color: colors.warn },
});
