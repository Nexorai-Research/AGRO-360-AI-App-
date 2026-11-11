import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from './theme';

export function Button({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost'; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.btn, kind === 'ghost' && s.ghost, disabled && s.off]}>
      <Text style={[s.txt, kind === 'ghost' && s.ghostTxt]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: radius, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  off: { opacity: 0.5 },
  txt: { color: colors.brandInk, fontSize: 16, fontWeight: '600' },
  ghostTxt: { color: colors.ink },
});
