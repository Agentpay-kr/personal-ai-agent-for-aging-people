import { createHash } from 'node:crypto';
import { member, own, DomainError, now } from './core.mjs';
import { isFamily } from './ontology.mjs';

// The fingerprint binds every execution-relevant field. Memories cannot produce grants.
export function fingerprint(t){return createHash('sha256').update(JSON.stringify([t.owner,t.requester,t.kind,t.text,t.action])).digest('hex');}
export class PolicyEngine {
 constructor(state){this.state=state;}
 request(actor,owner,kind){
  member(this.state,actor);const m=member(this.state,owner);
  if(!isFamily(this.state,actor,owner))throw new DomainError('연결된 가족에게만 도움을 요청할 수 있어요.',403);
  if(m.consent!=='active'||!m.scopes.includes(kind))throw new DomainError('주인이 이 작업의 도움 권한을 허용하지 않았어요.',403);
 }
 approve(actor,t){
  own(actor,t.owner);this.request(t.requester,t.owner,t.kind);
  return {actor,hash:fingerprint(t),policyVersion:member(this.state,t.owner).policyVersion,approvedAt:now(),expiresAt:new Date(Date.now()+300000).toISOString()};
 }
 execute(t){
  this.request(t.requester,t.owner,t.kind);const a=t.approval;
  if(t.action.execution?.startsWith('android-'))this.request(t.owner,t.owner,'phone');
  if(!a||a.actor!==t.owner||a.policyVersion!==member(this.state,t.owner).policyVersion||a.hash!==fingerprint(t)||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=Date.now())throw new DomainError('승인이 만료되었거나 요청이 변경되었어요. 새로 부탁해 주세요.',403);
  if(t.action.recipient){const c=this.state.contacts.find(c=>c.owner===t.owner&&c.id===t.action.recipient.id);if(!c||c.phone!==t.action.recipient.phone||c.name!==t.action.recipient.name)throw new DomainError('연락처가 바뀌었어요. 수신자를 다시 확인해 주세요.',403);}
 }
 readMemory(actor,owner){member(this.state,actor);own(actor,owner);}
}
