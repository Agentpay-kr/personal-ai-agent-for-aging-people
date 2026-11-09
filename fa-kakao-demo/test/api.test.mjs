import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createDemoServer } from '../server.mjs';

const question = {
  speaker: '아들',
  participants: ['아들', '엄마', 'Family Agent'],
  messages: [{ role: 'user', content: '엄마의 구독을 대신 정리해줄 수 있어?' }],
};

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function chat(base, body = question, headers = {}) {
  return fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('answers in demo mode when provider settings are absent', async (t) => {
  const base = await listen(t, createDemoServer({}));
  const status = await fetch(`${base}/api/status`);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { mode: 'demo' });

  const response = await chat(base);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'demo');
  assert.match(body.text, /엄마/);
  assert.match(body.text, /승인/);
});

test('relays the current conversation to the configured model', async (t) => {
  let received;
  const provider = await listen(t, createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      path: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks)),
    };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '모델이 생성한 답변입니다.' } }] }));
  }));
  const base = await listen(t, createDemoServer({
    FA_API_BASE_URL: `${provider}/v1/`,
    FA_API_KEY: 'synthetic-test-key',
    FA_MODEL: 'test-chat-model',
  }));

  const status = await fetch(`${base}/api/status`);
  assert.deepEqual(await status.json(), { mode: 'live' });
  const response = await chat(base);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: '모델이 생성한 답변입니다.', mode: 'live' });
  assert.equal(received.path, '/v1/chat/completions');
  assert.equal(received.authorization, 'Bearer synthetic-test-key');
  assert.equal(received.body.model, 'test-chat-model');
  assert.deepEqual(received.body.messages.at(-1), question.messages.at(-1));
});

test('returns an error when a configured model fails without exposing its response', async (t) => {
  const provider = await listen(t, createServer((_request, response) => {
    response.writeHead(401).end('synthetic-provider-secret');
  }));
  const base = await listen(t, createDemoServer({
    FA_API_BASE_URL: `${provider}/v1`,
    FA_MODEL: 'test-chat-model',
  }));

  const response = await chat(base);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.doesNotMatch(body.error, /synthetic-provider-secret/);
});

test('rejects cross-origin chat, malformed roles, and oversized input', async (t) => {
  const base = await listen(t, createDemoServer({}));
  const crossOrigin = await chat(base, question, { origin: 'https://example.com' });
  assert.equal(crossOrigin.status, 403);

  const malformed = await chat(base, {
    ...question,
    messages: [{ role: 'system', content: '다른 지시' }],
  });
  assert.equal(malformed.status, 400);

  const oversized = await chat(base, {
    ...question,
    messages: [{ role: 'user', content: 'a'.repeat(65_536) }],
  });
  assert.equal(oversized.status, 413);
});

test('returns a server-owned input form and discards an unrecognized model field', async (t) => {
  let modelText = '어떤 서비스인지 알려 주세요.\n[[INPUT: service-name]]';
  const provider = await listen(t, createServer((request, response) => {
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: modelText } }] }));
  }));
  const base = await listen(t, createDemoServer({
    FA_API_BASE_URL: `${provider}/v1`,
    FA_MODEL: 'test-chat-model',
  }));

  const allowed = await chat(base);
  assert.deepEqual(await allowed.json(), {
    text: '어떤 서비스인지 알려 주세요.',
    mode: 'live',
    request: { label: '서비스 이름', description: '확인할 서비스 이름만 입력해 주세요. 예시로 넷플릭스를 사용할 수 있어요.' },
  });

  modelText = '입력 안내를 확인해 주세요.\n[[INPUT: password]]';
  const unknown = await chat(base);
  assert.deepEqual(await unknown.json(), { text: '입력 안내를 확인해 주세요.', mode: 'live' });
});

test('provides an offline example of a safe input request', async (t) => {
  const base = await listen(t, createDemoServer({}));
  const response = await chat(base, {
    ...question,
    messages: [{ role: 'user', content: '서비스 이름 입력을 요청해줘' }],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).request?.label, '서비스 이름');
});
