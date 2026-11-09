// fa-trust panel: tap FA in a chat (profile, name or speech bubble) to open it.
// A simple sheet: one status line, the last 3 security events, and "자세히" for the rest.
// Self-contained: reads the demo id the chat app stores, polls /api/trust, no changes to app.mjs.

const STORE_KEY = 'family-agent-kakao-demo-v1';
const TYPES = {
  decision: ['🧭', '정책 판정'],
  family_alert: ['👨‍👩‍👦', '가족에게 알림'],
  approval: ['🔏', '기기 승인'],
  scheduled: ['⏳', '실행 대기'],
  executed: ['✅', '실행 완료'],
  shredded: ['🔥', '데이터 소멸'],
  evidence: ['🧾', '증거 봉인'],
  proof_failed: ['🎭', '사칭 차단'],
  lockdown: ['🔒', '긴급 잠금'],
  unlocked: ['🔓', '잠금 해제'],
  linked: ['🔑', '계정 연결'],
  rejected: ['🛑', '취소'],
  expired: ['⌛', '만료'],
  member_removed: ['🚪', '구성원 제거'],
};
// Shown in "최근" (others such as info stay in the full list only).
const HEADLINE = new Set(Object.keys(TYPES));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const firstLine = (s) => String(s ?? '').split('\n')[0].replace(/^[^\p{L}\d"“]+/u, '');

function demoId() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY))?.routerDemoId ?? null;
  } catch {
    return null;
  }
}

let open = false;
let details = false;
let currentDemo = null;
let since = 0;
let events = [];
let snap = null;
let unseen = 0;

const sheet = document.createElement('div');
sheet.className = 'trust-sheet-root';
sheet.hidden = true;
document.body.append(sheet);

function setOpen(value) {
  open = value;
  if (open) unseen = 0;
  if (!open) details = false;
  sheet.hidden = !open;
  document.body.classList.toggle('trust-unseen', unseen > 0);
  render();
}

// Tap FA's profile, name or bubble in a chat (not the card buttons) to open the panel.
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.trust-sheet-root')) return;
  const fromDrawer = target.closest('.drawer-bot');
  const message = target.closest('article.message.theirs[data-sender="fa"]');
  if (!fromDrawer && !message) return;
  if (message && (target.closest('.fa-card') || target.closest('button, a, input, select, textarea'))) return;
  event.preventDefault();
  setOpen(true);
});
document.addEventListener('keydown', (event) => {
  if (open && event.key === 'Escape') setOpen(false);
});

function status() {
  const lastLock = events.slice().reverse().find((e) => e.type === 'lockdown' || e.type === 'unlocked');
  if (lastLock?.type === 'lockdown') return ['danger', '🔒 긴급 잠금 중', '가족 2명이 기기로 동의하면 풀려요.'];
  const actions = snap?.actions ?? [];
  const held = actions.filter((a) => a.status === 'held');
  if (held.length) return ['warn', `⏸️ 보류 중인 요청 ${held.length}건`, firstLine(held.at(-1).summary) + ' · 가족 확인이 필요해요.'];
  const waiting = actions.filter((a) => a.status === 'pending' || a.status === 'scheduled');
  if (waiting.length) return ['warn', `⏳ 승인 대기 ${waiting.length}건`, waiting.at(-1).summary];
  return ['ok', '🟢 안전해요', '돈이 나가는 일은 가족 승인 없이 실행되지 않아요.'];
}

function facts() {
  const bank = snap?.links?.find((l) => l.owner === 'mom' && l.service === 'bank');
  const list = [
    bank ? '🔑 열쇠 3조각 중 2개 필요' : '🔑 연결된 열쇠 없음',
    `🧾 증거 ${snap?.evidence?.length ?? 0}건`,
    `📜 기록 ${snap?.audit?.count ?? 0}건 ${snap?.audit?.verified === false ? '⚠️' : '✓'}`,
  ];
  return list.map((f) => `<span>${esc(f)}</span>`).join('');
}

function eventRow(e) {
  const [icon, label] = TYPES[e.type] ?? ['ℹ️', '알림'];
  return `<li><span class="trust-ico">${icon}</span><div><strong>${esc(label)}</strong><p>${esc(firstLine(e.message))}</p></div><time>${time(e.ts)}</time></li>`;
}

