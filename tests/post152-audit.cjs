'use strict';
// Serial execution avoids native focus/keyboard contention between full-client integration suites.
// All outputs and child diagnostics go to TEMP, never the repository or the user's profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),all=[
 ['split-sidebar-scroll-ui.cjs'],['split-isolation-ui.cjs'],['split-view.cjs'],['post152-ownership-ui.cjs'],['post152-background-ui.cjs'],
 ['post152-visual-ui.cjs'],['native-visuals-ui.cjs'],['agent-end-button-ui.cjs'],['app-controls-ui.cjs','--all'],['approval-permissions-ui.cjs'],
 ['chat-effort-ui.cjs'],['composer-photo-preview-ui.cjs'],['auto-resume-transient-ui.cjs'],['compact-model-recovery-ui.cjs'],['browser-peek-tabs-ui.cjs'],
 ['browser-file-transfer-ui.cjs'],['sidebar-scrollbar-ui.cjs'],['lock-card-motion.cjs'],['plan-island-motion.cjs'],['post152-storage-ui.cjs'],
];
const option=process.argv.find(a=>a.startsWith('--block=')),block=option?Number(option.slice(8)):null;assert.ok(block===null||Number.isInteger(block)&&block>=1&&block<=4,'--block must be 1, 2, 3 or 4');assert.ok(process.argv.slice(2).every(a=>a===option),'Unknown option');
const selected=block?all.slice((block-1)*5,block*5):all,output=fs.mkdtempSync(path.join(os.tmpdir(),'og-post152-audit-')),report={output,block,results:[],checks:0};
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const electron=require('electron');let failed=false;
for(const args of selected){
 const result=spawnSync(electron,[path.join(__dirname,args[0]),...args.slice(1)],{cwd:root,env,encoding:'utf8',timeout:360000,maxBuffer:16*1024*1024,windowsHide:true});
 const stdout=result.stdout||'',stderr=result.stderr||'',log=path.join(output,args[0]+'.log');fs.writeFileSync(log,stdout+'\n[child stderr]\n'+stderr);
 const item={suite:args[0],status:result.status,log,diagnostics:stderr.trim()};
 try{
  assert.equal(result.status,0,result.error?.message||'Child suite failed');
  let file=null;
  for(const match of stdout.matchAll(/"output"\s*:\s*"((?:\\.|[^"\\])*)"/g)){const candidate=path.join(JSON.parse('"'+match[1]+'"'),'report.json');if(fs.existsSync(candidate))file=candidate}
  assert.ok(file,'Child did not report a readable report.json');const evidence=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(!evidence.error,evidence.error);assert.ok(Array.isArray(evidence.checks)&&evidence.checks.length,'Child has no checks');assert.ok(!evidence.checks.some(c=>c&&typeof c==='object'&&c.pass===false),'Child report contains a failed check');
  item.report=file;item.checks=evidence.checks.length;item.errors=evidence.errors||[];item.warnings=evidence.warnings||[];report.checks+=item.checks;
 }catch(error){item.error=String(error.message||error);failed=true}
 report.results.push(item);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({suite:item.suite,checks:item.checks||0,error:item.error||null,report:item.report}));
 if(failed)break;
}
report.error=failed?'One or more suites failed':null;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,suites:report.results.length,checks:report.checks,error:report.error}));process.exitCode=failed?1:0;
