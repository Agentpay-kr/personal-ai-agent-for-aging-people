// Family ontology: the vocabulary (classes, predicates, event types) and the
// hash-chained domain event log that every projection reads from.
//
// The log is append-only. Each event's hash covers the previous hash, the envelope
// and a hash of the payload, so a payload can be redacted later (a forgotten memory)
// without breaking verifyChain(). Plan and review: docs/family-ontology-plan.md

import { createHash, randomUUID } from 'node:crypto';

export const SCHEMA = 'fa-ontology@1';
export const GENESIS = '0'.repeat(64);

export const CLASSES = Object.freeze([
  'Person', 'Family', 'Room', 'VM', 'Account', 'Service', 'Subscription', 'Order', 'Transfer',
  'Delegation', 'Request', 'Approval', 'Event', 'Fact',
]);

export const PREDICATES = Object.freeze({
  'fa:subscribes': { label: '구독 중' },
  'fa:cancelled': { label: '해지함' },
  'fa:ordered': { label: '주문함' },
  'fa:sentMoneyTo': { label: '송금함' },
  'fa:hasAccount': { label: '연결된 계정' },
  'fa:said': { label: '본인이 남긴 기억' },
});

// Event type -> payload fields that must be present.
export const EVENT_TYPES = Object.freeze({
  'fa:PolicyDecided': ['action', 'decision'],
  'fa:VoteCast': ['requestId', 'vote', 'state'],
  'fa:ActionExecuted': ['action', 'requester'],
  'fa:AccountLinked': ['service'],
  'fa:TaskPrepared': ['taskId'],
  'fa:ConsentChanged': ['value'],
  'fa:FactStated': ['memoryId', 'text'],
  'fa:FactCorrected': ['memoryId', 'text'],
  'fa:FactRetracted': ['key'],
  'fa:FactShared': ['memoryId', 'grantee'],
  'fa:FactUnshared': ['memoryId', 'grantee'],
});

let log = [];
let projectorErrors = 0;
const listeners = new Set();

// JSON with sorted keys, so the same value always hashes the same.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const envelopeOf = (e) => ({
  seq: e.seq, id: e.id, type: e.type, actor: e.actor, onBehalfOf: e.onBehalfOf,
  roomId: e.roomId, causedBy: e.causedBy, ts: e.ts, schema: e.schema,
});
const hashOf = (e) => sha256(e.prevHash + canonical(envelopeOf(e)) + e.payloadHash);

function validate(type, { actor, payload }) {
  const required = EVENT_TYPES[type];
  if (!required) throw new TypeError(`unknown event type: ${type}`);
  if (typeof actor !== 'string' || !actor) throw new TypeError(`${type}: actor is required`);
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError(`${type}: payload must be an object`);
  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null) throw new TypeError(`${type}: payload.${field} is required`);
  }
}

/**
 * Append a domain event. A malformed event is a code bug and throws.
 * Projector errors are caught and counted so a finished action still reports its result.
 */
export function record(type, { actor, onBehalfOf = null, roomId = null, causedBy = null, payload = {} } = {}) {
  validate(type, { actor, payload });
  const body = JSON.parse(JSON.stringify(payload));
  const e = {
    seq: log.length,
    id: `ev_${randomUUID().slice(0, 12)}`,
    type,
    actor,
    onBehalfOf: onBehalfOf ?? actor,
    roomId,
    causedBy,
    ts: Date.now(),
    schema: SCHEMA,
    payload: body,
    payloadHash: sha256(canonical(body)),
    prevHash: log.length ? log[log.length - 1].hash : GENESIS,
    redacted: false,
  };
  e.hash = hashOf(e);
  log.push(e);
  for (const fn of listeners) {
    try {
      fn(structuredClone(e));
    } catch (err) {
      projectorErrors += 1;
      console.error(`[ontology] projector failed on ${type}:`, err.message);
    }
  }
  return structuredClone(e);
}

/** Subscribe a projector. Returns an unsubscribe function. */
export function onRecord(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Drop an event's payload (it was forgotten). The chain still verifies via payloadHash. */
export function redact(eventId) {
  const e = log.find((x) => x.id === eventId);
  if (!e || e.redacted) return false;
  e.payload = null;
  e.redacted = true;
  return true;
}

export function verifyChain() {
  let prev = GENESIS;
  for (const e of log) {
    const payloadOk = e.redacted ? e.payload === null : sha256(canonical(e.payload)) === e.payloadHash;
    if (!payloadOk || e.prevHash !== prev || hashOf(e) !== e.hash) {
      return { ok: false, brokenAt: e.seq, length: log.length, projectorErrors };
    }
    prev = e.hash;
  }
  return { ok: true, brokenAt: null, length: log.length, projectorErrors };
}

export const events = () => structuredClone(log);

export function resetOntology() {
  log = [];
  projectorErrors = 0;
}

// Tests only: simulate someone editing the stored log.
export function _tamperForTest(seq, mutate) {
  mutate(log[seq]);
}
