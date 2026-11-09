import React, { useState } from 'react';
import { Modal, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Button, Copy, ErrorNotice } from './ui';
import { RuntimePanel } from './RuntimePanel';
import { PhoneScreenViewer } from './PhoneScreenViewer';
import { useLiveCompanion } from '../data/LiveCompanionStore';
import { useTheme } from '../design/Theme';

export function LiveControls() {
  const { colors, reducedMotion } = useTheme();
  const { data, busy, error, notice, runtime, quote, refresh, setAIConsent, setPhonePermission, setConsent, phoneAction, confirmVmStart, cancelVmStart, addContact, disconnect } = useLiveCompanion();
  const [showContact, setShowContact] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [contact, setContact] = useState({ name: '', relation: '', phone: '' });
  const phoneAllowed = data.me.scopes?.includes('phone') || false;
  async function saveContact() {
    if (await addContact(contact)) { setContact({ name: '', relation: '', phone: '' }); setShowContact(false); }
  }
  return <>
    <RuntimePanel runtime={runtime} busy={busy} onRefresh={() => void refresh()} onPhoneAction={action => void phoneAction(action)} />
    {runtime?.phone.configured && <View style={{ marginTop: 12 }}><PhoneScreenViewer /></View>}
    <ErrorNotice message={error} />
    {!!notice && <Copy accessibilityLiveRegion="polite" variant="caption" style={{ color: colors.success, marginTop: 16 }}>{notice}</Copy>}
    <Copy variant="action" style={styles.heading}>내가 허락하는 도움</Copy>
    <View style={[styles.permissions, { backgroundColor: colors.surface }]}>
      <View style={styles.setting}><View style={styles.settingText}><Copy variant="action">AI와 대화하기</Copy><Copy variant="caption" muted>내 대화와 최근 대화 내용이 연결된 AI 서비스로 전달돼요.</Copy></View><Switch accessibilityLabel="AI 대화 동의" value={runtime?.llm.consented || false} disabled={busy} onValueChange={enabled => void setAIConsent(enabled, runtime?.llm.includeMemories || false)} trackColor={{ true: colors.success }} /></View>
      <View style={styles.setting}><View style={styles.settingText}><Copy variant="action">내 기억을 함께 참고하기</Copy><Copy variant="caption" muted>내가 저장한 기억도 AI에게 전달해 답변에 참고하게 해요.</Copy></View><Switch accessibilityLabel="AI에게 내 기억 전달 동의" value={runtime?.llm.includeMemories || false} disabled={busy || !runtime?.llm.consented} onValueChange={include => void setAIConsent(true, include)} trackColor={{ true: colors.success }} /></View>
      <View style={styles.setting}><View style={styles.settingText}><Copy variant="action">내 Android 앱 열기</Copy><Copy variant="caption" muted>부탁을 승인해 내 공간의 앱을 열고, 실행 화면을 확인할 수 있어요.</Copy></View><Switch accessibilityLabel="내 Android 앱 열기 허용" value={phoneAllowed} disabled={busy} onValueChange={enabled => void setPhonePermission(enabled)} trackColor={{ true: colors.success }} /></View>
    </View>
    <Copy variant="action" style={styles.heading}>내 연락처</Copy>
    <Copy variant="caption" muted>안부를 전할 때 이름과 관계를 정확히 확인해요.</Copy>
    {(data.contacts || []).map(item => <View key={item.id} style={[styles.contact, { borderBottomColor: colors.line }]}><Copy variant="action">{item.name}{item.relation ? ` · ${item.relation}` : ''}</Copy><Copy variant="caption" muted>{item.phone}</Copy></View>)}
    {showContact ? <View style={styles.form}>
      {([{ key: 'name', label: '이름' }, { key: 'relation', label: '관계 (예: 딸)' }, { key: 'phone', label: '전화번호' }] as const).map(({ key, label }) => <View key={key} style={{ gap: 8 }}><Copy variant="caption">{label}</Copy><TextInput accessibilityLabel={label} value={contact[key]} onChangeText={text => setContact(value => ({ ...value, [key]: text }))} keyboardType={key === 'phone' ? 'phone-pad' : 'default'} maxLength={key === 'phone' ? 20 : 60} style={[styles.input, { color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line }]} /></View>)}
      <Button label="내 연락처에 저장" busy={busy} disabled={!contact.name.trim() || !contact.phone.trim()} onPress={() => void saveContact()} />
      <Button label="취소" variant="quiet" disabled={busy} onPress={() => setShowContact(false)} />
    </View> : <View style={{ marginTop: 16 }}><Button label="연락처 추가하기" variant="quiet" onPress={() => setShowContact(true)} /></View>}
    <View style={{ marginTop: 32, gap: 12 }}><Button label="몰라의 도움 중단하기" variant="danger" disabled={busy} onPress={() => setConfirmPause(true)} /><Button label="이 기기 연결 해제" variant="quiet" disabled={busy} onPress={() => setConfirmDisconnect(true)} /></View>
    <Modal visible={!!quote} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!busy) cancelVmStart(); }}>
      <View style={[styles.modal, { backgroundColor: colors.scrim }]}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <Copy variant="title" accessibilityRole="header">내 Android를 시작할까요?</Copy>
        <Copy muted style={{ marginTop: 16 }}>{data.me.name}에게 배정된 공간을 {quote?.durationMinutes}분 동안 사용해요.</Copy>
        <Copy variant="title" style={{ marginVertical: 24 }}>예상 최대 비용 {new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'USD' }).format(quote?.estimatedMaxUsd || 0)}</Copy>
        <Button testID="confirm-vm-start" label="비용 확인했어요, 시작하기" busy={busy} onPress={() => void confirmVmStart()} />
        <View style={{ height: 12 }} /><Button label="다음에 할게요" variant="quiet" disabled={busy} onPress={cancelVmStart} />
      </View></View>
    </Modal>
    <Modal visible={confirmDisconnect} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setConfirmDisconnect(false)}>
      <View style={[styles.modal, { backgroundColor: colors.scrim }]}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <Copy variant="title">이 기기에서 연결을 해제할까요?</Copy><Copy muted style={{ marginVertical: 20 }}>이 기기에 저장한 연결 키와 화면의 대화 정보를 지워요. 사용 중인 Android는 별도로 종료해 주세요.</Copy>
        <Button label="연결 유지하기" onPress={() => setConfirmDisconnect(false)} /><View style={{ height: 12 }} /><Button label="이 기기 연결 해제" variant="danger" onPress={() => void disconnect()} />
      </View></View>
    </Modal>
    <Modal visible={confirmPause} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => { if (!busy) setConfirmPause(false); }}>
      <View style={[styles.modal, { backgroundColor: colors.scrim }]}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <Copy variant="title">몰라의 도움을 중단할까요?</Copy><Copy muted style={{ marginVertical: 20 }}>대기 중인 부탁과 기억 공유를 철회하고 Android 종료를 요청해요. 이미 진행된 외부 작업은 기기에서 확인해 주세요.</Copy>
        <Button label="계속 함께하기" disabled={busy} onPress={() => setConfirmPause(false)} /><View style={{ height: 12 }} /><Button label="도움 중단하기" variant="danger" busy={busy} onPress={() => void setConsent(false)} />
      </View></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  heading: { marginTop: 32, marginBottom: 12 }, permissions: { borderRadius: 20, padding: 20, gap: 24 },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 14 }, settingText: { flex: 1, gap: 6 },
  contact: { paddingVertical: 16, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth }, form: { gap: 14, marginTop: 20 },
  input: { minHeight: 56, borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16 },
  modal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, dialog: { width: '100%', maxWidth: 440, padding: 24, borderRadius: 28 },
});
