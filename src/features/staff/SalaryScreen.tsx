import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { isDate } from '../hr/logic';
import { StateView } from '../stock/StateView';
import {
  P,
  fetchComponents,
  fetchEmployees,
  fetchStructures,
  stfKey,
  type StructureLine,
  type Structure,
} from './api';
import { Banner, Card, Chips, Field, Gate, Screen, isNetwork, kit, useCan, useWrite } from './ui';

/** One line per row: CODE=amount or CODE=formula (for example BASIC=15000, HRA=BASIC*0.4). The server checks codes and formulas. */
export function parseStructureLines(text: string): { lines: StructureLine[]; bad: string | null } {
  const lines: StructureLine[] = [];
  for (const raw of text.split(/[\n;]/)) {
    const x = raw.trim();
    if (!x) continue;
    const i = x.indexOf('=');
    const code = (i < 0 ? '' : x.slice(0, i)).trim().toUpperCase();
    const expr = (i < 0 ? '' : x.slice(i + 1)).trim();
    if (!code || !expr) return { lines: [], bad: x };
    lines.push({ code, calcType: /^\d+(\.\d+)?$/.test(expr) ? 'FIXED' : 'FORMULA', value: expr });
  }
  return { lines, bad: lines.length === 0 ? '' : null };
}

type Tab = 'components' | 'structures';

export default function SalaryScreen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(P.salaryView) || can(P.salaryManage);
  const ready = client !== null && me !== null && allowed;
  const manage = can(P.salaryManage);
  const [tab, setTab] = useState<Tab>('components');
  const w = useWrite();
  const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['stf', userId, 'salary'] });

  const comps = useQuery({
    queryKey: stfKey(userId, 'salary', 'components'),
    queryFn: ({ signal }) => fetchComponents(client!, signal),
    enabled: ready && tab === 'components',
    retry,
  });
  const structs = useQuery({
    queryKey: stfKey(userId, 'salary', 'structures'),
    queryFn: ({ signal }) => fetchStructures(client!, signal),
    enabled: ready && tab === 'structures',
    retry,
  });

  return (
    <Screen title={t('stf.sal.title')}>
      <Chips
        label={t('stf.sal.show')}
        options={[
          { id: 'components', label: t('stf.sal.components') },
          { id: 'structures', label: t('stf.sal.structures') },
        ]}
        value={tab}
        onChange={(x) => (w.clear(), setTab(x))}
      />
      <Banner w={w} />
      {tab === 'components' ? (
        <Gate query={comps} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
          <Text style={kit.sub}>{t('stf.sal.componentNote')}</Text>
          {manage ? <ComponentForm w={w} onDone={refresh} /> : null}
          {(comps.data?.items ?? []).length === 0 ? (
            <StateView state="empty" message={t('stf.sal.noComponents')} />
          ) : null}
          {(comps.data?.items ?? []).map((c) => (
            <Card key={c.id}>
              <Text style={kit.name}>
                {c.code} · {c.name}
              </Text>
              <Text style={kit.sub}>{t(`stf.sal.kind_${c.kind}`)}</Text>
            </Card>
          ))}
        </Gate>
      ) : (
        <Gate query={structs} denied={!allowed} deniedText={t('stf.denied')} offlineText={t('stf.offline')}>
          <Text style={kit.sub}>{t('stf.sal.structureNote')}</Text>
          {manage ? <StructureForm w={w} onDone={refresh} /> : null}
          {(structs.data?.items ?? []).length === 0 ? (
            <StateView state="empty" message={t('stf.sal.noStructures')} />
          ) : null}
          {(structs.data?.items ?? []).map((s) => (
            <StructureCard key={s.id} s={s} w={w} manage={manage} />
          ))}
        </Gate>
      )}
    </Screen>
  );
}

