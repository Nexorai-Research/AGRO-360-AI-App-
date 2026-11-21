import { useState, type ReactNode } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ApiClient } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { PLATFORM_ROLES, isPlatformUser } from './roles';
import {
  loginMessage,
  loginStateKey,
  revealOutcome,
  stateName,
  type AdminCredentials,
  type AdminLogin,
} from './franchise-login';
import { Card, Chips, Field, Gate, Line, Notice, isNetwork, kit, useAction, useActionKey } from '../hr/kit';

// Web parity phase 12: the platform console (apps/web/src/pages/platform.js and reports.js platformDashboardPage). Only platform
// operators see it (role platform_admin or platform_support); the API refuses everyone else whatever the app shows.

export { PLATFORM_ROLES, isPlatformUser };
const K = (userId: string, ...p: string[]) => ['platform', userId, ...p] as const;
const retry = (n: number, e: unknown) => isNetwork(e) && n < 1;

export const FRANCHISE_STATUSES = ['', 'DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export interface FranchiseRow {
  id: string;
  franchiseId: string;
  code: string;
  displayName: string;
  status: string;
  stateCode: string | null;
  city: string | null;
  adminLogin: AdminLogin | null;
  contact: { fullName: string | null; mobile: string | null } | null;
}
export interface FranchiseDetail {
  id: string;
  franchiseId: string;
  code: string;
  displayName: string;
  legalName: string;
  businessType: string;
  status: string;
  statusReason: string | null;
  version: number;
  stateCode: string | null;
  city: string | null;
  address: string | null;
  gstin: string | null;
  createdAt: string;
  adminLogin: AdminLogin | null;
  contact: { fullName: string | null; mobile: string | null; email: string | null } | null;
  provisioning: { status: string; steps?: { key: string; status: string; lastError: string | null }[] };
  usage: { reason: string };
  recentAudit: { at: string; action: string; outcome: string }[];
}
export interface Plan {
  id: string;
  code: string;
  name: string;
  status: string;
  versions: {
    id: string;
    versionNo: number;
    status: string;
    entitlements: Record<string, unknown>;
    publishedAt: string | null;
  }[];
}
export const fetchFranchises = (c: ApiClient, q: string, status: string, signal?: AbortSignal) =>
  c.get<{ items: FranchiseRow[]; unavailableMetrics?: string[] }>('/platform/franchises', {
    query: { q: q.trim() || undefined, status: status || undefined, limit: 100 },
    signal,
  });
export const fetchPlans = async (c: ApiClient, signal?: AbortSignal) =>
  (await c.get<{ items: Plan[] }>('/platform/plans', { signal })).items;
