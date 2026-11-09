import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, Monitor, Moon, ShieldCheck, Sun, Users } from 'lucide-react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { TabParams } from '../data/types';
import { useTheme } from '../design/Theme';
import { useCompanion } from '../data/CompanionStore';
import { Copy, Page } from '../components/ui';
import { LiveControls } from '../components/LiveControls';
import { CompanionHeader } from '../components/CompanionHeader';
import { FamilyControls } from '../components/FamilyControls';

export function ProfileScreen({ navigation }: BottomTabScreenProps<TabParams, 'Profile'>) {
  const { colors, mode, setMode } = useTheme();
  const { data } = useCompanion();
  return <Page><CompanionHeader name={data.me.agentName} onNavigate={route => navigation.navigate(route)} /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: 8 }]}>
    <Copy variant="display" accessibilityRole="header">나의 몰라</Copy>
    <View style={[styles.profile, { backgroundColor: colors.quiet }]}><View style={[styles.profileInitial, { backgroundColor: colors.accent }]}><Copy variant="title" style={{ color: colors.accentInk }}>{data.me.initial}</Copy></View><View style={{ flex: 1 }}><Copy variant="action">{data.me.name}의 공간</Copy><Copy variant="caption" muted>나의 개인 에이전트</Copy></View></View>
    <View style={[styles.promise, { backgroundColor: colors.quiet }]}><ShieldCheck size={24} color={colors.ink} /><View style={{ flex: 1 }}><Copy variant="action">내 이야기는 안전하게</Copy><Copy variant="caption" muted style={{ marginTop: 6 }}>대화와 기억은 내 공간에만.{"\n"}중요한 일은 내가 직접 확인해요.</Copy></View></View>
    <Copy variant="action" style={styles.section}>편안한 화면</Copy>
    <View style={[styles.modes, { backgroundColor: colors.quiet }]}>{([{ id: 'system', label: '기기 설정', icon: Monitor }, { id: 'light', label: '밝게', icon: Sun }, { id: 'dark', label: '어둡게', icon: Moon }] as const).map(({ id, label, icon: Icon }) => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: mode === id }} aria-checked={mode === id} onPress={() => setMode(id)} style={[styles.mode, mode === id && { backgroundColor: colors.surface }]}><Icon color={colors.ink} size={20} /><Copy variant="caption">{label}</Copy></Pressable>)}</View>
    <View style={styles.sectionHeading}><Users size={19} color={colors.ink} /><Copy variant="action">우리 가족</Copy></View>
    {data.members.map(member => <View key={member.id} style={[styles.member, { borderBottomColor: colors.line }]}><View style={[styles.initial, { backgroundColor: member.id === data.me.id ? colors.accent : colors.quiet }]}><Copy variant="action">{member.initial}</Copy></View><View style={{ flex: 1 }}><Copy variant="action">{member.name}{member.id === data.me.id ? ' · 내 공간' : ''}</Copy><Copy variant="caption" muted>{member.consent === 'active' ? '몰라와 함께하는 중' : '수락을 기다려요'}</Copy></View>{member.id === data.me.id && <Check size={18} color={colors.success} />}</View>)}
    <FamilyControls />
    <LiveControls />
  </ScrollView></KeyboardAvoidingView></Page>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingBottom: 32, width: '100%', maxWidth: 640, alignSelf: 'center' },
  profile: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 24, marginBottom: 16, padding: 20, borderRadius: 26 },
  profileInitial: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  promise: { borderRadius: 20, padding: 20, flexDirection: 'row', gap: 14 }, section: { marginTop: 32, marginBottom: 16 },
  modes: { flexDirection: 'row', padding: 4, borderRadius: 18, gap: 4 }, mode: { flex: 1, minHeight: 64, paddingVertical: 10, gap: 5, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flexDirection: 'row', gap: 10, marginTop: 32, marginBottom: 8, alignItems: 'center' },
  member: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  initial: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, scope: { marginVertical: 28, lineHeight: 24 },
  modal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, dialog: { width: '100%', maxWidth: 440, padding: 24, borderRadius: 28 },
});
