import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { isDate } from '../hr/logic';
import {
  ATT_STATUS,
  P,
  fetchAttendanceDays,
  fetchSheet,
  fetchSheetCsv,
  monthRange,
  stfKey,
  type AttendanceDay,
  type SheetRow,
} from './api';
import {
  Banner,
  Card,
  Chips,
  Field,
  Gate,
  Line,
  MonthPicker,
  Notice,
  Screen,
  isNetwork,
  kit,
  shareText,
  useCan,
  useWrite,
} from './ui';
import { StateView } from '../stock/StateView';
import { useFailureText } from '../hr/kit';

const HM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const hm = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(11, 16) : '';

export default function AttendanceRegisterScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(P.attView) || can(P.attManage);
  const ready = client !== null && me !== null && allowed;
  const [period, setPeriod] = useState(todayIST().slice(0, 7));
  const [pick, setPick] = useState<SheetRow | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const failText = useFailureText();
  const [shareErr, setShareErr] = useState<string | null>(null);

  const sheet = useQuery({
    queryKey: stfKey(userId, 'sheet', period),
    queryFn: ({ signal }) => fetchSheet(client!, period, signal),
    enabled: ready && pick === null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });

  const exportCsv = async () => {
    setShareMsg(null);
    setShareErr(null);
    try {
      const f = await fetchSheetCsv(client!, period);
      setShareMsg((await shareText(f.fileName, f.content)) ? t('stf.shared') : t('stf.shareFailed'));
    } catch (e) {
      setShareErr(failText(e));
    }
  };

  if (pick) {
    return (
      <Screen title={t('stf.att.title')}>
        <EmployeeDays
          row={pick}
          period={period}
          onBack={() => {
            setPick(null);
            void qc.invalidateQueries({ queryKey: ['stf', userId, 'sheet'] });
          }}
        />
      </Screen>
    );
  }
  return (
    <Screen title={t('stf.att.title')}>
      <MonthPicker value={period} onChange={setPeriod} />
      <Gate query={sheet} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        {shareMsg ? <Notice tone="ok" text={shareMsg} /> : null}
        {shareErr ? <Notice tone="error" text={shareErr} /> : null}
        <Button kind="ghost" label={t('stf.att.exportCsv')} onPress={() => void exportCsv()} />
        <Text style={kit.sub}>{t('stf.att.legend')}</Text>
        {(sheet.data?.rows ?? []).length === 0 ? (
          <StateView state="empty" message={t('stf.att.empty')} />
        ) : null}
        {(sheet.data?.rows ?? []).map((r) => (
          <Card key={r.employeeId}>
            <Text style={kit.name}>
              {r.code} · {r.name}
            </Text>
            <Line label={t('stf.att.present')} value={String(r.present)} />
            <Line label={t('stf.att.half')} value={String(r.half)} />
            <Line label={t('stf.att.leave')} value={String(r.leave)} />
            <Line label={t('stf.att.absent')} value={String(r.absent)} />
            <Line label={t('stf.att.unmarked')} value={String(r.unmarked)} />
            <Text style={kit.sub} accessibilityLabel={t('stf.att.days')}>
              {(sheet.data?.days ?? []).map((d) => r.days[d] || '.').join(' ')}
            </Text>
            {can(P.attManage) ? (
              <Button kind="ghost" label={t('stf.att.openDays')} onPress={() => setPick(r)} />
            ) : null}
          </Card>
        ))}
      </Gate>
    </Screen>
  );
}

