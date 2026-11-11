import { useLocalSearchParams } from 'expo-router';
import ProductDetail from '@/features/products/ProductDetail';

export default function ProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductDetail id={String(id)} />;
}
