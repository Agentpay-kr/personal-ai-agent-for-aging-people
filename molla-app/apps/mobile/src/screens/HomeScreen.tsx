import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowUpRight, CalendarDays, ChevronRight, Heart, MessageCircle, Sparkles, Smartphone } from 'lucide-react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { TabParams } from '../data/types';
import { useCompanion } from '../data/CompanionStore';
import { useTheme } from '../design/Theme';
import { CompanionHeader } from '../components/CompanionHeader';
import { Copy, ErrorNotice, Page } from '../components/ui';

const categories = [
  { id: 'all', label: '추천', icon: Sparkles },
  { id: 'daily', label: '일상', icon: CalendarDays },
  { id: 'family', label: '가족', icon: Heart },
  { id: 'phone', label: '휴대폰', icon: Smartphone },
] as const;
const ideas = [
  { category: 'daily', icon: CalendarDays, title: '내일 일정, 가볍게 정리해요', description: '잊고 싶지 않은 약속을 함께 챙겨요.', draft: '내일 일정을 같이 정리해 줘' },
  { category: 'family', icon: Heart, title: '가족에게 안부를 전해요', description: '마음을 담은 메시지부터 써 볼까요?', draft: '가족에게 보낼 다정한 안부 메시지를 써 줘' },
  { category: 'phone', icon: Smartphone, title: '휴대폰 사용이 궁금할 때', description: '어려운 기능도 차근차근 알아봐요.', draft: '휴대폰 글씨를 크게 보는 방법을 알려 줘' },
];

export function HomeScreen({ navigation }: BottomTabScreenProps<TabParams, 'Home'>) {
  const { colors } = useTheme();
  const { data, error, refresh, setDraft } = useCompanion();
  const [category, setCategory] = useState('all');
  const pending = data.tasks.filter(task => task.status === 'awaiting_approval').length;
  const start = (draft = '') => { if (draft) setDraft(draft); navigation.navigate('Chat'); };
  return <Page>
    <CompanionHeader name={data.me.agentName} onNavigate={route => navigation.navigate(route)} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Copy variant="display" accessibilityRole="header">둘러보기</Copy>
      <View style={styles.categories}>{categories.map(({ id, label, icon: Icon }) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: category === id }} onPress={() => setCategory(id)} style={styles.category}>
        <View style={[styles.categoryIcon, { backgroundColor: category === id ? colors.accent : colors.quiet }]}><Icon size={24} color={category === id ? colors.accentInk : colors.ink} strokeWidth={1.8} /></View>
        <Copy variant="caption" style={{ fontWeight: category === id ? '700' : '400' }}>{label}</Copy>
      </Pressable>)}</View>
      <Copy variant="caption" muted style={styles.section}>몰라와 함께 해봐요</Copy>
      {ideas.filter(idea => category === 'all' || idea.category === category).map(({ icon: Icon, title, description, draft }) => <Pressable key={title} accessibilityRole="button" accessibilityLabel={`${title}. 대화 시작하기`} onPress={() => start(draft)} style={({ pressed }) => [styles.idea, { borderBottomColor: colors.line, opacity: pressed ? .6 : 1 }]}>
        <View style={[styles.ideaIcon, { backgroundColor: colors.quiet }]}><Icon size={23} color={colors.ink} strokeWidth={1.8} /></View>
        <View style={styles.ideaContent}><Copy variant="action" style={styles.ideaTitle}>{title}</Copy><Copy variant="caption" muted style={styles.description}>{description}</Copy><View style={[styles.ask, { backgroundColor: colors.quiet }]}><Copy variant="caption" style={{ fontWeight: '600' }}>이야기하기</Copy><ArrowUpRight size={16} color={colors.ink} /></View></View>
      </Pressable>)}
      {pending > 0 && <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Tasks')} style={[styles.pending, { backgroundColor: colors.accent }]}><Copy variant="action" style={{ color: colors.accentInk, flex: 1 }}>확인을 기다리는 부탁 {pending}개</Copy><ChevronRight color={colors.accentInk} size={20} /></Pressable>}
      <Pressable testID="start-conversation" accessibilityRole="button" accessibilityLabel="몰라와 이야기하기" onPress={() => start()} style={[styles.freeChat, { backgroundColor: colors.quiet }]}><MessageCircle size={22} color={colors.ink} /><View style={{ flex: 1 }}><Copy variant="action">그냥 수다도 좋아요</Copy><Copy variant="caption" muted>지금 떠오르는 이야기부터.</Copy></View><ChevronRight size={20} color={colors.ink} /></Pressable>
      <ErrorNotice message={error} retry={() => void refresh()} />
    </ScrollView>
  </Page>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28, width: '100%', maxWidth: 640, alignSelf: 'center' },
  categories: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 22, marginBottom: 30 },
  category: { flex: 1, minHeight: 88, alignItems: 'center', gap: 8 }, categoryIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  section: { marginBottom: 6 }, idea: { flexDirection: 'row', gap: 14, paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth },
  ideaIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ideaContent: { flex: 1 }, ideaTitle: { fontSize: 17, lineHeight: 25 }, description: { marginTop: 6 },
  ask: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-end', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 24, marginTop: 14 },
  pending: { minHeight: 56, padding: 16, borderRadius: 22, flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 20 },
  freeChat: { minHeight: 88, marginTop: 24, padding: 20, gap: 14, borderRadius: 26, flexDirection: 'row', alignItems: 'center' },
});
