import { useState } from 'react';
import { Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/ui/Button';
import { Check } from '@/ui/kit';
import { Card, Chips, Field, Line, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';
import { RunScanNow } from './Parity10';

// Web parity, phase 5 (apps/web/src/pages/ai.js inboxTab, recsTab ask, settingsTab, weather, search aliases, agro knowledge
// import; ai-analytics.js requirement factors). Owner-only parts need ai.governance.manage, like the web.

const GOV = 'ai.governance.manage';
const USE = 'ai.assistant.use';
const useCtx = () => {
  const { me, client } = useAuth();
  const qc = useQueryClient();
  return { client, qc, userId: me?.userId ?? '', ready: client !== null && me !== null };
};
const KEY = (userId: string, what: string, extra = '') => ['ai', 'wp5', userId, what, extra] as const;

// ---- 5.1 AI inbox -----------------------------------------------------------------------------------------------------------
interface Notice5 {
  id: string;
  severity: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}
export function AiInbox() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const q = useQuery({
    queryKey: KEY(userId, 'inbox'),
    queryFn: ({ signal }) => client!.get<{ unread: number; items: Notice5[] }>('/ai/inbox', { signal }),
    enabled: ready && can(USE),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!can(USE) || !q.data || !Array.isArray(q.data.items)) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY(userId, 'inbox') });
  return (
    <Card>
      <Text style={kit.name}>{t('wp5.inbox.title', { count: q.data.unread })}</Text>
      <RunScanNow onDone={refresh} />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {q.data.unread > 0 ? (
        <Button
          kind="ghost"
          label={t('wp5.inbox.readAll')}
          disabled={act.busy}
          onPress={() =>
            void act.run(
              () => client!.post('/ai/inbox/read-all', { idempotencyKey: keys.keyFor('all') }),
              t('wp5.inbox.done'),
              refresh,
            )
          }
        />
      ) : null}
      {q.data.items.length === 0 ? <Text style={kit.sub}>{t('wp5.inbox.none')}</Text> : null}
      {q.data.items.map((n) => (
        <View key={n.id} style={{ gap: 2 }}>
          <Text style={kit.name}>
            {n.read ? '' : '● '}
            {n.title}
          </Text>
          <Text style={kit.sub}>{n.body}</Text>
          <Text style={kit.sub}>
            {t(`wp5.sev.${n.severity}`, { defaultValue: n.severity })} · {n.createdAt.slice(0, 10)}
          </Text>
          {!n.read ? (
            <Button
              kind="ghost"
              label={`${t('wp5.inbox.read')} ${n.title}`}
              disabled={act.busy}
              onPress={() =>
                void act.run(
                  () =>
                    client!.post(`/ai/inbox/${encodeURIComponent(n.id)}/read`, {
                      idempotencyKey: keys.keyFor(`r|${n.id}`),
                    }),
                  t('wp5.inbox.done'),
                  refresh,
                )
              }
            />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

// ---- 5.2 AI settings --------------------------------------------------------------------------------------------------------
interface AiSettings {
  enabled: boolean;
  monthlyQuota: number;
  minMarginPct: string | number | null;
  minCashBuffer: string | number | null;
  openHour: number | null;
  closeHour: number | null;
  version: number;
}
export interface AiSettingsForm {
  enabled: boolean;
  monthlyQuota: string;
  minMarginPct: string;
  minCashBuffer: string;
  openHour: string;
  closeHour: string;
}
export type AiSettingsError = 'quota' | 'margin' | 'cash' | 'open' | 'close';
const num = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
export function aiSettingsErrors(f: AiSettingsForm): AiSettingsError[] {
  const e: AiSettingsError[] = [];
  if (!/^\d{1,7}$/.test(f.monthlyQuota.trim())) e.push('quota');
  if (f.minMarginPct.trim() && (!num(f.minMarginPct) || Number(f.minMarginPct) > 100)) e.push('margin');
  if (f.minCashBuffer.trim() && !num(f.minCashBuffer)) e.push('cash');
  if (f.openHour.trim() && !(/^\d{1,2}$/.test(f.openHour.trim()) && Number(f.openHour) <= 23)) e.push('open');
  if (
    f.closeHour.trim() &&
    !(/^\d{1,2}$/.test(f.closeHour.trim()) && Number(f.closeHour) >= 1 && Number(f.closeHour) <= 24)
  )
    e.push('close');
  return e;
}
/** Like the web: blank optional fields are sent as null. */
export function aiSettingsBody(f: AiSettingsForm) {
  const n = (x: string) => (x.trim() === '' ? null : Number(x));
  return {
    enabled: f.enabled,
    monthlyQuota: Number(f.monthlyQuota),
    minMarginPct: n(f.minMarginPct),
    minCashBuffer: n(f.minCashBuffer),
    openHour: n(f.openHour),
    closeHour: n(f.closeHour),
  };
}
export function AiSettingsCard() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [f, setF] = useState<AiSettingsForm | null>(null);
  const [tried, setTried] = useState(false);
  const q = useQuery({
    queryKey: KEY(userId, 'settings'),
    queryFn: ({ signal }) => client!.get<AiSettings>('/ai/settings', { signal }),
    enabled: ready && can(GOV),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const s = q.data;
  if (!can(GOV) || !s || typeof s.enabled !== 'boolean') return null;
  const errs = f ? aiSettingsErrors(f) : [];
  const bad = (e: AiSettingsError) => (tried && errs.includes(e) ? t(`wp5.set.v.${e}`) : null);
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? t('wp5.set.notSet') : String(v));
  return (
    <Card>
      <Text style={kit.name}>{t('wp5.set.title')}</Text>
      <Line label={t('wp5.set.enabled')} value={t(s.enabled ? 'wp5.set.on' : 'wp5.set.off')} />
      <Line label={t('wp5.set.quota')} value={String(s.monthlyQuota)} />
      <Line label={t('wp5.set.margin')} value={show(s.minMarginPct)} />
      <Line label={t('wp5.set.cash')} value={show(s.minCashBuffer)} />
      <Line label={t('wp5.set.hours')} value={`${show(s.openHour)} - ${show(s.closeHour)}`} />
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {!f ? (
        <Button
          kind="ghost"
          label={t('wp5.set.change')}
          onPress={() => (
            act.clear(),
            keys.reset(),
            setF({
              enabled: s.enabled,
              monthlyQuota: String(s.monthlyQuota),
              minMarginPct: s.minMarginPct === null ? '' : String(s.minMarginPct),
              minCashBuffer: s.minCashBuffer === null ? '' : String(s.minCashBuffer),
              openHour: s.openHour === null ? '' : String(s.openHour),
              closeHour: s.closeHour === null ? '' : String(s.closeHour),
            })
          )}
        />
      ) : (
        <>
          <Check
            label={t('wp5.set.enabledOn')}
            value={f.enabled}
            onChange={(v) => setF({ ...f, enabled: v })}
          />
          <Field
            label={t('wp5.set.quota')}
            value={f.monthlyQuota}
            onChange={(v) => setF({ ...f, monthlyQuota: v })}
            keyboard="numeric"
            error={bad('quota')}
          />
          <Field
            label={t('wp5.set.marginEdit')}
            value={f.minMarginPct}
            onChange={(v) => setF({ ...f, minMarginPct: v })}
            keyboard="decimal-pad"
            error={bad('margin')}
          />
          <Field
            label={t('wp5.set.cashEdit')}
            value={f.minCashBuffer}
            onChange={(v) => setF({ ...f, minCashBuffer: v })}
            keyboard="decimal-pad"
            error={bad('cash')}
          />
          <Field
            label={t('wp5.set.openEdit')}
            value={f.openHour}
            onChange={(v) => setF({ ...f, openHour: v })}
            keyboard="numeric"
            error={bad('open')}
          />
          <Field
            label={t('wp5.set.closeEdit')}
            value={f.closeHour}
            onChange={(v) => setF({ ...f, closeHour: v })}
            keyboard="numeric"
            error={bad('close')}
          />
          <Button
            label={t('wp5.set.save')}
            disabled={act.busy}
            onPress={() => {
              setTried(true);
              if (aiSettingsErrors(f).length > 0) return;
              const body = aiSettingsBody(f);
              void act.run(
                () =>
                  client!.put('/ai/settings', {
                    body,
                    version: s.version,
                    idempotencyKey: keys.keyFor(`${s.version}|${JSON.stringify(body)}`),
                  }),
                t('wp5.set.saved'),
                () => (
                  setF(null),
                  setTried(false),
                  void qc.invalidateQueries({ queryKey: KEY(userId, 'settings') })
                ),
              );
            }}
          />
          <Button kind="ghost" label={t('wp5.cancel')} onPress={() => (setF(null), setTried(false))} />
        </>
      )}
    </Card>
  );
}

// ---- 5.3 search aliases -----------------------------------------------------------------------------------------------------
interface Alias {
  id: string;
  term: string;
  canonical: string;
  kind: string;
  active: boolean;
  source: 'DEFAULT' | 'FRANCHISE';
  version: number;
}
export const ALIAS_KINDS = ['CROP', 'PEST', 'PRODUCT_TYPE', 'NUTRIENT', 'OTHER'] as const;
export function AliasesCard() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [form, setForm] = useState<{ term: string; canonical: string; kind: string } | null>(null);
  const q = useQuery({
    queryKey: KEY(userId, 'aliases'),
    queryFn: ({ signal }) => client!.get<{ items: Alias[] }>('/ai/search/aliases', { signal }),
    enabled: ready && can('product.view'),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!q.data || !Array.isArray(q.data.items)) return null;
  const owner = can(GOV);
  const own = q.data.items.filter((a) => a.source === 'FRANCHISE');
  const defaults = q.data.items.filter((a) => a.source === 'DEFAULT');
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY(userId, 'aliases') });
  const ok = form !== null && form.term.trim().length > 0 && form.canonical.trim().length > 0;
  return (
    <Card>
      <Text style={kit.name}>{t('wp5.alias.title')}</Text>
      <Text style={kit.sub}>{t('wp5.alias.count', { defaults: defaults.length, own: own.length })}</Text>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {owner && !form ? (
        <Button
          kind="ghost"
          label={t('wp5.alias.add')}
          onPress={() => (keys.reset(), setForm({ term: '', canonical: '', kind: 'OTHER' }))}
        />
      ) : null}
      {form ? (
        <>
          <Text style={kit.sub}>{t('wp5.alias.hint')}</Text>
          <Field
            label={t('wp5.alias.term')}
            value={form.term}
            onChange={(v) => setForm({ ...form, term: v })}
          />
          <Field
            label={t('wp5.alias.canonical')}
            value={form.canonical}
            onChange={(v) => setForm({ ...form, canonical: v })}
          />
          <Chips
            label={t('wp5.alias.kind')}
            options={ALIAS_KINDS.map((k) => ({ id: k, label: t(`wp5.alias.k.${k}`) }))}
            value={form.kind}
            onChange={(v) => setForm({ ...form, kind: v })}
          />
          <Button
            label={t('wp5.alias.save')}
            disabled={act.busy || !ok}
            onPress={() => {
              const body = { term: form.term.trim(), canonical: form.canonical.trim(), kind: form.kind };
              void act.run(
                () =>
                  client!.post('/ai/search/aliases', {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  }),
                t('wp5.alias.saved'),
                () => (setForm(null), refresh()),
              );
            }}
          />
          <Button kind="ghost" label={t('wp5.cancel')} onPress={() => setForm(null)} />
        </>
      ) : null}
      {own.map((a) => (
        <View key={a.id} style={{ gap: 2 }}>
          <Line label={`${a.term} → ${a.canonical}`} value={t(a.active ? 'wp5.set.on' : 'wp5.set.off')} />
          {owner ? (
            <Button
              kind="ghost"
              label={`${t(a.active ? 'wp5.alias.off' : 'wp5.alias.on')} ${a.term}`}
              disabled={act.busy}
              onPress={() =>
                void act.run(
                  () =>
                    client!.post(`/ai/search/aliases/${encodeURIComponent(a.id)}/active`, {
                      body: { active: !a.active, expectedVersion: a.version },
                      idempotencyKey: keys.keyFor(`a|${a.id}|${a.version}`),
                    }),
                  t('wp5.alias.switched'),
                  refresh,
                )
              }
            />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

// ---- 5.5 weather locations, rules, refresh -----------------------------------------------------------------------------------
interface Loc {
  branchId: string;
  name: string;
  latitude: number;
  longitude: number;
  version: number;
}
interface Rule {
  code: string;
  label: string;
  unit: string;
  direction: 'ABOVE' | 'BELOW';
  threshold: number;
  defaultThreshold: number;
  enabled: boolean;
  version: number;
}
/** A latitude -90..90 and a longitude -180..180, as typed. */
export const validLatLng = (lat: string, lng: string) => {
  const ok = (v: string, max: number) =>
    /^-?\d{1,3}(\.\d{1,7})?$/.test(v.trim()) && Math.abs(Number(v)) <= max;
  return ok(lat, 90) && ok(lng, 180);
};
export function WeatherSetup() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [loc, setLoc] = useState<{
    branchId: string;
    name: string;
    lat: string;
    lng: string;
    version?: number;
  } | null>(null);
  const [rule, setRule] = useState<{
    code: string;
    threshold: string;
    enabled: boolean;
    version: number;
  } | null>(null);
  const q = useQuery({
    queryKey: KEY(userId, 'weather'),
    queryFn: async ({ signal }) => {
      const [b, l, r] = await Promise.all([
        client!.get<{ items: { id: string; name: string }[] }>('/branches', { signal }),
        client!.get<{ items: Loc[] }>('/ai/weather/locations', { signal }),
        client!.get<{ items: Rule[] }>('/ai/weather/rules', { signal }),
      ]);
      return { branches: b.items, locs: l.items, rules: r.items };
    },
    enabled: ready && can(GOV),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  if (!can(GOV) || !q.data) return null;
  const d = q.data;
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY(userId, 'weather') });
  return (
    <Card>
      <Text style={kit.name}>{t('wp5.wx.title')}</Text>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {d.branches.map((b) => {
        const l = d.locs.find((x) => x.branchId === b.id);
        return (
          <View key={b.id} style={{ gap: 2 }}>
            <Line
              label={b.name}
              value={l ? `${l.name} (${l.latitude}, ${l.longitude})` : t('wp5.wx.notSet')}
            />
            <View style={kit.row}>
              <Button
                kind="ghost"
                label={`${t('wp5.wx.setLocation')} ${b.name}`}
                onPress={() => (
                  keys.reset(),
                  setLoc({
                    branchId: b.id,
                    name: l?.name ?? b.name,
                    lat: l ? String(l.latitude) : '',
                    lng: l ? String(l.longitude) : '',
                    version: l?.version,
                  })
                )}
              />
              {l ? (
                <Button
                  kind="ghost"
                  label={`${t('wp5.wx.fetch')} ${b.name}`}
                  disabled={act.busy}
                  onPress={() =>
                    void act.run(
                      () =>
                        client!.post('/ai/weather/refresh', {
                          body: { branch: b.id },
                          idempotencyKey: keys.keyFor(`f|${b.id}`),
                        }),
                      t('wp5.wx.fetched'),
                      refresh,
                    )
                  }
                />
              ) : null}
            </View>
          </View>
        );
      })}
      {loc ? (
        <>
          <Text style={kit.sub}>{t('wp5.wx.locHint')}</Text>
          <Field label={t('wp5.wx.place')} value={loc.name} onChange={(v) => setLoc({ ...loc, name: v })} />
          <Field
            label={t('wp5.wx.lat')}
            value={loc.lat}
            onChange={(v) => setLoc({ ...loc, lat: v })}
            keyboard="numbers-and-punctuation"
          />
          <Field
            label={t('wp5.wx.lng')}
            value={loc.lng}
            onChange={(v) => setLoc({ ...loc, lng: v })}
            keyboard="numbers-and-punctuation"
          />
          {!validLatLng(loc.lat, loc.lng) ? <Text style={kit.sub}>{t('wp5.wx.badLatLng')}</Text> : null}
          <Button
            label={t('wp5.wx.saveLoc')}
            disabled={act.busy || !validLatLng(loc.lat, loc.lng) || loc.name.trim() === ''}
            onPress={() => {
              const body = {
                name: loc.name.trim(),
                latitude: Number(loc.lat),
                longitude: Number(loc.lng),
                ...(loc.version !== undefined ? { expectedVersion: loc.version } : {}),
              };
              void act.run(
                () =>
                  client!.put(`/ai/weather/locations/${encodeURIComponent(loc.branchId)}`, {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  }),
                t('wp5.wx.saved'),
                () => (setLoc(null), refresh()),
              );
            }}
          />
          <Button kind="ghost" label={t('wp5.cancel')} onPress={() => setLoc(null)} />
        </>
      ) : null}
      <Text style={kit.name}>{t('wp5.wx.rules')}</Text>
      {d.rules.map((r) => (
        <View key={r.code} style={{ gap: 2 }}>
          <Line
            label={r.label}
            value={`${r.direction === 'ABOVE' ? '≥' : '≤'} ${r.threshold} ${r.unit} · ${t(r.enabled ? 'wp5.set.on' : 'wp5.set.off')}`}
          />
          <Button
            kind="ghost"
            label={`${t('wp5.wx.change')} ${r.label}`}
            onPress={() => (
              keys.reset(),
              setRule({
                code: r.code,
                threshold: String(r.threshold),
                enabled: r.enabled,
                version: r.version,
              })
            )}
          />
        </View>
      ))}
      {rule ? (
        <>
          <Field
            label={t('wp5.wx.threshold')}
            value={rule.threshold}
            onChange={(v) => setRule({ ...rule, threshold: v })}
            keyboard="numbers-and-punctuation"
          />
          <Check
            label={t('wp5.wx.ruleOn')}
            value={rule.enabled}
            onChange={(v) => setRule({ ...rule, enabled: v })}
          />
          <Button
            label={t('wp5.wx.saveRule')}
            disabled={act.busy || !/^-?\d+(\.\d+)?$/.test(rule.threshold.trim())}
            onPress={() => {
              const body = {
                threshold: Number(rule.threshold),
                enabled: rule.enabled,
                expectedVersion: rule.version,
              };
              void act.run(
                () =>
                  client!.put(`/ai/weather/rules/${encodeURIComponent(rule.code)}`, {
                    body,
                    idempotencyKey: keys.keyFor(JSON.stringify(body)),
                  }),
                t('wp5.wx.saved'),
                () => (setRule(null), refresh()),
              );
            }}
          />
          <Button kind="ghost" label={t('wp5.cancel')} onPress={() => setRule(null)} />
        </>
      ) : null}
    </Card>
  );
}

// ---- 5.8 ask what to reorder --------------------------------------------------------------------------------------------------
interface Stockout {
  state: string;
  reason?: string | null;
  forecast?: { quantity: string | number } | null;
}
export function AskReorder() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [q, setQ] = useState('');
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [branch, setBranch] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  // closed until asked for, so the screen it sits on keeps its own branch chips alone
  const [open, setOpen] = useState(false);
  const found = useQuery({
    queryKey: KEY(userId, 'pp', q.trim()),
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: { id: string; name: string }[] }>('/products', {
          query: { q: q.trim(), limit: 8 },
          signal,
        })
      ).items,
    enabled: ready && can(USE) && q.trim().length >= 2 && !product,
  });
  const branches = useQuery({
    queryKey: KEY(userId, 'branches'),
    queryFn: async ({ signal }) =>
      (await client!.get<{ items: { id: string; name: string }[] }>('/branches', { signal })).items,
    enabled: ready && can(USE) && open,
    staleTime: 10 * 60_000,
  });
  if (!can(USE)) return null;
  if (!open)
    return (
      <Card>
        <Button kind="ghost" label={`▸ ${t('wp5.ask.title')}`} onPress={() => setOpen(true)} />
      </Card>
    );
  const b = branch || branches.data?.[0]?.id || '';
  return (
    <Card>
      <Button kind="ghost" label={`▾ ${t('wp5.ask.title')}`} onPress={() => setOpen(false)} />
      <Text style={kit.sub}>{t('wp5.ask.hint')}</Text>
      <Field
        label={t('wp5.ask.product')}
        value={product ? product.name : q}
        onChange={(v) => (setProduct(null), setQ(v))}
      />
      {!product
        ? (found.data ?? []).map((p) => (
            <Button key={p.id} kind="ghost" label={p.name} onPress={() => setProduct(p)} />
          ))
        : null}
      {(branches.data?.length ?? 0) > 1 ? (
        <Chips
          label={t('wp5.ask.branch')}
          options={(branches.data ?? []).map((x) => ({ id: x.id, label: x.name }))}
          value={b}
          onChange={setBranch}
        />
      ) : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {answer ? <Notice tone="ok" text={answer} /> : null}
      <Button
        label={t('wp5.ask.look')}
        disabled={act.busy || !product || !b}
        onPress={() => {
          setAnswer(null);
          const body = { product: product!.id, branch: b };
          void act.run(async () => {
            const f = await client!.post<Stockout>('/ai/forecast/stockout', {
              body,
              idempotencyKey: keys.keyFor(`s|${JSON.stringify(body)}`),
            });
            if (f.state !== 'RECOMMEND') {
              // like the web: the AI says why it does not recommend instead of guessing
              setAnswer(
                f.reason ?? t('wp5.ask.nothing', { state: f.state.toLowerCase().replace(/_/g, ' ') }),
              );
              return;
            }
            await client!.post('/ai/recommendations/reorder', {
              body,
              idempotencyKey: keys.keyFor(`r|${JSON.stringify(body)}`),
            });
            setAnswer(t('wp5.ask.made', { qty: String(f.forecast?.quantity ?? '') }));
            void qc.invalidateQueries({ queryKey: ['ai'] });
          }, t('wp5.ask.done'));
        }}
      />
    </Card>
  );
}

// ---- 5.6 agro knowledge import (CSV, checked first, saved as drafts) ------------------------------------------------------------
interface ImportCheck {
  valid: number;
  invalid: number;
  rows: { line: number; name?: string; ok: boolean; errors: { field: string; message: string }[] }[];
}
export function KnowledgeImport() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  if (!can(GOV)) return null;
  async function pick() {
    setCheck(null);
    const r = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const csv = await new File(a.uri).text();
    setFile({ name: a.name, csv });
    // the check saves nothing: it lists what is wrong line by line
    void act.run(
      async () =>
        setCheck(
          await client!.post<ImportCheck>('/ai/agro/knowledge/import', {
            body: { csv, dryRun: true },
            idempotencyKey: keys.keyFor(`c|${a.name}|${csv.length}`),
          }),
        ),
      t('wp5.kn.checked'),
    );
  }
  return (
    <Card>
      <Text style={kit.name}>{t('wp5.kn.title')}</Text>
      <Text style={kit.sub}>{t('wp5.kn.hint')}</Text>
      <Button
        kind="ghost"
        label={file ? file.name : t('wp5.kn.pick')}
        disabled={act.busy}
        onPress={() => void pick().catch(() => undefined)}
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {check && check.invalid > 0 ? (
        <>
          <Notice tone="error" text={t('wp5.kn.wrong', { bad: check.invalid, all: check.rows.length })} />
          {check.rows
            .filter((r) => !r.ok)
            .slice(0, 20)
            .map((r) => (
              <Text key={r.line} style={kit.sub}>
                {t('wp5.kn.line', { n: r.line, name: r.name || '-' })}:{' '}
                {r.errors.map((e) => `${e.field} ${e.message}`).join('; ')}
              </Text>
            ))}
        </>
      ) : null}
      {check && check.invalid === 0 && file ? (
        <Button
          label={t('wp5.kn.import', { count: check.valid })}
          disabled={act.busy}
          onPress={() =>
            void act.run(
              () =>
                client!.post('/ai/agro/knowledge/import', {
                  body: { csv: file.csv },
                  idempotencyKey: keys.keyFor(`i|${file.name}|${file.csv.length}`),
                }),
              t('wp5.kn.imported'),
              () => (setFile(null), setCheck(null), void qc.invalidateQueries({ queryKey: ['ai'] })),
            )
          }
        />
      ) : null}
    </Card>
  );
}

// ---- 5.7 crop requirement factors -------------------------------------------------------------------------------------------------
interface Factor {
  id: string;
  crop: string;
  skuId: string;
  product?: string | null;
  stage: string;
  fromDas: number;
  toDas: number;
  unitsPerAcre: string | number;
  version: number;
}
export interface FactorForm {
  crop: string;
  skuId: string;
  skuName: string;
  stage: string;
  fromDas: string;
  toDas: string;
  unitsPerAcre: string;
}
export type FactorError = 'crop' | 'product' | 'stage' | 'days' | 'units';
export function factorErrors(f: FactorForm): FactorError[] {
  const e: FactorError[] = [];
  if (!f.crop.trim()) e.push('crop');
  if (!f.skuId) e.push('product');
  if (!f.stage.trim()) e.push('stage');
  const a = Number(f.fromDas);
  const b = Number(f.toDas);
  if (!/^\d{1,3}$/.test(f.fromDas.trim()) || !/^\d{1,3}$/.test(f.toDas.trim()) || a > b) e.push('days');
  if (!/^\d+(\.\d+)?$/.test(f.unitsPerAcre.trim()) || Number(f.unitsPerAcre) <= 0) e.push('units');
  return e;
}
export const factorBody = (f: FactorForm) => ({
  crop: f.crop.trim(),
  skuId: f.skuId,
  stage: f.stage.trim(),
  fromDas: Number(f.fromDas),
  toDas: Number(f.toDas),
  unitsPerAcre: Number(f.unitsPerAcre),
});
export function CropFactors() {
  const { t } = useTranslation();
  const can = useCan();
  const { client, qc, userId, ready } = useCtx();
  const keys = useActionKey();
  const act = useAction(keys);
  const [edit, setEdit] = useState<{ cur: Factor | null; f: FactorForm } | null>(null);
  const [tried, setTried] = useState(false);
  const [pq, setPq] = useState('');
  const q = useQuery({
    queryKey: KEY(userId, 'factors'),
    queryFn: ({ signal }) => client!.get<{ items: Factor[] }>('/ai/crops/factors', { signal }),
    enabled: ready && can(GOV),
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const found = useQuery({
    queryKey: KEY(userId, 'fp', pq.trim()),
    queryFn: async ({ signal }) =>
      (
        await client!.get<{ items: { id: string; name: string }[] }>('/products', {
          query: { q: pq.trim(), limit: 8 },
          signal,
        })
      ).items,
    enabled: ready && edit !== null && pq.trim().length >= 2,
  });
  if (!can(GOV) || !q.data || !Array.isArray(q.data.items)) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY(userId, 'factors') });
  const start = (cur: Factor | null) => {
    keys.reset();
    setTried(false);
    setPq('');
    setEdit({
      cur,
      f: {
        crop: cur?.crop ?? '',
        skuId: cur?.skuId ?? '',
        skuName: cur?.product ?? '',
        stage: cur?.stage ?? '',
        fromDas: String(cur?.fromDas ?? 0),
        toDas: String(cur?.toDas ?? 30),
        unitsPerAcre: cur ? String(cur.unitsPerAcre) : '',
      },
    });
  };
  const errs = edit ? factorErrors(edit.f) : [];
  const bad = (e: FactorError) => (tried && errs.includes(e) ? t(`wp5.cf.v.${e}`) : null);
  const set = (p: Partial<FactorForm>) => edit && setEdit({ ...edit, f: { ...edit.f, ...p } });
  return (
    <Card>
      <Text style={kit.name}>{t('wp5.cf.title')}</Text>
      <Text style={kit.sub}>{t('wp5.cf.hint')}</Text>
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {!edit ? <Button kind="ghost" label={t('wp5.cf.add')} onPress={() => start(null)} /> : null}
      {edit ? (
        <>
          <Field
            label={t('wp5.cf.crop')}
            value={edit.f.crop}
            onChange={(v) => set({ crop: v })}
            error={bad('crop')}
          />
          <Field
            label={t('wp5.cf.product')}
            value={edit.f.skuName || pq}
            onChange={(v) => (set({ skuId: '', skuName: '' }), setPq(v))}
            error={bad('product')}
          />
          {!edit.f.skuId
            ? (found.data ?? []).map((p) => (
                <Button
                  key={p.id}
                  kind="ghost"
                  label={p.name}
                  onPress={() => set({ skuId: p.id, skuName: p.name })}
                />
              ))
            : null}
          <Field
            label={t('wp5.cf.stage')}
            value={edit.f.stage}
            onChange={(v) => set({ stage: v })}
            error={bad('stage')}
          />
          <Field
            label={t('wp5.cf.from')}
            value={edit.f.fromDas}
            onChange={(v) => set({ fromDas: v })}
            keyboard="numeric"
            error={bad('days')}
          />
          <Field
            label={t('wp5.cf.to')}
            value={edit.f.toDas}
            onChange={(v) => set({ toDas: v })}
            keyboard="numeric"
          />
          <Field
            label={t('wp5.cf.units')}
            value={edit.f.unitsPerAcre}
            onChange={(v) => set({ unitsPerAcre: v })}
            keyboard="decimal-pad"
            error={bad('units')}
          />
          <Button
            label={t('wp5.cf.save')}
            disabled={act.busy}
            onPress={() => {
              setTried(true);
              if (factorErrors(edit.f).length > 0) return;
              const body = factorBody(edit.f);
              const cur = edit.cur;
              void act.run(
                () =>
                  cur
                    ? client!.put(`/ai/crops/factors/${encodeURIComponent(cur.id)}`, {
                        body: { ...body, expectedVersion: cur.version },
                        idempotencyKey: keys.keyFor(`${cur.id}|${cur.version}|${JSON.stringify(body)}`),
                      })
                    : client!.post('/ai/crops/factors', {
                        body,
                        idempotencyKey: keys.keyFor(JSON.stringify(body)),
                      }),
                t('wp5.cf.saved'),
                () => (setEdit(null), refresh()),
              );
            }}
          />
          <Button kind="ghost" label={t('wp5.cancel')} onPress={() => setEdit(null)} />
        </>
      ) : null}
      {q.data.items.map((x) => (
        <View key={x.id} style={{ gap: 2 }}>
          <Line
            label={`${x.crop} · ${x.product ?? '-'} · ${x.stage}`}
            value={`${x.fromDas}-${x.toDas} · ${x.unitsPerAcre}/ac`}
          />
          <View style={kit.row}>
            <Button
              kind="ghost"
              label={`${t('wp5.cf.change')} ${x.crop} ${x.stage}`}
              onPress={() => start(x)}
            />
            <Button
              kind="ghost"
              label={`${t('wp5.cf.remove')} ${x.crop} ${x.stage}`}
              disabled={act.busy}
              onPress={() =>
                void act.run(
                  () =>
                    client!.delete(`/ai/crops/factors/${encodeURIComponent(x.id)}`, {
                      idempotencyKey: keys.keyFor(`d|${x.id}`),
                    }),
                  t('wp5.cf.removed'),
                  refresh,
                )
              }
            />
          </View>
        </View>
      ))}
    </Card>
  );
}
