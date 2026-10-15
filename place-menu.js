(() => {
'use strict';

// The menu of a file or a folder in a list the agent has drawn in the chat (diagram.js): a press on the row calls it by
// the pointer, and it offers to open the thing, copy its path or open a terminal there. It is the chat's dots' menu
// (row-menu.js), the same glass, lines and motion; only where it stands differs.
const EDGE = 8;
// A press on the row whose menu is open puts it away; the click that follows must not call it back.
const AGAIN = 350;

class PlaceMenu extends RowMenu {
 constructor() {
  super({
   items: () => {
    const { folder } = this.current;
    return [
     { name: 'open', label: I18n.t(folder ? 'place.folder' : 'place.file'), icon: folder ? Glyphs.folder : Glyphs.file },
     { name: 'copy', label: I18n.t('place.copy'), icon: Glyphs.copy },
     { name: 'terminal', label: I18n.t('place.terminal'), icon: Glyphs.terminal },
    ];
   },
   act: name => this.run(name),
  });
  this.root.classList.add('place-menu');
  this.current = null;
  this.left = { row: null, at: 0 };
  // The chat scrolling away under it puts it away; the chat settling by a pixel or two does not.
  this.scrolled = new Map();
  document.addEventListener('scroll', event => {
   const box = event.target;
   if (!this.id || !box?.contains?.(this.row)) return;
   if (!this.scrolled.has(box)) this.scrolled.set(box, box.scrollTop);
   else if (Math.abs(box.scrollTop - this.scrolled.get(box)) > 6) this.close();
  }, { capture: true, passive: true });
 }

 static show(options) {
  PlaceMenu.one ??= new PlaceMenu();
  PlaceMenu.one.call(options);
 }

 call({ place, row, x, y, folder, gone }) {
  if (this.left.row === row && performance.now() - this.left.at < AGAIN) return;
  this.current = { place, x, y, folder, gone };
  this.scrolled = new Map();
  for (let box = row.parentElement; box; box = box.parentElement) if (box.scrollHeight > box.clientHeight) this.scrolled.set(box, box.scrollTop);
  this.open(place, row, row);
 }

 // By the pointer, below and to the right of it, inside the window.
 place() {
  const root = this.root, { x, y } = this.current;
  const left = Math.round(Math.max(EDGE, Math.min(x + 4, innerWidth - root.offsetWidth - EDGE)));
  const top = Math.round(Math.max(EDGE, y + 6 + root.offsetHeight > innerHeight - EDGE ? y - 6 - root.offsetHeight : y + 6));
  Object.assign(root.style, { left: `${left}px`, top: `${top}px` });
 }

 close(instant = false) {
  if (this.id) this.left = { row: this.row, at: performance.now() };
  super.close(instant);
 }

 run(name) {
  const { place, gone } = this.current, api = window.openghost;
  if (name === 'open') api.openPath(place).then(gone).catch(() => {});
  else if (name === 'copy') api.copyPath(place).catch(() => {});
  else if (name === 'terminal') api.terminalAt(place).then(gone).catch(() => {});
 }
}

window.PlaceMenu = PlaceMenu;
})();
