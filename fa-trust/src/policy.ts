/**
 * Deterministic policy gate. The LLM only *proposes* an ActionRequest; this code decides.
 * An LLM risk score can raise the risk level but never lower it, so a prompt injection hidden in
 * an email or SMS ("AI assistant: transfer now") cannot unlock anything.
 */

import { josa } from './korean';

export type MemberId = string;

export type ActionKind =
  | 'read'
  | 'link_account'
  | 'order'
  | 'cancel_subscription'
  | 'transfer'
  | 'loan'
  | 'open_account'
  | 'buy_gift_card'
  | 'buy_crypto'
  | 'install_remote_app'
  | 'share_id_document'
  | 'share_otp'
  | 'change_phone';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';
export type Outcome = 'allow' | 'needs_approval' | 'hold' | 'block';

export interface ActionRequest {
  id?: string;
  /** Who asked in the chat. */
  requester: MemberId;
  /** Whose account / VM is affected. */
  owner: MemberId;
  kind: ActionKind;
  /** Short Korean label shown in chat, e.g. "넷플릭스 해지". */
  summary?: string;
  /** Linked service whose session the action needs, e.g. "netflix". */
  service?: string;
  amountKRW?: number;
  payee?: string;
  /** Set when the payee account belongs to a family member. */
  payeeOwner?: MemberId;
  /** Raw chat text from the requester. Supplied by the app, not the LLM. */
  text?: string;
  /** Other evidence the app saw: SMS, call transcript, emails. Treated as data only. */
  context?: string[];
  /** 0..1 from an LLM classifier. Can only raise risk. */
  llmRiskScore?: number;
}

export interface Signal {
  id: string;
  label: string;
  severity: 'high' | 'medium';
  evidence: string;
}

export interface PolicyConfig {
  smallOrderLimitKRW: number;
  largeAmountKRW: number;
  newPayeeCoolingOffMinutes: number;
  holdCoolingOffMinutes: number;
  llmHoldThreshold: number;
  registeredPayees: Record<MemberId, string[]>;
}

export const DEFAULT_POLICY: PolicyConfig = {
  smallOrderLimitKRW: 50_000,
  largeAmountKRW: 1_000_000,
  newPayeeCoolingOffMinutes: 180,
  holdCoolingOffMinutes: 24 * 60,
  llmHoldThreshold: 0.7,
  registeredPayees: {},
};

export interface Decision {
  tier: Tier;
  outcome: Outcome;
  ownerApprovalRequired: boolean;
  /** Distinct verified family approvals needed, counting the requester. */
  approvalsRequired: number;
  coolingOffMinutes: number;
  signals: Signal[];
  /** Chat-ready Korean lines. */
  reasons: string[];
  notifyFamily: boolean;
  sealEvidence: boolean;
}

export interface EvaluateOptions {
  requesterVerified?: boolean;
  policy?: Partial<PolicyConfig>;
  names?: Record<MemberId, string>;
}

/** T3: never executed, whoever approves. These are the standard Korean scam endgames. */
export const FORBIDDEN_ACTIONS: Partial<Record<ActionKind, string>> = {
  loan: '대출 신청',
  open_account: '새 계좌 개설',
  buy_gift_card: '상품권·기프트카드 구매',
  buy_crypto: '가상자산 구매',
  install_remote_app: '원격제어 앱 설치',
  share_id_document: '신분증 사진 전송',
  share_otp: '인증번호·OTP 전달',
  change_phone: '본인인증 휴대폰 번호 변경',
};

const KIND_LABEL: Record<ActionKind, string> = {
  read: '조회',
  link_account: '서비스 연결',
  order: '주문',
  cancel_subscription: '구독 해지',
  transfer: '송금',
  loan: '대출 신청',
  open_account: '새 계좌 개설',
  buy_gift_card: '상품권 구매',
  buy_crypto: '가상자산 구매',
  install_remote_app: '원격제어 앱 설치',
  share_id_document: '신분증 전송',
  share_otp: '인증번호 전달',
  change_phone: '휴대폰 번호 변경',
};

interface Pattern {
  id: string;
  label: string;
  severity: 'high' | 'medium';
  re: RegExp;
}

