import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Chips, Field, useActionKey } from '../purchase/ui';
import { Body, Collapse, Msg, s, usePanel } from './plans-ui';
import {
  AREA_UNITS,
  NEXT,
  PP,
  SEASONS,
  confirmPurchasePlan,
  createCropPlan,
  createPurchasePlan,
  fetchCropPlans,
  fetchCrops,
  fetchPlots,
  fetchPurchasePlans,
  transitionCropPlan,
  type CropPlan,
  type PlanStatus,
} from './plans-api';
import {
  buildCropPlan,
  buildPurchasePlan,
  buildTransition,
  cropPlanErrors,
  currentYear,
  purchasePlanErrors,
  transitionErrors,
  type CropPlanForm,
  type PurchasePlanForm,
  type TransitionForm,
} from './plans-logic';

const seasonOpts = (t: (k: string) => string) =>
  SEASONS.map((x) => ({ value: x, label: t(`customers.plans.season.${x}`) }));
const emptyPlan = (): CropPlanForm => ({
  cropId: '',
  season: 'KHARIF',
  seasonYear: currentYear(),
  plotId: '',
  areaValue: '',
  areaUnit: 'ACRE',
  sowingDate: '',
  intercrop: false,
});
const emptyTr = (): TransitionForm => ({ date: '', yieldQty: '', yieldUnit: '', note: '' });
const emptyPP = (): PurchasePlanForm => ({
  season: 'KHARIF',
  seasonYear: currentYear(),
  description: '',
  qty: '',
  neededBy: '',
});

