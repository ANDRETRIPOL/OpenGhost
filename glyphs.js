(() => {
'use strict';

const svg = (body, className = '') => `<svg class="glyph${className ? ` ${className}` : ''}" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const FOLDER_BACK = 'M38 70V46a4 4 0 0 1 4-4h10a4 4 0 0 1 3.2 1.6L58 47h20a4 4 0 0 1 4 4v2';
const GHOST = 'M0 29A29 29 0 0 1 58 29L58 57A2.5 2.5 0 0 1 53 57A6 6 0 0 0 41 57A3 3 0 0 1 35 57A6 6 0 0 0 23 57A3 3 0 0 1 17 57A6 6 0 0 0 5 57A2.5 2.5 0 0 1 0 57Z';

window.Glyphs = {
 folder: svg(`<path d="${FOLDER_BACK}"/><path class="folder-front" d="M38 53L82 53L82 72A4 4 0 0 1 78 76L42 76A4 4 0 0 1 38 72Z"/>`, 'glyph-folder'),
 folderAdd: svg('<path d="M66 76H42a4 4 0 0 1-4-4V46a4 4 0 0 1 4-4h10a4 4 0 0 1 3.2 1.6L58 47h20a4 4 0 0 1 4 4v8M38 53h44"/><path d="M78 65v14M71 72h14"/>'),
 pin: svg('<path d="M52 39h16M55.5 39v12.5L49 59h22l-6.5-7.5V39M60 59v20"/>', 'glyph-pin'),
 trash: svg('<path class="trash-lid" d="M40 45h40M53.5 45v-4.5a3.5 3.5 0 0 1 3.5-3.5h6a3.5 3.5 0 0 1 3.5 3.5V45"/><path d="M45 45l2.3 28.4a4 4 0 0 0 4 3.6h17.4a4 4 0 0 0 4-3.6L75 45M55.5 55v12M64.5 55v12"/>', 'glyph-trash'),
 plus: svg('<path d="M60 43v34M43 60h34"/>'),
 lock: svg('<rect x="43" y="55" width="34" height="25" rx="6"/><path d="M49 55v-6.5a11 11 0 0 1 22 0V55M60 64.5v6"/>'),
 shield: svg('<path d="M60 37.5 77 44v13c0 11-7 19.5-17 23-10-3.5-17-12-17-23V44z"/><path d="m52.5 59 5 5 10-10.5"/>'),
 shieldAlert: svg('<path d="M60 37.5 77 44v13c0 11-7 19.5-17 23-10-3.5-17-12-17-23V44z"/><path d="M60 50v11M60 69v.5"/>'),
 quote: '<svg class="glyph glyph-quote" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.2 6.3C6.6 7.6 4.4 10.4 4.4 14.1c0 2.4 1.5 4 3.5 4 1.8 0 3.2-1.3 3.2-3.1 0-1.7-1.2-2.9-2.8-2.9-.3 0-.6 0-.8.1.4-1.7 1.8-3.1 3.6-3.9zm9 0c-3.6 1.3-5.8 4.1-5.8 7.8 0 2.4 1.5 4 3.5 4 1.8 0 3.2-1.3 3.2-3.1 0-1.7-1.2-2.9-2.8-2.9-.3 0-.6 0-.8.1.4-1.7 1.8-3.1 3.6-3.9z"/></svg>',
 bubble: svg('<path d="M60 38c-13 0-23 8.6-23 19.5 0 5.4 2.5 10.3 6.6 13.8L42 81l10.8-5.2c2.3.5 4.7.8 7.2.8 13 0 23-8.6 23-19.5S73 38 60 38z"/>'),
 check: svg('<path d="m45 61 10 10 20-22"/>'),
 terminal: svg('<rect x="36" y="40" width="48" height="40" rx="8"/><path d="m47 53 7 7-7 7M61 67h11"/>'),
 file: svg('<path d="M49 36h14l13 13v31a4 4 0 0 1-4 4H49a4 4 0 0 1-4-4V40a4 4 0 0 1 4-4z"/><path d="M62 36v14h14"/>'),
 globe: svg('<circle cx="60" cy="60" r="22"/><path d="M38.5 60h43M60 38c-6.5 6-10 13.5-10 22s3.5 16 10 22c6.5-6 10-13.5 10-22s-3.5-16-10-22z"/>'),
 ghost: `<svg class="glyph glyph-ghost" viewBox="-1 -1 60 62" aria-hidden="true"><path d="${GHOST}" fill="currentColor"/><ellipse cx="17" cy="29.5" rx="3.8" ry="4.1" class="glyph-ghost-eye"/><ellipse cx="41" cy="29.5" rx="3.8" ry="4.1" class="glyph-ghost-eye"/></svg>`,
};
})();
