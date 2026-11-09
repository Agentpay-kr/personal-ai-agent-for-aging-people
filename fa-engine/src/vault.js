// Per-owner credential vault (in memory, demo only).
// Secrets go in and never come back out: callers only see "connected" + a masked id.

const secrets = new Map(); // `${owner}:${service}` -> { credentials, connectedAt, maskedId }

export const SERVICES = {
  email: { label: '이메일(Gmail)', fields: [
    { name: 'id', label: '이메일 주소', type: 'email' },
    { name: 'password', label: '비밀번호', type: 'password' },
  ] },
  coupang: { label: '쿠팡', fields: [
    { name: 'id', label: '쿠팡 아이디', type: 'text' },
    { name: 'password', label: '비밀번호', type: 'password' },
  ] },
  bank: { label: '은행', fields: [
    { name: 'id', label: '인터넷뱅킹 아이디', type: 'text' },
    { name: 'password', label: '비밀번호', type: 'password' },
  ] },
};

function mask(id = '') {
  const s = String(id);
  if (s.length <= 2) return '*'.repeat(s.length);
  const at = s.indexOf('@');
  if (at > 1) return `${s[0]}${'*'.repeat(at - 1)}${s.slice(at)}`;
  return `${s.slice(0, 2)}${'*'.repeat(Math.max(1, s.length - 2))}`;
}

export function resetVault() {
  secrets.clear();
  // Demo seed: mom's bank was linked during an earlier session.
  secrets.set('mom:bank', { credentials: { id: 'demo', password: 'demo' }, connectedAt: Date.now(), maskedId: 'de**' });
}

export function storeCredentials(owner, service, credentials) {
  const maskedId = mask(credentials?.id);
  secrets.set(`${owner}:${service}`, { credentials: { ...credentials }, connectedAt: Date.now(), maskedId });
  return { owner, service, maskedId };
}

export function isConnected(owner, service) {
  return secrets.has(`${owner}:${service}`);
}

export function connections(owner) {
  return Object.keys(SERVICES).map((service) => {
    const s = secrets.get(`${owner}:${service}`);
    return { service, label: SERVICES[service].label, connected: Boolean(s), maskedId: s?.maskedId ?? null };
  });
}

resetVault();
