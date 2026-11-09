import { avatar, icon, people } from './visual.mjs';

const eventNames = {
  decision: '정책 판정', family_alert: '가족 알림', approval: '기기 승인', scheduled: '실행 예약',
  executed: '실행 완료', shredded: '세션 폐기', evidence: '증거 봉인', proof_failed: '사칭 차단',
  lockdown: '긴급 잠금', self_destruct: '자동 소멸', unlocked: '잠금 해제', linked: '계정 연결',
  rejected: '요청 취소', expired: '요청 만료', member_removed: '구성원 제거',
};
const actionStates = { pending: '승인 대기', held: '확인 보류', scheduled: '실행 대기' };
const displayTime = new Intl.DateTimeFormat('ko-KR', {
  hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul',
});
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function securityStatus(snapshot, waiting) {
  // fa-trust self-destructs on intrusion (takeover, hacking, contamination); show that apart from a lockdown.
  const lastLock = (snapshot.events ?? []).filter(e => ['lockdown', 'self_destruct', 'unlocked'].includes(e.type)).at(-1);
  if (snapshot.locked && lastLock?.type === 'self_destruct') return {
    tone: 'locked', icon: 'lock', title: '외부 침해로 자동 소멸됨',
    body: `세션과 기억을 지웠고, 남은 건 봉인된 증거와 감사 기록뿐이에요. 가족 기기 두 대가 동의하면 다시 시작해요. (${snapshot.unlockVotes ?? 0}/2)`,
  };
  if (snapshot.locked) return {
    tone: 'locked', icon: 'lock', title: '송금 긴급 잠금 중',
    body: `등록된 가족 기기 두 대가 동의하면 잠금이 풀려요. (${snapshot.unlockVotes ?? 0}/2)`,
  };
  if (waiting.length) return {
    tone: 'waiting', icon: 'info', title: '확인이 필요한 송금', body: '요청 상태를 확인하고 필요하면 취소할 수 있어요.',
  };
  return {
    tone: 'ready', icon: 'shield', title: '송금 보호 켜짐', body: '승인이 필요한 송금은 등록된 가족 기기의 동의를 받아요.',
  };
}

function command(action, label, busy, options = {}) {
  const { requestId, variant = 'secondary' } = options;
  return `<button type="button" class="trust-button ${variant}" data-action="trust-command" data-command="${action}"
    ${requestId ? `data-request-id="${esc(requestId)}"` : ''} ${busy ? 'disabled' : ''}>${esc(label)}</button>`;
}

function eventRow(event) {
  const ts = Number(event.ts);
  const firstLine = String(event.message ?? '').split('\n')[0];
  return `<li><div><strong>${esc(eventNames[event.type] ?? '보안 알림')}</strong>${firstLine ? `<p>${esc(firstLine)}</p>` : ''}</div>
    <time>${Number.isFinite(ts) ? displayTime.format(ts) : ''}</time></li>`;
}

function waitingRows(actions, busy) {
  return actions.map(action => `<li><div><span class="trust-request-state">${actionStates[action.status]}</span>
    <strong>${esc(action.summary || '송금 요청')}</strong><small>${esc(people[action.requester]?.name || '가족')} 요청</small></div>
    ${action.canCancel ? command('cancel', '요청 취소', busy, {requestId:action.id}) : ''}</li>`).join('');
}

function trustFacts(snapshot) {
  const facts = [
    ['연결된 계정', snapshot.linkCount],
    ['봉인된 증거', snapshot.evidenceCount],
    ['감사 기록', snapshot.audit?.count],
  ].filter(([, value]) => Number.isInteger(value) && value >= 0);
  return facts.length ? `<dl class="trust-facts" aria-label="보안 요약">${facts.map(([label, value]) =>
    `<div><dt>${label}</dt><dd>${value}건</dd></div>`).join('')}</dl>` : '';
}

