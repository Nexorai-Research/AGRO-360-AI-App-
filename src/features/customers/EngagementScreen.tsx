import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { Card, Notice, kit, useActionKey } from '@/ui/kit';
import { Button } from '@/ui/Button';
import { formatINR } from '@/money';
import { StateView } from '../stock/StateView';
import { useAction } from '../hr/kit';
import {
  CRMPERM,
  createEvent,
  createGreeting,
  createPurpose,
  createTier,
  createWording,
  fetchCoverage,
  fetchEvents,
  fetchGreetings,
  fetchMessages,
  fetchPurposes,
  fetchTiers,
  processComms,
  recomputeTiers,
} from './crm-admin-api';
import {
  tierBody,
  todayIST,
  validPurposeCode,
  validateEvent,
  validateGreeting,
  validateTier,
} from './crm-logic';
import type { Errors } from './crm-logic';
import { FormCard, Panel, Reveal, Row, Tabs, cut, s, useCrm } from './crm-kit';
import { fmtDate } from './ui';

type Tab = 'loyalty' | 'consent' | 'calendar' | 'greetings';
const KINDS = ['FESTIVAL', 'MELA', 'SEASON', 'WEATHER', 'OTHER'] as const;

export default function EngagementScreen() {
  const { t } = useTranslation();
  const { can } = useCrm();
  const tabs: { id: Tab; label: string; ok: boolean }[] = [
    { id: 'loyalty', label: t('cus.eng.tabLoyalty'), ok: can(CRMPERM.view) },
    { id: 'consent', label: t('cus.eng.tabConsent'), ok: can(CRMPERM.view) },
    { id: 'calendar', label: t('cus.eng.tabCalendar'), ok: can(CRMPERM.view) },
    { id: 'greetings', label: t('cus.eng.tabGreetings'), ok: can(CRMPERM.greeting) },
  ];
  const shown = tabs.filter((x) => x.ok);
  const [tab, setTab] = useState<Tab>(shown[0]?.id ?? 'loyalty');
  if (shown.length === 0) return <StateView state="denied" message={t('cus.denied')} />;
  return (
    <ScrollView contentContainerStyle={kit.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('cus.eng.title') }} />
      <Text style={kit.title}>{t('cus.eng.title')}</Text>
      <Text style={kit.sub}>{t('cus.eng.intro')}</Text>
      <Tabs value={tab} onChange={setTab} tabs={shown} />
      {tab === 'loyalty' ? (
        <LoyaltyTab />
      ) : tab === 'consent' ? (
        <ConsentTab />
      ) : tab === 'calendar' ? (
        <CalendarTab />
      ) : (
        <GreetingsTab />
      )}
    </ScrollView>
  );
}

