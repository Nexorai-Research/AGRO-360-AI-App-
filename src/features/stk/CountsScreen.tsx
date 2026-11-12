import { useState } from 'react';
import { Text, View } from 'react-native';
import { dec } from '@/money';
import {
  Btn,
  Card,
  Chips,
  Empty,
  Field,
  Msgs,
  Page,
  Read,
  Check,
  kit,
  useStk,
  useWarehouses,
  useWrite,
  validDec,
} from './kit';

// Physical stock count: GET/POST /inventory/counts, POST .../record, .../submit, .../approve, .../reject, .../cancel (apps/api/src/inventory.controller.ts).
// COUNTING -> SUBMITTED -> APPROVED by a different person (the server enforces who) | REJECTED | CANCELLED. Quantities stay text.
export interface CountLine {
  skuId: string;
  skuCode: string;
  skuName: string;
  batchId: string | null;
  batchNo: string | null;
  systemQty: string;
  countedQty: string | null;
  varianceQty: string | null;
}
export interface CountHead {
  id: string;
  number: string;
  warehouseId: string;
  status: 'COUNTING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  freeze: boolean;
  remarks: string | null;
  decisionNote: string | null;
  lines?: CountLine[];
}
export const lineId = (l: { skuId: string; batchId: string | null }) => `${l.skuId}|${l.batchId ?? ''}`;

