'use strict';

// Keeps the computer awake while routines are on (desktop/routines.js), so that they run on time: it does not go to
// sleep when nobody touches it or its screen is off, and with the switch for it, not when a laptop's lid is closed.
// With no routine on, everything is as it was.
//
// Left alone: the app asks the system not to sleep (powerSaveBlocker). On macOS and Linux that is enough, and a Mac
// mini or a desktop with its screen off stays up. On Windows, Electron asks only that the app itself is not suspended,
// which on a computer with Modern Standby lets the system sleep all the same, so a small helper asks for the system.
// The lid is the system's own setting everywhere, and an app can only change it for a while:
// - Windows: the power plan's lid action is set to do nothing, and on battery the plan's sleep timeout to never
//   (Windows ends any app's request five minutes after that timeout on battery). The helper writes down what was
//   there before and puts it back when routines are off or the app is gone, also after a crash.
// - macOS: `pmset disablesleep`, which only an administrator can set, so macOS asks for the password; a watcher that
//   runs as the administrator sets it back the moment the app is gone.
// - Linux: an inhibitor lock from logind, which a user at the computer may take; it ends with the app.
// The helpers all watch for a flag file and for the app: once the flag is gone or the app has quit, they put things back.
const { app, powerSaveBlocker } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const file = name => path.join(app.getPath('userData'), name);
// Each helper has a flag of its own: one on its way out never mistakes the next one's flag for its own.
const FLAGS = /^awake-\d+-\d+\.flag$/;
const STATE = () => file('awake-restore.json');
// How long a leftover helper of an app that crashed is given to put things back itself.
const LEFTOVER = 8000;

// `helper`: the one at work now, { proc, flag, stopping }.
let blocker = -1, helper = null, held = false, made = 0, restoring = false, broken = false, config = { on: true, lid: process.platform !== 'darwin' };
// For tests: the helper writes the power commands it would run into this file instead of running them.
let dry = '';

const read = () => {
 try { return { ...config, ...JSON.parse(fs.readFileSync(file('awake.json'), 'utf8')) }; } catch { return config; }
};

const quote = text => `'${String(text).replace(/'/g, "''")}'`;

// The helper on Windows: asks for the system to stay up, changes the lid and the battery's sleep for as long as it runs,
// and puts them back. What was there is written down before anything changes, so that it can be put back even if the
// helper itself is cut short (see restoreLeft).
function windowsScript(lid, flag) {
 return `
$ErrorActionPreference = 'SilentlyContinue'
$parent = ${process.pid}; $flag = ${quote(flag)}; $state = ${quote(STATE())}; $dry = ${quote(dry)}
Add-Type -Namespace OpenGhost -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
[void][OpenGhost.Power]::SetThreadExecutionState([uint32]2147483649)
function Set-Power([string[]]$a) { if ($dry) { Add-Content -LiteralPath $dry -Value ($a -join ' ') } else { & powercfg @a | Out-Null } }
function Get-Index($scheme, $sub, $setting) {
 $v = [regex]::Matches(((& powercfg /qh $scheme $sub $setting) -join ' '), '0x([0-9a-fA-F]{8})')
 if ($v.Count -lt 2) { return $null }
 return @([Convert]::ToUInt32($v[$v.Count - 2].Groups[1].Value, 16), [Convert]::ToUInt32($v[$v.Count - 1].Groups[1].Value, 16))
}
$kept = @()
if (${lid ? '$true' : '$false'}) {
 $scheme = [regex]::Match(((& powercfg /getactivescheme) -join ' '), '[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}').Value
 if ($scheme) {
  foreach ($want in @(@('SUB_BUTTONS', 'LIDACTION', 0, 0), @('SUB_SLEEP', 'STANDBYIDLE', -1, 0))) {
   $was = Get-Index $scheme $want[0] $want[1]
   if ($was -eq $null) { continue }
   $kept += @{ sub = $want[0]; setting = $want[1]; ac = $was[0]; dc = $was[1]; setAc = $want[2]; setDc = $want[3] }
  }
  @{ scheme = $scheme; values = @($kept | ForEach-Object { @{ sub = $_.sub; setting = $_.setting; ac = $_.ac; dc = $_.dc } }) } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $state -Encoding UTF8
  foreach ($k in $kept) {
   if ($k.setAc -ge 0 -and $k.ac -ne $k.setAc) { Set-Power @('/setacvalueindex', $scheme, $k.sub, $k.setting, "$($k.setAc)") }
   if ($k.setDc -ge 0 -and $k.dc -ne $k.setDc) { Set-Power @('/setdcvalueindex', $scheme, $k.sub, $k.setting, "$($k.setDc)") }
  }
  Set-Power @('/setactive', $scheme)
 }
}
while ((Get-Process -Id $parent) -and (Test-Path -LiteralPath $flag)) { Start-Sleep -Seconds 3 }
if ($kept.Count) {
 foreach ($k in $kept) {
  Set-Power @('/setacvalueindex', $scheme, $k.sub, $k.setting, "$($k.ac)")
  Set-Power @('/setdcvalueindex', $scheme, $k.sub, $k.setting, "$($k.dc)")
 }
 Set-Power @('/setactive', $scheme)
}
Remove-Item -LiteralPath $state
[void][OpenGhost.Power]::SetThreadExecutionState([uint32]2147483648)
`;
}

