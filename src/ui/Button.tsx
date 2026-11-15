import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, pressedOpacity, radius, shadow } from './theme';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: kind === 'ghost' ? colors.brandSoft : 'rgba(255,255,255,0.22)' }}
      style={({ pressed }) => [
        s.btn,
        kind === 'ghost' && s.ghost,
        disabled && s.off,
        pressed && !disabled && s.pressed,
      ]}
    >
      <Text style={[s.txt, kind === 'ghost' && s.ghostTxt]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    minHeight: 50,
    borderRadius: radius,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    overflow: 'hidden',
    ...shadow.card,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brand,
    shadowOpacity: 0,
    elevation: 0,
  },
  off: { opacity: 0.5, shadowOpacity: 0, elevation: 0 },
  pressed: { opacity: pressedOpacity },
  txt: { color: colors.brandInk, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  ghostTxt: { color: colors.brand },
});
