import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Line, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';
import { Check } from '@/ui/kit';

// Web parity 3.5: compliance settings (apps/web/src/pages/compliance.js settingsTab; GET/PUT /compliance/settings).
export interface ComplianceSettings {
  hsnDigits: number;
  itcTolerance: string;
  b2cLargeLimit: string;
  rcmEnabled: boolean;
  tdsEnabled: boolean;
  docAlertDays: number[];
  version: number;
}
export interface SettingsForm {
  hsnDigits: string;
  itcTolerance: string;
  b2cLargeLimit: string;
  docAlertDays: string;
  rcmEnabled: boolean;
  /** Web parity 6.6: the web's TDS tab switches this with the same PUT. */
  tdsEnabled: boolean;
}
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
export type SettingsError = 'tolerance' | 'b2c' | 'days';
export function settingsErrors(f: SettingsForm): SettingsError[] {
  const e: SettingsError[] = [];
  if (!AMOUNT.test(f.itcTolerance.trim())) e.push('tolerance');
  if (!AMOUNT.test(f.b2cLargeLimit.trim())) e.push('b2c');
  // like the web: every lead time a whole number of days; a stray letter or trailing comma is an error
  const days = (f.docAlertDays.trim() || '60,30,7').split(',').map((x) => x.trim());
  if (days.some((x) => !/^[1-9][0-9]{0,3}$/.test(x))) e.push('days');
  return e;
}
export const settingsBody = (f: SettingsForm) => ({
  hsnDigits: Number(f.hsnDigits),
  itcTolerance: f.itcTolerance.trim(),
  b2cLargeLimit: f.b2cLargeLimit.trim(),
  docAlertDays: (f.docAlertDays.trim() || '60,30,7').split(',').map((x) => Number(x.trim())),
  rcmEnabled: f.rcmEnabled,
  tdsEnabled: f.tdsEnabled,
});

export function ComplianceSettingsCard() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const userId = me?.userId ?? '';
  const [f, setF] = useState<SettingsForm | null>(null);
  const [tried, setTried] = useState(false);
  const q = useQuery({
    queryKey: ['cmp', userId, 'settings'],
    queryFn: ({ signal }) => client!.get<ComplianceSettings>('/compliance/settings', { signal }),
    enabled: client !== null && me !== null && can('compliance.gst.view'),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  // shown only when the answer has the settings shape (an older server or another answer must not break the hub)
  const s = q.data;
  if (
    !s ||
    typeof s.hsnDigits !== 'number' ||
    typeof s.itcTolerance !== 'string' ||
    typeof s.b2cLargeLimit !== 'string' ||
    !Array.isArray(s.docAlertDays)
  )
    return null;
  const errs = f ? settingsErrors(f) : [];
  const bad = (e: SettingsError) => (tried && errs.includes(e) ? t(`wp3.set.v.${e}`) : null);
  return (
    <Card>
      <Text style={kit.name}>{t('wp3.set.title')}</Text>
      <Line label={t('wp3.set.hsn')} value={String(s.hsnDigits)} />
      <Line label={t('wp3.set.tolerance')} value={formatINR(s.itcTolerance)} />
      <Line label={t('wp3.set.b2c')} value={formatINR(s.b2cLargeLimit)} />
      <Line label={t('wp3.set.rcm')} value={t(s.rcmEnabled ? 'wp3.set.on' : 'wp3.set.off')} />
      <Line label={t('wp3.set.tds')} value={t(s.tdsEnabled ? 'wp3.set.on' : 'wp3.set.off')} />
      <Line label={t('wp3.set.days')} value={s.docAlertDays.join(', ')} />
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {can('compliance.settings.manage') && !f ? (
        <Button
          kind="ghost"
          label={t('wp3.set.change')}
          onPress={() => (
            act.clear(),
            keys.reset(),
            setF({
              hsnDigits: String(s.hsnDigits),
              itcTolerance: s.itcTolerance,
              b2cLargeLimit: s.b2cLargeLimit,
              docAlertDays: s.docAlertDays.join(','),
              rcmEnabled: s.rcmEnabled,
              tdsEnabled: s.tdsEnabled === true,
            })
          )}
        />
      ) : null}
      {f ? (
        <>
          <Chips
            label={t('wp3.set.hsn')}
            options={['4', '6', '8'].map((d) => ({ id: d, label: t('wp3.set.digits', { n: d }) }))}
            value={f.hsnDigits}
            onChange={(v) => setF({ ...f, hsnDigits: v })}
          />
          <Field
            label={t('wp3.set.tolerance')}
            value={f.itcTolerance}
            onChange={(v) => setF({ ...f, itcTolerance: v })}
            keyboard="decimal-pad"
            error={bad('tolerance')}
          />
          <Field
            label={t('wp3.set.b2c')}
            value={f.b2cLargeLimit}
            onChange={(v) => setF({ ...f, b2cLargeLimit: v })}
            keyboard="decimal-pad"
            error={bad('b2c')}
          />
          <Field
            label={t('wp3.set.daysEdit')}
            value={f.docAlertDays}
            onChange={(v) => setF({ ...f, docAlertDays: v })}
            error={bad('days')}
          />
          <Check
            label={t('wp3.set.rcmOn')}
            value={f.rcmEnabled}
            onChange={(v) => setF({ ...f, rcmEnabled: v })}
          />
          <Check
            label={t('wp6.tdsOn')}
            value={f.tdsEnabled}
            onChange={(v) => setF({ ...f, tdsEnabled: v })}
          />
          <Button
            label={t('wp3.set.save')}
            disabled={act.busy}
            onPress={() => {
              setTried(true);
              if (settingsErrors(f).length > 0) return;
              const body = settingsBody(f);
              void act.run(
                () =>
                  client!.put('/compliance/settings', {
                    body,
                    version: s.version,
                    idempotencyKey: keys.keyFor(`${s.version}|${JSON.stringify(body)}`),
                  }),
                t('wp3.set.saved'),
                () => (setF(null), setTried(false), void qc.invalidateQueries({ queryKey: ['cmp', userId] })),
              );
            }}
          />
          <Button kind="ghost" label={t('cmp.cancel')} onPress={() => (setF(null), setTried(false))} />
        </>
      ) : null}
    </Card>
  );
}
