const str=(required=true,max=1000)=>({type:'string',required,max});
const choice=(values,required=true)=>({type:'string',required,values});
// This allowlist is also the machine-readable discovery contract. No arbitrary URL/shell action.
export const operations={
 'health':{method:'GET',path:'health',session:false,args:{}},
 'identity.get':{method:'GET',path:'state',select:'identity',args:{}},
 'family.list':{method:'GET',path:'state',select:'members',args:{}},
 'family.invite':{method:'POST',path:'invites',args:{name:str(true,20)}},
 'family.join':{method:'POST',path:'invites/accept',args:{code:str(true,8)}},
 'task.create':{method:'POST',path:'tasks',args:{text:str(),owner:str(false,100),draft:str(false),contactId:str(false,100)}},
 'task.list':{method:'GET',path:'state',select:'tasks',args:{status:choice(['awaiting_approval','running','prepared','needs_verification','failed','completed','rejected','cancelled'],false)}},
 'task.get':{method:'GET',path:'state',select:'task',args:{id:str(true,100)}},
 'task.decide':{method:'POST',path:'task/decision',args:{id:str(true,100),decision:choice(['approve','reject','cancel']),ownerConfirmed:{type:'boolean',required:false},expectedActionHash:str(false,64)}},
 'memory.list':{method:'POST',path:'memories/search',args:{}},
 'memory.search':{method:'POST',path:'memories/search',args:{query:str(false,300)}},
 'memory.remember':{method:'POST',path:'memories',args:{text:str(true,300)}},
 'memory.correct':{method:'POST',path:'memories/correct',args:{id:str(true,100),text:str(true,300)}},
 'memory.forget':{method:'POST',path:'memories/delete',args:{id:str(true,100)}},
 'memory.shared':{method:'GET',path:'memories/shared',args:{}},
 'memory.share':{method:'POST',path:'memories/share',args:{id:str(true,100),grantee:str(true,100)}},
 'memory.revoke':{method:'POST',path:'memories/revoke',args:{id:str(true,100),grantee:str(true,100)}},
 'contact.list':{method:'GET',path:'state',select:'contacts',args:{}},
 'contact.add':{method:'POST',path:'contacts',args:{name:str(true,40),relation:str(true,20),phone:str(true,24)}},
 'contact.remove':{method:'POST',path:'contacts/delete',args:{id:str(true,100)}},
 'ontology.get':{method:'GET',path:'ontology',args:{}},
 'vm.diagnose':{method:'POST',path:'phone/diagnose',args:{}},
 'vm.compose.plan':{method:'POST',path:'phone/plan',args:{contactId:str(true,100),draft:str()}},
 'consent.set':{method:'POST',path:'consent',args:{value:choice(['active','revoked']),ownerConfirmed:{type:'boolean',required:true}}},
};
export const readOnly=new Set(['health','identity.get','family.list','task.list','task.get','memory.list','memory.search','memory.shared','contact.list','ontology.get','vm.diagnose']);
export function validate(operation,input={}){
 const spec=operations[operation];if(!spec)throw Object.assign(new Error(`Unknown operation: ${operation}`),{code:'USAGE',exitCode:2});
 if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(new Error('arguments must be an object'),{code:'USAGE',exitCode:2});
 const args={};
 for(const key of Object.keys(input))if(!Object.hasOwn(spec.args,key))throw Object.assign(new Error(`Unknown argument: ${key}`),{code:'USAGE',exitCode:2});
 for(const [key,rule] of Object.entries(spec.args)){
  const value=input[key];
  if(value===undefined){if(rule.required)throw Object.assign(new Error(`Missing argument: ${key}`),{code:'USAGE',exitCode:2});continue;}
  if(typeof value!==rule.type||(rule.type==='string'&&(!value.trim()||(rule.max&&value.length>rule.max)))||(rule.values&&!rule.values.includes(value)))throw Object.assign(new Error(`Invalid argument: ${key}`),{code:'USAGE',exitCode:2});
  args[key]=rule.type==='string'?value.trim():value;
 }
 return args;
}
export function capabilities(){return {name:'molla',version:'0.1.0',schema_version:'1.0',transport:'local-http-cookie',production_auth:false,operations:Object.entries(operations).map(([name,spec])=>({name,arguments:spec.args,read_only:readOnly.has(name),requires_session:spec.session!==false})),approval:{operation:'task.decide',owner_confirmation_required:true,action_hash_required:true},vm:{per_owner:true,automatic_sending:false}};}
