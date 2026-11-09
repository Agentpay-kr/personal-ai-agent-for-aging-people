// fa-trust panel: shows what the security core decided, next to the chat.
// Self-contained: reads the demo id the chat app stores, polls /api/trust, no changes to app.mjs.

const STORE_KEY = 'family-agent-kakao-demo-v1';
const OPEN_KEY = 'fa-trust-panel-open';
const TYPES = {
  decision: ['🧭', '정책 판정'],
  family_alert: ['👨‍👩‍👦', '가족 전체 알림'],
  approval: ['🔏', '기기 증명 승인'],
  scheduled: ['⏳', '실행 지연'],
  executed: ['✅', '실행 (시뮬레이션)'],
  shredded: ['🔥', '데이터 소멸'],
  evidence: ['🧾', '증거 봉인'],
  proof_failed: ['🎭', 'ZK 증명 실패'],
  lockdown: ['🔒', '긴급 잠금'],
  unlocked: ['🔓', '잠금 해제'],
  linked: ['🔑', '계정 연결 · 열쇠 분할'],
  rejected: ['🛑', '거절·취소'],
  expired: ['⌛', '만료'],
  member_removed: ['🚪', '구성원 제거'],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function demoId() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY))?.routerDemoId ?? null;
  } catch {
    return null;
  }
}

let open = false;
try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* storage may be blocked */ }
let currentDemo = null;
let since = 0;
let events = [];
let snap = null;
let unseen = 0;

const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'guide-button trust-toggle';
document.querySelector('.presentation')?.prepend(toggle);

const panel = document.createElement('aside');
panel.className = 'trust-panel';
panel.setAttribute('aria-label', '신뢰 패널');
document.body.append(panel);

function setOpen(value) {
  open = value;
  if (open) unseen = 0;
  document.body.classList.toggle('trust-open', open);
  try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  render();
}
toggle.addEventListener('click', () => setOpen(!open));

function chip(label, value, ok = true) {
  return `<div class="trust-chip ${ok ? '' : 'warn'}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function render() {
  toggle.innerHTML = `🔐 신뢰 패널${!open && unseen ? ` <span class="trust-badge">${unseen}</span>` : ''}`;
  toggle.setAttribute('aria-pressed', String(open));
  if (!open) return;
  if (snap && snap.enabled === false) {
    panel.innerHTML = '<header class="trust-head"><strong>🔐 신뢰 패널</strong><p>fa-trust가 설치되지 않았어요. 저장소의 fa-trust 폴더가 필요해요.</p></header>';
    return;
  }
  const bank = snap?.links?.find((l) => l.owner === 'mom' && l.service === 'bank');
  const lastLock = events.slice().reverse().find((e) => e.type === 'lockdown' || e.type === 'unlocked');
  const locked = lastLock?.type === 'lockdown';
  panel.innerHTML = `
    <header class="trust-head">
      <strong>🔐 fa-trust 신뢰 패널</strong>
      <p>LLM은 제안만 하고, 실행 여부는 코드가 정해요.</p>
    </header>
    <section class="trust-chips">
      ${chip('엄마 은행 열쇠', bank ? `2-of-3 · ${bank.holders.map((h) => ({ mom: '엄마폰', son: '아들폰', dad: '아빠폰', fa_server: '서버' })[h] ?? h).join('/')}` : (locked ? '소멸됨' : '없음'), Boolean(bank))}
      ${chip('봉인된 증거', `${snap?.evidence?.length ?? 0}건`)}
      ${chip('감사 로그', `${snap?.audit?.count ?? 0}건 · ${snap?.audit?.verified === false ? '체인 깨짐' : '해시 체인 ✓'}`, snap?.audit?.verified !== false)}
      ${chip('가족 키', locked ? '긴급 잠금' : `epoch ${snap?.epoch ?? 0}`, !locked)}
    </section>
    <section class="trust-demo">
      <button type="button" class="trust-impostor">🎭 사칭범이 엄마 이름으로 승인 시도</button>
    </section>
    <ol class="trust-events">
      ${events.length ? events.slice().reverse().map((e) => {
        const [icon, label] = TYPES[e.type] ?? ['ℹ️', e.type];
        return `<li class="trust-event type-${esc(e.type)}"><div class="trust-event-head"><span>${icon} ${esc(label)}</span><time>${time(e.ts)}</time></div><p>${esc(e.message).replace(/\n/g, '<br>')}</p></li>`;
      }).join('') : '<li class="trust-empty">아직 보안 이벤트가 없어요. 단톡방에서 송금을 요청해 보세요.<br>예: “엄마의 계좌에서 50만원만 내 계좌로 옮겨줘”</li>'}
    </ol>`;
  panel.querySelector('.trust-impostor')?.addEventListener('click', impostor);
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
      if (!open) unseen += snap.events.length;
    }
    render();
  } catch {
    // Server restarting; try again on the next tick.
  }
}

document.body.classList.toggle('trust-open', open);
render();
poll();
setInterval(poll, 1000);
