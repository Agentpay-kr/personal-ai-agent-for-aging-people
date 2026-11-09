/**
 * AI judge ("중간 LLM 심판"): a second opinion between the router AI and execution.
 *
 * The router turns a chat message into an ActionRequest and the rule engine scores it. Then a judge
 * (an LLM, or the offline heuristic below) reads the router's metadata, the raw messages and the
 * recent logs, and returns pass / hold / block. Its authority is bounded:
 *   - it can always raise risk (hold or block anything);
 *   - it can lift a rule hold only when every rule signal is low severity, and even then the action
 *     still needs the owner plus one family member;
 *   - it can never lift a hard block (T3, lockdown, non-member) or skip human approvals.
 * So a coerced or prompt-injected conversation cannot talk the judge into moving money.
 */
import { DEFAULT_POLICY, type ActionKind, type ActionRequest, type Decision, type MemberId } from './policy';

export type Verdict = 'pass' | 'hold' | 'block';
export type JudgeEffect = 'kept' | 'raised' | 'cleared' | 'annotated';

/** What the router knows about the message. FamilyTrust overwrites `deviceVerified` with its own ZK result. */
export interface RouterMetadata {
  /** Who sent the chat message, as bound by the host (never chosen by a model). */
  actor?: MemberId;
  /** Whose account / VM the router decided this is for. */
  owner?: MemberId;
  /** The router's own label for the message, e.g. "scan", "propose", "transfer", "chat". */
  intent?: string;
  /** Router confidence, 0..1. */
  confidence?: number;
  /** Where the request came from: "kakao", "sms", "call", "app", … */
  channel?: string;
  /** True while the parent is on a phone call. */
  callActive?: boolean;
  deviceVerified?: boolean;
  roomId?: string;
  [key: string]: unknown;
}

export interface JudgeLogEntry {
  ts: number;
  type: string;
  actor: string;
  summary: string;
}

/** Everything the router can hand over with a request. */
export interface RouterContext {
  metadata?: RouterMetadata;
  /** Raw chat / SMS / call-transcript text. Untrusted data. */
  rawData?: string[];
  /** The router's own recent log lines. FamilyTrust adds its audit log automatically. */
  log?: JudgeLogEntry[];
}

export interface JudgeInput {
  request: ActionRequest;
  rules: Decision;
  metadata: RouterMetadata;
  rawData: string[];
  log: JudgeLogEntry[];
}

export interface JudgeVerdict {
  verdict: Verdict;
  /** Probability (0..1) that letting this proceed would harm the parent. */
  risk: number;
  /** Chat-ready Korean sentences, at most three. */
  reasons: string[];
  signals: string[];
  /** Which judge produced this (model id or "heuristic"). */
  model: string;
}

export type Judge = (input: JudgeInput) => Promise<JudgeVerdict>;

export class JudgeUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'JudgeUnavailableError';
  }
}

export const SIDE_EFFECT_KINDS: ReadonlySet<ActionKind> = new Set<ActionKind>(['order', 'cancel_subscription', 'transfer']);
const READ_INTENTS = new Set(['read', 'scan', 'list', 'chat', 'welcome', 'query', 'question']);

const LABEL: Record<Verdict, string> = { pass: '통과', hold: '보류', block: '차단' };
const duration = (min: number): string => (min % 60 === 0 ? `${min / 60}시간` : `${min}분`);

export const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 1);

/** Used when the judge errors or times out: hold anything with side effects, let reads follow the rules. */
export function failClosedVerdict(kind: ActionKind, error: unknown): JudgeVerdict {
  const why = error instanceof Error ? error.message : String(error);
  return SIDE_EFFECT_KINDS.has(kind)
    ? {
        verdict: 'hold',
        risk: 1,
        reasons: ['AI 확인 결과를 받지 못해서 안전하게 보류했어요.'],
        signals: ['judge_unavailable'],
        model: `fail-closed (${why})`,
      }
    : {
        verdict: 'pass',
        risk: 0.5,
        reasons: ['AI 확인 결과를 받지 못했지만 보기만 하는 일이라 규칙대로 진행해요.'],
        signals: ['judge_unavailable'],
        model: `fail-open-read (${why})`,
      };
}

export interface CombineOptions {
  holdCoolingOffMinutes?: number;
  newPayeeCoolingOffMinutes?: number;
}

