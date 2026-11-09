import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { digest } from './storage.mjs';
import { DomainError, member, interruptTask, log } from './core.mjs';

/** Only relationship metadata lives here. Conversations, contacts and execution stay in the owner's DB. */
export class FamilyLinks {
  constructor(directory) {
    this.db = new DatabaseSync(resolve(directory, 'family-links.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS links(id TEXT PRIMARY KEY, owner TEXT NOT NULL, helper TEXT, helper_name TEXT, code_hash TEXT UNIQUE, expires_at INTEGER, state TEXT NOT NULL)');
  }
  invite(owner) {
    const code = randomBytes(12).toString('hex').toUpperCase(), id = randomUUID(), expires = Date.now() + 600000;
    this.db.prepare("INSERT INTO links VALUES(?,?,NULL,NULL,?,?,'invited')").run(id, owner, digest(code), expires);
    return { code, expiresAt: new Date(expires).toISOString() };
  }
  join(identity, code) {
    const row = this.db.prepare("SELECT * FROM links WHERE code_hash=? AND state='invited' AND expires_at>?").get(digest(code.toUpperCase()), Date.now());
    if (!row || row.owner === identity.actor) throw new DomainError('유효한 가족 연결 코드를 확인해 주세요.', 409);
    const result = this.db.prepare("UPDATE links SET helper=?,helper_name=?,code_hash=NULL,state='awaiting_owner' WHERE id=? AND state='invited'").run(identity.actor, identity.name, row.id);
    if (!result.changes) throw new DomainError('이미 사용한 연결 코드예요.', 409);
    return { state: 'awaiting_owner' };
  }
  list(actor) {
    return this.db.prepare("SELECT id,owner,helper,helper_name,state FROM links WHERE (owner=? OR helper=?) AND state IN ('awaiting_owner','active')").all(actor, actor).map(row => ({ id: row.id, direction: row.owner === actor ? 'inbound' : 'outbound', name: row.owner === actor ? row.helper_name : '연결된 가족', state: row.state }));
  }
  decide(actor, id, accept, store) {
    const row = this.db.prepare('SELECT * FROM links WHERE id=? AND owner=?').get(id, actor);
    if (!row || !['awaiting_owner', 'active'].includes(row.state)) throw new DomainError('내 가족 연결 요청을 찾을 수 없어요.', 404);
    if (accept && row.state !== 'awaiting_owner') throw new DomainError('이미 처리한 연결이에요.', 409);
    // Policy first, metadata second. A crash can deny access, never grant it without owner policy.
    store.transaction(s => {
      const me = member(s, actor); if (accept && me.consent !== 'active') throw new DomainError('주인의 도움 동의가 필요해요.', 403);
      me.policyVersion++;
      s.familyLinks ??= [];
      s.familyLinks = s.familyLinks.filter(l => l.id !== id);
      if (accept) {
        s.familyLinks.push({ id, helper: row.helper, requests: true });
        if (!s.members.some(m => m.id === row.helper)) s.members.push({ id: row.helper, name: row.helper_name, initial: row.helper_name.slice(0, 1), consent: 'linked', role: 'helper', scopes: [], policyVersion: 1 });
        s.families.push({ id, name: '요청만 허용한 가족', members: [actor, row.helper] });
      } else s.families = s.families.filter(f => f.id !== id);
      for (const task of s.tasks) if (task.requester === row.helper) interruptTask(s, task, '가족 요청 권한이 변경되었어요.');
      log(s, actor, accept ? 'family.requests_allowed' : 'family.revoked', id);
    });
    this.db.prepare('UPDATE links SET state=? WHERE id=?').run(accept ? 'active' : 'revoked', id);
    return { ok: true };
  }
  target(helper, id) {
    const row = this.db.prepare("SELECT owner FROM links WHERE id=? AND helper=? AND state='active'").get(id, helper);
    if (!row) throw new DomainError('주인이 허용한 가족 요청 연결이 필요해요.', 403);
    return row.owner;
  }
  close() { this.db.close(); }
}