/** Variance of a typed count against the system quantity, as text (never a float). */
export const varianceOf = (counted: string, system: string): string =>
  dec(counted)
    .minus(system)
    .toFixed(6)
    .replace(/\.?0+$/, '') || '0';

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, can } = useStk();
  const w = useWrite();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  return (
    <Read<CountHead> path={`/inventory/counts/${id}`}>
      {(c) => {
        const lines = c.lines ?? [];
        const entered = lines.filter((l) => (typed[lineId(l)] ?? '').trim() !== '');
        const bad = entered.some((l) => !validDec(typed[lineId(l)]!, 6, true));
        const uncounted = lines.filter((l) => l.countedQty === null).length;
        return (
          <>
            <Btn kind="ghost" label={t('stkCounts.back')} onPress={onBack} />
            <Card>
              <Text style={kit.name}>
                {c.number} · {t(`stkCounts.status_${c.status}`)}
              </Text>
              {c.freeze ? <Text style={kit.sub}>{t('stkCounts.frozen')}</Text> : null}
              {c.remarks ? <Text style={kit.sub}>{c.remarks}</Text> : null}
              {c.decisionNote ? <Text style={kit.sub}>{c.decisionNote}</Text> : null}
              {c.status === 'COUNTING' ? (
                <Text style={kit.sub}>{t('stkCounts.uncounted', { count: uncounted })}</Text>
              ) : null}
            </Card>
            <Msgs w={w} />
            {lines.map((l) => {
              const k = lineId(l);
              const v = typed[k] ?? '';
              const shown =
                v.trim() !== '' && validDec(v, 6, true) ? varianceOf(v, l.systemQty) : l.varianceQty;
              return (
                <Card key={k}>
                  <Text style={kit.name}>
                    {l.skuCode} {l.skuName}
                  </Text>
                  <Text style={kit.sub}>
                    {[
                      l.batchNo ? t('stkCounts.batch', { no: l.batchNo }) : null,
                      t('stkCounts.system', { qty: l.systemQty }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {c.status === 'COUNTING' && can('inventory.adjust.create') ? (
                    <Field
                      label={t('stkCounts.counted', { code: l.skuCode })}
                      value={v}
                      onChange={(x) => setTyped({ ...typed, [k]: x })}
                      keyboard="decimal-pad"
                      placeholder={l.countedQty ?? ''}
                      error={v.trim() !== '' && !validDec(v, 6, true) ? t('stkCounts.badQty') : null}
                    />
                  ) : (
                    <Text style={kit.sub}>{t('stkCounts.countedIs', { qty: l.countedQty ?? '-' })}</Text>
                  )}
                  {shown !== null && shown !== undefined ? (
                    <Text style={kit.sub}>{t('stkCounts.variance', { qty: shown })}</Text>
                  ) : null}
                </Card>
              );
            })}
            <View style={kit.row}>
              {c.status === 'COUNTING' && can('inventory.adjust.create') ? (
                <Btn
                  label={t('stkCounts.record')}
                  disabled={w.busy || entered.length === 0 || bad}
                  onPress={() =>
                    void w.post(
                      `/inventory/counts/${id}/record`,
                      {
                        lines: entered.map((l) => ({
                          skuId: l.skuId,
                          ...(l.batchId ? { batchId: l.batchId } : {}),
                          countedQty: typed[lineId(l)]!.trim(),
                        })),
                      },
                      t('stkCounts.recorded'),
                      { after: () => setTyped({}) },
                    )
                  }
                />
              ) : null}
              {c.status === 'COUNTING' && can('inventory.adjust.create') ? (
                <Btn
                  label={t('stkCounts.submit')}
                  disabled={w.busy || uncounted > 0}
                  onPress={() =>
                    void w.post(`/inventory/counts/${id}/submit`, undefined, t('stkCounts.submitted'))
                  }
                />
              ) : null}
              {c.status === 'SUBMITTED' && can('inventory.adjust.approve') ? (
                <Btn
                  label={t('stkCounts.approve')}
                  disabled={w.busy}
                  onPress={() =>
                    void w.post(`/inventory/counts/${id}/approve`, undefined, t('stkCounts.approved'))
                  }
                />
              ) : null}
              {c.status === 'SUBMITTED' && can('inventory.adjust.approve') ? (
                <Btn kind="ghost" label={t('stkCounts.reject')} onPress={() => setRejecting(true)} />
              ) : null}
              {(c.status === 'COUNTING' || c.status === 'SUBMITTED') && can('inventory.adjust.create') ? (
                <Btn
                  kind="ghost"
                  label={t('stkCounts.cancel')}
                  disabled={w.busy}
                  onPress={() =>
                    void w.post(`/inventory/counts/${id}/cancel`, undefined, t('stkCounts.cancelled'))
                  }
                />
              ) : null}
            </View>
            {rejecting ? (
              <Card>
                <Field label={t('stkCounts.rejectNote')} value={note} onChange={setNote} />
                <Btn
                  label={t('stkCounts.rejectNow')}
                  disabled={w.busy || note.trim().length < 3}
                  onPress={() =>
                    void w.post(
                      `/inventory/counts/${id}/reject`,
                      { note: note.trim() },
                      t('stkCounts.rejected'),
                      { after: () => setRejecting(false) },
                    )
                  }
                />
              </Card>
            ) : null}
          </>
        );
      }}
    </Read>
  );
}

function StartForm({ onDone }: { onDone: () => void }) {
  const { t } = useStk();
  const w = useWrite();
  const whs = useWarehouses();
  const [wh, setWh] = useState('');
  const [freeze, setFreeze] = useState(true);
  const [remarks, setRemarks] = useState('');
  return (
    <Card>
      <Chips
        label={t('stkCounts.warehouse')}
        options={(whs.data ?? []).map((x) => ({ id: x.id, label: x.name }))}
        value={wh}
        onChange={setWh}
      />
      {whs.isError ? <Text style={kit.sub}>{t('stkCounts.noWarehouses')}</Text> : null}
      <Check label={t('stkCounts.freeze')} value={freeze} onChange={setFreeze} />
      <Field label={t('stkCounts.remarks')} value={remarks} onChange={setRemarks} />
      <Msgs w={w} />
      <Btn
        label={t('stkCounts.start')}
        disabled={w.busy || !wh}
        onPress={() =>
          void w.post(
            '/inventory/counts',
            { warehouseId: wh, freeze, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) },
            t('stkCounts.started'),
            { after: onDone },
          )
        }
      />
    </Card>
  );
}

export default function CountsScreen() {
  const { t, can } = useStk();
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<'' | 'COUNTING' | 'SUBMITTED'>('');
  return (
    <Page title={t('stkCounts.title')} hint={t('stkCounts.hint')} allowed={can('inventory.view')}>
      {open ? (
        <Detail id={open} onBack={() => setOpen(null)} />
      ) : (
        <>
          {can('inventory.adjust.create') ? (
            <Btn label={t('stkCounts.new')} onPress={() => setStarting(!starting)} />
          ) : null}
          {starting ? <StartForm onDone={() => setStarting(false)} /> : null}
          <Chips
            label={t('stkCounts.show')}
            options={[
              { id: '' as const, label: t('stkCounts.all') },
              { id: 'COUNTING' as const, label: t('stkCounts.status_COUNTING') },
              { id: 'SUBMITTED' as const, label: t('stkCounts.status_SUBMITTED') },
            ]}
            value={status}
            onChange={setStatus}
          />
          <Read<{ items: CountHead[] }> path="/inventory/counts" query={{ status: status || undefined }}>
            {(d) => (
              <>
                {d.items.length === 0 ? <Empty text={t('stkCounts.empty')} /> : null}
                {d.items.map((c) => (
                  <Card key={c.id}>
                    <Text style={kit.name}>
                      {c.number} · {t(`stkCounts.status_${c.status}`)}
                    </Text>
                    {c.remarks ? <Text style={kit.sub}>{c.remarks}</Text> : null}
                    <Btn
                      kind="ghost"
                      label={t('stkCounts.open', { number: c.number })}
                      onPress={() => setOpen(c.id)}
                    />
                  </Card>
                ))}
              </>
            )}
          </Read>
        </>
      )}
    </Page>
  );
}
