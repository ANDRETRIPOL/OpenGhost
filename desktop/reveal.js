'use strict';

// A file or a folder named in a list the agent has drawn in the chat, opened by a press on its row. A folder opens in
// the file manager; a document, a picture, a sound or a film opens in the program the system keeps for it. Anything
// else is only shown in its folder, selected: a program, a script, a file of a kind not named here. The names in such
// a list are the agent's, so a press must never run something.
const fs = require('node:fs');
const path = require('node:path');

const READ = new Set([
 'pdf txt md markdown rtf log csv tsv json xml yaml yml toml ini',
 'doc docx odt xls xlsx ods ppt pptx odp epub fb2 djvu',
 'png jpg jpeg gif webp bmp tif tiff heic avif ico svg psd',
 'mp3 wav flac ogg m4a aac opus wma mp4 mkv mov avi webm wmv m4v',
 'zip 7z rar tar gz html htm',
].join(' ').split(' '));

// The agent may write a folder of the user's by its usual name (C:\Users\me\Desktop) where the system keeps it elsewhere
// (in OneDrive, under the name in the system's language). `known`: those folders, { Desktop: where it really is, ... }.
// Where the thing is, with what it is: { full, stat }, or null.
async function locate(target, known = {}) {
 if (typeof target !== 'string' || !path.isAbsolute(target)) return null;
 const full = path.resolve(target), stat = await fs.promises.stat(full).catch(() => null);
 if (stat) return { full, stat };
 const home = require('node:os').homedir();
 for (const [name, real] of Object.entries(known)) {
  const usual = path.join(home, name), low = process.platform === 'linux' ? s => s : s => s.toLowerCase();
  if (!real || low(usual) === low(real) || !(low(full) === low(usual) || low(full).startsWith(low(usual) + path.sep))) continue;
  const moved = path.join(real, full.slice(usual.length)), there = await fs.promises.stat(moved).catch(() => null);
  if (there) return { full: moved, stat: there };
 }
 return null;
}

// 'opened', 'shown' (in its folder) or 'missing'.
async function open(target, shell, platform = process.platform, known = {}) {
 const found = await locate(target, known);
 if (!found) return 'missing';
 const { full, stat } = found;
 const kind = path.extname(full).slice(1).toLowerCase();
 // On macOS a program is a folder with a name like a file's, and opening it would start it.
 const safe = stat.isDirectory() ? !(platform === 'darwin' && kind) : stat.isFile() && READ.has(kind);
 // openPath resolves with what went wrong, and with nothing when the thing is open.
 if (safe && !(await shell.openPath(full))) return 'opened';
 shell.showItemInFolder(full);
 return 'shown';
}

// A terminal opened in a folder of such a list, or for a file of it in the file's folder with the file already written
// on its line, ready to run with Enter or to be put after a program (python, node...). Nothing is run: the user presses
// Enter. On Windows it is PowerShell (in Windows Terminal when there is one); on macOS Terminal, where zsh, the shell
// macOS starts with, has the file on its line and bash has it one Up arrow away; on Linux the first terminal found,
// with the user's own shell, the same way. 'opened' or 'missing'.
async function terminal(target, platform = process.platform, known = {}) {
 const found = await locate(target, known);
 if (!found) return 'missing';
 const { full, stat } = found, file = stat.isDirectory() ? '' : path.basename(full), dir = file ? path.dirname(full) : full;
 const { spawn } = require('node:child_process');
 // Started and let go; `wait` waits for it to end and takes only a clean end for a success.
 const start = (exe, args, { wait = false, env } = {}) => new Promise(resolve => {
  const child = spawn(exe, args, { cwd: dir, detached: !wait, stdio: 'ignore', env: env ? { ...process.env, ...env } : process.env });
  child.once('error', () => resolve(false));
  if (wait) child.once('exit', code => resolve(code === 0));
  else child.once('spawn', () => { child.unref(); resolve(true); });
 });
 const plain = /^[\w.@%+=:,-]+$/.test(file);
 if (platform === 'win32') {
  // PowerShell's editing line takes the text once the prompt is up (PSReadLine).
  const line = plain ? `.\\${file}` : `& '.\\${file.replace(/'/g, "''")}'`;
  const script = file ? `$null = Register-EngineEvent -SourceIdentifier PowerShell.OnIdle -MaxTriggerCount 1 -Action { [Microsoft.PowerShell.PSConsoleReadLine]::Insert('${line.replace(/'/g, "''")}') }` : '';
  const shell = onPath('pwsh.exe') ? 'pwsh.exe' : 'powershell.exe';
  const args = ['-NoLogo', '-NoExit', ...(script ? ['-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] : [])];
  if (onPath('wt.exe') && await start('wt.exe', ['-d', dir, shell, ...args])) return 'opened';
  return await start(shell, args) ? 'opened' : 'missing';
 }
 const quote = text => `'${text.replace(/'/g, `'\\''`)}'`;
 const line = plain ? `./${file}` : quote(`./${file}`);
 if (platform === 'darwin') {
  const command = `cd ${quote(dir)}; clear${file ? `; if [ -n "$ZSH_VERSION" ]; then print -z ${line}; else history -s ${line}; fi` : ''}`;
  const script = `tell application "Terminal"\nactivate\ndo script "${command.replace(/[\\"]/g, c => `\\${c}`)}"\nend tell`;
  if (await start('osascript', ['-e', script], { wait: true })) return 'opened';
  return await start('open', ['-a', 'Terminal', dir]) ? 'opened' : 'missing';
 }
 // Linux: the user's shell, started with a few lines of its own that read the user's settings first.
 const shell = path.basename(process.env.SHELL || 'bash');
 let run = [], env;
 if (file && (shell === 'bash' || shell === 'zsh')) {
  const place = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'openghost-'));
  setTimeout(() => fs.rmSync(place, { recursive: true, force: true }), 60 * 1000).unref?.();
  if (shell === 'bash') {
   fs.writeFileSync(path.join(place, 'rc'), `[ -f ~/.bashrc ] && . ~/.bashrc\ncd ${quote(dir)}\nhistory -s ${line}\n`);
   run = ['bash', '--rcfile', path.join(place, 'rc'), '-i'];
  } else {
   fs.writeFileSync(path.join(place, '.zshrc'), `ZDOTDIR="$HOME"\n[ -f ~/.zshenv ] && . ~/.zshenv\n[ -f ~/.zshrc ] && . ~/.zshrc\ncd ${quote(dir)}\nprint -z ${line}\n`);
   run = ['zsh', '-i'];
   env = { ZDOTDIR: place };
  }
 }
 const tries = [['x-terminal-emulator', run.length ? ['-e', ...run] : []], ['gnome-terminal', [`--working-directory=${dir}`, ...(run.length ? ['--', ...run] : [])]], ['konsole', ['--workdir', dir, ...(run.length ? ['-e', ...run] : [])]], ['xfce4-terminal', [`--working-directory=${dir}`, ...(run.length ? ['-x', ...run] : [])]], ['xterm', run.length ? ['-e', ...run] : []]];
 for (const [exe, args] of tries) if (onPath(exe) && await start(exe, args, { env })) return 'opened';
 return 'missing';
}

// Whether a program is on the PATH. Programs from the Microsoft Store (Windows Terminal, PowerShell 7) are there as links
// that lead nowhere a plain look can follow, so the link itself is looked for.
function onPath(name) {
 return String(process.env.PATH || '').split(path.delimiter).some(dir => {
  try { return !!dir && !!fs.lstatSync(path.join(dir, name)); } catch { return false; }
 });
}

module.exports = { open, terminal, locate };
