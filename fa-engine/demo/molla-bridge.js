// Shows the two surfaces sharing one engine:
//   - a request made in the KakaoTalk-style chat shows up as a Molla task,
//   - family members approve it through the Molla CLI (owner hash + confirmation),
//   - the FA chat then executes it.
// Plus a task created through the Molla CLI (router path).
//
//   node demo/molla-bridge.js
// Uses the repo's molla-cli (or set MOLLA_CLI).

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// In this repo the CLI sits at ../../molla-cli; as a sibling checkout it is one level further.
const CLI = process.env.MOLLA_CLI ?? [
  resolve(here, '../../molla-cli/bin/molla.mjs'),
  resolve(here, '../../personal-ai-agent-for-aging-people/molla-cli/bin/molla.mjs'),
].find(existsSync);
if (!CLI) {
  console.error('Molla CLI not found. Set MOLLA_CLI to molla-cli/bin/molla.mjs.');
  process.exit(2);
}
process.env.PORT = process.env.PORT ?? '8797';
process.env.MOLLA_PORT = 'off';
process.env.FA_MODE ??= 'scripted';
process.env.FA_VM_STEP_MS ??= '0';
process.env.FA_MEMORY ??= 'off';

await import('../src/server.js');
const engine = await import('../src/engine.js');
const store = await import('../src/store.js');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const dir = await mkdtemp(join(tmpdir(), 'fa-molla-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function molla(actor, ...args) {
  return new Promise((res) => {
    execFile(process.execPath, [CLI, ...args, '--session', join(dir, `${actor}.json`), '--base-url', BASE], (err, stdout) => {
      const line = stdout.trim().split('\n').pop();
      let json;
      try { json = JSON.parse(line); } catch { json = { raw: stdout }; }
      res({ code: err?.code ?? 0, json });
    });
  });
}
const show = (label, r) => console.log(`  $ molla ${label}\n    → exit ${r.code} ${JSON.stringify(r.json.data ?? r.json.error ?? r.json).slice(0, 220)}`);

for (const actor of ['son', 'mom', 'dad']) await molla(actor, 'demo', 'login', '--actor', actor);

console.log('\n▶ 1. 카톡 채팅: 아빠가 "엄마의 계좌에서 50만원만 내 계좌로 옮겨줘"');
const room = engine.createRoom({ name: '우리 가족', createdBy: 'son', members: ['mom', 'dad', 'fa'] });
engine.postMessage({ roomId: room.id, from: 'dad', text: '엄마의 계좌에서 50만원만 내 계좌로 옮겨줘' });
await sleep(50);
await store.getRoom(room.id).faQueue;

console.log('\n▶ 2. 같은 요청이 Molla 작업 목록에 보여요');
const momList = await molla('mom', 'task', 'list');
show('task list (엄마)', momList);
const task = momList.json.data.tasks.find((t) => t.source === 'chat');

console.log('\n▶ 3. 아빠(돈 받는 사람)가 CLI로 승인 시도');
const dadGet = await molla('dad', 'task', 'get', '--id', task.id);
show('task get (아빠)', dadGet);
show('task decide approve (아빠)', await molla('dad', 'task', 'decide', '--id', task.id, '--decision', 'approve', '--owner-confirmed', '--expected-action-hash', dadGet.json.data?.approval_hash ?? '0'.repeat(64)));

console.log('\n▶ 4. 엄마 승인 → 아직 가족 1명 필요 → 승빈 승인 → FA 채팅에서 실행');
const momGet = await molla('mom', 'task', 'get', '--id', task.id);
show('task decide approve (엄마)', await molla('mom', 'task', 'decide', '--id', task.id, '--decision', 'approve', '--owner-confirmed', '--expected-action-hash', momGet.json.data.approval_hash));
const sonGet = await molla('son', 'task', 'get', '--id', task.id);
show('task decide approve (승빈)', await molla('son', 'task', 'decide', '--id', task.id, '--decision', 'approve', '--owner-confirmed', '--expected-action-hash', sonGet.json.data.approval_hash));
await sleep(100);
const chat = store.getRoom(room.id).events.filter((e) => e.type === 'text' && e.from === 'fa').slice(-3);
chat.forEach((e) => console.log(`  💬 FA: ${e.text}`));

console.log('\n▶ 5. 라우터 경로: 승빈이 CLI로 "쌀 10kg 주문 준비해줘" (엄마 계정)');
const created = await molla('son', 'task', 'create', '--owner', 'mom', '--text', '쌀 10kg 주문 준비해줘');
show('task create (승빈 → 엄마)', created);
const id = created.json.data.task.id;
const g = await molla('mom', 'task', 'get', '--id', id);
show('task get (엄마, action 보임)', g);
await molla('mom', 'task', 'decide', '--id', id, '--decision', 'approve', '--owner-confirmed', '--expected-action-hash', g.json.data.approval_hash);
await sleep(300);
show('task get (엄마, 승인 후)', await molla('mom', 'task', 'get', '--id', id));

console.log('\n▶ 6. 엄마가 가족 도움을 끄면 승빈의 요청이 막혀요');
await molla('mom', 'consent', 'set', '--value', 'revoked', '--owner-confirmed');
show('task create (승빈 → 엄마, 동의 철회 후)', await molla('son', 'task', 'create', '--owner', 'mom', '--text', '쌀 주문'));
process.exit(0);
