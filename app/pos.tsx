import { useLocalSearchParams } from 'expo-router';
import PosScreen from '@/features/pos/PosScreen';

/** The counter. A `reorder` param (web parity 11.7) carries a customer and lines from the purchase history. */
export default function PosRoute() {
  const { reorder } = useLocalSearchParams<{ reorder?: string }>();
  return <PosScreen reorder={typeof reorder === 'string' ? reorder : undefined} />;
}