let lastKey = '';

function render(force = false) {
  if (!open) {
    lastKey = '';
    return;
  }
  // Redraw only when something changed, so buttons don't get replaced under the pointer.
  const key = JSON.stringify([since, details, snap?.enabled, snap?.actions?.map((a) => a.status), snap?.links?.length, snap?.evidence?.length, snap?.audit?.count]);
  if (!force && key === lastKey) return;
  lastKey = key;
  if (snap && snap.enabled === false) {
    sheet.innerHTML = `<div class="trust-backdrop"></div><section class="trust-sheet" role="dialog" aria-label="신뢰 패널">
      <header><strong>🛡️ 치즈 신뢰 패널</strong><button type="button" class="trust-close" aria-label="닫기">✕</button></header>
      <p class="trust-off">보안 코어(fa-trust)가 연결되지 않았어요.</p></section>`;
    bind();
    return;
  }
  const [tone, title, sub] = status();
  const recent = events.filter((e) => HEADLINE.has(e.type)).slice(-3).reverse();
  sheet.innerHTML = `<div class="trust-backdrop"></div>
    <section class="trust-sheet" role="dialog" aria-label="신뢰 패널">
      <header><strong>🛡️ 치즈 신뢰 패널</strong><button type="button" class="trust-close" aria-label="닫기">✕</button></header>
      <div class="trust-status ${tone}"><strong>${esc(title)}</strong><p>${esc(sub)}</p></div>
      <div class="trust-facts">${facts()}</div>
      <h3>최근 보안 기록</h3>
      <ul class="trust-recent">${recent.length ? recent.map(eventRow).join('') : '<li class="trust-none">아직 기록이 없어요. 송금을 요청해 보세요.</li>'}</ul>
      <button type="button" class="trust-more" aria-expanded="${details}">${details ? '접기 ▴' : '자세히 ▾'}</button>
      ${details ? `<div class="trust-details">
        <ul class="trust-all">${events.slice().reverse().map((e) => {
          const [icon, label] = TYPES[e.type] ?? ['ℹ️', '알림'];
          return `<li><div class="trust-all-head"><span>${icon} ${esc(label)}</span><time>${time(e.ts)}</time></div><p>${esc(e.message).replace(/\n/g, '<br>')}</p></li>`;
        }).join('')}</ul>
        <button type="button" class="trust-impostor">🎭 데모: 사칭범이 엄마 이름으로 승인 시도</button>
        <p class="trust-note">LLM은 할 일을 제안만 하고, 실행 여부는 보안 코어 코드가 정해요.</p>
      </div>` : ''}
    </section>`;
  bind();
}

function bind() {
  sheet.querySelector('.trust-backdrop')?.addEventListener('click', () => setOpen(false));
  sheet.querySelector('.trust-close')?.addEventListener('click', () => setOpen(false));
  sheet.querySelector('.trust-more')?.addEventListener('click', () => {
    details = !details;
    render();
  });
  sheet.querySelector('.trust-impostor')?.addEventListener('click', impostor);
}

async function impostor() {
  const id = demoId();
  if (!id) return;
  const res = await fetch(`/api/trust/impostor?demo_id=${id}`, { method: 'POST' }).then((r) => r.json()).catch(() => null);
  if (res && !res.ok && res.message) alert(res.message);
  poll();
}

async function poll() {
  const id = demoId();
  if (!id) return;
  if (id !== currentDemo) {
    currentDemo = id;
    since = 0;
    events = [];
    unseen = 0;
  }
  try {
    const res = await fetch(`/api/trust?demo_id=${id}&since=${since}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    snap = await res.json();
    if (snap.events?.length) {
      events.push(...snap.events);
      since = snap.events.at(-1).seq;
      if (!open) unseen += snap.events.filter((e) => e.type !== 'linked').length;
    }
    document.body.classList.toggle('trust-unseen', unseen > 0);
    render();
  } catch {
    // Server restarting; try again on the next tick.
  }
}

poll();
setInterval(poll, 1000);
