/**
 * Schnorr zero-knowledge proof of knowledge (Fiat–Shamir) on secp256k1.
 *
 * A family member's phone holds a secret x; the family only stores X = x·G.
 * To act, the phone proves "I know x", bound to a context string (who, what, which request),
 * without revealing x. An impostor texting from a new number cannot produce this proof.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToBigInt, concat, fromHex, randomBytes, utf8 } from './bytes';
import type { Share } from './shamir';

const Point = secp256k1.Point;
const G = Point.BASE;
const N = Point.Fn.ORDER;
const DOMAIN = utf8('FA-ZK-SCHNORR-v1');

export interface ZkProof {
  /** Commitment R = r·G (compressed hex). */
  R: string;
  /** Response s = r + c·x mod n (hex). */
  s: string;
}

function randomScalar(): bigint {
  for (;;) {
    const x = bytesToBigInt(randomBytes(32));
    if (x > 0n && x < N) return x;
  }
}

function challenge(publicKey: string, R: string, context: string): bigint {
  return bytesToBigInt(sha256(concat(DOMAIN, fromHex(publicKey), fromHex(R), utf8(context)))) % N;
}

export function generateKeyPair(): { secret: bigint; publicKey: string } {
  const secret = randomScalar();
  return { secret, publicKey: G.multiply(secret).toHex(true) };
}

export function prove(secret: bigint, publicKey: string, context: string): ZkProof {
  const r = randomScalar();
  const R = G.multiply(r).toHex(true);
  const c = challenge(publicKey, R, context);
  return { R, s: ((r + c * secret) % N).toString(16) };
}

/** Checks s·G == R + c·X. Returns false on any malformed input. */
export function verify(publicKey: string, proof: ZkProof, context: string): boolean {
  try {
    const X = Point.fromHex(publicKey);
    const R = Point.fromHex(proof.R);
    const s = BigInt('0x' + proof.s);
    if (s <= 0n || s >= N) return false;
    const c = challenge(publicKey, proof.R, context);
    const rhs = c === 0n ? R : R.add(X.multiply(c));
    return G.multiply(s).equals(rhs);
  } catch {
    return false;
  }
}

/**
 * A family member's phone. In production this lives on the phone (secure enclave / passkey);
 * here it is an object so the demo runs in one process. The secret never leaves it.
 */
export class MemberDevice {
  readonly memberId: string;
  readonly publicKey: string;
  readonly #secret: bigint;
  readonly #shares = new Map<string, Share>();

  constructor(memberId: string) {
    const kp = generateKeyPair();
    this.memberId = memberId;
    this.publicKey = kp.publicKey;
    this.#secret = kp.secret;
  }

  prove(context: string): ZkProof {
    return prove(this.#secret, this.publicKey, context);
  }

  /** Key shares delivered to this phone (e.g. one of 3 pieces of an owner's VM session key). */
  receiveShare(slot: string, share: Share): void {
    this.#shares.set(slot, share);
  }

  shareFor(slot: string): Share | undefined {
    return this.#shares.get(slot);
  }

  dropShare(slot: string): void {
    this.#shares.delete(slot);
  }

  dropAllShares(): void {
    this.#shares.clear();
  }
}