export function renderTrustProfile({roomName, canOpenChat, snapshot, busy, notice, error, confirmLock}) {
  const name = esc(people.fa.name);
  const waiting = (snapshot?.actions ?? []).filter(action => Object.hasOwn(actionStates, action.status));
  const alert = snapshot?.locked || waiting.some(action => action.status === 'held');
  const mood = waiting.length ? 'thinking' : 'profile';
  const header = `<header class="trust-profile-header">${avatar('fa',52,alert ? 'alert' : mood)}<div><h2 id="modal-title">${name}</h2>
    <p>${esc(people.fa.description)}</p></div><button type="button" class="trust-close" data-action="close-dialog" aria-label="닫기">${icon('close',20)}</button></header>`;
  const footer = canOpenChat
    ? `<footer class="trust-profile-footer"><button type="button" class="trust-button secondary" data-action="profile-chat" data-id="fa">${icon('chat',17)} ${name} 채팅 열기</button></footer>` : '';
  if (!roomName) return `${header}<div class="trust-profile-body">
    <div class="trust-empty"><strong>${name} 송금 보안</strong><p>${name}와 같은 채팅방에 참여하면 보안 상태를 볼 수 있어요.</p></div></div>${footer}`;

  const controls = snapshot?.controls ?? {};
  const recent = (snapshot?.events ?? []).filter(event => Object.hasOwn(eventNames, event.type)).slice().reverse();
  const status = snapshot?.enabled ? securityStatus(snapshot, waiting) : null;
  const facts = status ? trustFacts(snapshot) : '';
  const statusText = error || (snapshot?.enabled === false ? '이 데모에 송금 보안이 연결되지 않았어요.'
    : busy ? '보안 상태를 확인하고 있어요.' : '이 방의 보안 상태를 아직 확인할 수 없어요.');
  const lockControl = snapshot?.locked && controls.canUnlock
    ? command('unlock','잠금 해제 동의',busy)
    : controls.canLock && !snapshot?.locked && !confirmLock ? command('lock','긴급 잠금',busy,{variant:'danger'}) : '';
  return `${header}<div class="trust-profile-body" aria-busy="${Boolean(busy)}">
    <div class="trust-section-title"><div><h3>송금 보안</h3><p>${esc(roomName)}</p></div>
      <button type="button" class="trust-refresh" data-action="trust-refresh" ${busy ? 'disabled' : ''}>새로고침</button></div>
    ${status ? `<section class="trust-profile-status ${status.tone}"><span class="trust-status-icon">${icon(status.icon,20)}</span>
      <div><strong>${status.title}</strong><p>${esc(status.body)}</p></div>${lockControl}</section>`
      : `<div class="trust-empty"><p>${esc(statusText)}</p></div>`}
    ${confirmLock ? `<section class="trust-lock-confirm">
      <p>송금을 잠그고 처리 중인 송금 요청을 취소할까요?</p>
      <div><button type="button" class="trust-button secondary" data-action="trust-cancel-confirm">돌아가기</button>
      ${command('lock','송금 잠금',busy,{variant:'danger'})}</div></section>` : ''}
    ${notice || (status && error) ? `<p class="trust-notice" role="status">${esc(error || notice)}</p>` : ''}
    ${status ? `<section class="trust-profile-section"><div class="trust-section-title"><h3>처리 중인 요청</h3><span>${waiting.length}건</span></div>
        ${waiting.length ? `<ul class="trust-request-list">${waitingRows(waiting,busy)}</ul>` : '<p class="trust-empty-line">처리 중인 요청이 없어요.</p>'}</section>
      <section class="trust-profile-section"><div class="trust-section-title"><h3>최근 보안 기록</h3><span>${snapshot.audit?.verified ? '기록 검증됨' : '기록 확인 필요'}</span></div>
        ${recent.length ? `<ul class="trust-event-list">${recent.slice(0,3).map(eventRow).join('')}</ul>` : '<p class="trust-empty-line">이 방에 표시할 기록이 없어요.</p>'}
        ${recent.length > 3 || controls.canImpostor || facts ? `<details><summary>자세히 보기</summary>
          ${facts}
          ${recent.length > 3 ? `<ul class="trust-event-list">${recent.slice(3,10).map(eventRow).join('')}</ul>` : ''}
          ${controls.canImpostor ? command('impostor','사칭 승인 차단 시연',busy) : ''}</details>` : ''}
      </section><p class="trust-scope-note">데모 송금에 적용돼요. 구독 해지는 계정 주인이 따로 승인해요.</p>` : ''}
    </div>${footer}`;
}