// What a helper cut short left changed on Windows is put back from what it wrote down. A helper of an app that has just
// crashed is given a moment to do it itself; no new helper starts before this is done, or it would take the changed
// values for the ones to put back.
async function restoreLeft() {
 if (process.platform !== 'win32' || !fs.existsSync(STATE())) return;
 await new Promise(resolve => setTimeout(resolve, LEFTOVER));
 let state = null;
 try { state = JSON.parse(fs.readFileSync(STATE(), 'utf8').replace(/^﻿/, '')); } catch { return; }
 const scheme = String(state?.scheme || '');
 if (!/^[0-9a-f-]{36}$/i.test(scheme)) return;
 const values = Array.isArray(state.values) ? state.values : state.values ? [state.values] : [];
 const run = args => new Promise(resolve => dry ? fs.appendFile(dry, `${args.join(' ')}\n`, () => resolve()) : execFile('powercfg', args, { windowsHide: true }, () => resolve()));
 for (const value of values) {
  if (!/^[A-Z_]+$/.test(value.sub) || !/^[A-Z_]+$/.test(value.setting)) continue;
  await run(['/setacvalueindex', scheme, value.sub, value.setting, String(Number(value.ac) >>> 0)]);
  await run(['/setdcvalueindex', scheme, value.sub, value.setting, String(Number(value.dc) >>> 0)]);
 }
 await run(['/setactive', scheme]);
 fs.rmSync(STATE(), { force: true });
}

