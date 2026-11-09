/**
 * FamilyTrust: the one object the chat UI and the LLM agent talk to.
 *
 *   LLM agent ──proposes──▶ trust.request(phone, ActionRequest)
 *                              │  ZK device proof + policy gate (T0–T3, scam signals)
 *                              ▼
 *     allow │ needs_approval (owner / 2-of-3) │ hold (suspected scam) │ block (forbidden)
 *                              │  approvals from family phones (ZK proof + key share)
 *                              ▼
 *     session key rebuilt from 2 of 3 shares → executor runs inside a throwaway task → task data shredded
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { decryptText, encrypt, newKey, type Sealed } from './aead';
import { AuditLog } from './audit';
import { shortId, toHex, utf8 } from './bytes';
import { josa, serviceLabel } from './korean';
import { openEvidence, sealEvidence, type SealedEvidence } from './evidence';
import { FamilyKeyTree } from './gkm';
import {
  clamp01,
  combineWithJudge,
  failClosedVerdict,
  type Judge,
  type JudgeEffect,
  type JudgeInput,
  type JudgeLogEntry,
  type JudgeVerdict,
  type RouterContext,
} from './judge';
import {
  DEFAULT_POLICY,
  evaluate,
  type ActionRequest,
  type Decision,
  type MemberId,
  type PolicyConfig,
} from './policy';
import { combine, split, type Share } from './shamir';
import { ShreddedError, ShredVault } from './vault';
import { MemberDevice, verify, type ZkProof } from './zk';

export interface MemberProfile {
  id: MemberId;
  name: string;
  role: 'parent' | 'child';
}

export type ActionStatus =
  | 'pending'
  | 'held'
  | 'blocked'
  | 'scheduled'
  | 'executed'
  | 'rejected'
  | 'cancelled'
  | 'failed';

export interface PendingAction {
  id: string;
  request: ActionRequest;
  decision: Decision;
  /** Members whose phones produced a valid proof for this action. */
  approvals: MemberId[];
  status: ActionStatus;
  createdAt: number;
  executeAfter?: number;
  evidenceId?: string;
  result?: string;
  receipt?: string;
  /** The AI judge's verdict and how it changed the rule decision. */
  judge?: JudgeVerdict & { effect: JudgeEffect };
}

export interface TrustEvent {
  type: string;
  /** Chat-ready Korean text. */
  message: string;
  requestId?: string;
  ts: number;
}

/** Does the real work (browser agent in the owner's VM, API call, …). Only called after the gate says yes. */
export type Executor = (request: ActionRequest, ctx: { sessionSecret?: string }) => Promise<string> | string;

export interface Task {
  id: string;
  put(label: string, data: string): Promise<string>;
  get(recordId: string): Promise<string>;
  /** Shreds everything the task stored and returns a receipt hash. */
  finish(outcome?: string): string;
}

export interface LinkInfo {
  slot: string;
  owner: MemberId;
  service: string;
  /** [owner, fa_server, guardian]: any 2 can rebuild the session key. */
  holders: string[];
  expiresAt: number;
}

interface LinkedAccount extends LinkInfo {
  sessionRecord: string;
  serverShareRecord: string;
}

export interface FamilyTrustOptions {
  familyId?: string;
  members: MemberProfile[];
  policy?: Partial<PolicyConfig>;
  now?: () => number;
  executor?: Executor;
  /** Optional AI judge between the router and execution (see judge.ts). */
  judge?: Judge;
  /** Judge timeout in ms. On timeout or error, anything with side effects is held (fail closed). Default 12000. */
  judgeTimeoutMs?: number;
}

export const FA_SERVER = 'fa_server';
export const DAY_MS = 24 * 60 * 60 * 1000;

const slotOf = (owner: MemberId, service: string): string => `session:${owner}:${service}`;
const evidenceSlot = (id: string): string => `evidence:${id}`;
const OPEN: ActionStatus[] = ['pending', 'held', 'scheduled'];
const duration = (min: number): string => (min % 60 === 0 ? `${min / 60}시간` : `${min}분`);

function blocked(reason: string, sealIt: boolean): Decision {
  return {
    tier: 'T3',
    outcome: 'block',
    ownerApprovalRequired: true,
    approvalsRequired: 0,
    coolingOffMinutes: 0,
    signals: [],
    reasons: [reason],
    notifyFamily: sealIt,
    sealEvidence: sealIt,
  };
}

