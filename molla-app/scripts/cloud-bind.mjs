import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { callCloud, cloudMappings } from '../server/cloud-vm.mjs';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
if(args.includes('--help')){console.log('Use --owner mom|dad|son --phone-id ID from the cloud catalog. Only binds a saved Android; does not start it.');process.exit(0);}
const owner=args[args.indexOf('--owner')+1],phoneId=args[args.indexOf('--phone-id')+1];
if(!args.includes('--owner')||!args.includes('--phone-id')||!['mom','dad','son'].includes(owner)||!/^[-A-Za-z0-9_.]{1,200}$/.test(phoneId||''))throw new Error('Use --owner mom|dad|son --phone-id ID from the cloud catalog.');
const file=resolve(root,'.data/cloud-bindings.json');
const mappings=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
if(mappings[owner]&&mappings[owner].phoneId!==phoneId)throw new Error('Existing binding must be stopped and reviewed before reassignment.');
const catalog=await callCloud({operation:'catalog'});
if(!catalog.phones.some(p=>p.id===phoneId&&p.platform==='android'&&!p.temporary))throw new Error('Choose an existing saved Android profile in this account.');
mappings[owner]={phoneId};cloudMappings({MOLLA_CLOUD_BINDINGS:JSON.stringify(mappings)});
mkdirSync(resolve(root,'.data'),{recursive:true});writeFileSync(file,JSON.stringify(mappings,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({bound:true,owner,phoneId,started:false}));
