import { avatar, groupAvatar, icon, people } from './visual.mjs';
import { faMention, mentionsFa } from './mentions.mjs';
import { canSee, isCurrentCard } from './scenario.mjs';
import { PERSON_PROFILE_WIDTH, PERSON_PROFILE_HEIGHT, renderPersonProfile } from './person-profile.mjs';
import { renderTrustProfile } from './trust-panel.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const names = ids => ids.map(id => people[id]?.name).filter(Boolean);
const label = id => people[id]?.name || '알 수 없음';
const key = 'family-agent-kakao-demo-v1';
const roleIds = ['son', 'mom', 'dad', 'aunt', 'friend'];
const contacts = ['mom', 'dad', 'son', 'aunt', 'friend'];
const clock = () => new Intl.DateTimeFormat('ko-KR', {hour:'numeric', minute:'2-digit', hour12:true, timeZone:'Asia/Seoul'}).format(new Date());
const seed = (by, text, time) => ({by, text, time});
const makeRoom = (id, name, members, messages = []) => ({id, name, members, messages, settings:{}, routerId:crypto.randomUUID()});
const faBusy = `${label('fa')}는 이미 다른 채팅방에 참여 중이에요.`;
const hasFA = item => item.members.includes('fa');

function rotateRouter(item) {
  item.routerId = crypto.randomUUID();
  delete item.flow;
  for (const message of item.messages) {
    if (message.card) message.card.expired = true;
  }
}

function detachFA(item) {
  rotateRouter(item);
  item.members = item.members.filter(id => id !== 'fa');
}

function initial() {
  return {actor:'son', active:'family', routerDemoId:crypto.randomUUID(), deletedRoomIds:[], rooms:[
    makeRoom('family', '우리 가족', ['son','mom','dad'], [
      seed('mom', '요즘 어디에 뭘 구독했는지 모르겠네.\n휴대폰으로 매달 결제 문자가 여러 개 와.', '오전 11:08'),
      seed('son', '엄마, 다음에 갈 때까지 기다리지 말고\n여기서 같이 정리해 보자. 치즈를 초대할게!', '오전 11:09'),
      seed('dad', '그래, 다 같이 여기서 보면 되겠다 😊', '오전 11:10'),
    ]),
    makeRoom('aunt', '이모', ['son','aunt'], [seed('aunt', '다음 주에 시간 되면 들러 😊', '오전 10:24')]),
    makeRoom('friend', '지민', ['son','friend'], [seed('friend', '사진 보내줘서 고마워!', '어제')]),
  ]};
}

function storedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (roleIds.includes(saved?.actor) && Array.isArray(saved.rooms)) return saved;
  } catch {}
  return null;
}

function assignedRoom(data) {
  const assigned = data.rooms.filter(hasFA);
  return assigned.find(item => item.id === data.active) ?? assigned[0];
}

function load() {
  try {
    const saved = storedState();
    if (!saved) return initial();
    const needsDemoId = !saved.routerDemoId;
    saved.routerDemoId ||= crypto.randomUUID();
    for (const item of saved.rooms) {
      if (item.routerId && !needsDemoId) continue;
      for (const message of item.messages) {
        if (message.card && message.card.kind !== 'input') message.visibleTo ??= [...item.members];
      }
      rotateRouter(item);
      item.apiStart = item.messages.length;
    }
    const keptRoom = assignedRoom(saved);
    for (const item of saved.rooms) {
      if (item !== keptRoom && hasFA(item)) detachFA(item);
    }
    return saved;
  } catch {}
  return initial();
}

let state = load();
let tab = 'chats';
let panel = '';
let mobileChat = false;
let filter = '';
let listSearch = false;
let chatSearch = null;
let composeTools = '';
let apiMode = 'checking';
let modal = null;
let toastTimer;
let updatingRooms = false;
const pending = new Map();
const drafts = new Map();

const room = () => state.rooms.find(item => item.id === state.active && item.members.includes(state.actor));
const faRoom = () => state.rooms.find(hasFA);
const visibleRooms = () => state.rooms.filter(item => item.members.includes(state.actor));
const settings = item => item.settings[state.actor] || {};
const profileStatus = id => state.profileStatus?.[id] ?? people[id]?.description.trim() ?? '';
const favoriteProfile = id => state.profileFavorites?.[state.actor]?.includes(id) ?? false;
const draftId = () => state.actor + ':' + state.active;
const dateLabel = '2026년 11월 9일 월요일';

function persist() {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
}

function withRoomLock(action) {
  if (navigator.locks) void navigator.locks.request(key, action);
  else action();
}

function mergeSharedRooms(saved) {
  const deleted = new Set([...(state.deletedRoomIds || []), ...(saved.deletedRoomIds || [])]);
  state.deletedRoomIds = [...deleted];
  const assigned = assignedRoom(saved);
  const sharedRooms = new Map(saved.rooms
    .filter(item => !deleted.has(item.id) && (!hasFA(item) || item === assigned))
    .map(item => [item.id, item]));
  const rooms = [];
  for (const item of state.rooms) {
    if (deleted.has(item.id)) {
      discardRoomState(item);
      continue;
    }
    const shared = sharedRooms.get(item.id);
    if (shared?.routerId && shared.routerId !== item.routerId) {
      stopReply(item);
      rooms.push(shared);
    } else rooms.push(item);
    sharedRooms.delete(item.id);
  }
  rooms.push(...sharedRooms.values());
  if (rooms.length === state.rooms.length && rooms.every((item, index) => item === state.rooms[index])) return false;
  state.rooms = rooms;
  return true;
}

function syncRooms() {
  const saved = storedState();
  if (!saved?.routerDemoId) return;
  if (saved.routerDemoId !== state.routerDemoId) {
    for (const item of state.rooms) discardRoomState(item);
    state = {...saved, actor:state.actor, active:null};
  } else if (!mergeSharedRooms(saved)) return;
  if (!room()) {
    closeRoomView();
    if (modal?.invite || ['members','login','input','remove-fa','leave','delete-room','rename'].includes(modal?.mode)) closeDialog();
  }
  if (modal?.mode === 'fa-profile' && modal.targetRoom) {
    const item = profileRoom();
    if (!item) closeDialog();
    else if (modal.profileRouterId !== item.routerId) openTrustProfile(item);
  }
  render();
  if (modal?.mode === 'picker') pickerRows();
  if (modal && $('#dialog').open) positionPopover();
}

function save() {
  if (updatingRooms) return persist();
  // Apply shared room membership and deletions before saving a stale tab.
  withRoomLock(() => {
    syncRooms();
    persist();
  });
}

function changeRooms(action) {
  withRoomLock(() => {
    syncRooms();
    updatingRooms = true;
    try { action(); }
    finally { updatingRooms = false; }
  });
}
function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}
function setMode(mode) {
  apiMode = mode;
  const target = $('#api-mode');
  target.dataset.mode = mode;
  target.textContent = {checking:'설정 확인 중', demo:'샘플 응답', live:'LLM API 설정됨', error:'API 연결 실패'}[mode];
  target.title = {demo:'서버가 발표용 샘플 응답을 사용합니다.', live:'일반 질문은 설정된 LLM에 전송됩니다.', error:'로컬 서버 연결을 확인하세요.'}[mode] || '';
}

const button = (symbol, text, action, extra = '') =>
  `<button type="button" class="icon-button" data-action="${action}" title="${esc(text)}" aria-label="${esc(text)}" ${extra}>${icon(symbol)}</button>`;