export class FamilyTrust {
  readonly familyId: string;
  readonly keys: FamilyKeyTree;
  readonly vault: ShredVault;
  readonly audit: AuditLog;

  readonly #now: () => number;
  readonly #policy: PolicyConfig;
  readonly #executor: Executor;
  readonly #judge: Judge | undefined;
  readonly #judgeTimeoutMs: number;
  readonly #members = new Map<MemberId, MemberProfile>();
  readonly #publicKeys = new Map<MemberId, string>();
  readonly #devices = new Map<MemberId, MemberDevice>();
  readonly #usedProofs = new Set<string>();
  readonly #actions = new Map<string, PendingAction>();
  readonly #shares = new Map<string, Share[]>();
  readonly #links = new Map<string, LinkedAccount>();
  readonly #evidence = new Map<string, SealedEvidence>();
  readonly #memory: Array<{ id: string; sealed: Sealed }> = [];
  #listeners: Array<(e: TrustEvent) => void> = [];
  #frozen = false;
  #lockCount = 0;

  constructor(opts: FamilyTrustOptions) {
    if (opts.members.length < 2) throw new Error('a family needs at least 2 members');
    this.familyId = opts.familyId ?? shortId('family');
    this.#now = opts.now ?? Date.now;
    this.#policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.#executor = opts.executor ?? ((req) => `${req.summary ?? req.kind} 완료`);
    this.#judge = opts.judge;
    this.#judgeTimeoutMs = opts.judgeTimeoutMs ?? 12_000;
    this.vault = new ShredVault(this.#now);
    this.audit = new AuditLog(this.#now);
    for (const m of opts.members) this.#members.set(m.id, m);
    this.keys = new FamilyKeyTree(this.familyId, opts.members.map((m) => m.id));
    this.audit.append('family_created', 'system', `가족 ${opts.members.length}명 · 가족 키 epoch ${this.keys.epoch}`);
  }

  // ───────────────────────── events & lookups ─────────────────────────

  on(listener: (e: TrustEvent) => void): () => void {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== listener);
    };
  }

  get frozen(): boolean {
    return this.#frozen;
  }

  name(id: MemberId): string {
    return this.#members.get(id)?.name ?? id;
  }

  members(): MemberProfile[] {
    return [...this.#members.values()];
  }

  getAction(id: string): PendingAction | undefined {
    return this.#actions.get(id);
  }

  actions(): PendingAction[] {
    return [...this.#actions.values()];
  }

  linkedAccounts(): LinkInfo[] {
    return [...this.#links.values()].map((l) => ({
      slot: l.slot,
      owner: l.owner,
      service: l.service,
      holders: [...l.holders],
      expiresAt: l.expiresAt,
    }));
  }

