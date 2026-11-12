import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/money';
import { ReadBox } from '@/ui/ReadBox';
import { Check } from '@/ui/kit';
import { Gate, Line } from '../hr/kit';
import { shortDate } from '../hr/logic';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import {
  FP,
  createAccount,
  createGroup,
  generalLedger,
  listAccounts,
  listCostCentres,
  listGroups,
  patchAccount,
  type Account,
} from './api';
import { Button, Card, Chips, Field, Notice, Page, Picker, Result, Tap, kit, useFin, useWrite } from './kit';

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;
type Mode =
  { m: 'list' } | { m: 'ledger'; a: Account } | { m: 'edit'; a: Account } | { m: 'add' } | { m: 'group' };

function Ledger({ a, onBack }: { a: Account; onBack: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const to = todayIST();
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Text style={kit.name}>{`${a.code} ${a.name}`}</Text>
      <Text style={kit.sub}>{`${shortDate(from)} - ${shortDate(to)}`}</Text>
      <ReadBox
        queryKey={['fin', uid, 'gl', a.id, from, to]}
        client={client}
        enabled
        load={(c, s) => generalLedger(c, a.id, from, to, s)}
        deniedText={t('fin.denied')}
        offlineText={t('fin.offline')}
      >
        {(d) => (
          <>
            <Card>
              <Line label={t('fin.chart.opening')} value={formatINR(d.opening)} />
              <Line label={t('fin.chart.closing')} value={formatINR(d.closing)} strong />
            </Card>
            {d.entries.length === 0 ? <StateView state="empty" message={t('fin.chart.noPostings')} /> : null}
            {d.entries.map((e, i) => (
              <Card key={`${e.journalId}-${i}`}>
                <Text style={kit.name}>{e.voucherNo ?? e.purpose}</Text>
                <Text style={kit.sub}>{`${shortDate(e.date)} · ${e.narration ?? e.sourceType}`}</Text>
                <Line label={t('fin.debit')} value={formatINR(e.debit)} />
                <Line label={t('fin.credit')} value={formatINR(e.credit)} />
                <Line label={t('fin.chart.running')} value={formatINR(e.running)} strong />
              </Card>
            ))}
            {d.truncated ? <Text style={kit.sub}>{t('fin.chart.truncated')}</Text> : null}
          </>
        )}
      </ReadBox>
    </>
  );
}

function Edit({ a, onBack }: { a: Account; onBack: () => void }) {
  const { t } = useTranslation();
  const w = useWrite();
  const [name, setName] = useState(a.name);
  const [description, setDescription] = useState(a.description ?? '');
  const [active, setActive] = useState(a.active);
  const bad = name.trim().length < 2;
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Text style={kit.name}>{`${a.code} ${a.name}`}</Text>
      {a.isSystem ? <Notice tone="warn" text={t('fin.chart.systemNote')} /> : null}
      <Field
        label={t('fin.name')}
        value={name}
        onChange={setName}
        error={bad ? t('fin.chart.badName') : null}
      />
      <Field label={t('fin.description')} value={description} onChange={setDescription} />
      {a.isSystem ? null : <Check label={t('fin.active')} value={active} onChange={setActive} />}
      <Result w={w} />
      <Button
        label={t('fin.save')}
        disabled={w.busy || bad}
        onPress={() => {
          const body = {
            name: name.trim(),
            description: description.trim() || null,
            ...(a.isSystem ? {} : { active }),
          };
          void w.go(`edit|${a.id}|${a.version}|${JSON.stringify(body)}`, t('fin.saved'), (c, k) =>
            patchAccount(c, k, a, body),
          );
        }}
      />
    </>
  );
}

function Add({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const w = useWrite();
  const groups = useQuery({
    queryKey: ['fin', uid, 'groups'],
    queryFn: ({ signal }) => listGroups(client!, signal),
    enabled: client !== null,
  });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('EXPENSE');
  const [groupId, setGroupId] = useState('');
  const [description, setDescription] = useState('');
  const bad = !/^\d{3,10}$/.test(code.trim()) || name.trim().length < 2;
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Gate query={groups} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        <Field label={t('fin.chart.code')} value={code} onChange={setCode} keyboard="numeric" />
        <Field label={t('fin.name')} value={name} onChange={setName} />
        <Chips
          label={t('fin.chart.type')}
          options={TYPES.map((x) => ({ id: x, label: t(`fin.chart.type_${x}`) }))}
          value={type}
          onChange={setType}
        />
        <Picker
          label={t('fin.chart.group')}
          blank={t('fin.chart.byCode')}
          options={(groups.data?.items ?? [])
            .filter((g) => g.type === type)
            .map((g) => ({ id: g.id, label: g.name }))}
          value={groupId}
          onChange={setGroupId}
        />
        <Field label={t('fin.description')} value={description} onChange={setDescription} />
        {bad && (code || name) ? <Notice tone="error" text={t('fin.chart.badAccount')} /> : null}
        <Result w={w} />
        <Button
          label={t('fin.chart.addAccount')}
          disabled={w.busy || bad}
          onPress={() => {
            const body = {
              code: code.trim(),
              name: name.trim(),
              type,
              ...(groupId ? { groupId } : {}),
              ...(description.trim() ? { description: description.trim() } : {}),
            };
            void w.go(`add|${JSON.stringify(body)}`, t('fin.chart.added'), (c, k) =>
              createAccount(c, k, body),
            );
          }}
        />
      </Gate>
    </>
  );
}

