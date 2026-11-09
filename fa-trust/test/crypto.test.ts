import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptText, encrypt, newKey } from '../src/aead';
import { AuditLog } from '../src/audit';
import { randomBytes, toHex } from '../src/bytes';
import { openEvidence, sealEvidence } from '../src/evidence';
import { FamilyKeyTree } from '../src/gkm';
import { combine, split } from '../src/shamir';
import { ShreddedError, ShredVault } from '../src/vault';
import { MemberDevice, generateKeyPair, prove, verify } from '../src/zk';

test('shamir: any 2 of 3 shares rebuild the key, 1 share does not', () => {
  const key = randomBytes(32);
  const shares = split(key, { holders: ['mom', 'fa_server', 'son'] });
  for (const [i, j] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    assert.equal(toHex(combine([shares[i]!, shares[j]!])), toHex(key));
  }
  assert.throws(() => combine([shares[1]!]), /not enough shares/);
  assert.throws(() => combine([shares[1]!, shares[1]!]), /not enough shares/);
});

test('shamir: 3-of-5 works and keeps leading zero bytes', () => {
  const key = new Uint8Array(32);
  key[31] = 7;
  const shares = split(key, { shares: 5, threshold: 3 });
  assert.equal(toHex(combine([shares[4]!, shares[0]!, shares[2]!])), toHex(key));
  assert.throws(() => combine([shares[0]!, shares[1]!]), /need 3/);
});

test('aes-gcm: round trip; wrong key or wrong aad fails', async () => {
  const key = newKey();
  const sealed = await encrypt(key, '엄마 넷플릭스 세션', 'slot-1');
  assert.equal(await decryptText(key, sealed), '엄마 넷플릭스 세션');
  await assert.rejects(decryptText(newKey(), sealed));
  await assert.rejects(decryptText(key, { ...sealed, aad: 'slot-2' }));
});

test('zk: valid proof verifies; wrong context, wrong key, tampered response fail', () => {
  const kp = generateKeyPair();
  const proof = prove(kp.secret, kp.publicKey, 'fam|son|approve|req_1');
  assert.equal(verify(kp.publicKey, proof, 'fam|son|approve|req_1'), true);
  assert.equal(verify(kp.publicKey, proof, 'fam|son|approve|req_2'), false);
  assert.equal(verify(generateKeyPair().publicKey, proof, 'fam|son|approve|req_1'), false);
  const s = (BigInt('0x' + proof.s) + 1n).toString(16);
  assert.equal(verify(kp.publicKey, { ...proof, s }, 'fam|son|approve|req_1'), false);
  assert.equal(verify(kp.publicKey, { R: 'zz', s: proof.s }, 'x'), false);
});

test('zk: an impostor phone for the same member cannot prove', () => {
  const real = new MemberDevice('son');
  const fake = new MemberDevice('son');
  assert.equal(verify(real.publicKey, fake.prove('ctx'), 'ctx'), false);
  assert.equal(verify(real.publicKey, real.prove('ctx'), 'ctx'), true);
});

test('gkm: leaving re-keys the family; the old key cannot read new data; member keys stay stable', async () => {
  const tree = new FamilyKeyTree('fam', ['mom', 'dad', 'son']);
  assert.deepEqual(
    tree.describe().map((m) => m.code),
    ['(2, 0, 1)', '(1, 1, 1)', '(1, 1, 2)', '(1, 1, 3)'],
  );
  const before = tree.familyKey();
  const momKey = tree.memberKey('mom');
  tree.removeMember('dad');
  const after = tree.familyKey();
  assert.notEqual(toHex(before), toHex(after));
  await assert.rejects(decryptText(before, await encrypt(after, 'note after dad left')));
  assert.equal(toHex(tree.memberKey('mom')), toHex(momKey));
  assert.notEqual(toHex(tree.scopeKey('mom', 'vm')), toHex(after));
  tree.rekey();
  assert.notEqual(toHex(tree.familyKey()), toHex(after));
});

test('vault: TTL shreds the key; ciphertext stays but is useless', async () => {
  let now = 0;
  const vault = new ShredVault(() => now);
  const id = await vault.put('subscriptions', 'netflix 17,000원', { ttlMs: 1000, tags: ['task:1'] });
  assert.equal(await vault.getText(id), 'netflix 17,000원');
  now = 1001;
  await assert.rejects(vault.getText(id), ShreddedError);
  assert.ok(vault.ciphertext(id));
  assert.equal(vault.info(id)?.shredReason, 'ttl_expired');
});

test('vault: shredTag destroys only matching records', async () => {
  const vault = new ShredVault();
  const a = await vault.put('a', '1', { tags: ['task:x'] });
  const b = await vault.put('b', '2', { tags: ['task:y'] });
  assert.deepEqual(vault.shredTag('task:x', 'done'), [a]);
  await assert.rejects(vault.getText(a), ShreddedError);
  assert.equal(await vault.getText(b), '2');
});

test('audit: hash chain verifies and detects tampering', () => {
  const log = new AuditLog(() => 1);
  log.append('request', 'son', '구독 해지');
  log.append('approval', 'mom', '승인');
  log.append('executed', 'fa_agent', '실행');
  assert.equal(log.verify().ok, true);
  const copy = log.entries().map((e) => ({ ...e }));
  copy[1]!.summary = '조작';
  assert.deepEqual(log.verify(copy), { ok: false, brokenAt: 1 });
});

test('evidence: needs 2 of 3 shares and checks the commitment', async () => {
  const ev = await sealEvidence({ text: '안전계좌로 옮기래' }, { holders: ['mom', 'dad', 'son'], reason: 'hold' });
  await assert.rejects(openEvidence(ev, [ev.shares[0]!]), /not enough shares/);
  assert.deepEqual(await openEvidence(ev, [ev.shares[0]!, ev.shares[2]!]), { text: '안전계좌로 옮기래' });
  await assert.rejects(openEvidence({ ...ev, commitment: '00' }, [ev.shares[0]!, ev.shares[1]!]), /commitment/);
});
