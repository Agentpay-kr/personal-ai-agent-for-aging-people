/**
 * Intrusion vs fraud.
 *
 * Fraud targets the parent (voice phishing, child impersonation): the system works, a person is being
 * deceived, so FA holds or blocks the request and brings the family in.
 *
 * Intrusion means the system itself may be compromised: someone controls a family account or device
 * (takeover), records or routing were tampered with (hacking), or instructions were planted in the
 * data (contamination). Nothing that party touched can be trusted, so FA self-destructs: sessions,
 * key shares, task data and family memory are destroyed. Only sealed evidence and the audit chain stay.
 */

export type IntrusionKind = 'takeover' | 'hacking' | 'contamination';

export const INTRUSION_KIND_LABEL: Record<IntrusionKind, string> = {
  takeover: '탈취',
  hacking: '해킹',
  contamination: '오염',
};

export interface Intrusion {
  id: string;
  kind: IntrusionKind;
  label: string;
}

/** Signal ids (from the rules, the AI judge or FamilyTrust itself) that mean intrusion. */
export const INTRUSION_SIGNALS: Record<string, Omit<Intrusion, 'id'>> = {
  impostor_approval: { kind: 'takeover', label: '등록되지 않은 기기가 가족 이름으로 승인·거절' },
  unverified_requester: { kind: 'takeover', label: '기기 증명 없이 다른 가족 계정에 대한 요청' },
  unverified_device: { kind: 'takeover', label: '등록되지 않은 기기에서 온 요청' },
  actor_mismatch: { kind: 'takeover', label: '메시지를 보낸 사람과 실행을 요청한 사람이 다름' },
  not_family: { kind: 'hacking', label: '가족이 아닌 곳에서 온 실행 요청' },
  owner_mismatch: { kind: 'hacking', label: '라우터가 정한 계정 주인과 실제 실행 대상이 다름' },
  audit_tampered: { kind: 'hacking', label: '감사 기록 위변조' },
  intent_mismatch: { kind: 'contamination', label: '라우터 분류와 실제 요청이 다름' },
  prompt_injection: { kind: 'contamination', label: '데이터 안에 AI를 향한 지시문' },
};

export function intrusionsFrom(ids: Iterable<string>): Intrusion[] {
  const out: Intrusion[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const def = INTRUSION_SIGNALS[id];
    if (def && !seen.has(id)) {
      seen.add(id);
      out.push({ id, ...def });
    }
  }
  return out;
}

export const intrusionKinds = (list: Intrusion[]): string =>
  [...new Set(list.map((i) => INTRUSION_KIND_LABEL[i.kind]))].join('·');
