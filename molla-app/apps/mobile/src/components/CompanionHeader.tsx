import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Compass, ListChecks, Menu, MessageCircle, UserRound, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabParams } from '../data/types';
import { useTheme } from '../design/Theme';
import { Companion, Copy, feedback, IconButton } from './ui';

const destinations = [
  { route: 'Chat', label: '대화', icon: MessageCircle },
  { route: 'Home', label: '둘러보기', icon: Compass },
  { route: 'Tasks', label: '부탁한 일', icon: ListChecks },
  { route: 'Profile', label: '나의 몰라', icon: UserRound },
] as const;

export function CompanionHeader({ name = '몰라', onNavigate, right }: { name?: string; onNavigate: (route: keyof TabParams) => void; right?: React.ReactNode }) {
  const { colors, reducedMotion } = useTheme();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  return <>
    <View style={[styles.header, { paddingTop: inset.top + 8 }]}>
      <View style={[styles.round, { backgroundColor: colors.quiet }]}><IconButton icon={Menu} label="메뉴 열기" onPress={() => setOpen(true)} /></View>
      <View style={styles.identity}><Companion size={64} decorative /><Copy variant="action" style={styles.name}>{name}</Copy></View>
      {right || <IconButton icon={UserRound} label="나의 몰라 열기" onPress={() => onNavigate('Profile')} />}
    </View>
    <Modal visible={open} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setOpen(false)}>
      <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={[styles.drawer, { width: Math.min(width - 48, 340), paddingTop: inset.top + 20, backgroundColor: colors.canvas }]}>
          <View style={styles.drawerTitle}><Copy variant="title">{name}</Copy><IconButton icon={X} label="메뉴 닫기" onPress={() => setOpen(false)} /></View>
          {destinations.map(({ route, label, icon: Icon }) => <Pressable key={route} accessibilityRole="button" onPress={() => { feedback(); setOpen(false); onNavigate(route); }} style={({ pressed }) => [styles.destination, { backgroundColor: pressed ? colors.quiet : 'transparent' }]}><Icon size={24} color={colors.ink} strokeWidth={1.8} /><Copy variant="action">{label}</Copy></Pressable>)}
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 680, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  identity: { alignItems: 'center', flex: 1 }, name: { marginTop: -2, fontSize: 16, lineHeight: 24 },
  round: { borderRadius: 24 }, overlay: { flex: 1 },
  drawer: { height: '100%', paddingHorizontal: 20, borderTopRightRadius: 32, borderBottomRightRadius: 32 },
  drawerTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  destination: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 18, borderRadius: 24, paddingHorizontal: 16 },
});
