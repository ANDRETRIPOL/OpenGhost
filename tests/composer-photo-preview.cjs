'use strict';
// Actual attachment/viewer methods with in-memory DOM, photo and quick-window fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');let count=0;
const check=(name,pass)=>{assert.ok(pass,name);count++;console.log('ok  '+name)};
class El{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.className='';this.attrs={};this.events={};this.style={};this.isConnected=true;this.classList={toggle:(key,on)=>{let a=this.className.split(' ').filter(Boolean);if(on&&!a.includes(key))a.push(key);if(!on)a=a.filter(x=>x!==key);this.className=a.join(' ')},remove:()=>{}};}
 append(...els){this.children.push(...els)}prepend(...els){this.children.unshift(...els)}insertAdjacentHTML(){}getBoundingClientRect(){return {height:56}}setAttribute(k,v){this.attrs[k]=String(v)}addEventListener(k,fn){this.events[k]=fn}removeEventListener(){}focus(){this.focused=true}remove(){this.isConnected=false}replaceChildren(...els){this.children=els}querySelector(selector){const name=selector.slice(1);for(const el of this.children){if(el.className?.split(' ').includes(name))return el;const found=el.querySelector?.(selector);if(found)return found}return null}
}
async function main(){
 const events=[],opened=[],viewer={open:options=>{opened.push(options);return {close:()=>events.push('close')}}};
 const c={window:{matchMedia:()=>({matches:true}),PhotoViewer:viewer,removeEventListener(){}},PhotoViewer:viewer,console,performance:{now:()=>1000},URL:{revokeObjectURL:url=>events.push('revoke:'+url)},I18n:{t:(key,args={})=>key+':'+(args.name||'')},FileKinds:{icon:()=>'',formatSize:()=>'',formatDuration:()=>''},document:{createElement:tag=>new El(tag),documentElement:{classList:{remove(){}},dataset:{theme:'light'}},removeEventListener(){}},setTimeout,clearTimeout};
 vm.createContext(c);vm.runInContext(read('attachments.js'),c);const A=c.window.Attachments;
 function item(name,extra={}){return {name,image:true,url:'blob:'+name,width:900,height:420,payload:{type:'image'},info:{},...extra}}
 function draft(items){const a=Object.create(A.prototype);Object.assign(a,{items,preview:null,previewItems:[],editing:null,panel:{hidePopover(){}},input:new El('textarea'),row:new El('div'),height:{onResize(){}},onChange(){events.push('change')},onNote:0,openNote(){this.onNote++}});for(const i of items)a.chip(i,false);return a}
 const a1=item('first.png'),a2=item('second.png'),video=item('clip.mp4',{image:false,video:true}),file=item('report.txt',{image:false,url:''});const a=draft([a1,file,video,a2]);
 check('Image thumbnails are real keyboard-accessible buttons',a1.el.querySelector('.attachment-preview').tagName==='BUTTON'&&a1.el.querySelector('.attachment-preview').attrs['aria-label'].includes('first.png'));
 check('The photo button contains the original thumbnail URL',a1.el.querySelector('.attachment-preview').querySelector('.attachment-thumb').src===a1.url);
 check('Remove and note remain sibling buttons, not nested inside the photo',a1.el.children.includes(a1.el.querySelector('.attachment-remove'))&&a1.el.children.includes(a1.el.querySelector('.attachment-note')));
 check('Video posters are not misrepresented as photo-preview buttons',!video.el.querySelector('.attachment-preview'));
 check('Ordinary files do not acquire photo-preview buttons',!file.el.querySelector('.attachment-preview'));
 a2.el.querySelector('.attachment-preview').events.click();const open=opened.at(-1);
 check('Click opens the existing shared viewer',opened.length===1&&a.preview!==null);
 check('Only photos are included, preserving attachment order',open.items.length===2&&open.items[0].name==='first.png'&&open.items[1].name==='second.png');
 check('The clicked photo, not always the first one, is selected',open.index===1);
 check('Viewer gets local URL, dimensions and the originating button',open.items[1].url===a2.url&&open.items[1].width===900&&open.opener===a2.el.querySelector('.attachment-preview'));
 check('Viewing neither sends nor removes an attachment',a.items.length===4&&!events.length);
 check('Viewing does not revoke the file URLs',!events.some(x=>x.startsWith('revoke:')));
 a1.el.querySelector('.attachment-note').events.click();check('The note action is independent from preview',a.onNote===1&&opened.length===1);
 a.closePreview();check('Closing only dismisses this draft viewer and clears ownership',events.at(-1)==='close'&&a.preview===null&&a.previewItems.length===0);
 check('Closing preserves the same unsent items and URLs',a.items[0]===a1&&a.items[3]===a2&&!events.some(x=>x.startsWith('revoke:')));
 const n=opened.length;a.openPhoto(video);a.openPhoto(file);a.openPhoto(item('foreign.png'));a.openPhoto({...a1,url:''});check('Files, videos, stale photos and missing URLs cannot open the viewer',opened.length===n);
 c.window.PhotoViewer=null;a.openPhoto(a1);check('A window without a viewer fails safely',opened.length===n);c.window.PhotoViewer=viewer;
 a.openPhoto(a1);const beforeTake=events.length,items=a.take();check('Taking a draft closes its own preview before removing the tray',events.slice(beforeTake).join(',')==='close,change'&&a.items.length===0&&items[0]===a1);
 check('Taking does not revoke URLs owned by the outgoing message',!events.some(x=>x.startsWith('revoke:')));
 a.give(items);check('Restoring a draft rebuilds working preview buttons',a.items.length===4&&a.items[0].el.querySelector('.attachment-preview'));
 a.openPhoto(a1);const beforeRemove=events.length;a.remove(a1);check('Removing a previewed photo closes before revoking its URL',events.slice(beforeRemove, beforeRemove+2).join(',')==='close,revoke:blob:first.png');
 check('Removing one photo leaves the others untouched',a.items.includes(a2)&&!a.items.includes(a1));
 const broken=item('broken.png'),b=draft([broken]);b.rechip=()=>{};b.openPhoto(broken);const beforeBad=events.length;b.loaded(broken,{type:'none'});check('Decode failure closes the preview before replacing the photo card',events.slice(beforeBad,beforeBad+2).join(',')==='close,revoke:blob:broken.png'&&!broken.image&&!broken.url);
 const locked=draft([item('locked.png')]);const original=viewer.open;viewer.open=()=>null;locked.openPhoto(locked.items[0]);check('A viewer already owned by another UI is not adopted or closed',!locked.preview&&locked.previewItems.length===0);viewer.open=original;
 // Actual close() method restores the opener; existing chat sliders keep their old focus behavior.
 vm.runInContext(read('photo-viewer.js'),c);const V=c.window.PhotoViewer;
 async function closeFocus(opener,slider){const img={style:{},getBoundingClientRect:()=>({left:0,top:0}),animate:()=>({finished:Promise.resolve()})},frame={getBoundingClientRect:()=>({left:0,top:0,width:300,height:300}),animate(){}},dialog={animate(){},close(){},remove(){}};const v=Object.create(V.prototype);Object.assign(v,{closing:false,opener,slider,img,frame,dialog,hidden:null,index:0});v.close();await Promise.resolve();return v}
 const opener=new El('button');await closeFocus(opener,null);check('Closing the real viewer returns focus to the draft photo button',opener.focused);
 const slide=new El('div');await closeFocus(null,{el:slide,pos:0});check('Existing sent-photo sliders still regain focus',slide.focused);
 // Evaluate the unmodified QuickViewer class from the real quick module, with only window/IPC as fixtures.
 const quickSource=read('quick-chat.js'),from=quickSource.indexOf('class QuickViewer {'),to=quickSource.indexOf('window.PhotoViewer = QuickViewer;')+'window.PhotoViewer = QuickViewer;'.length;
 const sent=[];c.quick={photo:opts=>sent.push(opts),photoClose:()=>sent.push('close'),onPhotoTurned(){},onPhotoClosed(){}};c.popover=()=>({addEventListener(){},showPopover(){},hidePopover(){},remove(){},animate:()=>({finished:Promise.resolve()})});c.document.addEventListener=()=>{};c.window.addEventListener=()=>{};c.VEIL_FADE={};vm.runInContext(quickSource.slice(from,to),c);const qOpener=new El('button');const q=c.window.PhotoViewer.open({items:[{url:'blob:unsent',name:'unsent.png',width:900,height:420}],opener:qOpener});
 check('Quick viewer passes an unsent local photo and dimensions to its existing window',sent[0].items[0].url==='blob:unsent'&&sent[0].items[0].width===900);
 q.close();q.closed(0);await Promise.resolve();check('Quick viewer closes normally and restores its draft-photo focus',sent.includes('close')&&qOpener.focused);
 const q2=c.window.PhotoViewer.open({items:[{url:'blob:other',name:'other.png'}]});q2.closed(0);await Promise.resolve();const ended=sent.length;q2.close();check('A quick photo closed by its own window cannot later close another viewer',sent.length===ended&&q2.closing);
 for(const language of ['i18n.js','i18n-ru.js','i18n-fr.js','i18n-it.js'])check(language+': has an accessible photo-open label',read(language).includes("'attach.preview':")&&read(language).includes('{name}'));
 console.log(`\n${count} checks passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
