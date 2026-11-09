import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { Snapshot } from './types';
import { apiRequest, ApiError, validateCredentials, type Credentials, type RuntimeStatus, type VmQuote, type PhoneFrame } from '../services/runtime';
import { clearCredentials, loadCredentials, saveCredentials } from '../services/credential-storage';
import type { PhoneAction } from '../components/RuntimePanel';
import { demoBuild, demoCredentials, acceptRuntime } from '../services/demo-mode';

export type Contact = { id: string; name: string; relation: string; phone: string };
type LiveSnapshot = Snapshot & { me: Snapshot['me'] & { scopes?: string[] }; contacts?: Contact[]; familyLinks?: { id: string; name: string; direction: 'inbound' | 'outbound'; state: string }[] };
const empty: LiveSnapshot = { me: { id: '', name: '', initial: '', role: 'owner', consent: 'pending' }, members: [], messages: [], tasks: [], memories: [], contacts: [] };
type Store = {
  data: LiveSnapshot; loading: boolean; busy: boolean; error: string; notice: string; draft: string; connected: boolean;
  runtime: RuntimeStatus | null; quote: VmQuote | null; connectionUrl: string;
  setDraft: (value: string) => void; refresh: () => Promise<void>;
  connect: (value: Credentials) => Promise<boolean>; disconnect: () => Promise<boolean>;
  send: () => Promise<boolean>; decide: (id: string, decision: 'approve' | 'reject' | 'cancel', expectedActionHash?: string) => Promise<boolean>;
  setAIConsent: (enabled: boolean, includeMemories: boolean) => Promise<boolean>;
  setPhonePermission: (enabled: boolean) => Promise<boolean>;
  setConsent: (active: boolean) => Promise<boolean>;
  phoneAction: (action: PhoneAction) => Promise<boolean>; confirmVmStart: () => Promise<boolean>; cancelVmStart: () => void;
  addContact: (input: Omit<Contact, 'id'>) => Promise<boolean>;
  familyInvite: string; inviteFamily: () => Promise<boolean>; joinFamily: (code: string) => Promise<boolean>;
  decideFamily: (id: string, accept: boolean) => Promise<boolean>; requestFamily: (connectionId: string, text: string) => Promise<boolean>;
  readPhoneFrame: (signal: AbortSignal) => Promise<PhoneFrame>;
};
const Context = createContext<Store | null>(null);
const allowLocal = __DEV__ || process.env.EXPO_PUBLIC_ALLOW_LOCAL_API === '1';

