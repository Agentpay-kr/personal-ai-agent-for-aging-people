import test from 'node:test';
import assert from 'node:assert/strict';
import { CompatibleProvider } from '../src/provider.mjs';
import { AndroidExecutor, parseScreen } from '../src/android.mjs';
import { phoneBinding } from '../src/core.mjs';

const modelEnv = { MOLLA_LLM_ENABLED: '1', MOLLA_LLM_BASE_URL: 'https://provider.example/v1', MOLLA_LLM_API_KEY: 'SECRET_TEST_KEY', MOLLA_LLM_MODEL: 'test' };
test('compatible adapter uses structured tool API, no redirects/retries; malformed/parallel/refused outputs fail closed', async () => {
  let options, calls = 0;
  const good = { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'one', type: 'function', function: { name: 'respond', arguments: '{"text":"안녕"}' } }] } }] };
  const provider = new CompatibleProvider({ env: modelEnv, fetcher: async (url, opts) => { assert.equal(url, 'https://provider.example/v1/chat/completions'); options = opts; calls++; return new Response(JSON.stringify(good)); } });
  await provider.complete({ messages: [], tools: [], signal: AbortSignal.timeout(500) });
  assert.equal(options.redirect, 'error'); assert.equal(JSON.parse(options.body).tool_choice, 'required'); assert.equal(calls, 1);
  for (const result of [{ choices: [{ finish_reason: 'length', message: {} }] }, { choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [...good.choices[0].message.tool_calls, ...good.choices[0].message.tool_calls] } }] }, { choices: [{ finish_reason: 'tool_calls', message: { refusal: 'no', tool_calls: good.choices[0].message.tool_calls } }] }]) {
    await assert.rejects(new CompatibleProvider({ env: modelEnv, fetcher: async () => new Response(JSON.stringify(result)) }).complete({ messages: [], tools: [] }), { status: 502 });
  }
  await assert.rejects(new CompatibleProvider({ env: modelEnv, fetcher: async () => { throw new Error('SECRET_TEST_KEY provider diagnostics'); } }).complete({ messages: [], tools: [] }), e => e.status === 502 && !e.message.includes('SECRET'));
});

const screen = (label = 'Search', extra = '') => `<?xml version="1.0"?><hierarchy><node resource-id="com.android.settings:id/search_action_bar" text="${label}" package="com.android.settings" enabled="true" clickable="true" bounds="[0,0][200,80]" ${extra}/><node resource-id="dangerous:id/pay" text="Pay" package="com.android.settings" enabled="true" clickable="true" bounds="[0,80][200,160]"/></hierarchy>`;
test('UI parser exposes only fixed safe controls and refuses password/OTP entities', () => {
  const parsed = parseScreen(screen(), 'com.android.settings'); assert.deepEqual(parsed.nodes[0].actions, ['tap']); assert.deepEqual(parsed.nodes[1].actions, []);
  assert.throws(() => parseScreen(screen('Code', 'password="true"'), 'com.android.settings'), { status: 403 });
  assert.throws(() => parseScreen('<!DOCTYPE x>' + screen(), 'com.android.settings'), { status: 502 });
  assert.equal(parseScreen(screen(), 'com.bank.app').nodes.some(n => n.actions.length), false);
});
test('navigation rechecks screen hash and fixed resource IDs; approved tap requires observed screen change', async () => {
  const env = { MOLLA_ALLOW_ANDROID_UI: '1', MOLLA_PHONE_BINDINGS: '{"mom":{"serial":"test-device","mode":"local"}}' }, device = phoneBinding('mom', env);
  let taps = 0, changed = false;
  const runner = async (_, args) => {
    const cmd = args.at(-1);
    if (cmd.startsWith('input tap')) { taps++; changed = true; return { stdout: '' }; }
    if (cmd === 'dumpsys activity activities') return { stdout: 'mResumedActivity: ActivityRecord{1 u0 com.android.settings/.Settings t1}' };
    return { stdout: cmd.startsWith('cat ') ? screen(changed ? 'Search opened' : 'Search') : '' };
  };
  const before = parseScreen(screen(), 'com.android.settings'), action = { type: 'navigation.step', execution: 'android-navigation', device, navigation: { operation: 'tap', text: '', node: before.nodes[0], screenHash: before.screenHash, inspectedAt: before.capturedAt } };
  const executor = new AndroidExecutor('mom', { getEnv: () => env, runner });
  assert.equal((await executor.execute(action, { authorize: () => {} })).kind, 'navigation_completed'); assert.equal(taps, 1);
  await assert.rejects(executor.execute(action, { authorize: () => {} }), { status: 409 }); assert.equal(taps, 1);
});
test('same screen after an approved navigation is uncertain, never completed by elapsed time', async () => {
  const env = { MOLLA_ALLOW_ANDROID_UI: '1', MOLLA_PHONE_BINDINGS: '{"mom":{"serial":"test-device","mode":"local"}}' }, device = phoneBinding('mom', env), parsed = parseScreen(screen(), 'com.android.settings');
  const executor = new AndroidExecutor('mom', { getEnv: () => env, runner: async (_, args) => ({ stdout: args.at(-1) === 'dumpsys activity activities' ? 'mResumedActivity: ActivityRecord{1 u0 com.android.settings/.Settings t1}' : args.at(-1).startsWith('cat ') ? screen() : '' }) });
  await assert.rejects(executor.execute({ type: 'navigation.step', execution: 'android-navigation', device, navigation: { operation: 'tap', text: '', node: parsed.nodes[0], screenHash: parsed.screenHash, inspectedAt: parsed.capturedAt } }, { authorize: () => {} }), { status: 409 });
});
