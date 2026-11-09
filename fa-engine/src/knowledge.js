// Family knowledge graph: a projection of the ontology event log into facts
// (subject, predicate, object) with provenance, owner, visibility and versions.
//
// Rules (docs/family-ontology-plan.md):
//   - A fact's owner is the account owner the event was on behalf of.
//   - The owner sees all their facts. Facts from actions are also visible to the requester
//     and to family with a "read" delegation. Statements are private unless shared.
//   - Facts are never permissions. policy.js does not read this graph.
//   - Correcting or forgetting a memory also redacts the old wording from the event log.

import { onRecord, record, redact } from './ontology.js';
import { evaluate } from './policy.js';
import { seedFamily, nameOf, polish } from './family.js';
import { remember, logDecision } from './memory.js';

export class KnowledgeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const NAMES = seedFamily(); // names only, for the Markdown export
const N = (id) => nameOf(NAMES, id);
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

let facts = new Map();
let nextFact = 0;

export function resetKnowledge() {
  facts = new Map();
  nextFact = 0;
}

const activeByKey = (key) => [...facts.values()].find((f) => f.key === key && f.status === 'active');

function assertFact(e, { key, p, o, label, audience, kind, sharedWith = [], version = 1 }) {
  const owner = e.onBehalfOf;
  const f = {
    id: `fact_${(nextFact += 1)}`,
    key,
    s: `person/${owner}`,
    p,
    o,
    label,
    owner,
    requester: e.payload?.requester ?? e.actor,
    audience, // 'family' (from an action) or 'private' (a statement)
    sharedWith: [...sharedWith],
    source: { kind, event: e.id },
    sources: [e.id],
    status: 'active',
    version,
    seq: e.seq,
    validFrom: new Date(e.ts).toISOString(),
  };
  facts.set(f.id, f);
  remember(N(owner), `${polish(`${label}`)} — ${labelOf(p)}${f.requester !== owner ? ` (요청: ${N(f.requester)})` : ''}`);
  return f;
}

function supersede(key) {
  const f = activeByKey(key);
  if (f) f.status = 'superseded';
  return f;
}

function redactKey(key) {
  for (const f of facts.values()) if (f.key === key) f.sources.forEach(redact);
}

const labelOf = (p) => ({
  'fa:subscribes': '구독 중',
  'fa:cancelled': '해지함',
  'fa:ordered': '주문함',
  'fa:sentMoneyTo': '송금함',
  'fa:hasAccount': '연결된 계정',
  'fa:said': '본인이 남긴 기억',
}[p] ?? p);

function projectAction(e) {
  const { action, subscriptions = [], cancelled = [], order, transfer } = e.payload;
  const owner = e.onBehalfOf;
  const fam = { audience: 'family', kind: 'vm_observation' };
  if (action === 'scan_subscriptions') {
    for (const s of subscriptions) {
      const key = `${owner}:subscribes:${s.id}`;
      if (s.status !== 'active') { supersede(key); continue; }
      if (!activeByKey(key)) assertFact(e, { ...fam, key, p: 'fa:subscribes', o: `service/${s.id}`, label: s.name });
    }
  } else if (action === 'cancel_subscription') {
    for (const s of cancelled) {
      supersede(`${owner}:subscribes:${s.id}`);
      assertFact(e, { ...fam, key: `${e.id}:cancelled:${s.id}`, p: 'fa:cancelled', o: `service/${s.id}`, label: s.name });
    }
  } else if (action === 'order_item' && order) {
    assertFact(e, { ...fam, key: `${e.id}:ordered`, p: 'fa:ordered', o: `item/${order.item}`, label: `${order.item} (${won(order.price)})` });
  } else if (action === 'transfer_money' && transfer) {
    assertFact(e, { ...fam, key: `${e.id}:sent`, p: 'fa:sentMoneyTo', o: `person/${transfer.to}`, label: `${N(transfer.to)} ${won(transfer.amount)}` });
  }
}