const actionButton = (text, action, kind = 'secondary', extra = '') =>
  `<button type="button" class="action-button ${kind}" data-action="${action}" ${extra}>${esc(text)}</button>`;

const profileButton = (id, content, className = '') =>
  `<button type="button" class="profile-trigger ${className}" data-action="show-profile" data-id="${esc(id)}"
    aria-haspopup="dialog" aria-label="${esc(label(id))} 프로필 보기">${content}</button>`;

function renderRail() {
  const selected = value => `aria-current="${tab === value ? 'page' : 'false'}" class="rail-item ${tab === value ? 'selected' : ''}"`;
  $('#rail').innerHTML = `
    <button type="button" data-action="friends" ${selected('friends')}>${icon('friends',24)}<span>친구</span></button>
    <button type="button" data-action="chats" ${selected('chats')}>${icon('chat',24)}<span>채팅</span></button>
    <div class="rail-bottom">${button('more','발표 설정','guide')}</div>`;
}

function renderRows() {
  const list = $('#list-rows');
  if (!list) return;
  const matches = value => value.toLowerCase().includes(filter.trim().toLowerCase());
  if (tab === 'friends') {
    const ids = [...contacts, 'fa'].filter(id => id !== state.actor && matches(label(id) + ' ' + profileStatus(id)))
      .sort((a,b) => Number(favoriteProfile(b)) - Number(favoriteProfile(a)));
    list.innerHTML = `
      ${filter ? '' : profileButton(state.actor,`${avatar(state.actor,48)}<div><strong>${label(state.actor)}</strong><small>내 프로필</small></div>`,'profile-self')}
      <div class="list-subhead">친구 ${ids.length}</div>
      ${ids.map(id => profileButton(id,`${avatar(id,42)}<span><strong>${label(id)}</strong><small>${esc(profileStatus(id))}</small></span>${id === 'fa' ? '<span class="tag">챗봇</span>' : ''}`,'friend-row')).join('')}
      ${!ids.length ? '<p class="list-empty">검색 결과가 없어요.</p>' : ''}`;
    return;
  }
  const ordered = visibleRooms().filter(item => matches(item.name + ' ' + names(item.members).join(' ')))
    .sort((a,b) => Number(Boolean(settings(b).pinned)) - Number(Boolean(settings(a).pinned)) || (b.activity || 0) - (a.activity || 0));
  list.innerHTML = ordered.map(item => {
    const last = item.messages.findLast(message => canSee(message, state.actor));
    const pref = settings(item);
    const unread = item.messages.filter(message => message.unreadBy?.includes(state.actor)).length;
    return `<button class="room-row ${item.id === state.active ? 'active' : ''}" data-action="open-room" data-id="${esc(item.id)}" ${item.id === state.active ? 'aria-current="true"' : ''}>
      ${groupAvatar(item.members.filter(id => id !== state.actor))}
      <span class="room-copy"><span class="room-title"><strong>${esc(item.name)}</strong>${item.members.length > 2 ? `<span class="count">${item.members.length}</span>` : ''}${hasFA(item) ? `<span class="tag">${esc(label('fa'))} 참여 중</span>` : ''}${pref.pinned ? icon('pin',13) : ''}${pref.muted ? icon('muted',13) : ''}</span>
      <span class="preview">${esc(last?.text || '새 채팅방')}</span></span>
      <span class="room-meta"><small class="room-time">${esc(last?.time || '')}</small>${unread ? `<span class="room-unread" aria-label="읽지 않은 메시지 ${unread}개">${unread}</span>` : ''}</span></button>`;
  }).join('') || `<p class="list-empty">${filter ? '검색 결과가 없어요.' : '참여 중인 채팅방이 없어요.'}</p>`;
}

function renderSidebar() {
  $('#sidebar').innerHTML = `
    <header class="list-heading"><h1>${tab === 'chats' ? '채팅' : '친구'}</h1><div class="toolbar">${button('search','목록 검색','list-search',`aria-pressed="${listSearch}"`)}${button('newChat','새 채팅','new-room')}</div></header>
    ${listSearch ? `<label class="searchbox list-search">${icon('search',17)}<input id="list-filter" type="search" placeholder="${tab === 'chats' ? '채팅방 이름, 대화상대 검색' : '친구 이름 검색'}" aria-label="목록 검색어" value="${esc(filter)}"></label>` : ''}
    <div class="list-rows" id="list-rows"></div>`;
  renderRows();
}

function renderCard(card, item, index) {
  if (card.kind === 'input') {
    const done = card.done || card.expired;
    return `<section class="fa-card"><div class="card-body"><div class="card-kicker">${icon('edit',15)} 치즈의 입력 요청</div><strong>${esc(card.title)}</strong><p>${esc(card.description)}</p></div>
      <div class="card-actions">${done ? `<span class="card-status">${card.expired ? '종료된 요청' : '입력 완료'}</span>` :
        actionButton('입력하기','agent-input','primary',`data-index="${index}" ${card.owner !== state.actor ? 'disabled' : ''}`)}</div></section>`;
  }
  const locked = !isCurrentCard(card, item.flow);
  const rows = card.rows?.length ? `<dl>${card.rows.map(row => `<div><dt>${esc(row.label)}</dt><dd>${esc(row.detail)}</dd></div>`).join('')}</dl>` : '';
  const requiresOwner = card.audience && state.actor !== card.audience;
  const cardLabels = {welcome:['bot','치즈와 시작하기'],login:['lock','계정 연결 요청'],scope:['shield','허락 요청'],ready:['shield','연결 완료'],subscriptions:['list','구독 조회 결과'],approval:['shield','승인 요청'],result:['check','작업 완료'],blocked:['lock','권한 확인']};
  const [symbol, title] = cardLabels[card.kind] || ['info','Family AI Agent'];
  return `<section class="fa-card card-${esc(card.kind)}"><div class="card-body">
    <div class="card-kicker">${icon(symbol,15)} ${title}${card.audience ? `<span class="card-audience">${esc(label(card.audience))} 전용</span>` : ''}</div>
    <strong>${esc(card.title)}</strong><p>${esc(card.description)}</p>${rows}</div>
    ${card.actions?.length ? `<div class="card-actions">${locked ? '<span class="card-status">처리된 요청</span>' : card.actions.map(action => {
      const lockedForActor = requiresOwner || (action.actor && action.actor !== state.actor)
        || (action.actors && !action.actors.includes(state.actor));
      return actionButton(action.label, 'router', action.variant === 'secondary' ? 'secondary' : 'primary',
        `data-index="${index}" data-step="${esc(action.action)}" data-value="${esc(action.value)}" data-step-id="${esc(card.step_id)}" ${lockedForActor || pending.has(item.id) ? 'disabled' : ''}`);
    }).join('')}${!locked && requiresOwner ? '<span class="card-status">계정 주인이 본인 화면에서 확인할 수 있어요.</span>' : ''}</div>` : ''}</section>`;
}

