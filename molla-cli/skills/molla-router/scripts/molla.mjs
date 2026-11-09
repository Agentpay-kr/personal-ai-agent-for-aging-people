#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
const candidate=process.env.MOLLA_CLI||resolve(import.meta.dirname,'../../../bin/molla.mjs');
if(!isAbsolute(candidate)||!existsSync(candidate)){
 process.stdout.write(JSON.stringify({schema_version:'1.0',ok:false,operation:'launcher',error:{code:'CONFIG',message:'Set MOLLA_CLI to the absolute path of molla-cli/bin/molla.mjs.',retryable:false}})+'\n');process.exit(2);
}
const child=spawn(process.execPath,[candidate,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
child.on('error',()=>process.exit(5));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??5));
