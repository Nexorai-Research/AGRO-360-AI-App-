import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { Button } from '@/ui/Button';
import { Card, Check, Chips, Field, Notice, kit, useActionKey } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { useAction } from '../hr/kit';
import {
  CRMPERM,
  createCrop,
  createTerritory,
  createVillage,
  fetchCrops,
  fetchOfficers,
  fetchTerritories,
  fetchTerritory,
  fetchVillages,
  importVillages,
  patchTerritory,
  patchVillage,
  putAssignees,
  reviewCrop,
  type Territory,
  type Village,
} from './crm-admin-api';
import { emptyVillage, validateCrop, validateVillage, villageBody, SEASONS } from './crm-logic';
import { DoButton, FormCard, Panel, Reveal, Row, Tabs, cut, s, useCrm } from './crm-kit';

type Tab = 'villages' | 'territories' | 'crops';

export default function VillagesScreen() {
  const { t } = useTranslation();
  const { can } = useCrm();
  const [tab, setTab] = useState<Tab>('villages');
  if (!can(CRMPERM.view)) return <StateView state="denied" message={t('cus.denied')} />;
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('cus.villages.title') }} />
      <Text style={kit.title}>{t('cus.villages.title')}</Text>
      <Text style={kit.sub}>{t('cus.villages.intro')}</Text>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'villages', label: t('cus.villages.tabVillages') },
          { id: 'territories', label: t('cus.villages.tabTerritories') },
          { id: 'crops', label: t('cus.villages.tabCrops') },
        ]}
      />
      {tab === 'villages' ? <VillagesTab /> : tab === 'territories' ? <TerritoriesTab /> : <CropsTab />}
    </ScrollView>
  );
}

const villageFields = (t: (k: string) => string) => [
  { name: 'stateCode', label: t('cus.villages.stateCode'), keyboard: 'number-pad' as const },
  { name: 'district', label: t('cus.villages.district') },
  { name: 'taluka', label: t('cus.villages.taluka') },
  { name: 'name', label: t('cus.villages.village') },
  { name: 'pin', label: t('cus.villages.pin'), keyboard: 'number-pad' as const },
];

function VillagesTab() {
  const { t } = useTranslation();
  const { client, can } = useCrm();
  const manage = can(CRMPERM.territoryManage);
  const [q, setQ] = useState('');
  return (
    <Panel name={['villages']} load={fetchVillages}>
      {(all) => {
        const f = q.trim().toLowerCase();
        const rows = f
          ? all.filter((v) => `${v.name} ${v.taluka} ${v.district}`.toLowerCase().includes(f))
          : all;
        const { shown, more } = cut(rows);
        return (
          <View style={{ gap: 10 }}>
            {manage ? (
              <>
                <Reveal label={t('cus.villages.add')}>
                  <FormCard
                    fields={villageFields(t)}
                    initial={{ stateCode: emptyVillage.stateCode }}
                    submitLabel={t('cus.save')}
                    validate={(v) => validateVillage({ ...emptyVillage, ...v })}
                    run={(v, key) => createVillage(client!, villageBody({ ...emptyVillage, ...v }), key)}
                    doneText={t('cus.saved')}
                  />
                </Reveal>
                <Reveal label={t('cus.villages.import')}>
                  <ImportVillages />
                </Reveal>
              </>
            ) : null}
            <Field label={t('cus.search')} value={q} onChange={setQ} />
            {rows.length === 0 ? <StateView state="empty" message={t('cus.villages.empty')} /> : null}
            {shown.map((v) => (
              <VillageCard key={`${v.id}-${v.version}`} v={v} manage={manage} />
            ))}
            {more > 0 ? <Text style={kit.sub}>{t('cus.more', { count: more })}</Text> : null}
          </View>
        );
      }}
    </Panel>
  );
}