// ---- forms ----------------------------------------------------------------------------------------------------------------------
export interface NewFranchise {
  legalName: string;
  displayName: string;
  businessType: string;
  stateCode: string;
  city: string;
  gstin: string;
  code: string;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
}
export const emptyFranchise = (): NewFranchise => ({
  legalName: '',
  displayName: '',
  businessType: 'Agro input retailer',
  stateCode: '27',
  city: '',
  gstin: '',
  code: '',
  contactName: '',
  contactMobile: '',
  contactEmail: '',
});
export type FranchiseError = keyof NewFranchise;
/** The web form's required fields, the 2-digit state code and the GSTIN state check of parseCreateFranchise. */
export function franchiseErrors(f: NewFranchise): FranchiseError[] {
  const e: FranchiseError[] = [];
  const req: FranchiseError[] = [
    'legalName',
    'displayName',
    'businessType',
    'contactName',
    'contactMobile',
    'contactEmail',
  ];
  for (const k of req) if (!f[k].trim()) e.push(k);
  if (!/^\d{2}$/.test(f.stateCode.trim())) e.push('stateCode');
  if (f.gstin.trim() && f.gstin.trim().slice(0, 2) !== f.stateCode.trim()) e.push('gstin');
  if (f.code.trim() && !/^[A-Za-z0-9]{3,12}$/.test(f.code.trim())) e.push('code');
  if (
    f.contactEmail.trim() &&
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contactEmail.trim()) &&
    !e.includes('contactEmail')
  )
    e.push('contactEmail');
  return e;
}
export function franchiseBody(f: NewFranchise) {
  return {
    legalName: f.legalName.trim(),
    displayName: f.displayName.trim(),
    businessType: f.businessType.trim(),
    stateCode: f.stateCode.trim(),
    contact: { fullName: f.contactName.trim(), mobile: f.contactMobile.trim(), email: f.contactEmail.trim() },
    ...(f.city.trim() ? { city: f.city.trim() } : {}),
    ...(f.gstin.trim() ? { gstin: f.gstin.trim().toUpperCase() } : {}),
    ...(f.code.trim() ? { code: f.code.trim().toUpperCase() } : {}),
  };
}
/** The fields of "Edit franchise" (PATCH, with If-Match): empty location, address and GSTIN are sent as null like the web. */
export interface FranchiseEdit {
  displayName: string;
  legalName: string;
  businessType: string;
  stateCode: string;
  city: string;
  address: string;
  gstin: string;
}
export const editFromDetail = (d: FranchiseDetail): FranchiseEdit => ({
  displayName: d.displayName,
  legalName: d.legalName ?? '',
  businessType: d.businessType ?? '',
  stateCode: d.stateCode ?? '27',
  city: d.city ?? '',
  address: d.address ?? '',
  gstin: d.gstin ?? '',
});
export function editErrors(f: FranchiseEdit): (keyof FranchiseEdit)[] {
  const e: (keyof FranchiseEdit)[] = [];
  for (const k of ['displayName', 'legalName', 'businessType'] as const) if (!f[k].trim()) e.push(k);
  if (!/^\d{2}$/.test(f.stateCode.trim())) e.push('stateCode');
  if (f.gstin.trim() && f.gstin.trim().slice(0, 2) !== f.stateCode.trim()) e.push('gstin');
  return e;
}
export const editBody = (f: FranchiseEdit) => ({
  displayName: f.displayName.trim(),
  legalName: f.legalName.trim(),
  businessType: f.businessType.trim(),
  stateCode: f.stateCode.trim(),
  city: f.city.trim() || null,
  address: f.address.trim() || null,
  gstin: f.gstin.trim() ? f.gstin.trim().toUpperCase() : null,
});
/** Suspend and reactivate need a recorded reason of 10-500 characters. */
export const reasonOk = (s: string) => s.trim().length >= 10 && s.trim().length <= 500;
export const planOk = (f: { code: string; name: string }) =>
  /^[A-Z0-9_]{2,40}$/.test(f.code.trim().toUpperCase()) && f.name.trim().length >= 2;

function useP() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const allowed = isPlatformUser(me?.roles);
  return { t, client, userId: me?.userId ?? '', ready: client !== null && me !== null && allowed, allowed };
}
function Denied() {
  const { t } = useTranslation();
  return <StateView state="denied" message={t('wp12.denied')} />;
}
const Page = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
    <Text style={kit.title} accessibilityRole="header">
      {title}
    </Text>
    {hint ? <Text style={kit.sub}>{hint}</Text> : null}
    {children}
  </ScrollView>
);

