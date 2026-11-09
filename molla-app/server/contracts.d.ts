/** Server-side contracts. ActorId is resolved from a trusted session, never a model/tool argument. */
export type PersonId = string;
export type TaskStatus = 'awaiting_approval' | 'running' | 'prepared' | 'needs_verification' | 'failed' | 'cancelled' | 'rejected';
export interface MemoryRecord {
 id: string; owner: PersonId; text: string; version: number; createdAt: string; updatedAt?: string;
 source: {type: 'user_statement' | 'user_correction' | 'legacy_local'; actor: PersonId; recordedAt: string};
}
export interface MemoryInterface {
 recall(actor: PersonId, options?: {owner?: PersonId; query?: string}): MemoryRecord[];
 remember(actor: PersonId, input: {text: string}): MemoryRecord;
 correct(actor: PersonId, id: string, text: string): MemoryRecord;
 forget(actor: PersonId, id: string): void;
 share(actor: PersonId, id: string, grantee: PersonId): void;
 revokeShare(actor: PersonId, id: string, grantee: PersonId): void;
 recallShared(actor: PersonId): MemoryRecord[];
}
export interface Device {owner: PersonId; serial: string; platform:'android'; mode:'cloud'|'local'}
export interface Contact {id:string; owner:PersonId; name:string; relation:string; phone:string}
export interface Action {
 type:'message.draft'|'shopping.draft'|'calendar.draft'; body:string;
 recipient:Pick<Contact,'id'|'name'|'phone'>|null; execution:'local'|'android-compose'; device:Device|null;
}
export interface Approval {actor:PersonId; hash:string; policyVersion:number; approvedAt:string; expiresAt:string}
export interface ExecutionEvidence {
 kind:'local_draft'|'intent_opened'; verified:boolean; summary:string;
 artifact?:{body:string; recipient?:Action['recipient']; kind?:string}; device?:string;
}
export interface PhoneExecutor {execute(action:Action,context:{authorize:()=>void}):Promise<ExecutionEvidence>}
export interface Family {id:string; name:string; members:PersonId[]}
export interface Permission {owner:PersonId; scope:'shopping'|'calendar'|'message'; consent:'active'|'pending'|'revoked'; version:number}
