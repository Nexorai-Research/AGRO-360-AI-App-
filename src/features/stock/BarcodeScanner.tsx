import { useEffect, useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';

/** Full-screen camera that reports the first barcode it reads, once. Asks for camera permission and explains a refusal. */
export function BarcodeScanner({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);
  useEffect(() => {
    if (!visible) done.current = false; // the next open may scan again
  }, [visible]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.wrap}>
        {permission?.granted ? (
          <CameraView
            style={s.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
            onBarcodeScanned={({ data }) => {
              if (done.current || !data) return;
              done.current = true;
              onScanned(data);
            }}
          />
        ) : (
          <View style={s.ask}>
            <Text style={s.txt}>
              {permission && !permission.canAskAgain ? t('stock.cameraDenied') : t('stock.scanHint')}
            </Text>
            {permission?.canAskAgain !== false ? (
              <Button label={t('stock.grantCamera')} onPress={() => void requestPermission()} />
            ) : null}
          </View>
        )}
        <View style={s.bar}>
          <Text style={s.title}>{t('stock.scanTitle')}</Text>
          <Button kind="ghost" label={t('stock.close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  ask: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  txt: { color: '#fff', fontSize: 16, textAlign: 'center' },
  bar: { padding: 16, gap: 8, backgroundColor: '#e9f1ec' },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center', color: '#10261a' },
});
