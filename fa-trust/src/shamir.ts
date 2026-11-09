/**
 * Shamir secret sharing (k-of-n) over the Mersenne prime field 2^521 - 1.
 *
 * Demo stand-in for MPC custody: any k holders can rebuild the key; fewer learn nothing about it.
 * Honest limit: combining rebuilds the key in one place for an instant. Production should use
 * threshold signing (FROST / CGGMP class, audited library) where the key never reassembles.
 */
import { bigIntToBytes, bytesToBigInt, randomBytes } from './bytes';

export const PRIME = (1n << 521n) - 1n;

export interface Share {
  x: number;
  /** Field element, hex. */
  y: string;
  /** Secret length in bytes. */
  len: number;
  threshold: number;
  holder?: string;
}

const mod = (a: bigint): bigint => ((a % PRIME) + PRIME) % PRIME;

function modPow(base: bigint, exp: bigint): bigint {
  let r = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % PRIME;
    b = (b * b) % PRIME;
    e >>= 1n;
  }
  return r;
}

const inverse = (a: bigint): bigint => modPow(a, PRIME - 2n);
const randomFieldElement = (): bigint => mod(bytesToBigInt(randomBytes(80)));

export function split(
  secret: Uint8Array,
  opts: { threshold?: number; shares?: number; holders?: string[] } = {},
): Share[] {
  const n = opts.holders?.length ?? opts.shares ?? 3;
  const k = opts.threshold ?? 2;
  if (k < 2 || k > n) throw new Error(`invalid threshold: ${k}-of-${n}`);
  if (secret.length === 0 || secret.length > 64) throw new Error('secret must be 1..64 bytes');
  const coeffs = [bytesToBigInt(secret)];
  for (let i = 1; i < k; i++) coeffs.push(randomFieldElement());
  const out: Share[] = [];
  for (let x = 1; x <= n; x++) {
    let y = 0n;
    for (let i = coeffs.length - 1; i >= 0; i--) y = mod(y * BigInt(x) + (coeffs[i] ?? 0n));
    out.push({ x, y: y.toString(16), len: secret.length, threshold: k, holder: opts.holders?.[x - 1] });
  }
  return out;
}

export function combine(shares: Share[]): Uint8Array {
  const first = shares[0];
  if (!first) throw new Error('not enough shares: have 0');
  const unique = [...new Map(shares.map((s) => [s.x, s])).values()];
  if (unique.length < first.threshold) {
    throw new Error(`not enough shares: have ${unique.length}, need ${first.threshold}`);
  }
  const use = unique.slice(0, first.threshold);
  let secret = 0n;
  for (const si of use) {
    let num = 1n;
    let den = 1n;
    for (const sj of use) {
      if (sj.x === si.x) continue;
      num = mod(num * BigInt(sj.x));
      den = mod(den * BigInt(sj.x - si.x));
    }
    secret = mod(secret + BigInt('0x' + si.y) * num * inverse(den));
  }
  return bigIntToBytes(secret, first.len);
}
