// HTTP + SSE API. No framework, Node built-ins only.
//   npm start                    -> FA API on :8787 and the Molla-compatible API on :4328
//   PORT=8787 MOLLA_PORT=off     -> only one listener (both APIs are served on every port)
//   FA_HOST=0.0.0.0              -> reachable from other laptops (default: 127.0.0.1 only)
//
// Identity: every route except /api/health and /api/sessions needs a session.
//   FA UI:     POST /api/sessions {actor} -> {session}; send it as the `x-fa-session` header
//              (or `?session=` for SSE, since EventSource can't set headers).
//   Molla CLI: `molla_session` cookie from /api/health + /api/demo/switch.
// The session decides who you are. Identity fields in a body (from, userId, by, requester)
// must match it or the request is rejected. Demo login is not production auth.

import http from 'node:http';
import * as engine from './engine.js';
import * as store from './store.js';
import * as molla from './molla.js';
import { agentMode } from './agent.js';

const PORT = process.env.PORT ?? '8787';
const MOLLA_PORT = process.env.MOLLA_PORT ?? '4328';
const HOST = process.env.FA_HOST ?? '127.0.0.1';
const EXTRA_ORIGINS = new Set((process.env.FA_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !(LOCAL_ORIGIN.test(origin) || EXTRA_ORIGINS.has(origin))) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-fa-session',
    vary: 'origin',
  };
}

function send(req, res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(req), ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  // JSON only: blocks cross-site "simple" form/text posts.
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'content-type must be application/json');
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'body must be an object');
  return body;
}

function sessionToken(req, url) {
  const header = req.headers['x-fa-session'];
  if (typeof header === 'string' && /^[a-f0-9]{48}$/.test(header)) return header;
  const q = url.searchParams.get('session');
  if (q && /^[a-f0-9]{48}$/.test(q)) return q;
  return molla.sessionFromCookie(req.headers.cookie);
}

function actorFrom(req, url) {
  const token = sessionToken(req, url);
  const actor = token ? molla.actorOf(token) : null;
  if (!actor) throw new HttpError(401, 'Session required. POST /api/sessions {actor} first (demo login).');
  return actor;
}

// A body may repeat who is acting, but it can't claim to be someone else.
function same(actor, value, field) {
  if (value !== undefined && value !== actor) throw new HttpError(403, `${field} does not match your session`);
  return actor;
}

function stream(req, res, viewer) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    ...corsHeaders(req),
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

