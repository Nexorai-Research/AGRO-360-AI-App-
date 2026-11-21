import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { Button } from '@/ui/Button';
import { Card, Chips, Field, Notice, kit, useAction, useActionKey } from '../hr/kit';
import { adminKey } from './api';
import { k, useAccess } from './kit';

// Web parity 9a.4: the agro licences of each branch (apps/web/src/pages/settings.js licences tab and editLicence; GET/POST /licences,
// PATCH /licences/:id with the version). Rules from modules/org/src/domain/org.ts parseLicence.
export const LICENCE_TYPES = ['FERTILIZER', 'PESTICIDE', 'SEED'] as const;
export interface Licence {
  id: string;
  branchId: string;
  licenceType: string;
  number: string;
  issuingAuthority: string;
  validFrom: string;
  validTo: string;
  categories: string[];
  state: string;
  recordStatus: string;
  version: number;
}
export interface LicenceForm {
  branchId: string;
  licenceType: string;
  number: string;
  issuingAuthority: string;
  validFrom: string;
  validTo: string;
  categories: string;
  status: string;
}
export type LicenceError = 'branch' | 'number' | 'authority' | 'from' | 'to' | 'order' | 'categories';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const real = (s: string) => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const splitCategories = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
export function licenceErrors(f: LicenceForm, editing: boolean): LicenceError[] {
  const e: LicenceError[] = [];
  if (!editing && !f.branchId) e.push('branch');
  if (!editing && (f.number.trim().length < 2 || f.number.trim().length > 60)) e.push('number');
  if (f.issuingAuthority.trim().length < 2 || f.issuingAuthority.trim().length > 200) e.push('authority');
  if (!real(f.validFrom.trim())) e.push('from');
  if (!real(f.validTo.trim())) e.push('to');
  else if (real(f.validFrom.trim()) && f.validTo.trim() < f.validFrom.trim()) e.push('order');
  const c = splitCategories(f.categories);
  if (c.length === 0 || c.length > 50) e.push('categories');
  return e;
}
/** Like the web: a new licence sends branch, type and number; a change sends the dates, categories and record status. */
export function licenceBody(f: LicenceForm, editing: boolean) {
  const common = {
    issuingAuthority: f.issuingAuthority.trim(),
    validFrom: f.validFrom.trim(),
    validTo: f.validTo.trim(),
    categories: splitCategories(f.categories),
  };
  return editing
    ? { ...common, status: f.status }
    : { branchId: f.branchId, licenceType: f.licenceType, number: f.number.trim(), ...common };
}
export const fetchLicences = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Licence[] }>('/licences', { signal })).items;

const blank = (): LicenceForm => ({
  branchId: '',
  licenceType: 'FERTILIZER',
  number: '',
  issuingAuthority: '',
  validFrom: '',
  validTo: '',
  categories: '',
  status: 'ACTIVE',
});
const fromLicence = (l: Licence): LicenceForm => ({
  branchId: l.branchId,
  licenceType: l.licenceType,
  number: l.number,
  issuingAuthority: l.issuingAuthority,
  validFrom: l.validFrom,
  validTo: l.validTo,
  categories: l.categories.join(', '),
  status: l.recordStatus,
});

