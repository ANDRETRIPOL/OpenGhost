'use strict';
// Real Providers + Chat.loop/request/takeQueue. Only transport, timers, tools and DOM painting are fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');let count=0;const check=(name,pass)=>{assert.ok(pass,name);count++;console.log('ok  '+name)};
const config={id:'fixture',provider:'openai',model:'fixture',effort:'high',efforts:['low','high'],ready:true};
const overload={type:'error',status:503,code:'server_error',message:'Our servers are currently overloaded. Please try again later.'};
const tool={id:'read-once',function:{name:'read_file',arguments:'{"path":"fixture.txt"}'}};
const done=(content,calls=[])=>({type:'done',result:{content,toolCalls:calls,finishReason:calls.length?'tool_calls':'stop',usage:{prompt_tokens:10,completion_tokens:2,total_tokens:12}}});
function client(run,{manual=false,deepseek=null}={}){
 let listener,serial=0;const timers=new Map(),waits=[],requests=[],usage=[],events=[];
 const bridge={onEvent:fn=>listener=fn,abort:id=>listener({id,type:'error',aborted:true}),start:(id,request)=>{requests.push(JSON.parse(JSON.stringify(request)));const n=requests.length;queueMicrotask(async()=>{try{await run({n,request,emit:event=>listener({id,...event}),late:event=>queueMicrotask(()=>listener({id,...event}))})}catch(error){listener({id,type:'error',status:error.status||0,code:error.code||'',message:error.message})}})}};
 const c={window:{openghost:{llm:bridge},matchMedia:()=>({matches:true}),dispatchEvent(){}},console,I18n:{t:key=>key,has:()=>false},Usage:{record:(...args)=>usage.push(args),parts:u=>u?{input:u.prompt_tokens||0,output:u.completion_tokens||0,cached:0,written:0}:null},UserContext:{pictures:()=>[]},Skills:{blocks:()=>''},AgentTools:{shell:'run_powershell'},QueuedRing:{lift:()=>events.push('queue-read')},AbortController,DOMException,CustomEvent:class{},TextDecoderStream,
  setTimeout:(fn,ms)=>{const id=++serial;waits.push(ms);timers.set(id,fn);if(!manual)queueMicrotask(()=>{if(timers.delete(id))fn()});return id},clearTimeout:id=>timers.delete(id)};
 vm.createContext(c);if(deepseek)c.DeepSeek=deepseek;
 for(const file of ['providers.js','agent-plan.js','plan-proof.js','chat.js']){vm.runInContext(read(file),c);for(const name of ['Providers','AgentPlan','PlanProof'])if(c.window[name])c[name]=c.window[name]}
 return {c,api:c.Providers,timers,waits,requests,usage,events};
}
function conversation(h,id='a',cfg=config){
 const c=h.c,views=[],saves=[],executions=[];const conv={id,record:{id},messages:[{role:'user',content:'TASK_'+id}],tokens:0,list:{append(el){el.isConnected=true}}};
 const view=()=>{const v={el:{isConnected:true},stream:{push:text=>{v.text=text},checkpoint:()=>h.events.push('checkpoint'),finish:()=>Promise.resolve()}};views.push(v);return v};
 const chat=Object.create(c.window.Chat.prototype);Object.assign(chat,{agent:()=>false,system:async()=>['fixture system'],notes:()=>[],seam:()=>0,session:()=>id+'-session',dismissGhost(){},showGhost(){},showRetry(){h.events.push('reconnecting');chat.onRetry?.()},compactIfNeeded:async()=>{},planWatch:()=>false,planNudge:()=>'',planBack:()=>'',proofAudit:()=>'',assistantMessage:view,nodes:new Map(),postPills(){},closePart(_conv,part){h.events.push('close-part');part.view.stream.finish()},compose:async(_conv,entry,prompt)=>{entry.content=prompt.text},save(){saves.push(JSON.parse(JSON.stringify(conv.messages)))},useTool:async(_conv,_turn,_view,call)=>{executions.push(call);return 'COMPLETED_TOOL_RESULT'}});
 const turn=chat.begin(conv,cfg);chat.openPart(conv,turn);return {conv,chat,turn,views,saves,executions,run:()=>chat.loop(conv,turn)};
}
async function rejected(work){try{await work;return null}catch(error){return error}}
async function tick(){await new Promise(setImmediate)}
async function main(){
 const h=client(({n,emit})=>{if(n===1)emit(done('Прочитаю файл.',[tool]));else if(n===2){emit({type:'content',delta:'Часть ответа сохранена.'});emit(overload)}else emit(done('Работа продолжена.'))});
 const a=conversation(h);let error;try{await a.run()}catch(e){error=e}
 check('Agent continues automatically after a partial stream fails mid-task',!error&&h.requests.length===3&&a.conv.messages.at(-1).content==='Работа продолжена.');
 check('A tool completed before the failure is executed exactly once',a.executions.length===1&&a.executions[0].id==='read-once');
 const resumed=h.requests[2].messages;
 check('The next request contains the completed tool output',resumed.filter(m=>m.role==='tool'&&m.content==='COMPLETED_TOOL_RESULT').length===1);
 check('The partial visible text is retained exactly once in history',resumed.filter(m=>m.role==='assistant'&&m.content==='Часть ответа сохранена.').length===1);
 check('A trusted recovery note explains continuation rather than restarting',resumed.some(m=>m.role==='user'&&m.content.includes('temporary provider failure')));
 check('Recovery opens the next part within the same running turn',a.turn===a.conv.turn&&a.turn.parts.length===2&&a.turn.parts.every(p=>p.entry.turn===a.turn.id));
 check('Model, effort and session are not silently changed',h.requests.every(r=>r.model==='fixture'&&r.effort==='high'&&r.session==='a-session'));
 check('Recovery waits and displays the existing reconnecting status',JSON.stringify(h.waits)==='[1000]'&&h.events.includes('reconnecting')&&h.events.includes('checkpoint'));
 check('Partial progress is saved before another model request',a.saves.some(items=>items.some(e=>e.steps?.some(s=>s.content==='Часть ответа сохранена.'))));
 check('Successful completion resets the shared outage budget',a.turn.retryBudget.used===0);
 check('The interrupted native tool call is never executed',!a.executions.some(x=>x.id==='incomplete'));
 // A tool call that has only begun in the interrupted stream is discarded, and a fresh complete call executes once.
 const t=client(({n,emit})=>{if(n===1){emit({type:'activity'});emit(overload)}else if(n===2)emit(done('',[{...tool,id:'fresh-complete'}]));else emit(done('Готово'))});const tchat=conversation(t);await tchat.run();
 check('Tool activity before an error also resumes without a manual Retry',t.requests.length===3&&tchat.executions.length===1);
 check('A complete replacement tool call executes only after a successful response',tchat.executions[0].id==='fresh-complete'&&t.requests[1].messages.every(m=>!m.tool_calls?.some(x=>x.id==='incomplete')));
 const r=client(({n,emit})=>{if(n===1){emit({type:'reasoning',delta:'unfinished thought'});emit(overload)}else emit(done('После рассуждения'))});await conversation(r).run();
 check('Reasoning-only interruptions can recover',r.requests.length===2&&r.waits[0]===1000);
 check('Incomplete thinking is not forged into signed native history',r.requests[1].messages.every(m=>!m.native&&!m.reasoning_content));
 const network=client(({n,emit})=>{if(n===1){emit({type:'content',delta:'До обрыва сети'});emit({type:'error',code:'network',message:'fixture reset'})}else emit(done('После обрыва'))});await conversation(network).run();check('Network errors after visible text also recover',network.requests.length===2);
 // Pending recommendations arrive in order at the normal queue boundary after reconnecting.
 const q=client(({n,emit})=>{if(n===1){emit({type:'content',delta:'Сохранённый фрагмент'});emit(overload)}else emit(done('Учёл рекомендацию'))});const qc=conversation(q);qc.chat.onRetry=()=>{qc.turn.queue.push({prompt:{text:'USER_CORRECTION',attachments:[]},bubble:{}})};await qc.run();
 check('A queued recommendation is composed into the resumed context',q.requests[1].messages.some(m=>m.role==='user'&&m.content==='USER_CORRECTION'));
 check('The recommendation queue is consumed exactly once',qc.turn.queue.length===0&&q.events.filter(e=>e==='queue-read').length===1);
 for(const failure of [{status:401,code:'network'},{status:402,code:'billing_error'},{status:429,code:'insufficient_quota'},{status:400,code:'server_error'},{status:0,code:'protocol'},{status:0,code:'unknown_error'}]){
  const p=client(({emit})=>{emit({type:'content',delta:'PARTIAL'});emit({type:'error',...failure,message:'fixture failure'})});const pc=conversation(p);const ended=await rejected(pc.run());check('Permanent/unknown failure does not auto-continue: '+failure.status+'/'+failure.code,!!ended&&p.requests.length===1&&p.waits.length===0);
 }
 const stopped=client(({emit})=>{emit({type:'content',delta:'Сохранить при остановке'});emit(overload)},{manual:true}),sc=conversation(stopped);const work=rejected(sc.run());for(let n=0;n<20&&!stopped.timers.size;n++)await tick();
 check('The turn stays busy while reconnection is waiting',sc.conv.turn===sc.turn&&sc.turn.reconnecting&&stopped.timers.size===1);
 sc.chat.active=sc.conv;sc.chat.stop();const abort=await work;check('End cancels the backoff without sending another request',abort?.name==='AbortError'&&stopped.requests.length===1&&stopped.timers.size===0);
 check('Stop preserves the interrupted text and clears reconnecting state',sc.conv.messages.some(e=>e.content==='Сохранить при остановке')&&!sc.turn.reconnecting);
 // One shared budget, not six nested sets of provider retries plus agent retries.
 const forever=client(({emit})=>{emit({type:'content',delta:'part'});emit(overload)}),fc=conversation(forever);check('A persistent partial-stream outage eventually reports the error',!!await rejected(fc.run()));
 check('Partial failures are bounded by seven requests and the existing six waits',forever.requests.length===7&&JSON.stringify(forever.waits)==='[1000,2000,4000,8000,16000,32000]');
 const empty=client(({emit})=>emit(overload));check('An outage before any output does not gain a second retry budget',!!await rejected(conversation(empty).run())&&empty.requests.length===7&&empty.waits.length===6);
 const mixed=client(({n,emit})=>{if(n===1||n===3)emit({type:'content',delta:'partial '+n});emit(overload)});await rejected(conversation(mixed).run());check('Mixed replay and continuation failures share the same bounded budget',mixed.requests.length===7&&JSON.stringify(mixed.waits)==='[1000,2000,4000,8000,16000,32000]');
 const progress=client(({n,emit})=>{if(n===1||n===3){emit({type:'content',delta:'progress'});emit(overload)}else emit(done(n===2?'Шаг':["Готово"][0],n===2?[tool]:[]))});await conversation(progress).run();check('A successful model step permits recovery from a later independent outage',progress.requests.length===4&&JSON.stringify(progress.waits)==='[1000,1000]');
 const action=client(({emit})=>emit(done('',[tool]))),ac=conversation(action);ac.chat.useTool=async()=>{ac.executions.push(tool);throw Object.assign(Error('Tool failed after running'),{status:503,code:'network'})};check('Tool execution errors are not blindly replayed by provider recovery',!!await rejected(ac.run())&&action.requests.length===1&&action.waits.length===0&&ac.executions.length===1);
 // Completed provider-native blocks survive; only the failed response is converted to plain retained text.
 const native={provider:'openai',items:[{type:'reasoning',encrypted_content:'SIGNED_COMPLETE'},{type:'function_call',call_id:tool.id,name:'read_file',arguments:tool.function.arguments}]};
 const n=client(({n,emit})=>{if(n===1)emit({type:'done',result:{...done('Native step',[tool]).result,native}});else if(n===2){emit({type:'content',delta:'Оборванный фрагмент'});emit(overload)}else emit(done('Дальше'))});await conversation(n).run();check('Completed native reasoning and tool blocks remain byte-for-byte unchanged',JSON.stringify(n.requests[2].messages.find(m=>m.native)?.native)===JSON.stringify(native));
 // Independent conversations in the same renderer must not share budget, state or partial replies.
 const per={};const parallel=client(({request,emit})=>{const which=request.session,seen=per[which]=(per[which]||0)+1;if(which==='A-session'&&seen===1){emit({type:'content',delta:'A partial'});emit(overload)}else emit(done(which))});const ca=conversation(parallel,'A'),cb=conversation(parallel,'B');await Promise.all([ca.run(),cb.run()]);
 check('Parallel conversations recover independently',per['A-session']===2&&per['B-session']===1&&parallel.waits.length===1);
 check('A recovered request cannot borrow another chat’s messages',parallel.requests.filter(r=>r.session==='A-session').every(r=>!JSON.stringify(r.messages).includes('TASK_B')));
 // Actual DeepSeek reader: a transport failure after content must retain its network classification.
 const deep=client(()=>{});let deepCalls=0;deep.c.fetch=async()=>{const call=++deepCalls;let reads=0;return {ok:true,body:{pipeThrough(){return this},getReader(){return {read:async()=>{if(call===1){if(!reads++)return {value:'data: {"choices":[{"delta":{"content":"DEEP PARTIAL"}}]}\n',done:false};throw TypeError('fixture connection reset')}return {value:'data: {"choices":[{"delta":{"content":"DEEP COMPLETE"},"finish_reason":"stop"}]}\ndata: [DONE]\n',done:false}},cancel:()=>Promise.resolve()}}}}};vm.runInContext(read('deepseek.js'),deep.c);deep.c.DeepSeek=deep.c.window.DeepSeek;const dc=conversation(deep,'deep',{...config,provider:'deepseek',key:'fixture'});await dc.run();
 check('A real DeepSeek reader error mid-stream automatically continues',deepCalls===2&&dc.conv.messages.some(e=>e.content==='DEEP PARTIAL')&&dc.conv.messages.at(-1).content==='DEEP COMPLETE');
 check('Failed streams do not invent usage or double-count completed requests',h.usage.length===2&&a.turn.parts.reduce((sum,p)=>sum+(p.entry.usage?.requests||0),0)===2);
 check('The recovery instruction is hidden context, not a fabricated user bubble',a.conv.messages.filter(m=>m.role==='user').length===1);
 let partialCalls=0;
 const unsafe=client(()=>{},{deepseek:{streamChat:async options=>{if(++partialCalls===1){options.onActivity();options.onContent('KEPT',{content:'KEPT'});throw Object.assign(Error('interrupted'),{code:'network',partial:{content:'KEPT',reasoning:'INCOMPLETE_THOUGHT',native:{provider:'deepseek',items:['UNSIGNED']},toolCalls:[{...tool,id:'incomplete',function:{name:'write_file',arguments:'{"path":'}}]}})}return done('SAFE').result}}});const uc=conversation(unsafe,'unsafe',{...config,provider:'deepseek'});await uc.run();const safeHistory=uc.chat.history(uc.conv);
 check('Partial tool arguments supplied by a direct provider never execute',partialCalls===2&&uc.executions.length===0&&safeHistory.every(m=>!m.tool_calls));
 check('Failed native and reasoning blocks are discarded while visible text survives',safeHistory.some(m=>m.content==='KEPT')&&safeHistory.every(m=>!m.native&&!m.reasoning_content));
 const local=client(({emit})=>{emit({type:'content',delta:'LOCAL PARTIAL'});emit({type:'error',status:500,code:'server_error',message:'model does not fit'})});check('A local model memory/request failure does not enter auto-continuation',!!await rejected(conversation(local,'local',{...config,provider:'local'}).run())&&local.requests.length===1&&local.waits.length===0);
 const pre=client(()=>{}),pr=conversation(pre);pr.turn.controller.abort();check('Stopping before the loop sends no provider request',((await rejected(pr.run()))?.name==='AbortError')&&pre.requests.length===0);
 const setup=client(()=>{}),su=conversation(setup);su.chat.system=async()=>{throw Object.assign(Error('context read failed'),{status:503,code:'network'})};check('Context-preparation failures are not mistaken for stream failures',!!await rejected(su.run())&&setup.requests.length===0&&setup.waits.length===0);
 const disk=client(({emit})=>{emit({type:'content',delta:'KEEP'});emit(overload)}),di=conversation(disk);di.chat.save=()=>{throw Object.assign(Error('disk failed'),{code:'network',status:503})};check('Storage failures cannot trigger another model request',!!await rejected(di.run())&&disk.requests.length===1&&disk.timers.size===0);
 const broken=client(()=>{});broken.c.fetch=async()=>new Response('data: {invalid json}\n');broken.c.Response=Response;vm.runInContext(read('deepseek.js'),broken.c);broken.c.DeepSeek=broken.c.window.DeepSeek;check('Malformed DeepSeek JSON is a protocol error rather than a retry loop',(await rejected(conversation(broken,'broken',{...config,provider:'deepseek',key:'fixture'}).run()))?.code==='protocol'&&broken.waits.length===0);
 console.log(`\n${count} checks passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
