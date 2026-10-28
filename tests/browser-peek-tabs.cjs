'use strict';
// Actual tab state transitions; webviews/DOM/bridge are fixtures. Real CSS/native views are tested by the UI suite.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');let count=0;function check(name,value){assert.ok(value,name);count++;console.log('ok  '+name)}
const styles=read('styles.css'),rule=styles.match(/\.app\.is-browser-peek:not\(\.is-browser-open\) \.browser:not\(\.is-agent\) (\.browser-view[^\{]*)\{\s*visibility:\s*visible;/);
check('The narrow browser visibility exception exists',!!rule);
check('The narrow browser exception applies only to the active webview',rule[1].trim()==='.browser-view.is-active');
check('Inactive tabs still reject visibility and pointer events',/\.browser-view:not\(\.is-active\)\s*\{\s*visibility:\s*hidden;\s*pointer-events:\s*none;/.test(styles));
check('Agent background views retain their separate live but transparent rule',/\.browser-view\.is-worked\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*0;/.test(styles));
const frames=[],c={window:{},requestAnimationFrame:fn=>frames.push(fn),console};vm.createContext(c);vm.runInContext(read('browser-panel.js'),c);const B=c.window.BrowserPanel;
const classes=()=>{const values=new Set();return {toggle(k,on){on?values.add(k):values.delete(k)},contains:k=>values.has(k)}};
let focused=0,created=0,saved=0;const p=Object.create(B.prototype);Object.assign(p,{tabs:[],active:null,home:null,open:true,docked:false,peek:true,seats:new Map(),url:{focus(){focused++}},render(){},syncBar(){},save(){saved++},report(){},sync(){},createView(tab,url){created++;tab.id=created;tab.view={classList:classes(),remove(){tab.removed=true},getURL:()=>url};return tab.view}});
const first=p.newTab('https://first.invalid');check('First tab owns its page and selection',p.active===first&&first.view.classList.contains('is-active'));
const empty=p.newTab();check('New blank tab is separate and selected',p.active===empty&&empty!==first&&empty.url==='');check('A blank tab creates no copied or duplicate webview',empty.view===null&&created===1);check('Selecting blank removes the old view active state',!first.view.classList.contains('is-active'));frames.splice(0).forEach(fn=>fn());check('New blank tab focuses the address in the visible overlay',focused===1);
const second=p.newTab('https://second.invalid');check('Second page is independent of the first',p.active===second&&second.id!==first.id&&first.view.getURL()==='https://first.invalid');check('Only the newly selected view has the active state',second.view.classList.contains('is-active')&&!first.view.classList.contains('is-active'));
p.select(first);check('Selecting the first restores only its own page',p.active===first&&first.view.classList.contains('is-active')&&!second.view.classList.contains('is-active'));
const background=p.newTab('https://background.invalid',{background:true});check('A background tab never steals the selected page',p.active===first&&!background.view.classList.contains('is-active'));
p.select(empty);p.close(empty);check('Closing a selected blank tab restores its adjacent tab',p.active===second&&!p.tabs.includes(empty)&&second.view.classList.contains('is-active'));
p.close(first);check('Closing an inactive page leaves the current page untouched',p.active===second&&first.removed);
p.docked=true;p.newTab();frames.splice(0).forEach(fn=>fn());check('Docked blank tabs use the same independent selection and URL focus',!p.active.view&&!second.view.classList.contains('is-active')&&focused===2);
for(let n=0;n<16;n++)p.newTab('',{focus:false});check('The existing tab limit is preserved',p.tabs.length===12);check('Selected tab survives trimming and saves remain enabled',p.tabs.includes(p.active)&&saved>0);
console.log(`\n${count} checks passed`);