export function ShopLicences({ branches }: { branches: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [edit, setEdit] = useState<{ l: Licence | null; f: LicenceForm } | null>(null);
  const [tried, setTried] = useState(false);
  const manage = can('org.licence.manage');
  const list = useQuery({
    queryKey: adminKey(userId, 'licences'),
    queryFn: ({ signal }) => fetchLicences(client!, signal),
    enabled: client !== null && userId !== '' && can('org.config.view'),
    retry: false,
  });
  if (!can('org.config.view')) return null;
  const name = new Map(branches.map((b) => [b.id, b.name]));
  const editing = edit?.l !== null && edit?.l !== undefined;
  const errs = edit ? licenceErrors(edit.f, editing) : [];
  const set = (p: Partial<LicenceForm>) => edit && setEdit({ ...edit, f: { ...edit.f, ...p } });
  const bad = (e: LicenceError) => (tried && errs.includes(e) ? t(`wp9.lic.v.${e}`) : null);
  return (
    <>
      <Text style={k.h2}>{t('wp9.lic.title')}</Text>
      <Text style={k.sub}>{t('wp9.lic.hint')}</Text>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {list.error ? <Text style={k.error}>{t('settings.sectionFailed')}</Text> : null}
      {list.data?.length === 0 ? <Text style={k.sub}>{t('wp9.lic.none')}</Text> : null}
      {list.data?.map((l) => (
        <Card key={l.id}>
          <Text style={kit.name}>{l.number}</Text>
          <Text style={kit.sub}>
            {t(`wp9.lic.type.${l.licenceType}`, { defaultValue: l.licenceType })} · {l.issuingAuthority}
          </Text>
          <Text style={kit.sub}>
            {name.get(l.branchId) ?? '-'} · {l.validFrom} - {l.validTo}
          </Text>
          <Text style={kit.sub}>{l.categories.join(', ')}</Text>
          <Text style={kit.sub}>
            {t(`wp9.lic.state.${l.state}`, { defaultValue: l.state.replace(/_/g, ' ') })}
          </Text>
          {manage && !edit ? (
            <Button
              kind="ghost"
              label={t('wp9.lic.edit', { no: l.number })}
              onPress={() => (act.clear(), keys.reset(), setTried(false), setEdit({ l, f: fromLicence(l) }))}
            />
          ) : null}
        </Card>
      ))}
      {manage && !edit ? (
        <Button
          kind="ghost"
          label={t('wp9.lic.add')}
          onPress={() => (act.clear(), keys.reset(), setTried(false), setEdit({ l: null, f: blank() }))}
        />
      ) : null}
      {edit ? (
        <Card>
          <Text style={kit.name}>
            {editing ? t('wp9.lic.editTitle', { no: edit.l!.number }) : t('wp9.lic.addTitle')}
          </Text>
          {!editing ? (
            <>
              <Chips
                label={t('wp9.lic.branch')}
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                value={edit.f.branchId}
                onChange={(branchId) => set({ branchId })}
              />
              {bad('branch') ? <Text style={kit.sub}>{bad('branch')}</Text> : null}
              <Chips
                label={t('wp9.lic.typeLabel')}
                options={LICENCE_TYPES.map((x) => ({ id: x, label: t(`wp9.lic.type.${x}`) }))}
                value={edit.f.licenceType}
                onChange={(licenceType) => set({ licenceType })}
              />
              <Field
                label={t('wp9.lic.number')}
                value={edit.f.number}
                onChange={(number) => set({ number })}
                error={bad('number')}
              />
            </>
          ) : null}
          <Field
            label={t('wp9.lic.authority')}
            value={edit.f.issuingAuthority}
            onChange={(issuingAuthority) => set({ issuingAuthority })}
            error={bad('authority')}
          />
          <Field
            label={t('wp9.lic.from')}
            value={edit.f.validFrom}
            onChange={(validFrom) => set({ validFrom })}
            placeholder="YYYY-MM-DD"
            error={bad('from')}
          />
          <Field
            label={t('wp9.lic.to')}
            value={edit.f.validTo}
            onChange={(validTo) => set({ validTo })}
            placeholder="YYYY-MM-DD"
            error={bad('to') ?? bad('order')}
          />
          <Field
            label={t('wp9.lic.categories')}
            value={edit.f.categories}
            onChange={(categories) => set({ categories })}
            error={bad('categories')}
          />
          {editing ? (
            <Chips
              label={t('wp9.lic.status')}
              options={['ACTIVE', 'REVOKED'].map((x) => ({ id: x, label: t(`wp9.lic.rs.${x}`) }))}
              value={edit.f.status}
              onChange={(status) => set({ status })}
            />
          ) : null}
          {act.failure ? <Notice tone="error" text={act.failure} /> : null}
          <View style={kit.row}>
            <Button
              label={t('wp9.lic.save')}
              disabled={act.busy}
              onPress={() => {
                setTried(true);
                if (errs.length > 0) return;
                const body = licenceBody(edit.f, editing);
                const key = keys.keyFor(
                  `${edit.l?.id ?? 'new'}|${edit.l?.version ?? ''}|${JSON.stringify(body)}`,
                );
                void act.run(
                  () =>
                    editing
                      ? client!.patch(`/licences/${edit.l!.id}`, {
                          body,
                          version: edit.l!.version,
                          idempotencyKey: key,
                        })
                      : client!.post('/licences', { body, idempotencyKey: key }),
                  t(editing ? 'wp9.lic.updated' : 'wp9.lic.added'),
                  () => (
                    setEdit(null),
                    void qc.invalidateQueries({ queryKey: adminKey(userId, 'licences') })
                  ),
                );
              }}
            />
            <Button kind="ghost" label={t('wp9.cancel')} onPress={() => setEdit(null)} />
          </View>
        </Card>
      ) : null}
    </>
  );
}
