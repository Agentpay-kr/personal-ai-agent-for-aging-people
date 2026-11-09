import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowRight, RotateCcw } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../design/Theme';
import { motion, radius, type } from '../design/tokens';

export function Copy({ variant = 'body', muted = false, style, ...props }: TextProps & { variant?: keyof typeof type; muted?: boolean }) {
  const { colors } = useTheme();
  return <Text {...props} style={[type[variant], { color: muted ? colors.muted : colors.ink }, style]} />;
}
export function feedback() { if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); }

export function IconButton({ icon: Icon, label, onPress, disabled = false, filled = false, testID }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; filled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.iconButton, { backgroundColor: filled ? colors.action : colors.surface, opacity: disabled ? 0.4 : pressed ? 0.65 : 1, borderColor: focused ? colors.ink : 'transparent' }]}><Icon size={22} color={filled ? colors.onAction : colors.ink} strokeWidth={1.8} /></Pressable>;
}
export function Button({ label, onPress, icon: Icon, busy = false, disabled = false, variant = 'primary', testID }: { label: string; onPress: () => void; icon?: LucideIcon; busy?: boolean; disabled?: boolean; variant?: 'primary' | 'quiet' | 'danger'; testID?: string }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const foreground = variant === 'primary' ? colors.onAction : variant === 'danger' ? colors.danger : colors.ink;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy, disabled: disabled || busy }} disabled={disabled || busy} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => { feedback(); onPress(); }} style={({ pressed }) => [styles.button, { backgroundColor: variant === 'primary' ? colors.action : colors.quiet, opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1, borderColor: focused ? colors.ink : 'transparent' }]}>
    {busy ? <ActivityIndicator color={foreground} /> : Icon && <Icon size={21} strokeWidth={1.8} color={foreground} />}
    <Copy variant="action" style={{ color: foreground, flexShrink: 1 }}>{label}</Copy>
    {variant === 'primary' && !busy && <ArrowRight size={20} color={foreground} />}
  </Pressable>;
}
export function Companion({ size = 220, animate = false, decorative = false }: { size?: number; animate?: boolean; decorative?: boolean }) {
  const { reducedMotion, colors } = useTheme();
  const entrance = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animate || reducedMotion) { entrance.setValue(1); return; }
    entrance.setValue(0);
    const animation = Animated.spring(entrance, { toValue: 1, ...motion.spring, useNativeDriver: Platform.OS !== 'web' });
    animation.start(); return () => animation.stop();
  }, [animate, reducedMotion, entrance]);
  return <Animated.View aria-hidden={decorative} accessible={!decorative} accessibilityRole="image" accessibilityLabel="노란 말풍선 친구, 몰라" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }], opacity: entrance }}>
    <View style={{ position: 'absolute', width: size * .23, height: size * .22, left: size * .2, bottom: size * .12, backgroundColor: colors.accent, borderBottomLeftRadius: size * .06, transform: [{ rotate: '12deg' }] }} />
    <View style={{ width: size * .86, height: size * .7, borderRadius: size * .29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] }}>
      <View style={{ flexDirection: 'row', gap: size * .14, marginTop: size * .01 }}>
        {[0, 1].map(eye => <View key={eye} style={{ width: size * .08, height: size * .13, borderRadius: size * .04, backgroundColor: '#181818' }} />)}
      </View>
      <View style={{ width: size * .12, height: size * .055, borderBottomWidth: Math.max(1.4, size * .025), borderBottomColor: '#181818', borderRadius: size * .06, marginTop: size * .035 }} />
    </View>
  </Animated.View>;
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  const { colors } = useTheme();
  if (!message) return null;
  return <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: colors.surface }]}><Copy variant="caption" style={{ color: colors.danger, flex: 1 }}>{message}</Copy>{retry && <IconButton icon={RotateCcw} label="다시 연결하기" onPress={retry} />}</View>;
}
export function Page({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.page, { backgroundColor: colors.canvas }, style]}>{children}</View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, width: '100%' },
  iconButton: { width: 48, height: 48, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  button: { minHeight: 60, borderRadius: radius.control, borderWidth: 2, paddingHorizontal: 20, paddingVertical: 16, gap: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  error: { paddingLeft: 16, paddingRight: 8, paddingVertical: 8, marginHorizontal: 24, borderRadius: 16, gap: 12, flexDirection: 'row', alignItems: 'center' },
});
