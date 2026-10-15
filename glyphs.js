(() => {
'use strict';

const svg = (body, className = '') => `<svg class="glyph${className ? ` ${className}` : ''}" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// Drawn on a 24 grid in lighter lines, the way the system draws its own symbols.
const thin = (body, className = '') => `<svg class="glyph${className ? ` ${className}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const FOLDER_BACK = 'M38 70V46a4 4 0 0 1 4-4h10a4 4 0 0 1 3.2 1.6L58 47h20a4 4 0 0 1 4 4v2';
const GHOST = 'M0 29A29 29 0 0 1 58 29L58 57A2.5 2.5 0 0 1 53 57A6 6 0 0 0 41 57A3 3 0 0 1 35 57A6 6 0 0 0 23 57A3 3 0 0 1 17 57A6 6 0 0 0 5 57A2.5 2.5 0 0 1 0 57Z';

// A number in a small disc (the notes' and the routines' buttons) stands in the disc's middle by its ink, not by the box
// its figures are set in: a figure such as 1 sits to one side of its own box. The number is drawn once, ten times as
// large, and its ink found pixel by pixel (the browser's own measure of ink is in whole pixels, too coarse at this size);
// the figures are then moved over by what the ink is off, with text-indent (half of it moves the centred line).
const INK_SCALE = 10;
const inkShifts = new Map();
let inkCanvas = null;
function inkShift(style, text) {
 const size = parseFloat(style.fontSize) * INK_SCALE, font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
 const canvas = inkCanvas ||= document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
 ctx.font = font;
 const advance = ctx.measureText(text).width, pad = Math.ceil(size * 0.5);
 canvas.width = Math.ceil(advance) + 2 * pad;
 canvas.height = Math.ceil(size * 1.6);
 ctx.font = font;
 ctx.fillStyle = '#000';
 ctx.textBaseline = 'middle';
 ctx.fillText(text, pad, canvas.height / 2);
 const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
 let left = width, right = -1;
 for (let x = 0; x < width; x++) {
  for (let y = 0; y < height; y++) {
   if (data[(y * width + x) * 4 + 3] < 128) continue;
   left = Math.min(left, x);
   right = Math.max(right, x);
   break;
  }
 }
 if (right < 0) return 0;
 return (pad + advance / 2 - (left + right + 1) / 2) / INK_SCALE;
}

function centerFigures(el, text = el.textContent) {
 if (!text) { el.style.textIndent = ''; return; }
 const style = getComputedStyle(el), key = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}|${text}`;
 if (!inkShifts.has(key)) inkShifts.set(key, inkShift(style, text));
 const shift = inkShifts.get(key);
 el.style.textIndent = Math.abs(shift) < 0.05 ? '' : `${(2 * shift).toFixed(2)}px`;
}

window.Figures = { center: centerFigures };

window.Glyphs = {
 folder: svg(`<path d="${FOLDER_BACK}"/><path class="folder-front" d="M38 53L82 53L82 72A4 4 0 0 1 78 76L42 76A4 4 0 0 1 38 72Z"/>`, 'glyph-folder'),
 folderAdd: svg('<path d="M66 76H42a4 4 0 0 1-4-4V46a4 4 0 0 1 4-4h10a4 4 0 0 1 3.2 1.6L58 47h20a4 4 0 0 1 4 4v8M38 53h44"/><path d="M78 65v14M71 72h14"/>', 'glyph-folder-add'),
 pin: svg('<path d="M52 39h16M55.5 39v12.5L49 59h22l-6.5-7.5V39M60 59v20"/>', 'glyph-pin'),
 // A pencil with a stroke of its own under the tip, so it can write a line when reached for.
 pencil: svg('<g class="pencil-body"><path d="M44 76l2.6-10.4 21.9-21.9a5.1 5.1 0 0 1 7.2 0l.6.6a5.1 5.1 0 0 1 0 7.2L54.4 73.4z"/><path d="M64.5 47.7l7.8 7.8"/></g><path class="pencil-line" d="M60 80h18"/>', 'glyph-pencil'),
 trash: svg('<path class="trash-lid" d="M40 45h40M53.5 45v-4.5a3.5 3.5 0 0 1 3.5-3.5h6a3.5 3.5 0 0 1 3.5 3.5V45"/><path d="M45 45l2.3 28.4a4 4 0 0 0 4 3.6h17.4a4 4 0 0 0 4-3.6L75 45M55.5 55v12M64.5 55v12"/>', 'glyph-trash'),
 plus: svg('<path d="M60 43v34M43 60h34"/>'),
 lock: svg('<rect x="43" y="55" width="34" height="25" rx="6"/><path d="M49 55v-6.5a11 11 0 0 1 22 0V55M60 64.5v6"/>'),
 // The same padlock with a shackle of its own, so it can swing open and snap shut.
 padlock: svg('<path class="lock-shackle" d="M49 55v-6.5a11 11 0 0 1 22 0V55"/><rect x="43" y="55" width="34" height="25" rx="6"/><path d="M60 64.5v6"/>', 'glyph-padlock'),
 shield: svg('<path d="M60 37.5 77 44v13c0 11-7 19.5-17 23-10-3.5-17-12-17-23V44z"/><path d="m52.5 59 5 5 10-10.5"/>'),
 shieldAlert: svg('<path d="M60 37.5 77 44v13c0 11-7 19.5-17 23-10-3.5-17-12-17-23V44z"/><path d="M60 50v11M60 69v.5"/>'),
 quote: '<svg class="glyph glyph-quote" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.2 6.3C6.6 7.6 4.4 10.4 4.4 14.1c0 2.4 1.5 4 3.5 4 1.8 0 3.2-1.3 3.2-3.1 0-1.7-1.2-2.9-2.8-2.9-.3 0-.6 0-.8.1.4-1.7 1.8-3.1 3.6-3.9zm9 0c-3.6 1.3-5.8 4.1-5.8 7.8 0 2.4 1.5 4 3.5 4 1.8 0 3.2-1.3 3.2-3.1 0-1.7-1.2-2.9-2.8-2.9-.3 0-.6 0-.8.1.4-1.7 1.8-3.1 3.6-3.9z"/></svg>',
 // A speech bubble with three dots of its own that show while what it stands for is folded away.
 bubble: svg('<path d="M60 38c-13 0-23 8.6-23 19.5 0 5.4 2.5 10.3 6.6 13.8L42 81l10.8-5.2c2.3.5 4.7.8 7.2.8 13 0 23-8.6 23-19.5S73 38 60 38z"/><path class="bubble-dot" d="M50.5 57.5h0"/><path class="bubble-dot" d="M60 57.5h0"/><path class="bubble-dot" d="M69.5 57.5h0"/>', 'glyph-bubble'),
 check: svg('<path d="m45 61 10 10 20-22"/>'),
 // Two pictures, one over the other. Reached for, the sun rises over the front one and the one behind it slides out a little.
 photo: thin('<path class="photo-back" d="M7.2 4.2h10.6a3 3 0 0 1 3 3v8.4"/><rect x="3.2" y="7.4" width="14.6" height="12.4" rx="2.8"/><circle class="photo-sun" cx="8" cy="11.8" r="1.4"/><path d="M3.5 18.4l4.3-4.3a1.4 1.4 0 0 1 2 0l5.6 5.6"/>', 'glyph-photo'),
 // A paper clip, one wire bent round twice. Reached for, it tips over.
 clip: thin('<g class="clip-wire"><path d="M10 8v8a2 2 0 0 0 4 0V5a3 3 0 0 0-6 0v13a4 4 0 0 0 8 0V8" transform="rotate(45 12 12)"/></g>', 'glyph-clip'),
 // A line pressed from above and below: a chat pressed into its summary. Reached for, the chevrons press closer.
 compact: thin('<path d="M5.5 12h13"/><path class="compact-a" d="M9 4.2l3 3 3-3"/><path class="compact-b" d="M9 19.8l3-3 3 3"/>', 'glyph-compact'),
 // Three bars like the stats card's own, rounded at both ends. Reached for, they trade heights.
 bars: '<svg class="glyph glyph-bars" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect class="bar-a" x="4.4" y="12" width="3.4" height="8" rx="1.7"/><rect class="bar-b" x="10.3" y="4.5" width="3.4" height="15.5" rx="1.7"/><rect class="bar-c" x="16.2" y="8.8" width="3.4" height="11.2" rx="1.7"/></svg>',
 // A sheet with a pencil over its corner: the user's notes, as on their button, in slightly lighter lines. Each stroke is
 // one unit long, so it can be drawn in; the pencil has a group of its own and turns about its tip when it writes.
 notes: '<svg class="glyph glyph-notes" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M58 42H47a9 9 0 0 0-9 9v22a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9V62"/><g class="notes-pen"><path pathLength="1" d="M53 67l2.6-10.4 21.9-21.9a5.1 5.1 0 0 1 7.2 0l.6.6a5.1 5.1 0 0 1 0 7.2L63.4 64.4z"/><path pathLength="1" d="M73.5 38.7l7.8 7.8"/></g></svg>',
 terminal: svg('<rect x="36" y="40" width="48" height="40" rx="8"/><path d="m47 53 7 7-7 7M61 67h11"/>'),
 copy: svg('<rect x="49" y="47" width="32" height="36" rx="6"/><path d="M71 47v-5a5 5 0 0 0-5-5H44a5 5 0 0 0-5 5v26a5 5 0 0 0 5 5h5"/>'),
 file: svg('<path d="M49 36h14l13 13v31a4 4 0 0 1-4 4H49a4 4 0 0 1-4-4V40a4 4 0 0 1 4-4z"/><path d="M62 36v14h14"/>'),
 globe: svg('<circle cx="60" cy="60" r="22"/><path d="M38.5 60h43M60 38c-6.5 6-10 13.5-10 22s3.5 16 10 22c6.5-6 10-13.5 10-22s-3.5-16-10-22z"/>'),
 // An eye for what a field hides; its slash draws across while the field shows it.
 eye: svg('<path d="M35 60c6-9.5 14.5-15 25-15s19 5.5 25 15c-6 9.5-14.5 15-25 15s-19-5.5-25-15z"/><circle cx="60" cy="60" r="6"/><path class="eye-slash" d="M42 42l36 36"/>', 'glyph-eye'),
 // A clock whose rim comes round to its own start with an arrow: a routine, which comes back on time. The rim is one
 // unit long, so it can be drawn in, and the minute hand is a path of its own, to go round the clock's middle (Routines.turn).
 routine: svg('<path class="routine-rim" pathLength="1" d="M41.5 48.5A22 22 0 1 1 38.7 65.7"/><path class="routine-arrow" d="M39.5 37.5v11.5h11.5"/><g class="routine-hands"><path class="routine-minute" d="M60 48.5V60"/><path class="routine-hour" d="M60 60l8 5.5"/></g>', 'glyph-routine'),
 // A chat started in the quick window wears a bolt in the list.
 bolt: svg('<path d="M64 36 44 64h15l-3 20 20-28H61z"/>'),
 ghost: `<svg class="glyph glyph-ghost" viewBox="-1 -1 60 62" aria-hidden="true"><path d="${GHOST}" fill="currentColor"/><ellipse cx="17" cy="29.5" rx="3.8" ry="4.1" class="glyph-ghost-eye"/><ellipse cx="41" cy="29.5" rx="3.8" ry="4.1" class="glyph-ghost-eye"/></svg>`,
};
})();