function messageHTML(message, item, index) {
  if (message.by === 'system') return `<p class="system-message">${esc(message.text)}</p>`;
  const self = message.by === state.actor;
  const unread = message.unreadBy?.length || 0;
  const meta = `<span class="message-meta">${unread ? `<span class="message-unread" aria-label="읽지 않은 사람 ${unread}명">${unread}</span>` : ''}<time>${esc(message.time || '')}</time></span>`;
  const expression = message.card?.kind === 'result' ? 'happy' : 'profile';
  return `<article class="message ${self ? 'mine' : 'theirs'}" data-sender="${esc(message.by)}" aria-label="${esc(label(message.by))}의 메시지">
    ${self ? '' : profileButton(message.by,avatar(message.by,39,expression),'message-profile-avatar')}
    <div class="message-content">
      ${self ? '' : `<div class="sender">${profileButton(message.by,esc(label(message.by)),'sender-profile')}${message.by === 'fa' ? '<span>Family AI Agent</span>' : ''}</div>`}
      ${message.text ? `<div class="bubble-line"><div class="bubble">${esc(message.text)}</div>${message.card ? '' : meta}</div>` : ''}
      ${message.card ? `<div class="bubble-line"><div class="card-stack">${renderCard(message.card, item, index)}${message.mode ? `<small class="reply-source">${message.mode === 'live' ? 'LLM 응답' : '샘플 응답'}</small>` : ''}</div>${meta}</div>` :
        message.mode ? `<small class="reply-source">${message.mode === 'live' ? 'LLM 응답' : '샘플 응답'}</small>` : ''}
    </div></article>`;
}

function menuRow(symbol, text, action, end = '') {
  return `<button class="drawer-row" data-action="${action}">${icon(symbol,20)}<span>${esc(text)}</span>${end || icon('next',15)}</button>`;
}

function drawer(item) {
  if (!panel) return '';
  const pref = settings(item);
  const bot = item.members.includes('fa');
  if (panel === 'bot') return `<aside class="drawer" aria-label="챗봇">
    <header><h2>챗봇</h2>${button('close','챗봇 메뉴 닫기','close-panel')}</header>
    ${profileButton('fa',`${avatar('fa',44)}<div><strong>${esc(label('fa'))}</strong><small>${esc(people.fa.description)}</small></div><span class="tag">참여 중</span>`,'drawer-bot')}
    ${menuRow('exit','챗봇 내보내기','remove-fa')}</aside>`;
  return `<aside class="drawer" aria-label="채팅방 메뉴"><header><h2>채팅방 메뉴</h2>${button('close','채팅방 메뉴 닫기','close-panel')}</header>
    <div class="drawer-scroll">
      <div class="drawer-heading">대화상대 <span>${item.members.length}</span></div>
      ${menuRow('invite','대화상대 초대','invite')}
      <div class="drawer-members">${item.members.map(id => profileButton(id,`${avatar(id,32)}<span>${label(id)}</span>${id === state.actor ? '<small>나</small>' : ''}`)).join('')}</div>
      <div class="drawer-settings">
        ${bot ? menuRow('bot','챗봇','bots','<span class="row-detail">치즈 참여 중</span>') : ''}
        ${menuRow('edit','채팅방 이름 변경','rename')}
        ${menuRow('pin',pref.pinned ? '상단 고정 해제' : '채팅방 상단 고정','pin')}
        ${menuRow(pref.muted ? 'muted' : 'bell',pref.muted ? '채팅방 알림 켜기' : '채팅방 알림 끄기','mute')}
        ${menuRow('download','대화 내용 내보내기','export')}
      </div>
    </div>
    <footer class="room-exit-actions">
      <button type="button" data-action="leave">${icon('exit',19)} 채팅방 나가기</button>
      <button type="button" data-action="delete-room">${icon('trash',19)} 채팅방 삭제</button>
    </footer></aside>`;
}

function renderMessages(keepScroll = false) {
  const item = room();
  const target = $('#messages');
  if (!target || !item) return;
  const oldTop = target.scrollTop;
  const search = chatSearch?.trim().toLowerCase();
  const content = item.messages.map((message, index) => {
    if (!canSee(message, state.actor)) return '';
    const searchable = [message.text, message.card?.title, message.card?.description].join(' ').toLowerCase();
    return !search || searchable.includes(search) ? messageHTML(message, item, index) : '';
  }).join('');
  target.innerHTML = `
    <div class="date-pill">${search ? '대화 검색 결과' : dateLabel}</div>
    ${content || `<div class="no-messages">${search ? '일치하는 메시지가 없어요.' : '첫 메시지를 보내 대화를 시작해 보세요.'}</div>`}
    ${!search && pending.has(item.id) ? `<div class="thinking" role="status">${avatar('fa',30,'thinking')}<span>치즈가 확인 중이에요.</span></div>` : ''}`;
  target.scrollTop = search ? 0 : keepScroll ? oldTop : target.scrollHeight;
}

function renderChat() {
  const item = room();
  $('#shell').classList.toggle('mobile-chat', mobileChat && Boolean(item));
  $('#chat').innerHTML = item ? `
    <header class="chat-heading">
      <div class="chat-identity">${button('back','채팅 목록으로','back-list','data-mobile-only')}${groupAvatar(item.members.filter(id => id !== state.actor))}
        <div><h2>${esc(item.name)}</h2><button type="button" id="member-trigger" class="member-count" data-action="members" aria-label="대화상대 ${item.members.length}명" aria-haspopup="dialog" aria-expanded="false">${icon('friends',13)} ${item.members.length}${settings(item).muted ? icon('muted',13) : ''}</button></div>
      </div>
      <div class="toolbar">
        ${button('search','대화 검색','chat-search',`aria-pressed="${chatSearch !== null}"`)}${button('menu','채팅방 메뉴','room-menu',`aria-expanded="${Boolean(panel)}"`)}
      </div>
    </header>
    ${chatSearch !== null ? `<label class="searchbox chat-search">${icon('search',17)}<input id="chat-filter" type="search" placeholder="채팅방에서 검색" aria-label="대화 검색어" value="${esc(chatSearch)}"></label>` : ''}
    <div class="messages" id="messages" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="compose-tools" id="compose-tools" hidden></div>
    <form class="composer" id="composer">
      <textarea id="draft" rows="2" maxlength="1200" aria-label="메시지 입력" placeholder="메시지를 입력하세요">${esc(drafts.get(draftId()))}</textarea>
      <div class="composer-actions"><div class="toolbar">
        ${button('plus','대화 도구','compose-more')}${button('smile','이모티콘','emojis')}
      </div><button type="submit" class="send" ${drafts.get(draftId())?.trim() && !pending.has(item.id) ? '' : 'disabled'}>전송</button></div>
    </form>
    ${panel ? `<button class="drawer-shade" data-action="close-panel" aria-label="채팅방 메뉴 닫기"></button>${drawer(item)}` : ''}
  ` : `<div class="chat-empty"><span class="empty-mark">${icon('chat',43)}</span><h2>함께 이야기해요</h2><p>목록에서 채팅방을 열거나<br>친구를 초대해 새 채팅을 시작하세요.</p>${actionButton('새 채팅','new-room','primary')}</div>`;
  renderMessages();
  renderComposeTools();
}

function render() {
  $('#persona').value = state.actor;
  renderRail();
  renderSidebar();
  renderChat();
}

function switchRoom(item) {
  state.active = item.id;
  mobileChat = true;
  tab = 'chats';
  filter = '';
  listSearch = false;
  chatSearch = null;
  panel = '';
  composeTools = '';
  clearUnread(item, state.actor);
  save();
  render();
}

function closeRoomView() {
  state.active = null;
  mobileChat = false;
  panel = '';
  chatSearch = null;
  composeTools = '';
}

