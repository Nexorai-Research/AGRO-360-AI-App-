import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AI_PUR, AP, runBudgetScenario, type BudgetResult } from './api';
import { rupee, units } from './fmt';
import { budgetBody, validBudget, validPercent } from './scenario-logic';

export default function ScenarioScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const key = useActionKey();
  const [budget, setBudget] = useState('');
  const [change, setChange] = useState('');
  const [cash, setCash] = useState('no');
  const [tried, setTried] = useState(false);
  const [out, setOut] = useState<BudgetResult | null>(null);
  if (!s.can(AP.digest) || !s.can(AI_PUR)) return <StateView state="denied" message={t('ai.denied')} />;
  const useCash = cash === 'yes';
  const bad = !validBudget(budget) || !validPercent(change) || (budget.trim() === '' && !useCash);
  function run() {
    setTried(true);
    if (bad) return;
    const body = budgetBody(budget, change, useCash);
    void s.act(
      t('ai.sc.done'),
      async () => setOut(await runBudgetScenario(s.client!, body, key.keyFor(JSON.stringify(body)))),
      () => key.reset(),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiScenario') }} />
      <Text style={k.title}>{t('ai.sc.title')}</Text>
      <Text style={k.sub}>{t('ai.sc.intro')}</Text>
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Field
        label={t('ai.sc.budget')}
        value={budget}
        onChange={setBudget}
        keyboard="decimal-pad"
        error={tried && !validBudget(budget) ? t('ai.sc.budgetBad') : null}
      />
      <Field
        label={t('ai.sc.change')}
        value={change}
        onChange={setChange}
        keyboard="numeric"
        error={tried && !validPercent(change) ? t('ai.sc.changeBad') : null}
      />
      <Text style={k.sub}>{t('ai.sc.cash')}</Text>
      <Chips
        options={[
          { value: 'no', label: t('ai.no') },
          { value: 'yes', label: t('ai.sc.yes') },
        ]}
        value={cash}
        onChange={setCash}
      />
      {tried && budget.trim() === '' && !useCash ? <Text style={k.error}>{t('ai.sc.needLimit')}</Text> : null}
      <Button label={t('ai.sc.run')} disabled={s.busy} onPress={run} />
      {out ? (
        <>
          <View style={k.card}>
            <Text style={k.name}>
              {t('ai.sc.funded', { funded: rupee(out.funded), wanted: rupee(out.wanted) })}
            </Text>
            <Text style={k.sub}>
              {t('ai.sc.limit', {
                value: rupee(out.limit.applied),
                by: t(`ai.sc.by.${out.limit.bindingLimit}`),
              })}{' '}
              · {t('ai.sc.left', { value: rupee(out.remaining) })}
            </Text>
            <Text style={k.sub}>{t('ai.sc.nothing')}</Text>
          </View>
          {[...out.lines, ...out.notFunded].map((l) => (
            <View key={l.recommendationId} style={k.card}>
              <Text style={k.name}>{l.skuName}</Text>
              <Text style={l.risk === 'HIGH' ? k.error : l.risk === 'MEDIUM' ? k.warn : k.sub}>
                {t(`ai.sc.st.${l.status}`)} ·{' '}
                {t('ai.ro.qty', { n: units(l.fundedQty), want: units(l.wantedQty) })} · {rupee(l.cost)}
              </Text>
              <Text style={k.sub}>{l.riskNote}</Text>
            </View>
          ))}
          {out.assumptions.map((a) => (
            <Text key={a} style={k.sub}>
              • {a}
            </Text>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
