import { useState, type ReactElement } from 'react';
import { ScrollView, Text } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { dec, formatINR } from '@/money';
import { Button } from '@/ui/Button';
import { todayIST } from '../collections/receipt';
import { StateView } from '../stock/StateView';
import { previousMonth } from '../accounts/compliance-api';
import { shortDate } from '../hr/logic';
import { Card, Chips, Gate, Line, Notice, isNetwork, kit, useAction, useActionKey, useCan } from '../hr/kit';
import { GST_SNAPSHOT, GST_VIEW, fetchGstr1, freezeReturn, humanise, type Gstr1 } from './cmp-api';

type Sec = 'b2b' | 'b2cl' | 'b2cs' | 'cdn' | 'exempt' | 'hsn' | 'docs' | 'amend';
const SECS: Sec[] = ['b2b', 'b2cl', 'b2cs', 'cdn', 'exempt', 'hsn', 'docs', 'amend'];

export default function Gstr1Screen() {
  const { t } = useTranslation();
  const { me, client } = useAuth();
  const can = useCan();
  const qc = useQueryClient();
  const userId = me?.userId ?? '';
  const allowed = can(GST_VIEW);
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const [sec, setSec] = useState<Sec>('b2b');
  const [sure, setSure] = useState<'gstr1' | 'gstr3b' | null>(null);
  const keys = useActionKey();
  const act = useAction(keys);

  const thisMonth = todayIST().slice(0, 7);
  const period = which === 'this' ? thisMonth : previousMonth(thisMonth);
  const q = useQuery({
    queryKey: ['cmp', userId, 'gstr1', period],
    queryFn: ({ signal }) => fetchGstr1(client!, period, signal),
    enabled: client !== null && me !== null && allowed,
    retry: (n, e) => isNetwork(e) && n < 1,
  });
  const g: Gstr1 | undefined = q.data;

  const freeze = (r: 'gstr1' | 'gstr3b') => {
    const body: Record<string, unknown> = {
      period,
      ...(r === 'gstr1' ? { acknowledgeWarnings: (g?.warnings.length ?? 0) > 0 } : {}),
    };
    return act.run(
      () => freezeReturn(client!, r, body, keys.keyFor(`${r}|${JSON.stringify(body)}`)),
      t('cmp.frozen'),
      () => {
        setSure(null);
        void qc.invalidateQueries({ queryKey: ['cmp', userId] });
      },
    );
  };

  const S = g?.sections;
  const tax = (r: { rate: string; taxable: string; igst: string; cgst: string; sgst: string }) => (
    <>
      <Line label={t('cmp.f.rate')} value={`${r.rate}%`} />
      <Line label={t('cmp.f.taxable')} value={formatINR(r.taxable)} />
      <Line label="IGST" value={formatINR(r.igst)} />
      <Line label="CGST" value={formatINR(r.cgst)} />
      <Line label="SGST" value={formatINR(r.sgst)} />
    </>
  );
  const rows: { key: string; node: ReactElement }[] = [];
  if (S) {
    if (sec === 'b2b')
      S.b2b.forEach((r, i) =>
        rows.push({
          key: `b2b${i}`,
          node: (
            <>
              <Text style={kit.name}>{r.ctin}</Text>
              <Text style={kit.sub}>{r.name ?? ''}</Text>
              <Line label={t('cmp.invoices')} value={String(r.invoices.length)} />
              <Line
                label={t('cmp.f.value')}
                value={formatINR(r.invoices.reduce((a, x) => a.plus(x.value), dec(0)).toFixed(2))}
              />
            </>
          ),
        }),
      );
    if (sec === 'b2cl')
      S.b2cl.forEach((r, i) =>
        rows.push({
          key: `b2cl${i}`,
          node: (
            <>
              <Text style={kit.name}>{r.number}</Text>
              <Line label={t('cmp.f.date')} value={shortDate(r.date)} />
              <Line label={t('cmp.f.place')} value={r.pos ?? ''} />
              <Line label={t('cmp.f.value')} value={formatINR(r.value)} strong />
            </>
          ),
        }),
      );
    if (sec === 'b2cs')
      S.b2cs.forEach((r, i) =>
        rows.push({
          key: `b2cs${i}`,
          node: (
            <>
              <Text style={kit.name}>
                {humanise(r.supply)} · {r.pos ?? ''}
              </Text>
              {tax(r)}
            </>
          ),
        }),
      );
    if (sec === 'cdn') {
      const notes = [
        ...S.cdnr.flatMap((c) => c.notes.map((n) => ({ ...n, ctin: c.ctin }))),
        ...S.cdnur.map((n) => ({ ...n, ctin: '' })),
      ];
      notes.forEach((r, i) =>
        rows.push({
          key: `cdn${i}`,
          node: (
            <>
              <Text style={kit.name}>{r.number}</Text>
              <Text style={kit.sub}>{r.ctin || t('cmp.unregistered')}</Text>
              <Line label={t('cmp.f.invoiceNumber')} value={r.invoiceNumber} />
              <Line label={t('cmp.f.value')} value={formatINR(r.value)} strong />
            </>
          ),
        }),
      );
    }
    if (sec === 'exempt')
      S.exempt.forEach((r, i) =>
        rows.push({
          key: `ex${i}`,
          node: (
            <>
              <Text style={kit.name}>{humanise(r.supply)}</Text>
              <Line label={t('cmp.f.registered')} value={t(r.registered ? 'cmp.yes' : 'cmp.no')} />
              <Line label={t('cmp.f.taxable')} value={formatINR(r.taxable)} strong />
            </>
          ),
        }),
      );
    if (sec === 'hsn')
      S.hsn.forEach((r, i) =>
        rows.push({
          key: `hsn${i}`,
          node: (
            <>
              <Text style={kit.name}>
                {r.hsn} · {r.uqc}
              </Text>
              <Text style={kit.sub}>{r.description}</Text>
              <Line label={t('cmp.f.qty')} value={r.qty} />
              {tax(r)}
            </>
          ),
        }),
      );
    if (sec === 'docs')
      S.docs.forEach((r, i) =>
        rows.push({
          key: `docs${i}`,
          node: (
            <>
              <Text style={kit.name}>{humanise(r.kind)}</Text>
              <Line label={t('cmp.f.from')} value={r.from} />
              <Line label={t('cmp.f.to')} value={r.to} />
              <Line label={t('cmp.f.total')} value={String(r.total)} />
              <Line label={t('cmp.f.cancelled')} value={String(r.cancelled)} />
              <Line label={t('cmp.f.net')} value={String(r.net)} strong />
            </>
          ),
        }),
      );
    if (sec === 'amend')
      S.amendments.forEach((r, i) =>
        rows.push({
          key: `am${i}`,
          node: (
            <>
              <Text style={kit.name}>{r.number}</Text>
              <Text style={kit.sub}>{humanise(r.change)}</Text>
              {r.before ? <Line label={t('cmp.f.before')} value={formatINR(r.before)} /> : null}
              {r.after ? <Line label={t('cmp.f.after')} value={formatINR(r.after)} /> : null}
            </>
          ),
        }),
      );
  }

  return (
    <ScrollView contentContainerStyle={kit.page}>
      <Text style={kit.title} accessibilityRole="header">
        {t('cmp.hub.gstr1')}
      </Text>
      <Text style={kit.sub}>{t('cmp.gstr1Note')}</Text>
      {allowed ? (
        <Chips
          label={t('cmp.month')}
          options={[
            { id: 'this', label: t('cmp.thisMonth', { month: thisMonth }) },
            { id: 'last', label: t('cmp.lastMonth', { month: previousMonth(thisMonth) }) },
          ]}
          value={which}
          onChange={setWhich}
        />
      ) : null}
      {act.msg ? <Notice tone="ok" text={act.msg} /> : null}
      {act.failure ? <Notice tone="error" text={act.failure} /> : null}
      <Gate query={q} denied={!allowed} deniedText={t('cmp.denied')} offlineText={t('cmp.offline')}>
        {g ? (
          <>
            <Card>
              <Line label={t('cmp.f.taxable')} value={formatINR(g.summary.taxable)} />
              <Line label={t('cmp.f.tax')} value={formatINR(g.summary.tax)} strong />
              <Line label={t('cmp.invoices')} value={String(g.summary.invoices)} />
              <Line label={t('cmp.creditNotes')} value={String(g.summary.notes)} />
            </Card>
            <Text style={kit.sub}>
              {g.snapshot
                ? t('cmp.frozenAs', { v: g.snapshot.version, date: shortDate(g.snapshot.createdAt) })
                : t('cmp.notFrozen')}
            </Text>
            {g.checks.map((c) => (
              <Notice
                key={c.key}
                tone={c.ok ? 'ok' : 'warn'}
                text={t(c.ok ? 'cmp.checkOk' : 'cmp.checkBad', {
                  name: humanise(c.key),
                  expected: formatINR(c.expected),
                  actual: formatINR(c.actual),
                })}
              />
            ))}
            {g.warnings.map((w, i) => (
              <Notice key={i} tone="warn" text={w.message} />
            ))}
            {can(GST_SNAPSHOT) ? (
              sure ? (
                <Card>
                  <Text style={kit.sub}>
                    {t(sure === 'gstr1' && g.warnings.length > 0 ? 'cmp.freezeWarn' : 'cmp.freezeSure', {
                      count: g.warnings.length,
                    })}
                  </Text>
                  <Button label={t('cmp.confirm')} disabled={act.busy} onPress={() => void freeze(sure)} />
                  <Button kind="ghost" label={t('cmp.cancel')} onPress={() => setSure(null)} />
                </Card>
              ) : (
                <>
                  <Button
                    label={t('cmp.freezeGstr1')}
                    onPress={() => (act.clear(), keys.reset(), setSure('gstr1'))}
                  />
                  <Button
                    kind="ghost"
                    label={t('cmp.freezeGstr3b')}
                    onPress={() => (act.clear(), keys.reset(), setSure('gstr3b'))}
                  />
                </>
              )
            ) : null}
            <Chips
              label={t('cmp.which')}
              options={SECS.map((s) => ({ id: s, label: t(`cmp.sec.${s}`) }))}
              value={sec}
              onChange={setSec}
            />
            {rows.length === 0 ? <StateView state="empty" message={t('cmp.empty.section')} /> : null}
            {rows.map((r) => (
              <Card key={r.key}>{r.node}</Card>
            ))}
          </>
        ) : null}
      </Gate>
    </ScrollView>
  );
}
