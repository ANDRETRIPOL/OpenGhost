(() => {
'use strict';

// The theme picked in Settings → Appearance: light, dark, or the one the computer uses.
// It lands on <html> before the first paint, so the app never flashes the other theme while it loads.
const CHOICES = ['system', 'light', 'dark'];
const DEFAULT = 'dark';
const KEY = 'openghost.theme';
const REVEAL = { duration: 760, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', feather: 0.16 };
const FADE = 420;

const root = document.documentElement;
const bridge = window.openghost;
const system = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// The transition on screen; one started on top of it cuts it short.
let running = null;

function saved() {
 let value = null;
 try { value = localStorage.getItem(KEY); } catch {}
 return CHOICES.includes(value) ? value : DEFAULT;
}

let choice = saved();
// Whether the computer is dark. The desktop app answers this when the choice changes, since its own answer arrives
// here a moment later; the media query keeps it current after that.
let systemDark = system.matches;
const resolve = () => choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

function paint() {
 const theme = resolve();
 root.dataset.theme = theme;
 for (const listener of listeners) listener(theme);
}

function hex(color) {
 const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
 return m ? `#${m.slice(1, 4).map(n => (+n).toString(16).padStart(2, '0')).join('')}` : '';
}

// The window's own title bar buttons (Windows) sit on the app background and take the theme's symbol color.
function titleBar() {
 const style = getComputedStyle(root);
 const color = hex(style.getPropertyValue('--app-bg')), symbols = hex(style.getPropertyValue('--titlebar-symbols'));
 if (color) bridge?.setTitleBar?.(color, symbols);
}

function apply(origin) {
 if (root.dataset.theme === resolve()) return;
 if (reducedMotion() || !document.startViewTransition) {
  paint();
  titleBar();
  return;
 }
 // Picked by hand, the new theme spreads from the pointer like ink; changed by the system, it simply fades in.
 // A quick second pick cuts the first transition short and takes its place, with its own look.
 root.classList.remove('is-theme-reveal', 'is-theme-fade');
 root.classList.add(origin ? 'is-theme-reveal' : 'is-theme-fade');
 const transition = running = document.startViewTransition(paint);
 transition.ready.then(() => {
  if (!origin) return;
  const { x, y } = origin;
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) / (1 - REVEAL.feather);
  const at = size => `${x - size / 2}px ${y - size / 2}px`;
  root.animate({
   maskSize: ['0px 0px', `${reach * 2}px ${reach * 2}px`],
   maskPosition: [at(0), at(reach * 2)],
  }, { duration: REVEAL.duration, easing: REVEAL.easing, pseudoElement: '::view-transition-new(root)', fill: 'both' });
 }).catch(() => {});
 transition.finished.finally(() => {
  // The first transition, cut short, finishes too; only the last one clears the classes it shares.
  if (running !== transition) return;
  running = null;
  root.classList.remove('is-theme-reveal', 'is-theme-fade');
  titleBar();
 });
}

paint();

system.addEventListener('change', event => {
 systemDark = event.matches;
 if (choice === 'system') apply(null);
});

// The desktop app keeps the choice too: it paints the window in the right color before the page loads,
// and tells the web pages in the built-in browser which theme to use.
bridge?.setTheme?.(choice)?.then?.(dark => {
 if (choice !== 'system' || typeof dark !== 'boolean' || dark === systemDark) return;
 systemDark = dark;
 apply(null);
}).catch?.(() => {});

window.Theme = {
 CHOICES,
 FADE,
 get choice() { return choice; },
 get current() { return resolve(); },
 // While a theme spreads, the picture of the transition covers the window and every click lands on <html>.
 get moving() { return !!running; },
 async set(next, origin = null) {
  if (!CHOICES.includes(next) || next === choice) return;
  choice = next;
  try { localStorage.setItem(KEY, next); } catch {}
  const dark = await bridge?.setTheme?.(next)?.catch?.(() => null);
  if (next === 'system') systemDark = typeof dark === 'boolean' ? dark : system.matches;
  apply(origin);
 },
 onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
 },
 titleBar,
};
})();
