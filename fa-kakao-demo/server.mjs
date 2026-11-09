import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAgent } from './agent.mjs';
import { createRouter, validRouterRequest } from './router.mjs';

const PUBLIC = fileURLToPath(new URL('./public', import.meta.url));
const LOOPBACK = new Set(['127.0.0.1', 'localhost']);
const MAX_BODY_BYTES = 65_536;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && value.trim().length > 0;
}

function validateChat(body) {
  return validText(body?.speaker, 80)
    && Array.isArray(body.participants) && body.participants.length <= 20
    && body.participants.every((name) => validText(name, 80))
    && Array.isArray(body.messages) && body.messages.length <= 30
    && body.messages.at(-1)?.role === 'user'
    && body.messages.every((message) => (
      (message?.role === 'user' || message?.role === 'assistant') && validText(message.content, 6_000)
    ));
}

async function readJson(request, response, origin) {
  if (request.headers.origin && request.headers.origin !== origin) {
    json(response, 403, { error: '이 데모 페이지에서만 요청할 수 있어요.' });
    return;
  }
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    json(response, 415, { error: 'JSON 메시지가 필요해요.' });
    return;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      request.resume();
      json(response, 413, { error: '보낼 대화가 너무 길어요. 메시지를 줄여 주세요.' });
      return;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    json(response, 400, { error: '대화 요청을 읽지 못했어요.' });
  }
}

async function handleChat(request, response, agent, origin) {
  const body = await readJson(request, response, origin);
  if (body === undefined) return;
  if (!validateChat(body)) return json(response, 400, { error: '대화 요청을 확인해 주세요.' });

  const abort = new AbortController();
  response.once('close', () => abort.abort());
  try {
    const messages = body.messages.map(({ role, content }) => ({ role, content }));
    const reply = await agent.reply({ ...body, messages }, abort.signal);
    return json(response, 200, { ...reply, mode: agent.mode });
  } catch {
    if (!abort.signal.aborted) {
      return json(response, 502, { error: 'LLM API 응답을 받지 못했어요. 설정을 확인하거나 다시 시도해 주세요.' });
    }
  }
}

async function serveStatic(request, response, pathname) {
  const path = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = resolve(PUBLIC, '.' + path);
  const type = MIME_TYPES[extname(file)];
  if (!file.startsWith(PUBLIC + sep) || !type) {
    return json(response, 404, { error: '페이지를 찾을 수 없어요.' });
  }
  try {
    const [root, realFile] = await Promise.all([realpath(PUBLIC), realpath(file)]);
    if (!realFile.startsWith(root + sep)) throw new Error('Outside static root');
    const body = await readFile(realFile);
    response.writeHead(200, { 'content-type': type, 'content-length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    return json(response, 404, { error: '페이지를 찾을 수 없어요.' });
  }
}

export function createDemoServer(env = process.env) {
  const agent = createAgent(env);
  const router = createRouter();

  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('x-frame-options', 'DENY');
    const host = URL.parse(`http://${request.headers.host}`);
    if (!host || !LOOPBACK.has(host.hostname) || host.host !== request.headers.host) {
      return json(response, 403, { error: '로컬 데모 주소로 접속해 주세요.' });
    }

    try {
      const { pathname } = new URL(request.url, host.origin);
      if (request.method === 'GET' && pathname === '/api/status') {
        return json(response, 200, { mode: agent.mode });
      }
      if (request.method === 'POST' && pathname === '/api/chat') {
        return await handleChat(request, response, agent, host.origin);
      }
      if (request.method === 'POST' && pathname === '/api/router') {
        const body = await readJson(request, response, host.origin);
        if (body === undefined) return;
        if (!validRouterRequest(body)) {
          return json(response, 400, { error: 'FA 작업 요청을 확인해 주세요.' });
        }
        const result = router.handle(body);
        if (!result) {
          return json(response, 409, { error: '채팅방 참여자가 바뀌었어요. 새 FA 카드에서 시작해 주세요.' });
        }
        return json(response, 200, result);
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        return await serveStatic(request, response, pathname);
      }
      return json(response, 405, { error: '지원하지 않는 요청이에요.' });
    } catch {
      if (!response.headersSent && !response.destroyed) {
        return json(response, 400, { error: '요청을 읽지 못했어요.' });
      }
    }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const port = Number(process.env.PORT || 4173);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
      throw new Error('PORT에는 0~65535 사이의 정수를 사용해 주세요.');
    }
    const server = createDemoServer();
    server.on('error', () => {
      console.error('데모 서버를 시작하지 못했어요. PORT가 사용 중인지 확인해 주세요.');
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Family Agent 데모: http://127.0.0.1:${server.address().port}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
