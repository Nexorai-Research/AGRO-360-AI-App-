import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { StateView } from '../stock/StateView';
import { retryNetworkOnce } from '../purchase/Gate';
import { Chips, Field, Notice, k, useActionKey } from '../purchase/ui';
import { useSal } from '../collections/sal-hook';
import { AP, akey, diagnose, escalateCase, fetchAgroStatus, fetchBranchRefs, type Diagnosis } from './api';
import { pickPhoto, type PickedPhoto } from './photo';

export const validCrop = (v: string) => v.trim().length >= 2 && v.trim().length <= 80;
export const validSymptoms = (v: string) =>
  v.trim() === '' || (v.trim().length >= 3 && v.trim().length <= 1000);

export default function CropDoctorScreen() {
  const { t } = useTranslation();
  const s = useSal();
  const router = useRouter();
  const kDx = useActionKey();
  const kEsc = useActionKey();
  const [crop, setCrop] = useState('');
  const [stage, setStage] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [branch, setBranch] = useState('');
  const [tried, setTried] = useState(false);
  const [out, setOut] = useState<Diagnosis | null>(null);
  const [note, setNote] = useState('');
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const ok = s.ready && s.can(AP.digest);
  const status = useQuery({
    queryKey: akey(s.userId, 'agro-status'),
    queryFn: ({ signal }) => fetchAgroStatus(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  const branches = useQuery({
    queryKey: akey(s.userId, 'branches'),
    queryFn: ({ signal }) => fetchBranchRefs(s.client!, signal),
    enabled: ok,
    retry: retryNetworkOnce,
  });
  if (!s.can(AP.digest)) return <StateView state="denied" message={t('ai.denied')} />;
  const br = branch || branches.data?.[0]?.id || '';
  const valid = validCrop(crop) && validSymptoms(symptoms) && (photo !== null || symptoms.trim() !== '');
  async function choose() {
    setPhotoMsg(null);
    const r = await pickPhoto();
    if (r.ok) setPhoto(r.photo);
    else if (r.reason === 'TOO_BIG') setPhotoMsg(t('ai.cd.tooBig'));
    else if (r.reason === 'NOT_IMAGE') setPhotoMsg(t('ai.cd.notImage'));
  }
  function run() {
    setTried(true);
    if (!valid) return;
    const body = {
      crop: crop.trim(),
      ...(stage.trim() ? { stage: stage.trim() } : {}),
      ...(symptoms.trim() ? { symptoms: symptoms.trim() } : {}),
      ...(br ? { branch: br } : {}),
      ...(photo ? { image: { data: photo.base64 } } : {}),
    };
    // the key is made from the text and the photo's size and name, not the photo itself
    const fp = JSON.stringify({ ...body, image: photo ? `${photo.name}:${photo.bytes}` : null });
    void s.act(
      t('ai.cd.done'),
      async () => setOut(await diagnose(s.client!, body, kDx.keyFor(fp))),
      () => kDx.reset(),
    );
  }
  function ask() {
    if (!out) return;
    const n = note.trim() || t('ai.cd.defaultNote');
    void s.act(
      t('ai.cd.asked'),
      () => escalateCase(s.client!, out.case.id, n, kEsc.keyFor(`${out.case.id}|${n}`)),
      () => (kEsc.reset(), setNote('')),
    );
  }
  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: t('nav.aiCropDoctor') }} />
      <Text style={k.title}>{t('ai.cd.title')}</Text>
      <Text style={k.sub}>{status.data?.disclaimer ?? t('ai.cd.intro')}</Text>
      {status.data?.message ? <Text style={k.warn}>{status.data.message}</Text> : null}
      {s.msg ? <Notice tone="ok" text={s.msg} /> : null}
      {s.failure ? <Notice tone="error" text={s.failure} /> : null}
      <Field
        label={t('ai.cd.crop')}
        value={crop}
        onChange={setCrop}
        error={tried && !validCrop(crop) ? t('ai.cd.cropBad') : null}
      />
      <Field label={t('ai.cd.stage')} value={stage} onChange={setStage} />
      <Field
        label={t('ai.cd.symptoms')}
        value={symptoms}
        onChange={setSymptoms}
        multiline
        error={
          tried && !validSymptoms(symptoms)
            ? t('ai.cd.symptomsBad')
            : tried && !photo && symptoms.trim() === ''
              ? t('ai.cd.needOne')
              : null
        }
      />
      {status.data?.photoConfigured === false ? <Text style={k.sub}>{t('ai.cd.noPhotoService')}</Text> : null}
      <View style={k.row}>
        <Button
          kind="ghost"
          label={photo ? t('ai.cd.changePhoto') : t('ai.cd.addPhoto')}
          onPress={() => void choose()}
        />
        {photo ? <Button kind="ghost" label={t('ai.cd.removePhoto')} onPress={() => setPhoto(null)} /> : null}
      </View>
      {photo ? (
        <Text style={k.sub}>
          {t('ai.cd.photoChosen', { name: photo.name, kb: Math.round(photo.bytes / 1024) })}
        </Text>
      ) : null}
      {photoMsg ? <Text style={k.error}>{photoMsg}</Text> : null}
      {(branches.data ?? []).length > 1 ? (
        <Chips
          options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          value={br}
          onChange={setBranch}
        />
      ) : null}
      <Button label={t('ai.cd.run')} disabled={s.busy} onPress={run} />
      {out ? (
        <>
          <View style={k.card}>
            <Text style={out.outcome === 'MATCHED' ? k.ok : k.warn}>{out.message}</Text>
            <Text style={k.sub}>{t('ai.cd.basedOn', { source: out.source })}</Text>
            <Text style={k.sub}>{out.verify}</Text>
          </View>
          {out.candidates.map((c) => (
            <View key={c.knowledgeId} style={k.card}>
              <Text style={k.name}>{c.names.en ?? c.names.hi ?? c.names.mr}</Text>
              <Text style={k.sub}>
                {t(`ai.cd.kind.${c.kind}`, { defaultValue: c.kind })}
                {c.level ? ` · ${t(`ai.cd.level.${c.level}`)}` : ''}
              </Text>
              {c.symptoms ? <Text style={k.sub}>{c.symptoms}</Text> : null}
              {c.control.cultural ? (
                <Text style={k.sub}>{t('ai.cd.cultural', { text: c.control.cultural })}</Text>
              ) : null}
              {c.control.biological ? (
                <Text style={k.sub}>{t('ai.cd.biological', { text: c.control.biological })}</Text>
              ) : null}
              {c.control.chemical ? (
                <Text style={k.sub}>{t('ai.cd.chemical', { text: c.control.chemical })}</Text>
              ) : null}
              {c.control.ingredients.length > 0 ? (
                <Text style={k.sub}>
                  {t('ai.cd.ingredients', { list: c.control.ingredients.join(', ') })}
                </Text>
              ) : null}
              {c.control.dose ? (
                <Text style={k.sub}>
                  {t('ai.cd.dose', { text: c.control.dose.text, source: c.control.dose.source })}
                </Text>
              ) : null}
              <Text style={k.sub}>{t('ai.cd.source', { name: c.source.name, ref: c.source.ref })}</Text>
              {br ? (
                <Button
                  kind="ghost"
                  label={t('ai.cd.products')}
                  onPress={() =>
                    router.push({
                      pathname: '/ai-problem-products',
                      params: { id: c.knowledgeId, branch: br, case: out.case.id, name: c.names.en ?? '' },
                    } as never)
                  }
                />
              ) : null}
            </View>
          ))}
          {out.outcome !== 'MATCHED' || out.escalated ? (
            <View style={k.card}>
              <Text style={k.name}>{t('ai.cd.askExpert')}</Text>
              <Field label={t('ai.cd.note')} value={note} onChange={setNote} multiline />
              <Button label={t('ai.cd.ask')} disabled={s.busy} onPress={ask} />
            </View>
          ) : null}
          <Text style={k.sub}>{out.disclaimer}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}
