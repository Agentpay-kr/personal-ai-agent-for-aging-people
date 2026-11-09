// Smoke + security test of the HTTP + SSE API. Starts the server in-process on a spare port.
//   node demo/http-smoke.js

process.env.PORT ??= '8799';
process.env.MOLLA_PORT = 'off';
process.env.FA_MODE ??= 'scripted';
process.env.FA_VM_STEP_MS ??= '30';
process.env.FA_MEMORY ??= 'off';

await import('../src/server.js');
const B = `http://127.0.0.1:${process.env.PORT}/api`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, { body, token, headers = {} } = {}) {
  const r = await fetch(B + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { 'x-fa-session': token } : {}), ...headers },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
}
const login = async (actor) => (await req('POST', '/sessions', { body: { actor } })).body.session;
const as = (token) => ({
  get: async (p) => (await req('GET', p, { token })).body,
  post: (p, body = {}) => req('POST', p, { token, body }),
});

function listen(token) {
  const events = [];
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch(`${B}/stream?session=${token}`, { signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split('\n').find((l) => l.startsWith('data: '));
        if (data && !block.startsWith('event: hello')) events.push(JSON.parse(data.slice(6)));
      }
    }
  })().catch(() => {});
  return { events, stop: () => ctrl.abort() };
}

const check = (label, ok) => {
  console.log(`${ok ? '✔' : '✖'} ${label}`);
  if (!ok) process.exitCode = 1;
};

const [sonT, momT, dadT] = [await login('son'), await login('mom'), await login('dad')];
const son = as(sonT);
const mom = as(momT);
const dad = as(dadT);
check('demo login rejects the agent identity', (await req('POST', '/sessions', { body: { actor: 'fa' } })).status === 400);

const momSse = listen(momT);
const sonSse = listen(sonT);
const dadSse = listen(dadT);
await sleep(200);

const room = (await son.post('/rooms', { name: '우리 가족', members: ['mom', 'fa'] })).body;
check('room created by the session user', room.createdBy === 'son');

// ---- identity binding
check('no session → 401', (await req('GET', `/rooms/${room.id}/messages`)).status === 401);
check('text/plain body → 415', (await req('POST', `/rooms/${room.id}/messages`, { token: sonT, body: '{"text":"hi"}', headers: { 'content-type': 'text/plain' } })).status === 415);
check('body claiming another user → 403', (await son.post(`/rooms/${room.id}/messages`, { from: 'mom', text: '엄마인 척' })).status === 403);
check('foreign origin gets no CORS grant', !(await req('GET', '/health', { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin'));
check('localhost origin gets a CORS grant', (await req('GET', '/health', { headers: { origin: 'http://localhost:5173' } })).headers.get('access-control-allow-origin') === 'http://localhost:5173');
check('non-member cannot read the room', (await req('GET', `/rooms/${room.id}/messages`, { token: dadT })).status === 403);
check('non-member cannot act in the room', (await dad.post('/actions', { roomId: room.id, action: 'scan_subscriptions', input: { owner: 'dad' } })).status === 403);
check('VM panel is gated by read permission', (await req('GET', '/vm/son', { token: momT })).status === 403);

// ---- main flow
await son.post(`/rooms/${room.id}/messages`, { text: '엄마 구독 정리해줘' });
await sleep(300);
const inputCard = (await mom.get(`/rooms/${room.id}/messages`)).find((e) => e.type === 'card.input_request');
check('mom can fill the connect card', inputCard?.canAct === true && inputCard.fields.length === 2);
const sonCard = (await son.get(`/rooms/${room.id}/messages`)).find((e) => e.type === 'card.input_request');
check('son sees the card without fields', sonCard?.canAct === false && sonCard.fields.length === 0 && Boolean(sonCard.hint));
check("son cannot submit mom's credentials", (await son.post(`/requests/${inputCard.id}/input`, { values: { id: 'x', password: 'y' } })).status === 403);

const SECRET = 'demo-secret-123';
check('mom connects her email', (await mom.post(`/requests/${inputCard.id}/input`, { values: { id: 'mom@example.com', password: SECRET } })).status === 200);
await sleep(400);
const subsCard = (await son.get(`/rooms/${room.id}/messages`)).find((e) => e.type === 'card.subscriptions');
check('subscriptions card appears after connect (resumed scan)', subsCard?.items.length === 4 && subsCard.canAct === true);

const cancel = await son.post('/actions', { roomId: room.id, action: 'cancel_subscription', input: { owner: 'mom', subscription_ids: ['watcha', 'fortune'] } });
check('cancel from son waits for mom', cancel.body.status === 'waiting_approval');
const approval = (await mom.get(`/rooms/${room.id}/messages`)).find((e) => e.type === 'card.approval_request');
check('mom has the approve button', approval.canAct === true && approval.myRole === 'owner');
check("son cannot approve on mom's behalf", (await son.post(`/requests/${approval.id}/vote`, { vote: 'approve' })).status === 403);
const vote = await mom.post(`/requests/${approval.id}/vote`, { vote: 'approve' });
check('mom approves → cancelled', vote.body.status === 'done' && vote.body.result.monthlySaved === 17300);
check('VM state updated', (await son.get('/vm/mom')).subscriptions.filter((s) => s.status === 'cancelled').length === 2);

await son.post(`/rooms/${room.id}/rename`, { name: '우리 가족 💛' });
await son.post(`/rooms/${room.id}/invite`, { members: ['dad'] });
const left = await dad.post(`/rooms/${room.id}/leave`);
check('rename / invite / leave', left.body.name === '우리 가족 💛' && !left.body.members.includes('dad'));

await sleep(200);
const all = JSON.stringify([...momSse.events, ...sonSse.events, ...dadSse.events]);
check('password never appears in any SSE event', !all.includes(SECRET));
check('SSE delivered live events to mom and son', momSse.events.length > 10 && sonSse.events.length > 10);
check('dad did not get events from before he joined', !dadSse.events.some((e) => e.type === 'card.input_request'));

// ---- Molla cookie sessions
const reset = await son.post('/reset');
check('reset clears sessions', reset.status === 200 && (await req('GET', '/rooms', { token: sonT })).status === 401);
const stale = await req('GET', '/state', { headers: { cookie: `molla_session=${'a'.repeat(48)}` } });
check('stale Molla cookie → 401 with a replacement cookie (CLI exit 3)', stale.status === 401 && /molla_session=/.test(stale.headers.get('set-cookie') ?? ''));

momSse.stop();
sonSse.stop();
dadSse.stop();
process.exit();
