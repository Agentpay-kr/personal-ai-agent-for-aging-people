import { DomainError } from './core.mjs';

export function modelConfig(env = process.env) {
  const provider = env.MOLLA_LLM_PROVIDER || 'openai-compatible';
  const presets = { letsur: ['https://gw.letsur.ai/v1', env.LETSUR_API_KEY, env.LETSUR_MODEL], vercel: ['https://ai-gateway.vercel.sh/v1', env.AI_GATEWAY_API_KEY, env.MOLLA_MODEL] };
  const [url, key, model] = presets[provider] || [env.MOLLA_LLM_BASE_URL, env.MOLLA_LLM_API_KEY, env.MOLLA_LLM_MODEL];
  return { provider, url, key, model, enabled: env.MOLLA_LLM_ENABLED === '1' };
}
export function modelStatus(env) { const { provider, key, url, model, enabled } = modelConfig(env); return { provider, model, enabled, configured: !!(key && url && model) }; }

/** Adapter interface: complete({messages,tools,signal}) -> one validated tool call.
 * Compatible providers are configurable. No SDK fallback, redirects or automatic retries.
 */
export class CompatibleProvider {
  constructor({ env = process.env, fetcher = fetch } = {}) { this.env = env; this.fetcher = fetcher; }
  async complete({ messages, tools, signal }) {
    const c = modelConfig(this.env);
    if (!c.enabled || !c.key || !c.model || !c.url) throw new DomainError('LLM 서버·모델·키 설정이 필요해요.', 503);
    const url = new URL(c.url);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(this.env.MOLLA_ENV === 'development' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new DomainError('LLM 서버의 HTTPS 주소를 확인해 주세요.', 503);
    try {
      const response = await this.fetcher(`${url.href.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: c.model, messages, tools, tool_choice: 'required', parallel_tool_calls: false, max_tokens: 1800, stream: false }),
      });
      if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('provider_rejected'), { providerStatus: response.status }); }
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 100000) { await reader.cancel(); throw new Error('oversize'); } chunks.push(value); } } finally { reader.releaseLock(); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')), choice = result.choices?.[0];
      const calls = choice?.message?.tool_calls;
      if (choice?.finish_reason !== 'tool_calls' || choice.message.refusal || !Array.isArray(calls) || calls.length !== 1 || calls[0].type !== 'function' || typeof calls[0].id !== 'string' || calls[0].id.length > 200) throw new Error('invalid_tool_response');
      return { call: calls[0], model: c.model, provider: c.provider, usage: { inputTokens: result.usage?.prompt_tokens || 0, outputTokens: result.usage?.completion_tokens || 0 } };
    } catch (error) {
      const known = { 401: 'LLM 키 인증을 확인해 주세요.', 402: 'LLM 잔액을 확인해 주세요.', 403: '모델 사용 권한을 확인해 주세요.', 429: 'LLM 호출 한도에 도달했어요. 잠시 후 상태를 확인해 주세요.' };
      const safe = new DomainError(signal?.aborted ? 'AI 응답 시간이 초과되어 중단했어요. 작업은 실행하지 않았어요.' : known[error.providerStatus] || 'AI 서버가 올바른 도구 호출을 반환하지 않았어요. 작업은 실행하지 않았어요.', error.providerStatus === 429 ? 429 : 502);
      safe.code = error.providerStatus ? 'llm_provider_rejected' : signal?.aborted ? 'llm_timeout' : 'llm_invalid_response'; throw safe;
    }
  }
}
