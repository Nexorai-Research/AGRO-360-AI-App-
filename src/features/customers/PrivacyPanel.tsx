import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Chips, Field, useActionKey } from '../purchase/ui';
import { Body, Collapse, Msg, s, usePanel } from './plans-ui';
import {
  CHANNELS,
  PP,
  anonymizeCustomer,
  fetchAccessLog,
  fetchPreference,
  savePreference,
  setCustomerStatus,
} from './plans-api';
import {
  anonymizeConfirmText,
  prefBody,
  prefErrors,
  prefToForm,
  validAnonymizeReason,
  type PrefForm,
} from './plans-logic';

function Preferences({ customerId, open }: { customerId: string; open: boolean }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [f, setF] = useState<PrefForm | null>(null);
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'prefs', customerId, (c, sig) => fetchPreference(c, customerId, sig));
  const qc = useQueryClient();
  const errs = f ? prefErrors(f) : [];
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`customers.privacy.v.${e}`) : null);
  function save(version: number, orig: NonNullable<typeof q.data>) {
    if (!f) return;
    setTried(true);
    if (prefErrors(f).length > 0) return;
    const body = prefBody(f, orig);
    if (Object.keys(body).length === 0) return setF(null);
    void sal.act(
      t('customers.privacy.prefSaved'),
      () =>
        savePreference(
          sal.client!,
          customerId,
          version,
          body,
          key.keyFor(`${version}|${JSON.stringify(body)}`),
        ),
      () => {
        setF(null);
        setTried(false);
        key.reset();
        void qc.invalidateQueries({ queryKey: ['sal', 'cust'] });
      },
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      <Body q={q}>
        {(p) =>
          f ? (
            <View style={s.card}>
              <Text style={s.label}>{t('customers.privacy.channel')}</Text>
              <Chips
                options={[
                  { value: '', label: t('customers.privacy.noChannel') },
                  ...CHANNELS.map((c) => ({ value: c, label: c })),
                ]}
                value={f.channel}
                onChange={(v) => setF({ ...f, channel: v })}
              />
              <Field
                label={t('customers.privacy.quietStart')}
                value={f.quietStart}
                onChange={(v) => setF({ ...f, quietStart: v })}
                placeholder="HH:MM"
                error={bad('start') ?? bad('quiet')}
              />
              <Field
                label={t('customers.privacy.quietEnd')}
                value={f.quietEnd}
                onChange={(v) => setF({ ...f, quietEnd: v })}
                placeholder="HH:MM"
                error={bad('end')}
              />
              <Field
                label={t('customers.privacy.maxPerWeek')}
                value={f.maxPerWeek}
                onChange={(v) => setF({ ...f, maxPerWeek: v })}
                keyboard="numeric"
                error={bad('max')}
              />
              <View style={s.row}>
                <Button
                  label={t('customers.plans.save')}
                  disabled={sal.busy}
                  onPress={() => save(p.version, p)}
                />
                <Button
                  kind="ghost"
                  label={t('customers.plans.cancel')}
                  onPress={() => (setF(null), setTried(false))}
                />
              </View>
            </View>
          ) : (
            <View style={s.item}>
              <Text style={s.name}>
                {t('customers.privacy.channel')}: {p.preferredChannel ?? t('customers.privacy.noChannel')}
              </Text>
              <Text style={s.sub}>
                {p.quietStart && p.quietEnd
                  ? t('customers.privacy.quiet', { from: p.quietStart, to: p.quietEnd })
                  : t('customers.privacy.noQuiet')}
                {' · '}
                {p.maxPerWeek === null
                  ? t('customers.privacy.noMax')
                  : t('customers.privacy.max', { n: p.maxPerWeek })}
              </Text>
              {sal.can(PP.prefs) ? (
                <Button
                  kind="ghost"
                  label={t('customers.privacy.changePrefs')}
                  onPress={() => (key.reset(), setF(prefToForm(p)))}
                />
              ) : null}
            </View>
          )
        }
      </Body>
    </>
  );
}