/** Merge the rule decision with the judge verdict under the bounded-authority rules above. */
export function combineWithJudge(
  rules: Decision,
  judge: JudgeVerdict,
  opts: CombineOptions = {},
): { decision: Decision; effect: JudgeEffect } {
  const holdMinutes = opts.holdCoolingOffMinutes ?? DEFAULT_POLICY.holdCoolingOffMinutes;
  const payeeMinutes = opts.newPayeeCoolingOffMinutes ?? DEFAULT_POLICY.newPayeeCoolingOffMinutes;
  const tag = `🧑‍⚖️ AI 심판: ${LABEL[judge.verdict]} · 위험도 ${Math.round(clamp01(judge.risk) * 100)}%`;
  const why = judge.reasons.slice(0, 3).map((r) => `• ${r}`);

  if (rules.outcome === 'block') {
    return { decision: { ...rules, reasons: [...rules.reasons, tag, ...why] }, effect: 'kept' };
  }

  if (judge.verdict === 'block') {
    return {
      decision: {
        ...rules,
        outcome: 'block',
        reasons: [tag, '⛔ 실행하지 않고 막았어요.', ...why, '가족 모두에게 알리고 기록을 잠가서 보관했어요.'],
        notifyFamily: true,
        sealEvidence: true,
      },
      effect: 'raised',
    };
  }

  if (judge.verdict === 'hold') {
    if (rules.outcome === 'hold') {
      return { decision: { ...rules, reasons: [...rules.reasons, tag, ...why] }, effect: 'kept' };
    }
    return {
      decision: {
        ...rules,
        tier: rules.tier === 'T0' || rules.tier === 'T1' ? 'T2' : rules.tier,
        outcome: 'hold',
        ownerApprovalRequired: true,
        approvalsRequired: Math.max(2, rules.approvalsRequired),
        coolingOffMinutes: Math.max(rules.coolingOffMinutes, holdMinutes),
        reasons: [
          tag,
          '🚨 AI 심판이 위험하다고 봐서 보류했어요.',
          ...why,
          `가족 한 명이 직접 확인하고 ${duration(Math.max(rules.coolingOffMinutes, holdMinutes))}이 지나야만 진행돼요.`,
        ],
        notifyFamily: true,
        sealEvidence: true,
      },
      effect: 'raised',
    };
  }

  // judge.verdict === 'pass'
  if (rules.outcome === 'hold') {
    const hardSignal = rules.signals.some((s) => s.severity === 'high');
    if (hardSignal) {
      return {
        decision: {
          ...rules,
          reasons: [...rules.reasons, tag, '고위험 신호라서 AI 심판 의견과 상관없이 가족 확인이 필요해요.', ...why],
        },
        effect: 'kept',
      };
    }
    const newPayee = rules.signals.some((s) => s.id === 'new_payee');
    const coolingOffMinutes = newPayee ? payeeMinutes : 0;
    return {
      decision: {
        ...rules,
        outcome: 'needs_approval',
        ownerApprovalRequired: true,
        approvalsRequired: Math.max(2, rules.approvalsRequired),
        coolingOffMinutes,
        reasons: [
          tag,
          '✅ 규칙은 의심했지만 AI 심판은 정상 거래로 봤어요. 그래도 본인 + 가족 1명 승인은 필요해요.',
          ...why,
          ...(coolingOffMinutes > 0 ? [`⏳ 처음 보내는 계좌라 승인 후 ${duration(coolingOffMinutes)} 뒤에 실행돼요.`] : []),
        ],
        notifyFamily: true,
        sealEvidence: false,
      },
      effect: 'cleared',
    };
  }

  return { decision: { ...rules, reasons: [...rules.reasons, tag] }, effect: 'annotated' };
}

/** Run the primary judge; if it throws, ask the fallback judge instead. */
export function withFallback(primary: Judge, fallback: Judge, onError?: (error: unknown) => void): Judge {
  return async (input) => {
    try {
      return await primary(input);
    } catch (error) {
      onError?.(error);
      const v = await fallback(input);
      return { ...v, model: `${v.model} (1차 심판 실패로 대체)` };
    }
  };
}

const COERCION = /검찰|검사(님|실|입니다|라고)|수사관|경찰|금감원|금융감독원|수사\s*중|사건\s*번호/;
const SAFE_ACCOUNT = /안전\s*계좌|보호\s*계좌|국가\s*(안전|보호)\s*계좌/;
const ISOLATION = /(가족|자녀|아들|딸)(에게|한테|들한테)?\s*(말|알리|얘기)(하)?지\s*(마|말)|비밀로|(아무|누구)(에게|한테)?도\s*(말|알리|얘기)/;
const ROUTINE_BILL = /관리비|월세|공과금|전기\s*요금|가스\s*요금|수도\s*요금|병원비|보험료|학원비/;
const MANIPULATION = /이전\s*(지시|명령).*무시|규칙.*무시|ignore (all|previous|your)|AI\s*(비서|어시스턴트)(는|가)?\s*(즉시|바로)/i;