// ---- loyalty ------------------------------------------------------------------------------------------------
function LoyaltyTab() {
  const { t } = useTranslation();
  const { client, can, reload } = useCrm();
  const manage = can(CRMPERM.loyalty);
  const keys = useActionKey();
  const act = useAction(keys);
  const [note, setNote] = useState<string | null>(null);
  return (
    <Panel name={['tiers']} load={fetchTiers}>
      {(rows) => (
        <View style={{ gap: 10 }}>
          {manage ? (
            <>
              <Reveal label={t('cus.eng.addTier')}>
                <FormCard
                  fields={[
                    { name: 'name', label: t('cus.eng.tierName') },
                    { name: 'rank', label: t('cus.eng.tierRank'), keyboard: 'number-pad' },
                    { name: 'minSpend', label: t('cus.eng.tierSpend'), keyboard: 'decimal-pad' },
                    { name: 'minInvoices', label: t('cus.eng.tierBills'), keyboard: 'number-pad' },
                    { name: 'discountPct', label: t('cus.eng.tierDiscount'), keyboard: 'decimal-pad' },
                    { name: 'benefits', label: t('cus.eng.tierBenefits') },
                  ]}
                  submitLabel={t('cus.save')}
                  validate={(v) =>
                    validateTier({
                      name: v.name!,
                      rank: v.rank!,
                      minSpend: v.minSpend!,
                      minInvoices: v.minInvoices!,
                      discountPct: v.discountPct!,
                    })
                  }
                  run={(v, key) =>
                    createTier(
                      client!,
                      tierBody({
                        name: v.name!,
                        rank: v.rank!,
                        minSpend: v.minSpend!,
                        minInvoices: v.minInvoices!,
                        discountPct: v.discountPct!,
                        benefits: v.benefits!,
                      }),
                      key,
                    )
                  }
                  doneText={t('cus.saved')}
                />
              </Reveal>
              <Button
                kind="ghost"
                label={act.busy ? t('common.loading') : t('cus.eng.recompute')}
                disabled={act.busy}
                onPress={() => {
                  void act.run(
                    async () => {
                      const r = await recomputeTiers(client!, keys.keyFor('recompute'));
                      setNote(
                        t('cus.eng.recomputed', { changed: r?.changed ?? 0, points: r?.pointsAdded ?? 0 }),
                      );
                    },
                    t('cus.saved'),
                    reload,
                  );
                }}
              />
              {act.failure ? <Notice tone="error" text={act.failure} /> : null}
              {note ? <Notice tone="ok" text={note} /> : null}
            </>
          ) : null}
          {rows.length === 0 ? <StateView state="empty" message={t('cus.eng.noTiers')} /> : null}
          {rows.map((x) => (
            <Card key={x.id}>
              <Row
                title={`${x.rank}. ${x.name}`}
                lines={[
                  t('cus.eng.tierLine', {
                    spend: formatINR(x.minSpend, 0),
                    bills: x.minInvoices ?? 0,
                    pct: x.discountPct ?? '0',
                  }),
                  x.benefits,
                ]}
              />
            </Card>
          ))}
        </View>
      )}
    </Panel>
  );
}

// ---- consent ------------------------------------------------------------------------------------------------
function ConsentTab() {
  const { t } = useTranslation();
  const { client, can } = useCrm();
  const manage = can(CRMPERM.consent);
  return (
    <Panel name={['purposes']} load={fetchPurposes}>
      {(rows) => (
        <View style={{ gap: 10 }}>
          <Text style={s.h}>{t('cus.eng.purposes')}</Text>
          {manage ? (
            <Reveal label={t('cus.eng.addPurpose')}>
              <FormCard
                fields={[
                  { name: 'code', label: t('cus.eng.purposeCode') },
                  { name: 'name', label: t('cus.eng.purposeName') },
                  { name: 'description', label: t('cus.eng.purposeDesc') },
                ]}
                submitLabel={t('cus.save')}
                validate={(v) => ({
                  ...(validPurposeCode(v.code!) ? {} : { code: 'code' }),
                  ...(v.name!.trim().length >= 2 ? {} : { name: 'text2' }),
                })}
                run={(v, key) =>
                  createPurpose(
                    client!,
                    Object.fromEntries(
                      Object.entries({
                        code: v.code!.trim(),
                        name: v.name!.trim(),
                        description: v.description!.trim(),
                      }).filter(([, x]) => x !== ''),
                    ),
                    key,
                  )
                }
                doneText={t('cus.saved')}
              />
            </Reveal>
          ) : null}
          {rows.length === 0 ? <StateView state="empty" message={t('cus.eng.noPurposes')} /> : null}
          {rows.map((p) => (
            <Card key={p.code}>
              <Row
                title={`${p.code} · ${p.name}`}
                lines={[
                  p.wordingVersion === null
                    ? t('cus.eng.noWording')
                    : t('cus.eng.wordingVersion', {
                        v: p.wordingVersion,
                        draft: String(p.wording?.en ?? '').startsWith('DRAFT') ? t('cus.eng.draft') : '',
                      }),
                ]}
              />
              {manage ? (
                <Reveal label={t('cus.eng.newWording')}>
                  <FormCard
                    fields={[
                      { name: 'en', label: t('cus.eng.wordEn'), multiline: true },
                      { name: 'hi', label: t('cus.eng.wordHi'), multiline: true },
                      { name: 'mr', label: t('cus.eng.wordMr'), multiline: true },
                    ]}
                    initial={{ en: p.wording?.en ?? '', hi: p.wording?.hi ?? '', mr: p.wording?.mr ?? '' }}
                    resetOnDone={false}
                    submitLabel={t('cus.save')}
                    validate={(v): Errors => (v.en!.trim() ? {} : { en: 'text2' })}
                    run={(v, key) =>
                      createWording(
                        client!,
                        p.code,
                        Object.fromEntries(Object.entries(v).filter(([, x]) => x!.trim() !== '')),
                        key,
                      )
                    }
                    doneText={t('cus.saved')}
                  />
                </Reveal>
              ) : null}
            </Card>
          ))}
          {manage ? <Coverage /> : null}
        </View>
      )}
    </Panel>
  );
}

