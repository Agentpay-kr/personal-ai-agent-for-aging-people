import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store, seed, recoverDurableTasks, DomainError } from './core.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function secureDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const account = execFileSync('whoami', [], { encoding: 'utf8', windowsHide: true }).trim();
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`], { windowsHide: true, stdio: 'ignore' });
  }
}
export class OwnerAuth {
  constructor(path) { this.path = resolve(path); }
  records() {
    let data;
    try { data = JSON.parse(readFileSync(this.path, 'utf8')); } catch { throw new DomainError('운영자의 사용자 인증 설정이 필요해요.', 503); }
    if (!Array.isArray(data.owners) || data.owners.some(r => !/^[a-zA-Z0-9_-]{1,80}$/.test(r.actor) || !/^[a-f0-9]{64}$/.test(r.hash) || !Number.isFinite(Date.parse(r.expiresAt))) || new Set(data.owners.map(r => r.hash)).size !== data.owners.length) throw new DomainError('사용자 인증 설정이 올바르지 않아요.', 503);
    return data.owners;
  }
  verify(header) {
    const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header ?? '')?.[1];
    if (!token) throw new DomainError('내 앱 연결 키로 연결해 주세요.', 401);
    const hash = Buffer.from(digest(token), 'hex');
    const row = this.records().find(r => timingSafeEqual(hash, Buffer.from(r.hash, 'hex')));
    if (!row || row.revoked || Date.parse(row.expiresAt) <= Date.now()) throw new DomainError('앱 연결 키가 만료되었거나 철회되었어요.', 401);
    return { actor: row.actor, name: row.name || row.actor };
  }
}

/** One process owns this data directory. SQLite provides atomic claims and durable receipts. */
export class Tenants {
  constructor(directory, { lock = true } = {}) {
    this.directory = resolve(directory); this.stores = new Map(); secureDirectory(this.directory);
    if (lock) {
      this.lockPath = resolve(this.directory, 'api.lock');
      try { writeFileSync(this.lockPath, String(process.pid), { flag: 'wx', mode: 0o600 }); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const pid = Number(readFileSync(this.lockPath, 'utf8'));
        let alive = true;
        if (Number.isSafeInteger(pid) && pid > 0) { try { process.kill(pid, 0); } catch (probe) { if (probe.code === 'ESRCH') alive = false; } }
        if (alive) throw new Error('Data directory is already owned by a running API process');
        rmSync(this.lockPath); writeFileSync(this.lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
      }
    }
  }
  get(identity) {
    if (this.stores.has(identity.actor)) return this.stores.get(identity.actor);
    const store = new Store(resolve(this.directory, `${digest(identity.actor)}.sqlite`));
    store.transaction(s => {
      if (!s.apiOwner) {
        const fresh = seed({ live: true });
        const me = fresh.members[0];
        Object.assign(me, { id: identity.actor, name: identity.name, initial: identity.name.slice(0, 1), vm: `${identity.actor}-private`, scopes: ['message', 'shopping', 'calendar', 'memory'] });
        Object.assign(s, fresh, { members: [me], families: [], apiOwner: identity.actor, requests: [], rate: [], cloudSessions: {} });
      }
      if (s.apiOwner !== identity.actor) throw new Error('Tenant mismatch');
      recoverDurableTasks(s);
      for (const session of Object.values(s.cloudSessions ?? {})) if (session.state === 'starting') session.state = 'unknown';
    });
    this.stores.set(identity.actor, store); return store;
  }
  close() { for (const store of this.stores.values()) store.close(); this.stores.clear(); if (this.lockPath) rmSync(this.lockPath, { force: true }); }
}

export function rateLimit(store, limit = 120) {
  store.transaction(s => {
    s.rate = (s.rate ?? []).filter(t => t > Date.now() - 60000);
    if (s.rate.length >= limit) throw new DomainError('요청이 많아요. 잠시 후 다시 시도해 주세요.', 429);
    s.rate.push(Date.now());
  });
}
export async function receipt(store, key, path, input, work) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key || '')) throw new DomainError('요청 식별자가 필요해요.', 400);
  const hash = digest(JSON.stringify([path, input]));
  const claim = store.transaction(s => {
    s.requests ??= [];
    const old = s.requests.find(r => r.key === key);
    if (old) {
      if (old.hash !== hash) throw new DomainError('같은 요청 번호에 다른 내용을 보낼 수 없어요.', 409);
      if (old.status === 'done') return { response: old.response, reused: true };
      throw new DomainError('이미 접수했거나 중단된 요청이에요. 상태를 확인해 주세요. 자동 재실행하지 않아요.', 409);
    }
    s.requests.push({ key, hash, path, status: 'pending', at: new Date().toISOString() });
    return { reused: false };
  });
  if (claim.reused) return claim.response;
  try {
    const response = await work();
    store.transaction(s => Object.assign(s.requests.find(r => r.key === key), { status: 'done', response }));
    return response;
  } catch (error) { store.transaction(s => { s.requests.find(r => r.key === key).status = 'failed'; }); throw error; }
}