function AccessLog({ customerId, open }: { customerId: string; open: boolean }) {
  const { t } = useTranslation();
  const { q } = usePanel(open, 'kyclog', customerId, (c, sig) => fetchAccessLog(c, customerId, sig));
  return (
    <Body q={q}>
      {(rows) =>
        rows.length === 0 ? (
          <Text style={s.sub}>{t('customers.privacy.noLog')}</Text>
        ) : (
          <>
            {rows.map((x) => (
              <View key={x.id} style={s.item}>
                <Text style={s.name}>{x.action}</Text>
                <Text style={s.sub}>
                  {x.at.slice(0, 16).replace('T', ' ')} ·{' '}
                  {t('customers.privacy.byUser', { id: (x.actorId ?? '-').slice(-6) })}
                </Text>
              </View>
            ))}
          </>
        )
      }
    </Body>
  );
}

function Danger({ customerId, code, status }: { customerId: string; code: string; status: string }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const { sal } = usePanel(false, 'danger', customerId);
  const qc = useQueryClient();
  const [ask, setAsk] = useState<'status' | 'anon' | null>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const next = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const refresh = () => void qc.invalidateQueries({ queryKey: ['customers'] });
  function close() {
    setAsk(null);
    setReason('');
    setConfirm('');
    setTried(false);
    key.reset();
  }
  function anon() {
    setTried(true);
    if (!validAnonymizeReason(reason) || confirm !== anonymizeConfirmText(code)) return;
    const body = { reason: reason.trim(), confirm };
    void sal.act(
      t('customers.privacy.anonymized'),
      () => anonymizeCustomer(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => {
        close();
        refresh();
      },
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {sal.can(PP.update) && ask === null ? (
        <Button
          kind="ghost"
          label={t(status === 'ACTIVE' ? 'customers.privacy.deactivate' : 'customers.privacy.activate')}
          onPress={() => setAsk('status')}
        />
      ) : null}
      {ask === 'status' ? (
        <View style={s.card}>
          <Text style={s.sub}>
            {t(status === 'ACTIVE' ? 'customers.privacy.deactivateIntro' : 'customers.privacy.activateIntro')}
          </Text>
          <View style={s.row}>
            <Button
              label={t('customers.privacy.confirmStatus')}
              disabled={sal.busy}
              onPress={() =>
                void sal.act(
                  t('customers.privacy.statusDone'),
                  () => setCustomerStatus(sal.client!, customerId, next, key.keyFor(`s|${next}`)),
                  () => (close(), refresh()),
                )
              }
            />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      {sal.can(PP.privacy) && ask === null ? (
        <Button kind="ghost" label={t('customers.privacy.anonymize')} onPress={() => setAsk('anon')} />
      ) : null}
      {ask === 'anon' ? (
        <View style={s.card}>
          <Text style={s.err}>{t('customers.privacy.anonIntro')}</Text>
          <Field
            label={t('customers.privacy.anonReason')}
            value={reason}
            onChange={setReason}
            multiline
            error={tried && !validAnonymizeReason(reason) ? t('customers.privacy.v.reason') : null}
          />
          <Field
            label={t('customers.privacy.anonConfirm', { text: anonymizeConfirmText(code) })}
            value={confirm}
            onChange={setConfirm}
            autoCapitalize="characters"
            error={tried && confirm !== anonymizeConfirmText(code) ? t('customers.privacy.v.confirm') : null}
          />
          <View style={s.row}>
            <Button label={t('customers.privacy.anonymizeNow')} disabled={sal.busy} onPress={anon} />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
    </>
  );
}

/** Communication preferences, document access log, activate / deactivate and anonymise. Closed until opened. */
export function PrivacyPanel({
  customerId,
  code,
  status,
}: {
  customerId: string;
  code: string;
  status: string;
}) {
  const { t } = useTranslation();
  const { sal } = usePanel(false, 'perm', customerId);
  return (
    <>
      <Collapse title={t('customers.privacy.prefsTitle')}>
        {(open) => <Preferences customerId={customerId} open={open} />}
      </Collapse>
      {sal.can(PP.privacy) ? (
        <Collapse title={t('customers.privacy.logTitle')}>
          {(open) => <AccessLog customerId={customerId} open={open} />}
        </Collapse>
      ) : null}
      {sal.can(PP.update) || sal.can(PP.privacy) ? (
        <Collapse title={t('customers.privacy.dangerTitle')}>
          {() => <Danger customerId={customerId} code={code} status={status} />}
        </Collapse>
      ) : null}
    </>
  );
}
