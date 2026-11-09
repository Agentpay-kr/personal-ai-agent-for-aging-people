import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.data');mkdirSync(dir,{recursive:true});
const authFile=resolve(dir,'owner-auth.json'),accessFile=resolve(dir,'owner-access.txt');
if(!existsSync(authFile)){
 const owners=['mom','dad','son'].map(actor=>({actor,code:randomBytes(32).toString('base64url')}));
 writeFileSync(authFile,JSON.stringify({owners:owners.map(({actor,code})=>({actor,hash:createHash('sha256').update(code).digest('hex')})),createdAt:new Date().toISOString()},null,2),{mode:0o600,flag:'wx'});
 writeFileSync(accessFile,owners.map(o=>`${o.actor}: ${o.code}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
}
const file=resolve(root,'.env');let lines=existsSync(file)?readFileSync(file,'utf8').split(/\r?\n/):[];
const lan=process.argv.includes('--lan');const hosts=['localhost','127.0.0.1','10.0.2.2'];
if(lan)for(const addresses of Object.values(networkInterfaces()))for(const address of addresses??[])if(address.family==='IPv4'&&!address.internal&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address))hosts.push(address.address);
const updates={MOLLA_LIVE_MODE:'1',MOLLA_ALLOW_ANDROID_APPS:'1',MOLLA_ALLOW_ANDROID_COMPOSE:'1',MOLLA_HOST:lan?'0.0.0.0':'127.0.0.1',MOLLA_ALLOWED_HOSTS:[...new Set(hosts)].join(','),MOLLA_ALLOWED_ORIGINS:'http://127.0.0.1:4321,http://localhost:4321,http://127.0.0.1:4323,http://localhost:4323',MOLLA_VM_MAX_MINUTES:'5',MOLLA_LLM_DAILY_REQUEST_LIMIT:'40'};
lines=lines.filter(line=>!Object.keys(updates).some(key=>line.startsWith(key+'=')));
for(const [key,value] of Object.entries(updates))lines.push(`${key}=${value}`);
writeFileSync(file,lines.filter(Boolean).join('\n')+'\n',{mode:0o600});
console.log('Live authentication configured. Owner tokens are saved in .data/owner-access.txt; values are not printed.');
console.log(`Bind address: ${updates.MOLLA_HOST}. Restart the API. Open the local token file yourself and enter each token only in its owner app.`);
