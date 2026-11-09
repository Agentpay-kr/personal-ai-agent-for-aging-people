import { id, now, member, own, bounded, log, DomainError } from './core.mjs';
import { isFamily } from './ontology.mjs';
import { PolicyEngine } from './policy.mjs';

/** Memory interface. Implementations must enforce the caller on EVERY operation.
 * SQLite persistence is supplied by the enclosing state transaction.
 * GBrain adapters must run behind this boundary, never expose a shared DB/MCP token.
 */
export class LocalMemoryStore {
 constructor(state){this.state=state;this.policy=new PolicyEngine(state);}
 recall(actor,{owner=actor,query=''}={}){this.policy.readMemory(actor,owner);return structuredClone(this.state.memories.filter(m=>m.owner===owner&&m.text.includes(query)));}
 remember(actor,{text}){
  member(this.state,actor);const m={id:id(),owner:actor,text:bounded(text,300),version:1,createdAt:now(),source:{type:'user_statement',actor,recordedAt:now()}};
  this.state.memories.unshift(m);log(this.state,actor,'새로운 기억을 남겼어요');return structuredClone(m);
 }
 owned(actor,memoryId){member(this.state,actor);const m=this.state.memories.find(m=>m.id===memoryId);if(!m)throw new DomainError('기억을 찾을 수 없어요.',404);own(actor,m.owner);return m;}
 correct(actor,memoryId,text){
  const m=this.owned(actor,memoryId);m.text=bounded(text,300);m.version++;m.updatedAt=now();m.source={type:'user_correction',actor,recordedAt:now()};
  this.state.memoryGrants=this.state.memoryGrants.filter(g=>g.memoryId!==memoryId);log(this.state,actor,'기억을 수정했어요','이전 공유 동의도 함께 해제했어요.');return structuredClone(m);
 }
 forget(actor,memoryId){this.owned(actor,memoryId);this.state.memories=this.state.memories.filter(m=>m.id!==memoryId);this.state.memoryGrants=this.state.memoryGrants.filter(g=>g.memoryId!==memoryId);log(this.state,actor,'기억을 삭제했어요');}
 share(actor,memoryId,grantee){
  const m=this.owned(actor,memoryId);member(this.state,grantee);
  if(actor===grantee||!isFamily(this.state,actor,grantee)||member(this.state,actor).consent!=='active')throw new DomainError('공유할 가족과 도움 동의를 확인해 주세요.',403);
  this.revokeShare(actor,memoryId,grantee,false);
  this.state.memoryGrants.push({id:id(),memoryId,owner:actor,grantee,version:m.version,grantedAt:now()});log(this.state,actor,'기억 한 항목의 공유를 허용했어요');
 }
 revokeShare(actor,memoryId,grantee,audit=true){this.owned(actor,memoryId);this.state.memoryGrants=this.state.memoryGrants.filter(g=>!(g.memoryId===memoryId&&g.grantee===grantee));if(audit)log(this.state,actor,'기억 공유를 철회했어요');}
 recallShared(actor){
  member(this.state,actor);return this.state.memoryGrants.filter(g=>g.grantee===actor&&isFamily(this.state,actor,g.owner)&&member(this.state,g.owner).consent==='active').flatMap(g=>{
   const m=this.state.memories.find(m=>m.id===g.memoryId&&m.owner===g.owner&&m.version===g.version);return m?[structuredClone(m)]:[];
  });
 }
}
