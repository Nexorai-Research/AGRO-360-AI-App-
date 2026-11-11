import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { kit } from '@/ui/kit';
import { Denied, s, useCan } from '../inventory/kit';
import { PERM } from './api';
import ProductForm from './ProductForm';

export default function NewProduct() {
  const { t } = useTranslation();
  const can = useCan();
  if (!can(PERM.create)) return <Denied text={t('products.deniedCreate')} />;
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={kit.title}>
        {t('products.new')}
      </Text>
      <ProductForm onSaved={(p) => router.replace(`/products/${p.id}` as never)} onCancel={() => router.back()} />
    </ScrollView>
  );
}
