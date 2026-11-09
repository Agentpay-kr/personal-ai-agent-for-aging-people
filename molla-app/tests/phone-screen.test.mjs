import test from 'node:test';
import assert from 'node:assert/strict';
import { PhoneScreenService } from '../server/phone-screen.mjs';
import { seed } from '../server/domain.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX7sAAAAASUVORK5CYII=', 'base64');
function setup(runner = async () => ({ stdout: png })) {
  const state = seed({ live: true });
  for (const m of state.members) { m.consent = 'active'; m.scopes.push('phone'); }
  const env = { MOLLA_CLOUD_BINDINGS: '{}', MOLLA_PHONE_BINDINGS: JSON.stringify({ mom: { serial: 'mom-device', mode: 'local' }, dad: { serial: 'dad-device', mode: 'local' } }) };
  return { state, service: new PhoneScreenService({ load: () => state, env, runner }) };
}
test('screens use only the authenticated owner binding and return no serial or credentials', async () => {
  const calls = []; const { service } = setup(async (_cmd, args) => { calls.push(args); return { stdout: png }; });
  const frame = await service.capture('mom');
  assert.deepEqual(calls, [['-s', 'mom-device', 'exec-out', 'screencap', '-p']]);
  assert.equal(frame.width, 1); assert.equal(frame.height, 1); assert.equal(frame.dataUrl, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(Object.hasOwn(frame, 'serial'), false);
  await service.capture('dad'); assert.equal(calls[1][1], 'dad-device');
  await assert.rejects(service.capture('son'), { status: 409 }); assert.equal(calls.length, 2);
});
test('consent or phone permission is required before screen access', async () => {
  let count = 0; const { state, service } = setup(async () => { count++; return { stdout: png }; });
  state.members[0].consent = 'revoked'; await assert.rejects(service.capture('mom'), { status: 403 });
  state.members[0].consent = 'active'; state.members[0].scopes = []; await assert.rejects(service.capture('mom'), { status: 403 });
  assert.equal(count, 0);
});
test('a frame is discarded if consent is revoked while capture is running', async () => {
  const { state, service } = setup(async () => { state.members[0].consent = 'revoked'; return { stdout: png }; });
  await assert.rejects(service.capture('mom'), { status: 403 });
});
test('identity is checked again after capture; rejected frames cannot leak', async () => {
  const { service } = setup(); let count = 0;
  await assert.rejects(service.capture('mom', () => { if (++count === 2) throw new Error('identity-revoked'); }), error => !error.message.includes('identity-revoked') && error.status === 502);
  assert.equal(count, 2);
});
test('overlapping requests and immediate repeats are rate limited', async () => {
  let finish; const { service } = setup(() => new Promise(resolve => { finish = resolve; }));
  const pending = service.capture('mom'); await assert.rejects(service.capture('mom'), { status: 429 });
  finish({ stdout: png }); await pending; await assert.rejects(service.capture('mom'), { status: 429 });
});
test('invalid screenshots and raw ADB error details are not returned', async () => {
  await assert.rejects(setup(async () => ({ stdout: Buffer.from('sensitive-device-output') })).service.capture('mom'), { status: 502 });
  await assert.rejects(setup(async () => { throw new Error('private-device-credential'); }).service.capture('mom'), error => error.status === 502 && !error.message.includes('private-device-credential'));
});
