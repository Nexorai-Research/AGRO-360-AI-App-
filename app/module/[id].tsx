import { useLocalSearchParams } from 'expo-router';
import { ModuleScreen } from '@/features/home/ModuleScreen';

export default function ModuleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ModuleScreen id={id} />;
}
