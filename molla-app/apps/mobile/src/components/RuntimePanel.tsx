import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Cloud, MessageCircle, RefreshCw, Smartphone } from 'lucide-react-native';
import { Button, Copy, IconButton } from './ui';
import { useTheme } from '../design/Theme';
import { isPhoneRunning, type RuntimeStatus } from '../services/runtime';

export type PhoneAction = 'start' | 'stop' | 'diagnose';
export function RuntimePanel({ runtime, busy, onRefresh, onPhoneAction }: { runtime: RuntimeStatus | null; busy: boolean; onRefresh: () => void; onPhoneAction: (action: PhoneAction) => void }) {
  const { colors } = useTheme();
  const phone = runtime?.phone;
  const running = isPhoneRunning(phone);
  const canStart = !!phone?.configured && ['not_started', 'stopped'].includes(phone.state);
  const needsCheck = !!phone?.configured && !running && !canStart;
  const stateLabel: Record<string, string> = { starting: '시작 상태를 확인해 주세요', provisioning: 'Android를 준비하고 있어요', closing: '종료 상태를 확인해 주세요', unknown: '연결 상태 확인이 필요해요', expired: '사용 시간이 끝났어요. 상태를 확인해 주세요', error: '연결 상태 확인이 필요해요' };
  return <View style={styles.section}>
    <View style={styles.heading}><Cloud size={20} color={colors.ink} /><Copy variant="action" style={{ flex: 1 }}>몰라 연결 상태</Copy><IconButton icon={RefreshCw} label="연결 상태 새로고침" disabled={busy} onPress={onRefresh} /></View>
    <View style={[styles.panel, { backgroundColor: colors.surface }]}>
      <View style={styles.row}><MessageCircle size={21} color={colors.ink} /><View style={{ flex: 1 }}><Copy variant="action">AI 대화</Copy><Copy variant="caption" muted>{runtime?.llm.ready ? '대화할 준비가 되었어요' : runtime?.llm.configured ? 'AI 대화 동의를 확인해 주세요' : '모델 연결을 기다리고 있어요'}</Copy></View></View>
      <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 18 }]}><Smartphone size={21} color={colors.ink} /><View style={{ flex: 1 }}><Copy variant="action">내 Android 공간</Copy><Copy variant="caption" muted>{running ? '연결되어 있어요' : needsCheck ? stateLabel[phone!.state] || '연결 상태 확인이 필요해요' : phone?.configured ? '내 공간이 배정되었어요' : '아직 배정되지 않았어요'}</Copy></View></View>
      {phone?.expiresAt && <Copy variant="caption" muted>사용 종료 예정 · {new Date(phone.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</Copy>}
      {phone?.configured && <View style={styles.controls}>
        <Button label={canStart ? 'Android 사용 비용 확인' : '내 Android 연결 확인'} variant="quiet" busy={busy} onPress={() => onPhoneAction(canStart ? 'start' : 'diagnose')} />
        {(running || needsCheck) && <Button label="Android 사용 종료하기" variant="quiet" disabled={busy} onPress={() => onPhoneAction('stop')} />}
      </View>}
      <Copy variant="caption" muted>다른 가족의 Android 공간은 내 연결 키로 사용할 수 없어요.</Copy>
    </View>
  </View>;
}
const styles = StyleSheet.create({ section: { marginTop: 24 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, panel: { borderRadius: 20, padding: 20, gap: 18 }, row: { flexDirection: 'row', gap: 14, alignItems: 'center' }, controls: { gap: 10 } });
