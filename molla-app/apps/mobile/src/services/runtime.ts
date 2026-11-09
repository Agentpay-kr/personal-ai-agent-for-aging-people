export type Credentials = { baseUrl: string; token: string };

export type RuntimeStatus = {
  mode: 'live' | 'local-demo';
  me: { id: string; name: string };
  llm: { enabled: boolean; configured: boolean; model?: string; consented: boolean; includeMemories: boolean; ready: boolean };
  phone: { configured: boolean; provider?: string; phoneId?: string; state: string; expiresAt?: string; actions?: string[] };
  limits: { vmMaxMinutes: number; vmPricePerMinuteUsd: number };
};
export type VmQuote = { quoteId: string; durationMinutes: number; estimatedMaxUsd: number; expiresAt: string };
export const isPhoneRunning = (phone: RuntimeStatus['phone'] | undefined) => phone?.state === 'running' || phone?.state === 'ready' || phone?.state === 'active';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 0, code?: string) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

export function normalizeServerUrl(value: string, allowLocal = false) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new ApiError('서버 주소를 확인해 주세요.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || value.length > 512) throw new ApiError('서버의 기본 주소만 입력해 주세요.');
  if (url.protocol !== 'https:' && !(allowLocal && loopback && url.protocol === 'http:')) throw new ApiError('안전한 https 서버 주소를 입력해 주세요.');
  return url.origin;
}

export function validateCredentials(value: Credentials, allowLocal = false): Credentials {
  const baseUrl = normalizeServerUrl(value.baseUrl, allowLocal);
  const token = value.token.trim();
  if (!token || token.length > 512 || /\s|[\u0000-\u001f]/.test(token)) throw new ApiError('나에게 발급된 앱 연결 키를 입력해 주세요.');
  return { baseUrl, token };
}

/** The token is sent only to the exact configured origin. Never log credentials. */
export async function apiRequest<T>(credentials: Credentials, path: string, body?: unknown, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  if (!/^\/[a-z0-9/\-]+$/i.test(path)) throw new ApiError('지원하지 않는 요청이에요.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, options.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${credentials.baseUrl}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${credentials.token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new ApiError('앱 서버가 올바르게 응답하지 않았어요.', response.status);
    const value = await response.json();
    if (!response.ok) {
      if (response.status === 401) throw new ApiError('앱 연결 키가 만료되었거나 올바르지 않아요. 다시 연결해 주세요.', 401);
      throw new ApiError(typeof value.error === 'string' ? value.error : '요청을 처리하지 못했어요. 잠시 후 다시 확인해 주세요.', response.status, value.code);
    }
    return value as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('응답을 기다리는 시간이 길어졌어요. 처리 상태를 확인한 뒤 다시 시도해 주세요.', 0, 'timeout');
    throw new ApiError('서버에 연결하지 못했어요. 인터넷 연결과 서버 주소를 확인해 주세요.', 0, 'network');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
