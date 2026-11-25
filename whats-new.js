(() => {
'use strict';

// What a new version brings, shown once on the first start after the app has updated itself: a small window as the
// settings are, with the new features each as a picture and a few words beside it, and the smaller changes under them
// as a line each with its sign (change-icons.js). Someone who has just installed the app is shown the welcome cards
// instead (welcome-tour.js), and this version counts as seen.
//
// A version's entry: `features` with a picture of each (whats-new/<version>/<picture>-<theme>.png), `changes` with the
// sign of each. Their words are in the languages' files, as news.<version>.<key>.title and .text.
const RELEASES = {
 '1.5.8': {
  features: [
   { key: 'calendar', picture: 'calendar' },
   { key: 'notes', picture: 'notes' },
   { key: 'tactics', picture: 'tactics' },
  ],
  changes: [
   { key: 'sendnow', icon: 'agent' },
   { key: 'browser', icon: 'language' },
   { key: 'fixes', icon: 'fix' },
  ],
 },
 '1.5.7': {
  features: [
   { key: 'rules', picture: 'rules' },
   { key: 'widgets', picture: 'widgets' },
  ],
  changes: [
   { key: 'browser', icon: 'language' },
   { key: 'economy', icon: 'cost' },
   { key: 'fixes', icon: 'fix' },
  ],
 },
 '1.5.6': {
  features: [
   { key: 'economy', picture: 'economy' },
   { key: 'ghost', picture: 'ghost' },
   { key: 'books', picture: 'books' },
   { key: 'stats', picture: 'stats' },
  ],
  changes: [
   { key: 'memory', icon: 'memory' },
   { key: 'models', icon: 'model' },
   { key: 'local', icon: 'local' },
   { key: 'fixes', icon: 'fix' },
  ],
 },
};
const KEY = 'news';
const RELEASES_URL = 'https://github.com/ANDRETRIPOL/OpenGhost/releases';
const RISE = { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const STAGGER = 45;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function element(tag, className, text) {
 const el = document.createElement(tag);
 if (className) el.className = className;
 if (text != null) el.textContent = text;
 return el;
}

class WhatsNew {
 // On the first start of a version that has an entry here, once. A first start of the app at all only counts the
 // version as seen.
 static async start({ library, onDone } = {}) {
  try {
   // Whether the welcome cards were ever seen is read first, before they could count themselves seen on this very start
   // (welcome-tour.js writes that once the opening has played): read later, a first start looked like an update.
   const [info, seen, tour] = await Promise.all([window.openghost?.about?.(), ChatStore.read(KEY), ChatStore.read('tour')]);
   const version = info?.version;
   if (!version) return;
   if (seen?.version === version) return;
   await library.ready;
   const fresh = !seen && !library.chats.length && !tour?.seen;
   ChatStore.write(KEY, { version, at: Date.now() });
   if (fresh || !RELEASES[version]) return;
   if (document.documentElement.classList.contains('is-splash')) await new Promise(resolve => window.addEventListener('splashend', resolve, { once: true }));
   new WhatsNew(version, { onDone }).open();
  } catch {}
 }

 static has(version) { return !!RELEASES[version]; }

 constructor(version, { onDone } = {}) {
  this.version = version;
  this.onDone = onDone;
  const release = RELEASES[version], t = key => I18n.t(`news.${key}`), item = (key, part) => I18n.t(`news.${version}.${key}.${part}`);
  // A picture in each theme, the theme's own showing (styles.css), so a theme changed while the window is open is
  // followed; with its words in the app's language (English for one it has no pictures in).
  const lang = ['ru', 'it', 'fr'].includes(I18n.lang) ? I18n.lang : 'en';
  const dialog = this.el = element('dialog', 'news');
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'news-title');
  const head = element('header', 'news-head');
  const icon = element('img', 'news-app');
  icon.src = 'desktop/icon.png';
  icon.alt = '';
  icon.draggable = false;
  const titles = element('div', 'news-titles');
  const title = element('h2', 'news-title', t('title'));
  title.id = 'news-title';
  titles.append(title, element('div', 'news-version', I18n.t('news.version', { version })));
  head.append(icon, titles);
  const list = element('div', 'news-list');
  this.rows = [];
  for (const feature of release.features || []) {
   const row = element('article', 'news-feature');
   const picture = element('span', 'news-picture');
   for (const theme of ['dark', 'light']) {
    const img = element('img', `news-shot is-${theme}`);
    img.src = `whats-new/${version}/${feature.picture}-${theme}-${lang}.png`;
    img.alt = '';
    img.draggable = false;
    picture.append(img);
   }
   const words = element('div', 'news-words');
   words.append(element('h3', 'news-name', item(feature.key, 'title')), element('p', 'news-text', item(feature.key, 'text')));
   row.append(picture, words);
   list.append(row);
   this.rows.push(row);
  }
  if (release.changes?.length) {
   const more = element('div', 'news-more', t('more'));
   list.append(more);
   this.rows.push(more);
   // The smaller changes in two columns: each its sign, what changed, and a line of what that means.
   const grid = element('div', 'news-changes');
   for (const change of release.changes) {
    const row = element('div', 'news-change');
    const sign = element('span', 'news-sign');
    sign.innerHTML = ChangeIcons.of(change.icon);
    const words = element('div', 'news-change-words');
    words.append(element('b', 'news-change-name', item(change.key, 'title').replace(/\.$/, '')), element('span', 'news-change-text', item(change.key, 'text')));
    row.append(sign, words);
    grid.append(row);
    this.rows.push(row);
   }
   list.append(grid);
  }
  const foot = element('footer', 'news-foot');
  const all = element('a', 'news-all', t('all'));
  all.href = `${RELEASES_URL}/tag/v${version}`;
  all.target = '_blank';
  all.rel = 'noopener noreferrer';
  const ok = element('button', 'news-ok', t('ok'));
  ok.type = 'button';
  ok.addEventListener('click', () => dialog.close());
  foot.append(all, ok);
  dialog.append(head, list, foot);
  dialog.addEventListener('close', () => this.closed(), { once: true });
 }

 open() {
  document.body.append(this.el);
  this.el.showModal();
  // Ready for Enter, with no ring shown round it until the keyboard is used.
  this.el.querySelector('.news-ok').focus({ preventScroll: true, focusVisible: false });
  if (reducedMotion()) return;
  // The rows come in one after another, rising a little, once the window has come.
  this.rows.forEach((row, k) => row.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { ...RISE, delay: 90 + k * STAGGER, fill: 'backwards' }));
 }

 closed() {
  // The window leaves as the settings do (styles.css); it is taken away once it has.
  setTimeout(() => this.el.remove(), 200);
  this.onDone?.();
 }
}

window.WhatsNew = WhatsNew;
})();
