import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ArrowDown, ArrowUp, Check, ChevronRight, Volume2, Square } from 'lucide-react-native';
import * as Speech from 'expo-speech';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Message, RootStackParams, TabParams } from '../data/types';
import { useCompanion } from '../data/CompanionStore';
import { useTheme } from '../design/Theme';
import { Button, Copy, ErrorNotice, feedback, IconButton, Page } from '../components/ui';
import { CompanionHeader } from '../components/CompanionHeader';

export function ChatScreen({ navigation }: BottomTabScreenProps<TabParams, 'Chat'>) {
  const { colors, reducedMotion } = useTheme();
  const { data, draft, setDraft, send, busy, runtime, connected, error, refresh } = useCompanion();
  const list = useRef<FlatList<Message>>(null);
  const nearEnd = useRef(true);
  const [unread, setUnread] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [focused, setFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(48);
  const latestAssistant = data.messages.filter(message => message.role === 'assistant').at(-1);
  const announced = useRef(latestAssistant?.id);
  useEffect(() => {
    if (latestAssistant && latestAssistant.id !== announced.current) {
      announced.current = latestAssistant.id;
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(latestAssistant.text);
    }
  }, [latestAssistant?.id, latestAssistant?.text]);
  const welcome: Message = { id: 'welcome', role: 'assistant', text: `반가워요, ${data.me.name}!\n오늘은 어떤 이야기를 나눌까요?` };
  const messages = [welcome, ...data.messages];
  useEffect(() => { if (!nearEnd.current) setUnread(true); }, [data.messages.length]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => { void Speech.stop(); setSpeaking(false); });
    return () => { unsubscribe(); void Speech.stop(); };
  }, [navigation]);
  function scrollToEnd() { list.current?.scrollToEnd({ animated: !reducedMotion }); nearEnd.current = true; setUnread(false); }
  async function submit() { nearEnd.current = true; const sent = await send(); if (sent) feedback(); }
  async function speak() {
    if (speaking) { await Speech.stop(); setSpeaking(false); return; }
    setSpeechError('');
    const text = data.messages.filter(message => message.role === 'assistant').at(-1)?.text || welcome.text;
    try {
      await Speech.stop();
      setSpeaking(true);
      Speech.speak(text, { language: 'ko-KR', rate: 0.88, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => { setSpeaking(false); setSpeechError('읽어주기를 사용할 수 없어요. 답변은 글로 확인해 주세요.'); } });
    } catch { setSpeaking(false); setSpeechError('읽어주기를 사용할 수 없어요. 답변은 글로 확인해 주세요.'); }
  }
  const renderMessage = ({ item }: { item: Message }) => {
    const own = item.role === 'user';
    return <View style={[styles.message, own && styles.ownMessage]}>
      <View style={[styles.bubble, own ? styles.userBubble : styles.assistantText, { backgroundColor: own ? colors.accent : colors.quiet }]}><Copy selectable accessibilityLiveRegion={own ? 'none' : 'polite'} style={[styles.messageText, own && { color: colors.accentInk }]}>{item.text}</Copy>
        {item.taskId && <Pressable accessibilityRole="button" accessibilityLabel="부탁 내용 확인하기" onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParams>>()?.navigate('Task', { id: item.taskId! })} style={({ pressed }) => [styles.taskLink, { backgroundColor: colors.surface, opacity: pressed ? 0.65 : 1 }]}><Check color={colors.success} size={18} /><Copy variant="action" style={{ flex: 1, fontSize: 15 }}>내용 확인하기</Copy><ChevronRight color={colors.ink} size={18} /></Pressable>}
      </View>
    </View>;
  };
  return <Page><CompanionHeader name={data.me.agentName} onNavigate={route => navigation.navigate(route)} right={<IconButton icon={speaking ? Square : Volume2} label={speaking ? '읽어주기 멈추기' : '최근 답변 읽어주기'} onPress={() => void speak()} />} />
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <ErrorNotice message={error || speechError} retry={error ? () => void refresh() : undefined} />
      {!runtime?.llm.ready && <View style={{ padding: 24, gap: 12 }}><Copy variant="caption" muted>AI 대화를 사용하려면 모델 연결과 대화 동의를 확인해 주세요.</Copy><Button label="AI 대화 설정" variant="quiet" onPress={() => navigation.navigate('Profile')} /></View>}
      <FlatList ref={list} data={messages} keyExtractor={item => item.id} renderItem={renderMessage} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false} contentContainerStyle={styles.messageList}
        onLayout={() => { if (nearEnd.current) requestAnimationFrame(() => list.current?.scrollToEnd({ animated: false })); }}
        onScroll={({ nativeEvent: { layoutMeasurement, contentOffset, contentSize } }) => { nearEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100; if (nearEnd.current) setUnread(false); }} scrollEventThrottle={100}
        onContentSizeChange={() => { if (nearEnd.current) list.current?.scrollToEnd({ animated: false }); }}
        ListHeaderComponent={<View style={styles.chatPrelude}><Copy variant="caption" muted>{data.messages.length ? '우리의 이야기' : '오늘, 몰라와 함께'}</Copy></View>}
        ListFooterComponent={busy ? <View accessibilityLiveRegion="polite" style={styles.thinking}><ActivityIndicator color={colors.muted} size="small" /><Copy variant="caption" muted>몰라가 확인하고 있어요</Copy></View> : data.messages.length === 0 ? <View style={styles.suggestions}>{['내일 일정을 같이 정리해 줘', '오늘은 그냥 수다 떨고 싶어'].map(text => <Pressable key={text} accessibilityRole="button" onPress={() => setDraft(text)} style={({ pressed }) => [styles.suggestion, { backgroundColor: colors.quiet, opacity: pressed ? .6 : 1 }]}><Copy variant="caption">{text}</Copy><ArrowUp size={15} color={colors.ink} /></Pressable>)}</View> : undefined}
      />
      {unread && <View style={styles.jump}><IconButton icon={ArrowDown} label="새 답변으로 이동" onPress={scrollToEnd} filled /></View>}
      <View style={[styles.composerArea, { paddingBottom: 12, backgroundColor: colors.canvas }]}>
        <View style={[styles.composer, { backgroundColor: colors.quiet, borderColor: focused ? colors.ink : 'transparent' }]}>
          <TextInput testID="message-input" accessibilityLabel="몰라에게 이야기하기" multiline numberOfLines={1} maxLength={1000} value={draft} onChangeText={setDraft} onContentSizeChange={event => setInputHeight(Math.min(136, Math.max(48, event.nativeEvent.contentSize.height)))} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="몰라에게 이야기해요" placeholderTextColor={colors.muted} editable={!busy} style={[styles.input, { color: colors.ink, height: inputHeight }]} />
          <IconButton testID="send-message" icon={ArrowUp} label="메시지 보내기" disabled={busy || !draft.trim() || !runtime?.llm.ready || !connected} onPress={() => void submit()} filled />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Page>;
}
const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  messageList: { paddingHorizontal: 18, paddingBottom: 20, width: '100%', maxWidth: 640, alignSelf: 'center', flexGrow: 1 },
  chatPrelude: { paddingTop: 12, paddingBottom: 28, alignItems: 'center' },
  message: { alignSelf: 'flex-start', width: '100%', marginBottom: 12 }, ownMessage: { alignItems: 'flex-end', marginTop: 8, marginBottom: 20 },
  bubble: { maxWidth: '94%', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 24, alignSelf: 'flex-start' },
  userBubble: { maxWidth: '88%', borderBottomRightRadius: 7, alignSelf: 'flex-end' },
  assistantText: { borderBottomLeftRadius: 7 }, messageText: { fontSize: 17, lineHeight: 27 },
  taskLink: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, gap: 10, marginTop: 16, flexDirection: 'row', alignItems: 'center' },
  composerArea: { paddingHorizontal: 16, paddingTop: 10, width: '100%', maxWidth: 680, alignSelf: 'center' },
  composer: { minHeight: 64, borderRadius: 32, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-end', padding: 7, paddingLeft: 20, gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 136, fontSize: 17, lineHeight: 26, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 0, textAlignVertical: 'center' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16 }, jump: { position: 'absolute', right: 24, bottom: 170 },
  suggestions: { alignItems: 'flex-start', gap: 10, marginTop: 20 }, suggestion: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
