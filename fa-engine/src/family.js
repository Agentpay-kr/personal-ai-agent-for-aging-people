// Family seed data for the demo. Everything here is sample data.

export const FA_ID = 'fa';

export function seedFamily() {
  return {
    members: {
      son: { id: 'son', name: '승빈', relation: '아들', role: 'guardian', avatar: '👦' },
      mom: { id: 'mom', name: '엄마', relation: '엄마', role: 'elder', avatar: '👩', address: '서울시 송파구 (예시 주소)' },
      dad: { id: 'dad', name: '아빠', relation: '아빠', role: 'elder', avatar: '👨', address: '서울시 송파구 (예시 주소)' },
      fa: { id: FA_ID, name: 'FA', relation: '가족 AI', role: 'agent', avatar: '🤖' },
    },
    // Who each account owner has delegated to, and for which tiers.
    // Money ("money" tier) is never delegable: it always needs the owner + one co-signer.
    delegations: {
      mom: { son: ['read', 'setup', 'act'], dad: ['read'] },
      dad: { son: ['read', 'setup', 'act'], mom: ['read'] },
      son: {},
    },
    limits: {
      // An owner's own order up to this price runs without a confirm card.
      // Anything above is treated as a money action.
      orderAutoApproveKRW: 50000,
    },
    // Each owner can switch family help off. While revoked, nobody else can act for them.
    consent: { son: 'active', mom: 'active', dad: 'active' },
  };
}

export function familyMemberIds(family) {
  return Object.values(family.members)
    .filter((m) => m.role !== 'agent')
    .map((m) => m.id);
}

export function nameOf(family, id) {
  return family.members[id]?.name ?? id;
}

// Templates write "<name>님<particle>". Family titles read wrong with 님 ("엄마님이"),
// so rewrite them to the natural form ("엄마가", "아빠에게", "FA를").
const PARTICLE = { '': '', 에게: '에게', 께: '께', 이: '가', 은: '는', 을: '를', 과: '와' };
const TITLE_RE = /(엄마|아빠|FA)님(에게|께|이|은|을|과)?/g;

export function polish(text) {
  if (typeof text !== 'string') return text;
  return text.replace(TITLE_RE, (_, who, p = '') => `${who}${PARTICLE[p]}`);
}
