'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');let count=0;
const check=(name,pass)=>{assert.ok(pass,name);count++;console.log('ok  '+name)};
const context={window:{},Library:{pathKey:p=>p},I18n:{t:k=>k},console};vm.createContext(context);vm.runInContext(read('chat-list.js'),context);
const ChatList=context.window.ChatList;
const records=[
 {id:'a',title:'Alpha',folder:'home',space:'a',updated:100,mode:'ask',model:'model-a'},
 {id:'b',title:'Beta',folder:'home',space:'b',updated:150,mode:'full',model:'model-b'},
 {id:'newer',title:'Newer',folder:'home',space:'newer',updated:200},
 {id:'older',title:'Older',folder:'home',space:'older',updated:50},
];
const library={chats:records,chat:id=>records.find(r=>r.id===id)};
const list=Object.assign(Object.create(ChatList.prototype),{library,chat:{activeId:'a'},depths:new Map(),opened:new Set()});
const all=()=>true,pairs=[{left:'a',right:'b',ratio:.5}];
let live=list.pairChats([],all);check('Ordinary chats retain their original records when no pairs exist',live.length===4&&live.every((r,i)=>r===records[i]));
const before=JSON.stringify(records);live=list.pairChats(pairs,all);
check('A pair participates as one ordinary ordering entry',live.length===3&&live.map(r=>r.id).join(',')==='a,newer,older');
check('The pair uses the newest member activity',live[0].updated===150);
check('An unpinned pair retains the left chat usual section',live[0].space==='a'&&live[0].folder==='home'&&!live[0].pinned);
check('Pair layout does not change any saved conversation data',JSON.stringify(records)===before);
check('Both original records remain attached to the pair entry',list.pairItems.get('a').chats[0]===records[0]&&list.pairItems.get('a').chats[1]===records[1]);
check('Newer ordinary chats sort ahead of older pairs',list.tree(live).map(r=>r.id).join(',')==='newer,a,older');
records[1].pinned=true;live=list.pairChats(pairs,all);
check('A pinned right member anchors the pair in the pinned section',live.some(r=>r.id==='b'&&r.pinned));
check('Pinning never creates a duplicate partner entry',live.length===3&&!live.some(r=>r.id==='a')&&list.pairItems.get('b').chats.length===2);
check('Pinning does not overwrite the unpinned left record',!records[0].pinned&&records[0].space==='a');
check('A visible left parent keeps a right-anchored pair shown',list.isShown(live.find(r=>r.id==='b')));
records[1].pinned=false;live=list.pairChats(pairs,all);check('Unpinning restores the primary chat original section',live[0].id==='a'&&live[0].space==='a');
records.push({id:'c',title:'Gamma',folder:'C:/project',updated:400},{id:'d',title:'Delta',folder:'C:/project',updated:450});
const two=[...pairs,{left:'c',right:'d',ratio:.6}];live=list.pairChats(two,all);
check('Several pairs and ordinary chats coexist without duplicates',live.length===4&&new Set(live.map(r=>r.id)).size===4&&list.pairItems.size===2);
check('Folder pairs retain their real folder metadata',live.find(r=>r.id==='c').folder==='C:/project'&&records[5].folder==='C:/project');
check('Ordinary activity ordering applies to folder pairs too',list.tree(live).map(r=>r.id).join(',')==='c,newer,a,older');
live=list.pairChats(pairs,r=>r.title==='Beta');check('A match in the secondary title retains the whole pair',live.length===1&&live[0].id==='a'&&list.pairItems.get('a').chats.length===2);
live=list.pairChats(pairs,()=>false);check('A nonmatching pair does not appear in search',live.length===0);
live=list.pairChats(pairs,r=>r.id==='newer');check('A nonmatching pair never hides an unrelated matching chat',live.length===1&&live[0]===records[2]);
live=list.pairChats([{left:'a',right:'missing'}],all);check('An incomplete stale pair cannot hide its surviving chat',live.find(r=>r.id==='a')===records[0]&&live.length===records.length);
live=list.pairChats(pairs,all);check('Pair rendering never merges modes or selected models',records[0].mode==='ask'&&records[1].mode==='full'&&records[0].model==='model-a'&&records[1].model==='model-b');
list.chat={activeId:'other',workspace:{viewOfId:id=>id==='b'?{}:null}};check('A visible secondary pane keeps its pair shown',list.isShown(live.find(r=>r.id==='a')));
list.chat={activeId:'other',workspace:{viewOfId:()=>null}};check('A pair with neither parent visible is not forced into the visible subset',!list.isShown(live.find(r=>r.id==='a')));
for(let i=0;i<8;i++)records.push({id:'recent'+i,title:'Recent '+i,folder:'home',updated:1000-i});
list.chat={activeId:'a'};live=list.tree(list.pairChats(pairs,all));const more={dataset:{},setAttribute(){},querySelector:()=>({})},group={moreRow:more};
const trimmed=list.trim(group,live,false);check('An open pair beyond the first five entries is retained as a whole',trimmed.some(r=>r.id==='a')&&trimmed.at(-1)===more);
check('Trimming never splits out the secondary conversation',!trimmed.some(r=>r.id==='b')&&list.pairItems.get('a').chats.length===2);
const css=read('styles.css'),source=read('chat-list.js');
check('Thread content reserves at least the full scrollbar hit width plus a gap',css.includes('--thread-side-gap: max(var(--composer-side-gap), calc(var(--scrollbar-hit-width) + 6px))')&&css.includes('100% - 2 * var(--thread-side-gap)'));
check('The thread indicator is below both edge veils',/\.thread-scrollbar\s*\{\s*z-index:\s*1;/.test(css)&&/\.thread-view::after\s*\{/.test(css));
const captionMask=/\.is-split-secondary > \.thread-view > \.thread\s*\{([^}]*)\}/.exec(css)?.[1]||'';
check('The pane caption clears reply text without masking its sibling scrollbar',captionMask.includes('scroll-padding-top: 56px')&&captionMask.includes('transparent 38px, #000 56px'));
check('Eligible split rows reserve space for all three action buttons',css.includes('--chat-actions-width: 78px')&&css.includes('min-width: var(--chat-actions-width, 52px)'));
check('The old heavy left bracket is absent',!css.includes('box-shadow: inset 3px 0 0 rgba(var(--fg-rgb), 0.3)'));
check('Secondary pane rows have no separate persistent selection decoration',!css.includes('.chat-row.is-open-beside:not(.is-active)')&&!css.includes('.chat-row.is-split-active:not(.is-active)'));
check('The active pair frame never adds a background behind ordinary rows',!(/\.chat-pair\.is-active\s*\{([^}]*)\}/.exec(css)?.[1]||'').includes('background'));
check('Nested active row paint is contained in the pair frame',/\.chat-pair\s*\{[^}]*overflow:\s*clip;/.test(css)&&css.includes('.chat-pair > .chat-row:focus-visible'));
check('Hover highlights follow both left position and width of their target',source.includes('style.left = `${(rect.left - frame.left).toFixed(2)}px`')&&source.includes('style.width = `${rect.width.toFixed(2)}px`'));
console.log('\n'+count+' checks passed');
