(() => {
'use strict';

// In a window of glass (Windows 11) the page is clear where the sidebar is: the desktop shows there through the
// window's own frost. A pane of glass standing over it blurs only what the page draws, and over a clear page it
// blurred nothing: the sidebar's words showed through it sharp and the desktop with them, while the part of it over
// the chat was frosted. While such a pane is out, the page has a ground of its own under it, beneath all it draws, and
// the pane is frosted alike all over. The ground keeps to the pane as it comes, goes and changes its size.
const FOLLOW = 700;

class GlassGround {
 constructor() {
  this.held = new Map();
  window.addEventListener('resize', () => { for (const entry of this.held.values()) this.follow(entry); });
 }

 // Gives back what puts the ground away again, as the pane goes.
 hold(pane) {
  const app = document.querySelector('.app');
  if (!app || !document.documentElement.classList.contains('is-glass')) return () => {};
  let entry = this.held.get(pane);
  if (!entry) {
   const ground = document.createElement('div');
   ground.className = 'glass-ground';
   app.prepend(ground);
   entry = { pane, ground, open: true, until: 0, frame: 0 };
   entry.sized = new ResizeObserver(() => this.follow(entry));
   entry.sized.observe(pane);
   this.held.set(pane, entry);
  }
  entry.open = true;
  this.follow(entry);
  return () => { entry.open = false; this.follow(entry); };
 }

 follow(entry) {
  entry.until = performance.now() + FOLLOW;
  if (entry.frame) return;
  const tick = () => {
   entry.frame = 0;
   const shown = this.place(entry);
   if (!entry.open && !shown) { this.drop(entry); return; }
   if (performance.now() < entry.until || (!entry.open && shown)) entry.frame = requestAnimationFrame(tick);
  };
  entry.frame = requestAnimationFrame(tick);
 }

 // Where the pane is drawn now, as large as it is drawn, as round, as blurred and as far faded in: whether any of it
 // is seen.
 place({ pane, ground }) {
  const rect = pane.getBoundingClientRect(), style = getComputedStyle(pane);
  const opacity = pane.isConnected && pane.getClientRects().length ? Number(style.opacity) : 0;
  const scale = pane.offsetWidth ? rect.width / pane.offsetWidth : 1;
  Object.assign(ground.style, {
   left: `${rect.left}px`,
   top: `${rect.top}px`,
   width: `${rect.width}px`,
   height: `${rect.height}px`,
   borderRadius: `${(parseFloat(style.borderTopLeftRadius) || 0) * scale}px`,
   opacity: String(opacity),
   filter: style.filter,
  });
  return opacity > 0.001;
 }

 drop(entry) {
  cancelAnimationFrame(entry.frame);
  entry.sized.disconnect();
  entry.ground.remove();
  this.held.delete(entry.pane);
 }
}

window.GlassGround = new GlassGround();
})();
