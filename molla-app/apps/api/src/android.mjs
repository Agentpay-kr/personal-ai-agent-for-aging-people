import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';
import { digest } from './storage.mjs';
import { AndroidComposeExecutor, phoneBinding, adbPath, shellQuote, DomainError } from './core.mjs';

const run = promisify(execFile);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', processEntities: false, parseAttributeValue: false });
const sensitive = /password|passwd|passcode|one.?time|verification.?code|인증.?번호|인증.?코드|비밀번호|로그인|sign.?in|log.?in/i;
const searchIds = new Set(['com.android.settings:id/search_action_bar', 'com.android.settings:id/search', 'com.android.settings:id/search_src_text', 'android:id/search_src_text']);
const listIds = new Set(['android:id/list', 'com.android.settings:id/recycler_view', 'com.android.settings:id/list']);
const smsPackages = new Set(['com.google.android.apps.messaging', 'com.android.messaging', 'com.android.mms']);

export function parseScreen(xml, foreground) {
  if (xml.length > 512000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new DomainError('화면 XML을 안전하게 읽을 수 없어요.', 502);
  const root = parser.parse(xml); const nodes = [];
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value['resource-id'] !== undefined) {
      if (value.password === 'true') throw new DomainError('로그인·인증 화면은 주인이 직접 진행해 주세요.', 403);
      const label = `${value.text || ''} ${value['content-desc'] || ''}`.trim();
      if (sensitive.test(label) && /EditText|Button/.test(value.class || '')) throw new DomainError('로그인·인증 화면은 주인이 직접 진행해 주세요.', 403);
      const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(value.bounds || '')?.slice(1).map(Number);
      if (bounds && bounds.every(n => n <= 8192) && bounds[2] > bounds[0] && bounds[3] > bounds[1]) {
        const resourceId = value['resource-id'], actions = [];
        if (foreground === 'com.android.settings' && value.package === foreground && value.enabled === 'true') {
          if (searchIds.has(resourceId) && value.clickable === 'true') actions.push('tap');
          if (searchIds.has(resourceId) && /EditText/.test(value.class || '') && value.focused === 'true') actions.push('input');
          if (listIds.has(resourceId) && value.scrollable === 'true') actions.push('scroll_up', 'scroll_down');
        }
        nodes.push({ id: digest(JSON.stringify([resourceId, bounds, label])).slice(0, 20), resourceId, label: label.slice(0, 1100), bounds, actions, package: value.package });
      }
    }
    for (const [key, child] of Object.entries(value)) if (key === 'node' || key === 'hierarchy') walk(child);
  }
  walk(root);
  if (nodes.length > 2000) throw new DomainError('화면이 너무 복잡해요.', 502);
  return { package: foreground, nodes, screenHash: digest(JSON.stringify([foreground, nodes])), capturedAt: new Date().toISOString() };
}
export class AndroidExecutor {
  constructor(owner, { getEnv, runner = run } = {}) { Object.assign(this, { owner, getEnv, runner }); }
  binding() { const binding = phoneBinding(this.owner, this.getEnv()); if (!binding) throw new DomainError('내 Android 연결을 확인해 주세요.', 409); return binding; }
  async adb(binding, args) { return this.runner(adbPath(this.getEnv()), ['-s', binding.serial, ...args], { timeout: 15000, maxBuffer: 512000, windowsHide: true }); }
  async screen(binding, authorize) {
    authorize();
    const { stdout: raw } = await this.adb(binding, ['shell', 'dumpsys activity activities']);
    const line = raw.split(/\r?\n/).find(v => /topResumedActivity|mResumedActivity/.test(v));
    const foreground = /\s([A-Za-z0-9_.]+)\/[A-Za-z0-9_.$]+/.exec(line || '')?.[1];
    if (!foreground) throw new DomainError('현재 앱을 확인할 수 없어요.', 409);
    const path = `/data/local/tmp/molla-${randomUUID()}.xml`;
    try {
      await this.adb(binding, ['shell', `uiautomator dump ${path}`]);
      const { stdout: xml } = await this.adb(binding, ['shell', `cat ${path}`]);
      authorize();
      if (JSON.stringify(this.binding()) !== JSON.stringify(binding)) throw new DomainError('기기 연결이 변경되었어요.', 403);
      return parseScreen(xml.slice(xml.indexOf('<?xml')), foreground);
    } finally { await this.adb(binding, ['shell', `rm -f ${path}`]).catch(() => {}); }
  }
  async execute(action, hooks) {
    const { authorize, beforeEffect = authorize, verifying = () => {} } = hooks;
    const binding = this.binding();
    if (JSON.stringify(binding) !== JSON.stringify(action.device)) throw new DomainError('승인한 기기가 변경되었어요.', 403);
    if (['android-app', 'android-compose'].includes(action.execution)) {
      const basic = new AndroidComposeExecutor(this.owner, { getEnv: this.getEnv, runner: this.runner });
      const evidence = await basic.execute(action, hooks);
      if (action.execution === 'android-app') return evidence;
      const screen = await this.screen(binding, authorize);
      const texts = screen.nodes.map(n => n.label);
      const digits = action.recipient.phone.replace(/\D/g, '');
      const recipientVisible = texts.some(t => t.replace(/\D/g, '') === digits);
      const bodyVisible = texts.some(t => t.trim() === action.body.trim());
      if (!smsPackages.has(screen.package) || !recipientVisible || !bodyVisible) return { ...evidence, summary: '문자 작성 화면을 요청했지만 수신자와 본문을 화면에서 모두 확인하지 못했어요. 전송하지 않았어요. 기기에서 확인해 주세요.' };
      return { kind: 'sms_composed', verified: true, messageSent: false, device: binding.serial, package: screen.package, screenHash: screen.screenHash, capturedAt: screen.capturedAt, recipientVerified: true, bodyVerified: true, summary: '수신자와 본문이 문자 작성 화면에 표시된 것을 확인했어요. 전송하지 않았어요.' };
    }
    if (this.getEnv().MOLLA_ALLOW_ANDROID_UI !== '1') throw new DomainError('화면 탐색이 허용되지 않았어요.', 403);
    const before = await this.screen(binding, authorize);
    if (before.package !== 'com.android.settings') throw new DomainError('화면 요소 탐색은 현재 설정 앱에서만 지원해요.', 409);
    if (action.execution === 'android-inspect') {
      verifying(); return { ...before, nodes: before.nodes.filter(n => n.actions.length), kind: 'screen_inspected', verified: true, device: binding.serial, summary: '설정 앱의 허용된 검색·목록 요소를 확인했어요.' };
    }
    if (action.execution !== 'android-navigation') throw new DomainError('지원하지 않는 Android 작업이에요.', 400);
    const nav = action.navigation, node = before.nodes.find(n => n.id === nav.node.id);
    if (Date.parse(nav.inspectedAt) < Date.now() - 60000 || before.screenHash !== nav.screenHash || !node?.actions.includes(nav.operation)) throw new DomainError('검사한 화면이 바뀌었거나 만료되었어요. 다시 확인하고 승인해 주세요.', 409);
    const [left, top, right, bottom] = node.bounds, x = Math.floor((left + right) / 2), y = Math.floor((top + bottom) / 2);
    let command;
    if (nav.operation === 'tap') command = `input tap ${x} ${y}`;
    else if (nav.operation === 'input' && /^[A-Za-z0-9 ._-]{1,80}$/.test(nav.text)) command = `input text ${shellQuote(nav.text.replace(/ /g, '%s'))}`;
    else if (['scroll_up', 'scroll_down'].includes(nav.operation)) {
      const y1 = Math.floor(top + (bottom - top) * 0.75), y2 = Math.floor(top + (bottom - top) * 0.25);
      command = `input swipe ${x} ${nav.operation === 'scroll_down' ? y1 : y2} ${x} ${nav.operation === 'scroll_down' ? y2 : y1} 400`;
    } else throw new DomainError('허용되지 않은 탐색 동작이에요.', 403);
    beforeEffect(); await this.adb(binding, ['shell', command]); verifying();
    const after = await this.screen(binding, authorize);
    const changed = after.screenHash !== before.screenHash && after.package === before.package;
    if (!changed) throw new DomainError('동작 후 화면 변화를 확인하지 못했어요. 직접 확인해 주세요.', 409);
    return { kind: 'navigation_completed', verified: true, device: binding.serial, package: after.package, beforeHash: before.screenHash, screenHash: after.screenHash, capturedAt: after.capturedAt, summary: '승인한 설정 화면 탐색 후 화면 변화를 확인했어요.' };
  }
}
