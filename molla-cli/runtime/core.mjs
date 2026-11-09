import { randomUUID } from 'node:crypto';
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export class DomainError extends Error { constructor(message,status=400){ super(message);this.status=status; } }
export function member(s,actor){const m=s.members.find(m=>m.id===actor);if(!m)throw new DomainError('사용자를 찾을 수 없어요.',401);return m;}
export function own(actor,owner){if(actor!==owner)throw new DomainError('이 공간의 주인만 할 수 있어요.',403);}
export function bounded(value,max=1000){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new DomainError('내용을 확인해 주세요.');return value.trim();}
export function log(s,owner,title,detail=''){s.events.unshift({id:id(),owner,title,detail,at:now()});}