function CropPlans({ customerId, open }: { customerId: string; open: boolean }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<CropPlanForm>(emptyPlan());
  const [tr, setTr] = useState<{ plan: CropPlan; to: PlanStatus } | null>(null);
  const [tf, setTf] = useState<TransitionForm>(emptyTr());
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'cropplans', customerId, (c, sig) => fetchCropPlans(c, customerId, sig));
  const crops = usePanel(open && adding, 'crops', customerId, (c, sig) => fetchCrops(c, sig));
  const plots = usePanel(open && adding, 'plots', customerId, (c, sig) => fetchPlots(c, customerId, sig));
  const qc = useQueryClient();
  const reload = () => void qc.invalidateQueries({ queryKey: ['sal', 'cust'] });
  const canCrop = sal.can(PP.crop);

  function close() {
    setAdding(false);
    setTr(null);
    setTried(false);
    key.reset();
  }
  const errs = cropPlanErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`customers.plans.v.${e}`) : null);
  function save() {
    setTried(true);
    if (cropPlanErrors(f).length > 0) return;
    const body = buildCropPlan(f);
    void sal.act(
      t('customers.plans.cropAdded'),
      () => createCropPlan(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => (close(), setF(emptyPlan()), reload()),
    );
  }
  const tErrs = tr ? transitionErrors(tr.to, tf) : [];
  function move() {
    if (!tr) return;
    setTried(true);
    if (transitionErrors(tr.to, tf).length > 0) return;
    const body = buildTransition(tr.to, tf);
    const { plan } = tr;
    void sal.act(
      t('customers.plans.moved'),
      () =>
        transitionCropPlan(
          sal.client!,
          customerId,
          plan.id,
          body,
          key.keyFor(`${plan.id}|${JSON.stringify(body)}`),
        ),
      () => (close(), setTf(emptyTr()), reload()),
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {canCrop && !adding && !tr ? (
        <Button label={t('customers.plans.addCrop')} onPress={() => (close(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Text style={s.label}>{t('customers.plans.crop')}</Text>
          <Chips
            options={(crops.q.data ?? [])
              .filter((c) => c.status === 'ACTIVE')
              .map((c) => ({ value: c.id, label: c.name }))}
            value={f.cropId}
            onChange={(v) => setF({ ...f, cropId: v })}
          />
          {bad('crop') ? <Text style={s.err}>{bad('crop')}</Text> : null}
          <Chips options={seasonOpts(t)} value={f.season} onChange={(v) => setF({ ...f, season: v })} />
          <Field
            label={t('customers.plans.year')}
            value={f.seasonYear}
            onChange={(v) => setF({ ...f, seasonYear: v })}
            keyboard="numeric"
            error={bad('year')}
          />
          {(plots.q.data ?? []).length > 0 ? (
            <>
              <Text style={s.label}>{t('customers.plans.plot')}</Text>
              <Chips
                options={[
                  { value: '', label: '-' },
                  ...(plots.q.data ?? []).map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.areaAcres} ac)`,
                  })),
                ]}
                value={f.plotId}
                onChange={(v) => setF({ ...f, plotId: v })}
              />
            </>
          ) : null}
          <Field
            label={t('customers.plans.area')}
            value={f.areaValue}
            onChange={(v) => setF({ ...f, areaValue: v })}
            keyboard="decimal-pad"
            error={bad('area')}
          />
          <Chips
            options={AREA_UNITS.map((u) => ({ value: u, label: t(`customers.plans.unit.${u}`) }))}
            value={f.areaUnit}
            onChange={(v) => setF({ ...f, areaUnit: v })}
          />
          <Field
            label={t('customers.plans.sowing')}
            value={f.sowingDate}
            onChange={(v) => setF({ ...f, sowingDate: v })}
            placeholder="YYYY-MM-DD"
            error={bad('date')}
          />
          <Text style={s.label}>{t('customers.plans.intercrop')}</Text>
          <Chips
            options={[
              { value: 'no', label: t('customers.plans.no') },
              { value: 'yes', label: t('customers.plans.yes') },
            ]}
            value={f.intercrop ? 'yes' : 'no'}
            onChange={(v) => setF({ ...f, intercrop: v === 'yes' })}
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
            <Text style={s.sub}>{t('customers.plans.noCrops')}</Text>
          ) : (
            <>
              {rows.map((x) => (
                <View key={x.id} style={s.item}>
                  <Text style={s.name}>
                    {x.cropName}
                    {x.varietyName ? ` (${x.varietyName})` : ''}
                  </Text>
                  <Text style={s.sub}>
                    {t(`customers.plans.season.${x.season}`, { defaultValue: x.season })} {x.seasonYear} ·{' '}
                    {x.plotName ?? '-'} · {x.areaAcres} ac
                  </Text>
                  <Text style={s.sub}>
                    {x.sowingDate} → {x.actualHarvestDate ?? x.expectedHarvestDate} ·{' '}
                    {t(`customers.plans.status.${x.status}`)}
                    {x.stage ? ` · ${x.stage}` : ''}
                  </Text>
                  {canCrop && !tr && !adding ? (
                    <View style={s.row}>
                      {NEXT[x.status].map((to) => (
                        <Button
                          key={to}
                          kind="ghost"
                          label={`${t(`customers.plans.to.${to}`)} ${x.cropName}`}
                          onPress={() => (close(), setTr({ plan: x, to }), setTf(emptyTr()))}
                        />
                      ))}
                      {['PLANNED', 'SOWN', 'GROWING'].includes(x.status) ? (
                        <Button
                          kind="ghost"
                          label={`${t('customers.plans.to.ABANDONED')} ${x.cropName}`}
                          onPress={() => (close(), setTr({ plan: x, to: 'ABANDONED' }), setTf(emptyTr()))}
                        />
                      ) : null}
                    </View>
                  ) : null}
                  {tr?.plan.id === x.id ? (
                    <View style={s.card}>
                      <Field
                        label={
                          tr.to === 'HARVESTED'
                            ? t('customers.plans.harvestDate')
                            : t('customers.plans.dateOpt')
                        }
                        value={tf.date}
                        onChange={(v) => setTf({ ...tf, date: v })}
                        placeholder="YYYY-MM-DD"
                        error={tried && tErrs.includes('date') ? t('customers.plans.v.date') : null}
                      />
                      {tr.to === 'HARVESTED' ? (
                        <>
                          <Field
                            label={t('customers.plans.yieldQty')}
                            value={tf.yieldQty}
                            onChange={(v) => setTf({ ...tf, yieldQty: v })}
                            keyboard="decimal-pad"
                            error={tried && tErrs.includes('yield') ? t('customers.plans.v.yield') : null}
                          />
                          <Field
                            label={t('customers.plans.yieldUnit')}
                            value={tf.yieldUnit}
                            onChange={(v) => setTf({ ...tf, yieldUnit: v })}
                          />
                        </>
                      ) : null}
                      {tr.to === 'ABANDONED' ? (
                        <Field
                          label={t('customers.plans.abandonReason')}
                          value={tf.note}
                          onChange={(v) => setTf({ ...tf, note: v })}
                          multiline
                          error={tried && tErrs.includes('note') ? t('customers.plans.v.note') : null}
                        />
                      ) : null}
                      <View style={s.row}>
                        <Button label={t('customers.plans.confirmMove')} disabled={sal.busy} onPress={move} />
                        <Button kind="ghost" label={t('customers.plans.cancel')} onPress={close} />
                      </View>
                    </View>
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

function PurchasePlans({ customerId, open }: { customerId: string; open: boolean }) {
  const { t } = useTranslation();
  const key = useActionKey();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<PurchasePlanForm>(emptyPP());
  const [tried, setTried] = useState(false);
  const { sal, q } = usePanel(open, 'buyplans', customerId, (c, sig) =>
    fetchPurchasePlans(c, customerId, sig),
  );
  const qc = useQueryClient();
  const reload = () => void qc.invalidateQueries({ queryKey: ['sal', 'cust'] });
  const can = sal.can(PP.plan);
  const errs = purchasePlanErrors(f);
  const bad = (e: string) => (tried && errs.includes(e as never) ? t(`customers.plans.v.${e}`) : null);
  function close() {
    setAdding(false);
    setTried(false);
    key.reset();
  }
  function save() {
    setTried(true);
    if (purchasePlanErrors(f).length > 0) return;
    const body = buildPurchasePlan(f);
    void sal.act(
      t('customers.plans.buyAdded'),
      () => createPurchasePlan(sal.client!, customerId, body, key.keyFor(JSON.stringify(body))),
      () => (close(), setF(emptyPP()), reload()),
    );
  }
  return (
    <>
      {sal.msg ? <Msg ok text={sal.msg} /> : null}
      {sal.failure ? <Msg ok={false} text={sal.failure} /> : null}
      {can && !adding ? (
        <Button label={t('customers.plans.newBuy')} onPress={() => (key.reset(), setAdding(true))} />
      ) : null}
      {adding ? (
        <View style={s.card}>
          <Text style={s.sub}>{t('customers.plans.buyIntro')}</Text>
          <Chips options={seasonOpts(t)} value={f.season} onChange={(v) => setF({ ...f, season: v })} />
          <Field
            label={t('customers.plans.year')}
            value={f.seasonYear}
            onChange={(v) => setF({ ...f, seasonYear: v })}
            keyboard="numeric"
            error={bad('year')}
          />
          <Field
            label={t('customers.plans.item')}
            value={f.description}
            onChange={(v) => setF({ ...f, description: v })}
            error={bad('item')}
          />
          <Field
            label={t('customers.plans.qty')}
            value={f.qty}
            onChange={(v) => setF({ ...f, qty: v })}
            keyboard="decimal-pad"
            error={bad('qty')}
          />
          <Field
            label={t('customers.plans.neededBy')}
            value={f.neededBy}
            onChange={(v) => setF({ ...f, neededBy: v })}
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
            <Text style={s.sub}>{t('customers.plans.noBuy')}</Text>
          ) : (
            <>
              {rows.map((x) => (
                <View key={x.id} style={s.item}>
                  <Text style={s.name}>
                    {t(`customers.plans.season.${x.season}`, { defaultValue: x.season })} {x.seasonYear} ·{' '}
                    {t(`customers.plans.buyStatus.${x.status}`, { defaultValue: x.status })}
                  </Text>
                  {x.lines.map((l) => (
                    <Text key={l.id} style={s.sub}>
                      {l.description} × {l.qty}
                      {l.neededBy ? ` · ${t('customers.plans.by', { date: l.neededBy })}` : ''}
                    </Text>
                  ))}
                  {can && x.status === 'DRAFT' ? (
                    <Button
                      kind="ghost"
                      label={t('customers.plans.confirmBuy')}
                      disabled={sal.busy}
                      onPress={() =>
                        void sal.act(
                          t('customers.plans.buyConfirmed'),
                          () => confirmPurchasePlan(sal.client!, customerId, x.id, key.keyFor(`c|${x.id}`)),
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

/** Crop plans and seasonal purchase plans of one customer. Closed until opened. */
export function PlansPanel({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Collapse title={t('customers.plans.cropTitle')}>
        {(open) => <CropPlans customerId={customerId} open={open} />}
      </Collapse>
      <Collapse title={t('customers.plans.buyTitle')}>
        {(open) => <PurchasePlans customerId={customerId} open={open} />}
      </Collapse>
    </>
  );
}
