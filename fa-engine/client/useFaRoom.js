// React hooks for the FA engine. Copy next to fa-client.js in the UI.
//
//   const fa = useFaClient('son');                 // one client per phone/viewer
//   const { events, typing, send } = useFaRoom(fa, roomId);
//   const rooms = useFaRooms(fa);

import { useEffect, useMemo, useState } from 'react';
import { createFaClient, applyEvent, mergeSnapshot } from './fa-client.js';

const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FA_URL) || 'http://localhost:8787';

export function useFaClient(viewer, baseUrl = BASE_URL) {
  return useMemo(() => createFaClient({ baseUrl, viewer }), [viewer, baseUrl]);
}

// Messages + cards of one room, live.
export function useFaRoom(fa, roomId) {
  const [events, setEvents] = useState([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!roomId) return undefined;
    let alive = true;
    setEvents([]);
    // Keep live events that arrive before the history snapshot loads.
    fa.messages(roomId).then((list) => alive && setEvents((live) => mergeSnapshot(list, live))).catch(() => {});
    const stop = fa.subscribe((e) => {
      if (e.roomId !== roomId) return;
      if (e.type === 'typing') setTyping(Boolean(e.on));
      else setEvents((list) => applyEvent(list, e));
    });
    return () => {
      alive = false;
      stop();
    };
  }, [fa, roomId]);

  return {
    events,
    typing,
    send: (text) => fa.send(roomId, text),
    approve: (requestId) => fa.approve(requestId),
    reject: (requestId) => fa.reject(requestId),
    submitInput: (requestId, values) => fa.submitInput(requestId, values),
    cancelSubscriptions: (owner, ids) => fa.cancelSubscriptions(roomId, owner, ids),
  };
}

// Room list for the chat-list screen; refreshes on any event in the viewer's rooms.
export function useFaRooms(fa) {
  const [rooms, setRooms] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => fa.rooms().then((r) => alive && setRooms(r)).catch(() => {});
    load();
    const stop = fa.subscribe((e) => {
      if (e.type === 'text' || e.type === 'system') load();
    });
    return () => {
      alive = false;
      stop();
    };
  }, [fa]);
  return rooms;
}

// VM panel: polls the owner's VM state and appends live vm.log events.
export function useFaVm(fa, owner) {
  const [vm, setVm] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fa.vm(owner).then((v) => alive && setVm(v)).catch(() => {});
    load();
    const stop = fa.subscribe((e) => {
      if (e.type === 'vm.log' && e.owner === owner) load();
    });
    return () => {
      alive = false;
      stop();
    };
  }, [fa, owner]);
  return vm;
}
