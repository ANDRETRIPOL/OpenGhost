(() => {
'use strict';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
if (window.openghost?.desktop) root.classList.add('is-desktop');
if (window.openghost?.platform === 'darwin') root.classList.add('is-mac');
if (window.openghost?.platform === 'linux') root.classList.add('is-linux');
// The quick chat's window shows of this page the quick chat alone, and comes up at once: it has no opening. The window
// tells how much clear room it keeps round the chat's card, for the card's shadow.
if (window.openghost?.quick) {
 root.classList.add('is-quick');
 const [top = 0, side = 0, bottom = 0] = window.openghost.quickRoom || [];
 for (const [name, value] of [['top', top], ['side', side], ['bottom', bottom]]) root.style.setProperty(`--quick-${name}`, `${value}px`);
}
// A page read anew for a new language comes up at once, with no opening.
let reopened = false;
try { reopened = !!sessionStorage.getItem('openghost.reopen'); } catch {}
if (!reopened && !window.openghost?.quick && (root.classList.contains('is-desktop') || params.has('splash')) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('is-splash');
})();