function Coverage() {
  const { t } = useTranslation();
  return (
    <Panel name={['coverage']} load={fetchCoverage}>
      {(c) => (
        <View style={{ gap: 8 }}>
          <Text style={s.h}>{t('cus.eng.coverage')}</Text>
          {c.rows.length === 0 ? <StateView state="empty" message={t('cus.eng.noCoverage')} /> : null}
          {c.rows.map((r) => (
            <Card key={`${r.purpose}-${r.channel}`}>
              <Row
                title={`${r.purpose} · ${r.channel}`}
                lines={[
                  t('cus.eng.coverageLine', {
                    granted: r.granted,
                    total: c.activeCustomers,
                    pct: r.coveragePct,
                  }),
                ]}
              />
            </Card>
          ))}
        </View>
      )}
    </Panel>
  );
}

// ---- calendar -----------------------------------------------------------------------------------------------
function CalendarTab() {
  const { t } = useTranslation();
  const { client, can } = useCrm();
  const today = todayIST();
  return (
    <Panel name={['events', today]} load={(c, signal) => fetchEvents(c, today, signal)}>
      {(rows) => {
        const { shown, more } = cut(rows, 60);
        return (
          <View style={{ gap: 10 }}>
            {can(CRMPERM.calendar) ? (
              <Reveal label={t('cus.eng.addEvent')}>
                <FormCard
                  fields={[
                    { name: 'title', label: t('cus.eng.eventTitle') },
                    {
                      name: 'kind',
                      label: t('cus.eng.eventKind'),
                      choices: KINDS.map((k) => ({ id: k, label: t(`cus.eng.kind.${k}`) })),
                    },
                    { name: 'startDate', label: t('cus.eng.eventStart') },
                    { name: 'endDate', label: t('cus.eng.eventEnd') },
                    { name: 'source', label: t('cus.eng.eventSource') },
                  ]}
                  submitLabel={t('cus.save')}
                  validate={(v) =>
                    validateEvent({ title: v.title!, startDate: v.startDate!, endDate: v.endDate! })
                  }
                  run={(v, key) =>
                    createEvent(
                      client!,
                      Object.fromEntries(
                        Object.entries({ ...v, title: v.title!.trim() }).filter(
                          ([, x]) => String(x).trim() !== '',
                        ),
                      ),
                      key,
                    )
                  }
                  doneText={t('cus.saved')}
                />
              </Reveal>
            ) : null}
            {rows.length === 0 ? <StateView state="empty" message={t('cus.eng.noEvents')} /> : null}
            {shown.map((e) => (
              <Card key={e.id}>
                <Row
                  title={e.title}
                  lines={[
                    `${fmtDate(e.startDate)}${e.endDate ? ` - ${fmtDate(e.endDate)}` : ''}`,
                    t(`cus.eng.kind.${e.kind}`, { defaultValue: e.kind.toLowerCase() }),
                    e.source,
                  ]}
                />
              </Card>
            ))}
            {more > 0 ? <Text style={kit.sub}>{t('cus.more', { count: more })}</Text> : null}
          </View>
        );
      }}
    </Panel>
  );
}

