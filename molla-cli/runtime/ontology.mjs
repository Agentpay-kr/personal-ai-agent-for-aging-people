import { id, now, member, bounded, DomainError } from './core.mjs';

export const apps = Object.freeze([
 {id:'sms',name:'문자',capabilities:['message.compose'],externalEffect:'compose_only'},
 {id:'coupang',name:'쿠팡',capabilities:['shopping.draft']},
 {id:'google',name:'Google',capabilities:['calendar.draft']},
 {id:'kakao',name:'카카오톡',capabilities:['message.draft']}
]);
export function migrate(s){
 s.schemaVersion=2;
 s.families??=[{id:'local-family',name:'우리 가족',members:s.members.map(m=>m.id)}];
 s.contacts??=[];s.memoryGrants??=[];
 for(const m of s.members){m.policyVersion??=1;m.cloudAI??={enabled:false,includeMemories:false,version:1};}
 for(const m of s.memories){m.version??=1;m.source??={type:'user_statement',actor:m.owner,recordedAt:m.createdAt};}
 for(const t of s.tasks)if(!t.action&&['awaiting_approval','running'].includes(t.status)){t.status='cancelled';t.result='이전 버전의 체험 요청이에요. 내용을 확인하고 새로 부탁해 주세요.';}
 return s;
}
export function isFamily(s,a,b){return a===b||s.families?.some(f=>f.members.includes(a)&&f.members.includes(b));}
export function addContact(s,actor,input){
 member(s,actor);const name=bounded(input.name,40),relation=bounded(input.relation,20);
 const phone=bounded(input.phone,24).replace(/[\s()-]/g,'');
 if(!/^\+?\d{8,15}$/.test(phone))throw new DomainError('전화번호를 확인해 주세요.');
 const contact={id:id(),owner:actor,name,relation,phone,createdAt:now(),source:{type:'owner_entered',actor}};
 s.contacts.push(contact);return contact;
}
export function resolveContact(s,owner,query){
 const found=s.contacts.filter(c=>c.owner===owner&&(c.id===query||c.name===query||c.relation===query));
 if(found.length>1)throw new DomainError('같은 이름이나 관계의 연락처가 여러 개예요. 정확한 이름으로 다시 부탁해 주세요.',409);
 return found[0]??null;
}
export function graphFor(s,actor){
 const me=member(s,actor);const families=s.families.filter(f=>f.members.includes(actor));
 return {schemaVersion:2,persons:s.members.filter(m=>isFamily(s,actor,m.id)).map(({id,name})=>({id,name})),families,
  relationships:s.contacts.filter(c=>c.owner===actor).map(c=>({from:actor,to:c.id,relation:c.relation})),contacts:s.contacts.filter(c=>c.owner===actor),
  devices:[{id:me.vm,owner:actor,platform:'android',status:'operator_binding_required'}],apps,
  permissions:me.scopes.map(scope=>({owner:actor,scope,consent:me.consent,version:me.policyVersion})),
  tasks:s.tasks.filter(t=>t.owner===actor).map(({id,status,kind})=>({id,status,kind}))};
}