function ImportVillages() {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const [csv, setCsv] = useState('');
  const [res, setRes] = useState<string | null>(null);
  const keys = useActionKey();
  const act = useAction(keys);
  const go = () => {
    if (!csv.trim()) return;
    setRes(null);
    void act.run(
      async () => {
        const r = await importVillages(client!, csv, keys.keyFor(csv));
        const why = (r.errors ?? [])
          .slice(0, 5)
          .map((e) => t('cus.villages.rowError', { row: e.row, message: e.message }));
        setRes(
          [
            t('cus.villages.importResult', {
              created: r.created,
              dup: r.duplicates ?? 0,
              failed: r.failed ?? 0,
              total: r.total,
            }),
            ...why,
          ].join('\n'),
        );
      },
      t('cus.saved'),
      reload,
    );
  };
  return (
    <Card>
      <Text style={s.sub}>{t('cus.villages.importHelp')}</Text>
      <TextInput
        value={csv}
        onChangeText={(x) => {
          setCsv(x);
          act.clear();
        }}
        accessibilityLabel={t('cus.villages.csv')}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={[s.input, { minHeight: 120, textAlignVertical: 'top', paddingTop: 10 }]}
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {res ? <Notice tone="ok" text={res} /> : null}
      <Button
        label={act.busy ? t('common.loading') : t('cus.villages.importGo')}
        disabled={act.busy || !csv.trim()}
        onPress={go}
      />
    </Card>
  );
}

function VillageCard({ v, manage }: { v: Village; manage: boolean }) {
  const { t } = useTranslation();
  const { client } = useCrm();
  const active = v.status === 'ACTIVE';
  return (
    <Card>
      <Row
        title={v.name}
        lines={[`${v.taluka}, ${v.district}`, v.pin, active ? t('cus.active') : t('cus.inactive')]}
      />
      {manage ? (
        <>
          <Reveal label={t('cus.edit')}>
            <FormCard
              fields={villageFields(t)}
              initial={{
                stateCode: v.stateCode,
                district: v.district,
                taluka: v.taluka,
                name: v.name,
                pin: v.pin ?? '',
              }}
              submitLabel={t('cus.save')}
              resetOnDone={false}
              validate={(x) => {
                const e = validateVillage({ ...emptyVillage, ...x });
                if (
                  Object.keys(e).length === 0 &&
                  Object.keys(villageBody({ ...emptyVillage, ...x }, v)).length === 0
                )
                  e.name = 'nochange';
                return e;
              }}
              run={(x, key) => patchVillage(client!, v, villageBody({ ...emptyVillage, ...x }, v), key)}
              doneText={t('cus.saved')}
            />
          </Reveal>
          <DoButton
            label={active ? t('cus.deactivate') : t('cus.activate')}
            confirm={active ? t('cus.villages.deactivateWarn', { name: v.name }) : undefined}
            fp={`village|${v.id}|${v.version}|${active}`}
            run={(key) => patchVillage(client!, v, { status: active ? 'INACTIVE' : 'ACTIVE' }, key)}
            doneText={t('cus.saved')}
          />
        </>
      ) : null}
    </Card>
  );
}

// ---- territories --------------------------------------------------------------------------------------------
function TerritoriesTab() {
  const { t } = useTranslation();
  const { can } = useCrm();
  return (
    <Panel
      name={['territories']}
      load={async (c, signal) => ({
        terr: await fetchTerritories(c, signal),
        vill: await fetchVillages(c, signal),
      })}
    >
      {({ terr, vill }) => (
        <View style={{ gap: 10 }}>
          {can(CRMPERM.territoryManage) ? (
            <Reveal label={t('cus.villages.newTerritory')}>
              <TerritoryForm villages={vill} />
            </Reveal>
          ) : null}
          {terr.length === 0 ? <StateView state="empty" message={t('cus.villages.noTerritories')} /> : null}
          {terr.map((x) => (
            <TerritoryCard key={`${x.id}-${x.version ?? 0}`} terr={x} villages={vill} />
          ))}
        </View>
      )}
    </Panel>
  );
}