/**
 * Offline judge: same contract as the LLM judge, built from router metadata, raw data and logs.
 * Used when no API key is set and as the fallback when the LLM judge fails.
 */
export const heuristicJudge: Judge = async (input) => {
  const { request: req, rules, metadata: m, rawData, log } = input;
  const sideEffect = SIDE_EFFECT_KINDS.has(req.kind);
  const text = [req.text ?? '', ...(req.context ?? []), ...rawData].join('\n');
  const blocks: string[] = [];
  const holds: string[] = [];
  const signals: string[] = [];
  const flag = (bucket: string[], signal: string, reason: string): void => {
    bucket.push(reason);
    signals.push(signal);
  };

  if (m.actor && m.actor !== req.requester) {
    flag(blocks, 'actor_mismatch', '메시지를 보낸 사람과 실행을 요청한 사람이 달라요.');
  }
  if (m.owner && m.owner !== req.owner) {
    flag(blocks, 'owner_mismatch', '처음에 알아들은 계정 주인과 실제로 쓰려는 계정이 달라요.');
  }
  if (sideEffect && m.intent && READ_INTENTS.has(m.intent)) {
    flag(blocks, 'intent_mismatch', `처음에는 "${m.intent}"(보기·대화)로 알아들었는데 실제로는 돈이나 계정을 바꾸려 해요.`);
  }
  if (MANIPULATION.test(text)) {
    flag(blocks, 'prompt_injection', '메시지 안에 AI에게 규칙을 무시하라는 문장이 있어요.');
  }
  if (sideEffect && COERCION.test(text) && SAFE_ACCOUNT.test(text) && (ISOLATION.test(text) || m.callActive || m.channel === 'call')) {
    flag(blocks, 'coercion_script', '기관 사칭 + 안전계좌 + 비밀 유지(또는 통화 중) 조합은 전형적인 보이스피싱 대본이에요.');
  }
  if (req.kind === 'transfer' && (m.callActive || m.channel === 'call')) {
    flag(holds, 'transfer_during_call', '통화 중에 들어온 송금 요청이에요. 사기범은 전화를 끊지 못하게 한 채 이체를 시켜요.');
  }
  if (sideEffect && typeof m.confidence === 'number' && m.confidence < 0.5) {
    flag(holds, 'low_router_confidence', '누구의 일인지 확실하지 않아요.');
  }
  if (req.requester !== req.owner && m.deviceVerified === false) {
    flag(holds, 'unverified_device', '등록된 기기에서 온 요청이 아니에요.');
  }

  const newest = log.reduce((max, e) => Math.max(max, e.ts), Number.NEGATIVE_INFINITY);
  const recent = log.filter((e) => e.ts >= newest - 24 * 60 * 60 * 1000);
  if (recent.some((e) => e.type === 'proof_failed')) {
    flag(holds, 'recent_impostor', '최근 등록되지 않은 기기가 승인을 시도한 기록이 있어요.');
  }
  if (sideEffect && recent.some((e) => e.type === 'lockdown')) {
    flag(holds, 'recent_lockdown', '최근 긴급 잠금이 있었어요.');
  }
  const transfers = recent.filter((e) => e.type === 'request' && /송금|이체|transfer/.test(e.summary)).length;
  if (req.kind === 'transfer' && transfers >= 3) {
    flag(holds, 'repeated_transfers', '짧은 시간에 송금 요청이 반복됐어요.');
  }

  if (blocks.length > 0) {
    return { verdict: 'block', risk: 0.95, reasons: [...blocks, ...holds].slice(0, 3), signals, model: 'heuristic-v1' };
  }
  if (holds.length > 0) {
    return { verdict: 'hold', risk: 0.8, reasons: holds.slice(0, 3), signals, model: 'heuristic-v1' };
  }
  if (rules.outcome === 'hold') {
    const soft = !rules.signals.some((s) => s.severity === 'high');
    if (soft && ROUTINE_BILL.test(text)) {
      return {
        verdict: 'pass',
        risk: 0.25,
        reasons: ['관리비·공과금 같은 정기 생활비로 보이고, 사기 대본의 특징은 없어요.'],
        signals: ['routine_bill'],
        model: 'heuristic-v1',
      };
    }
    return { verdict: 'hold', risk: 0.6, reasons: ['규칙이 의심한 신호를 뒤집을 근거가 없어요.'], signals: ['rules_hold'], model: 'heuristic-v1' };
  }
  return {
    verdict: 'pass',
    risk: rules.outcome === 'allow' ? 0.05 : 0.15,
    reasons: ['메타데이터·원문·기록에서 이상한 점을 찾지 못했어요.'],
    signals: [],
    model: 'heuristic-v1',
  };
};