function EmployeeDays({ row, period, onBack }: { row: SheetRow; period: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const range = monthRange(period);
  const w = useWrite();
  const [form, setForm] = useState<{ date: string; status: string } | null>(null);
  const days = useQuery({
    queryKey: stfKey(userId, 'att-days', row.employeeId, period),
    queryFn: ({ signal }) => fetchAttendanceDays(client!, { ...range, employeeId: row.employeeId }, signal),
    enabled: client !== null,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  return (
    <>
      <Text style={kit.name}>
        {row.code} · {row.name} · {period}
      </Text>
      <Banner w={w} />
      {form ? (
        <MarkForm
          employeeId={row.employeeId}
          initial={form}
          w={w}
          onDone={() => {
            setForm(null);
            void qc.invalidateQueries({ queryKey: ['stf', userId, 'att-days'] });
          }}
          onCancel={() => setForm(null)}
        />
      ) : (
        <Button
          label={t('stf.att.markDay')}
          onPress={() => (w.clear(), setForm({ date: todayIST(), status: 'PRESENT' }))}
        />
      )}
      <Gate query={days} denied={false} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        {(days.data?.items ?? []).length === 0 ? (
          <StateView state="empty" message={t('stf.att.noDays')} />
        ) : null}
        {(days.data?.items ?? []).map((d: AttendanceDay) => (
          <Card key={d.id}>
            <Text style={kit.name}>
              {d.date} · {t(`stf.att.st_${d.status}`, { defaultValue: d.status })}
            </Text>
            <Text style={kit.sub}>
              {[
                hm(d.checkIn) && `${hm(d.checkIn)} - ${hm(d.checkOut) || '?'}`,
                d.method,
                d.flag,
                d.correctionReason,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Button
              kind="ghost"
              label={t('stf.att.correct')}
              onPress={() => (w.clear(), setForm({ date: d.date, status: d.status }))}
            />
          </Card>
        ))}
      </Gate>
      <Button kind="ghost" label={t('stf.back')} onPress={onBack} />
    </>
  );
}

function MarkForm({
  employeeId,
  initial,
  w,
  onDone,
  onCancel,
}: {
  employeeId: string;
  initial: { date: string; status: string };
  w: ReturnType<typeof useWrite>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(initial.date);
  const [status, setStatus] = useState(initial.status);
  const [cin, setCin] = useState('');
  const [cout, setCout] = useState('');
  const [reason, setReason] = useState('');
  const dateBad = !isDate(date) || date > todayIST();
  const inBad = cin !== '' && !HM.test(cin);
  const outBad = cout !== '' && (!HM.test(cout) || (cin !== '' && cout < cin));
  const valid = !dateBad && !inBad && !outBad && reason.trim().length >= 3;
  const send = () =>
    w.send(
      'POST',
      '/hr/attendance/mark',
      {
        employeeId,
        date: date.trim(),
        status,
        ...(cin ? { checkIn: cin } : {}),
        ...(cout ? { checkOut: cout } : {}),
        reason: reason.trim(),
      },
      t('stf.att.corrected'),
      onDone,
    );
  return (
    <Card>
      <Text style={kit.sub}>{t('stf.att.afterPayroll')}</Text>
      <Field
        label={t('stf.date')}
        value={date}
        onChange={setDate}
        placeholder="YYYY-MM-DD"
        error={dateBad ? t('stf.att.badDate') : null}
      />
      <Chips
        label={t('stf.status')}
        options={ATT_STATUS.map((s) => ({ id: s, label: t(`stf.att.st_${s}`) }))}
        value={status as (typeof ATT_STATUS)[number]}
        onChange={setStatus}
      />
      <Field
        label={t('stf.att.checkIn')}
        value={cin}
        onChange={setCin}
        placeholder="HH:MM"
        error={inBad ? t('stf.att.badTime') : null}
      />
      <Field
        label={t('stf.att.checkOut')}
        value={cout}
        onChange={setCout}
        placeholder="HH:MM"
        error={outBad ? t('stf.att.badTime') : null}
      />
      <Field
        label={t('stf.reason')}
        value={reason}
        onChange={setReason}
        error={reason !== '' && reason.trim().length < 3 ? t('stf.reasonShort') : null}
      />
      <Button label={t('stf.save')} disabled={w.busy || !valid} onPress={() => void send()} />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}