function TerritoryCard({ terr, villages }: { terr: Territory; villages: Village[] }) {
  const { t } = useTranslation();
  const { can } = useCrm();
  const officers = (terr.assignees ?? []).map((a) => a.fullName ?? a.name ?? a.userId.slice(0, 8)).join(', ');
  return (
    <Card>
      <Row
        title={terr.name}
        lines={[
          t('cus.villages.villageCount', { count: terr.villageCount ?? terr.villages?.length ?? 0 }),
          t('cus.villages.officers', { names: officers || '-' }),
        ]}
      />
      {can(CRMPERM.territoryManage) ? (
        <Reveal label={t('cus.edit')}>
          <Panel name={['territory', terr.id]} load={(c, signal) => fetchTerritory(c, terr.id, signal)}>
            {(cur) => <TerritoryForm villages={villages} cur={cur} />}
          </Panel>
        </Reveal>
      ) : null}
      {can(CRMPERM.territoryAssign) ? (
        <Reveal label={t('cus.villages.assign')}>
          <AssignOfficers terr={terr} />
        </Reveal>
      ) : null}
    </Card>
  );
}

/** Filter box and tick list of villages; a village belongs to one territory. */
function VillagePick({
  villages,
  picked,
  onChange,
}: {
  villages: Village[];
  picked: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const f = q.trim().toLowerCase();
  const rows = (
    f ? villages.filter((v) => `${v.name} ${v.taluka}`.toLowerCase().includes(f)) : villages
  ).filter((v) => v.status === 'ACTIVE' || picked.has(v.id));
  const { shown, more } = cut(rows, 30);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{t('cus.villages.pickVillages', { count: picked.size })}</Text>
      <Field label={t('cus.search')} value={q} onChange={setQ} />
      {shown.map((v) => (
        <Check
          key={v.id}
          label={`${v.name}, ${v.taluka}`}
          value={picked.has(v.id)}
          onChange={(on) => {
            const n = new Set(picked);
            if (on) n.add(v.id);
            else n.delete(v.id);
            onChange(n);
          }}
        />
      ))}
      {more > 0 ? <Text style={s.sub}>{t('cus.more', { count: more })}</Text> : null}
    </View>
  );
}

function TerritoryForm({ villages, cur }: { villages: Village[]; cur?: Territory }) {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const [name, setName] = useState(cur?.name ?? '');
  const [status, setStatus] = useState(cur?.status ?? 'ACTIVE');
  const [picked, setPicked] = useState(new Set((cur?.villages ?? []).map((x) => x.id)));
  const [err, setErr] = useState<string | null>(null);
  const keys = useActionKey();
  const act = useAction(keys);
  const go = () => {
    if (name.trim().length < 2 || name.trim().length > 80) return setErr(t('cus.v.text2'));
    setErr(null);
    const body = { name: name.trim(), villageIds: [...picked].sort(), ...(cur ? { status } : {}) };
    void act.run(
      () =>
        cur
          ? patchTerritory(
              client!,
              cur.id,
              cur.version ?? 0,
              body,
              keys.keyFor(`${cur.id}|${JSON.stringify(body)}`),
            )
          : createTerritory(client!, body, keys.keyFor(JSON.stringify(body))),
      t('cus.saved'),
      () => {
        if (!cur) {
          setName('');
          setPicked(new Set());
        }
        reload();
      },
    );
  };
  return (
    <Card>
      <Text style={s.sub}>{t('cus.villages.territoryNote')}</Text>
      <Field
        label={t('cus.villages.territoryName')}
        value={name}
        onChange={(x) => {
          setName(x);
          act.clear();
        }}
        error={err}
      />
      {cur ? (
        <Chips
          label={t('cus.status')}
          value={status as 'ACTIVE' | 'INACTIVE'}
          onChange={setStatus}
          options={[
            { id: 'ACTIVE', label: t('cus.active') },
            { id: 'INACTIVE', label: t('cus.inactive') },
          ]}
        />
      ) : null}
      <VillagePick
        villages={villages}
        picked={picked}
        onChange={(p) => {
          setPicked(p);
          act.clear();
        }}
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      <Button label={act.busy ? t('common.loading') : t('cus.save')} disabled={act.busy} onPress={go} />
    </Card>
  );
}

