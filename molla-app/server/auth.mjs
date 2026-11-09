import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DomainError } from './core.mjs';
export const accessHash=code=>createHash('sha256').update(code).digest('hex');
export function liveMode(env=process.env){return env.MOLLA_LIVE_MODE==='1';}
export function loginOwner(code,env=process.env){
 if(typeof code!=='string'||code.length<32||code.length>256)throw new DomainError('개인 접속 코드를 확인해 주세요.',401);
 let records;try{records=JSON.parse(readFileSync(env.MOLLA_OWNER_AUTH_FILE||resolve(import.meta.dirname,'../.data/owner-auth.json'),'utf8'));}catch{throw new DomainError('운영자가 개인 접속 코드를 먼저 만들어야 해요.',503);}
 const hash=Buffer.from(accessHash(code),'hex');
 const match=records.owners?.find(row=>typeof row.hash==='string'&&/^[a-f0-9]{64}$/.test(row.hash)&&timingSafeEqual(hash,Buffer.from(row.hash,'hex')));
 if(!match)throw new DomainError('개인 접속 코드를 확인해 주세요.',401);
 return match.actor;
}
export function requireTrusted(session,env=process.env){if(!liveMode(env)||session?.trusted!==1)throw new DomainError('실제 연결 모드에서 내 개인 접속 코드로 로그인해 주세요.',403);}
