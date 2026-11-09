// Official OpenAI-compatible endpoint: https://docs.platform.letsur.ai/ai-gateway/getting-started
// Credentials stay on the server. No redirects, fallback provider or automatic retries.
export async function generateLetsur({env,model,instructions,prompt,schema,signal,fetcher=fetch}) {
 const base=(env.LETSUR_BASE_URL||'https://gw.letsur.ai/v1').replace(/\/$/,'');
 if(base!=='https://gw.letsur.ai/v1')throw new Error('Invalid Letsur endpoint');
 const terra=model==='gpt-6.1-terra';
 const effort=env.LETSUR_REASONING_EFFORT||'medium';
 if(terra&&!['none','low','medium','high','xhigh','max'].includes(effort))throw new Error('Invalid Terra reasoning effort');
 // Keep the app's exact contract in the prompt too: gateways may not enforce response_format.
 const system=terra?`${instructions}\n응답은 설명이나 코드 블록 없이 다음 JSON Schema를 정확히 지키는 JSON 객체 하나로 반환하세요. 필드 이름을 바꾸지 마세요.\n${JSON.stringify(schema)}`:instructions;
 const generation=terra?{reasoning_effort:effort,max_completion_tokens:8192}:{max_tokens:1800};
 const response=await fetcher(base+'/chat/completions',{
  method:'POST',redirect:'error',signal,
  headers:{Authorization:`Bearer ${env.LETSUR_API_KEY}`,'Content-Type':'application/json'},
  body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:prompt}],...generation,stream:false,response_format:{type:'json_schema',json_schema:{name:'molla_plan',strict:true,schema}}})
 });
 if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('Letsur request rejected'),{statusCode:response.status});}
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();throw new Error('Oversized provider response');}chunks.push(value);}}finally{reader.releaseLock();}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),choice=data.choices?.[0];
 if(choice?.finish_reason!=='stop'||choice.message?.refusal||typeof choice.message?.content!=='string')throw new Error('Incomplete structured response');
 const amount=Number(data.estimated_cost?.amount);
 return {output:JSON.parse(choice.message.content),usage:{inputTokens:data.usage?.prompt_tokens??0,outputTokens:data.usage?.completion_tokens??0},
  provider:'letsur',responseId:typeof data.id==='string'&&data.id.length<200?data.id:undefined,
  ...(data.estimated_cost?.currency==='unit'&&Number.isFinite(amount)&&amount>=0?{estimatedCost:{amount,currency:'unit'}}:{})};
}