// Whether this Mac has a lid at all (a Mac mini or an iMac has none).
function hasLid() {
 return new Promise(resolve => execFile('ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '1'], (error, out) => resolve(!error && /AppleClamshellState/.test(out || ''))));
}

const sh = text => `'${String(text).replace(/'/g, `'\\''`)}'`;

// On Windows the helper must outlive the app, to put things back after a crash: a child the app starts the usual way
// ends with it, and PowerShell started apart from the app's console ends at once. So the app's own program is started
// apart, as Node, and it runs PowerShell and waits for it.
const KEEPER = `const p = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', process.env.OPENGHOST_AWAKE], { windowsHide: true, stdio: 'ignore' });
p.on('exit', code => process.exit(code || 0)); p.on('error', () => process.exit(1));`;

function startHelper() {
 const flag = file(`awake-${process.pid}-${++made}.flag`), own = { proc: null, flag, stopping: false, started: Date.now() };
 fs.writeFileSync(flag, String(process.pid));
 helper = own;
 // A helper that has ended is let go of; the next is started if the computer is still to be kept awake. One that ended
 // by itself, without being let go, is not started again until routines go off and on: it would only end again.
 const ended = () => {
  if (!own.stopping) broken = true;
  if (helper === own) helper = null;
  fs.rmSync(flag, { force: true });
  apply();
 };
 if (process.platform === 'win32') {
  const script = Buffer.from(windowsScript(config.lid, flag), 'utf16le').toString('base64');
  // It works in the app's own folder, not wherever the app was started from: what PowerShell leaves of its own lands there.
  own.proc = spawn(process.execPath, ['-e', KEEPER], { cwd: app.getPath('userData'), detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', OPENGHOST_AWAKE: script } });
 } else if (process.platform === 'linux') {
  const watch = `while kill -0 ${process.pid} 2>/dev/null && [ -e ${sh(flag)} ]; do sleep 5; done`;
  const what = config.lid ? 'sleep:idle:handle-lid-switch' : 'sleep:idle';
  own.proc = spawn('systemd-inhibit', [`--what=${what}`, '--who=OpenGhost', '--why=Routines are on', '--mode=block', 'sh', '-c', watch], { cwd: app.getPath('userData'), detached: true, stdio: 'ignore' });
 } else if (process.platform === 'darwin' && config.lid) {
  // Started by the administrator, the watcher goes on by itself once the password is given; macOS is the one asking.
  hasLid().then(lid => {
   if (!lid || helper !== own || own.stopping) return;
   const shell = `pmset -a disablesleep 1; (while kill -0 ${process.pid} 2>/dev/null && [ -e ${sh(flag)} ]; do sleep 5; done; pmset -a disablesleep 0) > /dev/null 2>&1 &`;
   const proc = spawn('osascript', ['-e', `do shell script "${shell.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with administrator privileges`], { stdio: 'ignore' });
   // Asked and refused: the lid is left to the system until the switch is pressed again or the app starts anew.
   proc.on('exit', code => { if (code && helper === own) { config.lid = false; own.stopping = true; ended(); } });
   proc.on('error', () => {});
  });
  return;
 } else return;
 own.proc.on('error', () => { if (helper === own) helper = null; });
 own.proc.on('exit', ended);
 own.proc.unref();
}

function stopHelper() {
 // The helper puts things back once its flag is gone, and ends; on macOS the watcher does, by itself.
 helper.stopping = true;
 fs.rmSync(helper.flag, { force: true });
 if (!helper.proc || process.platform === 'darwin') helper = null;
}

function apply() {
 const want = held && config.on;
 if (want && blocker < 0) blocker = powerSaveBlocker.start('prevent-app-suspension');
 if (!want && blocker >= 0) { powerSaveBlocker.stop(blocker); blocker = -1; }
 // One on its way out is waited for: it puts back what it changed before the next one reads how things stand. So is
 // what one cut short left behind.
 if (want && !helper && !restoring && !broken) {
  try { startHelper(); } catch { helper = null; }
 } else if (!want && helper && !helper.stopping) stopHelper();
}

module.exports = {
 setup(options = {}) {
  dry = options.dry || '';
  config = read();
  // Flags left by an app that ended without putting them away: its helpers see the app gone and put things back.
  try { for (const name of fs.readdirSync(app.getPath('userData'))) if (FLAGS.test(name)) fs.rmSync(file(name), { force: true }); } catch {}
  restoring = true;
  restoreLeft().catch(() => {}).then(() => { restoring = false; apply(); });
  app.on('will-quit', () => { held = false; apply(); });
 },
 // Routines are on (or none is): the computer is kept awake for them, or let sleep again.
 hold(on) {
  if (held === !!on) return;
  held = !!on;
  if (!held) broken = false;
  apply();
 },
 get state() { return { ...config, held, platform: process.platform }; },
 set(next) {
  const was = { ...config };
  config = { on: next.on !== false, lid: !!next.lid };
  fs.promises.writeFile(file('awake.json'), JSON.stringify(config)).catch(() => {});
  // A change of the lid's part starts the helper anew with it, once the one at work has put things back.
  if (was.lid !== config.lid) broken = false;
  if (was.lid !== config.lid && helper && !helper.stopping) stopHelper();
  apply();
  return this.state;
 },
};
