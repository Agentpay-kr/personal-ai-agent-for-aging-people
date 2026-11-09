import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Check, ShieldCheck, X } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCompanion } from '../data/CompanionStore';
import { taskStatusLabel, type RootStackParams } from '../data/types';
import { useTheme } from '../design/Theme';
import { Button, Copy, ErrorNotice, Page } from '../components/ui';
import { PhoneScreenViewer } from '../components/PhoneScreenViewer';

export function TaskScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, 'Task'>) {
  const { colors } = useTheme();
  const { data, busy, error, decide } = useCompanion();
  const insets = useSafeAreaInsets();
  const task = data.tasks.find(item => item.id === route.params.id);
  if (!task) return <Page><View style={styles.content}><Copy>이 부탁을 찾을 수 없어요.</Copy><Button label="돌아가기" onPress={() => navigation.goBack()} /></View></Page>;
  const action = task.action;
  const owner = data.members.find(member => member.id === task.owner)?.name || data.me.name;
  const approvalLabel = action?.execution === 'android-app' ? '확인했어요, 앱 열어 줘' : action?.execution === 'android-compose' ? '확인했어요, 작성 화면 열어 줘' : '좋아요, 초안 준비해 줘';
  return <Page><ScrollView contentContainerStyle={styles.content}>
    <View style={[styles.status, { backgroundColor: colors.quiet }]}><Copy variant="caption" style={{ color: colors.success }}>{taskStatusLabel(task)}</Copy></View>
    <Copy variant="title" accessibilityRole="header" style={styles.title}>{task.title}</Copy>
    <Copy muted>{task.summary}</Copy>
    <View style={[styles.request, { backgroundColor: colors.surface }]}><Copy variant="caption" muted>부탁한 내용</Copy><Copy style={{ marginTop: 12 }} selectable>{task.text}</Copy></View>
    {action && <View style={[styles.request, { backgroundColor: colors.surface, marginTop: 0 }]}><Copy variant="caption" muted>승인할 정확한 내용</Copy><Copy style={{ marginTop: 12 }} selectable>{action.body}</Copy>{action.recipient && <Copy variant="caption" style={{ marginTop: 16 }}>받는 사람 · {action.recipient.name}{'\n'}{action.recipient.phone}</Copy>}{action.appId && <Copy variant="caption" muted style={{ marginTop: 12 }}>앱 · {({ settings: '설정', browser: '브라우저', kakao: '카카오톡', coupang: '쿠팡', calendar: '캘린더' } as Record<string, string>)[action.appId] || action.appId}</Copy>}{action.execution === 'android-compose' && <Copy variant="caption" muted style={{ marginTop: 12 }}>문자 작성 화면까지만 열어요. 전송은 기기에서 직접 확인해 주세요.</Copy>}</View>}
    <View style={styles.owner}><ShieldCheck size={22} color={colors.success} /><Copy variant="caption" muted style={{ flex: 1 }}>{owner}의 공간에서, 주인이 직접 승인한 내용으로 진행해요.</Copy></View>
    {task.result && <View style={[styles.result, { borderTopColor: colors.line }]}><Copy selectable>{task.result}</Copy></View>}
    {action?.execution?.startsWith('android-') && task.status !== 'awaiting_approval' && <PhoneScreenViewer />}
    <ErrorNotice message={error} />
  </ScrollView><View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 20) }]}>
    {task.status === 'awaiting_approval' && task.owner === data.me.id ? <><Button label={approvalLabel} icon={Check} busy={busy} onPress={() => void decide(task.id, 'approve')} /><Button label="지금은 괜찮아요" icon={X} variant="quiet" disabled={busy} onPress={() => void decide(task.id, 'reject')} /></> : task.status === 'running' && task.owner === data.me.id ? <Button label="지금 중단하기" variant="danger" busy={busy} onPress={() => void decide(task.id, 'cancel')} /> : <Button label="확인했어요" onPress={() => navigation.goBack()} />}
  </View></Page>;
}
const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 32, width: '100%', maxWidth: 640, alignSelf: 'center' },
  status: { paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start', borderRadius: 999 }, title: { marginTop: 24, marginBottom: 16, fontSize: 30, lineHeight: 42 },
  request: { borderRadius: 20, padding: 24, marginVertical: 28 }, owner: { flexDirection: 'row', alignItems: 'center', gap: 12 }, result: { borderTopWidth: 1, paddingTop: 24, marginTop: 24 },
  actions: { paddingHorizontal: 24, paddingTop: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
});