function ComponentForm({ w, onDone }: { w: ReturnType<typeof useWrite>; onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'EARNING' | 'DEDUCTION'>('EARNING');
  const codeBad = !/^[A-Z][A-Z0-9_]{1,19}$/.test(code.trim().toUpperCase());
  const valid = !codeBad && name.trim().length >= 2;
  if (!open) return <Button label={t('stf.sal.newComponent')} onPress={() => (w.clear(), setOpen(true))} />;
  return (
    <Card>
      <Field
        label={t('stf.sal.code')}
        value={code}
        onChange={setCode}
        error={code !== '' && codeBad ? t('stf.sal.badCode') : null}
      />
      <Field label={t('stf.sal.name')} value={name} onChange={setName} />
      <Chips
        label={t('stf.sal.kind')}
        options={(['EARNING', 'DEDUCTION'] as const).map((k) => ({ id: k, label: t(`stf.sal.kind_${k}`) }))}
        value={kind}
        onChange={setKind}
      />
      <Button
        label={t('stf.save')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            '/hr/salary-components',
            { code: code.trim().toUpperCase(), name: name.trim(), kind },
            t('stf.saved'),
            () => {
              setOpen(false);
              setCode('');
              setName('');
              onDone();
            },
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={() => setOpen(false)} />
    </Card>
  );
}

function StructureForm({ w, onDone }: { w: ReturnType<typeof useWrite>; onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const parsed = parseStructureLines(text);
  const valid = name.trim().length >= 2 && parsed.bad === null;
  if (!open) return <Button label={t('stf.sal.newStructure')} onPress={() => (w.clear(), setOpen(true))} />;
  return (
    <Card>
      <Text style={kit.sub}>{t('stf.sal.linesHelp')}</Text>
      <Field label={t('stf.sal.name')} value={name} onChange={setName} />
      <Field
        label={t('stf.sal.lines')}
        value={text}
        onChange={setText}
        error={text !== '' && parsed.bad ? t('stf.sal.badLine', { line: parsed.bad }) : null}
      />
      <Button
        label={t('stf.save')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            '/hr/salary-structures',
            { name: name.trim(), lines: parsed.lines },
            t('stf.saved'),
            () => {
              setOpen(false);
              setName('');
              setText('');
              onDone();
            },
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={() => setOpen(false)} />
    </Card>
  );
}

function StructureCard({ s, w, manage }: { s: Structure; w: ReturnType<typeof useWrite>; manage: boolean }) {
  const { t } = useTranslation();
  const [assign, setAssign] = useState(false);
  return (
    <Card>
      <Text style={kit.name}>{s.name}</Text>
      {s.lines.map((l) => (
        <Text key={l.code} style={kit.sub}>
          {l.code}: {l.value}
        </Text>
      ))}
      {manage && !assign ? (
        <Button kind="ghost" label={t('stf.sal.assign')} onPress={() => (w.clear(), setAssign(true))} />
      ) : null}
      {assign ? <AssignForm s={s} w={w} onClose={() => setAssign(false)} /> : null}
    </Card>
  );
}

function AssignForm({
  s,
  w,
  onClose,
}: {
  s: Structure;
  w: ReturnType<typeof useWrite>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const [q, setQ] = useState('');
  const [emp, setEmp] = useState<{ id: string; label: string } | null>(null);
  const [from, setFrom] = useState(todayIST());
  const list = useQuery({
    queryKey: stfKey(me?.userId ?? '', 'assign-emps'),
    queryFn: ({ signal }) => fetchEmployees(client!, { status: 'ACTIVE' }, signal),
    enabled: client !== null,
    staleTime: 5 * 60_000,
  });
  const shown = (list.data?.items ?? [])
    .filter((e) => `${e.code} ${e.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  const valid = emp !== null && isDate(from);
  return (
    <>
      <Text style={kit.sub}>{t('stf.sal.assignNote')}</Text>
      {list.error ? <Text style={kit.sub}>{t('stf.sal.noEmployees')}</Text> : null}
      <Field label={t('stf.emp.search')} value={q} onChange={setQ} />
      <Chips
        label={t('stf.sal.employee')}
        options={shown.map((e) => ({ id: e.id, label: `${e.code} ${e.name}` }))}
        value={emp?.id ?? ''}
        onChange={(id) => setEmp({ id, label: shown.find((e) => e.id === id)?.name ?? '' })}
      />
      <Field
        label={t('stf.sal.effective')}
        value={from}
        onChange={setFrom}
        placeholder="YYYY-MM-DD"
        error={!isDate(from) ? t('stf.badDate') : null}
      />
      <Button
        label={t('stf.sal.assignNow')}
        disabled={w.busy || !valid}
        onPress={() =>
          void w.send(
            'POST',
            `/hr/employees/${emp!.id}/salary`,
            { structureId: s.id, effectiveFrom: from.trim() },
            t('stf.sal.assigned'),
            onClose,
          )
        }
      />
      <Button kind="ghost" label={t('stf.cancel')} onPress={onClose} />
    </>
  );
}
