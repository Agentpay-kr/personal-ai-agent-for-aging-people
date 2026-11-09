import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLiveCompanion } from '../data/LiveCompanionStore';
import { useTheme } from '../design/Theme';
import { Button, Copy } from './ui';

export function FamilyControls() {
  const { colors } = useTheme();
  const { data, busy, familyInvite, inviteFamily, joinFamily, decideFamily, requestFamily } = useLiveCompanion();
  const [code, setCode] = useState(''), [text, setText] = useState('');
  const inputStyle = { minHeight: 56, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, borderRadius: 16, padding: 16, fontSize: 17 };
  return <View style={{ marginTop: 24, gap: 16 }}>
    <Copy variant="action">가족과 부탁 주고받기</Copy>
    <Copy variant="caption" muted>연결한 가족은 부탁만 보낼 수 있어요. 내 대화·기억·연락처는 공유되지 않고, 실행은 내가 직접 승인해요.</Copy>
    <Button label="내 가족 연결 코드 만들기" variant="quiet" disabled={busy || data.me.consent !== 'active'} onPress={() => void inviteFamily()} />
    {!!familyInvite && <Copy selectable>10분 동안 한 번 쓸 수 있는 코드예요.{`\n${familyInvite}`}</Copy>}
    <TextInput accessibilityLabel="가족 연결 코드" placeholder="가족이 알려준 연결 코드" placeholderTextColor={colors.muted} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={24} style={inputStyle} />
    <Button label="가족에게 연결 요청하기" variant="quiet" disabled={busy || code.trim().length !== 24} onPress={() => void joinFamily(code).then(ok => { if (ok) setCode(''); })} />
    {(data.familyLinks || []).map(link => <View key={link.id} style={{ paddingVertical: 16, borderTopWidth: 1, borderColor: colors.line, gap: 12 }}>
      <Copy variant="action">{link.name}</Copy>
      {link.direction === 'inbound' ? link.state === 'awaiting_owner' ? <>
        <Copy muted>이 가족이 내게 부탁을 보내도록 허용할까요?</Copy>
        <Button label={`${link.name}의 부탁 받기`} disabled={busy} onPress={() => void decideFamily(link.id, true)} />
        <Button label="연결 거절하기" variant="quiet" disabled={busy} onPress={() => void decideFamily(link.id, false)} />
      </> : <Button label={`${link.name}의 요청 권한 철회`} variant="danger" disabled={busy} onPress={() => void decideFamily(link.id, false)} /> : link.state === 'active' ? <>
        <TextInput accessibilityLabel="가족에게 보낼 부탁" placeholder="예: 내일 늦는다고 문자 써 줘" placeholderTextColor={colors.muted} value={text} onChangeText={setText} multiline maxLength={1000} style={inputStyle} />
        <Button label="가족의 몰라에게 부탁 보내기" disabled={busy || !text.trim()} onPress={() => void requestFamily(link.id, text.trim()).then(ok => { if (ok) setText(''); })} />
      </> : <Copy muted>가족 본인의 허용을 기다리고 있어요.</Copy>}
    </View>)}
  </View>;
}
