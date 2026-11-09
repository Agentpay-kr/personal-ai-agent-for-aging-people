// HTTP + SSE API. No framework, Node built-ins only.
//   npm start                    -> FA API on :8787 and the Molla-compatible API on :4328
//   PORT=8787 MOLLA_PORT=off     -> only one listener (both APIs are served on every port)
//
// FA routes (KakaoTalk-style UI):  /api/family, /api/rooms..., /api/stream, /api/requests...
// Molla routes (Molla CLI/router): /api/health (sets molla_session), /api/state, /api/tasks, ...

import http from 'node:http';
import * as engine from './engine.js';
import * as store from './store.js';
import * as molla from './molla.js';
import { agentMode } from './agent.js';

const PORT = process.env.PORT ?? '8787';
const MOLLA_PORT = process.env.MOLLA_PORT ?? '4328';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new engine.EngineError(400, 'invalid JSON body');
  }
}

function stream(req, res, viewer) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    ...CORS,
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ viewer, mode: agentMode() })}\n\n`);
  const onEvent = (e) => {
    if (!engine.isVisibleTo(e, viewer)) return;
    res.write(`data: ${JSON.stringify(engine.viewFor(e, viewer))}\n\n`);
  };
  store.bus.on('event', onEvent);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    store.bus.off('event', onEvent);
  });
}

function need(v, name) {
  if (!v) throw new engine.EngineError(400, `${name} is required`);
  return v;
}

// ---- FA routes: handler(query, body, params)
const faRoutes = [
  ['GET', /^\/api\/family$/, async () => engine.familyInfo()],
  ['GET', /^\/api\/vm\/(\w+)$/, async (_q, _b, [owner]) => engine.vmInfo(owner)],
  ['GET', /^\/api\/rooms$/, async (q) => engine.listRooms(need(q.get('viewer'), 'viewer'))],
  ['POST', /^\/api\/rooms$/, async (_q, b) => engine.createRoom(b)],
  ['GET', /^\/api\/rooms\/([\w-]+)\/messages$/, async (q, _b, [roomId]) => engine.roomMessages(roomId, need(q.get('viewer'), 'viewer'))],
  ['POST', /^\/api\/rooms\/([\w-]+)\/messages$/, async (_q, b, [roomId]) => engine.postMessage({ roomId, from: b.from, text: b.text })],
  ['POST', /^\/api\/rooms\/([\w-]+)\/invite$/, async (_q, b, [roomId]) => engine.invite({ roomId, by: b.by, members: b.members })],
  ['POST', /^\/api\/rooms\/([\w-]+)\/leave$/, async (_q, b, [roomId]) => engine.leave({ roomId, userId: b.userId })],
  ['POST', /^\/api\/rooms\/([\w-]+)\/rename$/, async (_q, b, [roomId]) => engine.rename({ roomId, by: b.by, name: b.name })],
  ['POST', /^\/api\/requests\/([\w-]+)\/vote$/, async (_q, b, [id]) => engine.vote({ requestId: id, userId: b.userId, vote: b.vote })],
  ['POST', /^\/api\/requests\/([\w-]+)\/input$/, async (_q, b, [id]) => engine.submitInput({ requestId: id, userId: b.userId, values: b.values })],
  ['POST', /^\/api\/actions$/, async (_q, b) => {
    // Direct UI actions (e.g. picking subscriptions on a card). Same gateway as the LLM.
    const result = await engine.requestAction({ roomId: b.roomId, requester: b.requester, action: b.action, input: b.input ?? {} });
    if (result.say) store.emit(b.roomId, { type: 'text', from: 'fa', text: result.say });
    return result.forModel;
  }],
  ['POST', /^\/api\/reset$/, async () => {
    engine.resetAll();
    molla.resetMolla();
    return { ok: true };
  }],
];

// ---- Molla routes: handler(actor, body, sid). All need a molla_session cookie.
const mollaRoutes = {
  'GET state': (actor) => molla.state(actor),
  'POST demo/switch': (_a, b, sid) => molla.switchActor(sid, b),
  'POST invites': (actor, b) => molla.createInvite(actor, b),
  'POST invites/accept': (_a, b, sid) => molla.acceptInvite(sid, b),
  'POST tasks': (actor, b) => molla.createTask(actor, b),
  'POST task/decision': (actor, b) => molla.decideTask(actor, b),
  'POST memories': (actor, b) => molla.rememberMemory(actor, b),
  'POST memories/search': (actor, b) => molla.searchMemories(actor, b),
  'POST memories/correct': (actor, b) => molla.correctMemory(actor, b),
  'POST memories/delete': (actor, b) => molla.forgetMemory(actor, b),
  'GET memories/shared': (actor) => molla.sharedMemories(actor),
  'POST memories/share': (actor, b) => molla.shareMemory(actor, b),
  'POST memories/revoke': (actor, b) => molla.revokeMemory(actor, b),
  'POST contacts': (actor, b) => molla.addContact(actor, b),
  'POST contacts/delete': (actor, b) => molla.removeContact(actor, b),
  'GET ontology': (actor) => molla.ontology(actor),
  'POST phone/diagnose': (actor) => molla.phoneDiagnose(actor),
  'POST phone/plan': (actor, b) => molla.phonePlan(actor, b),
  'POST consent': (actor, b) => molla.setConsent(actor, b),
};

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const viewer = url.searchParams.get('viewer');
      if (!viewer) return send(res, 400, { error: 'viewer is required' });
      return stream(req, res, viewer);
    }

    // Shared health: also opens a Molla demo session when the caller has none.
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const headers = {};
      if (!molla.sessionFromCookie(req.headers.cookie)) {
        const sid = molla.newSession();
        headers['set-cookie'] = `molla_session=${sid}; Path=/; HttpOnly; SameSite=Lax`;
      }
      return send(res, 200, { ok: true, mode: agentMode(), molla: { schema_version: '1.0', production_auth: false } }, headers);
    }

    for (const [method, re, handler] of faRoutes) {
      const m = url.pathname.match(re);
      if (!m || req.method !== method) continue;
      const body = method === 'POST' ? await readJson(req) : {};
      return send(res, 200, await handler(url.searchParams, body, m.slice(1)));
    }

    const key = `${req.method} ${url.pathname.replace(/^\/api\//, '')}`;
    const mollaHandler = url.pathname.startsWith('/api/') ? mollaRoutes[key] : null;
    if (mollaHandler) {
      const sid = molla.sessionFromCookie(req.headers.cookie);
      if (!sid) return send(res, 401, { error: 'Session required. Call /api/health, then demo/switch.' });
      const body = req.method === 'POST' ? await readJson(req) : {};
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'body must be an object' });
      return send(res, 200, await mollaHandler(molla.actorOf(sid), body, sid));
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof engine.EngineError || err instanceof molla.MollaError) return send(res, err.status, { error: err.message });
    console.error(err);
    return send(res, 500, { error: 'internal error' });
  }
}

function listen(port, label) {
  const server = http.createServer(handle);
  server.listen(Number(port), () => {
    console.log(`${label} on http://127.0.0.1:${server.address().port}  (agent mode: ${agentMode()})`);
  });
  return server;
}

listen(PORT, 'FA engine');
if (MOLLA_PORT !== 'off' && MOLLA_PORT !== PORT) listen(MOLLA_PORT, 'Molla-compatible API');
