// In-memory rooms, events, and pending requests + an event bus for SSE.
// Events with the same `id` are upserts: the UI should replace the old one.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { polish } from './family.js';

const TEXT_FIELDS = ['text', 'title', 'body', 'reason', 'highlight', 'hint'];

function polishEvent(e) {
  for (const k of TEXT_FIELDS) if (typeof e[k] === 'string') e[k] = polish(e[k]);
  if (Array.isArray(e.lines)) e.lines = e.lines.map(polish);
  return e;
}

export const bus = new EventEmitter();
bus.setMaxListeners(200);

let rooms = new Map();
let requests = new Map();

export function resetStore() {
  rooms = new Map();
  requests = new Map();
}

export const newId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;

export const getRoom = (id) => rooms.get(id);
export const putRoom = (room) => rooms.set(room.id, room);
export const allRooms = () => [...rooms.values()];

export const getRequest = (id) => requests.get(id);
export const putRequest = (r) => requests.set(r.id, r);
export const allRequests = () => [...requests.values()];

export function emit(roomId, event, { persist = true } = {}) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const e = polishEvent({ ts: Date.now(), roomId, ...event, id: event.id ?? newId('ev') });
  if (persist) {
    const i = room.events.findIndex((x) => x.id === e.id);
    if (i >= 0) room.events[i] = e;
    else room.events.push(e);
  }
  bus.emit('event', e);
  return e;
}
