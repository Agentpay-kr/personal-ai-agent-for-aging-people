import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMPlanner, aiStatus } from '../server/llm.mjs';
const env={MOLLA_LLM_ENABLED:'1',MOLLA_LLM_PROVIDER:'letsur',LETSUR_MODEL:'gpt-4.1-mini',LETSUR_API_KEY:'test-only-secret',AI_GATEWAY_API_KEY:'unused-gateway-key'};
const plan={intent:'message',reply:'초안을 준비했어요.',draft:'내일 병원에 가요.',recipient:'딸',app:null};
const response=overrides=>new Response(JSON.stringify({id:'test-response',choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}],usage:{prompt_tokens:400,completion_tokens:40},estimated_cost:{amount:'0.00024',currency:'unit'},...overrides}),{headers:{'Content-Type':'application/json'}});
test('Letsur adapter sends one structured request to the documented endpoint with server-only auth',async()=>{
 let calls=0;const planner=new LLMPlanner({env,generate:()=>assert.fail('Must not use Vercel'),fetcher:async(url,init)=>{calls++;assert.equal(url,'https://gw.letsur.ai/v1/chat/completions');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer test-only-secret');const body=JSON.parse(init.body);assert.equal(body.model,'gpt-4.1-mini');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.max_tokens,1800);assert.equal(body.stream,false);return response();}});
 const r=await planner.plan({request:'문자 초안'});assert.equal(calls,1);assert.deepEqual(r.plan,plan);assert.equal(r.provider,'letsur');assert.deepEqual(r.usage,{inputTokens:400,outputTokens:40});assert.equal(r.estimatedCost.currency,'unit');assert(!JSON.stringify(r).includes(env.LETSUR_API_KEY));
});
test('Letsur errors are sanitized and never fall back or retry',async()=>{
 for(const status of [400,401,402,403,429,503]){let calls=0;const planner=new LLMPlanner({env,generate:()=>assert.fail(),fetcher:async()=>{calls++;return new Response('test-only-secret private prompt',{status});}});await assert.rejects(planner.plan({}),e=>e.status===(status===429?429:502)&&!e.message.includes('test-only-secret')&&!e.message.includes('private prompt'));assert.equal(calls,1);}
});

test('Terra uses a reasoning-compatible budget and repeats the exact output contract',async()=>{
 let calls=0;const terraEnv={...env,LETSUR_MODEL:'gpt-6.1-terra'};
 const planner=new LLMPlanner({env:terraEnv,generate:()=>assert.fail('No provider fallback'),fetcher:async(url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.model,'gpt-6.1-terra');assert.equal(body.reasoning_effort,'medium');assert.equal(body.max_completion_tokens,8192);assert.equal(body.max_tokens,undefined);
  assert.equal(body.response_format.json_schema.strict,true);assert.ok(body.messages[0].content.includes(JSON.stringify(body.response_format.json_schema.schema)));return response();
 }});
 const result=await planner.plan({request:'문자 초안'});assert.equal(calls,1);assert.deepEqual(result.plan,plan);assert.equal(result.model,'gpt-6.1-terra');
});

test('Terra rejects renamed output fields and invalid reasoning settings without executing a task',async()=>{
 const terraEnv={...env,LETSUR_MODEL:'gpt-6.1-terra'};
 await assert.rejects(new LLMPlanner({env:terraEnv,fetcher:async()=>response({choices:[{finish_reason:'stop',message:{content:JSON.stringify({type:'conversation',response:'안녕하세요',message:null,recipient:null,app:null})}}]})}).plan({}),{status:502});
 await assert.rejects(new LLMPlanner({env:{...terraEnv,LETSUR_REASONING_EFFORT:'invalid'},fetcher:()=>assert.fail('Invalid settings must not be sent')}).plan({}),{status:502});
});
test('Truncated, refused, malformed and invalid-schema completions cannot become tasks',async()=>{
 for(const data of [{choices:[{finish_reason:'length',message:{content:JSON.stringify(plan)}}]},{choices:[{finish_reason:'stop',message:{refusal:'no',content:JSON.stringify(plan)}}]},{choices:[{finish_reason:'stop',message:{content:'not-json'}}]},{choices:[{finish_reason:'stop',message:{content:'{"intent":"execute-shell"}'}}]}]){
  await assert.rejects(new LLMPlanner({env,fetcher:async()=>response(data)}).plan({}),{status:502});
 }
});
test('Letsur provider needs its own key/model and an unmodified trusted URL',async()=>{
 assert.equal(aiStatus({...env,LETSUR_API_KEY:''}).configured,false);
 await assert.rejects(new LLMPlanner({env:{...env,LETSUR_MODEL:''},fetcher:()=>assert.fail()}).plan({}),{status:503});
 await assert.rejects(new LLMPlanner({env:{...env,LETSUR_BASE_URL:'https://attacker.invalid/v1'},fetcher:()=>assert.fail()}).plan({}),{status:502});
});
