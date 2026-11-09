// FA's brain. Two modes:
//   llm      - Claude (tool use). Used when ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set.
//   scripted - deterministic intent matching. Used with no key, on API failure, or FA_MODE=scripted.
// Both modes call the same requestAction gateway, so the permission engine applies either way.

import Anthropic from '@anthropic-ai/sdk';
import { nameOf } from './family.js';
import { findSubscriptions } from './vm.js';

const MODEL = process.env.FA_MODEL ?? 'claude-opus-5-5';
const EFFORT = process.env.FA_EFFORT ?? 'low'; // chat route: low effort keeps replies fast
const MAX_TURNS = 6;

export function agentMode() {
  if (process.env.FA_MODE === 'scripted') return 'scripted';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'llm';
  return 'scripted';
}

let client;
const getClient = () => (client ??= new Anthropic());

// ------------------------------------------------------------------ LLM

const MEMBER_IDS = ['mom', 'dad', 'son'];
const ownerProp = { type: 'string', enum: MEMBER_IDS, description: 'Whose account/VM this runs on (mom, dad, or son).' };

export const TOOLS = [
  {
    name: 'scan_subscriptions',
    description: "Scan a family member's email inside their own VM for recurring subscriptions. Posts a selectable list card in the chat.",
    input_schema: { type: 'object', properties: { owner: ownerProp }, required: ['owner'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'cancel_subscription',
    description: "Cancel subscriptions in the owner's VM. Use subscription ids returned by scan_subscriptions.",
    input_schema: {
      type: 'object',
      properties: { owner: ownerProp, subscription_ids: { type: 'array', items: { type: 'string' } } },
      required: ['owner', 'subscription_ids'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'order_item',
    description: "Order groceries or household items on Coupang from the owner's account, delivered to the owner's home.",
    input_schema: {
      type: 'object',
      properties: {
        owner: ownerProp,
        item: { type: 'string', description: 'Item name in Korean, e.g. 쌀 10kg' },
        quantity: { type: 'integer' },
        price: { type: 'integer', description: 'Estimated total price in KRW' },
      },
      required: ['owner', 'item', 'quantity', 'price'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'transfer_money',
    description: "Transfer money from the owner's bank account. `to` is a family member id, or 'external' for anyone else.",
    input_schema: {
      type: 'object',
      properties: {
        owner: ownerProp,
        to: { type: 'string', enum: [...MEMBER_IDS, 'external'] },
        amount: { type: 'integer', description: 'Amount in KRW' },
      },
      required: ['owner', 'to', 'amount'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'connect_account',
    description: 'Send a secure connect card for an account (email, coupang, bank). Only the owner can fill it in; passwords never appear in the chat.',
    input_schema: {
      type: 'object',
      properties: { owner: ownerProp, service: { type: 'string', enum: ['email', 'coupang', 'bank'] } },
      required: ['owner', 'service'],
      additionalProperties: false,
    },
    strict: true,
  },
];

const SYSTEM = `You are FA (가족 AI), a family AI agent that lives in a KakaoTalk group chat of a Korean family.
Family members: 승빈 (id: son, the son, comfortable with AI), 엄마 (id: mom), 아빠 (id: dad). The parents are in their 60s and not comfortable with technology. The son set you up so he can help his parents remotely instead of visiting in person.

How you work:
- Every action runs inside the account owner's own VM. Set \`owner\` to the person whose account is used ("엄마 구독 정리해줘" → owner mom). "내/제/나" means the person who sent the message.
- A family permission engine checks every tool call and decides who must approve. If a tool result says waiting_approval, waiting_input, blocked, or denied, tell the family in plain words what happens next. Don't retry a denied action and don't try to work around it.
- Never ask anyone to type a password, card number, or bank details in the chat. Connecting an account always goes through connect_account, which sends a secure card only the owner can fill in.
- Cards in the chat already show lists, prices, and buttons. Keep your own message to 1-3 short sentences and don't repeat the card contents.
- Write in Korean. Be warm and simple, use 존댓말 with the parents, and avoid English and technical terms.
- If someone is just chatting, reply briefly and kindly. If a request is outside what your tools can do, say so honestly.`;

function textOf(content) {
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function replyWithClaude({ family, requester, text, context, requestAction }, state) {
  const messages = [
    {
      role: 'user',
      content: `${context}\n\n새 메시지 — 보낸 사람: ${nameOf(family, requester)} (id: ${requester})\n${text}`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'refusal') return null;
    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      return textOf(response.content);
    }

    const results = [];
    for (const tu of toolUses) {
      try {
        const input = typeof tu.input === 'string' ? JSON.parse(tu.input) : tu.input;
        state.executed = true;
        const result = await requestAction({ action: tu.name, input });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result.forModel) });
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(err?.message ?? err), is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return '잠시 후 다시 말씀해 주세요.';
}

export async function replyAsFa(args) {
  if (agentMode() === 'llm') {
    const state = { executed: false };
    try {
      const reply = await replyWithClaude(args, state);
      if (reply !== null) return reply || null;
      // Declined mid-turn after an action already went through: never replay it.
      if (state.executed) return '처리 중에 멈췄어요. 위 카드 상태를 확인해 주세요.';
      console.warn('[FA] Claude declined the request; using scripted mode.');
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error('[FA] Invalid API key; using scripted mode.');
      else if (err instanceof Anthropic.RateLimitError) console.error('[FA] Rate limited; using scripted mode.');
      else if (err instanceof Anthropic.APIError) console.error(`[FA] API error ${err.status}; using scripted mode:`, err.message);
      else console.error('[FA] Claude call failed; using scripted mode:', err);
      // Don't re-run actions that already went through the gateway.
      if (state.executed) return '처리 중에 문제가 생겼어요. 위 카드 상태를 확인해 주세요.';
    }
  }
  return replyScripted(args);
}

// ------------------------------------------------------------- scripted

const WHO = [
  [/엄마|어머니/, 'mom'],
  [/아빠|아버지/, 'dad'],
  [/승빈|아들/, 'son'],
];
const idOf = (word) => WHO.find(([re]) => re.test(word))?.[1] ?? null;
const mentioned = (t) => idOf(t);
const isSelf = (t) => /(^|\s)(내|제|나의|저의|나|저)\s/.test(t) || /^(내|제)/.test(t);

function serviceIn(t) {
  if (/이메일|메일|gmail|지메일/i.test(t)) return 'email';
  if (/쿠팡/.test(t)) return 'coupang';
  if (/은행|뱅킹/.test(t)) return 'bank';
  return null;
}

function amountIn(t) {
  const m = t.match(/(\d[\d,]*)\s*(만)?\s*원/);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (m[2]) n *= 10000;
  return n;
}

export async function replyScripted({ family, requester, text, requestAction }) {
  const t = text.replace(/\s+/g, ' ').trim();
  const who = mentioned(t);
  const ownerFor = () => (isSelf(t) ? requester : who ?? requester);
  const act = async (action, input) => (await requestAction({ action, input })).say;

  // "엄마 계좌에서 50만원만 내 계좌로 옮겨줘"
  if (/(옮겨|보내|송금|이체)/.test(t) && amountIn(t)) {
    const fromM = t.match(/(엄마|어머니|아빠|아버지|승빈|아들)\s*(의)?\s*(통장|계좌)/);
    const owner = fromM ? idOf(fromM[1]) : requester;
    let to;
    if (/(내|제)\s*(통장|계좌)|나한테|저한테|나에게|저에게/.test(t)) to = requester;
    else {
      const toM = t.match(/(엄마|어머니|아빠|아버지|승빈|아들)\s*(한테|에게|계좌로|통장으로)/);
      to = toM ? idOf(toM[1]) : 'external';
    }
    return act('transfer_money', { owner, to, amount: amountIn(t) });
  }

  // "엄마 이메일 연동 시작해줘" / "내 이메일 계정을 연동해줘"
  if (/(연동|연결|로그인)/.test(t) && serviceIn(t)) {
    return act('connect_account', { owner: ownerFor(), service: serviceIn(t) });
  }

  // "왓챠랑 운세 해지해줘"
  if (/해지|취소/.test(t)) {
    const owner = ownerFor();
    const subs = findSubscriptions(owner, t);
    if (subs.length) return act('cancel_subscription', { owner, subscription_ids: subs.map((s) => s.id) });
  }

  // "엄마 구독 정리해줘"
  if (/구독|정기\s*결제|자동\s*결제/.test(t)) {
    return act('scan_subscriptions', { owner: ownerFor() });
  }

  // "쌀이 떨어져서 10kg 주문해줘"
  if (/(주문|사\s*줘|시켜)/.test(t)) {
    const rice = /쌀/.test(t);
    const item = rice ? `쌀 ${t.match(/(\d+)\s*(kg|킬로)/i)?.[1] ?? 10}kg` : (t.match(/([가-힣A-Za-z0-9]+)\s*(좀\s*)?(주문|사\s*줘|시켜)/)?.[1] ?? '생필품');
    return act('order_item', { owner: ownerFor(), item, quantity: 1, price: rice ? 32900 : 15000 });
  }

  if (/안녕|하이|반가/.test(t)) {
    return `안녕하세요 ${nameOf(family, requester)}님 🙂 필요한 일이 있으면 편하게 말씀해 주세요.`;
  }

  return '제가 도와드릴 수 있는 일이에요 🙂\n• 구독 정리 ("엄마 구독 정리해줘")\n• 장보기 주문 ("쌀 10kg 주문해줘")\n• 계정 연결 ("엄마 이메일 연결해줘")';
}
