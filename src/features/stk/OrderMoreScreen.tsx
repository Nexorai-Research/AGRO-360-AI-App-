import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatINR } from '@/money';
import { Btn, Card, Field, Msgs, Page, Read, kit, useStk, useWrite } from './kit';

// Order extras the first order screens lack: send to supplier, revise an approved order, close the rest of a part-received order.
// POST /procurement/purchase-orders/:id/send (purchase.order.send), /revise and /close (purchase.order.create). Editing a draft is NOT built.
interface OrderHead {
  id: string;
  number: string | null;
  revision: number;
  supplierName: string;
  status: string;
  total: string;
  version: number;
}

export default function OrderMoreScreen() {
  const { t, can } = useStk();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const w = useWrite();
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Page title={t('stkOrder.title')} hint={t('stkOrder.hint')} allowed={can('purchase.view') && id !== ''}>
      <Read<OrderHead> path={`/procurement/purchase-orders/${id}`}>
        {(o) => (
          <>
            <Card>
              <Text style={kit.name}>
                {o.number ?? t('stkGrn.draft')} r{o.revision} · {o.supplierName}
              </Text>
              <Text style={kit.sub}>
                {o.status} · {formatINR(o.total)}
              </Text>
            </Card>
            <Msgs w={w} />
            <View style={kit.row}>
              {['APPROVED', 'SENT'].includes(o.status) && can('purchase.order.send') ? (
                <Btn
                  label={t('stkOrder.send')}
                  disabled={w.busy}
                  onPress={() =>
                    void w.post(
                      `/procurement/purchase-orders/${o.id}/send`,
                      { channel: 'DOWNLOAD' },
                      t('stkOrder.sent'),
                    )
                  }
                />
              ) : null}
              {['APPROVED', 'SENT', 'PART_RECEIVED'].includes(o.status) && can('purchase.order.create') ? (
                <Btn
                  kind="ghost"
                  label={t('stkOrder.revise')}
                  disabled={w.busy}
                  onPress={() =>
                    void w.post(
                      `/procurement/purchase-orders/${o.id}/revise`,
                      undefined,
                      t('stkOrder.revised'),
                    )
                  }
                />
              ) : null}
              {['PART_RECEIVED', 'RECEIVED'].includes(o.status) && can('purchase.order.create') ? (
                <Btn kind="ghost" label={t('stkOrder.close')} onPress={() => setClosing(!closing)} />
              ) : null}
            </View>
            {closing ? (
              <Card>
                <Text style={kit.sub}>{t('stkOrder.closeHint')}</Text>
                <Field label={t('stkOrder.reason')} value={reason} onChange={setReason} />
                <Btn
                  label={t('stkOrder.closeNow')}
                  disabled={w.busy || reason.trim().length < 5}
                  onPress={() =>
                    void w.post(
                      `/procurement/purchase-orders/${o.id}/close`,
                      { reason: reason.trim() },
                      t('stkOrder.closed'),
                      { version: o.version, after: () => setClosing(false) },
                    )
                  }
                />
              </Card>
            ) : null}
          </>
        )}
      </Read>
    </Page>
  );
}
