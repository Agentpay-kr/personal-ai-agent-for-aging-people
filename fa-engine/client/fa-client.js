// Browser client for the FA engine. No dependencies; copy this file into the UI.
//
//   import { createFaClient } from './fa-client.js';
//   const fa = createFaClient({ baseUrl: 'http://localhost:8787', viewer: 'son' });
//   const stop = fa.subscribe((event) => { ... });
//
// Each client logs in once as `viewer` (demo login) and sends that session with every call,
// so two phones on one page use two clients. Events with the same `id` replace the earlier one.

export function createFaClient({ baseUrl = 'http://localhost:8787', viewer }) {
  const api = `${baseUrl.replace(/\/$/, '')}/api`;
  let session = null;
  let loggingIn = null;

  async function raw(method, path, body, token) {
    const res = await fetch(api + path, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'x-fa-session': token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error ?? `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function login() {
    loggingIn ??= raw('POST', '/sessions', { actor: viewer }).then((r) => {
      session = r.session;
      return session;
    }).finally(() => { loggingIn = null; });
    return loggingIn;
  }

  async function call(method, path, body) {
    if (method === 'POST') body ??= {}; // the server accepts JSON bodies only
    const token = session ?? (await login());
    try {
      return await raw(method, path, body, token);
    } catch (err) {
      if (err.status !== 401) throw err;
      session = null; // server was reset: log in again once
      return raw(method, path, body, await login());
    }
  }
  const q = (v) => encodeURIComponent(v);

  return {
    viewer,
    login,
    health: () => raw('GET', '/health'),
    family: () => call('GET', '/family'),
    vm: (owner) => call('GET', `/vm/${q(owner)}`),
    reset: async () => {
      const r = await call('POST', '/reset');
      session = null;
      return r;
    },

    rooms: () => call('GET', '/rooms'),
    createRoom: ({ name, members }) => call('POST', '/rooms', { name, members }),
    messages: (roomId) => call('GET', `/rooms/${q(roomId)}/messages`),
    send: (roomId, text) => call('POST', `/rooms/${q(roomId)}/messages`, { text }),
    invite: (roomId, members) => call('POST', `/rooms/${q(roomId)}/invite`, { members }),
    leave: (roomId) => call('POST', `/rooms/${q(roomId)}/leave`, {}),
    rename: (roomId, name) => call('POST', `/rooms/${q(roomId)}/rename`, { name }),

    // Card buttons
    vote: (requestId, vote) => call('POST', `/requests/${q(requestId)}/vote`, { vote }),
    approve: (requestId) => call('POST', `/requests/${q(requestId)}/vote`, { vote: 'approve' }),
    reject: (requestId) => call('POST', `/requests/${q(requestId)}/vote`, { vote: 'reject' }),
    cancel: (requestId) => call('POST', `/requests/${q(requestId)}/cancel`, {}),
    submitInput: (requestId, values) => call('POST', `/requests/${q(requestId)}/input`, { values }),
    action: (roomId, action, input) => call('POST', '/actions', { roomId, action, input }),
    cancelSubscriptions: (roomId, owner, ids) =>
      call('POST', '/actions', { roomId, action: 'cancel_subscription', input: { owner, subscription_ids: ids } }),

    // Live events for this viewer. Returns an unsubscribe function.
    subscribe(onEvent, { onOpen, onError } = {}) {
      let es = null;
      let closed = false;
      (session ? Promise.resolve(session) : login()).then((token) => {
        if (closed) return;
        es = new EventSource(`${api}/stream?session=${q(token)}`);
        es.addEventListener('hello', (m) => onOpen?.(JSON.parse(m.data)));
        es.onmessage = (m) => onEvent(JSON.parse(m.data));
        es.onerror = (e) => onError?.(e);
      }).catch((e) => onError?.(e));
      return () => {
        closed = true;
        es?.close();
      };
    },
  };
}

// Merge helper: apply a live event to a list (upsert by id, keep order).
export function applyEvent(list, event) {
  if (event.type === 'typing') return list;
  const i = list.findIndex((e) => e.id === event.id);
  if (i === -1) return [...list, event];
  const next = list.slice();
  next[i] = event;
  return next;
}

// Merge a history snapshot with live events that arrived while it loaded.
export function mergeSnapshot(snapshot, live) {
  return live.reduce(applyEvent, snapshot);
}