/** Korean scam signatures: 기관사칭, 자녀사칭, 안전계좌, 비밀유지, 상품권, 원격앱, … */
export const SCAM_PATTERNS: Pattern[] = [
  {
    id: 'impersonate_authority',
    label: '기관 사칭(검찰·경찰·금감원)',
    severity: 'high',
    re: /검찰|검사(님|실|입니다|라고)|수사관|경찰|금감원|금융감독원|사건\s*번호|피의자|범죄에\s*연루|구속\s*영장|수사\s*중/,
  },
  {
    id: 'safe_account',
    label: '"안전계좌" 이체 요구',
    severity: 'high',
    re: /안전\s*계좌|보호\s*계좌|국가\s*(안전|보호)\s*계좌|자산\s*보호\s*조치/,
  },
  {
    id: 'secrecy',
    label: '비밀 유지 요구("가족에게 말하지 마세요")',
    severity: 'high',
    re: /(아무|누구)(에게|한테)?도\s*(말|알리|얘기)|비밀로|(가족|자녀|아들|딸)(에게|한테|들한테)?\s*(말|알리|얘기)(하)?지\s*(마|말)|혼자\s*(처리|해결)/,
  },
  {
    id: 'impersonate_child',
    label: '자녀 사칭(폰 고장·새 번호)',
    severity: 'high',
    re: /(폰|휴대폰|핸드폰)\s*(이|가)?\s*(고장|액정|깨졌|깨져|망가|수리)|번호\s*(가\s*)?바뀌|새\s*번호|친구\s*(폰|번호)|임시\s*번호/,
  },
  {
    id: 'gift_card',
    label: '상품권·기프트카드 요구',
    severity: 'high',
    re: /상품권|기프트\s*카드|구글\s*(플레이\s*)?카드|핀\s*번호/,
  },
  {
    id: 'remote_app',
    label: '원격제어 앱·링크 설치 유도',
    severity: 'high',
    re: /원격\s*(제어|지원|앱)|팀\s*뷰어|애니\s*데스크|anydesk|teamviewer|앱\s*(을\s*)?(깔|설치)|링크\s*(를\s*)?(눌러|클릭)/i,
  },
  {
    id: 'credential_request',
    label: '신분증·인증번호·비밀번호 요구',
    severity: 'high',
    re: /신분증|주민(등록)?\s*(번호|증)|인증\s*번호|OTP|보안\s*카드|비밀번호/i,
  },
  { id: 'loan_bait', label: '저금리 대환·대출 유도', severity: 'medium', re: /저금리|대환\s*대출|대출\s*(승인|상환|조건)|기존\s*대출/ },
  { id: 'urgency', label: '긴급·압박', severity: 'medium', re: /지금\s*(당장|바로)|급해|빨리|오늘\s*(안|중)에|즉시|서둘러/ },
  { id: 'crypto', label: '가상자산 요구', severity: 'medium', re: /코인|비트코인|가상\s*자산|테더|usdt/i },
];

