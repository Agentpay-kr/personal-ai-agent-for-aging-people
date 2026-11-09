/** AES-256-GCM through WebCrypto. Callers give every record its own key, so deleting the key destroys the record. */
import { fromHex, fromUtf8, randomBytes, toArrayBuffer, toHex, utf8 } from './bytes';

export interface Sealed {
  iv: string;
  ct: string;
  aad: string;
}

async function importKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== 32) throw new Error('AES-256 key must be 32 bytes');
  return globalThis.crypto.subtle.importKey('raw', toArrayBuffer(key), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export const newKey = (): Uint8Array => randomBytes(32);

export async function encrypt(key: Uint8Array, plaintext: Uint8Array | string, aad = ''): Promise<Sealed> {
  const iv = randomBytes(12);
  const pt = typeof plaintext === 'string' ? utf8(plaintext) : plaintext;
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(utf8(aad)) },
    await importKey(key),
    toArrayBuffer(pt),
  );
  return { iv: toHex(iv), ct: toHex(new Uint8Array(ct)), aad };
}

export async function decrypt(key: Uint8Array, sealed: Sealed): Promise<Uint8Array> {
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromHex(sealed.iv)), additionalData: toArrayBuffer(utf8(sealed.aad)) },
    await importKey(key),
    toArrayBuffer(fromHex(sealed.ct)),
  );
  return new Uint8Array(pt);
}

export async function decryptText(key: Uint8Array, sealed: Sealed): Promise<string> {
  return fromUtf8(await decrypt(key, sealed));
}
