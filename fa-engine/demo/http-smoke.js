// Smoke test of the HTTP + SSE API. Starts the server in-process on a spare port.
//   node demo/http-smoke.js

process.env.PORT ??= '8799';
process.env.FA_MODE ??= 'scripted';
process.env.FA_VM_STEP_MS ??= '30';
process.env.FA_MEMORY ??= 'off';

await import('../src/server.js');
const B = `http://localhost:${process.env.PORT}/api`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => {
  const r = await fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const get = async (path) => (await fetch(B + path)).json();

// Open SSE streams for two viewers and collect events.
function listen(viewer) {
  const events = [];
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch(`${B}/stream?viewer=${viewer}`, { signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split('\n').find((l) => l.startsWith('data: '));
        if (data) events.push(JSON.parse(data.slice(6)));
      }
    }
  })().catch(() => {});
  return { events, stop: () => ctrl.abort() };
}

const check = (label, ok) => {
  console.log(`${ok ? '✔' : '✖'} ${label}`);
  if (!ok) process.exitCode = 1;
};

console.log('health:', await get('/health'));
const mom = listen('mom');
const son = listen('son');
const outsider = listen('dad');
await sleep(200);

const room = (await post('/rooms', { name: '우리 가족', createdBy: 'son', members: ['mom', 'fa'] })).body;
check('room created', Boolean(room.id));

await post(`/rooms/${room.id}/messages`, { from: 'son', text: '엄마 구독 정리해줘' });
await sleep(300);

const momView = await get(`/rooms/${room.id}/messages?viewer=mom`);
const inputCard = momView.find((e) => e.type === 'card.input_request');
check('mom can fill the connect card', inputCard?.canAct === true && inputCard.fields.length === 2);
const sonView = await get(`/rooms/${room.id}/messages?viewer=son`);
const sonCard = sonView.find((e) => e.type === 'card.input_request');
check('son sees the card without fields', sonCard?.canAct === false && sonCard.fields.length === 0 && Boolean(sonCard.hint));

const sonTry = await post(`/requests/${inputCard.id}/input`, { userId: 'son', values: { id: 'x', password: 'y' } });
check(`son cannot submit mom's credentials (${sonTry.status} ${sonTry.body.error})`, sonTry.status === 403);

const SECRET = 'demo-secret-123';
const momInput = await post(`/requests/${inputCard.id}/input`, { userId: 'mom', values: { id: 'mom@example.com', password: SECRET } });
check('mom connects her email', momInput.status === 200);
await sleep(400);

const subsCard = (await get(`/rooms/${room.id}/messages?viewer=son`)).find((e) => e.type === 'card.subscriptions');
check('subscriptions card appears after connect (resumed scan)', subsCard?.items.length === 4 && subsCard.canAct === true);

const cancel = await post('/actions', { roomId: room.id, requester: 'son', action: 'cancel_subscription', input: { owner: 'mom', subscription_ids: ['watcha', 'fortune'] } });
check('cancel from son waits for mom', cancel.body.status === 'waiting_approval');

const approval = (await get(`/rooms/${room.id}/messages?viewer=mom`)).find((e) => e.type === 'card.approval_request');
check('mom has the approve button', approval.canAct === true && approval.myRole === 'owner');
const sonVote = await post(`/requests/${approval.id}/vote`, { userId: 'son', vote: 'approve' });
check(`son cannot approve on mom's behalf (${sonVote.status})`, sonVote.status === 403);
const vote = await post(`/requests/${approval.id}/vote`, { userId: 'mom', vote: 'approve' });
check('mom approves -> cancelled', vote.body.status === 'approved' && vote.body.result.monthlySaved === 17300);

const vm = await get('/vm/mom');
check('VM state updated', vm.subscriptions.filter((s) => s.status === 'cancelled').length === 2);

await post(`/rooms/${room.id}/rename`, { by: 'son', name: '우리 가족 💛' });
await post(`/rooms/${room.id}/invite`, { by: 'son', members: ['dad'] });
const left = await post(`/rooms/${room.id}/leave`, { userId: 'dad' });
check('rename / invite / leave', left.body.name === '우리 가족 💛' && !left.body.members.includes('dad'));

await sleep(200);
const all = JSON.stringify([...mom.events, ...son.events, ...outsider.events]);
check('password never appears in any SSE event', !all.includes(SECRET));
check('SSE delivered live events to mom and son', mom.events.length > 10 && son.events.length > 10);
check('dad (not in the room at first) did not get the early events', !outsider.events.some((e) => e.type === 'card.input_request'));
const types = {};
son.events.forEach((e) => (types[e.type] = (types[e.type] ?? 0) + 1));
console.log('son SSE event counts:', types);

mom.stop();
son.stop();
outsider.stop();
process.exit();
