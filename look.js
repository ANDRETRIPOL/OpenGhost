(() => {
'use strict';

// The colours picked in Settings → Appearance: the colour of the user's own messages and the chat's ground. Each theme
// keeps its own pick, and until something is picked a theme looks as it always did. Like the theme, the pick lands on
// <html> before the first paint, and every window of the app takes it as soon as another one changes it.
const KEY = 'openghost.look';
const STOCK = 'stock';
// A message's colour and the colour of the words on it. The same ones are offered on both themes: eleven deep ones and
// seven pale ones. All of them are muted to one measure, colours of things rather than of the rainbow (ink, slate,
// pine, plaster), so that any of them sits quietly on any ground; the words on a message are neither white nor black
// but carry a breath of the message's own hue, and read on it at 7 to 1 or better.
const BUBBLES = [
 { id: STOCK },
 { id: 'ink', bg: [33, 30, 28], fg: [247, 238, 233] },
 { id: 'graphite', bg: [69, 72, 75], fg: [234, 241, 248] },
 { id: 'slate', bg: [52, 69, 76], fg: [232, 242, 246] },
 { id: 'navy', bg: [44, 58, 90], fg: [236, 240, 249] },
 { id: 'patina', bg: [58, 84, 84], fg: [231, 243, 243] },
 { id: 'pine', bg: [47, 74, 60], fg: [234, 243, 237] },
 { id: 'moss', bg: [74, 82, 54], fg: [239, 241, 233] },
 { id: 'bordeaux', bg: [102, 46, 51], fg: [248, 237, 237] },
 { id: 'aubergine', bg: [77, 53, 72], fg: [245, 237, 243] },
 { id: 'tobacco', bg: [94, 68, 50], fg: [247, 238, 233] },
 { id: 'terracotta', bg: [116, 66, 52], fg: [248, 238, 235] },
 { id: 'bone', bg: [227, 220, 207], fg: [36, 30, 20] },
 { id: 'sand', bg: [210, 196, 172], fg: [36, 30, 20] },
 { id: 'plaster', bg: [223, 194, 175], fg: [39, 29, 22] },
 { id: 'roseash', bg: [217, 196, 197], fg: [40, 27, 28] },
 { id: 'celadon', bg: [197, 210, 198], fg: [25, 34, 26] },
 { id: 'mist', bg: [188, 202, 210], fg: [22, 33, 39] },
 { id: 'wisteria', bg: [203, 193, 212], fg: [34, 29, 39] },
];
// The chat's ground, for each theme its own: nearly black ones for the dark, nearly white ones for the light, each
// with only a breath of its hue.
const GROUNDS = {
 dark: [
  { id: STOCK },
  { id: 'ink', bg: [26, 24, 22] },
  { id: 'graphite', bg: [31, 31, 33] },
  { id: 'slate', bg: [26, 31, 35] },
  { id: 'navy', bg: [22, 26, 36] },
  { id: 'iron', bg: [23, 29, 27] },
  { id: 'pine', bg: [22, 28, 23] },
  { id: 'aubergine', bg: [30, 24, 29] },
  { id: 'bordeaux', bg: [31, 23, 25] },
  { id: 'espresso', bg: [30, 25, 21] },
 ],
 light: [
  { id: STOCK },
  { id: 'porcelain', bg: [245, 245, 242] },
  { id: 'paper', bg: [250, 247, 241] },
  { id: 'linen', bg: [243, 238, 227] },
  { id: 'stone', bg: [238, 236, 231] },
  { id: 'plaster', bg: [246, 237, 231] },
  { id: 'celadon', bg: [237, 241, 236] },
  { id: 'mist', bg: [236, 240, 241] },
  { id: 'wisteria', bg: [241, 239, 244] },
 ],
};
// A pick made from the colours offered before these goes to the nearest of these.
const MOVED = {
 bubble: { midnight: 'navy', ocean: 'navy', indigo: 'navy', teal: 'patina', forest: 'pine', plum: 'aubergine', bronze: 'tobacco', rose: 'bordeaux', rosegold: 'plaster', blush: 'roseash', peach: 'plaster', lavender: 'wisteria', snow: 'bone' },
 ground: {
  dark: { black: 'ink', midnight: 'navy', indigo: 'navy', teal: 'iron', forest: 'pine', plum: 'aubergine', rose: 'bordeaux' },
  light: { pearl: 'porcelain', sand: 'linen', blush: 'plaster', rosegold: 'plaster', peach: 'plaster', lavender: 'wisteria', mint: 'celadon' },
 },
};
// Which messages go with which ground, the best first: the deep tones of the ground's own family, a quiet pale pair to
// it, and a neutral. Read the other way round it says which grounds go with a message.
const SUITS = {
 dark: {
  ink: ['bone', 'sand', 'tobacco', 'terracotta', 'plaster'],
  graphite: ['bone', 'graphite', 'slate', 'mist'],
  slate: ['mist', 'slate', 'patina', 'bone'],
  navy: ['mist', 'navy', 'wisteria', 'bone'],
  iron: ['celadon', 'patina', 'pine', 'bone'],
  pine: ['celadon', 'pine', 'moss', 'sand'],
  aubergine: ['wisteria', 'aubergine', 'roseash', 'bone'],
  bordeaux: ['roseash', 'bordeaux', 'plaster', 'bone'],
  espresso: ['sand', 'tobacco', 'plaster', 'terracotta'],
 },
 light: {
  porcelain: ['graphite', 'slate', 'navy', 'mist', 'ink', 'bone'],
  paper: ['ink', 'tobacco', 'pine', 'sand', 'bone', 'terracotta'],
  linen: ['tobacco', 'moss', 'terracotta', 'sand', 'bone'],
  stone: ['graphite', 'patina', 'aubergine', 'sand', 'ink'],
  plaster: ['bordeaux', 'terracotta', 'aubergine', 'roseash', 'plaster'],
  celadon: ['pine', 'moss', 'slate', 'celadon', 'patina'],
  mist: ['navy', 'slate', 'patina', 'mist', 'graphite'],
  wisteria: ['aubergine', 'navy', 'graphite', 'wisteria', 'roseash'],
 },
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
   const was = saved?.[theme]?.[part], id = (part === 'ground' ? MOVED.ground[theme] : MOVED[part])[was] || was;
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
 // The colours of `part` that go with what is picked for the other part, the best first; none while that is Default.
 suited(part, name = theme()) {
  const pairs = SUITS[name];
  if (part === 'bubble') return [...(pairs[look[name].ground] || [])];
  return GROUNDS[name].filter(item => pairs[item.id]?.includes(look[name].bubble)).map(item => item.id);
 },
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