function AssignOfficers({ terr }: { terr: Territory }) {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const keys = useActionKey();
  const act = useAction(keys);
  return (
    <Panel name={['officers']} load={fetchOfficers}>
      {(officers) => {
        const cur = picked ?? new Set((terr.assignees ?? []).map((a) => a.userId));
        return (
          <Card>
            <Text style={s.sub}>{t('cus.villages.assignNote')}</Text>
            {officers.length === 0 ? <Notice tone="warn" text={t('cus.villages.noOfficers')} /> : null}
            {officers.map((u) => (
              <Check
                key={u.id}
                label={u.fullName}
                value={cur.has(u.id)}
                onChange={(on) => {
                  const n = new Set(cur);
                  if (on) n.add(u.id);
                  else n.delete(u.id);
                  setPicked(n);
                  act.clear();
                }}
              />
            ))}
            {act.failure ? <Notice tone="error" text={act.failure} /> : null}
            {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
            <Button
              label={act.busy ? t('common.loading') : t('cus.save')}
              disabled={act.busy || officers.length === 0}
              onPress={() => {
                const ids = [...cur].sort();
                void act.run(
                  () => putAssignees(client!, terr.id, ids, keys.keyFor(`${terr.id}|${ids.join(',')}`)),
                  t('cus.saved'),
                  reload,
                );
              }}
            />
          </Card>
        );
      }}
    </Panel>
  );
}

// ---- crops --------------------------------------------------------------------------------------------------
function CropsTab() {
  const { t } = useTranslation();
  const { client, can } = useCrm();
  return (
    <Panel name={['crops']} load={fetchCrops}>
      {(rows) => {
        const { shown, more } = cut(rows, 60);
        return (
          <View style={{ gap: 10 }}>
            <Text style={kit.sub}>{t('cus.villages.cropNote')}</Text>
            {can(CRMPERM.crop) ? (
              <Reveal label={t('cus.villages.addCrop')}>
                <FormCard
                  fields={[
                    { name: 'name', label: t('cus.villages.cropName') },
                    { name: 'durationDays', label: t('cus.villages.cropDays'), keyboard: 'number-pad' },
                    {
                      name: 'seasons',
                      label: t('cus.villages.seasons'),
                      multi: true,
                      choices: SEASONS.map((x) => ({ id: x, label: t(`cus.season.${x}`) })),
                    },
                  ]}
                  submitLabel={t('cus.save')}
                  validate={(v) => validateCrop({ name: v.name!, durationDays: v.durationDays! })}
                  run={(v, key) =>
                    createCrop(
                      client!,
                      {
                        name: v.name!.trim(),
                        durationDays: Number(v.durationDays),
                        seasons: v.seasons!.split(',').filter(Boolean),
                      },
                      key,
                    )
                  }
                  doneText={t('cus.saved')}
                />
              </Reveal>
            ) : null}
            {rows.length === 0 ? <StateView state="empty" message={t('cus.villages.noCrops')} /> : null}
            {shown.map((c) => (
              <Card key={c.id}>
                <Row
                  title={c.name}
                  lines={[
                    t('cus.villages.cropDaysLine', { days: c.durationDays }),
                    (c.seasons ?? []).map((x) => t(`cus.season.${x}`, { defaultValue: x })).join(', '),
                    c.reviewed ? t('cus.villages.reviewed') : t('cus.villages.unreviewed'),
                  ]}
                />
                {!c.reviewed && can(CRMPERM.cropReview) ? (
                  <DoButton
                    label={t('cus.villages.markReviewed')}
                    fp={`crop|${c.id}`}
                    run={(key) => reviewCrop(client!, c.id, key)}
                    doneText={t('cus.villages.reviewed')}
                  />
                ) : null}
              </Card>
            ))}
            {more > 0 ? <Text style={kit.sub}>{t('cus.more', { count: more })}</Text> : null}
          </View>
        );
      }}
    </Panel>
  );
}
