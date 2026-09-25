'use strict';

const { ipcRenderer } = require('electron');

// Only the site name leaves the page, and only when a filled password field is being sent.
let told = false;
function check() {
 if (told) return;
 const filled = [...document.querySelectorAll('input[type="password"]')].some(input => input.value.length > 0);
 if (!filled) return;
 told = true;
 ipcRenderer.sendToHost('signin', location.hostname);
}

window.addEventListener('submit', check, true);
window.addEventListener('keydown', event => { if (event.key === 'Enter') check(); }, true);
window.addEventListener('click', event => {
 if (event.target instanceof Element && event.target.closest('button, [role="button"], input[type="submit"]')) check();
}, true);
