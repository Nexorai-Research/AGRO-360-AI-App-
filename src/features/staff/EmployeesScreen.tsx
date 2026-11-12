import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { isDate, shortDate } from '../hr/logic';
import { StateView } from '../stock/StateView';
import {
  EMPLOYMENT,
  P,
  fetchBranches,
  fetchEmployee,
  fetchEmployees,
  stfKey,
  type Employee,
  type EmployeeBody,
} from './api';
import { Banner, Card, Chips, Field, Gate, Line, Screen, isNetwork, kit, useCan, useWrite, yn } from './ui';

type Mode =
  { k: 'list' } | { k: 'view'; id: string } | { k: 'form'; id: string | null } | { k: 'exit'; emp: Employee };

const STATUSES = ['', 'ACTIVE', 'ON_LEAVE', 'EXITED'] as const;
const clean = (v: string) => (v.trim() === '' ? null : v.trim());

export default function EmployeesScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(P.employee);
  const ready = client !== null && me !== null && allowed;
  const [mode, setMode] = useState<Mode>({ k: 'list' });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const w = useWrite();
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

  const list = useQuery({
    queryKey: stfKey(userId, 'employees', q, status),
    queryFn: ({ signal }) =>
      fetchEmployees(
        client!,
        { ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}) },
        signal,
      ),
    enabled: ready && mode.k === 'list',
    retry,
  });
  const detailId = mode.k === 'view' ? mode.id : mode.k === 'form' ? mode.id : null;
  const detail = useQuery({
    queryKey: stfKey(userId, 'employee', detailId ?? ''),
    queryFn: ({ signal }) => fetchEmployee(client!, detailId!, signal),
    enabled: ready && detailId !== null,
    retry,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId] });
  const back = () => {
    w.clear();
    w.newAction();
    setMode({ k: 'list' });
  };

  let body;
  if (mode.k === 'list') {
    body = (
      <Gate query={list} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        <Banner w={w} />
        {can(P.employee) ? (
          <Button label={t('stf.emp.add')} onPress={() => (w.clear(), setMode({ k: 'form', id: null }))} />
        ) : null}
        <Field label={t('stf.emp.search')} value={q} onChange={setQ} />
        <Chips
          label={t('stf.emp.status')}
          options={STATUSES.map((s) => ({ id: s, label: s === '' ? t('stf.all') : t(`stf.emp.st_${s}`) }))}
          value={status}
          onChange={setStatus}
        />
        {(list.data?.items ?? []).length === 0 ? (
          <StateView state="empty" message={t('stf.emp.empty')} />
        ) : null}
        {(list.data?.items ?? []).map((e) => (
          <Card key={e.id}>
            <Text style={kit.name}>
              {e.code} · {e.name}
            </Text>
            <Text style={kit.sub}>
              {[e.designation, e.branchName, t(`stf.emp.st_${e.status}`)].filter(Boolean).join(' · ')}
            </Text>
            <Button kind="ghost" label={t('stf.open')} onPress={() => setMode({ k: 'view', id: e.id })} />
          </Card>
        ))}
      </Gate>
    );
  } else if (mode.k === 'view') {
    body = (
      <Gate query={detail} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
        <Banner w={w} />
        {detail.data ? <Profile e={detail.data} /> : null}
        {detail.data && detail.data.status !== 'EXITED' ? (
          <>
            <Button
              label={t('stf.emp.edit')}
              onPress={() => (w.clear(), setMode({ k: 'form', id: detail.data!.id }))}
            />
            <Button
              kind="ghost"
              label={t('stf.emp.exit')}
              onPress={() => (w.clear(), setMode({ k: 'exit', emp: detail.data! }))}
            />
          </>
        ) : null}
        <Button kind="ghost" label={t('stf.back')} onPress={back} />
      </Gate>
    );
  } else if (mode.k === 'form') {
    body =
      mode.id === null ? (
        <EmployeeForm
          key="new"
          existing={null}
          w={w}
          onDone={() => {
            refresh();
            back();
          }}
          onCancel={back}
        />
      ) : (
        <Gate query={detail} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
          {detail.data ? (
            <EmployeeForm
              key={`${detail.data.id}-${detail.data.version}`}
              existing={detail.data}
              w={w}
              onDone={() => {
                refresh();
                setMode({ k: 'view', id: detail.data!.id });
              }}
              onCancel={() => setMode({ k: 'view', id: mode.id! })}
            />
          ) : null}
        </Gate>
      );
  } else {
    body = (
      <ExitForm
        emp={mode.emp}
        w={w}
        onDone={() => {
          refresh();
          setMode({ k: 'view', id: mode.emp.id });
        }}
        onCancel={() => setMode({ k: 'view', id: mode.emp.id })}
      />
    );
  }
  return <Screen title={t('stf.emp.title')}>{body}</Screen>;
}