// ---- FA routes: handler(actor, query, body, params)
const faRoutes = [
  ['GET', /^\/api\/family$/, async () => engine.familyInfo()],
  ['GET', /^\/api\/vm\/(\w+)$/, async (a, _q, _b, [owner]) => engine.vmInfo(owner, a)],
  ['GET', /^\/api\/rooms$/, async (a, q) => engine.listRooms(same(a, q.get('viewer') ?? undefined, 'viewer'))],
  ['POST', /^\/api\/rooms$/, async (a, _q, b) => engine.createRoom({ name: b.name, members: b.members, createdBy: same(a, b.createdBy, 'createdBy') })],
  ['GET', /^\/api\/rooms\/([\w-]+)\/messages$/, async (a, q, _b, [roomId]) => engine.roomMessages(roomId, same(a, q.get('viewer') ?? undefined, 'viewer'))],
  ['POST', /^\/api\/rooms\/([\w-]+)\/messages$/, async (a, _q, b, [roomId]) => engine.postMessage({ roomId, from: same(a, b.from, 'from'), text: b.text })],
  ['POST', /^\/api\/rooms\/([\w-]+)\/invite$/, async (a, _q, b, [roomId]) => engine.invite({ roomId, by: same(a, b.by, 'by'), members: b.members })],
  ['POST', /^\/api\/rooms\/([\w-]+)\/leave$/, async (a, _q, b, [roomId]) => engine.leave({ roomId, userId: same(a, b.userId, 'userId') })],
  ['POST', /^\/api\/rooms\/([\w-]+)\/rename$/, async (a, _q, b, [roomId]) => engine.rename({ roomId, by: same(a, b.by, 'by'), name: b.name })],
  ['POST', /^\/api\/requests\/([\w-]+)\/vote$/, async (a, _q, b, [id]) => engine.vote({ requestId: id, userId: same(a, b.userId, 'userId'), vote: b.vote })],
  ['POST', /^\/api\/requests\/([\w-]+)\/input$/, async (a, _q, b, [id]) => engine.submitInput({ requestId: id, userId: same(a, b.userId, 'userId'), values: b.values })],
  ['POST', /^\/api\/requests\/([\w-]+)\/cancel$/, async (a, _q, b, [id]) => engine.cancelRequest({ requestId: id, userId: same(a, b.userId, 'userId') })],
  ['POST', /^\/api\/actions$/, async (a, _q, b) => {
    // Direct UI actions (e.g. picking subscriptions on a card). Same gateway as the LLM.
    const result = await engine.requestAction({ roomId: b.roomId, requester: same(a, b.requester, 'requester'), action: b.action, input: b.input ?? {} });
    if (result.say) store.emit(b.roomId, { type: 'text', from: 'fa', text: result.say });
    return result.forModel;
  }],
  ['POST', /^\/api\/reset$/, async () => {
    engine.resetAll();
    molla.resetMolla();
    return { ok: true, note: 'All sessions were cleared. Log in again.' };
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

function newCookie() {
  return `molla_session=${molla.newSession()}; Path=/; HttpOnly; SameSite=Lax`;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  try {
    // Open: health (also issues a Molla cookie session) and demo login.
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const headers = molla.sessionFromCookie(req.headers.cookie) ? {} : { 'set-cookie': newCookie() };
      return send(req, res, 200, { ok: true, mode: agentMode(), molla: { schema_version: '1.0', production_auth: false } }, headers);
    }
    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const body = await readJson(req);
      return send(req, res, 200, molla.login(body.actor));
    }

    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const actor = actorFrom(req, url);
      return stream(req, res, same(actor, url.searchParams.get('viewer') ?? undefined, 'viewer'));
    }

    for (const [method, re, handler] of faRoutes) {
      const m = url.pathname.match(re);
      if (!m || req.method !== method) continue;
      const actor = actorFrom(req, url);
      const body = method === 'POST' ? await readJson(req) : {};
      return send(req, res, 200, await handler(actor, url.searchParams, body, m.slice(1)));
    }

    const key = `${req.method} ${url.pathname.replace(/^\/api\//, '')}`;
    const mollaHandler = url.pathname.startsWith('/api/') && Object.hasOwn(mollaRoutes, key) ? mollaRoutes[key] : null;
    if (mollaHandler) {
      const sid = molla.sessionFromCookie(req.headers.cookie);
      if (!sid) {
        // A stale cookie gets a replacement, so molla-cli reports AUTH_REQUIRED (exit 3), not an API error.
        const stale = /molla_session=/.test(req.headers.cookie ?? '');
        return send(req, res, 401, { error: 'Session required. Run demo login again.' }, stale ? { 'set-cookie': newCookie() } : {});
      }
      const body = req.method === 'POST' ? await readJson(req) : {};
      return send(req, res, 200, await mollaHandler(molla.actorOf(sid), body, sid));
    }

    send(req, res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof HttpError || err instanceof engine.EngineError || err instanceof molla.MollaError) {
      return send(req, res, err.status, { error: err.message });
    }
    console.error(err);
    return send(req, res, 500, { error: 'internal error' });
  }
}

function listen(port, label) {
  const server = http.createServer(handle);
  server.listen(Number(port), HOST, () => {
    const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    console.log(`${label} on http://${shown}:${server.address().port}  (agent mode: ${agentMode()})`);
  });
  return server;
}

listen(PORT, 'FA engine');
if (MOLLA_PORT !== 'off' && MOLLA_PORT !== PORT) listen(MOLLA_PORT, 'Molla-compatible API');
