import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Companion, Copy, ErrorNotice, Page } from '../components/ui';
import { useCompanion } from '../data/CompanionStore';

export function OwnerConsentScreen() {
  const inset = useSafeAreaInsets();
  const { data, busy, error, setConsent, disconnect } = useCompanion();
  return <Page><ScrollView contentContainerStyle={[styles.content, { paddingTop: inset.top + 32, paddingBottom: inset.bottom + 32 }]}>
    <Copy variant="caption" muted>{data.me.name}에게 준비된 작은 친구</Copy>
    <View style={styles.companion}><Companion size={210} animate /></View>
    <Copy variant="title" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 42 }}>몰라의 도움을{"\n"}받아 볼까요?</Copy>
    <Copy muted style={{ marginVertical: 24 }}>내 대화와 기억은 내 공간에 있어요. 가족이 부탁을 전달해도 내 계정의 중요한 행동은 내가 확인해요.</Copy>
    <Copy variant="caption" muted style={{ marginBottom: 28 }}>AI에 대화를 보내거나 Android를 사용하는 것은 다음 화면에서 따로 정할 수 있어요. 언제든 도움을 중단할 수 있어요.</Copy>
    <ErrorNotice message={error} />
    <View style={{ gap: 14, marginTop: 16 }}><Button label="좋아요, 함께할게요" icon={Check} busy={busy} onPress={() => void setConsent(true)} /><Button label="지금은 괜찮아요" icon={X} variant="quiet" disabled={busy} onPress={() => void disconnect()} /></View>
  </ScrollView></Page>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal: 28, flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 560, alignSelf: 'center' }, companion: { alignItems: 'center', marginVertical: 20 } });
