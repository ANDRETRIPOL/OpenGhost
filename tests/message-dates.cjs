'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let count=0;const check=(name,value)=>{assert.ok(value,name);count++;console.log('ok  '+name)};
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.nodeType=1;this.children=[];this.dataset={};this.attributes={};this.className='';this.hidden=false;this.inserts=0;this.classList={contains:name=>this.className.split(/\s+/).includes(name)}}
 get firstElementChild(){return this.children[0]||null}
 get nextElementSibling(){const p=this.parentElement;return p?p.children[p.children.indexOf(this)+1]||null:null}
 append(...nodes){for(const n of nodes)this.insertBefore(n,null)}
 insertBefore(node,before){node.remove();const i=before?this.children.indexOf(before):this.children.length;assert.ok(i>=0);this.children.splice(i,0,node);node.parentElement=this;this.inserts++}
 remove(){const p=this.parentElement;if(p){p.children.splice(p.children.indexOf(this),1);this.parentElement=null}}
 setAttribute(k,v){this.attributes[k]=String(v)}
 hasAttribute(k){return k==='data-message-at'?Object.hasOwn(this.dataset,'messageAt'):Object.hasOwn(this.attributes,k)}
 closest(selector){for(let n=this;n;n=n.parentElement)if(selector==='.thread-list'&&n.classList.contains('thread-list'))return n;return null}
}
const observers=[],c={window:{I18n:{lang:'ru'}},document:{createElement:tag=>new Element(tag)},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(target,options){this.target=target;this.options=options}},queueMicrotask,console};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','message-dates.js'),'utf8'),c);const D=c.window.MessageDates;
const at=s=>Date.parse(s),ru={locale:'ru',timeZone:'Europe/Paris'};
async function main(){
 for(const bad of [undefined,null,'2026-11-08',NaN,Infinity,-Infinity,8640000000000001])check('Invalid or absent instant stays undated: '+String(bad),D.info(bad,ru)===null);
 check('Epoch zero is a real timestamp, not an absent one',D.valid(0)&&D.info(0,ru).iso==='1970-01-01T00:00:00.000Z');
 const late=at('2026-11-07T22:59:00Z'),early=at('2026-11-07T23:01:00Z'),date=D.info(early,ru);
 check('Russian date is day and month without time',date.day==='8 ноября');
 check('Visible clock has hours and minutes, not seconds',date.clock==='00:01'&&!/\d{2}:\d{2}:\d{2}/.test(date.text));
 check('The message footer shows only hours and minutes',date.text==='00:01');
 check('The machine-readable datetime retains the exact instant',date.iso==='2026-11-07T23:01:00.000Z');
 check('The tooltip retains the year for unambiguous old history',date.title.includes('2026'));
 check('English follows the requested day-month order',D.info(early,{locale:'en',timeZone:'Europe/Paris'}).day==='8 November');
 check('French month is localized',D.info(early,{locale:'fr',timeZone:'Europe/Paris'}).day==='8 novembre');
 check('Italian month is localized',D.info(early,{locale:'it',timeZone:'Europe/Paris'}).day==='8 novembre');
 check('The first dated message gets its calendar-day marker',D.boundaries([{at:early}],ru)[0].key==='2026-11-08');
 check('Two messages on the same local day share one marker',D.boundaries([{at:early},{at:early+3600000}],ru).length===1);
 const midnight=D.boundaries([{at:late},{at:early}],ru);check('Two minutes across midnight create a new day',midnight.length===2&&midnight[1].key==='2026-11-08');
 check('Crossing UTC midnight within one local day creates no extra marker',D.boundaries([at('2026-11-07T23:30:00Z'),at('2026-11-08T00:30:00Z')],ru).length===1);
 check('A 25-hour calendar day is not split after 24 elapsed hours',D.boundaries([at('2026-10-24T22:30:00Z'),at('2026-10-25T22:30:00Z')],ru).length===1);
 check('A shorter spring day still changes by local calendar date',D.boundaries([at('2026-03-28T22:30:00Z'),at('2026-03-29T21:30:00Z')],ru).length===2);
 const repeated=[at('2026-10-25T00:30:00Z'),at('2026-10-25T01:30:00Z')].map(t=>D.info(t,ru));
 check('Repeated autumn clock time keeps the same date marker',repeated[0].clock===repeated[1].clock&&repeated[0].key===repeated[1].key);
 check('The repeated clock times remain distinguishable in their exact datetime',repeated[0].iso!==repeated[1].iso&&repeated[0].title!==repeated[1].title);
 check('Year changes use distinct full calendar keys',D.boundaries([at('2026-12-31T22:59:00Z'),at('2026-12-31T23:01:00Z')],ru).map(x=>x.key).join(',')==='2026-12-31,2027-01-01');
 check('Leap day is retained as its own calendar day',D.boundaries([at('2028-02-28T12:00Z'),at('2028-02-29T12:00Z'),at('2028-03-01T12:00Z')],ru).length===3);
 check('Another time zone can put the same instant on the previous day',D.info(early,{locale:'en',timeZone:'America/New_York'}).key==='2026-11-07');
 check('Legacy messages alone do not get invented dates',D.boundaries([{role:'user'},{role:'assistant',content:'old'}],ru).length===0);
 const entries=[{role:'user'},{at:late},{role:'compact'},{at:early},{role:'stats'},{at:early+1000}],before=JSON.stringify(entries),bounds=D.boundaries(entries,ru);
 check('Technical notes do not create or reset calendar boundaries',bounds.length===2&&bounds[0].index===1&&bounds[1].index===3);
 check('Computing calendar markers never changes the saved messages',JSON.stringify(entries)===before);
 const time=D.time(early);check('Timestamp is a semantic time element',time.tagName==='TIME'&&time.className==='message-time'&&time.dateTime===new Date(early).toISOString());
 check('Timestamp text has no repeated day or month',time.textContent===D.info(early).clock&&!time.textContent.includes(' · '));
 check('No time element is fabricated for a legacy message',D.time(undefined)===null);
 const list=new Element();list.className='thread-list';const old=new Element(),a=new Element(),note=new Element(),b=new Element(),next=new Element();
 const localLate=new Date(2026,10,7,23,59).getTime(),localEarly=new Date(2026,10,8,0,1).getTime();D.mark(a,localLate);D.mark(b,localLate);D.mark(next,localEarly);list.append(old,a,note,b,next);D.watch(list);
 const markers=()=>list.children.filter(n=>n.classList.contains('thread-day'));
 check('Real list synchronization inserts just two date separators',markers().length===2&&markers().map(m=>m.dataset.day).join(',')==='2026-11-07,2026-11-08');
 check('Legacy rows stay before the first known date, without an assigned timestamp',list.children[0]===old&&!old.hasAttribute('data-message-at'));
 check('Separators sit immediately before their first dated message',markers()[0].nextElementSibling===a&&markers()[1].nextElementSibling===next);
 check('Separators are accessible and contain no message time',markers().every(m=>m.attributes.role==='separator'&&!m.firstElementChild.textContent.includes(':')));
 const savedMarkers=markers(),inserts=list.inserts;D.sync(list);check('Repeated synchronization reuses markers without layout churn',list.inserts===inserts&&markers().every((m,i)=>m===savedMarkers[i]));
 next.remove();D.sync(list);check('Removing the only message of a day removes its orphan date marker',markers().length===1);
 const q=new Element();D.mark(q,localEarly);list.append(q);D.sync(list);q.hidden=true;D.sync(list);check('A hidden placeholder does not create a visible day marker',markers().length===1);q.hidden=false;D.sync(list);
 check('A placeholder shown as a real reply regains its day marker',markers().length===2);
 const cday=new Element();D.mark(cday,localEarly);list.append(cday);D.sync(list);q.remove();D.sync(list);check('Removing the first message of a day moves the marker to the next one',markers()[1].nextElementSibling===cday);
 check('The observer watches list changes only, never every streaming token',observers[0].options.childList===true&&!observers[0].options.subtree);
 const countBefore=list.inserts;observers[0].fn([{addedNodes:[markers()[0]],removedNodes:[]}]);await Promise.resolve();check('Our own marker mutations do not cause another render pass',list.inserts===countBefore);
 D.mark(cday,localLate);await Promise.resolve();check('A changed known timestamp resynchronizes its attached list',markers().length===1);
 console.log('\n'+count+' checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
