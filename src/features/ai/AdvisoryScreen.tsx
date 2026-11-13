import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { Gate, retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, k } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AGRO_SEASONS, AP, akey, fetchAdvisory, fetchBranchRefs } from './api';
import { validCrop } from './CropDoctorScreen';

export default function AdvisoryScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const [crop, setCrop] = useState('');
  const [stage, setStage] = useState('');
  const [season, setSeason] = useState('');
  const [branch, setBranch] = useState('');
  const [asked, setAsked] = useState<{ crop: string; stage: string; season: string; branch: string } | null>(
    null,
  );
  const [tried, setTried] = useState(false);
  const ok = s.ready && s.can(AP.digest);
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const q = useQuery({
    queryKey: akey(s.userId, 'advisory', JSON.stringify(asked)),
    queryFn: ({ signal }) => fetchAdvisory(s.client!, asked!, signal),
    enabled: ok && asked !== null,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const go = () => {
    setTried(true);
    if (validCrop(crop)) setAsked({ crop, stage, season, branch });
  };
  const d = q.data;
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiAdvisory') }} />
      <Text style={k.title}>{t('ai.av.title')}</Text>
      <Field
        label={t('ai.cd.crop')}
        value={crop}
        onChange={setCrop}
        error={tried && !validCrop(crop) ? t('ai.cd.cropBad') : null}
      />
      <Field label={t('ai.cd.stage')} value={stage} onChange={setStage} />
      <Chips
        options={[
          { value: '', label: t('ai.av.anySeason') },
          ...AGRO_SEASONS.map((x) => ({ value: x, label: t(`ai.av.season.${x}`) })),
        ]}
        value={season}
        onChange={setSeason}
      />
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={[
            { value: '', label: t('ai.allBranches') },
            ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={branch}
          onChange={setBranch}
        />
      ) : null}
      <Button label={t('ai.av.show')} onPress={go} />
      {asked ? (
        <Gate q={q} ns="ai" emptyKey="ai.av.none" isEmpty={false}>
          {d ? (
            <>
              {d.empty ? <Text style={k.warn}>{d.message ?? t('ai.av.none')}</Text> : null}
              {d.weatherNote ? <Text style={k.sub}>{d.weatherNote}</Text> : null}
              {d.sections.map((sec) => (
                <View key={sec.title} style={k.card}>
                  <Text style={k.name}>{sec.title}</Text>
                  {sec.items.map((it, i) => (
                    <View key={`${it.sourceRef}-${i}`}>
                      <Text style={k.sub}>• {it.text}</Text>
                      <Text style={k.sub}>{t('ai.cd.source', { name: it.source, ref: it.sourceRef })}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Text style={k.sub}>{d.disclaimer}</Text>
            </>
          ) : null}
        </Gate>
      ) : null}
    </ScrollView>
  );
}
