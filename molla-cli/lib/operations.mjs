const str=(required=true,max=1000)=>({type:'string',required,max});
const choice=(values,required=true)=>({type:'string',required,values});
const op=args=>({args});
export const operations={
 health:{args:{},session:false},'identity.get':op({}),'family.list':op({}),'family.invite':op({name:str(true,20)}),'family.join':op({code:str(true,8)}),
 'task.create':op({text:str(),owner:str(false,100),draft:str(false),contactId:str(false,100)}),
 'task.list':op({status:choice(['awaiting_approval','running','prepared','needs_verification','failed','completed','rejected','cancelled'],false)}),
 'task.get':op({id:str(true,100)}),'task.decide':op({id:str(true,100),decision:choice(['approve','reject','cancel']),ownerConfirmed:{type:'boolean',required:false},expectedActionHash:str(false,64)}),
 'task.execute':op({id:str(true,100)}),'task.recover':op({id:str(true,100)}),
 'memory.list':op({}),'memory.search':op({query:str(false,300)}),'memory.remember':op({text:str(true,300)}),'memory.correct':op({id:str(true,100),text:str(true,300)}),'memory.forget':op({id:str(true,100)}),'memory.shared':op({}),'memory.share':op({id:str(true,100),grantee:str(true,100)}),'memory.revoke':op({id:str(true,100),grantee:str(true,100)}),
 'contact.list':op({}),'contact.add':op({name:str(true,40),relation:str(true,20),phone:str(true,24)}),'contact.remove':op({id:str(true,100)}),'ontology.get':op({}),
 'vm.diagnose':op({}),'vm.compose.plan':op({contactId:str(true,100),draft:str()}),'vm.app.plan':op({appId:choice(['settings','browser','kakao','coupang','calendar'])}),
 'consent.set':op({value:choice(['active','revoked']),ownerConfirmed:{type:'boolean',required:true}}),'permission.set':op({scopes:str(true,100),ownerConfirmed:{type:'boolean',required:true}}),
};
export const readOnly=new Set(['health','identity.get','family.list','task.list','task.get','memory.list','memory.search','memory.shared','contact.list','ontology.get','vm.diagnose']);
export function validate(operation,input={}){
 const spec=operations[operation];const error=message=>Object.assign(new Error(message),{code:'USAGE',exitCode:2});if(!spec)throw error(`Unknown operation: ${operation}`);
 if(!input||typeof input!=='object'||Array.isArray(input))throw error('arguments must be an object');const args={};
 for(const key of Object.keys(input))if(!Object.hasOwn(spec.args,key))throw error(`Unknown argument: ${key}`);
 for(const [key,rule] of Object.entries(spec.args)){const value=input[key];if(value===undefined){if(rule.required)throw error(`Missing argument: ${key}`);continue;}if(typeof value!==rule.type||(rule.type==='string'&&(!value.trim()||(rule.max&&value.length>rule.max)))||(rule.values&&!rule.values.includes(value)))throw error(`Invalid argument: ${key}`);args[key]=rule.type==='string'?value.trim():value;}
 return args;
}
export function capabilities(){return {name:'molla',version:'0.2.0',schema_version:'1.0',transport:'direct-process-sqlite',http_server_required:false,browser_required:false,production_auth:false,operations:Object.entries(operations).map(([name,spec])=>({name,arguments:spec.args,read_only:readOnly.has(name),requires_session:spec.session!==false})),approval:{atomic_action_hash_check:true,explicit_execute_command:true},vm:{per_owner:true,driver:'adb-cli',automatic_sending:false}};}
