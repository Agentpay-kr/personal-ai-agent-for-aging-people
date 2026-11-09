import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { operations, capabilities } from '../lib/operations.mjs';
const root=resolve(import.meta.dirname,'..');
await mkdir(resolve(root,'docs'),{recursive:true});
await writeFile(resolve(root,'docs/capabilities.json'),JSON.stringify(capabilities(),null,2)+'\n');
const branches=Object.entries(operations).map(([name,s])=>{
 const args={type:'object',additionalProperties:false,properties:Object.fromEntries(Object.entries(s.args).map(([k,r])=>[k,{type:r.type,...(r.type==='string'?{minLength:1}:{}),...(r.max?{maxLength:r.max}:{}),...(r.values?{enum:r.values}:{})}])),required:Object.entries(s.args).filter(([,r])=>r.required).map(([k])=>k)};
 if(name==='task.decide')args.allOf=[{if:{properties:{decision:{const:'approve'}}},then:{required:['ownerConfirmed','expectedActionHash'],properties:{ownerConfirmed:{const:true},expectedActionHash:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}];
 if(name==='consent.set')args.properties.ownerConfirmed={const:true};
 return {type:'object',additionalProperties:false,required:['schema_version','operation',...(args.required.length?['arguments']:[])],properties:{schema_version:{const:'1.0'},request_id:{type:'string',pattern:'^[-a-zA-Z0-9_.:]{1,128}$'},operation:{const:name},arguments:args}};
});
await writeFile(resolve(root,'docs/request.schema.json'),JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',title:'Molla router request v1',oneOf:branches},null,2)+'\n');
const files=[];
async function walk(path){for(const d of await readdir(path,{withFileTypes:true})){const p=resolve(path,d.name);if(d.isDirectory())await walk(p);else if(d.isFile())files.push(p);else throw new Error('Only regular files are allowed');}}
for(const name of ['bin','lib','skills','docs','examples','scripts','tests'])await walk(resolve(root,name));
for(const name of ['package.json','README.md','.gitignore'])files.push(resolve(root,name));
const destination=resolve(root,'dist/molla-cli-0.1.0');await mkdir(destination,{recursive:true});
const checksums=[];
for(const path of files){const rel=relative(root,path).replaceAll('\\','/'),content=await readFile(path);await mkdir(dirname(resolve(destination,rel)),{recursive:true});await cp(path,resolve(destination,rel));checksums.push(`${createHash('sha256').update(content).digest('hex')}  ${rel}`);}
await writeFile(resolve(destination,'SHA256SUMS.txt'),checksums.sort().join('\n')+'\n');
process.stdout.write(JSON.stringify({directory:destination,files:files.length})+'\n');
