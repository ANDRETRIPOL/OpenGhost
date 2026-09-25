(() => {
'use strict';

const PREVIEW_LINES = 14;
const LEAVE = { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const ICONS = { command: 'terminal', file: 'file', web: 'globe' };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function element(tag, className, text) {
 const el = document.createElement(tag);
 el.className = className;
 if (text !== undefined) el.textContent = text;
 return el;
}

function lines(text, sign, className) {
 const all = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
 const shown = all.slice(0, PREVIEW_LINES).map(line => {
  const row = element('div', `approval-line ${className}`);
  row.append(element('span', 'approval-sign', sign), element('span', 'approval-text', line || ' '));
  return row;
 });
 if (all.length > PREVIEW_LINES) shown.push(element('div', 'approval-more', I18n.t('approve.more', { count: all.length - PREVIEW_LINES })));
 return shown;
}

function link(url) {
 const box = element('div', 'approval-link');
 try {
  const parsed = new URL(url);
  box.append(element('span', 'approval-host', parsed.host.replace(/^www\./, '')), element('span', 'approval-rest', `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`));
 } catch {
  box.textContent = url;
 }
 box.title = url;
 return box;
}

class ApprovalCard {
 constructor(info) {
  this.settled = false;
  this.answer = new Promise(resolve => { this.resolve = resolve; });
  const el = this.el = element('div', `approval is-${info.kind}`);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', info.title);
  const head = element('div', 'approval-head');
  const icon = element('span', 'approval-icon');
  icon.innerHTML = Glyphs[ICONS[info.kind] || 'terminal'];
  head.append(icon, element('span', 'approval-title', info.title));
  if (info.path) head.append(element('span', 'approval-path', info.path));
  el.append(head);
  if (info.code) el.append(element('pre', 'approval-code', info.code));
  if (info.removed || info.added) {
   const diff = element('div', 'approval-diff');
   if (info.removed) diff.append(...lines(info.removed, '−', 'is-removed'));
   if (info.added) diff.append(...lines(info.added, info.removed ? '+' : '', info.removed ? 'is-added' : 'is-new'));
   el.append(diff);
  }
  if (info.text) el.append(element('div', 'approval-query', info.text));
  if (info.url) el.append(link(info.url));
  const foot = element('div', 'approval-foot');
  this.deny = element('button', 'approval-button is-deny', I18n.t('approve.deny'));
  this.allow = element('button', 'approval-button is-allow', I18n.t('approve.allow'));
  this.deny.type = this.allow.type = 'button';
  this.deny.addEventListener('click', () => this.settle('deny'));
  this.allow.addEventListener('click', () => this.settle('allow'));
  foot.append(this.deny, this.allow);
  el.append(foot);
 }

 settle(value) {
  if (this.settled) return;
  this.settled = true;
  this.el.classList.add('is-answered');
  this.el.classList.toggle('is-allowed', value === 'allow');
  this.deny.disabled = this.allow.disabled = true;
  this.resolve(value);
 }

 dismiss() {
  const el = this.el;
  if (!el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  el.style.overflow = 'hidden';
  el.animate([
   { height: `${el.offsetHeight}px`, opacity: 1, transform: 'none' },
   { height: '0px', marginTop: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, transform: 'scale(0.97)' },
  ], LEAVE).finished.then(() => el.remove(), () => el.remove());
 }
}

window.ApprovalCard = ApprovalCard;
})();
