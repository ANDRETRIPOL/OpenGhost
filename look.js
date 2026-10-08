(() => {
'use strict';

// The colours picked in Settings → Appearance: the colour of the user's own messages and the chat's ground. Each theme
// keeps its own pick, and until something is picked a theme looks as it always did. Like the theme, the pick lands on
// <html> before the first paint, and every window of the app takes it as soon as another one changes it.
const KEY = 'openghost.look';
const STOCK = 'stock';
// A message's colour and the colour of the words on it. The same ones are offered on both themes.
const BUBBLES = [
 { id: STOCK },
 { id: 'graphite', bg: [44, 44, 46], fg: [236, 236, 236] },
 { id: 'slate', bg: [38, 46, 58], fg: [228, 234, 242] },
 { id: 'midnight', bg: [24, 40, 66], fg: [226, 233, 243] },
 { id: 'ocean', bg: [23, 62, 118], fg: [231, 237, 245] },
 { id: 'indigo', bg: [40, 38, 74], fg: [232, 230, 246] },
 { id: 'teal', bg: [18, 56, 60], fg: [224, 240, 238] },
 { id: 'forest', bg: [28, 54, 42], fg: [226, 240, 232] },
 { id: 'plum', bg: [58, 34, 60], fg: [242, 230, 242] },
 { id: 'bronze', bg: [62, 46, 34], fg: [244, 236, 226] },
 { id: 'rose', bg: [164, 70, 96], fg: [255, 240, 244] },
 { id: 'rosegold', bg: [224, 176, 164], fg: [64, 32, 28] },
 { id: 'blush', bg: [246, 216, 216], fg: [72, 36, 42] },
 { id: 'peach', bg: [248, 216, 192], fg: [72, 42, 24] },
 { id: 'lavender', bg: [216, 208, 246], fg: [44, 36, 86] },
 { id: 'snow', bg: [250, 250, 250], fg: [15, 15, 15] },
 { id: 'ink', bg: [23, 23, 23], fg: [255, 255, 255] },
];
// The chat's ground, for each theme its own: dark ones for the dark, pale ones for the light.
const GROUNDS = {
 dark: [
  { id: STOCK },
  { id: 'black', bg: [10, 10, 10] },
  { id: 'graphite', bg: [33, 33, 35] },
  { id: 'midnight', bg: [16, 21, 31] },
  { id: 'indigo', bg: [21, 20, 35] },
  { id: 'teal', bg: [13, 26, 28] },
  { id: 'forest', bg: [16, 25, 20] },
  { id: 'plum', bg: [27, 18, 28] },
  { id: 'rose', bg: [31, 20, 23] },
  { id: 'espresso', bg: [27, 22, 18] },
 ],
 light: [
  { id: STOCK },
  { id: 'pearl', bg: [245, 245, 247] },
  { id: 'paper', bg: [250, 247, 241] },
  { id: 'sand', bg: [247, 241, 231] },
  { id: 'blush', bg: [253, 243, 243] },
  { id: 'rosegold', bg: [250, 236, 231] },
  { id: 'peach', bg: [254, 242, 232] },
  { id: 'lavender', bg: [246, 243, 253] },
  { id: 'mist', bg: [241, 246, 252] },
  { id: 'mint', bg: [241, 249, 244] },
 ],
};
const PARTS = { bubble: () => BUBBLES, ground: theme => GROUNDS[theme] };
// What follows the ground: on the dark theme the message field, its edge and the fine line inside a card's rim are a
// touch lighter than the chat, by this much.
const LIFT = { composer: 5, border: 9, contour: 7 };
const VEIL = { dark: 0.86, light: 0.84 };
const VARS = ['--user-bubble', '--user-bubble-fg', '--chat-bg', '--drop-veil-bg', '--composer-bg', '--composer-border', '--contour-inner'];

const root = document.documentElement;
const listeners = new Set();
const list = color => color.join(', ');
const lifted = (color, by) => `rgb(${list(color.map(value => Math.min(255, value + by)))})`;

function read() {
 let saved = null;
 try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
 const look = {};
 for (const theme of ['dark', 'light']) {
  look[theme] = {};
  for (const part of Object.keys(PARTS)) {
   const id = saved?.[theme]?.[part];
   look[theme][part] = PARTS[part](theme).some(item => item.id === id) ? id : STOCK;
  }
 }
 return look;
}

let look = read();
const theme = () => root.dataset.theme === 'light' ? 'light' : 'dark';
const picked = (name, part) => PARTS[part](name).find(item => item.id === look[name][part]);

function paint() {
 const name = theme(), bubble = picked(name, 'bubble'), ground = picked(name, 'ground');
 for (const key of VARS) root.style.removeProperty(key);
 if (bubble?.bg) {
  root.style.setProperty('--user-bubble', `rgb(${list(bubble.bg)})`);
  root.style.setProperty('--user-bubble-fg', list(bubble.fg));
 }
 if (!ground?.bg) return;
 root.style.setProperty('--chat-bg', `rgb(${list(ground.bg)})`);
 root.style.setProperty('--drop-veil-bg', `rgba(${list(ground.bg)}, ${VEIL[name]})`);
 if (name !== 'dark') return;
 root.style.setProperty('--composer-bg', lifted(ground.bg, LIFT.composer));
 root.style.setProperty('--composer-border', lifted(ground.bg, LIFT.border));
 root.style.setProperty('--contour-inner', lifted(ground.bg, LIFT.contour));
}

function tell() {
 for (const listener of listeners) listener();
}

paint();
window.Theme?.onChange(() => { paint(); tell(); });
// Another window of the app picked a colour.
window.addEventListener('storage', event => {
 if (event.key !== KEY) return;
 look = read();
 paint();
 tell();
});

window.Look = {
 STOCK,
 get theme() { return theme(); },
 options: (part, name = theme()) => PARTS[part](name),
 get: (part, name = theme()) => look[name][part],
 set(part, id, name = theme()) {
  if (!PARTS[part]?.(name).some(item => item.id === id) || look[name][part] === id) return;
  look[name][part] = id;
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch {}
  paint();
  tell();
 },
 onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
 },
};
})();
