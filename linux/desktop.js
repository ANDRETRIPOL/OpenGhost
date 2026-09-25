(() => {
'use strict';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
if (window.openghost?.desktop) root.classList.add('is-desktop');
if (window.openghost?.platform === 'linux') root.classList.add('is-linux');
if ((root.classList.contains('is-desktop') || params.has('splash')) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('is-splash');
})();
