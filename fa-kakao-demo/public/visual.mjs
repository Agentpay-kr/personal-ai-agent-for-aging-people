const paths = {
  friends: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9"/><circle cx="9" cy="7" r="4"/><path d="M17 3a4 4 0 0 1 0 8"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
  newChat: '<path d="M13.5 4a8 8 0 0 0-9 11L3 21l5.8-1.8A8 8 0 0 0 20 12"/><path d="M19 2v8m-4-4h8"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.4 4.4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  invite: '<circle cx="8" cy="7" r="3.5"/><path d="M2.5 20v-2a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v2M19 8v8m-4-4h8"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4m-4 4v2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2.2 2.2 0 0 0 4 0"/>',
  muted: '<path d="M18 8a6 6 0 0 0-9-5M6 8c0 7-3 7-3 9h13m-6 3a2.2 2.2 0 0 0 4 0M3 3l18 18"/>',
  pin: '<path d="m16 3 5 5-3 1-3 4v3H8l-2-2V7h3l4-3 1-2 2 1zM8 16l-5 5"/>',
  edit: '<path d="m14 5 5 5M4 20l4-1 12-12a2 2 0 0 0-3-3L5 16l-1 4z"/>',
  exit: '<path d="M10 4H4v16h6m4-13 5 5-5 5m5-5H8"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  trash: '<path d="M4 7h16m-10-3h4m-8 3 1 13h10l1-13m-8 3v6m4-6v6"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 7V4m-2 12h4"/><circle cx="9" cy="12" r=".6"/><circle cx="15" cy="12" r=".6"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14a4.5 4.5 0 0 0 8 0"/><circle cx="9" cy="9" r=".7"/><circle cx="15" cy="9" r=".7"/>',
  shield: '<path d="M12 22s7-3 7-10V6l-7-3-7 3v6c0 7 7 10 7 10z"/><path d="m9 12 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
};

export const icon = (name, size = 22) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;

export const people = {
  son: {name:'아들', description:'가족의 디지털 도우미', color:'#dce9ff', ink:'#2a4569', skin:'#ffcdac', hair:'#223858', drawing:'<path d="M11 23V15c0-9 18-10 19 0v8c-3-1-4-4-6-8-3 4-7 5-13 5z" fill="#223858"/>'},
  mom: {name:'엄마', description:'오늘도 좋은 하루 🌷', color:'#f7d9d7', ink:'#943f57', skin:'#ffd6b8', hair:'#53394c', drawing:'<path d="M10 23c-5-3-3-11 1-13 3-5 15-6 19 1 5 1 5 10 1 13l-3-7c-6 1-10-2-11-4-2 4-4 6-7 7z" fill="#53394c"/>'},
  dad: {name:'아빠', description:'걷기 좋은 날', color:'#dce9dc', ink:'#426a54', skin:'#ebba93', hair:'#4b514d', drawing:'<path d="M11 19V14c0-8 17-10 19-1v5l-3-4c-4 2-10 3-16 2z" fill="#4b514d"/><path d="M12 21h7v4h-7zm10 0h7v4h-7zm-3 2h3" fill="none" stroke="#4b514d" stroke-width="1"/>'},
  fa: {name:'FA', description:'Family AI Agent', color:'#ffe54b'},
  aunt: {name:'이모', description:'주말에 차 한잔 ☕', color:'#f0ddf8', ink:'#836298', skin:'#f7caac', hair:'#653a35', drawing:'<path d="M10 22v-6c0-10 19-12 20 0v7c-2-2-4-6-4-8-4 3-8 4-16 4z" fill="#653a35"/>'},
  friend: {name:'지민', description:' ', color:'#fae4cf', ink:'#bd674f', skin:'#dca47b', hair:'#553627', drawing:'<path d="M10 20v-5c0-9 19-10 20 1v5c-3-2-6-5-7-8-5 5-9 6-13 7z" fill="#553627"/>'}
};

export function avatar(id, size = 42) {
  const p = people[id];
  if (!p) return '';
  const drawing = id === 'fa'
    ? '<path d="M20 9c-7 0-12 4.5-12 10 0 3 1.5 5.4 4.1 7.3l-1.4 5.1 5.5-3a15 15 0 0 0 3.8.5c7 0 12-4.5 12-10S27 9 20 9z" fill="#342715"/><path d="M20 13.5c.5 4.2 1.3 5 5.5 5.5-4.2.5-5 1.3-5.5 5.5-.5-4.2-1.3-5-5.5-5.5 4.2-.5 5-1.3 5.5-5.5z" fill="#ffe54b"/>'
    : `<path d="M3 41c1-8 7-12 17-12s16 4 17 12" fill="${p.ink}"/><path d="M17 25h6v7l-3 2-3-2z" fill="${p.skin}"/><path d="M10.5 18c0-6 4-9 9.5-9s9.5 3 9.5 9v4c0 5-4 8-9.5 8s-9.5-3-9.5-8z" fill="${p.skin}"/>${p.drawing}<path d="M16 22h.1m7.9 0h.1m-5.4 3.5q1.3 1.2 2.6 0" stroke="#53372e" fill="none" stroke-width="1.25" stroke-linecap="round"/>`;
  return `<svg class="avatar" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 40 40" style="background:${p.color}">${drawing}</svg>`;
}

export function groupAvatar(ids) {
  const visible = ids.slice(0, 4);
  if (visible.length < 2) return avatar(visible[0] || 'fa', 48);
  return `<span class="group-avatar group-${visible.length}">${visible.map(id => avatar(id, 24)).join('')}</span>`;
}
