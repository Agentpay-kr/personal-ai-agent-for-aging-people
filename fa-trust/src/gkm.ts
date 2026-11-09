/**
 * Hierarchical group key management for one family, adapted from
 * "블록체인 기반 CBDC 아키텍처 및 트랜잭션 키 관리 시스템 설계" (KNOM 2021):
 *   central bank > commercial banks > customers   →   family > members > devices
 *
 * - Every group has a code (i, j, k): level, parent position, own position.
 * - A parent key is f(child keys) where f is one-way (HKDF-SHA256, 32-byte output).
 *   Holding the family key reveals no member key, so it cannot open Mom's VM.
 * - Any membership change (leave, kick, lockdown) bumps the epoch and re-derives the family key,
 *   so a member who left cannot read anything sealed afterwards.
 * - In production f runs under MPC so no single party sees all child keys; here it runs locally.
 */
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { compareBytes, concat, randomBytes, utf8 } from './bytes';

export interface GroupCode {
  level: number;
  parent: number;
  position: number;
}

export const codeString = (c: GroupCode): string => `(${c.level}, ${c.parent}, ${c.position})`;
export const ROOT_CODE: GroupCode = { level: 2, parent: 0, position: 1 };

/** One-way f: child keys (any order) → 32-byte parent key. */
export function f(children: Uint8Array[], info: string): Uint8Array {
  const sorted = [...children].sort(compareBytes);
  return hkdf(sha256, concat(...sorted), undefined, utf8(info), 32);
}

interface MemberNode {
  id: string;
  code: GroupCode;
  deviceKeys: Uint8Array[];
}

export class FamilyKeyTree {
  readonly familyId: string;
  #epoch = 0;
  #nextPosition = 1;
  readonly #members = new Map<string, MemberNode>();

  constructor(familyId: string, initialMembers: string[] = []) {
    this.familyId = familyId;
    for (const id of initialMembers) this.#insert(id, randomBytes(32));
  }

  get epoch(): number {
    return this.#epoch;
  }

  addMember(id: string, deviceKey: Uint8Array = randomBytes(32)): GroupCode {
    const code = this.#insert(id, deviceKey);
    this.#epoch++;
    return code;
  }

  removeMember(id: string): void {
    if (!this.#members.delete(id)) throw new Error(`unknown member ${id}`);
    this.#epoch++;
  }

  /** Re-key without a membership change (used by lockdown). */
  rekey(): void {
    this.#epoch++;
  }

  has(id: string): boolean {
    return this.#members.has(id);
  }

  codeOf(id: string): GroupCode {
    return this.#node(id).code;
  }

  memberKey(id: string): Uint8Array {
    const node = this.#node(id);
    return f(node.deviceKeys, `FA-GK${codeString(node.code)}|${this.familyId}|${id}`);
  }

  /** Root key = f(all member keys) at the current epoch. */
  familyKey(): Uint8Array {
    const children = [...this.#members.keys()].map((id) => this.memberKey(id));
    if (children.length === 0) throw new Error('family has no members');
    return f(children, `FA-GK${codeString(ROOT_CODE)}|${this.familyId}|epoch:${this.#epoch}`);
  }

  /** Key for one owner's scope (e.g. "vm"), derived from that owner's member key, never from the family key. */
  scopeKey(ownerId: string, scope: string): Uint8Array {
    return hkdf(sha256, this.memberKey(ownerId), undefined, utf8(`FA-SCOPE|${scope}`), 32);
  }

  describe(): Array<{ id: string; code: string }> {
    return [
      { id: 'family', code: codeString(ROOT_CODE) },
      ...[...this.#members.values()].map((m) => ({ id: m.id, code: codeString(m.code) })),
    ];
  }

  #insert(id: string, deviceKey: Uint8Array): GroupCode {
    if (this.#members.has(id)) throw new Error(`member ${id} already exists`);
    const code = { level: 1, parent: ROOT_CODE.position, position: this.#nextPosition++ };
    this.#members.set(id, { id, code, deviceKeys: [deviceKey] });
    return code;
  }

  #node(id: string): MemberNode {
    const n = this.#members.get(id);
    if (!n) throw new Error(`unknown member ${id}`);
    return n;
  }
}