// ---- the owner's login (phase 26) -------------------------------------------------------------------------------------------------
/** The login id and the one-time password of a franchise owner. The web shows them once after creating or issuing; the phone offers Share instead of Copy. */
export function CredentialsCard({
  c,
  name,
  again,
  onDone,
}: {
  c: AdminCredentials;
  name: string;
  again?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const ready = c.status === 'READY' && !!c.loginId && !!c.temporaryPassword;
  return (
    <Card>
      <Text style={kit.name}>
        {t(!ready ? 'wp26.cred.failed' : again ? 'wp26.cred.again' : 'wp26.cred.created')}
      </Text>
      {ready ? (
        <>
          <Text style={kit.sub}>{t('wp26.cred.intro', { name })}</Text>
          <Line label={t('wp26.cred.loginId')} value={c.loginId!} strong />
          <Line label={t('wp26.cred.password')} value={c.temporaryPassword!} strong />
          <Text style={kit.sub}>{t(again ? 'wp26.cred.againNote' : 'wp26.cred.onceNote')}</Text>
          <Button
            kind="ghost"
            label={t('wp26.cred.share')}
            onPress={() => void Share.share({ message: loginMessage(c.loginId!, c.temporaryPassword!) })}
          />
        </>
      ) : (
        <>
          <Notice tone="error" text={c.reason ?? ''} />
          {c.loginId ? <Line label={t('wp26.cred.loginIdLater')} value={c.loginId} /> : null}
        </>
      )}
      <Button label={t('wp26.cred.done')} onPress={onDone} />
    </Card>
  );
}
const stateKind = (a: AdminLogin | null) => `wp26.login.${loginStateKey(a)}`;

// ---- franchises -------------------------------------------------------------------------------------------------------------------
function NewFranchiseForm({ onDone }: { onDone: () => void }) {
  const { t, client, userId } = useP();
  void userId;
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<NewFranchise>(emptyFranchise());
  const [tried, setTried] = useState(false);
  const [made, setMade] = useState<{
    code: string;
    displayName: string;
    status: string;
    adminCredentials?: AdminCredentials;
  } | null>(null);
  const errs = franchiseErrors(f);
  const set = (k: keyof NewFranchise) => (v: string) => setF({ ...f, [k]: v });
  const bad = (k: FranchiseError) => (tried && errs.includes(k) ? t(`wp12.fr.v.${k}`) : null);
  const text: (keyof NewFranchise)[] = [
    'legalName',
    'displayName',
    'businessType',
    'stateCode',
    'city',
    'gstin',
    'code',
    'contactName',
    'contactMobile',
    'contactEmail',
  ];
  if (made?.adminCredentials)
    return (
      <>
        <Notice
          tone={made.status === 'ACTIVE' ? 'ok' : 'error'}
          text={t(made.status === 'ACTIVE' ? 'wp12.fr.active' : 'wp12.fr.incomplete', { code: made.code })}
        />
        <CredentialsCard c={made.adminCredentials} name={made.displayName} onDone={onDone} />
      </>
    );
  return (
    <Card>
      <Text style={kit.name}>{t('wp12.fr.newTitle')}</Text>
      <Text style={kit.sub}>{t('wp12.fr.newHint')}</Text>
      {text.map((k) => (
        <Field key={k} label={t(`wp12.fr.f.${k}`)} value={f[k]} onChange={set(k)} error={bad(k)} />
      ))}
      {/^\d{2}$/.test(f.stateCode.trim()) ? (
        <Text style={kit.sub}>{stateName(f.stateCode.trim())}</Text>
      ) : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {made ? (
        <Notice
          tone={made.status === 'ACTIVE' ? 'ok' : 'error'}
          text={t(made.status === 'ACTIVE' ? 'wp12.fr.active' : 'wp12.fr.incomplete', { code: made.code })}
        />
      ) : null}
      <View style={kit.row}>
        <Button
          label={t('wp12.fr.create')}
          disabled={act.busy}
          onPress={() => {
            setTried(true);
            if (errs.length > 0) return;
            const body = franchiseBody(f);
            void act.run(
              async () => {
                const r = await client!.post<{
                  code: string;
                  displayName: string;
                  status: string;
                  adminCredentials?: AdminCredentials;
                }>('/platform/franchises', {
                  body,
                  idempotencyKey: keys.keyFor(JSON.stringify(body)),
                });
                setMade(r);
              },
              '',
              () => void qc.invalidateQueries({ queryKey: ['platform'] }),
            );
          }}
        />
        <Button kind="ghost" label={t('wp12.close')} onPress={onDone} />
      </View>
    </Card>
  );
}

type Step = 'suspend' | 'reactivate';
function FranchiseCard({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, client, userId } = useP();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [step, setStep] = useState<Step | null>(null);
  const [reason, setReason] = useState('');
  const [edit, setEdit] = useState<FranchiseEdit | null>(null);
  const [asking, setAsking] = useState<'issue' | 'activate' | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [shown, setShown] = useState<{ c: AdminCredentials; again: boolean } | null>(null);
  const q = useQuery({
    queryKey: K(userId, 'franchise', id),
    queryFn: ({ signal }) =>
      client!.get<FranchiseDetail>(`/platform/franchises/${encodeURIComponent(id)}`, { signal }),
    retry,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['platform'] });
  const done = () => (setStep(null), setReason(''), refresh());
  const d = q.data;
  const base = `/platform/franchises/${encodeURIComponent(id)}`;
  const send = () => {
    if (!d || !step || !reasonOk(reason)) return;
    void act.run(
      () =>
        client!.post(`${base}:${step}`, {
          body: { reason: reason.trim() },
          idempotencyKey: keys.keyFor(`${step}|${reason}`),
        }),
      t(`wp12.fr.done.${step}`),
      done,
    );
  };
  const save = () => {
    if (!d || !edit || editErrors(edit).length > 0) return;
    const body = editBody(edit);
    void act.run(
      () =>
        client!.patch(base, {
          body,
          version: d.version,
          idempotencyKey: keys.keyFor(`edit|${JSON.stringify(body)}`),
        }),
      t('wp26.edit.saved'),
      () => (setEdit(null), refresh()),
    );
  };
  /** The look is audited by the server; a password that is not there says why, like the web. */
  const show = () =>
    void act.run(async () => {
      setInfo(null);
      const r = await client!.get<{ adminLogin: AdminLogin | null; password: string | null }>(
        `${base}/admin-login`,
      );
      const o = revealOutcome(r);
      if (o.kind === 'show')
        setShown({
          c: { status: 'READY', loginId: o.loginId, temporaryPassword: o.password, mustChangePassword: true },
          again: true,
        });
      else setInfo(t(`wp26.reveal.${o.kind}`));
    }, '');
  const issue = () =>
    void act.run(
      async () => {
        const c = await client!.post<AdminCredentials>(`${base}:issue-admin-login`, {
          body: {},
          idempotencyKey: keys.keyFor(`issue|${id}`),
        });
        setShown({ c, again: false });
        setAsking(null);
      },
      '',
      refresh,
    );
  const activate = () =>
    void act.run(
      async () => {
        await client!.post(`${base}:activate-admin`, {
          body: {},
          idempotencyKey: keys.keyFor(`activate|${id}`),
        });
        setAsking(null);
      },
      t('wp26.activate.done'),
      refresh,
    );
  const a = d?.adminLogin ?? null;
  const lines = (s: FranchiseEdit) =>
    (['displayName', 'legalName', 'businessType', 'stateCode', 'city', 'address', 'gstin'] as const).map(
      (k) => (
        <Field
          key={k}
          label={t(k === 'address' ? 'wp26.edit.address' : `wp12.fr.f.${k}`)}
          value={s[k]}
          onChange={(v) => setEdit({ ...s, [k]: v })}
          error={editErrors(s).includes(k) ? t(`wp12.fr.v.${k}`, { defaultValue: t('wp26.edit.bad') }) : null}
        />
      ),
    );
  return (
    <Card>
      <Gate query={q} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {d ? (
          <>
            <Text style={kit.name}>{d.displayName}</Text>
            <Text style={kit.sub}>
              {t(`wp12.st.${d.status}`, { defaultValue: d.status })}
              {d.statusReason ? ` · ${d.statusReason}` : ''}
            </Text>
            <Line label={t('wp12.fr.idCode')} value={`${d.franchiseId} / ${d.code}`} />
            <Line label={t('wp12.fr.f.legalName')} value={d.legalName} />
            <Line label={t('wp12.fr.f.businessType')} value={d.businessType} />
            <Line label={t('wp26.location')} value={d.city ?? t('wp26.notSet')} />
            <Line label={t('wp12.fr.stateGstin')} value={`${stateName(d.stateCode)} / ${d.gstin ?? '-'}`} />
            <Line
              label={t('wp12.fr.contact')}
              value={
                d.contact
                  ? [d.contact.fullName, d.contact.mobile, d.contact.email].filter(Boolean).join(' ')
                  : '-'
              }
            />
            <Text style={kit.name}>{t('wp26.owner')}</Text>
            {a ? (
              <>
                <Line label={t('wp26.cred.loginId')} value={a.loginId} />
                <Text style={kit.sub}>{t(stateKind(a))}</Text>
                <Text style={kit.sub}>
                  {t(`wp26.note.${a.state === 'DEACTIVATED_BY_OWNER' ? 'off' : a.passwordStatus}`, {
                    date: (
                      (a.state === 'DEACTIVATED_BY_OWNER'
                        ? a.stateChangedAt
                        : a.passwordStatus === 'CHANGED'
                          ? a.passwordChangedAt
                          : a.passwordIssuedAt) ?? ''
                    ).slice(0, 10),
                    defaultValue: t('wp26.note.NOT_STORED'),
                  })}
                </Text>
              </>
            ) : (
              <Text style={kit.sub}>{t('wp26.note.none')}</Text>
            )}
            <Text style={kit.name}>{t('wp12.fr.setup')}</Text>
            {(d.provisioning.steps ?? []).length === 0 ? (
              <Text style={kit.sub}>{t('wp12.fr.noSteps')}</Text>
            ) : null}
            {(d.provisioning.steps ?? []).map((s) => (
              <Text key={s.key} style={kit.sub}>
                {s.key}: {s.status}
                {s.lastError ? ` · ${s.lastError}` : ''}
              </Text>
            ))}
            <Text style={kit.name}>{t('wp26.access.title')}</Text>
            <Text style={kit.sub}>{t('wp26.access.hint')}</Text>
            <Text style={kit.sub}>{d.usage.reason}</Text>
            <Text style={kit.name}>{t('wp12.fr.recent')}</Text>
            {d.recentAudit.map((x, i) => (
              <Text key={i} style={kit.sub}>
                {x.at.slice(0, 16).replace('T', ' ')} · {x.action} · {x.outcome}
              </Text>
            ))}
            {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
            {act.failure ? <Notice tone="error" text={act.failure} /> : null}
            {info ? <Notice tone="error" text={info} /> : null}
            {shown ? (
              <CredentialsCard
                c={shown.c}
                name={d.displayName}
                again={shown.again}
                onDone={() => setShown(null)}
              />
            ) : null}
            {edit ? (
              <>
                <Text style={kit.name}>{t('wp26.edit.title', { name: d.displayName })}</Text>
                {lines(edit)}
                <Button
                  label={t('wp26.edit.save')}
                  disabled={act.busy || editErrors(edit).length > 0}
                  onPress={save}
                />
                <Button kind="ghost" label={t('wp12.cancel')} onPress={() => setEdit(null)} />
              </>
            ) : null}
            {asking ? (
              <>
                <Text style={kit.sub}>
                  {t(asking === 'issue' ? 'wp26.issue.ask' : 'wp26.activate.ask', { name: d.displayName })}
                </Text>
                <Button
                  label={t(asking === 'issue' ? 'wp26.issue.go' : 'wp26.activate.go')}
                  disabled={act.busy}
                  onPress={asking === 'issue' ? issue : activate}
                />
                <Button kind="ghost" label={t('wp12.cancel')} onPress={() => setAsking(null)} />
              </>
            ) : null}
            {step ? (
              <>
                <Text style={kit.sub}>{t(`wp12.fr.ask.${step}`)}</Text>
                <Field
                  label={t('wp12.fr.reason')}
                  value={reason}
                  onChange={setReason}
                  error={reason && !reasonOk(reason) ? t('wp12.fr.v.reason') : null}
                />
                <Button
                  label={t(`wp12.fr.go.${step}`)}
                  disabled={act.busy || !reasonOk(reason)}
                  onPress={send}
                />
                <Button kind="ghost" label={t('wp12.cancel')} onPress={() => setStep(null)} />
              </>
            ) : (
              <View style={kit.row}>
                {d.status === 'ACTIVE' ? (
                  <Button
                    kind="ghost"
                    label={t('wp12.fr.go.suspend')}
                    onPress={() => (keys.reset(), setStep('suspend'))}
                  />
                ) : null}
                {d.status === 'SUSPENDED' ? (
                  <Button
                    kind="ghost"
                    label={t('wp12.fr.go.reactivate')}
                    onPress={() => (keys.reset(), setStep('reactivate'))}
                  />
                ) : null}
                {d.status === 'DRAFT' || d.provisioning.status !== 'READY' ? (
                  <Button
                    kind="ghost"
                    label={t('wp12.fr.retry')}
                    disabled={act.busy}
                    onPress={() =>
                      void act.run(
                        () =>
                          client!.post(`${base}:reprovision`, {
                            idempotencyKey: keys.keyFor(`re|${id}`),
                          }),
                        t('wp12.fr.retried'),
                        refresh,
                      )
                    }
                  />
                ) : null}
                {d.status !== 'TERMINATED' ? (
                  <Button
                    kind="ghost"
                    label={t('wp26.edit.open')}
                    onPress={() => (act.clear(), keys.reset(), setEdit(editFromDetail(d)))}
                  />
                ) : null}
                {a?.passwordStatus === 'TEMPORARY' ? (
                  <Button kind="ghost" label={t('wp26.show')} disabled={act.busy} onPress={show} />
                ) : null}
                {a?.state === 'DEACTIVATED_BY_OWNER' ? (
                  <Button
                    kind="ghost"
                    label={t('wp26.activate.open')}
                    onPress={() => (act.clear(), keys.reset(), setAsking('activate'))}
                  />
                ) : null}
                {d.status === 'ACTIVE' || d.status === 'SUSPENDED' ? (
                  <Button
                    kind="ghost"
                    label={t('wp26.issue.open')}
                    onPress={() => (act.clear(), keys.reset(), setAsking('issue'))}
                  />
                ) : null}
              </View>
            )}
          </>
        ) : null}
      </Gate>
      <Button kind="ghost" label={t('wp12.close')} onPress={onClose} />
    </Card>
  );
}

export function FranchisesScreen() {
  const { t, client, userId, ready, allowed } = useP();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: K(userId, 'franchises', q.trim(), status),
    queryFn: ({ signal }) => fetchFranchises(client!, q, status, signal),
    enabled: ready,
    retry,
  });
  if (!allowed) return <Denied />;
  return (
    <Page title={t('wp12.fr.title')} hint={t('wp12.fr.hint')}>
      <Field label={t('wp12.fr.search')} value={q} onChange={setQ} />
      <Chips
        label={t('wp12.fr.status')}
        options={FRANCHISE_STATUSES.map((s) => ({ id: s, label: s ? t(`wp12.st.${s}`) : t('wp12.all') }))}
        value={status}
        onChange={setStatus}
      />
      {adding ? (
        <NewFranchiseForm onDone={() => setAdding(false)} />
      ) : (
        <Button label={t('wp12.fr.new')} onPress={() => setAdding(true)} />
      )}
      {open ? <FranchiseCard id={open} onClose={() => setOpen(null)} /> : null}
      <Gate query={list} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {list.data?.items.length === 0 ? <StateView state="empty" message={t('wp12.fr.none')} /> : null}
        {(list.data?.items ?? []).map((f) => (
          <Card key={f.id}>
            <Text style={kit.name}>{f.displayName}</Text>
            <Text style={kit.sub}>
              {f.franchiseId} / {f.code} · {t(`wp12.st.${f.status}`, { defaultValue: f.status })}
            </Text>
            <Line label={t('wp26.location')} value={f.city ?? t('wp26.notSet')} />
            <Line label={t('wp12.fr.state')} value={stateName(f.stateCode)} />
            <Line
              label={t('wp12.fr.contact')}
              value={f.contact ? `${f.contact.fullName ?? '-'} ${f.contact.mobile ?? ''}` : '-'}
            />
            <Line
              label={t('wp26.adminLogin')}
              value={
                f.adminLogin
                  ? `${f.adminLogin.loginId} · ${t(stateKind(f.adminLogin))}`
                  : t('wp26.notRecorded')
              }
            />
            <Button
              kind="ghost"
              label={t('wp12.fr.open', { name: f.displayName })}
              onPress={() => setOpen(f.id)}
            />
          </Card>
        ))}
        {list.data?.unavailableMetrics?.length ? (
          <Text style={kit.sub}>
            {t('wp12.fr.unavailable', { list: list.data.unavailableMetrics.join(', ') })}
          </Text>
        ) : null}
      </Gate>
    </Page>
  );
}

// ---- plans -------------------------------------------------------------------------------------------------------------------------
export function PlansScreen() {
  const { t, client, userId, ready, allowed } = useP();
  const qc = useQueryClient();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<{ code: string; name: string } | null>(null);
  const list = useQuery({
    queryKey: K(userId, 'plans'),
    queryFn: ({ signal }) => fetchPlans(client!, signal),
    enabled: ready,
    retry,
  });
  if (!allowed) return <Denied />;
  return (
    <Page title={t('wp12.pl.title')} hint={t('wp12.pl.hint')}>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {f ? (
        <Card>
          <Field label={t('wp12.pl.code')} value={f.code} onChange={(code) => setF({ ...f, code })} />
          <Field label={t('wp12.pl.name')} value={f.name} onChange={(name) => setF({ ...f, name })} />
          {!planOk(f) && (f.code || f.name) ? <Text style={kit.sub}>{t('wp12.pl.bad')}</Text> : null}
          <Button
            label={t('wp12.pl.create')}
            disabled={act.busy || !planOk(f)}
            onPress={() => {
              const body = { code: f.code.trim().toUpperCase(), name: f.name.trim() };
              void act.run(
                () =>
                  client!.post('/platform/plans', {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  }),
                t('wp12.pl.created'),
                () => (setF(null), void qc.invalidateQueries({ queryKey: K(userId, 'plans') })),
              );
            }}
          />
          <Button kind="ghost" label={t('wp12.cancel')} onPress={() => setF(null)} />
        </Card>
      ) : (
        <Button
          label={t('wp12.pl.new')}
          onPress={() => (act.clear(), keys.reset(), setF({ code: '', name: '' }))}
        />
      )}
      <Gate query={list} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {list.data?.length === 0 ? <StateView state="empty" message={t('wp12.pl.none')} /> : null}
        {(list.data ?? []).map((p) => (
          <Card key={p.id}>
            <Text style={kit.name}>
              {p.name} ({p.code}) · {t(`wp12.st.${p.status}`, { defaultValue: p.status })}
            </Text>
            {p.versions.length === 0 ? <Text style={kit.sub}>{t('wp12.pl.noVersions')}</Text> : null}
            {p.versions.map((v) => (
              <Text key={v.id} style={kit.sub}>
                v{v.versionNo} · {t(`wp12.st.${v.status}`, { defaultValue: v.status })} ·{' '}
                {t('wp12.pl.entitlements', { count: Object.keys(v.entitlements).length })}
                {v.publishedAt ? ` · ${v.publishedAt.slice(0, 10)}` : ''}
              </Text>
            ))}
          </Card>
        ))}
      </Gate>
    </Page>
  );
}

// ---- platform audit ---------------------------------------------------------------------------------------------------------------
export function PlatformAuditScreen() {
  const { t, client, userId, ready, allowed } = useP();
  const [action, setAction] = useState('');
  const [franchiseId, setFranchiseId] = useState('');
  const list = useQuery({
    queryKey: K(userId, 'audit', action.trim(), franchiseId.trim()),
    queryFn: ({ signal }) =>
      client!.get<{
        items: {
          at: string;
          action: string;
          targetType: string;
          targetId: string | null;
          actorId: string | null;
          outcome: string;
        }[];
      }>('/platform/audit', {
        query: {
          action: action.trim() || undefined,
          franchiseId: franchiseId.trim() || undefined,
          limit: 100,
        },
        signal,
      }),
    enabled: ready,
    retry,
  });
  if (!allowed) return <Denied />;
  return (
    <Page title={t('wp12.au.title')} hint={t('wp12.au.hint')}>
      <Field
        label={t('wp12.au.action')}
        value={action}
        onChange={setAction}
        placeholder="platform.franchise.suspend"
      />
      <Field label={t('wp12.au.franchise')} value={franchiseId} onChange={setFranchiseId} />
      <Gate query={list} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {list.data?.items.length === 0 ? <StateView state="empty" message={t('wp12.au.none')} /> : null}
        {(list.data?.items ?? []).map((x, i) => (
          <Card key={i}>
            <Text style={kit.name}>{x.action}</Text>
            <Text style={kit.sub}>
              {x.at.slice(0, 16).replace('T', ' ')} · {x.targetType}
              {x.targetId ? ` ${x.targetId.slice(0, 8)}` : ''} ·{' '}
              {x.actorId ? x.actorId.slice(0, 8) : t('wp12.au.system')} · {x.outcome}
            </Text>
          </Card>
        ))}
      </Gate>
    </Page>
  );
}

// ---- platform dashboard -----------------------------------------------------------------------------------------------------------
interface Dash {
  franchises: { total: number; active: number; suspended: number; draft: number };
  growth: { newThisMonth: number; newLastMonth: number };
  plans: { plan: string; franchises: number }[];
  usageThisMonth: { metric: string; total: number | string; franchises: number }[];
  provisioningFailures: {
    name: string;
    code: string;
    failedSteps: number | string;
    lastError: string | null;
  }[];
  recentFranchises: { code: string; name: string; status: string; createdAt: string }[];
  unavailable: { label: string; reason: string }[];
}
export function PlatformDashboardScreen() {
  const { t, client, userId, ready, allowed } = useP();
  const q = useQuery({
    queryKey: K(userId, 'dashboard'),
    queryFn: ({ signal }) => client!.get<Dash>('/platform/dashboard', { signal }),
    enabled: ready,
    retry,
  });
  if (!allowed) return <Denied />;
  const d = q.data;
  return (
    <Page title={t('wp12.db.title')} hint={t('wp12.db.hint')}>
      <Gate query={q} denied={false} deniedText={t('wp12.denied')} offlineText={t('wp12.offline')}>
        {d ? (
          <>
            <Card>
              <Line label={t('wp12.db.total')} value={String(d.franchises.total)} strong />
              <Line label={t('wp12.st.ACTIVE')} value={String(d.franchises.active)} />
              <Line label={t('wp12.st.SUSPENDED')} value={String(d.franchises.suspended)} />
              <Line label={t('wp12.db.draft')} value={String(d.franchises.draft)} />
              <Line label={t('wp12.db.newThis')} value={String(d.growth.newThisMonth)} />
              <Line label={t('wp12.db.newLast')} value={String(d.growth.newLastMonth)} />
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.db.plans')}</Text>
              {d.plans.length === 0 ? <Text style={kit.sub}>{t('wp12.db.noPlans')}</Text> : null}
              {d.plans.map((p) => (
                <Line key={p.plan} label={p.plan} value={String(p.franchises)} />
              ))}
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.db.usage')}</Text>
              {d.usageThisMonth.length === 0 ? <Text style={kit.sub}>{t('wp12.db.noUsage')}</Text> : null}
              {d.usageThisMonth.map((u) => (
                <Line
                  key={u.metric}
                  label={u.metric.replace('limit.', '')}
                  value={`${u.total} · ${t('wp12.db.franchises', { count: u.franchises })}`}
                />
              ))}
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.db.problems')}</Text>
              {d.provisioningFailures.length === 0 ? (
                <Text style={kit.sub}>{t('wp12.db.noProblems')}</Text>
              ) : null}
              {d.provisioningFailures.map((p) => (
                <Text key={p.code} style={kit.sub}>
                  {p.name} ({p.code}) · {t('wp12.db.failed', { count: Number(p.failedSteps) })}
                  {p.lastError ? ` · ${p.lastError}` : ''}
                </Text>
              ))}
            </Card>
            <Card>
              <Text style={kit.name}>{t('wp12.db.newest')}</Text>
              {d.recentFranchises.map((r) => (
                <Text key={r.code} style={kit.sub}>
                  {r.code} · {r.name} · {t(`wp12.st.${r.status}`, { defaultValue: r.status })} ·{' '}
                  {r.createdAt.slice(0, 10)}
                </Text>
              ))}
            </Card>
            {d.unavailable.map((u) => (
              <Text key={u.label} style={kit.sub}>
                {t('wp12.db.unavailable', { label: u.label, reason: u.reason })}
              </Text>
            ))}
          </>
        ) : null}
      </Gate>
    </Page>
  );
}