function clearUnread(item, actor) {
  for (const message of item.messages) {
    if (message.unreadBy?.includes(actor)) {
      message.unreadBy = message.unreadBy.filter(id => id !== actor);
    }
  }
}

function append(item, messages) {
  const viewing = room() === item && (mobileChat || !matchMedia('(max-width: 590px)').matches);
  item.messages.push(...messages.map(message => ({
    time:clock(),
    ...message,
    ...(message.by !== 'system' && {
      unreadBy:item.members.filter(id => id !== 'fa' && id !== message.by && (!viewing || id !== state.actor) && canSee(message, id)),
    }),
  })));
  item.activity = Date.now();
}

function routerBody(item, actor, action, value, stepId, approvalId) {
  return JSON.stringify({
    demo_id:state.routerDemoId, room_id:item.routerId, members:item.members, actor,
    action, value, step_id:stepId, approval_id:approvalId,
  });
}

async function requestRoute(item, actor, action, value, stepId, controller, approvalId) {
  const response = await fetch('/api/router', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:routerBody(item, actor, action, value, stepId, approvalId),
    signal:AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.handled !== 'boolean' || !result.state || !Array.isArray(result.messages)) {
    throw new Error(result.error || 'FA 작업 요청을 받지 못했어요.');
  }
  if (!controller.signal.aborted) {
    item.flow = result.state;
    if (result.messages.length) append(item, result.messages);
  }
  return result.handled;
}

function routeAction(item, action, value, stepId) {
  const actor = state.actor;
  return runFA(item, controller => requestRoute(item, actor, action, value, stepId, controller));
}

function retireRouter(item) {
  stopReply(item);
  if (!item.members.includes('fa') || !item.members.includes(state.actor)) return;
  void fetch('/api/router', {
    method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
    body:routerBody(item, state.actor, 'retire'),
  }).catch(() => {});
}

function addMembers(item, ids) {
  const added = ids.filter(id => people[id] && !item.members.includes(id));
  if (added.includes('fa') && faRoom()) {
    showToast(faBusy);
    return false;
  }
  if (!added.length) return true;
  retireRouter(item);
  rotateRouter(item);
  item.members.push(...added);
  append(item, [{by:'system', text:`${label(state.actor)}님이 ${names(added).join(', ')}님을 초대했습니다.`}]);
  item.apiStart = item.messages.length;
  if (item.members.includes('fa')) routeAction(item, 'welcome');
  return true;
}

function renderComposeTools() {
  const tools = $('#compose-tools');
  const item = room();
  if (!tools || !item) return;
  tools.hidden = !composeTools;
  if (composeTools === 'emoji') {
    tools.innerHTML = `<div class="emoji-list">${['😊','👍','❤️','🌷','😂','🙌','🙏','🎉'].map(emoji => `<button type="button" data-action="insert" data-value="${emoji}" aria-label="${emoji} 입력">${emoji}</button>`).join('')}</div>`;
  } else if (composeTools === 'mention' || composeTools === 'more') {
    tools.innerHTML = item.members.includes('fa')
      ? `<button type="button" class="tool-choice" data-action="mention-fa">${avatar('fa',30)}<span><strong>${faMention}</strong><small>치즈에게 메시지 보내기</small></span></button>`
      : `<button type="button" class="tool-choice" data-action="invite">${icon('invite',21)}<span>대화상대 초대하기</span></button>`;
  }
}

function refreshComposer() {
  const item = room();
  const sendButton = $('.send');
  if (sendButton && item) sendButton.disabled = !$('#draft').value.trim() || pending.has(item.id);
}

function updateThread(item) {
  save();
  renderRows();
  if (room() === item) {
    renderMessages();
    refreshComposer();
  }
}

function stopReply(item) {
  pending.get(item.id)?.abort();
  pending.delete(item.id);
}

function discardRoomState(item) {
  stopReply(item);
  for (const actor of roleIds) drafts.delete(actor + ':' + item.id);
}

function removeRoom(item) {
  discardRoomState(item);
  (state.deletedRoomIds ??= []).push(item.id);
  state.rooms = state.rooms.filter(candidate => candidate !== item);
}

async function runFA(item, operation) {
  if (pending.has(item.id)) return false;
  const controller = new AbortController();
  pending.set(item.id, controller);
  updateThread(item);
  try {
    await operation(controller);
  } catch (error) {
    if (!controller.signal.aborted) {
      const message = error.name === 'TimeoutError' ? '응답 시간이 지났어요.' : error.message;
      append(item,[{by:'fa', text:`${message} 다시 시도해 주세요.`, error:true}]);
    }
  } finally {
    if (pending.get(item.id) === controller) {
      pending.delete(item.id);
      updateThread(item);
    }
  }
  return true;
}

function isAgentQuestion(text) {
  return mentionsFa(text) || /[?？]$/.test(text) ||
    /(?:줘|주세요|줄래|알려 줘요|해 줘요|뭐야|뭐예요|뭐니|인가요|나요|까요|안녕|안녕하세요)[.!。！]?$/.test(text);
}

async function askChat(item, sender, current, input, controller) {
  current.apiTurn = true;
  const sinceInvitation = item.messages.slice(item.apiStart || 0);
  const history = sinceInvitation.filter(message => canSee(message, sender) && (message.apiTurn || message.mode) && message.text).slice(-12)
    .map(message => {
      if (message === current) return {role:'user', content:input ? `${input.title}: ${current.text}` : current.text};
      if (message.by === 'fa') return {role:'assistant', content:message.text};
      return {role:'user', content:`[${label(message.by)}] ${message.text}`};
    });
  const requestBody = () => JSON.stringify({messages:history, speaker:label(sender), participants:names(item.members)});
  const encoder = new TextEncoder();
  while (encoder.encode(requestBody()).byteLength > 60_000 && history.length > 1) history.shift();
  try {
    const response = await fetch('/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:requestBody(),
      signal:AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)]),
    });
    const reply = await response.json();
    if (!response.ok) throw new Error(reply.error || '응답을 받지 못했어요.');
    if (!controller.signal.aborted) {
      setMode(reply.mode);
      if (input) input.done = true;
      const request = reply.request && item.members.includes(sender)
        ? {kind:'input',title:reply.request.label,description:reply.request.description,owner:sender}
        : null;
      append(item,[{by:'fa', text:reply.text, mode:reply.mode, ...(request ? {card:request} : {})}]);
    }
  } catch (error) {
    if (!controller.signal.aborted && apiMode === 'checking') setMode('error');
    throw error;
  }
}

async function send(value, input = null) {
  const item = room();
  const text = value.trim();
  if (!item || !text || pending.has(item.id)) return false;
  const sender = state.actor;
  append(item, [{by:sender, text}]);
  const current = item.messages.at(-1);
  const decision = item.messages.findLast(message => canSee(message, sender) && message.card?.audience === sender
    && ['approval', 'scope'].includes(message.card.kind) && isCurrentCard(message.card, item.flow))?.card;
  const approvalId = decision?.actions.find(action => action.action === 'approve')?.value;
  drafts.delete(draftId());
  if ($('#draft')) $('#draft').value = '';
  composeTools = '';
  renderComposeTools();
  if (!item.members.includes('fa')) {
    updateThread(item);
    return true;
  }
  return runFA(item, async controller => {
    if (!input) {
      const handled = await requestRoute(item, sender, 'chat', text, decision?.step_id, controller, approvalId);
      if (handled || controller.signal.aborted || !isAgentQuestion(text)) return;
    }
    await askChat(item, sender, current, input, controller);
  });
}

