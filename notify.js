(() => {
'use strict';

// A finished reply that came while the user was not looking at it, or a question or a step the agent waits for them to
// answer or allow, is told to the main process (desktop/notify.js),
// which shows the system's notification and counts it on the app's icon; the sound is played here. What the user
// looks at is told by whoever shows chats (Notify.watch): the chat on screen, the mini chat open over it, the quick
// chat's window. A reply counts as looked at only while the window is shown and has the focus.
const SOUND = 'sounds/reply.mp3';
const VOLUME = 0.7;
const api = window.openghost?.notify;
const watchers = new Set();
let audio = null;

// The words of a reply, without what only the chat can show: drawings, code, marks of formatting.
function plain(text) {
 return String(text || '')
  .replace(/```[\s\S]*?(```|$)/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
  .replace(/(\*\*|__|\*|_|`|~~)/g, '')
  .replace(/\s+/g, ' ')
  .trim();
}

const Notify = {
 // `looking()` gives the keys of the chats on screen of one who shows chats.
 watch(looking) {
  watchers.add(looking);
 },

 looking() {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return [];
  return [...watchers].flatMap(looking => { try { return looking() || []; } catch { return []; } }).filter(Boolean);
 },

 // What is on screen now has been seen.
 look() {
  const keys = Notify.looking();
  if (keys.length) api?.seen(keys);
 },

 async replied(key, title, text) {
  if (!api || Notify.looking().includes(key)) return;
  const answer = await api.reply(key, title, plain(text)).catch(() => null);
  if (answer?.sound) Notify.play();
 },

 play() {
  try {
   audio ||= new Audio(SOUND);
   audio.volume = VOLUME;
   audio.currentTime = 0;
   audio.play().catch(() => {});
  } catch {}
 },

 // The mark laid over the app's icon in the Windows taskbar: the count, white on red, in a round mark.
 mark(count) {
  const size = 32, canvas = Object.assign(document.createElement('canvas'), { width: size, height: size }), g = canvas.getContext('2d');
  g.fillStyle = '#e5484d';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  const words = count > 9 ? '9+' : String(count);
  g.fillStyle = '#fff';
  g.font = `700 ${words.length > 1 ? 17 : 21}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(words, size / 2, size / 2 + 1);
  return canvas.toDataURL('image/png');
 },
};

window.addEventListener('focus', () => Notify.look());
document.addEventListener('visibilitychange', () => Notify.look());

window.Notify = Notify;
})();
