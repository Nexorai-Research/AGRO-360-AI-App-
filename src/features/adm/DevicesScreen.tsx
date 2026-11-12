import { useEffect, useState } from 'react';
import { Platform as RNPlatform, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/kit';
import { StateView } from '../stock/StateView';
import { fmtWhen } from '../admin/logic';
import { Chips, queryState } from '../admin/kit';
import { P, PLATFORMS, admKey, fetchMyDevices, registerDevice, revokeMyDevice, type Platform } from './api';
import { clearRegistration, readRegisteredId, saveRegistration } from './deviceReg';
import { Banner, Card, k, useAccess, useRun } from './kit';
import { validDeviceName, validDeviceReason } from './logic';

const defaultPlatform = (): Platform => (RNPlatform.OS === 'ios' ? 'IOS' : 'ANDROID');

export default function DevicesScreen() {
  const { t } = useTranslation();
  const { client, can, userId } = useAccess();
  const ready = client !== null && userId !== '' && can(P.session);
  const r = useRun(userId);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>(defaultPlatform());
  const [revoking, setRevoking] = useState<{ id: string; reason: string } | null>(null);
  const [thisId, setThisId] = useState<string | null>(null);
  const [keyNotSaved, setKeyNotSaved] = useState(false);

  useEffect(() => {
    void readRegisteredId().then(setThisId);
  }, []);

  const devices = useQuery({
    queryKey: admKey(userId, 'devices'),
    queryFn: ({ signal }) => fetchMyDevices(client!, signal),
    enabled: ready,
    retry: false,
  });

  if (!can(P.session)) return <StateView state="denied" message={t('dev.denied')} />;
  const early = queryState(devices, t, t('dev.offline'));
  if (early) return early;
  const items = devices.data?.items ?? [];

  const register = () =>
    void r.run(
      async () => {
        const body = { name: name.trim(), platform };
        const out = await registerDevice(client!, body, r.idem.keyFor(`reg|${body.name}|${body.platform}`));
        // the key is shown by the server only once; it goes straight into secure storage
        const saved = await saveRegistration({ id: out.device.id, key: out.deviceKey });
        setKeyNotSaved(!saved);
        if (saved) setThisId(out.device.id);
        setName('');
      },
      t('dev.registered'),
      ['devices'],
    );

  return (
    <ScrollView contentContainerStyle={k.page} keyboardShouldPersistTaps="handled">
      <Text style={k.title}>{t('dev.title')}</Text>
      <Text style={k.sub}>{t('dev.hint')}</Text>
      <Banner msg={r.msg} failure={r.failure} />
      {keyNotSaved ? (
        <Text style={k.error} accessibilityRole="alert">
          {t('dev.keyNotSaved')}
        </Text>
      ) : null}

      <Card>
        <Text style={k.name}>{t('dev.register')}</Text>
        <Field
          label={t('dev.name')}
          value={name}
          onChange={setName}
          error={name !== '' && !validDeviceName(name) ? t('dev.badName') : null}
        />
        <Chips
          label={t('dev.platform')}
          value={platform}
          onChange={setPlatform}
          options={PLATFORMS.map((p): [Platform, string] => [p, t(`dev.platforms.${p}`)])}
        />
        <Button label={t('dev.registerNow')} disabled={r.busy || !validDeviceName(name)} onPress={register} />
      </Card>

      {items.length === 0 ? <StateView state="empty" message={t('dev.empty')} /> : null}
      {items.map((d) => (
        <Card key={d.id}>
          <Text style={k.name}>
            {d.name} · {t(`dev.platforms.${d.platform}`, { defaultValue: d.platform })}
          </Text>
          <Text style={k.sub}>
            {t(d.status === 'REGISTERED' ? 'dev.active' : 'dev.revoked')}
            {d.id === thisId ? ` · ${t('dev.thisPhone')}` : ''}
          </Text>
          <Text style={k.sub}>
            {t('dev.line', { registered: fmtWhen(d.registeredAt), seen: fmtWhen(d.lastSeenAt) })}
          </Text>
          {d.permissions.length > 0 ? (
            <Text style={k.sub}>{t('dev.limited', { count: d.permissions.length })}</Text>
          ) : null}
          {d.status === 'REGISTERED' && revoking?.id !== d.id ? (
            <Button
              kind="ghost"
              label={t('dev.revoke')}
              onPress={() => setRevoking({ id: d.id, reason: '' })}
            />
          ) : null}
          {revoking?.id === d.id ? (
            <View style={{ gap: 8 }}>
              <Text style={k.sub}>{t('dev.revokeWarn')}</Text>
              <TextInput
                value={revoking.reason}
                onChangeText={(reason) => setRevoking({ id: d.id, reason })}
                accessibilityLabel={t('dev.reason')}
                placeholder={t('dev.reason')}
                style={k.input}
                maxLength={300}
              />
              {revoking.reason !== '' && !validDeviceReason(revoking.reason) ? (
                <Text style={k.error}>{t('dev.badReason')}</Text>
              ) : null}
              <Button
                label={t('dev.revokeNow')}
                disabled={r.busy || !validDeviceReason(revoking.reason)}
                onPress={() =>
                  void r.run(
                    async () => {
                      await revokeMyDevice(
                        client!,
                        d.id,
                        revoking.reason.trim(),
                        r.idem.keyFor(`rev|${d.id}|${revoking.reason.trim()}`),
                      );
                      if (d.id === thisId) {
                        await clearRegistration();
                        setThisId(null);
                      }
                      setRevoking(null);
                    },
                    t('dev.revokedDone'),
                    ['devices'],
                  )
                }
              />
              <Button kind="ghost" label={t('dev.cancel')} onPress={() => setRevoking(null)} />
            </View>
          ) : null}
        </Card>
      ))}
      <Text style={k.sub}>{t('dev.notBuilt')}</Text>
    </ScrollView>
  );
}
