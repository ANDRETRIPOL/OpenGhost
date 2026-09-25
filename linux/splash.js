(() => {
'use strict';

const APP_BAR = '#161616';
const FLY = { delay: 160, duration: 980, x: 'cubic-bezier(0.2, 0.75, 0.3, 1)', y: 'cubic-bezier(0.55, 0, 0.25, 1)', turn: 'cubic-bezier(0.33, 0, 0.3, 1)' };
const SHIFT = { duration: 640, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const WORD = { gap: 22, delay: 90, stagger: 34, duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const HOLD = 520;
const OPEN = { duration: 760, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const GAZE = { fly: [3.2, -2.2], word: [4, 0.4], land: [0, 1.4] };

const root = document.documentElement;
const splash = document.querySelector('.splash');
const bar = color => window.openghost?.setTitleBar?.(color);

function finish() {
 root.classList.remove('is-splash');
 splash?.remove();
 bar(APP_BAR);
}

if (!splash || !root.classList.contains('is-splash')) {
 finish();
 return;
}

let skip = null;
const skipped = new Promise(resolve => { skip = resolve; });
const wait = ms => Promise.race([new Promise(resolve => setTimeout(resolve, ms)), skipped]);
const settle = () => { for (const animation of splash.getAnimations({ subtree: true })) animation.finish(); };

async function play() {
 const fly = splash.querySelector('.splash-fly'), box = splash.querySelector('.splash-ghost'), body = splash.querySelector('.splash-ghost-body');
 const word = splash.querySelector('.splash-word'), ghost = splash.querySelector('ghost-thinking');
 await customElements.whenDefined('ghost-thinking');
 const letters = [...word.textContent].map(char => {
  const letter = document.createElement('span');
  letter.textContent = char;
  return letter;
 });
 word.replaceChildren(...letters);

 const size = fly.offsetWidth, from = { x: -(innerWidth / 2 + size), y: innerHeight / 2 + size };
 const timing = { delay: FLY.delay, duration: FLY.duration, fill: 'both' };
 ghost.look(...GAZE.fly, FLY.delay + FLY.duration);
 const arrive = box.animate({ translate: [`${from.x}px 0`, '0 0'] }, { ...timing, easing: FLY.x });
 body.animate({ translate: [`0 ${from.y}px`, '0 0'] }, { ...timing, easing: FLY.y });
 body.animate([{ scale: 0.26, rotate: '-30deg' }, { scale: 1.05, rotate: '5deg', offset: 0.8 }, { scale: 1, rotate: '0deg' }], { ...timing, easing: FLY.turn });
 await Promise.race([arrive.finished, skipped]);

 const shift = (WORD.gap + word.offsetWidth) / 2;
 word.style.left = `calc(50% - ${shift}px + ${size / 2 + WORD.gap}px)`;
 ghost.look(...GAZE.word, 2000);
 box.animate({ translate: ['0 0', `${-shift}px 0`] }, { ...SHIFT, fill: 'forwards' });
 letters.forEach((letter, k) => letter.animate(
  [{ opacity: 0, transform: 'translateX(-12px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
  { duration: WORD.duration, delay: WORD.delay + k * WORD.stagger, easing: WORD.easing, fill: 'both' },
 ));
 await wait(WORD.delay + letters.length * WORD.stagger + WORD.duration + HOLD);
 settle();
 await open(fly, word, ghost);
 finish();
}

function open(fly, word, ghost) {
 splash.classList.add('is-opening');
 const welcome = document.querySelector('.main.is-empty .welcome'), mark = welcome?.querySelector('ghost-thinking');
 for (const animation of welcome?.getAnimations() || []) animation.finish();
 const target = welcome && getComputedStyle(welcome).display !== 'none' ? welcome.querySelector('.welcome-flight').getBoundingClientRect() : null;
 const now = fly.getBoundingClientRect(), current = splash.querySelector('.splash-ghost-body').getBoundingClientRect();
 const app = document.querySelector('.app');
 word.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
 splash.querySelector('.splash-bg').animate([{ opacity: 1 }, { opacity: 0 }], { duration: OPEN.duration, delay: 80, easing: 'ease', fill: 'forwards' });
 app.animate([{ opacity: 0, transform: 'scale(0.975)' }, { opacity: 1, transform: 'none' }], OPEN);
 setTimeout(() => bar(APP_BAR), OPEN.duration / 2);
 if (!target) return fly.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.8)' }], { ...OPEN, fill: 'forwards' }).finished;
 const s = target.width / current.width, origin = { x: now.left + now.width / 2, y: now.top + now.height / 2 };
 const center = { x: current.left + current.width / 2, y: current.top + current.height / 2 };
 const dx = target.left + target.width / 2 - origin.x - s * (center.x - origin.x), dy = target.top + target.height / 2 - origin.y - s * (center.y - origin.y);
 ghost.look(...GAZE.land, OPEN.duration + 400);
 if (mark) {
  mark.start = ghost.start;
  mark.look?.(...GAZE.land, OPEN.duration + 1200);
 }
 return fly.animate({ translate: ['0 0', `${dx}px ${dy}px`], scale: [1, s] }, { ...OPEN, fill: 'forwards' }).finished;
}

splash.addEventListener('pointerdown', () => skip());
window.addEventListener('keydown', () => skip(), { once: true });
play().catch(finish);
})();
