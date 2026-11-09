// Owner proof for decisions that a router (LLM) must not be able to make on its own.
//
// `ownerConfirmed: true` is only a statement of intent. Approval, turning consent on,
// widening permission scopes, sharing a memory and adding an SMS recipient also need
// proof that the owner decided, through one of two channels the router does not control:
//
//   1. Interactive terminal: a person runs the command directly in a TTY and types back
//      a one-time code shown on screen (piped/router invocations have no TTY).
//   2. Host owner token: the host app (for example the owner's own phone UI) holds
//      MOLLA_OWNER_KEY and mints a short-lived HMAC token bound to exactly one actor,
//      operation and subject (for approvals: task id + action hash). The router never
//      receives the key; the skill launcher strips it from the environment.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { CliError } from './errors.mjs';

export const OWNER_TOKEN_TTL_MS = 5 * 60 * 1000;
const MIN_KEY_LENGTH = 32;

// Which operations need owner proof, and the exact subject the proof is bound to.
// Returns null when this call does not need proof (e.g. reject/cancel, revoking consent).
export function ownerSubject(operation, args) {
  switch (operation) {
    case 'task.decide': return args.decision === 'approve' ? `task:${args.id}:${args.expectedActionHash ?? ''}` : null;
    case 'consent.set': return args.value === 'active' ? 'consent:active' : null; // revoking is always allowed
    case 'permission.set': return `scopes:${[...new Set(String(args.scopes).split(',').map((v) => v.trim()))].sort().join(',')}`;
    case 'memory.share': return `memory-share:${args.id}:${args.grantee}`;
    case 'contact.add': return `contact:${args.name}:${args.relation}:${args.phone}`;
    default: return null;
  }
}

function ownerKey(env) {
  const key = env.MOLLA_OWNER_KEY;
  return typeof key === 'string' && key.length >= MIN_KEY_LENGTH ? key : null;
}

const mac = (key, payload) => createHmac('sha256', key).update(payload).digest('hex');
const canonical = ({ actor, operation, subject, expiresAt }) => ['molla-owner-v1', actor, operation, subject, String(expiresAt)].join('\n');

export function mintOwnerToken(env, { actor, operation, subject, now = Date.now() }) {
  const key = ownerKey(env);
  if (!key) throw new CliError(`MOLLA_OWNER_KEY (${MIN_KEY_LENGTH}+ chars) is required to mint owner tokens.`, 'OWNER_KEY_REQUIRED', 2);
  const expiresAt = now + OWNER_TOKEN_TTL_MS;
  return `${expiresAt}.${mac(key, canonical({ actor, operation, subject, expiresAt }))}`;
}

export function verifyOwnerToken(env, token, { actor, operation, subject, now = Date.now() }) {
  const key = ownerKey(env);
  if (!key || typeof token !== 'string') return false;
  const m = /^(\d{13})\.([a-f0-9]{64})$/.exec(token);
  if (!m) return false;
  const expiresAt = Number(m[1]);
  if (expiresAt <= now || expiresAt > now + OWNER_TOKEN_TTL_MS) return false;
  const expected = Buffer.from(mac(key, canonical({ actor, operation, subject, expiresAt })), 'hex');
  const given = Buffer.from(m[2], 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function confirmOnTerminal({ summary, io }) {
  const code = String(randomInt(1000, 10000));
  io.output.write(`\n[Molla] 주인 확인이 필요해요.\n${summary}\n승인하려면 이 코드를 입력하세요: ${code}\n> `);
  const rl = createInterface({ input: io.input, output: io.output, terminal: true });
  try {
    const answer = (await rl.question('')).trim();
    return answer === code;
  } finally {
    rl.close();
  }
}

// Throws unless the owner proved this exact decision.
export async function requireOwnerProof({ operation, args, actor, summary, env = process.env, io = defaultIo() }) {
  const subject = ownerSubject(operation, args);
  if (!subject) return;
  if (args.ownerToken !== undefined) {
    if (verifyOwnerToken(env, args.ownerToken, { actor, operation, subject })) return;
    throw new CliError('Owner token is invalid, expired, or for a different action. Ask the owner to confirm again.', 'OWNER_CONFIRMATION_REQUIRED', 4);
  }
  if (io.interactive && (await confirmOnTerminal({ summary, io }))) return;
  throw new CliError(
    'This decision needs the owner: run it in the owner\'s terminal, or pass an ownerToken minted by the owner\'s app. A router cannot confirm on the owner\'s behalf.',
    'OWNER_CONFIRMATION_REQUIRED',
    4,
  );
}

export function defaultIo() {
  return { input: process.stdin, output: process.stderr, interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY) };
}