function Profile({ e }: { e: Employee }) {
  const { t } = useTranslation();
  return (
    <>
      <Card>
        <Text style={kit.name}>
          {e.code} · {e.name}
        </Text>
        <Text style={kit.sub}>{t(`stf.emp.st_${e.status}`)}</Text>
        <Line label={t('stf.emp.designation')} value={e.designation ?? '-'} />
        <Line label={t('stf.emp.department')} value={e.department ?? '-'} />
        <Line label={t('stf.emp.branch')} value={e.branchName ?? '-'} />
        <Line
          label={t('stf.emp.type')}
          value={t(`stf.emp.type_${e.employmentType}`, { defaultValue: e.employmentType })}
        />
        <Line label={t('stf.emp.joined')} value={shortDate(e.joinDate)} />
        {e.exitDate ? (
          <Line
            label={t('stf.emp.exited')}
            value={`${shortDate(e.exitDate)}${e.exitReason ? ` (${e.exitReason})` : ''}`}
          />
        ) : null}
        <Line label={t('stf.emp.mobile')} value={e.mobile ?? '-'} />
        <Line label={t('stf.emp.email')} value={e.email ?? '-'} />
        <Line label={t('stf.emp.address')} value={e.address ?? '-'} />
        <Line
          label={t('stf.emp.emergency')}
          value={[e.emergencyName, e.emergencyMobile].filter(Boolean).join(' ') || '-'}
        />
        <Line label={t('stf.emp.login')} value={yn(e.userId !== null, t)} />
        <Line label={t('stf.emp.geo')} value={yn(e.geoConsent, t)} />
      </Card>
      {e.bank ? (
        <Card>
          <Text style={kit.name}>{t('stf.emp.bank')}</Text>
          <Line label={t('stf.emp.bankName')} value={e.bank.name ?? '-'} />
          <Line label={t('stf.emp.ifsc')} value={e.bank.ifsc ?? '-'} />
          <Line label={t('stf.emp.holder')} value={e.bank.holder ?? '-'} />
          <Line label={t('stf.emp.account')} value={e.bank.accountMasked ?? '-'} />
        </Card>
      ) : null}
    </>
  );
}

type Write = ReturnType<typeof useWrite>;

