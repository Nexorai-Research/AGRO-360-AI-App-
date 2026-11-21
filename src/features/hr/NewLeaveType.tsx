import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Check } from '@/ui/kit';
import { HR_PERM } from './api';
import { Card, Field, Notice, kit, useAction, useActionKey, useCan } from './kit';

// Web parity 9a.3 (apps/web/src/pages/hr.js leaveTab "New leave type"); rules from modules/hr/src/application/leave.ts.
export interface LeaveTypeForm {
  code: string;
  name: string;
  yearlyQuota: string;
  paid: boolean;
  carryForward: boolean;
}
export type LeaveTypeError = 'code' | 'name' | 'quota';
export function leaveTypeErrors(f: LeaveTypeForm): LeaveTypeError[] {
  const e: LeaveTypeError[] = [];
  if (!/^[A-Z0-9_]{2,20}$/.test(f.code.trim().toUpperCase())) e.push('code');
  if (f.name.trim().length < 2 || f.name.trim().length > 80) e.push('name');
  const q = f.yearlyQuota.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(q) || Number(q) > 366) e.push('quota');
  return e;
}
export const leaveTypeBody = (f: LeaveTypeForm) => ({
  code: f.code.trim().toUpperCase(),
  name: f.name.trim(),
  yearlyQuota: f.yearlyQuota.trim(),
  paid: f.paid,
  carryForward: f.carryForward,
});
export const createLeaveType = (c: ApiClient, body: ReturnType<typeof leaveTypeBody>, key: string) =>
  c.post<unknown>('/hr/leave-types', { body, idempotencyKey: key });

const blank = (): LeaveTypeForm => ({ code: '', name: '', yearlyQuota: '', paid: true, carryForward: false });

export function NewLeaveType() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<LeaveTypeForm | null>(null);
  const [tried, setTried] = useState(false);
  if (!can(HR_PERM.leaveApprove)) return null;
  if (!f)
    return (
      <>
        {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        <Button
          kind="ghost"
          label={t('wp9.lt.new')}
          onPress={() => (act.clear(), keys.reset(), setF(blank()), setTried(false))}
        />
      </>
    );
  const errs = leaveTypeErrors(f);
  const bad = (e: LeaveTypeError) => (tried && errs.includes(e) ? t(`wp9.lt.v.${e}`) : null);
  return (
    <Card>
      <Text style={kit.name}>{t('wp9.lt.title')}</Text>
      <Field
        label={t('wp9.lt.code')}
        value={f.code}
        onChange={(code) => setF({ ...f, code })}
        error={bad('code')}
      />
      <Field
        label={t('wp9.lt.name')}
        value={f.name}
        onChange={(name) => setF({ ...f, name })}
        error={bad('name')}
      />
      <Field
        label={t('wp9.lt.quota')}
        value={f.yearlyQuota}
        onChange={(yearlyQuota) => setF({ ...f, yearlyQuota })}
        keyboard="decimal-pad"
        error={bad('quota')}
      />
      <Check label={t('wp9.lt.paid')} value={f.paid} onChange={(paid) => setF({ ...f, paid })} />
      <Check
        label={t('wp9.lt.carry')}
        value={f.carryForward}
        onChange={(carryForward) => setF({ ...f, carryForward })}
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <View style={kit.row}>
        <Button
          label={t('wp9.lt.save')}
          disabled={act.busy}
          onPress={() => {
            setTried(true);
            if (errs.length > 0) return;
            const body = leaveTypeBody(f);
            void act.run(
              () => createLeaveType(client!, body, keys.keyFor(JSON.stringify(body))),
              t('wp9.lt.saved'),
              () => (setF(null), void qc.invalidateQueries({ queryKey: ['hr', me?.userId ?? ''] })),
            );
          }}
        />
        <Button kind="ghost" label={t('leave.close')} onPress={() => setF(null)} />
      </View>
    </Card>
  );
}
