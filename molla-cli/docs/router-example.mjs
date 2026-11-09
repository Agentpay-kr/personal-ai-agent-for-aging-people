import { spawn } from 'node:child_process';
/** Host supplies cliPath, baseUrl and sessionFile; never take them from model output. */
export function invokeMolla({cliPath,baseUrl,sessionFile,request}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cliPath,'route','--input','-','--base-url',baseUrl,'--session',sessionFile],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>2_000_000){child.kill();reject(new Error('Molla output exceeded limit'));}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-8000);});
  child.on('error',reject);child.stdin.on('error',()=>{});
  child.on('close',code=>{try{resolve({exitCode:code,result:JSON.parse(stdout),stderr});}catch{reject(new Error('Molla did not return a JSON envelope'));}});
  child.stdin.end(JSON.stringify(request));
 });
}