function AddGroup({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  const w = useWrite();
  const groups = useQuery({
    queryKey: ['fin', uid, 'groups'],
    queryFn: ({ signal }) => listGroups(client!, signal),
    enabled: client !== null,
  });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const bad = code.trim() === '' || name.trim().length < 2 || !parentId;
  return (
    <>
      <Button kind="ghost" label={t('fin.back')} onPress={onBack} />
      <Gate query={groups} denied={false} deniedText={t('fin.denied')} offlineText={t('fin.offline')}>
        <Field label={t('fin.chart.code')} value={code} onChange={setCode} />
        <Field label={t('fin.name')} value={name} onChange={setName} />
        <Picker
          label={t('fin.chart.under')}
          options={(groups.data?.items ?? []).map((g) => ({ id: g.id, label: g.name }))}
          value={parentId}
          onChange={setParentId}
        />
        <Result w={w} />
        <Button
          label={t('fin.chart.addGroup')}
          disabled={w.busy || bad}
          onPress={() => {
            const body = { code: code.trim(), name: name.trim(), parentId };
            void w.go(`group|${JSON.stringify(body)}`, t('fin.chart.groupAdded'), (c, k) =>
              createGroup(c, k, body),
            );
          }}
        />
      </Gate>
    </>
  );
}

function CostCentres() {
  const { t } = useTranslation();
  const { client, uid } = useFin();
  return (
    <ReadBox
      queryKey={['fin', uid, 'cc']}
      client={client}
      enabled
      load={(c, s) => listCostCentres(c, s)}
      deniedText={t('fin.denied')}
      offlineText={t('fin.offline')}
    >
      {(d) => (
        <>
          {d.items.length === 0 ? <StateView state="empty" message={t('fin.chart.noCostCentres')} /> : null}
          {d.items.map((c) => (
            <Card key={c.id}>
              <Text style={kit.name}>{`${c.code} ${c.name}`}</Text>
              <Text style={kit.sub}>{c.active ? t('fin.active') : t('fin.inactive')}</Text>
            </Card>
          ))}
        </>
      )}
    </ReadBox>
  );
}

export default function ChartScreen() {
  const { t } = useTranslation();
  const { client, can, uid } = useFin();
  const [mode, setMode] = useState<Mode>({ m: 'list' });
  const [tab, setTab] = useState<'accounts' | 'cc'>('accounts');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const back = () => setMode({ m: 'list' });
  const manage = can(FP.manage);
  return (
    <Page title={t('fin.chart.title')} perm={FP.view}>
      {mode.m === 'ledger' ? (
        <Ledger a={mode.a} onBack={back} />
      ) : mode.m === 'edit' ? (
        <Edit a={mode.a} onBack={back} />
      ) : mode.m === 'add' ? (
        <Add onBack={back} />
      ) : mode.m === 'group' ? (
        <AddGroup onBack={back} />
      ) : (
        <>
          <Chips
            label={t('fin.vouchers.show')}
            options={[
              { id: 'accounts', label: t('fin.chart.tabAccounts') },
              { id: 'cc', label: t('fin.chart.tabCostCentres') },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'cc' ? (
            <CostCentres />
          ) : (
            <>
              {manage ? (
                <View style={kit.row}>
                  <Button label={t('fin.chart.addAccount')} onPress={() => setMode({ m: 'add' })} />
                  <Button
                    kind="ghost"
                    label={t('fin.chart.addGroup')}
                    onPress={() => setMode({ m: 'group' })}
                  />
                </View>
              ) : null}
              <Field label={t('fin.chart.search')} value={q} onChange={setQ} />
              <Chips
                label={t('fin.chart.type')}
                options={[
                  { id: '', label: t('fin.all') },
                  ...TYPES.map((x) => ({ id: x as string, label: t(`fin.chart.type_${x}`) })),
                ]}
                value={type}
                onChange={setType}
              />
              <ReadBox
                queryKey={['fin', uid, 'accounts', 'bal']}
                client={client}
                enabled
                load={(c, s) => listAccounts(c, true, s)}
                deniedText={t('fin.denied')}
                offlineText={t('fin.offline')}
              >
                {(d) => {
                  const f = q.trim().toLowerCase();
                  const rows = d.items.filter(
                    (a) =>
                      (!type || a.type === type) && (!f || `${a.code} ${a.name}`.toLowerCase().includes(f)),
                  );
                  return rows.length === 0 ? (
                    <StateView state="empty" message={t('fin.chart.empty')} />
                  ) : (
                    <>
                      {rows.map((a) => (
                        <Tap
                          key={a.id}
                          label={`${a.code} ${a.name}`}
                          onPress={() => setMode({ m: 'ledger', a })}
                        >
                          <Text style={kit.name}>{`${a.code} ${a.name}`}</Text>
                          <Text style={kit.sub}>
                            {[
                              a.groupName ?? t(`fin.chart.type_${a.type}`, { defaultValue: a.type }),
                              a.isSystem ? t('fin.chart.system') : '',
                              a.cashBank ? t(`fin.chart.${a.cashBank}`) : '',
                              a.active ? '' : t('fin.inactive'),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                          <Line label={t('fin.chart.balance')} value={formatINR(a.balance ?? '0')} strong />
                          {manage ? (
                            <Button
                              kind="ghost"
                              label={t('fin.chart.edit', { code: a.code })}
                              onPress={() => setMode({ m: 'edit', a })}
                            />
                          ) : null}
                        </Tap>
                      ))}
                    </>
                  );
                }}
              </ReadBox>
            </>
          )}
        </>
      )}
    </Page>
  );
}
