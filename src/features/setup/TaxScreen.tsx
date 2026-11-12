import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import {
  SP,
  TAX_KINDS,
  addTaxRate,
  fetchHsn,
  fetchTaxRates,
  fetchTaxSetting,
  mapHsn,
  saveTaxSetting,
  skey,
  type TaxKind,
} from './api';
import { buildRate, rateErrors, validDate, validHsn, type RateForm } from './logic';

const emptyRate = (): RateForm => ({
  code: '',
  name: '',
  kind: 'GST',
  ratePct: '',
  effectiveFrom: '',
  reason: '',
});

export default function TaxScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [mode, setMode] = useState<null | 'rate' | 'hsn'>(null);
  const [rate, setRate] = useState<RateForm>(emptyRate());
  const [hsn, setHsn] = useState({ hsnCode: '', taxCode: '', effectiveFrom: '' });
  const [tried, setTried] = useState(false);
  const [setting, setSetting] = useState<{ compositionScheme: boolean; rounding: 'PAISA' | 'RUPEE' } | null>(
    null,
  );
  const ok = s.ready && s.can(SP.view);

  const rates = useQuery({
    queryKey: skey(s.userId, 'rates'),
    queryFn: ({ signal }) => fetchTaxRates(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const maps = useQuery({
    queryKey: skey(s.userId, 'hsn'),
    queryFn: ({ signal }) => fetchHsn(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const cfg = useQuery({
    queryKey: skey(s.userId, 'taxcfg'),
    queryFn: ({ signal }) => fetchTaxSetting(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(SP.view)) return <StateView state="denied" message={t('setup.denied')} />;
  const manage = s.can(SP.tax);

  function close() {
    setMode(null);
    setTried(false);
    key.reset();
  }
  const rErr = rateErrors(rate);
  const bad = (e: string) => (tried && rErr.includes(e as never) ? t(`setup.tax.v.${e}`) : null);
  function saveRate() {
    setTried(true);
    if (rateErrors(rate).length > 0) return;
    const body = buildRate(rate);
    void s.act(
      t('setup.tax.rateAdded'),
      () => addTaxRate(s.client!, body, key.keyFor(`r|${JSON.stringify(body)}`)),
      () => (close(), setRate(emptyRate())),
    );
  }
  const hsnBad = {
    hsn: tried && !validHsn(hsn.hsnCode),
    tax: tried && hsn.taxCode === '',
    date: tried && !validDate(hsn.effectiveFrom),
  };
  function saveHsn() {
    setTried(true);
    if (!validHsn(hsn.hsnCode) || hsn.taxCode === '' || !validDate(hsn.effectiveFrom)) return;
    const body = {
      hsnCode: hsn.hsnCode.trim(),
      taxCode: hsn.taxCode,
      effectiveFrom: hsn.effectiveFrom.trim(),
    };
    void s.act(
      t('setup.tax.hsnMapped'),
      () => mapHsn(s.client!, body, key.keyFor(`h|${JSON.stringify(body)}`)),
      () => (close(), setHsn({ hsnCode: '', taxCode: '', effectiveFrom: '' })),
    );
  }
  function saveCfg() {
    if (!setting || !cfg.data) return;
    const body = setting;
    void s.act(
      t('setup.tax.cfgSaved'),
      () =>
        saveTaxSetting(
          s.client!,
          cfg.data!.version,
          body,
          key.keyFor(`c|${cfg.data!.version}|${JSON.stringify(body)}`),
        ),
      () => (setSetting(null), key.reset()),
    );
  }

  const current = rates.data?.current ?? [];
  return (
    <ScrollView
      contentContainerStyle={k.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={rates.isRefetching}
          onRefresh={() => {
            void rates.refetch();
            void maps.refetch();
            void cfg.refetch();
          }}
        />
      }
    >
      <Stack.Screen options={{ headerShown: true, title: t('nav.setupTax') }} />
      <Text style={k.title}>{t('setup.tax.title')}</Text>
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}

      <Text style={k.h2}>{t('setup.tax.settings')}</Text>
      <Gate q={cfg} ns="setup" emptyKey="setup.denied" isEmpty={false}>
        {cfg.data ? (
          <View style={k.card}>
            {setting ? (
              <>
                <Text style={k.label}>{t('setup.tax.composition')}</Text>
                <Chips
                  options={[
                    { value: 'on', label: t('setup.on') },
                    { value: 'off', label: t('setup.off') },
                  ]}
                  value={setting.compositionScheme ? 'on' : 'off'}
                  onChange={(v) => setSetting({ ...setting, compositionScheme: v === 'on' })}
                />
                <Text style={k.label}>{t('setup.tax.rounding')}</Text>
                <Chips
                  options={[
                    { value: 'PAISA', label: t('setup.tax.paisa') },
                    { value: 'RUPEE', label: t('setup.tax.rupee') },
                  ]}
                  value={setting.rounding}
                  onChange={(v) => setSetting({ ...setting, rounding: v as 'PAISA' | 'RUPEE' })}
                />
                <View style={k.row}>
                  <Button label={t('setup.save')} disabled={s.busy} onPress={saveCfg} />
                  <Button kind="ghost" label={t('setup.cancel')} onPress={() => setSetting(null)} />
                </View>
              </>
            ) : (
              <>
                <Text style={k.name}>
                  {t('setup.tax.composition')}: {t(cfg.data.compositionScheme ? 'setup.on' : 'setup.off')}
                </Text>
                <Text style={k.sub}>
                  {t('setup.tax.rounding')}:{' '}
                  {t(cfg.data.rounding === 'PAISA' ? 'setup.tax.paisa' : 'setup.tax.rupee')}
                </Text>
                {manage ? (
                  <Button
                    kind="ghost"
                    label={t('setup.tax.changeSettings')}
                    onPress={() => (
                      key.reset(),
                      setSetting({
                        compositionScheme: cfg.data!.compositionScheme,
                        rounding: cfg.data!.rounding,
                      })
                    )}
                  />
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </Gate>

      <Text style={k.h2}>{t('setup.tax.rates')}</Text>
      {manage && mode === null ? (
        <Button label={t('setup.tax.addRate')} onPress={() => (key.reset(), setMode('rate'))} />
      ) : null}
      {mode === 'rate' ? (
        <View style={k.card}>
          <Text style={k.sub}>{t('setup.tax.rateIntro')}</Text>
          <Field
            label={t('setup.tax.code')}
            value={rate.code}
            onChange={(v) => setRate({ ...rate, code: v.toUpperCase() })}
            autoCapitalize="characters"
            error={bad('code')}
          />
          <Field
            label={t('setup.tax.name')}
            value={rate.name}
            onChange={(v) => setRate({ ...rate, name: v })}
            error={bad('name')}
          />
          <Chips
            options={TAX_KINDS.map((x) => ({ value: x, label: x }))}
            value={rate.kind}
            onChange={(v) => setRate({ ...rate, kind: v as TaxKind })}
          />
          <Field
            label={t('setup.tax.ratePct')}
            value={rate.ratePct}
            onChange={(v) => setRate({ ...rate, ratePct: v })}
            keyboard="decimal-pad"
            error={bad('rate')}
          />
          <Field
            label={t('setup.tax.effectiveFrom')}
            value={rate.effectiveFrom}
            onChange={(v) => setRate({ ...rate, effectiveFrom: v })}
            placeholder="YYYY-MM-DD"
            error={bad('date')}
          />
          <Field
            label={t('setup.tax.reasonOpt')}
            value={rate.reason}
            onChange={(v) => setRate({ ...rate, reason: v })}
            error={bad('reason')}
          />
          <View style={k.row}>
            <Button label={t('setup.save')} disabled={s.busy} onPress={saveRate} />
            <Button kind="ghost" label={t('setup.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Gate q={rates} ns="setup" emptyKey="setup.tax.noRates" isEmpty={current.length === 0}>
        {current.map((r) => (
          <View key={r.id} style={k.card}>
            <Text style={k.name}>
              {r.code} · {r.name}
            </Text>
            <Text style={k.sub}>
              {r.kind} · {r.ratePct.replace(/\.?0+$/, '')}% · {t('setup.tax.from', { date: r.effectiveFrom })}
            </Text>
          </View>
        ))}
      </Gate>

      <Text style={k.h2}>{t('setup.tax.hsn')}</Text>
      {manage && mode === null ? (
        <Button label={t('setup.tax.mapHsn')} onPress={() => (key.reset(), setMode('hsn'))} />
      ) : null}
      {mode === 'hsn' ? (
        <View style={k.card}>
          <Field
            label={t('setup.tax.hsnCode')}
            value={hsn.hsnCode}
            onChange={(v) => setHsn({ ...hsn, hsnCode: v })}
            keyboard="numeric"
            error={hsnBad.hsn ? t('setup.tax.v.hsn') : null}
          />
          <Text style={k.label}>{t('setup.tax.taxCode')}</Text>
          <Chips
            options={current.map((r) => ({
              value: r.code,
              label: `${r.code} (${r.ratePct.replace(/\.?0+$/, '')}%)`,
            }))}
            value={hsn.taxCode}
            onChange={(v) => setHsn({ ...hsn, taxCode: v })}
          />
          {hsnBad.tax ? <Text style={k.error}>{t('setup.tax.v.taxCode')}</Text> : null}
          <Field
            label={t('setup.tax.effectiveFrom')}
            value={hsn.effectiveFrom}
            onChange={(v) => setHsn({ ...hsn, effectiveFrom: v })}
            placeholder="YYYY-MM-DD"
            error={hsnBad.date ? t('setup.tax.v.date') : null}
          />
          <View style={k.row}>
            <Button label={t('setup.save')} disabled={s.busy} onPress={saveHsn} />
            <Button kind="ghost" label={t('setup.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Gate q={maps} ns="setup" emptyKey="setup.tax.noHsn" isEmpty={(maps.data?.current ?? []).length === 0}>
        {(maps.data?.current ?? []).map((m) => (
          <View key={`${m.hsnCode}|${m.effectiveFrom}`} style={k.card}>
            <Text style={k.name}>
              {m.hsnCode} → {m.taxCode}
            </Text>
            <Text style={k.sub}>{t('setup.tax.from', { date: m.effectiveFrom })}</Text>
          </View>
        ))}
      </Gate>
    </ScrollView>
  );
}
