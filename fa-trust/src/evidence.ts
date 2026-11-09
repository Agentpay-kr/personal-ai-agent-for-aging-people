/**
 * Evidence sealing. Routine data self-destructs, but evidence of an abuse attempt must NOT:
 * otherwise a criminal who hijacked the agent could use self-destruct to erase their tracks.
 * Evidence is encrypted under a fresh key split k-of-n across family members, and its hash goes
 * into the audit chain so later tampering is detectable.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { decryptText, encrypt, newKey, type Sealed } from './aead';
import { shortId, toHex, utf8 } from './bytes';
import { combine, split, type Share } from './shamir';

export interface SealedEvidence {
  id: string;
  reason: string;
  createdAt: number;
  sealed: Sealed;
  /** SHA-256 of the plaintext bundle. */
  commitment: string;
  /** Handed to the holders right after sealing. The agent keeps none. */
  shares: Share[];
}

export async function sealEvidence(
  bundle: unknown,
  opts: { holders: string[]; threshold?: number; reason: string; now?: number },
): Promise<SealedEvidence> {
  const id = shortId('ev');
  const plaintext = JSON.stringify(bundle);
  const key = newKey();
  const sealed = await encrypt(key, plaintext, id);
  const shares = split(key, { holders: opts.holders, threshold: opts.threshold ?? 2 });
  key.fill(0);
  return {
    id,
    reason: opts.reason,
    createdAt: opts.now ?? Date.now(),
    sealed,
    commitment: toHex(sha256(utf8(plaintext))),
    shares,
  };
}

export async function openEvidence(ev: SealedEvidence, shares: Share[]): Promise<unknown> {
  const key = combine(shares);
  try {
    const plaintext = await decryptText(key, ev.sealed);
    if (toHex(sha256(utf8(plaintext))) !== ev.commitment) throw new Error('evidence commitment mismatch');
    return JSON.parse(plaintext);
  } finally {
    key.fill(0);
  }
}
