'use strict';
// Actual compact/loop/switch/end. Providers, DOM, storage and transport are isolated fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');let count=0;function check(name,value){assert.ok(value,name);count++;console.log('ok  '+name)}
const c={window:{},console,AbortController,DOMException,setTimeout,clearTimeout,I18n:{t:k=>k},Skills:{blocks:()=>''},Usage:{parts:()=>null},Providers:{}};vm.createContext(c);vm.runInContext(read('agent-plan.js'),c);c.AgentPlan=c.window.AgentPlan;vm.runInContext(read('chat.js'),c);const C=c.window.Chat;
const user=text=>({role:'user',content:text}),assistant=text=>({role:'assistant',content:text,model:'old',steps:[{role:'assistant',content:text}]});
const failure=(status=402,code='insufficient_quota')=>Object.assign(Error('CONTROLLED_COMPACT_FAILURE'),{status,code});
function fixture({old=64000,target=128000,pending=false}={}){
 const messages=[user('Keep SECRET_NONCE_9281 and finish the task'),assistant('Saved SECRET_NONCE_9281')];if(pending)messages.push(user('Continue once'));const conv={id:'fixture',record:{id:'fixture',model:'old',effort:'low',named:true},messages,tokens:63000,list:{append(){}}};
 const notices=[],calls=[],saved=[],requests=[];let reopened=0;
 const chat=Object.create(C.prototype),windows={old,new:target};
 const view=()=>({el:{hidden:true,before(){},classList:{remove(){}},querySelector(){return null}},stream:{finish:async()=>{}},status:{remove(){}}});
 const make=config=>{const entry={role:'assistant',content:'',steps:[]},v=view();return{config,controller:new AbortController(),queue:[],approvals:new Set(),parts:[],part:{entry,view:v},quiet:true}};
 Object.assign(chat,{active:conv,nodes:new Map(),modelOf:one=>one.record.model,settings:{find:id=>({name:id}),windowOf:id=>windows[id],configFor:(id,effort)=>({id,provider:'custom',window:windows[id],effort:effort||'low',ready:true}),setModel:id=>chat.selected=id},
  library:{chat:()=>conv.record,update:(_id,change)=>Object.assign(conv.record,change)},
  compactNotice:()=>{const n={};notices.push(n);return n},finishNotice:(n,ok)=>n.ok=ok,closePart(){},openPart(_conv,turn){reopened++;turn.part={entry:{role:'assistant',content:'',steps:[]},view:view()}},followBottom(){},system:async()=>[],save(){saved.push(JSON.stringify(conv.messages))},begin(_conv,config){return conv.turn=make(config)},summarize(_conv,turn){chat.pending=chat.loop(conv,turn)},request:async()=>{requests.push(conv.record.model);return {part:{},calls:[],finish:'stop'}},
  postPills(){},dismissGhost(){},onChange(){},fail(_conv,v,error){chat.shown={hidden:v.el.hidden,error}},planBack:()=>'',proofAudit:()=>'',agent:()=>false});
 c.Providers.complete=async(config,opts)=>{calls.push({id:config.id,opts});return 'SUMMARY SECRET_NONCE_9281'};
 return {chat,conv,notices,calls,saved,requests,turn:make(chat.config(conv)),get reopened(){return reopened}};
}
async function main(){
 for(const [status,code] of [[402,'insufficient_quota'],[429,'credit_balance_exhausted'],[401,'invalid_api_key'],[0,'network']]){
  const f=fixture(),error=failure(status,code),before=JSON.stringify(f.conv.messages);c.Providers.complete=async()=>{throw error};let caught;
  try{await f.chat.compact(f.conv,f.turn)}catch(e){caught=e}
  check(`${status}/${code}: compact preserves the real failure instead of silently succeeding`,caught===error);
  check(`${status}/${code}: a failed compact never edits or saves the original history`,JSON.stringify(f.conv.messages)===before&&f.saved.length===0&&f.notices[0].ok===false);
 }
 const auto=fixture({pending:true});c.Providers.complete=async()=>{throw failure()};let broke=false;try{await auto.chat.loop(auto.conv,auto.turn)}catch{broke=true}
 check('Automatic compaction failure stops before another request to the unavailable model',broke&&auto.requests.length===0);
 const middle=fixture();c.Providers.complete=async()=>{throw failure()};try{await middle.chat.compact(middle.conv,middle.turn)}catch{}
 check('Failure after closing the current part opens a place for a visible error',middle.reopened===1);
 for(const size of [64000,128000]){
  const f=fixture({target:size});f.chat.switchModel('new');await f.chat.pending;
  check(`Equal/larger context ${size}: only the user-selected new model summarizes`,f.calls.length===1&&f.calls[0].id==='new');
  check(`Equal/larger context ${size}: summary retains the earlier conversation`,f.conv.messages.some(m=>m.role==='compact'&&m.summary.includes('SECRET_NONCE_9281'))&&f.calls[0].opts.messages[1].content.includes('SECRET_NONCE_9281'));
  check(`Equal/larger context ${size}: successful switch remains on the selected model`,f.conv.record.model==='new'&&f.conv.turn.switch==='');
 }
 const small=fixture({target:32000});c.Providers.complete=async(config,opts)=>{small.calls.push({id:config.id,opts});throw failure()};small.chat.switchModel('new');let smallError;try{await small.chat.pending}catch(e){smallError=e}
 check('A smaller target never receives the unsummarized old context',small.calls.length===1&&small.calls[0].id==='old'&&!!smallError);
 await small.chat.end(small.conv,small.conv.turn,smallError,null);
 check('Failed switch rolls model and selected default back without losing history',small.conv.record.model==='old'&&small.chat.selected==='old'&&small.conv.messages[0].content.includes('SECRET_NONCE_9281'));
 check('Quiet summary errors become visible and release the chat for another model',small.chat.shown?.hidden===false&&small.chat.shown.error===smallError&&small.conv.turn===null);
 const cancelled=fixture(),stop=new DOMException('Stopped','AbortError');c.Providers.complete=async()=>{throw stop};let aborted;try{await cancelled.chat.compact(cancelled.conv,cancelled.turn)}catch(e){aborted=e}
 check('End cancellation is not swallowed or converted into a paid fallback request',aborted===stop&&!cancelled.conv.messages.some(m=>m.role==='compact')&&cancelled.saved.length===0);
 const empty=fixture();c.Providers.complete=async()=>'';check('An empty summary still cannot replace the chat history',await empty.chat.compact(empty.conv,empty.turn)===false&&!empty.conv.messages.some(m=>m.role==='compact'));
 console.log(`\n${count} checks passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
