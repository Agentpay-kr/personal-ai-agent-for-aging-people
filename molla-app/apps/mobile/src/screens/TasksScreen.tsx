import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight, CheckCheck, ChevronRight, Clock3 } from 'lucide-react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCompanion } from '../data/CompanionStore';
import { taskStatusLabel, type RootStackParams, type TabParams } from '../data/types';
import { useTheme } from '../design/Theme';
import { Button, Copy, ErrorNotice, Page } from '../components/ui';
import { CompanionHeader } from '../components/CompanionHeader';

export function TasksScreen({ navigation }: BottomTabScreenProps<TabParams, 'Tasks'>) {
  const { colors } = useTheme();
  const { data, error, refresh } = useCompanion();
  return <Page><CompanionHeader name={data.me.agentName} onNavigate={route => navigation.navigate(route)} /><View style={[styles.heading, { paddingTop: 8 }]}><Copy variant="display" accessibilityRole="header">부탁한 일</Copy></View><ErrorNotice message={error} retry={() => void refresh()} />
    <FlatList data={data.tasks} keyExtractor={task => task.id} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${taskStatusLabel(item)}`} onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParams>>()?.navigate('Task', { id: item.id })} style={({ pressed }) => [styles.row, { borderBottomColor: colors.line, opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: colors.quiet }]}>{item.status === 'completed' && item.evidence?.verified ? <CheckCheck size={22} color={colors.success} /> : <Clock3 size={22} color={colors.ink} />}</View><View style={{ flex: 1 }}><Copy variant="action">{item.title}</Copy><Copy variant="caption" muted style={{ marginTop: 5 }}>{taskStatusLabel(item)}</Copy></View><ChevronRight size={20} color={colors.muted} />
    </Pressable>} ListEmptyComponent={<View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.quiet }]}><CheckCheck size={32} strokeWidth={1.5} color={colors.muted} /></View><Copy variant="title" style={styles.emptyTitle}>아직 부탁한 일이 없어요</Copy><Copy muted style={styles.emptyCopy}>몰라에게 하나씩 맡겨 보세요.</Copy><Button label="몰라에게 부탁하기" icon={ArrowRight} onPress={() => navigation.navigate('Chat')} /></View>} />
  </Page>;
}
const styles = StyleSheet.create({
  heading: { paddingHorizontal: 24, paddingBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  list: { paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { minHeight: 96, paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 16 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 60 }, emptyIcon: { alignSelf: 'center', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 24, textAlign: 'center', fontSize: 24 }, emptyCopy: { marginTop: 12, marginBottom: 32, textAlign: 'center' },
});
