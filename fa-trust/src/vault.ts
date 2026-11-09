/**
 * Crypto-shredding vault. Every record is sealed under its own AES key with an optional TTL.
 * Deleting the key destroys the record: the ciphertext (and any backup of it) becomes noise.
 */
import { decrypt, encrypt, newKey, type Sealed } from './aead';
import { fromUtf8, shortId } from './bytes';

export class ShreddedError extends Error {
  readonly recordId: string;
  readonly reason: string;

  constructor(recordId: string, reason: string) {
    super(`record ${recordId} was shredded (${reason})`);
    this.name = 'ShreddedError';
    this.recordId = recordId;
    this.reason = reason;
  }
}

export interface RecordInfo {
  id: string;
  label: string;
  tags: string[];
  createdAt: number;
  expiresAt: number | null;
  shredded: boolean;
  shredReason?: string;
  remainingMs: number | null;
}

interface StoredRecord {
  id: string;
  label: string;
  tags: string[];
  sealed: Sealed;
  createdAt: number;
  expiresAt: number | null;
  shredReason?: string;
}

export class ShredVault {
  readonly #keys = new Map<string, Uint8Array>();
  readonly #records = new Map<string, StoredRecord>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async put(
    label: string,
    data: string | Uint8Array,
    opts: { ttlMs?: number | null; tags?: string[] } = {},
  ): Promise<string> {
    const id = shortId('rec');
    const key = newKey();
    const sealed = await encrypt(key, data, id);
    const createdAt = this.#now();
    const expiresAt = opts.ttlMs == null ? null : createdAt + opts.ttlMs;
    this.#keys.set(id, key);
    this.#records.set(id, { id, label, tags: opts.tags ?? [], sealed, createdAt, expiresAt });
    return id;
  }

  async get(id: string): Promise<Uint8Array> {
    this.sweep();
    const rec = this.#records.get(id);
    if (!rec) throw new Error(`unknown record ${id}`);
    const key = this.#keys.get(id);
    if (!key) throw new ShreddedError(id, rec.shredReason ?? 'shredded');
    return decrypt(key, rec.sealed);
  }

  async getText(id: string): Promise<string> {
    return fromUtf8(await this.get(id));
  }

  /** Destroy the key. Returns false if it was already gone. */
  shred(id: string, reason = 'manual'): boolean {
    const key = this.#keys.get(id);
    if (!key) return false;
    key.fill(0);
    this.#keys.delete(id);
    const rec = this.#records.get(id);
    if (rec) rec.shredReason = reason;
    return true;
  }

  shredWhere(pred: (info: RecordInfo) => boolean, reason: string): string[] {
    return this.list()
      .filter((r) => !r.shredded && pred(r))
      .filter((r) => this.shred(r.id, reason))
      .map((r) => r.id);
  }

  shredTag(tag: string, reason: string): string[] {
    return this.shredWhere((r) => r.tags.includes(tag), reason);
  }

  /** Shred everything whose TTL has passed. Runs before every read; call it on a timer too. */
  sweep(): string[] {
    const now = this.#now();
    return this.shredWhere((r) => r.expiresAt !== null && r.expiresAt <= now, 'ttl_expired');
  }

  /** The ciphertext stays after shredding. It is just undecryptable. */
  ciphertext(id: string): Sealed | undefined {
    return this.#records.get(id)?.sealed;
  }

  info(id: string): RecordInfo | undefined {
    return this.list().find((r) => r.id === id);
  }

  list(): RecordInfo[] {
    const now = this.#now();
    return [...this.#records.values()].map((r) => ({
      id: r.id,
      label: r.label,
      tags: [...r.tags],
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      shredded: !this.#keys.has(r.id),
      shredReason: r.shredReason,
      remainingMs: r.expiresAt === null ? null : Math.max(0, r.expiresAt - now),
    }));
  }
}
