(() => {
'use strict';

class RowGlide {
 constructor(root) {
  this.table = null;
  this.row = null;
  root.addEventListener('pointerover', event => this.over(event));
  root.addEventListener('pointerleave', () => this.hide());
 }

 over(event) {
  const row = event.target.closest('.md-table tbody tr');
  if (row === this.row) return;
  if (!row) { this.hide(); return; }
  const table = row.closest('.md-table');
  if (table !== this.table) { this.hide(); this.table = table; }
  this.row = row;
  this.move(table, row);
 }

 glide(table) {
  let glide = table.__glide;
  if (!glide || !glide.isConnected) {
   glide = table.__glide = document.createElement('div');
   glide.className = 'md-glide';
   glide.__overlay = true;
   glide.__shown = false;
   table.prepend(glide);
  }
  return glide;
 }

 move(table, row) {
  const glide = this.glide(table), grid = row.closest('table');
  const jump = !glide.__shown;
  if (jump) glide.style.transition = 'none';
  glide.style.width = `${grid.offsetWidth}px`;
  glide.style.height = `${row.offsetHeight}px`;
  glide.style.transform = `translateY(${grid.offsetTop + row.offsetTop}px)`;
  if (jump) {
   void glide.offsetHeight;
   glide.style.transition = '';
  }
  glide.style.opacity = '1';
  glide.__shown = true;
 }

 hide() {
  const glide = this.table && this.table.__glide;
  if (glide) {
   glide.style.opacity = '0';
   glide.__shown = false;
  }
  this.row = null;
  this.table = null;
 }
}

window.RowGlide = RowGlide;
})();
