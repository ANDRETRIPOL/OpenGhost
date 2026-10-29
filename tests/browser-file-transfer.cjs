'use strict';
// Actual schemas, policy, browser PNG export and main-process file guards. Native pixels are covered by the full UI suite.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'og-browser-files-unit-')),workspace=path.join(temp,'workspace'),profile=path.join(temp,'profile');for(const f of [workspace,profile])fs.mkdirSync(f);
let count=0;function check(name,value){assert.ok(value,name);count++;console.log('ok  '+name)}
function frontend(platform='win32',panel=null){
 const c={window:{openghost:{platform,tools:{}},browserPanel:panel},URL,I18n:{t:k=>k},console};vm.createContext(c);vm.runInContext(read('agent-tools.js'),c);return c.window.AgentTools;
}
async function main(){
 const A=frontend(),schema=A.schemas.find(t=>t.function.name==='browser_screenshot').function.parameters;
 check('Screenshot schema offers a real PNG export path',schema.properties.save_to?.type==='string');
 check('Screenshot schema offers viewport rectangles and element captures',['x','y','width','height','ref'].every(k=>schema.properties[k]));
 const opts={cwd:'C:\\project'},needs=(mode,args)=>A.needsApproval('browser_screenshot',args,{...opts,mode});
 check('Looking at a screenshot is still free in ASK and AUTO',!needs('ask',{})&&!needs('auto',{}));
 check('ASK treats saved screenshots as file writes',needs('ask',{save_to:'chart.png'}));
 check('AUTO can save inside its project but asks outside',!needs('auto',{save_to:'chart.png'})&&needs('auto',{save_to:'C:\\other\\chart.png'}));
 check('Full access never adds a screenshot permission prompt',!needs('full',{save_to:'C:\\other\\chart.png'}));
 const rule=args=>A.approvalRule('browser_screenshot',args,opts);
 check('Saved screenshot grants stay inside the same project',rule({save_to:'a.png'}).key===rule({save_to:'sub/b.png'}).key&&rule({save_to:'a.png'}).key!==rule({save_to:'C:\\other\\a.png'}).key);
 check('An external screenshot grant never covers another external file',rule({save_to:'C:\\other\\a.png'}).key!==rule({save_to:'C:\\other\\b.png'}).key);
 check('The save approval names its exact output file',A.describe('browser_screenshot',{save_to:'sub/chart.png'},opts.cwd).places[0].label==='chart.png');
 for(const platform of ['darwin','linux']){const U=frontend(platform);check(platform+': AUTO writes stay project-scoped',!U.needsApproval('browser_screenshot',{save_to:'chart.png'},{mode:'auto',cwd:'/work'})&&U.needsApproval('browser_screenshot',{save_to:'/outside/chart.png'},{mode:'auto',cwd:'/work'}));}
 const uploadSchema=A.schemas.find(t=>t.function.name==='browser_upload')?.function.parameters;
 check('The upload tool exposes bounded local paths, explicit input and replacement',uploadSchema?.properties.paths.maxItems===10&&uploadSchema.properties.ref&&uploadSchema.properties.replace&&uploadSchema.required.includes('paths'));
 const uargs={paths:['chart.png'],ref:1};
 check('Uploads are explicit external-transfer approvals in ASK and AUTO',A.needsApproval('browser_upload',uargs,{...opts,mode:'ask'})&&A.needsApproval('browser_upload',uargs,{...opts,mode:'auto'}));
 check('Full access never adds an upload permission prompt',!A.needsApproval('browser_upload',uargs,{...opts,mode:'full'}));
 check('Uploads cannot acquire an Always-allow exception',A.approvalRule('browser_upload',uargs,opts)===null);
 const sent=[],seat={};const panel={tabsLine:()=>'',run:async(name,args,o)=>{sent.push({name,args,apart:o.apart});return name==='browser_snapshot'?{text:'Page',refs:{1:'file input "Chart"'},page:o.apart?'https://own.invalid/compose':'https://mail.invalid/compose',document:o.apart?'own-doc':'main-doc'}:{text:'Selected file'}}};
 const P=frontend('win32',panel);await P.run('browser_snapshot',{}, {id:'snapshot',cwd:opts.cwd});await P.run('browser_upload',{...uargs,_page:'https://evil.invalid',_document:'forged'},{id:'upload',cwd:opts.cwd});
 check('Model-supplied upload destination/context cannot replace the snapshot binding',sent.at(-1).args._page==='https://mail.invalid/compose'&&sent.at(-1).args._document==='main-doc');
 const card=P.describe('browser_upload',uargs,opts.cwd);check('Upload approval identifies both the local file and actual destination',card.effect==='online'&&card.places.some(p=>p.kind==='site'&&p.title==='https://mail.invalid/compose')&&card.places.some(p=>p.kind==='file'&&p.label==='chart.png'));
 await P.run('browser_snapshot',{}, {id:'own-snapshot',cwd:opts.cwd,apart:seat});await P.run('browser_upload',uargs,{id:'own-upload',cwd:opts.cwd,apart:seat});check('An apart agent receives only its own snapshot document binding',sent.at(-1).args._page==='https://own.invalid/compose'&&sent.at(-1).args._document==='own-doc');
 const other={};await P.run('browser_upload',uargs,{id:'unknown-agent',cwd:opts.cwd,apart:other});check('An agent without a snapshot cannot borrow another agent\'s page binding',sent.at(-1).args._page===''&&sent.at(-1).args._document==='');
 for(const file of ['i18n.js','i18n-ru.js','i18n-fr.js','i18n-it.js'])check(file+': has the localized upload title and status',read(file).includes("'approve.upload':")&&read(file).includes("'deed.upload':"));
 const lineContext={window:{},I18n:{t:k=>k},AgentTools:A,URL};vm.createContext(lineContext);vm.runInContext(read('agent-line.js'),lineContext);const deed=lineContext.window.AgentLine.deed;
 check('Upload status uses ordinary localized words and filenames only',deed('browser_upload',{paths:['C:\\private\\chart.png','sub/report.pdf']}).verb==='deed.upload'&&deed('browser_upload',{paths:['sub/chart.png']}).what==='chart.png');
 check('Screenshot-save status distinguishes writing a PNG from merely viewing the page',deed('browser_screenshot',{save_to:'shots/chart.png'}).verb==='deed.write'&&deed('browser_screenshot',{}).verb==='deed.page');
 check('Agent guidance uses saved PNGs and normal website attachments, not app zoom',read('agent-prompt.js').includes('browser_screenshot with save_to')&&read('agent-prompt.js').includes('browser_upload')&&read('agent-prompt.js').includes('change app/page zoom'));
 class Image{
  constructor(width,height){this.width=width;this.height=height}getSize(){return{width:this.width,height:this.height}}isEmpty(){return false}toPNG(){return Buffer.from('NATIVE PNG '+this.width+'x'+this.height)}toJPEG(){return Buffer.from('PREVIEW')}resize({width}){return new Image(width,Math.round(this.height*width/this.width))}crop({width,height}){return new Image(width,height)}
 }
 const Native={createFromBuffer:b=>{const s=JSON.parse(b.toString());return new Image(s.width,s.height)}};
 const mockedSizes=new Map();const mockPromises=new Proxy(fs.promises,{get(target,key){if(key==='stat')return async file=>mockedSizes.has(path.basename(file))?{size:mockedSizes.get(path.basename(file)),isFile:()=>true}:fs.promises.stat(file);if(key==='realpath')return async file=>mockedSizes.has(path.basename(file))?file:fs.promises.realpath(file);const value=target[key];return typeof value==='function'?value.bind(target):value}});const apiFS=new Proxy(fs,{get(target,key){return key==='promises'?mockPromises:target[key]}});
 const ctx={module:{exports:{}},exports:{},require:n=>n==='electron'?{app:{getPath:()=>profile},nativeImage:Native}:n==='node:fs'?apiFS:n.startsWith('./')?{}:require(n),process,Buffer,URL,setTimeout,clearTimeout,console};vm.createContext(ctx);vm.runInContext(read('desktop/browser.js')+'\nmodule.exports.audit={screenshot,saveScreenshot,uploadFiles,acceptsFile,act};',ctx);
 const calls=[],guest={debugger:{sendCommand:async(name,args={})=>{calls.push({name,args});if(name==='Page.getLayoutMetrics')return{cssVisualViewport:{clientWidth:1600,clientHeight:900},cssContentSize:{height:2600}};if(name==='Page.captureScreenshot')return{data:Buffer.from(JSON.stringify({width:3200,height:(args.clip?.height||900)*2})).toString('base64')};throw Error(name)}},executeJavaScriptInIsolatedWorld:async()=>({ok:{left:10,top:20,width:100,height:80}})};
 const files={file:f=>path.resolve(workspace,f)},shot=(args,signal=new AbortController().signal)=>ctx.module.exports.audit.screenshot(guest,args,signal,files);
 const s=await shot({save_to:'chart.png'});check('PNG export keeps native resolution before making the model preview',s.saved.width===3200&&s.width===1280&&fs.readFileSync(path.join(workspace,'chart.png'),'utf8')==='NATIVE PNG 3200x1800');
 check('Export returns a reusable absolute local path and byte count',path.isAbsolute(s.saved.path)&&s.saved.bytes>0&&s.saved.format==='PNG');
 await assert.rejects(shot({save_to:'chart.png'}));count++;check('Existing output remains byte-for-byte unchanged',fs.readFileSync(path.join(workspace,'chart.png'),'utf8')==='NATIVE PNG 3200x1800');
 const crop=await shot({save_to:'nested/crop.png',x:10,y:20,width:120,height:80});check('A crop uses native page-pixel scaling without resizing the page',crop.saved.width===240&&crop.saved.height===160&&crop.origin.x===10&&crop.origin.y===20);
 const element=await shot({save_to:'element.png',ref:7});check('An element capture uses its visible bounds',element.saved.width===200&&element.saved.height===160);
 await shot({save_to:'full.png',full_page:true});const full=calls.filter(c=>c.name==='Page.captureScreenshot').at(-1);check('Full-page capture uses captureBeyondViewport and a bounded clip',full.args.captureBeyondViewport===true&&full.args.clip.height===2600);
 check('No screenshot path changes page metrics, app size or zoom',calls.every(c=>!/(?:setDeviceMetricsOverride|setZoom|setSize|setContentSize)/.test(c.name)));
 for(const args of [{x:-1,y:0,width:10,height:10},{x:0,y:0,width:1700,height:10},{x:0,y:0,width:10},{full_page:true,ref:1},{full_page:true,x:0,y:0,width:1,height:1},{ref:1,x:0,y:0,width:1,height:1}]){await assert.rejects(shot(args));count++;}
 await assert.rejects(shot({save_to:'wrong.jpg'}));count++;check('Wrong-format paths never create misleading output files',!fs.existsSync(path.join(workspace,'wrong.jpg')));
 const aborted=new AbortController();aborted.abort();const n=calls.filter(c=>c.name==='Page.captureScreenshot').length;await assert.rejects(shot({save_to:'cancelled.png'},aborted.signal));count++;check('Cancellation creates no file and starts no capture',!fs.existsSync(path.join(workspace,'cancelled.png'))&&calls.filter(c=>c.name==='Page.captureScreenshot').length===n);
 const backend={module:{exports:{}},exports:{},require:n=>n==='electron'?{app:{getPath:()=>profile},net:{}}:n==='node:os'?{...os,homedir:()=>path.join(temp,'home')}:n==='./browser'?{run:async(_name,args,_sender,_signal,local)=>({resolved:local?.file(args.save_to||args.paths?.[0]),free:!local})}:n.startsWith('./')?{}:require(n),process,Buffer,URL,TextDecoder,setTimeout,clearTimeout,AbortController,console};vm.createContext(backend);vm.runInContext(read('desktop/tools.js')+'\nmodule.exports.fileGuard=browserFile;',backend);const T=backend.module.exports;
 const good=await T.runTool('file','browser_screenshot',{save_to:'new.png'},workspace,{});check('Main process resolves saved screenshots against the real project folder',good.resolved===path.join(workspace,'new.png'));
 const missing=await T.runTool('missing','browser_screenshot',{save_to:'new.png'},'',{});check('Local browser output needs a valid working folder',!!missing.error);
 const free=await T.runTool('free','browser_screenshot',{},'',{});check('Ordinary screenshot viewing does not suddenly require a folder',free.free===true);
 for(const f of [path.join(profile,'keys.json'),path.join(profile,'store','record','other.json'),path.join(profile,'pictures','private.jpg')]){const r=await T.runTool('private','browser_screenshot',{save_to:f},workspace,{});check('The entire app profile is protected from browser file access: '+path.basename(f),!!r.error)}
 const alias=path.join(workspace,'profile-link');fs.symlinkSync(profile,alias,process.platform==='win32'?'junction':'dir');check('A junction/symlink cannot bypass private profile protection',!!(await T.runTool('alias','browser_screenshot',{save_to:path.join(alias,'keys.png')},workspace,{})).error);
 const methods=ctx.module.exports.audit,sets=[],wire=[],worldCalls=[];let page='https://mail.invalid/compose',document='doc-1',duringMeta=null,readbackFails=false;
 const input={tag:'INPUT',type:'file',multiple:true,disabled:false,directory:false,accept:'image/png',count:0};
 const uploadGuest={getURL:()=>page,debugger:{sendCommand:async(name,args)=>{wire.push({name,args});if(name==='DOM.getDocument')return{root:{nodeId:1}};if(name==='DOM.performSearch')return{searchId:'search',resultCount:1};if(name==='DOM.getSearchResults')return{nodeIds:[7]};if(name==='DOM.describeNode')return{node:{backendNodeId:42}};if(name==='DOM.resolveNode')return{object:{objectId:'input-42'}};if(name==='Runtime.callFunctionOn'){duringMeta?.();return{result:{value:{...input}}}}if(name==='DOM.setFileInputFiles'){sets.push(args.files);return{}}if(name==='Runtime.releaseObject'||name==='DOM.discardSearchResults')return{};throw Error(name)}},executeJavaScriptInIsolatedWorld:async(_id,scripts)=>{worldCalls.push(scripts[0].code);if(readbackFails&&scripts[0].code.includes('__og.snapshot('))return{error:'Controlled readback failure'};if(scripts[0].code.includes('__og.uploadTarget(999,'))return{error:'Not a file input'};return{ok:scripts[0].code.includes('__og.document()')?document:true}}};
 const found={guest:uploadGuest},upload=(args,signal=new AbortController().signal,local=files)=>methods.uploadFiles(found,{paths:['chart.png'],ref:1,_page:'https://mail.invalid/compose',_document:'doc-1',...args},signal,local);
 const initialSets=sets.length;const chosen=await upload({});check('Upload selects the requested local file once through Chromium',sets.length===initialSets+1&&sets.at(-1)[0]===path.join(workspace,'chart.png')&&chosen[0].name==='chart.png');
 check('Local source paths are never inserted into page JavaScript or DOM attributes',worldCalls.every(code=>!code.includes(workspace)&&!code.includes('chart.png')));
 check('Temporary DOM searches and remote objects are released',wire.some(c=>c.name==='DOM.discardSearchResults')&&wire.some(c=>c.name==='Runtime.releaseObject'));
 const nsets=sets.length;
 for(const args of [{paths:[]},{paths:Array(11).fill('chart.png')},{paths:['chart.png','./chart.png']},{paths:[workspace]},{paths:['https://example.invalid/chart.png']},{paths:['ogpic://chat/private/pic.jpg']},{ref:999},{_page:'https://other.invalid'},{_document:'expired-doc'}]){await assert.rejects(upload(args));count++;}
 check('Invalid lists, wrong input, stale page and stale document cause no file selection',sets.length===nsets);
 mockedSizes.set('too-large.png',101*1024*1024);await assert.rejects(upload({paths:['too-large.png']}));count++;
 for(const name of ['one.png','two.png','three.png'])mockedSizes.set(name,80*1024*1024);await assert.rejects(upload({paths:['one.png','two.png','three.png']}));count++;check('Per-file and total upload bounds reject before file mutation',sets.length===nsets);
 for(const change of [{disabled:true},{directory:true},{accept:'.pdf'},{count:1}]){Object.assign(input,change);await assert.rejects(upload({}));count++;Object.assign(input,{disabled:false,directory:false,accept:'image/png',count:0})}
 check('Disabled, directory, incompatible and occupied inputs remain untouched',sets.length===nsets);
 fs.writeFileSync(path.join(workspace,'second.png'),'SECOND');input.multiple=false;await assert.rejects(upload({paths:['chart.png','second.png']}));count++;input.multiple=true;
 input.count=1;await upload({replace:true});input.count=0;check('Existing selection is changed only with explicit replace',sets.length===nsets+1);
 const stop=new AbortController();duringMeta=()=>stop.abort();const stoppedAt=sets.length;await assert.rejects(upload({},stop.signal));count++;duringMeta=null;check('End before the mutation prevents a file from reaching the page',sets.length===stoppedAt);
 found.chooser={backendNodeId:42,page,document};await upload({ref:undefined});check('An intercepted picker works without inventing a DOM ref and is consumed once',sets.length===stoppedAt+1&&found.chooser===null);await assert.rejects(upload({ref:undefined}));count++;
 found.chooser={page,document};await assert.rejects(upload({ref:undefined}));count++;check('Unsupported native pickers never fall back to OS automation',sets.length===stoppedAt+1);
 for(const given of [path.join(profile,'keys.json'),path.join(alias,'keys.json')])check('Upload reuses the same private-profile guard as export',!!(await T.runTool('blocked-upload','browser_upload',{paths:[given]},workspace,{})).error);
 check('Accept matching supports extensions and MIME wildcards',methods.acceptsFile('CHART.PNG','image/*')&&methods.acceptsFile('report.pdf','.pdf')&&!methods.acceptsFile('secret.txt','image/png'));
 const own=path.join(T.CHATS,'A'),another=path.join(T.CHATS,'B');fs.mkdirSync(own,{recursive:true});fs.mkdirSync(another,{recursive:true});fs.writeFileSync(path.join(another,'other.png'),'OTHER CHAT');const otherAlias=path.join(own,'other-link');fs.symlinkSync(another,otherAlias,process.platform==='win32'?'junction':'dir');
 check('A chat-folder symlink cannot upload another chat\'s file',!!(await T.runTool('other-chat','browser_upload',{paths:[path.join(otherAlias,'other.png')]},own,{})).error);
 check('Uploads use the existing keyboard/focus coordinator',read('browser-panel.js').includes("'browser_select', 'browser_upload'"));
 found.attached=true;found.host={isDestroyed:()=>false,send(){}};uploadGuest.debugger.isAttached=()=>true;uploadGuest.isLoading=()=>false;uploadGuest.getTitle=()=> 'Mail';readbackFails=true;const selectedBefore=sets.length;
 const uncertain=await methods.act(found,'browser_upload',{paths:['chart.png'],ref:1,_page:page,_document:document},new AbortController().signal,files);readbackFails=false;
 check('Readback failure after file selection warns before retry and never selects a duplicate',sets.length===selectedBefore+1&&/selection was accepted/.test(uncertain.text)&&/fresh snapshot before any retry/.test(uncertain.text)&&!uncertain.error);
 const privateSource={...guest,getURL:()=>require('node:url').pathToFileURL(path.join(profile,'private.txt')).href};await assert.rejects(methods.screenshot(privateSource,{save_to:'leaked.png'},new AbortController().signal,{file:given=>T.fileGuard(workspace,given)}));
 check('A private file URL cannot be laundered into an uploadable screenshot',!fs.existsSync(path.join(workspace,'leaked.png')));
 console.log(`\n${count} checks passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