function project(e) {
  const p = e.payload;
  switch (e.type) {
    case 'fa:ActionExecuted':
      return projectAction(e);
    case 'fa:AccountLinked': {
      const key = `${e.onBehalfOf}:hasAccount:${p.service}`;
      if (!activeByKey(key)) assertFact(e, { key, p: 'fa:hasAccount', o: `service/${p.service}`, label: p.serviceLabel ?? p.service, audience: 'family', kind: 'vm_observation' });
      return;
    }
    case 'fa:FactStated':
      assertFact(e, { key: `memory:${p.memoryId}`, p: 'fa:said', o: 'text', label: p.text, audience: 'private', kind: 'user_statement' });
      return;
    case 'fa:FactCorrected': {
      const key = `memory:${p.memoryId}`;
      const prev = supersede(key);
      redactKey(key);
      assertFact(e, {
        key, p: 'fa:said', o: 'text', label: p.text, audience: 'private', kind: 'user_correction',
        sharedWith: prev?.sharedWith ?? [], version: (prev?.version ?? 0) + 1,
      });
      return;
    }
    case 'fa:FactRetracted':
      for (const f of facts.values()) if (f.key === p.key && f.status === 'active') f.status = 'retracted';
      redactKey(p.key);
      return;
    case 'fa:FactShared':
    case 'fa:FactUnshared': {
      const f = activeByKey(`memory:${p.memoryId}`);
      if (!f) return;
      f.sharedWith = f.sharedWith.filter((g) => g !== p.grantee);
      if (e.type === 'fa:FactShared') f.sharedWith.push(p.grantee);
      return;
    }
    case 'fa:PolicyDecided':
      logDecision(`${p.source === 'molla' ? '[Molla] ' : ''}${N(e.actor)} → ${p.actionLabel ?? p.action} @ ${N(e.onBehalfOf)} 계정: ${p.decision}${p.reason ? ` — ${p.reason}` : ''}`);
      return;
    case 'fa:VoteCast':
      logDecision(`${p.source === 'molla' ? '[Molla] ' : ''}${N(e.actor)} ${p.vote} → ${p.requestId} → ${p.state}`);
      return;
    case 'fa:TaskPrepared':
      remember(N(e.onBehalfOf), `[Molla] ${p.text ?? p.taskId} → 초안 준비 (요청: ${N(e.actor)})`);
      return;
    case 'fa:ConsentChanged':
      logDecision(`[Molla] ${N(e.actor)} consent → ${p.value}`);
      return;
    default:
  }
}

onRecord(project);

function canSee(f, viewer, family) {
  if (viewer === f.owner) return true;
  if (f.sharedWith.includes(viewer)) return true;
  if (f.audience !== 'family') return false;
  if (family.consent?.[f.owner] === 'revoked') return false;
  if (viewer === f.requester) return true;
  return evaluate(family, { requester: viewer, owner: f.owner, action: 'scan_subscriptions' }).decision === 'allow';
}

const view = ({ sources, ...f }) => ({ ...f, predicateLabel: labelOf(f.p) });

/** Active facts the viewer may see, oldest first. */
export function factsFor(viewer, family, { owner } = {}) {
  return [...facts.values()]
    .filter((f) => f.status === 'active' && (!owner || f.owner === owner) && canSee(f, viewer, family))
    .sort((a, b) => a.seq - b.seq)
    .map(view);
}

/** The owner forgets a fact. Memories are forgotten through Molla's memory delete. */
export function retract(actor, factId) {
  const f = facts.get(factId);
  if (!f || f.status !== 'active') throw new KnowledgeError(404, '사실을 찾을 수 없어요');
  if (f.owner !== actor) throw new KnowledgeError(403, polish(`${N(f.owner)}님만 이 기억을 지울 수 있어요`));
  if (f.key.startsWith('memory:')) throw new KnowledgeError(409, '직접 남긴 기억은 기억 삭제로 지워 주세요');
  record('fa:FactRetracted', { actor, onBehalfOf: f.owner, payload: { key: f.key } });
  return { retracted: f.id };
}
