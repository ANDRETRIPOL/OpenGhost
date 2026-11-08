'use strict';
// Actual adapters, official Anthropic SDK and loopback HTTP/SSE only. No live credential or model.
const http=require('node:http'),assert=require('node:assert/strict');
const OpenAI=require('../desktop/openai.js'),Claude=require('../desktop/anthropic.js'),Router=require('../desktop/openrouter.js');
let count=0;const checks=[],requests=[],getCounts=new Map();
const check=(name,pass)=>{assert.ok(pass,name);count++;checks.push(name)};
const tiers=[{service_tiers:[{id:'priority'}],want:true},{service_tiers:['fast'],want:true},{additional_speed_tiers:['fast'],want:true},{service_tiers:[{id:'ultrafast'}],want:false},{service_tiers:[],want:false},{service_tiers:{id:'priority'},additional_speed_tiers:'fast',want:false}];
function event(res,value,name){if(name)res.write('event: '+name+'\n');res.write('data: '+JSON.stringify(value)+'\n\n')}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='GET'){
   getCounts.set(req.url,(getCounts.get(req.url)||0)+1);res.writeHead(200,{'Content-Type':'application/json'});
   if(req.url.startsWith('/codex/models'))res.end(JSON.stringify({models:tiers.map((t,i)=>({slug:'gpt-9-fast-'+i,visibility:'list',supported_reasoning_levels:['low','high'],...t}))}));
   else {const fast=req.url.includes('priority')&&!req.url.includes('offline')&&req.headers.authorization!=='Bearer restricted';res.end(JSON.stringify({data:{endpoints:[{service_tier:fast?'priority':'default',status:0},{service_tier:'ultrafast',status:0},...(req.url.includes('offline')?[{service_tier:'priority',status:1}]:[])]}}))}return;
  }
  let text='';for await(const c of req)text+=c;const body=JSON.parse(text);requests.push({path:req.url,body,beta:req.headers['anthropic-beta']||'',hint:req.headers['x-codex-routing-hint']||null,originator:req.headers.originator||null});
  const anthro=req.url.startsWith('/anthropic'),fast=anthro?body.speed==='fast':body.service_tier==='priority';
  if(body.model.includes('fast-error')&&fast){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'invalid_request_error',code:'invalid_value',param:anthro?'speed':'service_tier',message:'Fast speed / service_tier is not available for this reasoning model'}}));return}
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  if(anthro){
   event(res,{type:'message_start',message:{id:'msg_fixture',type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:8,output_tokens:0,speed:fast?'fast':'standard'}}},'message_start');
   event(res,{type:'content_block_start',index:0,content_block:{type:'text',text:''}},'content_block_start');
   event(res,{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'OK'}},'content_block_delta');event(res,{type:'content_block_stop',index:0},'content_block_stop');
   event(res,{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}},'message_delta');event(res,{type:'message_stop'},'message_stop');
  }else if(req.url.startsWith('/router')){
   event(res,{model:body.model,service_tier:fast?'priority':'default',choices:[{delta:{content:'OK'},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:1,total_tokens:9}});res.write('data: [DONE]\n\n');
  }else{event(res,{type:'response.output_text.delta',item_id:'reply',delta:'OK'});event(res,{type:'response.completed',response:{service_tier:fast?'priority':'default',usage:{input_tokens:8,output_tokens:1,total_tokens:9}}})}res.end();
 }catch(error){res.destroy(error)}
});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const message={role:'user',content:'local fixture'},common={key:'fixture-only',model:'gpt-9-speed',messages:[message],effort:'high',thinking:'adaptive',fast:true,speed:'fast'};
 const openContext={apiUrl:base+'/openai',codexUrl:base+'/codex',chatgpt:async()=>({access:'fixture-only'})};
 const caught=p=>p.then(()=>null,e=>e);
 try{
  const models=await OpenAI.models({provider:'chatgpt'},openContext);
  for(let i=0;i<tiers.length;i++)check('GPT catalogue Fast metadata '+i,models.find(m=>m.api==='gpt-9-fast-'+i)?.fast===tiers[i].want);
  for(const provider of ['openai','chatgpt']){
   const fast=await OpenAI.stream({...common,provider},openContext),asked=requests.at(-1).body;
   check(provider+': Fast sets priority without changing High',fast.content==='OK'&&asked.service_tier==='priority'&&asked.reasoning.effort==='high');
   check(provider+': actual tier is reported by the fixture server',fast.serviceTier==='priority');
   check(provider+': routing hint is subscription-only and identity stays OpenGhost',provider==='chatgpt'?requests.at(-1).hint==='model=gpt-9-speed;tier=priority'&&requests.at(-1).originator==='openghost':requests.at(-1).hint===null);
   await OpenAI.stream({...common,provider,speed:'standard'},openContext);
   check(provider+': off explicitly pins default and preserves High',requests.at(-1).body.service_tier==='default'&&requests.at(-1).body.reasoning.effort==='high');
   check(provider+': off clears the priority routing hint',provider==='chatgpt'?requests.at(-1).hint==='model=gpt-9-speed':requests.at(-1).hint===null);
   await OpenAI.stream({...common,provider,fast:false},openContext);
   check(provider+': unconfirmed Fast capability sends no service tier',!('service_tier' in requests.at(-1).body));
   const before=requests.length,e=await caught(OpenAI.stream({...common,provider,model:'gpt-9-fast-error'},openContext));
   check(provider+': Fast refusal is surfaced without downgrade or retry',e?.status===400&&requests.length===before+1);
   await OpenAI.stream({...common,provider,model:'gpt-9-fast-error',speed:'standard'},openContext);
   check(provider+': the next standard High is not poisoned',requests.at(-1).body.service_tier==='default'&&requests.at(-1).body.reasoning.effort==='high');
  }
  check('Claude Opus5.5 Fast uses no old beta',Claude.fastOf({id:'claude-opus-5-5'}).fast&&Claude.fastOf({id:'claude-opus-5-5'}).fastBeta==='');
  check('Claude Opus5 requires its documented beta',Claude.fastOf({id:'claude-opus-5'}).fastBeta==='fast-mode-2026-02-01');
  check('Claude older Fast is unavailable after retirement',!Claude.fastOf({id:'claude-opus-4-8'},Date.parse('2026-12-01')).fast);
  check('Claude unsupported and future versions are not guessed',!Claude.fastOf({id:'claude-sonnet-5'}).fast&&!Claude.fastOf({id:'claude-opus-6'}).fast&&!Claude.fastOf({id:'claude-opus-4-7'}).fast);
  const claude={...common,model:'claude-opus-5',fastBeta:'fast-mode-2026-02-01'};
  const cf=await Claude.stream(claude,{baseURL:base+'/anthropic'}),cr=requests.at(-1);
  check('Actual Claude SDK sends Fast and High together',cf.content==='OK'&&cr.body.speed==='fast'&&cr.body.output_config.effort==='high'&&cr.body.thinking.type==='adaptive');
  check('Claude Fast and fallback beta headers are both retained',cr.beta.includes('fast-mode-2026-02-01')&&cr.beta.includes('server-side-fallback-2026-07-01'));
  await Claude.stream({...claude,speed:'standard'},{baseURL:base+'/anthropic'});
  check('Claude off removes only speed, not High',!requests.at(-1).body.speed&&requests.at(-1).body.output_config.effort==='high');
  const cb=requests.length,ce=await caught(Claude.stream({...claude,model:'claude-fast-error'},{baseURL:base+'/anthropic'}));
  check('Claude Fast error cannot disable thinking',ce?.status===400&&requests.length===cb+1);
  await Claude.stream({...claude,model:'claude-fast-error',speed:'standard'},{baseURL:base+'/anthropic'});
  check('Claude subsequent standard request retains High',requests.at(-1).body.output_config.effort==='high');
  const routerContext={apiUrl:base+'/router'};
  const desc=Router.described([{id:'test/model',name:'Test',architecture:{input_modalities:['text'],output_modalities:['text']}}])[0];
  check('OpenRouter does not guess Fast from catalogue API-path endpoints',desc.fastLookup===true&&desc.fast===undefined);
  const s0=getCounts.get('/router/models/test/priority/endpoints')||0;
  const both=await Promise.all([Router.speed({key:'fixture-only',model:'test/priority'},routerContext),Router.speed({key:'fixture-only',model:'test/priority'},routerContext)]);
  check('OpenRouter confirms actual priority endpoint',both.every(r=>r.fast));
  check('Concurrent capability lookups are deduplicated',getCounts.get('/router/models/test/priority/endpoints')===s0+1);
  check('Capability cache does not cross accounts',!(await Router.speed({key:'restricted',model:'test/priority'},routerContext)).fast);
  check('Standard-only and ultrafast-only endpoints do not advertise Fast',!(await Router.speed({key:'fixture-only',model:'test/standard'},routerContext)).fast);
  check('Offline priority endpoint is not advertised',!(await Router.speed({key:'fixture-only',model:'test/priority-offline'},routerContext)).fast);
  const rr={...common,model:'test/priority',thinking:'levels'};
  const rf=await Router.stream(rr,routerContext);
  check('OpenRouter Fast preserves model identity and High',requests.at(-1).body.model==='test/priority'&&requests.at(-1).body.reasoning.effort==='high'&&requests.at(-1).body.service_tier==='priority'&&rf.serviceTier==='priority');
  const rb=requests.length,re=await caught(Router.stream({...rr,model:'test/fast-error'},routerContext));
  check('OpenRouter tier error cannot become a thinking blacklist',re?.status===400&&requests.length===rb+1);
  await Router.stream({...rr,model:'test/fast-error',speed:'standard'},routerContext);
  check('OpenRouter next default tier retains High',requests.at(-1).body.service_tier==='default'&&requests.at(-1).body.reasoning.effort==='high');
  console.log(JSON.stringify({count,passed:count,requests:requests.length,checks},null,2));console.log(count+' checks passed');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;server.closeAllConnections();server.close()});
