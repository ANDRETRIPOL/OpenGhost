'use strict';
// Actual local/custom parser -> IPC-shaped bridge -> Providers -> Chat.loop/request.
// Socket bodies, timers, tools and DOM are fixtures; no account, live model or command is used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
let count=0;function check(name,value){assert.ok(value,name);count++;console.log('ok  '+name)}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const waits=[1000,2000,4000,8000,16000,32000];
const config={id:'fixture',provider:'custom',model:'fixture',key:'fixture',address:'https://fixture.invalid/v1',effort:'high',efforts:['low','high'],ready:true};
const sse=events=>events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('');
const success={choices:[{delta:{content:'RECOVERED'},finish_reason:'stop'}]};
function fixture(body,{http=200,partial=false,forever=true,provider='custom'}={}){
 let listener,posts=0;const requests=[],delays=[],saves=[],usage=[],shown=[];
 const net={request(_url,_options,callback){const request=new EventEmitter();request.destroy=error=>request.emit('error',error);request.end=()=>queueMicrotask(()=>{const n=++posts,failed=forever||n===1;
  const response=Readable.from([Buffer.from(!failed?sse([success])+'data: [DONE]\n\n':http!==200?JSON.stringify(body):sse([...(partial?[{choices:[{delta:{content:'RETAINED_PARTIAL'}}]}]:[]),body]))]);response.statusCode=failed?http:200;callback(response);response.on('end',()=>request.emit('close'))});return request}};
 const engine={module:{exports:{}},exports:{},Buffer,TextDecoder,URL,AbortSignal,AbortController,console,setTimeout,clearTimeout,fetch:async()=>({ok:false,status:404,json:async()=>({})}),require:name=>['node:http','node:https'].includes(name)?net:require(name)};
 vm.createContext(engine);vm.runInContext(read('desktop/local.js'),engine);
 const bridge={onEvent:fn=>listener=fn,abort:id=>listener({id,type:'error',aborted:true}),start:(id,request)=>{requests.push(JSON.parse(JSON.stringify(request)));queueMicrotask(async()=>{try{const result=await engine.module.exports.stream(request,{onEvent:event=>listener({id,...event})});listener({id,type:'done',result})}catch(error){listener({id,type:'error',status:error.status||0,code:error.code||'',message:error.message})}})}};
 const c={window:{openghost:{llm:bridge},matchMedia:()=>({matches:true})},I18n:{t:key=>key},Usage:{record:(_config,value)=>usage.push(value),parts:()=>null},UserContext:{pictures:()=>[]},Skills:{blocks:()=>''},AgentTools:{shell:'run_powershell'},QueuedRing:{lift(){}},AbortController,DOMException,CustomEvent:class{},console,
  setTimeout:(fn,ms)=>{delays.push(ms);queueMicrotask(fn);return delays.length},clearTimeout(){}};
 vm.createContext(c);
 for(const file of ['providers.js','agent-plan.js','plan-proof.js','chat.js']){vm.runInContext(read(file),c);for(const name of ['Providers','AgentPlan','PlanProof'])if(c.window[name])c[name]=c.window[name]}
 const chat=Object.create(c.window.Chat.prototype),conv={id:'fixture',record:{id:'fixture'},messages:[{role:'user',content:'Continue the fixture task'}],tokens:0,list:{append(el){el.isConnected=true}}};
 const view=()=>{const v={el:{isConnected:true},stream:{push:text=>shown.push(text),checkpoint(){},finish:()=>Promise.resolve()}};return v};
 Object.assign(chat,{agent:()=>false,system:async()=>[],notes:()=>[],seam:()=>0,session:()=> 'fixture-session',dismissGhost(){},showGhost(){},showRetry(){},compactIfNeeded:async()=>{},planWatch:()=>false,planNudge:()=>'',planBack:()=>'',proofAudit:()=>'',assistantMessage:view,nodes:new Map(),postPills(){},closePart(_conv,part){part.view.stream.finish()},save(){saves.push(JSON.parse(JSON.stringify(conv.messages)))},useTool:async()=>{throw Error('No tool may run')}});
 const turn=chat.begin(conv,{...config,provider,key:provider==='local'?'http://fixture.invalid':config.key});chat.openPart(conv,turn);
 return{chat,conv,turn,requests,delays,saves,shown,usage,get posts(){return posts},run:()=>chat.loop(conv,turn)};
}
async function failed(work){try{await work;return null}catch(error){return error}}
async function main(){
 const quota=['insufficient_quota','billing_error','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded','content_filter'];
 for(const code of quota){
  for(const options of [{http:429},{partial:true}]){
   const f=fixture({error:{code,message:'CONTROLLED_PERMANENT'}},options),error=await failed(f.run());
   check(code+(options.http?' HTTP':' partial stream')+': stops after exactly one request',!!error&&f.posts===1&&f.delays.length===0);
   check(code+': symbolic error code survives the parser and bridge',error.code===code);
   if(options.partial)check(code+': partial visible progress is retained exactly once',f.chat.history(f.conv).filter(m=>m.role==='assistant'&&m.content==='RETAINED_PARTIAL').length===1);
  }
 }
 for(const body of [{error:{type:'insufficient_quota',message:'TYPE_ONLY'}},{type:'error',code:'credit_balance_exhausted',message:'FLAT'}]){
  const f=fixture(body,{partial:true});check('Type-only and flat error envelopes remain permanent',!!await failed(f.run())&&f.posts===1&&f.delays.length===0);
 }
 for(const body of [{error:{status:401,code:'server_error'}},{error:{status_code:'400',type:'overloaded_error'}},{type:'error',status:402,code:'server_error'}]){
  const f=fixture(body,{partial:true}),error=await failed(f.run());check('Explicit permanent stream status wins over a transient-looking code',!!error&&f.posts===1&&f.delays.length===0&&[400,401,402].includes(error.status));
 }
 const misleading=fixture({error:{status:503,code:'server_error'}},{http:400}),wrong=await failed(misleading.run());check('A real HTTP status wins over contradictory embedded status',wrong?.status===400&&misleading.posts===1);
 const upper=fixture({error:{type:'insufficient_quota',code:' CREDIT_BALANCE_EXHAUSTED ',message:'fixture'}},{http:429});check('Specific code has priority over broader type and is normalized safely',(await failed(upper.run()))?.code==='CREDIT_BALANCE_EXHAUSTED'&&upper.posts===1);
 const numeric=fixture({error:{code:'429',type:'insufficient_quota'}},{partial:true}),ne=await failed(numeric.run());check('Numeric code supplies status while symbolic type still prevents quota retries',ne?.status===429&&ne.code==='insufficient_quota'&&numeric.posts===1);
 for(const body of [{error:{code:'unknown_error',message:'unknown'}},{error:'arbitrary service failure'},{type:'error',message:'unknown envelope'},{error:{code:123456}},{error:{type:'error'}}]){
  const f=fixture(body,{partial:true}),error=await failed(f.run());check('Unknown stream failures do not acquire a fabricated HTTP 500',!!error&&error.status===0&&f.posts===1&&f.delays.length===0);
 }
 for(const body of [{error:{code:'server_error'}},{error:{type:'service_unavailable_error'}},{error:{code:503}},{type:'error',code:'rate_limit_exceeded'}]){
  const f=fixture(body,{partial:true,forever:false});await f.run();check('Known transient stream errors still continue automatically',f.posts===2&&same(f.delays,[1000])&&f.conv.messages.at(-1).content==='RECOVERED');
  check('Successful recovery records usage only for the completed response',f.usage.length===1);
 }
 const httpTransient=fixture({error:{code:'rate_limit_exceeded'}},{http:429,forever:false});await httpTransient.run();check('HTTP rate limiting still safely replays before output',httpTransient.posts===2&&same(httpTransient.delays,[1000]));
 const exhausted=fixture({error:{code:'server_error'}},{partial:true});check('A persistent real transient failure retains the single shared retry budget',!!await failed(exhausted.run())&&exhausted.posts===7&&same(exhausted.delays,waits));
 const local=fixture({error:{code:'server_error',message:'model does not fit'}},{http:500,provider:'local'});check('Local HTTP500 model failures remain non-retriable',!!await failed(local.run())&&local.posts===1&&local.delays.length===0);
 const stringHTTP=fixture({error:'own service message'},{http:401}),se=await failed(stringHTTP.run());check('Legacy string errors keep their real HTTP status',se?.status===401&&stringHTTP.posts===1);
 console.log(`\n${count} checks passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