function EmployeeForm({
  existing,
  w,
  onDone,
  onCancel,
}: {
  existing: Employee | null;
  w: Write;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { client, me } = useAuth();
  const can = useCan();
  const branches = useQuery({
    queryKey: stfKey(me?.userId ?? '', 'branches'),
    queryFn: ({ signal }) => fetchBranches(client!, signal),
    enabled: client !== null,
    staleTime: 10 * 60_000,
  });
  const [f, setF] = useState({
    name: existing?.name ?? '',
    branchId: existing?.branchId ?? '',
    designation: existing?.designation ?? '',
    department: existing?.department ?? '',
    joinDate: existing?.joinDate ?? todayIST(),
    employmentType: existing?.employmentType ?? 'PERMANENT',
    mobile: existing?.mobile ?? '',
    email: existing?.email ?? '',
    address: existing?.address ?? '',
    emergencyName: existing?.emergencyName ?? '',
    emergencyMobile: existing?.emergencyMobile ?? '',
    bankName: existing?.bank?.name ?? '',
    bankIfsc: existing?.bank?.ifsc ?? '',
    bankHolder: existing?.bank?.holder ?? '',
    bankAccountNumber: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const nameBad = f.name.trim().length < 2;
  const dateBad = !isDate(f.joinDate);
  const valid = !nameBad && f.branchId !== '' && !dateBad;
  const showBank = can(P.salaryView);

  const submit = () => {
    const body: EmployeeBody = {
      name: f.name.trim(),
      branchId: f.branchId,
      designation: clean(f.designation),
      department: clean(f.department),
      joinDate: f.joinDate.trim(),
      employmentType: f.employmentType,
      mobile: clean(f.mobile),
      email: clean(f.email),
      address: clean(f.address),
      emergencyName: clean(f.emergencyName),
      emergencyMobile: clean(f.emergencyMobile),
      ...(showBank && f.bankName.trim() ? { bankName: f.bankName.trim() } : {}),
      ...(showBank && f.bankIfsc.trim() ? { bankIfsc: f.bankIfsc.trim().toUpperCase() } : {}),
      ...(showBank && f.bankHolder.trim() ? { bankHolder: f.bankHolder.trim() } : {}),
      ...(showBank && f.bankAccountNumber.trim() ? { bankAccountNumber: f.bankAccountNumber.trim() } : {}),
    };
    return existing
      ? w.send('PATCH', `/hr/employees/${existing.id}`, body, t('stf.saved'), onDone, existing.version)
      : w.send('POST', '/hr/employees', body, t('stf.emp.added'), onDone);
  };

  return (
    <Card>
      <Banner w={w} />
      <Text style={kit.name}>{existing ? t('stf.emp.edit') : t('stf.emp.add')}</Text>
      <Field
        label={t('stf.emp.name')}
        value={f.name}
        onChange={set('name')}
        error={f.name !== '' && nameBad ? t('stf.emp.badName') : null}
      />
      {branches.error ? <Text style={kit.sub}>{t('stf.emp.noBranches')}</Text> : null}
      <Chips
        label={t('stf.emp.branch')}
        options={(branches.data ?? []).map((b) => ({ id: b.id, label: b.name }))}
        value={f.branchId}
        onChange={set('branchId')}
      />
      <Field label={t('stf.emp.designation')} value={f.designation} onChange={set('designation')} />
      <Field label={t('stf.emp.department')} value={f.department} onChange={set('department')} />
      <Field
        label={t('stf.emp.joined')}
        value={f.joinDate}
        onChange={set('joinDate')}
        placeholder="YYYY-MM-DD"
        error={dateBad ? t('stf.badDate') : null}
      />
      <Chips
        label={t('stf.emp.type')}
        options={EMPLOYMENT.map((x) => ({ id: x, label: t(`stf.emp.type_${x}`) }))}
        value={f.employmentType as (typeof EMPLOYMENT)[number]}
        onChange={set('employmentType')}
      />
      <Field label={t('stf.emp.mobile')} value={f.mobile} onChange={set('mobile')} keyboard="phone-pad" />
      <Field label={t('stf.emp.email')} value={f.email} onChange={set('email')} keyboard="email-address" />
      <Field label={t('stf.emp.address')} value={f.address} onChange={set('address')} />
      <Field label={t('stf.emp.emergencyName')} value={f.emergencyName} onChange={set('emergencyName')} />
      <Field
        label={t('stf.emp.emergencyMobile')}
        value={f.emergencyMobile}
        onChange={set('emergencyMobile')}
        keyboard="phone-pad"
      />
      {showBank ? (
        <>
          <Text style={kit.name}>{t('stf.emp.bank')}</Text>
          <Field label={t('stf.emp.bankName')} value={f.bankName} onChange={set('bankName')} />
          <Field label={t('stf.emp.ifsc')} value={f.bankIfsc} onChange={set('bankIfsc')} />
          <Field label={t('stf.emp.holder')} value={f.bankHolder} onChange={set('bankHolder')} />
          <Field
            label={
              existing?.bank?.accountMasked
                ? t('stf.emp.accountKeep', { masked: existing.bank.accountMasked })
                : t('stf.emp.account')
            }
            value={f.bankAccountNumber}
            onChange={set('bankAccountNumber')}
            keyboard="number-pad"
          />
        </>
      ) : null}
      <Button label={t('stf.save')} disabled={w.busy || !valid} onPress={() => void submit()} />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}

function ExitForm({
  emp,
  w,
  onDone,
  onCancel,
}: {
  emp: Employee;
  w: Write;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [day, setDay] = useState(todayIST());
  const [reason, setReason] = useState('');
  const dayBad = !isDate(day) || day < emp.joinDate;
  const valid = !dayBad && reason.trim().length >= 3;
  return (
    <Card>
      <Banner w={w} />
      <Text style={kit.name}>{t('stf.emp.exitTitle', { name: emp.name })}</Text>
      <Text style={kit.sub}>{t('stf.emp.exitNote')}</Text>
      <Field
        label={t('stf.emp.lastDay')}
        value={day}
        onChange={setDay}
        placeholder="YYYY-MM-DD"
        error={dayBad ? t('stf.badDate') : null}
      />
      <Field
        label={t('stf.reason')}
        value={reason}
        onChange={setReason}
        error={reason !== '' && reason.trim().length < 3 ? t('stf.reasonShort') : null}
      />
      <Button
        label={t('stf.emp.exitNow')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            `/hr/employees/${emp.id}/exit`,
            { lastWorkingDay: day.trim(), reason: reason.trim() },
            t('stf.emp.exitDone'),
            onDone,
            emp.version,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onCancel} />
    </Card>
  );
}
