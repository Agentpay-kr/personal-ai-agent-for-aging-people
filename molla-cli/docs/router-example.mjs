import { spawn } from 'node:child_process';
/**
 * Host supplies cliPath, databaseFile and sessionFile; never take them from model output.
 * Paths travel in the environment (MOLLA_CLI_DB / MOLLA_SESSION_FILE), and owner-only
 * secrets are not passed to the routed process.
 */
export function invokeMolla({cliPath,databaseFile,sessionFile,request,env=process.env}){
 return new Promise((resolve,reject)=>{
  const childEnv={...env,MOLLA_CLI_DB:databaseFile,MOLLA_SESSION_FILE:sessionFile};
  delete childEnv.MOLLA_OWNER_KEY;delete childEnv.MOLLA_ALLOW_DEMO_LOGIN;
  const child=spawn(process.execPath,[cliPath,'route','--input','-'],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:childEnv});
  let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>2_000_000){child.kill();reject(new Error('Molla output exceeded limit'));}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-8000);});
  child.on('error',reject);child.stdin.on('error',()=>{});
  child.on('close',code=>{try{resolve({exitCode:code,result:JSON.parse(stdout),stderr});}catch{reject(new Error('Molla did not return a JSON envelope'));}});
  child.stdin.end(JSON.stringify(request));
 });
}