function dialogActions(primary, disabled = false, danger = false) {
  return `<footer class="dialog-actions">${actionButton('취소','close-dialog')}
    <button type="submit" class="action-button ${danger ? 'danger' : 'primary'}" ${disabled ? 'disabled' : ''}>${primary}</button></footer>`;
}

function openDialog(mode, data = {}) {
  modal = {mode, ...data};
  renderDialog();
  const dialog = $('#dialog');
  positionPopover();
  if (!dialog.open) dialog.showModal();
  if (mode === 'picker') $('#friend-filter')?.focus();
}

function positionPopover() {
  const dialog = $('#dialog');
  if (dialog.classList.contains('person-profile')) {
    for (const property of ['--profile-top','--profile-left','--profile-arrow']) dialog.style.removeProperty(property);
    const anchor = modal.anchor;
    const width = PERSON_PROFILE_WIDTH;
    if (!anchor || window.innerWidth < 650 || modal.view) return;
    const right = anchor.left < width + 22;
    const left = right ? anchor.right + 10 : anchor.left - width - 10;
    if (left < 12 || left + width > window.innerWidth - 12) return;
    const height = Math.min(PERSON_PROFILE_HEIGHT, window.innerHeight - 24);
    const center = (anchor.top + anchor.bottom) / 2;
    const top = Math.max(12, Math.min(center - height / 2, window.innerHeight - height - 12));
    dialog.classList.toggle('profile-right',right);
    dialog.style.setProperty('--profile-top',`${top}px`);
    dialog.style.setProperty('--profile-left',`${left}px`);
    dialog.style.setProperty('--profile-arrow',`${Math.max(18, Math.min(center - top, height - 18))}px`);
    return;
  }
  const trigger = $('#member-trigger');
  if (!trigger || !dialog.classList.contains('kakao-popover')) return;
  const anchor = trigger.getBoundingClientRect();
  const center = anchor.left + anchor.width / 2;
  const width = Math.min(dialog.classList.contains('kakao-picker') ? 342 : 290, window.innerWidth - 24);
  const left = Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12));
  dialog.style.setProperty('--popup-left', `${left}px`);
  dialog.style.setProperty('--popup-top', `${anchor.bottom + 9}px`);
  dialog.style.setProperty('--popup-arrow', `${Math.max(18, Math.min(center - left, width - 18))}px`);
  trigger.setAttribute('aria-expanded', 'true');
}

function closeDialog() {
  modal = null;
  $('#dialog').close();
}

function profileRoom() {
  const item = faRoom();
  if (item && item.id === modal?.targetRoom && item.members.includes(state.actor)) return item;
  return null;
}

function showProfile(person, trigger) {
  if (!Object.hasOwn(people,person)) return;
  if (person === 'fa') {
    const assigned = faRoom();
    openTrustProfile(assigned?.members.includes(state.actor) ? assigned : null);
  } else {
    const anchor = trigger.getBoundingClientRect();
    openDialog('person-profile',{person,anchor});
  }
}

function openTrustProfile(item) {
  openDialog('fa-profile',{targetRoom:item?.id,profileRouterId:item?.routerId});
  if (item) void requestTrustProfile();
}

function renderTrustDialog() {
  const dialog = $('#dialog');
  const expanded = dialog.querySelector('details')?.open;
  const focus = dialog.contains(document.activeElement) ? document.activeElement : null;
  renderDialog();
  if (expanded && dialog.querySelector('details')) dialog.querySelector('details').open = true;
  if (!focus) return;
  if (focus.matches('summary') && dialog.querySelector('summary')) {
    dialog.querySelector('summary').focus({preventScroll:true});
    return;
  }
  const replacement = [...dialog.querySelectorAll('[data-action]')].find(element =>
    element.dataset.action === focus.dataset.action && element.dataset.command === focus.dataset.command &&
    element.dataset.requestId === focus.dataset.requestId && !element.disabled);
  (replacement ?? dialog.querySelector('.trust-close'))?.focus({preventScroll:true});
}

async function requestTrustProfile(action, actionId, quiet = false) {
  const profile = modal;
  const item = profileRoom();
  if (!item || profile.busy || (quiet && (profile.polling || profile.confirmLock))) return;
  const actor = state.actor;
  const context = {demo_id:state.routerDemoId, room_id:item.routerId, actor};
  if (quiet) profile.polling = true;
  else {
    profile.requestVersion = (profile.requestVersion || 0) + 1;
    profile.busy = true;
    profile.error = '';
    profile.notice = '';
    profile.confirmLock = false;
    renderTrustDialog();
  }
  const version = profile.requestVersion;
  const isCurrent = () => modal === profile && state.actor === actor &&
    profileRoom()?.routerId === context.room_id && profile.requestVersion === version;
  let changed = false;
  const signal = AbortSignal.timeout(8000);
  try {
    const endpoint = '/api/trust?' + new URLSearchParams(context);
    let response = action
      ? await fetch('/api/trust/action', {method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...context, action, ...(actionId && {action_id:actionId})}), signal})
      : await fetch(endpoint,{signal});
    // A restarted preview server has no active session for rooms saved in the browser.
    if (!action && response.status === 404 && isCurrent() && !pending.has(item.id)) {
      const registration = await fetch('/api/router', {method:'POST', headers:{'Content-Type':'application/json'},
        body:routerBody(item,actor,'welcome'), signal});
      if (registration.ok && isCurrent()) {
        const result = await registration.json();
        if (!isCurrent()) return;
        item.flow = result.state;
        updateThread(item);
        response = await fetch(endpoint,{signal});
      }
    }
    const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error || '보안 상태를 확인하지 못했어요.');
    if (!isCurrent()) return;
    changed = Boolean(profile.error) || JSON.stringify(snapshot) !== JSON.stringify(profile.snapshot);
    profile.snapshot = snapshot;
    profile.error = '';
    if (!quiet) profile.notice = snapshot.notice || '';
  } catch (error) {
    if (isCurrent()) {
      const message = error.name === 'TimeoutError' ? '보안 응답이 지연되고 있어요.' : error.message;
      changed = profile.error !== message;
      profile.error = message;
    }
  } finally {
    if (quiet) profile.polling = false;
    else profile.busy = false;
    if (isCurrent() && (!quiet || changed)) renderTrustDialog();
  }
}

function pickerRows() {
  const item = room();
  const query = (modal.query || '').trim().toLowerCase();
  const faUnavailable = Boolean(faRoom());
  if (faUnavailable) modal.ids = modal.ids.filter(id => id !== 'fa');
  const available = [...contacts, 'fa'].filter(id => id !== state.actor && !(modal.invite && item?.members.includes(id)));
  const matches = available.filter(id => (label(id) + ' ' + people[id].description).toLowerCase().includes(query));
  $('#selected-people').innerHTML = modal.ids.map(id => `<button type="button" class="selected-chip" data-action="toggle-contact" data-id="${id}" aria-label="${label(id)} 선택 취소">${modal.invite ? '' : avatar(id,22)}${label(id)}${icon('close',12)}</button>`).join('');
  $('#picker-rows').innerHTML = matches.map(id => {
    const unavailable = id === 'fa' && faUnavailable;
    return `<label class="picker-row">${avatar(id,40)}<span><strong>${label(id)}</strong><small>${esc(unavailable ? faBusy : people[id].description)}</small></span><input type="checkbox" class="contact-check" data-id="${id}" ${modal.ids.includes(id) ? 'checked' : ''} ${unavailable ? 'disabled' : ''}></label>`;
  }).join('') ||
    '<p class="list-empty">초대할 친구가 없어요.</p>';
  if (modal.invite) {
    $('#selected-count').textContent = modal.ids.length || '';
    $('#picker-section').textContent = `${query ? '검색 결과' : '친구'} ${matches.length}`;
  }
  const submit = $('#dialog [type="submit"]');
  submit.disabled = !modal.ids.length;
  submit.textContent = modal.invite ? '확인' : '다음' + (modal.ids.length ? ' ' + modal.ids.length : '');
}