  evidenceList(): Array<{ id: string; reason: string; createdAt: number; commitment: string }> {
    return [...this.#evidence.values()].map(({ id, reason, createdAt, commitment }) => ({ id, reason, createdAt, commitment }));
  }

  // ───────────────────────── phones & ZK identity ─────────────────────────

  /** Demo helper: make a phone for a member and enroll its public key. */
  createDevice(memberId: MemberId): MemberDevice {
    const device = new MemberDevice(memberId);
    this.enroll(device);
    return device;
  }

  enroll(device: MemberDevice): void {
    this.#requireMember(device.memberId);
    this.#devices.set(device.memberId, device);
    this.#publicKeys.set(device.memberId, device.publicKey);
    this.audit.append('device_enrolled', device.memberId, `기기 등록 (공개키 ${device.publicKey.slice(0, 10)}…)`);
  }

  /** The exact string a phone must prove over. Remote phones compute the same string. */
  context(memberId: MemberId, purpose: string, ref: string): string {
    return `${this.familyId}|${memberId}|${purpose}|${ref}`;
  }

  unlockContext(memberId: MemberId): string {
    return this.context(memberId, 'unlock', `lock-${this.#lockCount}`);
  }

  /** Verifies against the ENROLLED public key and refuses replays. */
  verifyProof(memberId: MemberId, proof: ZkProof, context: string): boolean {
    const pk = this.#publicKeys.get(memberId);
    if (!pk) return false;
    const replayKey = `${memberId}:${proof.R}`;
    if (this.#usedProofs.has(replayKey)) return false;
    if (!verify(pk, proof, context)) return false;
    this.#usedProofs.add(replayKey);
    return true;
  }

  // ───────────────────────── requests & approvals ─────────────────────────

  newRequestId(): string {
    return shortId('req');
  }

  /** A member's phone signs and submits a request in one step (convenience for the single-process demo). */
  async request(
    device: MemberDevice,
    req: Omit<ActionRequest, 'requester' | 'id'>,
    context: RouterContext = {},
  ): Promise<PendingAction> {
    const id = this.newRequestId();
    const proof = device.prove(this.context(device.memberId, 'request', id));
    const share = req.service ? device.shareFor(slotOf(req.owner, req.service)) : undefined;
    return this.submit({ ...req, id, requester: device.memberId }, { proof, share }, context);
  }

  /**
   * `context` is what the router AI knows: its metadata, the raw messages, its own log lines.
   * When a judge is configured it reads all of that (plus this audit log) before anything runs.
   */
  async submit(
    req: ActionRequest,
    auth: { proof?: ZkProof; share?: Share } = {},
    context: RouterContext = {},
  ): Promise<PendingAction> {
    const id = req.id ?? this.newRequestId();
    if (this.#actions.has(id)) throw new Error(`duplicate request id ${id}`);
    const request: ActionRequest = { ...req, id };
    const isMember = this.#members.has(request.requester);
    const verified =
      isMember &&
      auth.proof !== undefined &&
      this.verifyProof(request.requester, auth.proof, this.context(request.requester, 'request', id));

    let decision: Decision;
    if (!isMember) {
      decision = blocked('등록된 가족 기기가 아닌 곳에서 온 요청이라 처리하지 않았어요.', true);
    } else if (this.#frozen && request.kind !== 'read') {
      decision = blocked('🔒 긴급 잠금 중이라 조회 말고는 아무것도 실행하지 않아요. 가족 2명이 기기로 해제해야 해요.', false);
    } else {
      decision = evaluate(request, { requesterVerified: verified, policy: this.#policy, names: this.#names() });
    }

    let judged: (JudgeVerdict & { effect: JudgeEffect }) | undefined;
    if (this.#judge && decision.outcome !== 'block') {
      const verdict = await this.#runJudge({
        request,
        rules: decision,
        metadata: { ...context.metadata, deviceVerified: verified },
        rawData: context.rawData ?? [],
        log: [...this.#recentLog(), ...(context.log ?? [])],
      });
      const combined = combineWithJudge(decision, verdict, {
        holdCoolingOffMinutes: this.#policy.holdCoolingOffMinutes,
        newPayeeCoolingOffMinutes: this.#policy.newPayeeCoolingOffMinutes,
      });
      decision = combined.decision;
      judged = { ...verdict, effect: combined.effect };
    }

    const action: PendingAction = {
      id,
      request,
      decision,
      approvals: verified ? [request.requester] : [],
      status: decision.outcome === 'hold' ? 'held' : decision.outcome === 'block' ? 'blocked' : 'pending',
      createdAt: this.#now(),
      judge: judged,
    };
    this.#actions.set(id, action);
    if (verified && auth.share) this.#shares.set(id, [auth.share]);

    const what = request.summary ?? request.kind;
    this.audit.append('request', request.requester, `${what} → ${decision.tier}/${decision.outcome}`, {
      requestId: id,
      verified,
      signals: decision.signals.map((s) => s.id),
    });
    if (judged) {
      this.audit.append('judge', 'ai_judge', `${judged.verdict} (${Math.round(judged.risk * 100)}%) → ${judged.effect}`, {
        requestId: id,
        model: judged.model,
        signals: judged.signals,
      });
    }
    this.#emit('decision', decision.reasons.join('\n'), id);
    if (decision.notifyFamily) {
      const state =
        decision.outcome === 'hold' ? '사기 의심으로 보류' : decision.outcome === 'block' ? '차단' : '가족 확인 필요';
      this.#emit('family_alert', `👨‍👩‍👦 가족 전체 알림: ${this.name(request.requester)} 요청 "${what}" → ${state}`, id);
    }
    if (decision.sealEvidence) action.evidenceId = await this.#sealEvidence(action);
    await this.#progress(action);
    return action;
  }

  async approve(requestId: string, memberId: MemberId, proof: ZkProof, share?: Share): Promise<PendingAction> {
    const a = this.#get(requestId);
    if (!this.verifyProof(memberId, proof, this.context(memberId, 'approve', requestId))) {
      this.audit.append('proof_failed', memberId, '승인 기기 증명 실패', { requestId });
      this.#emit(
        'proof_failed',
        `⚠️ "${this.name(memberId)}" 이름으로 승인이 왔지만 등록된 기기의 ZK 증명이 아니에요. 무시하고 기록했어요.`,
        requestId,
      );
      return a;
    }
    if (this.#frozen) {
      this.#emit('info', '🔒 긴급 잠금 중이라 승인을 받을 수 없어요.', requestId);
      return a;
    }
    if (a.status === 'blocked') {
      this.#emit('info', '⛔ 차단된 작업은 누가 승인해도 실행되지 않아요.', requestId);
      return a;
    }
    if (a.status !== 'pending' && a.status !== 'held') {
      this.#emit('info', `이미 처리된 요청이에요 (${a.status}).`, requestId);
      return a;
    }
    if (!a.approvals.includes(memberId)) a.approvals.push(memberId);
    if (share) this.#shares.set(requestId, [...(this.#shares.get(requestId) ?? []), share]);
    this.audit.append('approval', memberId, `승인: ${a.request.summary ?? a.request.kind}`, { requestId });
    this.#emit(
      'approval',
      `👍 ${this.name(memberId)} 승인 (${a.approvals.length}/${Math.max(1, a.decision.approvalsRequired)}) · 🔐 기기 증명됨`,
      requestId,
    );
    await this.#progress(a);
    return a;
  }

  /** Demo helper: the phone proves and attaches its key share for the session this action needs. */
  async approveWith(device: MemberDevice, requestId: string): Promise<PendingAction> {
    const a = this.#get(requestId);
    const proof = device.prove(this.context(device.memberId, 'approve', requestId));
    const share = a.request.service ? device.shareFor(slotOf(a.request.owner, a.request.service)) : undefined;
    return this.approve(requestId, device.memberId, proof, share);
  }

  async reject(
    requestId: string,
    memberId: MemberId,
    proof: ZkProof,
    opts: { scam?: boolean } = {},
  ): Promise<PendingAction> {
    const a = this.#get(requestId);
    if (!this.verifyProof(memberId, proof, this.context(memberId, 'reject', requestId))) {
      this.#emit('proof_failed', '⚠️ 등록된 기기가 아닌 곳에서 온 거절이라 무시했어요.', requestId);
      return a;
    }
    if (OPEN.includes(a.status)) a.status = 'rejected';
    this.#shares.delete(requestId);
    const what = a.request.summary ?? a.request.kind;
    this.audit.append('rejected', memberId, `거절${opts.scam ? ' (사기 신고)' : ''}: ${what}`, { requestId });
    this.#emit(
      'rejected',
      `${opts.scam ? '🛑' : '🙅'} ${this.name(memberId)}${josa(this.name(memberId), '이/가')} ${
        opts.scam ? '사기로 확인해서 요청을 취소했어요.' : '거절했어요.'
      }`,
      requestId,
    );
    if (opts.scam) await this.lockdown(memberId, `가족이 사기로 확인: ${what}`);
    return a;
  }

  async rejectWith(device: MemberDevice, requestId: string, opts: { scam?: boolean } = {}): Promise<PendingAction> {
    return this.reject(requestId, device.memberId, device.prove(this.context(device.memberId, 'reject', requestId)), opts);
  }

  /** Runs scheduled actions that are due and expires linked sessions past their TTL. Call on a timer. */
  async tick(): Promise<void> {
    this.vault.sweep();
    for (const [slot, link] of [...this.#links]) {
      if (this.vault.info(link.sessionRecord)?.shredded) {
        this.#links.delete(slot);
        for (const d of this.#devices.values()) d.dropShare(slot);
        this.audit.append('session_expired', 'system', `${link.owner}/${link.service} 세션 기한 만료 → 소멸`);
        this.#emit(
          'expired',
          `⏳ ${this.name(link.owner)}의 ${serviceLabel(link.service)} 연결이 기한이 지나 스스로 소멸했어요. 필요하면 다시 연결하세요.`,
        );
      }
    }
    if (this.#frozen) return;
    for (const a of this.#actions.values()) {
      if (a.status === 'scheduled' && (a.executeAfter ?? Number.POSITIVE_INFINITY) <= this.#now()) await this.#execute(a);
    }
  }

  // ───────────────────────── linked accounts (2-of-3 custody) ─────────────────────────

  /**
   * The owner typed their login into the secure input card on THEIR phone; only the resulting
   * session (cookie / token) reaches FA. It is sealed under a fresh key split 2-of-3:
   * owner's phone / FA server / guardian. The server share and the session expire after the TTL.
   */
  async linkAccount(
    owner: MemberId,
    service: string,
    sessionSecret: string,
    opts: { ttlDays?: number; guardian?: MemberId } = {},
  ): Promise<LinkInfo> {
    this.#requireMember(owner);
    if (this.#frozen) throw new Error('locked: unlock with 2 family devices first');
    const guardian = opts.guardian ?? this.#defaultGuardian(owner);
    const ttlDays = opts.ttlDays ?? 30;
    const ttlMs = ttlDays * DAY_MS;
    const slot = slotOf(owner, service);
    const previous = this.#links.get(slot);
    if (previous) {
      this.vault.shred(previous.sessionRecord, 'relinked');
      this.vault.shred(previous.serverShareRecord, 'relinked');
    }

    const key = newKey();
    const sealedSession = await encrypt(key, sessionSecret, slot);
    const holders = [owner, FA_SERVER, guardian];
    const [ownerShare, serverShare, guardianShare] = split(key, { holders, threshold: 2 });
    key.fill(0);
    if (!ownerShare || !serverShare || !guardianShare) throw new Error('share split failed');

    const tags = [`owner:${owner}`, `slot:${slot}`];
    const sessionRecord = await this.vault.put(`${service} session`, JSON.stringify(sealedSession), {
      ttlMs,
      tags: ['session', ...tags],
    });
    const serverShareRecord = await this.vault.put(`${service} server share`, JSON.stringify(serverShare), {
      ttlMs,
      tags: ['server_share', ...tags],
    });
    this.#deliverShare(owner, slot, ownerShare, true);
    this.#deliverShare(guardian, slot, guardianShare, true);

    const link: LinkedAccount = { slot, owner, service, holders, expiresAt: this.#now() + ttlMs, sessionRecord, serverShareRecord };
    this.#links.set(slot, link);
    this.audit.append('account_linked', owner, `${service} 연결 (2-of-3, ${ttlDays}일)`, { slot });
    this.#emit(
      'linked',
      [
        `✅ ${this.name(owner)}의 ${serviceLabel(service)} 연결 완료`,
        `🔐 열쇠 3조각(${this.name(owner)} 폰 / FA 서버 / ${this.name(guardian)} 폰) 중 2개가 모여야 열려요`,
        `⏳ ${ttlDays}일 뒤 자동 소멸 · 비밀번호는 저장하지 않아요`,
      ].join('\n'),
    );
    return this.linkedAccounts().find((l) => l.slot === slot)!;
  }

  /** Demo check: one share alone (server or guardian) cannot rebuild the session key. */
  async proveSingleShareFails(owner: MemberId, service: string): Promise<string[]> {
    const link = this.#links.get(slotOf(owner, service));
    if (!link) throw new Error(`${service} is not linked`);
    const guardianId = link.holders[2] ?? '';
    const attempts = [
      { label: 'FA 서버 조각만으로', share: JSON.parse(await this.vault.getText(link.serverShareRecord)) as Share },
      { label: `${this.name(guardianId)} 조각만으로`, share: this.#devices.get(guardianId)?.shareFor(link.slot) },
    ];
    return attempts.map(({ label, share }) => {
      try {
        combine(share ? [share] : []);
        return `${label}: 열림 (이러면 안 됨!)`;
      } catch (e) {
        return `${label} 열기 → ❌ ${(e as Error).message}`;
      }
    });
  }

  // ───────────────────────── lockdown ─────────────────────────

  /** Anyone can lock. Unlocking takes 2 different family phones. */
  async lockdown(by: MemberId, reason: string): Promise<void> {
    if (this.#frozen) return;
    this.#frozen = true;
    this.#lockCount++;
    const slots = [...this.#links.keys()];
    this.vault.shredWhere((r) => r.tags.includes('session') || r.tags.includes('server_share'), 'lockdown');
    for (const d of this.#devices.values()) for (const s of slots) d.dropShare(s);
    this.#links.clear();
    let cancelled = 0;
    for (const a of this.#actions.values()) {
      if (OPEN.includes(a.status)) {
        a.status = 'cancelled';
        cancelled++;
      }
    }
    this.#shares.clear();
    const oldKey = this.keys.familyKey();
    this.keys.rekey();
    await this.#reencryptMemory(oldKey);
    this.audit.append('lockdown', by, reason, { sessionsShredded: slots.length, cancelled, epoch: this.keys.epoch });
    this.#emit(
      'lockdown',
      [
        `🔒 긴급 잠금 (${this.name(by)})`,
        `• 연결된 서비스 ${slots.length}개의 세션과 열쇠 조각 소멸 → 에이전트가 더는 어떤 계정도 못 열어요`,
        `• 진행 중이던 요청 ${cancelled}건 취소`,
        `• 가족 키 재발급 (epoch ${this.keys.epoch})`,
        '• 해제는 가족 2명의 기기 증명이 있어야 해요',
      ].join('\n'),
    );
  }

  async unlock(approvals: Array<{ memberId: MemberId; proof: ZkProof }>): Promise<boolean> {
    if (!this.#frozen) return true;
    const ok = new Set<MemberId>();
    for (const ap of approvals) {
      if (this.verifyProof(ap.memberId, ap.proof, this.unlockContext(ap.memberId))) ok.add(ap.memberId);
    }
    if (ok.size < 2) {
      this.#emit('unlock_denied', `🔒 해제하려면 서로 다른 가족 2명의 기기 증명이 필요해요 (${ok.size}/2).`);
      return false;
    }
    this.#frozen = false;
    this.audit.append('unlocked', [...ok].join('+'), '잠금 해제 (2-of-3)');
    this.#emit(
      'unlocked',
      `🔓 ${[...ok].map((id) => this.name(id)).join(' + ')} 확인으로 잠금 해제. 보안을 위해 서비스 연결은 다시 해야 해요.`,
    );
    return true;
  }

  async unlockWith(devices: MemberDevice[]): Promise<boolean> {
    return this.unlock(devices.map((d) => ({ memberId: d.memberId, proof: d.prove(this.unlockContext(d.memberId)) })));
  }

  // ───────────────────────── membership (GKM re-key) ─────────────────────────

  /** Leaving or being removed from the chat room re-keys the family group. */
  async removeMember(memberId: MemberId, by: MemberId = memberId): Promise<void> {
    this.#requireMember(memberId);
    if (this.#members.size <= 2) throw new Error('a family needs at least 2 members');
    const name = this.name(memberId);
    const oldKey = this.keys.familyKey();
    this.keys.removeMember(memberId);
    this.#members.delete(memberId);
    this.#publicKeys.delete(memberId);
    this.#devices.get(memberId)?.dropAllShares();
    this.#devices.delete(memberId);
    for (const a of this.#actions.values()) {
      if (OPEN.includes(a.status) && a.request.requester === memberId) a.status = 'cancelled';
    }
    await this.#reencryptMemory(oldKey);
    this.audit.append('member_removed', by, `${memberId} 퇴장 → 가족 키 epoch ${this.keys.epoch}`);
    const remover = this.name(by);
    const what =
      by === memberId
        ? `${name}${josa(name, '이/가')} 나갔어요`
        : `${remover}${josa(remover, '이/가')} ${name}${josa(name, '을/를')} 내보냈어요`;
    this.#emit(
      'member_removed',
      `👋 ${what} → 🔑 가족 키 재발급 (epoch ${this.keys.epoch}). 나간 사람은 이후 기록을 볼 수 없어요.`,
    );
  }

  // ───────────────────────── family memory (sealed under the family key) ─────────────────────────

  async remember(note: string, by: MemberId): Promise<string> {
    this.#requireMember(by);
    const id = shortId('mem');
    this.#memory.push({ id, sealed: await encrypt(this.keys.familyKey(), note, `memory|${this.familyId}`) });
    this.audit.append('memory_added', by, `가족 기억 추가 (${id})`);
    return id;
  }

  async recall(): Promise<string[]> {
    const key = this.keys.familyKey();
    return Promise.all(this.#memory.map((m) => decryptText(key, m.sealed)));
  }

  memoryCiphertexts(): Sealed[] {
    return this.#memory.map((m) => m.sealed);
  }

  // ───────────────────────── evidence ─────────────────────────

  /** Needs phones from 2 of the family members that existed when the evidence was sealed. */
  async openEvidence(evidenceId: string, devices: MemberDevice[]): Promise<unknown> {
    const ev = this.#evidence.get(evidenceId);
    if (!ev) throw new Error(`unknown evidence ${evidenceId}`);
    const shares = devices
      .map((d) => d.shareFor(evidenceSlot(evidenceId)))
      .filter((s): s is Share => s !== undefined);
    const data = await openEvidence(ev, shares);
    this.audit.append('evidence_opened', devices.map((d) => d.memberId).join('+'), `증거 열람 ${evidenceId}`);
    return data;
  }

  // ───────────────────────── throwaway tasks ─────────────────────────

  /** A workspace that lives only as long as one job; finish() shreds everything it stored. */
  startTask(owner: MemberId, purpose: string, ttlMs = DAY_MS): Task {
    const id = shortId('task');
    const tag = `task:${id}`;
    let stored = 0;
    this.audit.append('task_started', 'fa_agent', '일회용 작업 공간 생성', { task: id, owner });
    return {
      id,
      put: async (label, data) => {
        stored++;
        return this.vault.put(label, data, { ttlMs, tags: [tag, `owner:${owner}`] });
      },
      get: (recordId) => this.vault.getText(recordId),
      finish: (outcome = 'done') => {
        const shredded = this.vault.shredTag(tag, 'task_finished');
        const receipt = toHex(
          sha256(utf8(JSON.stringify({ id, owner, purpose, outcome, stored, at: this.#now() }))),
        ).slice(0, 16);
        this.audit.append('task_finished', 'fa_agent', `작업 종료 · 데이터 ${shredded.length}건 소멸`, { task: id, receipt });
        this.#emit('shredded', `🔥 작업 데이터 ${shredded.length}건 소멸 · 남은 건 영수증 #${receipt.slice(0, 8)} 하나`);
        return receipt;
      },
    };
  }

  // ───────────────────────── internals ─────────────────────────

  async #progress(a: PendingAction): Promise<void> {
    if (a.status !== 'pending' && a.status !== 'held') return;
    const d = a.decision;
    if (d.outcome === 'block') return;
    const ownerOk = !d.ownerApprovalRequired || a.approvals.includes(a.request.owner);
    if (!ownerOk || a.approvals.length < d.approvalsRequired) return;
    if (d.coolingOffMinutes > 0) {
      a.status = 'scheduled';
      a.executeAfter = this.#now() + d.coolingOffMinutes * 60_000;
      this.audit.append('scheduled', 'fa_agent', '지연 실행 예약', { requestId: a.id, executeAfter: a.executeAfter });
      this.#emit(
        'scheduled',
        `⏳ 승인이 모였어요. ${duration(d.coolingOffMinutes)} 뒤에 실행되고, 그 전엔 누구든 취소할 수 있어요.`,
        a.id,
      );
      return;
    }
    await this.#execute(a);
  }

  async #execute(a: PendingAction): Promise<void> {
    const req = a.request;
    const task = this.startTask(req.owner, req.summary ?? req.kind);
    try {
      let sessionSecret: string | undefined;
      if (req.service) {
        sessionSecret = await this.#unlockSession(req.owner, req.service, this.#shares.get(a.id) ?? []);
        await task.put('session_use', `${req.service} 세션 사용`);
      }
      const result = await this.#executor(req, { sessionSecret });
      await task.put('result', result);
      a.result = result;
      a.status = 'executed';
      this.audit.append('executed', 'fa_agent', `${req.kind} 실행`, { requestId: a.id });
      this.#emit('executed', `✅ ${result}`, a.id);
    } catch (e) {
      a.status = 'failed';
      a.result = (e as Error).message;
      this.audit.append('failed', 'fa_agent', `${req.kind} 실패`, { requestId: a.id });
      this.#emit('failed', `❌ 실행하지 못했어요: ${a.result}`, a.id);
    } finally {
      this.#shares.delete(a.id);
      a.receipt = task.finish(a.status);
    }
  }

  async #unlockSession(owner: MemberId, service: string, deviceShares: Share[]): Promise<string> {
    const link = this.#links.get(slotOf(owner, service));
    if (!link) throw new Error(`${this.name(owner)}의 ${serviceLabel(service)} 연결이 없거나 만료됐어요`);
    let serverShare: Share;
    try {
      serverShare = JSON.parse(await this.vault.getText(link.serverShareRecord)) as Share;
    } catch (e) {
      if (e instanceof ShreddedError) throw new Error(`${serviceLabel(service)} 연결 열쇠가 소멸됐어요 (${e.reason})`);
      throw e;
    }
    const deviceShare = deviceShares.find((s) => s.holder !== FA_SERVER && link.holders.includes(s.holder ?? ''));
    if (!deviceShare) throw new Error('가족 폰의 열쇠 조각이 없어요 (3개 중 1개뿐이라 열 수 없음)');
    const key = combine([serverShare, deviceShare]);
    try {
      const sealed = JSON.parse(await this.vault.getText(link.sessionRecord)) as Sealed;
      return await decryptText(key, sealed);
    } finally {
      key.fill(0);
    }
  }

  async #sealEvidence(a: PendingAction): Promise<string> {
    const holders = [...this.#members.keys()];
    const ev = await sealEvidence(
      {
        requestId: a.id,
        requester: a.request.requester,
        owner: a.request.owner,
        kind: a.request.kind,
        summary: a.request.summary,
        amountKRW: a.request.amountKRW,
        payee: a.request.payee,
        text: a.request.text,
        context: a.request.context,
        signals: a.decision.signals,
        at: this.#now(),
      },
      { holders, threshold: 2, reason: a.decision.outcome, now: this.#now() },
    );
    for (const share of ev.shares) if (share.holder) this.#deliverShare(share.holder, evidenceSlot(ev.id), share, false);
    this.#evidence.set(ev.id, { ...ev, shares: [] });
    this.audit.append('evidence_sealed', 'fa_agent', `증거 봉인 ${ev.id}`, { requestId: a.id, commitment: ev.commitment });
    this.#emit('evidence', '🧾 이 시도의 기록을 가족 2-of-3 열쇠로 봉인했어요 (자동 소멸 대상 아님 · 신고할 때 제출용).', a.id);
    return ev.id;
  }

  async #reencryptMemory(oldKey: Uint8Array): Promise<void> {
    const current = this.keys.familyKey();
    for (const m of this.#memory) {
      const plaintext = await decryptText(oldKey, m.sealed);
      m.sealed = await encrypt(current, plaintext, `memory|${this.familyId}`);
    }
  }

  #deliverShare(memberId: string, slot: string, share: Share, strict: boolean): void {
    const device = this.#devices.get(memberId);
    if (device) device.receiveShare(slot, share);
    else if (strict) throw new Error(`${this.name(memberId)} 기기가 등록되지 않았어요 (createDevice 먼저)`);
  }

  #defaultGuardian(owner: MemberId): MemberId {
    const others = [...this.#members.values()].filter((m) => m.id !== owner);
    const pick = others.find((m) => m.role === 'child') ?? others[0];
    if (!pick) throw new Error('no guardian available');
    return pick.id;
  }

  #names(): Record<MemberId, string> {
    return Object.fromEntries([...this.#members.values()].map((m) => [m.id, m.name]));
  }

  #requireMember(id: MemberId): void {
    if (!this.#members.has(id)) throw new Error(`unknown member ${id}`);
  }

  /** Runs the judge with a timeout. Errors, timeouts and malformed verdicts fail closed. */
  async #runJudge(input: JudgeInput): Promise<JudgeVerdict> {
    const judge = this.#judge;
    if (!judge) return failClosedVerdict(input.request.kind, new Error('no judge configured'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const v = await Promise.race([
        judge(input),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`judge timed out after ${this.#judgeTimeoutMs}ms`)), this.#judgeTimeoutMs);
        }),
      ]);
      const valid =
        (v.verdict === 'pass' || v.verdict === 'hold' || v.verdict === 'block') &&
        typeof v.risk === 'number' &&
        Array.isArray(v.reasons) &&
        Array.isArray(v.signals);
      if (!valid) throw new Error('judge returned a malformed verdict');
      return { ...v, risk: clamp01(v.risk), model: typeof v.model === 'string' ? v.model : 'unknown' };
    } catch (error) {
      return failClosedVerdict(input.request.kind, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  #recentLog(limit = 20): JudgeLogEntry[] {
    return this.audit
      .entries()
      .slice(-limit)
      .map(({ ts, type, actor, summary }) => ({ ts, type, actor, summary }));
  }

  #get(requestId: string): PendingAction {
    const a = this.#actions.get(requestId);
    if (!a) throw new Error(`unknown request ${requestId}`);
    return a;
  }

  #emit(type: string, message: string, requestId?: string): void {
    const event: TrustEvent = { type, message, requestId, ts: this.#now() };
    for (const l of this.#listeners) l(event);
  }
}