export function LiveCompanionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LiveSnapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [quote, setQuote] = useState<VmQuote | null>(null);
  const [familyInvite, setFamilyInvite] = useState('');
  const [connectionUrl, setConnectionUrl] = useState(process.env.EXPO_PUBLIC_API_URL || '');
  const credentials = useRef<Credentials | null>(null);
  const operation = useRef(false);
  const generation = useRef(0);
  const sequence = useRef(0);
  const pendingChat = useRef<{ text: string; requestId: string } | null>(null);
  const pendingMutations = useRef(new Map<string, string>());

  const resetIdentity = useCallback(() => {
    generation.current++; sequence.current++; credentials.current = null; pendingChat.current = null; pendingMutations.current.clear();
    setData(empty); setRuntime(null); setQuote(null); setDraft(''); setConnected(false); setNotice(''); setFamilyInvite('');
  }, []);
  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) { resetIdentity(); void clearCredentials().catch(() => {}); }
    setError(cause instanceof Error ? cause.message : '잠시 연결을 확인해 주세요.');
  }, [resetIdentity]);

  const refresh = useCallback(async () => {
    const auth = credentials.current;
    if (!auth) return;
    const currentGeneration = generation.current, current = ++sequence.current;
    try {
      const [next, nextRuntime] = await Promise.all([apiRequest<LiveSnapshot>(auth, '/state'), apiRequest<RuntimeStatus>(auth, '/runtime')]);
      if (generation.current !== currentGeneration || sequence.current !== current) return;
      if (!acceptRuntime(nextRuntime, auth.baseUrl) || !next.me?.id || nextRuntime.me.id !== next.me.id) throw new ApiError('실제 모드로 설정된 내 몰라 서버에 연결해 주세요.', 409);
      setData(next); setRuntime(nextRuntime); setConnected(true); setError('');
    } catch (cause) {
      if (generation.current === currentGeneration && sequence.current === current) { setConnected(false); handleError(cause); }
    } finally { if (generation.current === currentGeneration) setLoading(false); }
  }, [handleError]);

  useEffect(() => {
    let mounted = true;
    void (demoBuild ? Promise.resolve(demoCredentials()) : loadCredentials()).then(async value => {
      if (!mounted || !value) return;
      credentials.current = validateCredentials(value, allowLocal); setConnectionUrl(value.baseUrl); await refresh();
    }).catch(cause => { if (mounted) handleError(cause); }).finally(() => { if (mounted) setLoading(false); });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active' && !operation.current) void refresh(); });
    const timer = setInterval(() => { if (!operation.current && AppState.currentState === 'active') void refresh(); }, 8000);
    return () => { mounted = false; generation.current++; clearInterval(timer); subscription.remove(); };
  }, [refresh, handleError]);

  async function connect(value: Credentials) {
    if (operation.current) return false;
    operation.current = true; setBusy(true); setError('');
    try {
      const auth = validateCredentials(value, allowLocal);
      const [next, status] = await Promise.all([apiRequest<LiveSnapshot>(auth, '/state'), apiRequest<RuntimeStatus>(auth, '/runtime')]);
      if (!acceptRuntime(status, auth.baseUrl) || !next.me?.id || status.me.id !== next.me.id) throw new ApiError('이 서버는 아직 실제 모드가 아니에요. 서버 연결 설정을 먼저 완료해 주세요.', 409);
      await saveCredentials(auth);
      resetIdentity(); credentials.current = auth; setConnectionUrl(auth.baseUrl); setData(next); setRuntime(status); setConnected(true);
      return true;
    } catch (cause) { handleError(cause); return false; }
    finally { operation.current = false; setBusy(false); }
  }
  async function disconnect() {
    if (operation.current) return false;
    try { await clearCredentials(); resetIdentity(); setError(''); return true; }
    catch { setError('기기의 연결 키를 지우지 못했어요. 다시 시도해 주세요.'); return false; }
  }
  async function perform(work: (auth: Credentials) => Promise<void>) {
    if (operation.current) return false;
    const auth = credentials.current;
    if (!auth) { setError('내 몰라를 먼저 연결해 주세요.'); return false; }
    operation.current = true; setBusy(true); setError(''); setNotice(''); sequence.current++;
    const started = generation.current;
    try { await work(auth); if (started !== generation.current) return false; await refresh(); return true; }
    catch (cause) { if (started === generation.current) handleError(cause); return false; }
    finally { operation.current = false; setBusy(false); }
  }
  async function send() {
    const text = draft.trim();
    if (!text || text.length > 1000) return false;
    if (!pendingChat.current || pendingChat.current.text !== text) pendingChat.current = { text, requestId: randomUUID() };
    const payload = pendingChat.current;
    return perform(async auth => {
      await apiRequest(auth, '/chat', payload, { timeoutMs: 45000 });
      setDraft(current => current.trim() === text ? '' : current); pendingChat.current = null;
    });
  }
  async function mutate<T>(auth: Credentials, path: string, body: unknown, options: { timeoutMs?: number } = {}) {
    const key = JSON.stringify([path, body]);
    const requestId = (body as { requestId?: string })?.requestId || pendingMutations.current.get(key) || randomUUID();
    pendingMutations.current.set(key, requestId);
    try { const result = await apiRequest<T>(auth, path, body, { ...options, requestId }); pendingMutations.current.delete(key); return result; }
    catch (cause) { if (cause instanceof ApiError && cause.status > 0) pendingMutations.current.delete(key); throw cause; }
  }
  const decide = (id: string, decision: 'approve' | 'reject' | 'cancel', expectedActionHash?: string) => perform(async auth => {
    if (decision === 'approve' && !expectedActionHash) throw new ApiError('작업 내용을 새로 불러온 뒤 다시 승인해 주세요.', 409);
    await mutate(auth, '/task/decision', { id, decision, ...(decision === 'approve' ? { expectedActionHash } : {}) });
  });
  const setAIConsent = (enabled: boolean, includeMemories: boolean) => perform(async auth => {
    await mutate(auth, '/ai/consent', { enabled, includeMemories: enabled && includeMemories });
  });
  const setPhonePermission = (enabled: boolean) => perform(async auth => {
    const scopes = (data.me.scopes || []).filter(scope => scope !== 'phone');
    if (enabled) scopes.push('phone');
    await mutate(auth, '/preferences', { agentName: data.me.agentName || '몰라', scopes });
  });
  const setConsent = (active: boolean) => perform(async auth => { await mutate(auth, '/consent', { value: active ? 'active' : 'revoked' }); });
  const addContact = (input: Omit<Contact, 'id'>) => perform(async auth => { await mutate(auth, '/contacts', input); });
  const inviteFamily = () => perform(async auth => { const result = await mutate<{ code: string }>(auth, '/family/invite', {}); setFamilyInvite(result.code); });
  const joinFamily = (code: string) => perform(async auth => { await mutate(auth, '/family/join', { code: code.trim() }); setNotice('연결 요청을 보냈어요. 상대방이 직접 허용하면 부탁을 보낼 수 있어요.'); });
  const decideFamily = (id: string, accept: boolean) => perform(async auth => { await mutate(auth, '/family/decision', { id, accept }); });
  const requestFamily = (connectionId: string, text: string) => perform(async auth => {
    const key = JSON.stringify(['family', connectionId, text]);
    const requestId = pendingMutations.current.get(key) || randomUUID(); pendingMutations.current.set(key, requestId);
    await mutate(auth, '/family/request', { connectionId, text, requestId }, { timeoutMs: 45000 }); pendingMutations.current.delete(key);
    setNotice('가족의 개인 공간으로 부탁을 보냈어요. 실행 여부는 그분이 직접 결정해요.');
  });
  const phoneAction = (action: PhoneAction) => perform(async auth => {
    if (action === 'start') {
      const durationMinutes = Math.min(5, runtime?.limits.vmMaxMinutes || 5);
      const next = await mutate<VmQuote>(auth, '/phone/quote', { durationMinutes });
      setQuote(next);
    } else {
      await mutate(auth, `/phone/${action}`, {}, { timeoutMs: 60000 });
      setNotice(action === 'stop' ? '사용 종료 요청을 처리했어요. 아래 연결 상태를 확인해 주세요.' : '기기 연결을 확인했어요.');
    }
  });
  const confirmVmStart = () => perform(async auth => {
    if (!quote || Date.parse(quote.expiresAt) <= Date.now()) { setQuote(null); throw new ApiError('비용 안내가 만료되었어요. 다시 확인해 주세요.'); }
    const quoteId = quote.quoteId;
    setQuote(null); // Never automatically retry a possibly billed start.
    await mutate(auth, '/phone/start', { quoteId }, { timeoutMs: 90000 });
    setNotice('Android 시작 요청을 처리했어요. 연결 상태를 확인해 주세요.');
  });
  const readPhoneFrame = useCallback(async (signal: AbortSignal) => {
    const auth = credentials.current, started = generation.current;
    if (!auth) throw new ApiError('내 몰라를 먼저 연결해 주세요.', 401);
    try {
      const frame = await apiRequest<PhoneFrame>(auth, '/phone/screen', undefined, { signal, timeoutMs: 18000 });
      if (started !== generation.current || signal.aborted) throw new ApiError('화면 보기가 종료되었어요.');
      if (!frame.dataUrl?.startsWith('data:image/png;base64,') || frame.dataUrl.length > 6000000 || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 4096 || frame.height > 4096 || !Number.isFinite(Date.parse(frame.capturedAt))) throw new ApiError('올바른 Android 화면을 받지 못했어요.');
      return frame;
    } catch (cause) {
      if (started === generation.current && !signal.aborted && cause instanceof ApiError && cause.status === 401) handleError(cause);
      throw cause;
    }
  }, [handleError]);
  return <Context.Provider value={{ data, loading, busy, error, notice, draft, connected, runtime, quote, connectionUrl, setDraft, refresh, connect, disconnect, send, decide, setAIConsent, setPhonePermission, setConsent, phoneAction, confirmVmStart, cancelVmStart: () => setQuote(null), addContact, readPhoneFrame, familyInvite, inviteFamily, joinFamily, decideFamily, requestFamily }}>{children}</Context.Provider>;
}
export function useLiveCompanion() { const value = useContext(Context); if (!value) throw new Error('LiveCompanionProvider is required'); return value; }