function renderDialog() {
  const target = $('#dialog');
  const item = room();
  const members = modal.mode === 'members';
  const invite = modal.mode === 'picker' && modal.invite;
  if (modal.mode === 'person-profile') {
    target.className = 'person-profile';
    target.innerHTML = renderPersonProfile({person:modal.person, actor:state.actor, status:profileStatus(modal.person),
      favorite:favoriteProfile(modal.person), view:modal.view});
    return;
  }
  if (modal.mode === 'fa-profile') {
    target.className = 'fa-profile';
    const assigned = faRoom();
    target.innerHTML = renderTrustProfile({...modal, roomName:profileRoom()?.name,
      canOpenChat:!assigned || assigned.members.includes(state.actor)});
    return;
  }
  target.className = members ? 'kakao-popover kakao-members' : invite ? 'kakao-popover kakao-picker' : '';
  if (members) {
    target.innerHTML = `<h2 id="modal-title" class="sr-only">대화상대</h2>
      <div class="member-popover-list">${item.members.map(id => profileButton(id,`${avatar(id,40)}
        ${id === state.actor ? '<small>나</small>' : ''}<span>${label(id)}</span>${id === 'fa' ? '<small class="tag">챗봇</small>' : ''}`,'member-popover-row')).join('')}</div>
      <button type="button" class="member-invite" data-action="invite">${icon('plus',21)} 대화상대 초대하기</button>`;
    return;
  }
  let title, body;
  switch (modal.mode) {
    case 'new-type':
      title = '새 채팅';
      body = `<div class="dialog-body"><button type="button" class="type-choice" data-action="choose-general">${icon('chat',26)}<span><strong>일반채팅</strong><small>친구들과 새로운 채팅을 시작해요.</small></span>${icon('next',17)}</button></div>`;
      break;
    case 'picker':
      title = invite ? '대화상대 선택 <span id="selected-count"></span>' : '대화상대 초대';
      body = `<div class="dialog-body"><div class="selected-people" id="selected-people"></div>
        <label class="searchbox">${icon('search',17)}<input type="search" id="friend-filter" placeholder="${invite ? '이름으로 검색' : '친구 이름 검색'}" aria-label="초대할 친구 검색" value="${esc(modal.query || '')}"></label>
        ${invite ? '<div class="picker-section-title" id="picker-section"></div>' : ''}
        <div class="picker-rows" id="picker-rows"></div></div>${dialogActions('다음', true)}`;
      break;
    case 'room-name':
    case 'rename':
      title = modal.mode === 'rename' ? '채팅방 이름 변경' : '그룹채팅방 정보 설정';
      body = `<div class="dialog-body room-name">${groupAvatar((modal.ids || item?.members || []).filter(id => id !== state.actor))}
        <label>채팅방 이름<input name="name" class="form-field" maxlength="30" required value="${esc(modal.name || '')}" placeholder="채팅방 이름을 입력하세요"></label>
        <p class="field-note">채팅방에 있는 친구들에게 이 이름이 표시돼요.</p></div>${dialogActions('확인')}`;
      break;
    case 'login': {
      const owner = esc(label(modal.owner));
      title = `${label(modal.owner)} 계정 연결`;
      body = `<div class="dialog-body private-input">
        <div class="input-context">${icon('lock',19)} ${owner} 전용 입력</div>
        <p>발표에 사용할 샘플 계정을 선택해 주세요. 선택 내용은 채팅방에 표시되지 않아요.</p>
        <label>데모 계정<select name="sample" class="form-field" required><option value="">계정을 선택해 주세요</option><option value="${esc(modal.owner)}-demo">${owner}의 샘플 계정</option></select></label>
        <p class="field-note">이 계정으로 ${owner} 전용 공간에 연결하는 과정을 보여줘요.</p></div>${dialogActions('데모 계정 연결')}`;
      break;
    }
    case 'input':
      title = '치즈의 입력 요청';
      body = `<div class="dialog-body private-input"><div class="input-context">${icon('edit',19)} 요청한 정보</div>
        <p>${esc(modal.card.description)}</p><label>${esc(modal.card.title)}<input name="answer" class="form-field" maxlength="180" required autocomplete="off" placeholder="내용을 입력하세요"></label>
        <p class="field-note">이 내용은 가족톡과 연결된 응답 모드에 전달돼요.</p></div>${dialogActions('보내기')}`;
      break;
    case 'leave':
      title = '채팅방 나가기';
      body = `<div class="dialog-body"><p>${esc(label(state.actor))} 화면에서 이 채팅방을 나가시겠어요?</p>
        <p class="field-note">나가면 내 채팅 목록에서 사라져요. 남은 참여자는 대화를 계속 볼 수 있어요.</p>
        <label class="quiet-leave"><input name="quiet" type="checkbox"> 조용히 나가기</label></div>${dialogActions('나가기', false, true)}`;
      break;
    case 'delete-room':
      title = '채팅방 삭제';
      body = `<div class="dialog-body"><p><strong>${esc(item.name)}</strong> 방과 대화 기록을 이 데모의 모든 역할에서 삭제할까요?</p>
        <p class="field-note">삭제하면 대화 기록을 복구할 수 없어요.</p></div>${dialogActions('삭제', false, true)}`;
      break;
    case 'remove-fa':
      title = '챗봇 내보내기';
      body = `<div class="dialog-body"><p>치즈를 내보내면 이 방의 데모 계정 연결과 진행 중인 허락 요청이 처음 상태로 돌아가요.</p></div>${dialogActions('내보내기', false, true)}`;
      break;
    case 'reset':
      title = '처음부터 다시 시연';
      body = `<div class="dialog-body"><p>이 브라우저에서 만든 데모 채팅과 설정을 지우고 첫 화면으로 돌아갈까요?</p></div>${dialogActions('다시 시작', false, true)}`;
      break;
    case 'guide':
      title = '발표 시연 안내';
      body = `<div class="dialog-body guide-body"><p>상단의 <strong>보는 사람</strong>에서 가족 각자의 화면으로 바꿀 수 있어요.</p>
        <div class="guide-cheese">${avatar('fa',64)}<div><strong>우리 가족 AI 도우미, 치즈</strong><p>치즈~ 같이 해볼까요?</p></div></div>
        <ol><li><strong>아들</strong> 화면에서 우리 가족 방을 열고 방 이름 아래 <strong>참여자 수 → 대화상대 초대하기</strong>를 누르세요. 친구 목록에서 <strong>치즈</strong>를 선택하고 <strong>확인</strong>을 누르세요.</li>
        <li>치즈에게 <strong>“엄마 구독 좀 정리해줘”</strong>를 보내세요. <strong>엄마</strong>로 바꿔 우리 가족 방을 열고, 샘플 계정을 연결한 뒤 목록 조회를 허용하세요.</li>
        <li><strong>아들</strong>로 바꿔 우리 가족 방에서 구독 목록을 보고 해지를 요청하세요. <strong>엄마</strong>가 방을 열고 해지를 승인하면 결과가 가족톡에 공유돼요.</li></ol>
        <p class="field-note">치즈에게 일반 질문을 하거나 @치즈로 부를 수 있어요. LLM API를 설정하면 해당 대화가 모델에 전달돼요.</p>
        </div><footer class="dialog-actions">${actionButton('처음부터 다시 시연','reset')}${actionButton('닫기','close-dialog','primary')}</footer>`;
      break;
  }
  target.innerHTML = `<form id="dialog-form"><header class="dialog-heading"><h2 id="modal-title">${title}</h2>${invite ? '' : button('close','창 닫기','close-dialog')}</header>${body}</form>`;
  if (modal.mode === 'picker') pickerRows();
}

