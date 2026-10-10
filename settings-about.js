(() => {
'use strict';

// Settings → About: what the app is and which version of it this is, what it runs on (and a button that copies it all,
// for a report of a problem), where its chats lie, where it lives on GitHub, and whose it is.
const HOME = 'https://github.com/ANDRETRIPOL/OpenGhost';
const LINKS = [
 ['releases', `${HOME}/releases`],
 ['source', HOME],
 ['report', `${HOME}/issues/new`],
 ['sponsor', 'https://github.com/sponsors/ANDRETRIPOL'],
];
const SYSTEMS = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
const OUT = '<svg class="about-out" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5h5.5V8M9.2 2.8L2.8 9.2"/></svg>';
const COPIED_TIME = 1600;

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Windows 11 still calls itself 10.0; its builds start at 22000.
function systemName(info) {
 const name = SYSTEMS[info.platform] || info.platform;
 if (info.platform !== 'win32') return name;
 const [major, , build] = String(info.system).split('.').map(Number);
 return `${name} ${major === 10 && build >= 22000 ? 11 : major}`;
}

class AboutSettings {
 constructor(root) {
  this.root = root;
  this.info = null;
  const t = key => escapeHtml(I18n.t(key));
  root.innerHTML = `
   <div class="about-head">
    <img class="about-icon" src="desktop/icon.png" alt="" draggable="false">
    <div class="about-id">
     <div class="about-name">OpenGhost</div>
     <div class="about-version"><span class="about-number"></span><span class="about-beta">${t('about.beta')}</span></div>
    </div>
   </div>
   <p class="settings-lead about-text">${t('about.text')}</p>
   <dl class="about-facts">
    <div class="about-fact" data-fact="system" hidden><dt>${t('about.system')}</dt><dd></dd></div>
    <div class="about-fact" data-fact="engine" hidden><dt>${t('about.engine')}</dt><dd></dd></div>
    <div class="about-fact" data-fact="data"><dt>${t('about.data')}</dt><dd>${t('about.data.text')}</dd></div>
   </dl>
   <div class="about-actions">
    <button type="button" class="settings-button about-copy" hidden>${t('about.copy')}</button>
    <button type="button" class="settings-button about-folder" hidden>${t('about.data.open')}</button>
   </div>
   <div class="about-links">${LINKS.map(([name, href]) => `
    <a class="about-link" href="${href}" target="_blank" rel="noopener noreferrer">
     <span class="about-link-text"><span class="about-link-name">${t(`about.${name}`)}</span><span class="about-link-hint">${t(`about.${name}.hint`)}</span></span>${OUT}
    </a>`).join('')}
   </div>
   <p class="about-licence">${t('about.licence')}</p>
   <p class="about-rights">${t('about.rights')}</p>`;
  this.copy = root.querySelector('.about-copy');
  this.copy.addEventListener('click', () => this.copyDetails());
  const bridge = window.openghost, folder = root.querySelector('.about-folder');
  if (bridge?.chatsFolder && bridge.revealFolder) {
   folder.hidden = false;
   folder.addEventListener('click', () => bridge.chatsFolder().then(path => path && bridge.revealFolder(path)).catch(() => {}));
  }
  Promise.resolve(bridge?.about?.()).then(info => info && this.paint(info)).catch(() => {});
 }

 paint(info) {
  this.info = info;
  const fact = (name, text) => {
   const row = this.root.querySelector(`[data-fact="${name}"]`);
   row.hidden = false;
   row.querySelector('dd').textContent = text;
  };
  this.root.querySelector('.about-number').textContent = I18n.t('about.version', { version: info.version });
  fact('system', [systemName(info), info.system, info.arch].filter(Boolean).join(' · '));
  fact('engine', `Electron ${info.electron} · Chromium ${info.chrome}`);
  this.copy.hidden = false;
 }

 // The details go to the clipboard in English, whatever the app speaks: they are for a report.
 copyDetails() {
  const info = this.info;
  if (!info) return;
  const text = [`OpenGhost ${info.version} beta`, `${systemName(info)} (${info.system}, ${info.arch})`, `Electron ${info.electron}, Chromium ${info.chrome}`, `Language: ${I18n.lang}`].join('\n');
  navigator.clipboard.writeText(text).then(() => {
   clearTimeout(this.copiedTimer);
   this.copy.textContent = I18n.t('about.copied');
   this.copiedTimer = setTimeout(() => { this.copy.textContent = I18n.t('about.copy'); }, COPIED_TIME);
  }, () => {});
 }
}

window.AboutSettings = AboutSettings;
})();
