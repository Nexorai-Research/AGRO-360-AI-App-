import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import {
  HR_PERM,
  applyLeave,
  cancelLeave,
  decideLeave,
  fetchBalances,
  fetchLeaveTypes,
  fetchLeaves,
  hrKey,
  type LeaveRequest,
} from './api';
import { Card, Chips, Field, Gate, Notice, isNetwork, kit, useAction, useActionKey, useCan } from './kit';
import { checkLeave, shortDate, validRejectNote, type LeaveError } from './logic';

const ERR_KEY: Record<LeaveError, string> = {
  type: 'leave.badType',
  from: 'leave.badFrom',
  to: 'leave.badTo',
  order: 'leave.badOrder',
  year: 'leave.badYear',
  half: 'leave.badHalf',
};

export default function LeaveScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(HR_PERM.leaveSelf);
  const approver = can(HR_PERM.leaveApprove);
  const ready = client !== null && me !== null && allowed;
  const year = Number(todayIST().slice(0, 4));

  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [form, setForm] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [day, setDay] = useState<'full' | 'half'>('full');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const keys = useActionKey();
  const act = useAction(keys);

  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
  const leaves = useQuery({
    queryKey: hrKey(userId, 'leaves', scope),
    queryFn: ({ signal }) => fetchLeaves(client!, scope === 'mine' || !approver, signal),
    enabled: ready,
    retry,
  });
  const balances = useQuery({
    queryKey: hrKey(userId, 'balances', String(year)),
    queryFn: ({ signal }) => fetchBalances(client!, year, signal),
    enabled: ready,
    retry,
  });
  const types = useQuery({
    queryKey: hrKey(userId, 'leave-types'),
    queryFn: ({ signal }) => fetchLeaveTypes(client!, signal),
    enabled: ready && form,
    staleTime: 5 * 60_000,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['hr', userId] });
  const checked = checkLeave({ typeId, from, to, half: day === 'half' });
  const body = {
    leaveTypeId: typeId,
    fromDate: from.trim(),
    toDate: day === 'half' ? from.trim() : to.trim(),
    halfDay: day === 'half',
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  };

  const submit = () =>
    act.run(
      () => applyLeave(client!, body, keys.keyFor(`apply:${JSON.stringify(body)}`)),
      t('leave.applied'),
      () => {
        setForm(false);
        setReason('');
        refresh();
      },
    );

  const items: LeaveRequest[] = leaves.data?.items ?? [];

  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Text style={kit.title} accessibilityRole="header">
        {t('leave.title')}
      </Text>
      <Gate query={leaves} denied={!allowed} deniedText={t('leave.denied')} offlineText={t('leave.offline')}>
        {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
        {act.failure ? <Notice tone="error" text={act.failure} /> : null}

        {(balances.data?.items ?? []).map((b) => (
          <Card key={b.leaveTypeId}>
            <Text style={kit.name}>{b.name}</Text>
            <Text style={kit.sub}>{t('leave.remaining', { left: b.remaining, quota: b.quota })}</Text>
          </Card>
        ))}

        {allowed ? (
          form ? null : <Button label={t('leave.apply')} onPress={() => (act.clear(), keys.reset(), setForm(true))} />
        ) : null}

        {form ? (
          <Card>
            {types.isPending ? (
              <StateView state="loading" />
            ) : (types.data?.items ?? []).filter((x) => x.active).length === 0 ? (
              <StateView state="empty" message={t('leave.noTypes')} />
            ) : (
              <Chips
                label={t('leave.type')}
                options={(types.data?.items ?? []).filter((x) => x.active).map((x) => ({ id: x.id, label: x.name }))}
                value={typeId}
                onChange={setTypeId}
              />
            )}
            <Chips
              label={t('leave.dayType')}
              options={[
                { id: 'full', label: t('leave.full') },
                { id: 'half', label: t('leave.half') },
              ]}
              value={day}
              onChange={setDay}
            />
            <Field label={t('leave.from')} value={from} onChange={setFrom} placeholder="YYYY-MM-DD" />
            {day === 'full' ? <Field label={t('leave.to')} value={to} onChange={setTo} placeholder="YYYY-MM-DD" /> : null}
            <Field label={t('leave.reason')} value={reason} onChange={setReason} />
            {checked && typeId ? <Notice tone="warn" text={t(ERR_KEY[checked])} /> : null}
            <Button
              label={t('leave.submit')}
              disabled={act.busy || checked !== null}
              onPress={() => void submit()}
            />
            <Button kind="ghost" label={t('leave.close')} onPress={() => setForm(false)} />
          </Card>
        ) : null}

        {approver ? (
          <Chips
            label={t('leave.show')}
            options={[
              { id: 'mine', label: t('leave.tabMine') },
              { id: 'team', label: t('leave.tabTeam') },
            ]}
            value={scope}
            onChange={setScope}
          />
        ) : null}

        {items.length === 0 ? <StateView state="empty" message={t('leave.empty')} /> : null}
        {items.map((l) => (
          <Card key={l.id}>
            <Text style={kit.name}>
              {l.requestNo} · {l.leaveType}
            </Text>
            {scope === 'team' ? <Text style={kit.sub}>{l.employeeName}</Text> : null}
            <Text style={kit.sub}>
              {shortDate(l.fromDate)}
              {l.toDate !== l.fromDate ? ` - ${shortDate(l.toDate)}` : ''} · {t('leave.days', { days: l.days })}
              {l.halfDay ? ` (${t('leave.half')})` : ''}
            </Text>
            {l.unpaidDays !== '0.00' && l.unpaidDays !== '0' ? (
              <Text style={kit.sub}>{t('leave.unpaid', { days: l.unpaidDays })}</Text>
            ) : null}
            <Text style={kit.sub}>{t(`leave.status_${l.status}`, { defaultValue: l.status })}</Text>
            {l.decisionNote ? <Text style={kit.sub}>{l.decisionNote}</Text> : null}
            <View style={kit.row}>
              {l.status === 'SUBMITTED' || l.status === 'APPROVED' ? (
                scope === 'mine' ? (
                  <Button
                    kind="ghost"
                    label={t('leave.cancel')}
                    disabled={act.busy}
                    onPress={() =>
                      void act.run(
                        () => cancelLeave(client!, l.id, keys.keyFor(`cancel:${l.id}`)),
                        t('leave.cancelled', { no: l.requestNo }),
                        refresh,
                      )
                    }
                  />
                ) : null
              ) : null}
              {approver && scope === 'team' && l.status === 'SUBMITTED' ? (
                <>
                  <Button
                    label={t('leave.approve')}
                    disabled={act.busy}
                    onPress={() =>
                      void act.run(
                        () => decideLeave(client!, l.id, 'approve', '', keys.keyFor(`approve:${l.id}`)),
                        t('leave.approvedMsg', { no: l.requestNo }),
                        refresh,
                      )
                    }
                  />
                  <Button
                    kind="ghost"
                    label={t('leave.reject')}
                    onPress={() => (act.clear(), keys.reset(), setNote(''), setRejecting(l.id))}
                  />
                </>
              ) : null}
            </View>
            {rejecting === l.id ? (
              <View style={{ gap: 8 }}>
                <Field label={t('leave.rejectNote')} value={note} onChange={setNote} />
                {!validRejectNote(note) && note !== '' ? <Notice tone="warn" text={t('leave.badNote')} /> : null}
                <Button
                  label={t('leave.rejectNow')}
                  disabled={act.busy || !validRejectNote(note)}
                  onPress={() =>
                    void act.run(
                      () => decideLeave(client!, l.id, 'reject', note.trim(), keys.keyFor(`reject:${l.id}:${note.trim()}`)),
                      t('leave.rejectedMsg', { no: l.requestNo }),
                      () => (setRejecting(null), refresh()),
                    )
                  }
                />
              </View>
            ) : null}
          </Card>
        ))}
      </Gate>
    </ScrollView>
  );
}
