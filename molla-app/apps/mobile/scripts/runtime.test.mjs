import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { apiRequest, normalizeServerUrl, validateCredentials } from '../src/services/runtime.ts';

test('release connection accepts only HTTPS origins without URL credentials', () => {
  assert.equal(normalizeServerUrl('https://molla.example/'), 'https://molla.example');
  for (const url of ['http://molla.example', 'https://user:password@molla.example', 'https://molla.example/api', 'https://molla.example?token=secret', 'https://molla.example#token', 'file:///tmp/app']) assert.throws(() => normalizeServerUrl(url));
  assert.throws(() => normalizeServerUrl('http://127.0.0.1:4318'));
  assert.equal(normalizeServerUrl('http://127.0.0.1:4318', true), 'http://127.0.0.1:4318');
  assert.throws(() => normalizeServerUrl('http://192.168.1.8:4318', true));
  assert.throws(() => validateCredentials({ baseUrl: 'https://molla.example', token: 'key\nsecond' }));
});

async function withServer(handler, run) {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'test-owner-token' }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('requests send an owner bearer token, omit cookies, and preserve Korean content', async () => {
  await withServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-owner-token');
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.url, '/api/chat');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.deepEqual(body, { text: '오늘은 어떠세요?', requestId: 'same-retry-id' });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ reply: '반가워요.' }));
  }, async credentials => {
    assert.deepEqual(await apiRequest(credentials, '/chat', { text: '오늘은 어떠세요?', requestId: 'same-retry-id' }), { reply: '반가워요.' });
    await assert.rejects(apiRequest(credentials, '//evil.example'), /지원하지 않는/);
  });
});

test('unauthorized responses cannot silently become demo replies', async () => {
  await withServer((_req, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid"}'); }, async credentials => {
    await assert.rejects(apiRequest(credentials, '/state'), error => error.status === 401);
  });
});

test('redirects and non-JSON responses do not expose credentials or pass as app state', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/redirect') { res.writeHead(302, { Location: '/api/leak' }); res.end(); }
    else { assert.notEqual(req.url, '/api/leak'); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>Login</html>'); }
  }, async credentials => {
    await assert.rejects(apiRequest(credentials, '/redirect'), error => error.code === 'network');
    await assert.rejects(apiRequest(credentials, '/state'), /올바르게 응답/);
  });
});

test('timeout stops waiting without claiming a failed or successful external action', async () => {
  await withServer(() => {}, async credentials => {
    await assert.rejects(apiRequest(credentials, '/chat', { text: '안녕' }, { timeoutMs: 25 }), error => error.code === 'timeout' && error.message.includes('처리 상태'));
  });
});
