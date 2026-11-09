/** Tamper-evident audit log: each entry commits to the previous one (SHA-256 hash chain). Keep PII out of summaries. */
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex, utf8 } from './bytes';

export interface AuditEntry {
  seq: number;
  ts: number;
  type: string;
  actor: string;
  summary: string;
  data: unknown;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

const hashEntry = (e: Omit<AuditEntry, 'hash'>): string =>
  toHex(sha256(utf8(JSON.stringify([e.seq, e.ts, e.type, e.actor, e.summary, e.data, e.prevHash]))));

export class AuditLog {
  readonly #entries: AuditEntry[] = [];
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  append(type: string, actor: string, summary: string, data: unknown = null): AuditEntry {
    const prevHash = this.#entries.at(-1)?.hash ?? GENESIS;
    const base = { seq: this.#entries.length, ts: this.#now(), type, actor, summary, data, prevHash };
    const entry: AuditEntry = { ...base, hash: hashEntry(base) };
    this.#entries.push(entry);
    return entry;
  }

  entries(): readonly AuditEntry[] {
    return this.#entries;
  }

  head(): string {
    return this.#entries.at(-1)?.hash ?? GENESIS;
  }

  /** Recompute the chain. Pass a copy (e.g. an exported log) to check it independently. */
  verify(entries: readonly AuditEntry[] = this.#entries): { ok: boolean; brokenAt?: number } {
    const broken = this.brokenEntries(entries);
    return broken.length === 0 ? { ok: true } : { ok: false, brokenAt: broken[0] };
  }

  /** Every entry whose hash or back-link doesn't check out. Each tampered entry shows up on its own. */
  brokenEntries(entries: readonly AuditEntry[] = this.#entries): number[] {
    const broken: number[] = [];
    let prev = GENESIS;
    for (const e of entries) {
      if (e.prevHash !== prev || hashEntry(e) !== e.hash) broken.push(e.seq);
      prev = e.hash;
    }
    return broken;
  }
}
