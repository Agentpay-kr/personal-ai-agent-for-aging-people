const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const INPUT_FORMS = new Map([
  ['service-name', {
    label: '서비스 이름',
    description: '확인할 서비스 이름만 입력해 주세요. 예시로 넷플릭스를 사용할 수 있어요.',
  }],
  ['preferred-time', {
    label: '원하는 시간',
    description: '일정에 편한 시간을 입력해 주세요. 예시로 오후 3시를 사용할 수 있어요.',
  }],
  ['task-detail', {
    label: '도움이 필요한 내용',
    description: '도움이 필요한 일을 짧게 입력해 주세요. 계정 정보나 인증번호는 빼 주세요.',
  }],
]);

const INSTRUCTIONS = [
  '너는 가족 단체 채팅방의 Family Agent 시연용 도우미다.',
  '한국어로 쉽고 짧게 답한다. 한 답변은 최대 세 문장으로 제한한다.',
  '계정 접근, 가상 머신 접속, 결제, 취소는 수행할 수 없다.',
  '가족의 계정을 연결하거나 변경하는 일에는 당사자의 승인이 필요하다고 안내한다.',
  '비밀번호, 인증번호, 카드번호 등 비밀 정보를 채팅으로 보내 달라고 요청하지 않는다.',
  '답변에 꼭 필요한 정보가 빠졌다면 답변 끝에 새 줄을 추가하고 [[INPUT: service-name]], [[INPUT: preferred-time]], [[INPUT: task-detail]] 중 하나만 쓴다.',
  '입력 양식은 각각 서비스 이름, 원하는 시간, 도움이 필요한 일을 뜻한다. 로그인, 개인 식별 정보, 금융 정보에는 양식을 쓰지 않는다.',
].join('\n');

function providerSettings(env) {
  const key = env.FA_API_KEY?.trim();
  const model = env.FA_MODEL?.trim();
  const base = env.FA_API_BASE_URL?.trim();
  if (!key && !model && !base) return null;
  if (!model || (!key && !base)) {
    throw new Error('FA_MODEL과 FA_API_KEY 또는 FA_API_BASE_URL을 설정해 주세요.');
  }

  const url = URL.parse(base || DEFAULT_BASE_URL);
  if (!url || url.username || url.password || url.search || url.hash
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname)))) {
    throw new Error('FA_API_BASE_URL에는 HTTPS 주소나 로컬 HTTP 주소를 사용해 주세요.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/chat/completions';
  return { key, model, url };
}

function demoText(content) {
  if (/구독|해지|멤버십|정기[ ]?결제/.test(content)) {
    const owners = ['엄마', '아빠', '아들'].filter((name) => content.includes(name));
    const owner = owners.length === 1 ? owners[0] : '계정 주인';
    return `구독을 정리하려면 먼저 ${owner}의 구독 목록을 확인하면 돼요. 계정 연결과 해지에는 ${owner}의 승인이 필요해요.`;
  }
  if (/송금|이체|비밀번호|인증번호/.test(content)) {
    return '송금은 할 수 없어요. 비밀번호나 인증번호도 채팅방에 올리지 말아 주세요.';
  }
  if (/로그인|연결|이메일|계정/.test(content)) {
    return '계정 주인이 본인 화면에서 연결을 승인하면 돼요. 연결에 필요한 정보는 단체방에 남기지 않아요.';
  }
  if (/누구|안녕|무엇|할 수/.test(content)) {
    return '안녕하세요, 가족 채팅방의 FA예요. 예를 들어 “엄마 구독 정리해줘”라고 말해 보세요.';
  }
  return '지금은 정해진 예시로 답하는 시연 모드예요. 가족 계정 연결이나 구독 정리를 물어보세요.';
}

function parseReply(content) {
  const lines = content.trim().split(/\r?\n/);
  const marker = lines.at(-1).match(/^\[\[INPUT: ([a-z-]{1,45})\]\]$/);
  const request = INPUT_FORMS.get(marker?.[1]);
  const text = lines.filter((line) => !line.trim().startsWith('[[INPUT:')).join('\n').trim();
  if (request) return { text: text.slice(0, 6_000) || '아래에 필요한 정보를 입력해 주세요.', request };
  if (!text) throw new Error('Model returned no text');
  return { text: text.slice(0, 6_000) };
}

export function createAgent(env) {
  const provider = providerSettings(env);
  if (!provider) {
    return {
      mode: 'demo',
      async reply({ messages }) {
        const { content } = messages.at(-1);
        if (/서비스\s*이름.*입력.*요청/.test(content)) {
          return { text: '어떤 서비스인지 알려 주세요.', request: INPUT_FORMS.get('service-name') };
        }
        return { text: demoText(content) };
      },
    };
  }

  return {
    mode: 'live',
    async reply({ messages, speaker, participants }, signal) {
      const headers = { 'content-type': 'application/json' };
      if (provider.key) headers.authorization = `Bearer ${provider.key}`;

      const response = await fetch(provider.url, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: 'system', content: INSTRUCTIONS },
            { role: 'user', content: `채팅 참가자 정보 ${JSON.stringify({ speaker, participants })}` },
            ...messages,
          ],
        }),
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Model rejected the request');
      }
      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new Error('Model returned no text');
      return parseReply(text);
    },
  };
}