// ---- greetings and messages ---------------------------------------------------------------------------------
function GreetingsTab() {
  const { t } = useTranslation();
  const { client, reload } = useCrm();
  const keys = useActionKey();
  const act = useAction(keys);
  const [note, setNote] = useState<string | null>(null);
  return (
    <View style={{ gap: 10 }}>
      <Text style={kit.sub}>{t('cus.eng.greetingNote')}</Text>
      <Reveal label={t('cus.eng.addGreeting')}>
        <FormCard
          fields={[
            { name: 'name', label: t('cus.eng.greetName') },
            {
              name: 'occasion',
              label: t('cus.eng.greetWhen'),
              choices: [
                { id: 'DATE', label: t('cus.eng.onDate') },
                { id: 'BIRTHDAY', label: t('cus.eng.onBirthday') },
              ],
            },
            { name: 'month', label: t('cus.eng.greetMonth'), keyboard: 'number-pad' },
            { name: 'day', label: t('cus.eng.greetDay'), keyboard: 'number-pad' },
            {
              name: 'channel',
              label: t('cus.eng.greetChannel'),
              choices: [
                { id: 'SMS', label: 'SMS' },
                { id: 'WHATSAPP', label: 'WhatsApp' },
              ],
            },
            { name: 'templateEn', label: t('cus.eng.greetText'), multiline: true },
          ]}
          submitLabel={t('cus.save')}
          validate={(v) => ({
            ...validateGreeting({
              name: v.name!,
              occasion: v.occasion!,
              month: v.month!,
              day: v.day!,
              templateEn: v.templateEn!,
            }),
            ...(v.occasion ? {} : { occasion: 'pick' }),
            ...(v.channel ? {} : { channel: 'pick' }),
          })}
          run={(v, key) =>
            createGreeting(
              client!,
              Object.fromEntries(
                Object.entries({ ...v, name: v.name!.trim() })
                  .filter(([, x]) => String(x).trim() !== '')
                  .map(([k, x]) => [k, k === 'month' || k === 'day' ? Number(x) : x]),
              ),
              key,
            )
          }
          doneText={t('cus.saved')}
        />
      </Reveal>
      <Button
        kind="ghost"
        label={act.busy ? t('common.loading') : t('cus.eng.runNow')}
        disabled={act.busy}
        onPress={() =>
          void act.run(
            async () => {
              const r = await processComms(client!, keys.keyFor('process'));
              setNote(
                t('cus.eng.queued', { count: r.greetings.queued }) +
                  (r.providerConfigured ? '' : ` ${t('cus.eng.noProvider')}`),
              );
            },
            t('cus.saved'),
            reload,
          )
        }
      />
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      {note ? <Notice tone="ok" text={note} /> : null}
      <Panel name={['greetings']} load={fetchGreetings}>
        {(rules) => (
          <View style={{ gap: 8 }}>
            <Text style={s.h}>{t('cus.eng.rules')}</Text>
            {rules.length === 0 ? <StateView state="empty" message={t('cus.eng.noRules')} /> : null}
            {rules.slice(0, 50).map((g) => (
              <Card key={g.id}>
                <Row
                  title={g.name}
                  lines={[
                    g.occasion === 'DATE' ? `${g.day}/${g.month}` : t('cus.eng.onBirthday'),
                    g.channel,
                    g.templateEn,
                  ]}
                />
              </Card>
            ))}
          </View>
        )}
      </Panel>
      <Panel name={['messages']} load={fetchMessages}>
        {(m) => (
          <View style={{ gap: 8 }}>
            <Text style={s.h}>{t('cus.eng.messages')}</Text>
            {m.items.length === 0 ? <StateView state="empty" message={t('cus.eng.noMessages')} /> : null}
            {m.items.slice(0, 50).map((x) => (
              <Card key={x.id}>
                <Row
                  title={x.customerName ?? x.customerId.slice(0, 8)}
                  lines={[
                    fmtDate(x.createdAt.slice(0, 10)),
                    `${x.channel} · ${x.purpose.toLowerCase()}`,
                    x.status,
                    x.suppressReason ? t('cus.eng.whyNot', { reason: x.suppressReason }) : null,
                  ]}
                />
              </Card>
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}