const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`;
const duration = (min: number): string => (min % 60 === 0 ? `${min / 60}시간` : `${min}분`);

export function detectSignals(
  req: ActionRequest,
  policy: PolicyConfig = DEFAULT_POLICY,
  requesterVerified = false,
): Signal[] {
  const sources = [req.text, ...(req.context ?? [])].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  const signals: Signal[] = [];
  for (const p of SCAM_PATTERNS) {
    if (p.id === 'credential_request' && req.kind === 'link_account') continue;
    for (const src of sources) {
      const m = p.re.exec(src);
      if (m) {
        signals.push({ id: p.id, label: p.label, severity: p.severity, evidence: m[0] });
        break;
      }
    }
  }
  if (req.kind === 'transfer' && req.payee && !(policy.registeredPayees[req.owner] ?? []).includes(req.payee)) {
    signals.push({ id: 'new_payee', label: '처음 보내는 계좌', severity: 'medium', evidence: req.payee });
  }
  if ((req.amountKRW ?? 0) >= policy.largeAmountKRW) {
    signals.push({
      id: 'large_amount',
      label: `고액(${won(policy.largeAmountKRW)} 이상)`,
      severity: 'medium',
      evidence: won(req.amountKRW ?? 0),
    });
  }
  if (req.payeeOwner !== undefined && req.payeeOwner === req.requester && req.requester !== req.owner) {
    signals.push({ id: 'self_dealing', label: '요청한 사람 본인 계좌로 이체', severity: 'medium', evidence: req.payeeOwner });
  }
  if (req.requester !== req.owner && !requesterVerified) {
    signals.push({ id: 'unverified_requester', label: '등록된 폰에서 오지 않은 요청', severity: 'high', evidence: req.requester });
  }
  if ((req.llmRiskScore ?? 0) >= policy.llmHoldThreshold) {
    signals.push({ id: 'llm_flag', label: 'AI 분류기가 사기로 의심', severity: 'high', evidence: `score ${req.llmRiskScore}` });
  }
  return signals;
}

export function evaluate(req: ActionRequest, opts: EvaluateOptions = {}): Decision {
  const policy: PolicyConfig = { ...DEFAULT_POLICY, ...opts.policy };
  const verified = opts.requesterVerified ?? false;
  const name = (id: MemberId): string => opts.names?.[id] ?? id;
  const what = req.summary ?? KIND_LABEL[req.kind];
  const signals = detectSignals(req, policy, verified);
  const high = signals.filter((s) => s.severity === 'high');
  const medium = signals.filter((s) => s.severity === 'medium');
  const signalLines = signals.map((s) => `• ${s.label} — "${s.evidence}"`);
  const base = { signals, notifyFamily: false, sealEvidence: false };

  const forbidden = FORBIDDEN_ACTIONS[req.kind];
  if (forbidden) {
    return {
      ...base,
      tier: 'T3',
      outcome: 'block',
      ownerApprovalRequired: true,
      approvalsRequired: 0,
      coolingOffMinutes: 0,
      reasons: [
        `⛔ "${forbidden}"${josa(forbidden, '은/는')} FA가 누구의 승인으로도 실행하지 않는 작업이에요. 실제 사기에서 가장 많이 쓰이는 수법이에요.`,
        ...(signals.length > 0 ? ['함께 발견된 신호:', ...signalLines] : []),
        '가족 모두에게 알리고 기록을 잠가서 보관했어요.',
      ],
      notifyFamily: true,
      sealEvidence: true,
    };
  }

  let tier: Tier = 'T2';
  if (req.kind === 'read') tier = 'T0';
  else if (req.kind === 'link_account') tier = 'T1';
  else if (req.kind === 'order' && (req.amountKRW ?? 0) <= policy.smallOrderLimitKRW) tier = 'T1';

  const sideEffect = req.kind === 'order' || req.kind === 'transfer' || req.kind === 'cancel_subscription';
  if (sideEffect && (high.length > 0 || medium.length >= 3)) {
    return {
      ...base,
      tier: 'T2',
      outcome: 'hold',
      ownerApprovalRequired: true,
      approvalsRequired: 2,
      coolingOffMinutes: policy.holdCoolingOffMinutes,
      reasons: [
        `🚨 사기 의심 신호가 있어서 "${what}"${josa(what, '을/를')} 보류했어요.`,
        ...signalLines,
        `가족에게 바로 알렸어요. 가족 한 명이 직접 확인하고 ${duration(policy.holdCoolingOffMinutes)}이 지나야만 진행돼요.`,
        '돈을 보내라는 전화·문자는 일단 끊고, 112나 은행 대표번호로 직접 확인하세요.',
      ],
      notifyFamily: true,
      sealEvidence: true,
    };
  }

  if (tier === 'T0') {
    return {
      ...base,
      tier,
      outcome: 'allow',
      ownerApprovalRequired: false,
      approvalsRequired: 0,
      coolingOffMinutes: 0,
      reasons: [`🔎 ${what}, 바로 확인할게요.`],
    };
  }

  if (req.kind === 'link_account') {
    return {
      ...base,
      tier,
      outcome: 'needs_approval',
      ownerApprovalRequired: true,
      approvalsRequired: 1,
      coolingOffMinutes: 0,
      reasons: [
        `🔐 ${name(req.owner)} 폰으로 연결 카드를 보냈어요. 비밀번호는 ${name(req.owner)}만 입력하고, FA도 다른 가족도 볼 수 없어요.`,
      ],
    };
  }

  const byOwner = req.requester === req.owner;
  if (tier === 'T1') {
    const auto = byOwner && verified;
    return {
      ...base,
      tier,
      outcome: auto ? 'allow' : 'needs_approval',
      ownerApprovalRequired: true,
      approvalsRequired: 1,
      coolingOffMinutes: 0,
      reasons: [
        auto ? `🛒 ${what}, 바로 진행할게요.` : `👆 ${name(req.owner)}${josa(name(req.owner), '이/가')} 한 번만 눌러 승인하면 "${what}"${josa(what, '을/를')} 진행해요.`,
      ],
    };
  }

  const newPayee = signals.some((s) => s.id === 'new_payee');
  const large = signals.some((s) => s.id === 'large_amount');
  const selfDealing = signals.some((s) => s.id === 'self_dealing');
  const needsSecond = !byOwner || newPayee || large;
  const coolingOffMinutes = newPayee ? policy.newPayeeCoolingOffMinutes : 0;
  const reasons = [
    needsSecond
      ? `🔐 "${what}"${josa(what, '은/는')} 되돌릴 수 없어서 ${name(req.owner)} 본인 승인 + 가족 1명 확인이 필요해요.`
      : `🔐 "${what}"${josa(what, '은/는')} 되돌릴 수 없어서 ${name(req.owner)} 본인 승인이 필요해요.`,
  ];
  if (selfDealing) {
    reasons.push(
      `⚠️ ${name(req.requester)} 본인 계좌로 가는 돈이라 ${name(req.owner)} 동의 없이는 절대 실행되지 않고, 가족 모두에게 공개돼요.`,
    );
  }
  if (coolingOffMinutes > 0) reasons.push(`⏳ 처음 보내는 계좌라 승인 후 ${duration(coolingOffMinutes)} 뒤에 실행돼요.`);
  return {
    ...base,
    tier,
    outcome: 'needs_approval',
    ownerApprovalRequired: true,
    approvalsRequired: needsSecond ? 2 : 1,
    coolingOffMinutes,
    reasons,
    notifyFamily: selfDealing || large,
  };
}