function commitDialog(event) {
  if (!modal) return;
  const data = new FormData(event.target);
  const item = modal.targetRoom ? visibleRooms().find(candidate => candidate.id === modal.targetRoom) : room();
  switch (modal.mode) {
    case 'person-profile': {
      if (modal.person !== state.actor || modal.view !== 'edit') return;
      (state.profileStatus ??= {})[state.actor] = String(data.get('status') ?? '').trim().slice(0,60);
      openDialog('person-profile',{person:modal.person,anchor:modal.anchor});
      save(); renderRows();
      return;
    }
    case 'picker':
      if (!modal.ids.length) return;
      if (!modal.invite) {
        openDialog('room-name', {ids:modal.ids, name:names(modal.ids).join(', ').slice(0,30)});
        $('#dialog [name=name]').select();
        return;
      }
      if (!item || !addMembers(item, modal.ids)) {
        pickerRows();
        return;
      }
      panel = ''; composeTools = '';
      break;
    case 'room-name': {
      const name = String(data.get('name')).trim();
      if (!name) return showToast('채팅방 이름을 입력해 주세요.');
      const created = makeRoom(crypto.randomUUID(), name, [state.actor]);
      if (!addMembers(created, modal.ids)) {
        openDialog('picker', {ids:modal.ids});
        return;
      }
      state.rooms.unshift(created);
      closeDialog();
      switchRoom(created);
      return;
    }
    case 'rename': {
      const name = String(data.get('name')).trim();
      if (!name) return showToast('채팅방 이름을 입력해 주세요.');
      if (item) item.name = name;
      break;
    }
    case 'login': {
      const sample = data.get('sample');
      if (!item || item.routerId !== modal.roomId || state.actor !== modal.owner || sample !== `${modal.owner}-demo`) return;
      routeAction(item, 'login', sample, modal.stepId);
      break;
    }
    case 'input': {
      const value = String(data.get('answer')).trim();
      if (!value) return showToast('요청한 정보를 입력해 주세요.');
      if (!item || modal.card.done || modal.card.owner !== state.actor || pending.has(item.id)) return;
      const card = modal.card;
      closeDialog();
      send(value, card);
      return;
    }
    case 'leave':
      if (!item) return;
      retireRouter(item);
      rotateRouter(item);
      clearUnread(item, state.actor);
      item.members = item.members.filter(id => id !== state.actor);
      delete item.settings[state.actor];
      if (!data.has('quiet')) append(item,[{by:'system',text:`${label(state.actor)}님이 나갔습니다.`}]);
      item.apiStart = item.messages.length;
      if (!item.members.some(id => id !== 'fa')) removeRoom(item);
      closeRoomView();
      break;
    case 'delete-room':
      if (!item) return;
      retireRouter(item);
      removeRoom(item);
      closeRoomView();
      showToast('채팅방을 삭제했어요.');
      break;
    case 'remove-fa':
      if (!item) return;
      retireRouter(item);
      detachFA(item);
      append(item,[{by:'system',text:`${label('fa')}가 채팅방에서 나갔습니다.`}]);
      panel = '';
      break;
    case 'reset':
      for (const item of state.rooms) retireRouter(item);
      state = initial();
      drafts.clear();
      panel = '';
      chatSearch = null;
      tab = 'chats';
      listSearch = false;
      filter = '';
      mobileChat = false;
      break;
    default:
      return;
  }
  closeDialog();
  save();
  render();
}

