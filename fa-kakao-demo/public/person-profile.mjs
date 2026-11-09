import { avatar, icon, people } from './visual.mjs';

export const PERSON_PROFILE_WIDTH = 328;
export const PERSON_PROFILE_HEIGHT = 486;

const callSymbols = {
  phone: '<path d="M21 16.5v2.4a2 2 0 0 1-2.2 2 17.7 17.7 0 0 1-7.7-2.8 17.4 17.4 0 0 1-5.3-5.3A17.7 17.7 0 0 1 3 5.1 2 2 0 0 1 5 3h2.4a2 2 0 0 1 2 1.7l.6 2.7a2 2 0 0 1-.5 2.1l-1 1a14.2 14.2 0 0 0 5 5l1-1a2 2 0 0 1 2.1-.5l2.7.6a2 2 0 0 1 1.7 1.9z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z"/>',
};

const symbol = (name, size = 19) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${callSymbols[name]}</svg>`;
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const closeButton = `<button type="button" class="person-profile-close" data-action="close-dialog" aria-label="프로필 닫기">${icon('close', 19)}</button>`;

export function renderPersonProfile({ person, actor, status, favorite = false, view }) {
  if (person === 'fa' || !Object.hasOwn(people, person)) return '';
  const own = person === actor;
  const name = escapeText(people[person].name);
  const message = escapeText(status ?? people[person].description.trim());

  if (view === 'edit' && own) {
    return `<form class="person-profile-detail" id="dialog-form">
      <header class="person-profile-detail-heading"><h2 id="modal-title">프로필 편집</h2>${closeButton}</header>
      <div class="person-profile-detail-content">
        <label for="profile-status">상태 메시지</label>
        <textarea name="status" id="profile-status" rows="3" maxlength="60" placeholder="상태 메시지를 입력하세요">${message}</textarea>
      </div>
      <footer class="person-profile-detail-actions">
        <button type="button" class="action-button secondary" data-action="close-dialog">취소</button>
        <button type="submit" class="action-button primary">저장</button>
      </footer>
    </form>`;
  }

  if (view === 'call' && !own) {
    return `<section class="person-profile-detail">
      <header class="person-profile-detail-heading"><h2 id="modal-title">${name}에게 통화</h2>${closeButton}</header>
      <div class="person-profile-detail-content">
        <ul class="person-profile-call-types" aria-label="통화 종류">
          <li>${symbol('phone')} 보이스톡</li>
          <li>${symbol('video')} 페이스톡</li>
        </ul>
        <p>발표용 미리보기예요. 실제 통화는 연결되지 않아요.</p>
      </div>
      <footer class="person-profile-detail-actions"><button type="button" class="action-button secondary" data-action="close-dialog">닫기</button></footer>
    </section>`;
  }

  return `<section class="person-profile-card">
    <header class="person-profile-top">
      ${own ? '' : `<button type="button" class="person-profile-favorite" data-action="profile-favorite" data-id="${person}" aria-pressed="${Boolean(favorite)}" aria-label="즐겨찾기">${symbol('star')}</button>`}
      ${closeButton}
    </header>
    <div class="person-profile-identity">
      ${avatar(person, 76)}
      <h2 id="modal-title">${name}</h2>
      ${message ? `<p>${message}</p>` : ''}
    </div>
    <footer class="person-profile-actions">
      ${own ? `<button type="button" data-action="profile-edit" data-id="${person}">${icon('edit', 18)} 프로필 편집</button>` : `
        <button type="button" data-action="profile-chat" data-id="${person}">${icon('chat', 18)} 1:1 채팅</button>
        <button type="button" data-action="profile-call" data-id="${person}">${symbol('phone', 18)} 통화</button>`}
    </footer>
  </section>`;
}
