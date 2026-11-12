import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Chips, Field, useActionKey } from '../purchase/ui';
import { Body, Collapse, Msg, s, usePanel } from './plans-ui';
import {
  ADVICE_SOURCES,
  CASE_KINDS,
  PP,
  addContact,
  createCase,
  fetchCases,
  fetchContacts,
  removeContact,
} from './plans-api';
import {
  buildCase,
  buildContact,
  caseErrors,
  contactErrors,
  type CaseForm,
  type ContactForm,
} from './plans-logic';

const emptyCase = (): CaseForm => ({
  kind: 'QUERY',
  queryText: '',
  adviceText: '',
  adviceSource: '',
  adviceReference: '',
  followUpOn: '',
});
const emptyContact = (): ContactForm => ({ name: '', phone: '', relation: '', isPrimary: false });

function Cases({ customerId, open }: { customerId: string; open: boolean }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<CaseForm>(emptyCase());
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'cases', customerId, (c, sig) => fetchCases(c, customerId, sig));
  const qc = useQueryClient();
  const errs = caseErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`customers.service.v.${e}`) : null);
  function close() {
    setAdding(false);
    setTried(false);
    key.reset();
  }
  function save() {
    setTried(true);
    if (caseErrors(f).length > 0) return;
    const body = buildCase(f);
    void sal.act(
      t('customers.service.caseAdded'),
      () => createCase(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => {
        close();
        setF(emptyCase());
        void qc.invalidateQueries({ queryKey: ['sal', 'cust'] });
      },
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {sal.can(PP.service) && !adding ? (
        <Button label={t('customers.service.newCase')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Chips
            options={CASE_KINDS.map((x) => ({ value: x, label: t(`customers.service.kind.${x}`) }))}
            value={f.kind}
            onChange={(v) => setF({ ...f, kind: v })}
          />
          <Field
            label={t('customers.service.query')}
            value={f.queryText}
            onChange={(v) => setF({ ...f, queryText: v })}
            multiline
            error={bad('query')}
          />
          <Field
            label={t('customers.service.advice')}
            value={f.adviceText}
            onChange={(v) => setF({ ...f, adviceText: v })}
            multiline
            error={bad('advice')}
          />
          {f.adviceText.trim() !== '' ? (
            <>
              <Text style={s.label}>{t('customers.service.source')}</Text>
              <Chips
                options={ADVICE_SOURCES.map((x) => ({ value: x, label: t(`customers.service.src.${x}`) }))}
                value={f.adviceSource}
                onChange={(v) => setF({ ...f, adviceSource: v })}
              />
              {bad('source') ? <Text style={s.err}>{bad('source')}</Text> : null}
              <Field
                label={t('customers.service.reference')}
                value={f.adviceReference}
                onChange={(v) => setF({ ...f, adviceReference: v })}
                error={bad('reference')}
              />
            </>
          ) : null}
          <Field
            label={t('customers.service.followUp')}
            value={f.followUpOn}
            onChange={(v) => setF({ ...f, followUpOn: v })}
            placeholder="YYYY-MM-DD"
            error={bad('date')}
          />
          <View style={s.row}>
            <Button label={t('customers.plans.save')} disabled={sal.busy} onPress={save} />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('customers.service.noCases')}</Text>
          ) : (
            <>
              {rows.map((x) => (
                <View key={x.id} style={s.item}>
                  <Text style={s.name}>
                    {x.caseNo} · {t(`customers.service.kind.${x.kind}`, { defaultValue: x.kind })}
                  </Text>
                  <Text style={s.sub}>{x.queryText}</Text>
                  {x.adviceText ? (
                    <Text style={s.sub}>
                      {x.adviceText} ({x.adviceReference ?? '-'})
                    </Text>
                  ) : null}
                  <Text style={s.sub}>
                    {x.status}
                    {x.followUpOn ? ` · ${t('customers.service.followUpOn', { date: x.followUpOn })}` : ''}
                  </Text>
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

function Contacts({ customerId, open }: { customerId: string; open: boolean }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<ContactForm>(emptyContact());
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'contacts', customerId, (c, sig) => fetchContacts(c, customerId, sig));
  const qc = useQueryClient();
  const can = sal.can(PP.household);
  const errs = contactErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`customers.service.v.c_${e}`) : null);
  const reload = () => void qc.invalidateQueries({ queryKey: ['sal', 'cust'] });
  function close() {
    setAdding(false);
    setTried(false);
    key.reset();
  }
  function save() {
    setTried(true);
    if (contactErrors(f).length > 0) return;
    const body = buildContact(f);
    void sal.act(
      t('customers.service.contactAdded'),
      () => addContact(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => (close(), setF(emptyContact()), reload()),
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {can && !adding ? (
        <Button label={t('customers.service.addContact')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Field
            label={t('customers.service.contactName')}
            value={f.name}
            onChange={(v) => setF({ ...f, name: v })}
            error={bad('name')}
          />
          <Field
            label={t('customers.service.contactPhone')}
            value={f.phone}
            onChange={(v) => setF({ ...f, phone: v })}
            keyboard="phone-pad"
            error={bad('phone')}
          />
          <Field
            label={t('customers.service.relation')}
            value={f.relation}
            onChange={(v) => setF({ ...f, relation: v })}
            error={bad('relation')}
          />
          <Text style={s.label}>{t('customers.service.primary')}</Text>
          <Chips
            options={[
              { value: 'no', label: t('customers.plans.no') },
              { value: 'yes', label: t('customers.plans.yes') },
            ]}
            value={f.isPrimary ? 'yes' : 'no'}
            onChange={(v) => setF({ ...f, isPrimary: v === 'yes' })}
          />
          <View style={s.row}>
            <Button label={t('customers.plans.save')} disabled={sal.busy} onPress={save} />
            <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
          </View>
        </View>
      ) : null}
      <Body q={q}>
        {(rows) =>
          rows.length === 0 ? (
            <Text style={s.sub}>{t('customers.service.noContacts')}</Text>
          ) : (
            <>
              {rows.map((x) => (
                <View key={x.id} style={s.item}>
                  <Text style={s.name}>
                    {x.name}
                    {x.isPrimary ? ` · ${t('customers.service.primaryTag')}` : ''}
                  </Text>
                  <Text style={s.sub}>
                    {x.phone}
                    {x.relation ? ` · ${x.relation}` : ''}
                  </Text>
                  {can ? (
                    <Button
                      kind="ghost"
                      label={`${t('customers.service.remove')} ${x.name}`}
                      disabled={sal.busy}
                      onPress={() =>
                        void sal.act(
                          t('customers.service.contactRemoved'),
                          () => removeContact(sal.client!, customerId, x.id, key.keyFor(`r|${x.id}`)),
                          () => (key.reset(), reload()),
                        )
                      }
                    />
                  ) : null}
                </View>
              ))}
            </>
          )
        }
      </Body>
    </>
  );
}

/** Service cases and extra contacts of one customer. Closed until opened. */
export function ServicePanel({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Collapse title={t('customers.service.casesTitle')}>
        {(open) => <Cases customerId={customerId} open={open} />}
      </Collapse>
      <Collapse title={t('customers.service.contactsTitle')}>
        {(open) => <Contacts customerId={customerId} open={open} />}
      </Collapse>
    </>
  );
}
