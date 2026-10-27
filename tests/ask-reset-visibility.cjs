'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={window:{matchMedia:()=>({matches:true})},I18n:{t:key=>key},Glyphs:{pencil:'p',fork:'f',padlock:'l',shield:'s',trash:'d'},console,setTimeout,clearTimeout};vm.createContext(c);for(const file of ['chat-list.js','row-menu.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
let count=0;const check=(name,pass)=>{assert.ok(pass,name);count++;console.log('ok  '+name)};
async function main(){
 const item=()=>({rename:{disabled:false},lock:{disabled:false,getAttribute:()=>''}}),a=item(),b=item(),locked=new Set(),rules=new Map([['a',[]],['b',['grant']]]);let reads=0;
 const list={rows:new Map([['a',a],['b',b]]),chat:{settings:{mode:'full'}},library:{resetPermissions(){},isLocked:id=>locked.has(id),permissions:async id=>{reads++;return rules.get(id)||[]}},onFork(){}};
 const menu=id=>c.window.ChatList.prototype.menuItems.call(list,id),reset=lines=>lines?.some(line=>line.name==='permissions');
 check('FULL without rules has no reset entry',!reset(await menu('a')));check('FULL with old ASK rules still has no reset entry',!reset(await menu('b')));check('Non-ASK menus do not read permission files',reads===0);
 list.chat.settings.mode='auto';check('AUTO never displays ASK reset',!reset(await menu('b'))&&reads===0);
 list.chat.settings.mode='ask';check('ASK without saved rules has no reset entry',!reset(await menu('a')));check('ASK with saved rules displays reset',reset(await menu('b')));
 check('Reading one chat cannot borrow another chat’s rules',!reset(await menu('a'))&&reset(await menu('b')));
 const names=(await menu('b')).map(line=>line.name);check('Other chat actions retain their order',names.join(',')==='rename,fork,lock,permissions,delete');
 rules.set('b',[]);check('After clearing all rules the item disappears',!reset(await menu('b')));rules.set('b',['grant']);
 locked.add('b');const before=reads;check('Locked chats have no reset entry and do not read sealed rules',!reset(await menu('b'))&&reads===before);locked.delete('b');
 const original=list.library.permissions;list.library.permissions=async()=>{throw Error('fixture read error')};check('A permission read failure leaves useful menu actions but no reset',!reset(await menu('b'))&&(await menu('b')).some(line=>line.name==='rename'));list.library.permissions=original;
 let resolve;list.library.permissions=()=>new Promise(r=>resolve=r);const pending=menu('b');list.chat.settings.mode='full';resolve(['grant']);check('Switching to FULL during a read cannot show stale ASK reset',!reset(await pending));
 list.chat.settings.mode='ask';const sealed=menu('b');locked.add('b');resolve(['grant']);check('Locking during a read cannot expose reset',!reset(await sealed));locked.delete('b');
 const removed=menu('b');list.rows.delete('b');resolve(['grant']);check('A row removed during reading produces no obsolete menu',await removed===null);list.rows.set('b',b);list.library.permissions=original;
 delete list.library.resetPermissions;check('Legacy libraries without reset support retain the ordinary menu',!reset(await menu('b')));list.library.resetPermissions=()=>{};
 check('Unknown chats do not produce a menu',await menu('missing')===null);
 // Actual async opening/closing guards, with only final DOM painting replaced by a recorder.
 const root={getAnimations:()=>[],matches:()=>false},row={isConnected:true,classList:{remove(){}}},button={isConnected:true,setAttribute(){}},calls=[];const R=c.window.RowMenu;
 function ui(items){const u=Object.create(R.prototype);Object.assign(u,{root,items,id:'',pending:'',opening:0,row:null,button:null,show(id,r,b,lines){calls.push(id);Object.assign(this,{id,row:r,button:b});}});return u}
 let done;const u=ui(()=>new Promise(r=>done=r));const job=u.open('a',row,button);check('An async menu records which row is pending',u.pending==='a');u.close();done([{name:'rename'}]);check('Closing before reading finishes prevents reopening',await job===false&&calls.length===0&&!u.pending);
 let first,second;const race=ui(id=>new Promise(r=>{if(id==='a')first=r;else second=r}));const ja=race.open('a',row,button),jb=race.open('b',row,button);second([{name:'rename'}]);await jb;first([{name:'rename'}]);await ja;check('Only the newest row opens after out-of-order reads',calls.join(',')==='b'&&race.id==='b');
 const toggle=ui(()=>new Promise(r=>done=r));const toggled=toggle.open('a',row,button);toggle.toggle('a',row,button);done([{name:'rename'}]);check('A second click on the same pending row cancels opening',await toggled===false&&!toggle.pending);
 const missing=ui(async()=>[{name:'rename'}]);check('Detached rows cannot open a late menu',await missing.open('x',{...row,isConnected:false},button)===false);
 const rejected=ui(async()=>{throw Error('fixture failure')});check('Rejected menu data does not leave a pending or unhandled open',await rejected.open('x',row,button)===false&&!rejected.pending);
 const empty=ui(async()=>[]);check('An empty menu does not become a blank popup',await empty.open('x',row,button)===false);
 console.log(`\n${count} checks passed`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
