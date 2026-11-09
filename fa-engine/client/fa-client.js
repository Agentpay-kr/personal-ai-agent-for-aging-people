// Browser client for the FA engine. No dependencies; copy this file into the UI.
//
//   import { createFaClient } from './fa-client.js';
//   const fa = createFaClient({ baseUrl: 'http://localhost:8787', viewer: 'son' });
//   const stop = fa.subscribe((event) => { ... });
//
// Events with the same `id` replace the earlier one (cards change status that way).

export function createFaClient({ baseUrl = 'http://localhost:8787', viewer }) {
  const api = `${baseUrl.replace(/\/$/, '')}/api`;

  async function call(method, path, body) {
    const res = await fetch(api + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
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
  const q = (v) => encodeURIComponent(v);

  return {
    viewer,
    health: () => call('GET', '/health'),
    family: () => call('GET', '/family'),
    vm: (owner) => call('GET', `/vm/${q(owner)}`),
    reset: () => call('POST', '/reset'),

    rooms: (as = viewer) => call('GET', `/rooms?viewer=${q(as)}`),
    createRoom: ({ name, members, createdBy = viewer }) => call('POST', '/rooms', { name, members, createdBy }),
    messages: (roomId, as = viewer) => call('GET', `/rooms/${q(roomId)}/messages?viewer=${q(as)}`),
    send: (roomId, text, from = viewer) => call('POST', `/rooms/${q(roomId)}/messages`, { from, text }),
    invite: (roomId, members, by = viewer) => call('POST', `/rooms/${q(roomId)}/invite`, { by, members }),
    leave: (roomId, userId = viewer) => call('POST', `/rooms/${q(roomId)}/leave`, { userId }),
    rename: (roomId, name, by = viewer) => call('POST', `/rooms/${q(roomId)}/rename`, { by, name }),

    // Card buttons
    vote: (requestId, vote, userId = viewer) => call('POST', `/requests/${q(requestId)}/vote`, { userId, vote }),
    approve: (requestId, userId = viewer) => call('POST', `/requests/${q(requestId)}/vote`, { userId, vote: 'approve' }),
    reject: (requestId, userId = viewer) => call('POST', `/requests/${q(requestId)}/vote`, { userId, vote: 'reject' }),
    submitInput: (requestId, values, userId = viewer) => call('POST', `/requests/${q(requestId)}/input`, { userId, values }),
    action: (roomId, action, input, requester = viewer) => call('POST', '/actions', { roomId, requester, action, input }),
    cancelSubscriptions: (roomId, owner, ids, requester = viewer) =>
      call('POST', '/actions', { roomId, requester, action: 'cancel_subscription', input: { owner, subscription_ids: ids } }),

    // Live events for this viewer. Returns an unsubscribe function.
    subscribe(onEvent, { onOpen, onError } = {}) {
      const es = new EventSource(`${api}/stream?viewer=${q(viewer)}`);
      es.addEventListener('hello', (m) => onOpen?.(JSON.parse(m.data)));
      es.onmessage = (m) => onEvent(JSON.parse(m.data));
      es.onerror = (e) => onError?.(e);
      return () => es.close();
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
