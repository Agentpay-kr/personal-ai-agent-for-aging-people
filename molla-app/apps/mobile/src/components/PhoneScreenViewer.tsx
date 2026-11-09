import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useLiveCompanion } from '../data/LiveCompanionStore';
import { useTheme } from '../design/Theme';
import { isPhoneRunning, type PhoneFrame } from '../services/runtime';
import { Button, Copy, ErrorNotice, IconButton } from './ui';

export function PhoneScreenViewer() {
  const { data, runtime, readPhoneFrame } = useLiveCompanion();
  const { colors, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState<PhoneFrame | null>(null);
  const [error, setError] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [retry, setRetry] = useState(0);
  const running = isPhoneRunning(runtime?.phone);
  const allowed = data.me.consent === 'active' && !!data.me.scopes?.includes('phone');
  useEffect(() => { const sub = AppState.addEventListener('change', state => { setForeground(state === 'active'); if (state !== 'active') setFrame(null); }); return () => sub.remove(); }, []);
  useEffect(() => {
    setFrame(null); setError('');
    if (!visible || !foreground || !running || !allowed) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const capture = async () => {
      try {
        const next = await readPhoneFrame(controller.signal);
        if (controller.signal.aborted) return;
        setFrame(next); setError(''); timer = setTimeout(capture, 3000);
      } catch (cause) {
        if (!controller.signal.aborted) { setFrame(null); setError(cause instanceof Error ? cause.message : '화면을 확인하지 못했어요.'); }
      }
    };
    void capture();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [visible, foreground, running, allowed, readPhoneFrame, data.me.id, retry]);
  const close = () => { setVisible(false); setFrame(null); };
  const imageWidth = Math.max(180, Math.min(width - 48, 360));
  return <>
    <Button testID="open-phone-screen" label="실제 Android 화면 보기" variant="quiet" disabled={!running || !allowed} onPress={() => setVisible(true)} />
    <Modal visible={visible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={close}>
      <View style={[styles.page, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
        <View style={styles.header}><View style={{ flex: 1 }}><Copy variant="title">{data.me.name}의 Android</Copy><Copy variant="caption" muted>실제 기기 화면 · 약 3초마다 갱신</Copy></View><IconButton icon={X} label="Android 화면 닫기" onPress={close} /></View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: Math.max(insets.bottom, 24), gap: 20, alignItems: 'center' }}>
          <Copy variant="caption" muted>앱 열기는 부탁 내용을 승인하면 실행돼요. 이 화면에서는 실행 결과를 확인할 수 있어요.</Copy>
          {!allowed || !running ? <Copy>Android 연결과 도움 권한을 먼저 확인해 주세요.</Copy> : !foreground ? <Copy>앱으로 돌아오면 화면을 다시 가져와요.</Copy> : error ? <View style={{ width: '100%', gap: 16 }}><ErrorNotice message={error} /><Button label="화면 다시 가져오기" onPress={() => setRetry(value => value + 1)} /></View> : frame ? <>
            <Copy testID="phone-captured-at" variant="caption" muted>마지막 확인 · {new Date(frame.capturedAt).toLocaleTimeString('ko-KR')}</Copy>
            <Image testID="phone-live-image" source={{ uri: frame.dataUrl }} accessibilityLabel={`${data.me.name} Android의 최근 화면`} resizeMode="contain" fadeDuration={0} style={{ width: imageWidth, height: imageWidth * frame.height / frame.width, borderRadius: 16, backgroundColor: colors.quiet }} />
          </> : <View style={styles.loading}><ActivityIndicator color={colors.action} /><Copy muted>실제 화면을 가져오고 있어요</Copy></View>}
          <Copy variant="caption" muted>화면 보기를 닫으면 갱신을 멈춰요. Android 사용 종료는 연결 상태에서 선택해 주세요.</Copy>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({ page: { flex: 1 }, header: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }, loading: { paddingVertical: 72, alignItems: 'center', gap: 18 } });