function roomExport(item) {
  const text = [item.name, ...item.messages.filter(message => canSee(message, state.actor)).map(message =>
    [message.time, message.by === 'system' ? '' : label(message.by), message.text, message.card?.title].filter(Boolean).join('  ')
  )].join('\n');
  const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = item.name.replace(/[\\/:*?"<>|]/g,'_') + '.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selectContact(id) {
  if (!modal || modal.mode !== 'picker') return;
  if (modal.ids.includes(id)) modal.ids = modal.ids.filter(value => value !== id);
  else modal.ids.push(id);
  pickerRows();
}

function handleAction(action, element) {
  const item = room();
  switch (action) {
    case 'show-profile':
      showProfile(element.dataset.id,element); break;
    case 'profile-chat':
      if (!['person-profile','fa-profile'].includes(modal?.mode)) return;
      closeDialog();
      if (element.dataset.id === 'fa') changeRooms(() => handleAction('friend-chat',element));
      else handleAction('friend-chat',element);
      break;
    case 'profile-call':
    case 'profile-edit':
      if (modal?.mode === 'person-profile') {
        openDialog('person-profile',{person:modal.person,anchor:modal.anchor,view:action === 'profile-edit' ? 'edit' : 'call'});
        $('#profile-status')?.focus();
      }
      break;
    case 'profile-favorite': {
      if (modal?.mode !== 'person-profile' || modal.person === state.actor) return;
      const preferences = state.profileFavorites ??= {};
      const ids = preferences[state.actor] || [];
      preferences[state.actor] = ids.includes(modal.person) ? ids.filter(id => id !== modal.person) : [...ids, modal.person];
      renderDialog(); positionPopover(); renderRows(); save();
      $('#dialog [data-action="profile-favorite"]')?.focus({preventScroll:true});
      break;
    }
    case 'trust-refresh':
      if (modal?.mode === 'fa-profile') void requestTrustProfile();
      break;
    case 'trust-command':
      if (modal?.mode !== 'fa-profile') return;
      if (element.dataset.command === 'lock' && !modal.confirmLock) {
        modal.confirmLock = true;
        renderTrustDialog();
      } else void requestTrustProfile(element.dataset.command,element.dataset.requestId);
      break;
    case 'trust-cancel-confirm':
      if (modal?.mode === 'fa-profile') {
        modal.confirmLock = false;
        renderTrustDialog();
      }
      break;
    case 'friends':
    case 'chats':
      tab = action; mobileChat = false; listSearch = false; filter = ''; render(); break;
    case 'back-list':
      mobileChat = false; panel = ''; chatSearch = null; renderChat(); break;
    case 'list-search':
      listSearch = !listSearch; filter = ''; renderSidebar(); $('#list-filter')?.focus(); break;
    case 'chat-search':
      chatSearch = chatSearch === null ? '' : null; panel = ''; renderChat(); $('#chat-filter')?.focus(); break;
    case 'new-room':
      openDialog('new-type'); break;
    case 'choose-general':
      openDialog('picker',{ids:[]}); break;
    case 'members':
      if (item) openDialog('members'); break;
    case 'invite':
      if (item) openDialog('picker',{ids:[], invite:true}); break;
    case 'toggle-contact':
      selectContact(element.dataset.id); break;
    case 'friend-chat': {
      const id = element.dataset.id;
      const assigned = id === 'fa' ? faRoom() : null;
      if (assigned) {
        if (assigned.members.includes(state.actor)) switchRoom(assigned);
        else showToast(faBusy);
        break;
      }
      let dm = visibleRooms().find(candidate => candidate.members.length === 2 && candidate.members.includes(id));
      if (!dm) {
        dm = makeRoom(crypto.randomUUID(),label(id),[state.actor]);
        if (!addMembers(dm,[id])) break;
        state.rooms.unshift(dm);
      }
      switchRoom(dm);
      break;
    }
    case 'open-room': {
      const selected = visibleRooms().find(candidate => candidate.id === element.dataset.id);
      if (selected) switchRoom(selected);
      break;
    }
    case 'room-menu':
      panel = panel === 'menu' ? '' : 'menu'; renderChat(); break;
    case 'close-panel':
      panel = ''; renderChat(); break;
    case 'bots':
      panel = panel === 'bot' ? '' : 'bot'; composeTools = ''; renderChat(); break;
    case 'rename':
      if (item) openDialog('rename',{name:item.name});
      break;
    case 'leave':
    case 'delete-room':
    case 'remove-fa':
      if (item) openDialog(action,{targetRoom:item.id});
      break;
    case 'pin':
    case 'mute':
      if (item) {
        const prop = action === 'pin' ? 'pinned' : 'muted';
        const pref = item.settings[state.actor] ??= {};
        pref[prop] = !pref[prop];
        save(); render();
        showToast(prop === 'pinned' ? (pref.pinned ? '채팅방을 상단에 고정했어요.' : '상단 고정을 해제했어요.') :
          (pref.muted ? '이 채팅방의 알림을 껐어요.' : '이 채팅방의 알림을 켰어요.'));
      }
      break;
    case 'export':
      if (item) roomExport(item);
      break;
    case 'router': {
      const message = item?.messages[Number(element.dataset.index)];
      const card = message?.card;
      if (!card || !isCurrentCard(card, item.flow) || !canSee(message, state.actor) || pending.has(item.id)) return;
      const {step, value, stepId} = element.dataset;
      if (step === 'login') {
        if (card.audience !== state.actor) return;
        openDialog('login', {owner:card.audience, roomId:item.routerId, stepId:stepId || undefined});
      } else routeAction(item, step, value || undefined, stepId || undefined);
      break;
    }
    case 'agent-input': {
      const message = item?.messages[Number(element.dataset.index)];
      const card = message?.card;
      if (card?.kind === 'input' && canSee(message, state.actor) && !card.done && !card.expired && card.owner === state.actor) {
        if (pending.has(item.id)) return showToast('치즈가 답변한 뒤에 입력해 주세요.');
        openDialog('input',{card});
      }
      break;
    }
    case 'compose-more':
    case 'emojis': {
      const type = action === 'emojis' ? 'emoji' : 'more';
      composeTools = composeTools === type ? '' : type;
      renderComposeTools();
      break;
    }
    case 'mention-fa':
    case 'insert': {
      const draft = $('#draft');
      const value = action === 'mention-fa' ? faMention + ' ' : element.dataset.value;
      if (!draft) break;
      if (action === 'mention-fa' && draft.value.endsWith('@')) draft.value = draft.value.slice(0,-1);
      draft.value += value;
      drafts.set(draftId(),draft.value);
      composeTools = '';
      renderComposeTools();
      refreshComposer();
      draft.focus();
      break;
    }
    case 'guide':
    case 'reset':
      openDialog(action); break;
    case 'close-dialog':
      closeDialog(); break;
  }
}

$('#persona').innerHTML = roleIds.map(id => `<option value="${id}">${label(id)}</option>`).join('');
$('#persona').addEventListener('change', event => {
  if ($('#dialog').open) closeDialog();
  state.actor = event.target.value;
  state.active = null;
  mobileChat = false;
  tab = 'chats';
  filter = '';
  listSearch = false;
  panel = ''; chatSearch = null; composeTools = '';
  save(); render();
});
$('#guide').addEventListener('click', () => openDialog('guide'));
$('#dialog').addEventListener('close', () => {
  if ($('#dialog').open) return;
  modal = null;
  $('#member-trigger')?.setAttribute('aria-expanded', 'false');
});
$('#dialog').addEventListener('click', event => {
  if (event.target !== event.currentTarget || !event.currentTarget.matches('.kakao-popover,.person-profile,.fa-profile')) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
});
window.addEventListener('resize', () => { if ($('#dialog').open) positionPopover(); });
window.addEventListener('storage', event => { if (event.key === key) syncRooms(); });
setInterval(() => {
  if (modal?.mode === 'fa-profile' && !document.hidden) void requestTrustProfile(undefined,undefined,true);
}, 3000);

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || trigger.disabled) return;
  if (trigger.dataset.action === 'friend-chat' && trigger.dataset.id === 'fa') {
    changeRooms(() => handleAction('friend-chat',trigger));
  } else handleAction(trigger.dataset.action,trigger);
});
document.addEventListener('submit', event => {
  if (event.target.id === 'dialog-form') {
    event.preventDefault();
    const submitted = modal;
    if (['picker','room-name','remove-fa','leave','delete-room','reset'].includes(submitted?.mode)) {
      const requestedFA = submitted.ids?.includes('fa');
      changeRooms(() => {
        if (modal !== submitted) return;
        const assigned = requestedFA && faRoom();
        if (assigned) {
          const alreadyHere = modal.invite && assigned === room();
          if (modal.mode === 'room-name') openDialog('picker', {ids:modal.ids});
          else pickerRows();
          showToast(alreadyHere ? `${label('fa')}는 이미 이 채팅방에 참여 중이에요.` : faBusy);
          return;
        }
        commitDialog(event);
      });
    } else commitDialog(event);
  }
  if (event.target.id === 'composer') {
    event.preventDefault();
    send($('#draft').value);
  }
});
document.addEventListener('input', event => {
  const {id, value} = event.target;
  if (id === 'list-filter') { filter = value; renderRows(); }
  if (id === 'chat-filter') { chatSearch = value; renderMessages(); }
  if (id === 'friend-filter' && modal) { modal.query = value; pickerRows(); }
  if (id === 'draft') {
    drafts.set(draftId(),value);
    if (room()?.members.includes('fa') && value.endsWith('@')) composeTools = 'mention';
    else if (composeTools === 'mention') composeTools = '';
    renderComposeTools();
    refreshComposer();
  }
});
document.addEventListener('change', event => {
  if (event.target.classList.contains('contact-check')) {
    const {id} = event.target.dataset;
    selectContact(id);
    $(`.contact-check[data-id="${id}"]`)?.focus();
  }
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'draft' && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    send(event.target.value);
  }
  if (event.key === 'Escape' && !$('#dialog').open && panel) {
    panel = ''; renderChat();
  }
});

save();
render();
try {
  const response = await fetch('/api/status', {signal:AbortSignal.timeout(4000)});
  if (!response.ok) throw new Error('Status error');
  setMode((await response.json()).mode);
} catch { setMode('error'); }
