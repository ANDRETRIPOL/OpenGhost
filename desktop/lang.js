'use strict';

// The app's language, as this side knows it. The page picks it (i18n.js) and says so here; what this side itself puts on
// screen follows: the tray's menu and the menu under the right button in the browser. It is kept in a file of its own,
// so the tray speaks it before any window has opened.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const STRINGS = {
 en: {
  'tray.open': 'Open OpenGhost', 'tray.quick': 'Quick chat', 'tray.quit': 'Quit OpenGhost',
  'menu.openLink': 'Open link in new tab', 'menu.copyLink': 'Copy link address', 'menu.openImage': 'Open image in new tab', 'menu.copyImage': 'Copy image',
  'menu.cut': 'Cut', 'menu.copy': 'Copy', 'menu.paste': 'Paste', 'menu.selectAll': 'Select all',
  'menu.back': 'Back', 'menu.forward': 'Forward', 'menu.reload': 'Reload', 'menu.inspect': 'Inspect',
 },
 it: {
  'tray.open': 'Apri OpenGhost', 'tray.quick': 'Chat rapida', 'tray.quit': 'Esci da OpenGhost',
  'menu.openLink': 'Apri link in una nuova scheda', 'menu.copyLink': 'Copia indirizzo del link', 'menu.openImage': 'Apri immagine in una nuova scheda', 'menu.copyImage': 'Copia immagine',
  'menu.cut': 'Taglia', 'menu.copy': 'Copia', 'menu.paste': 'Incolla', 'menu.selectAll': 'Seleziona tutto',
  'menu.back': 'Indietro', 'menu.forward': 'Avanti', 'menu.reload': 'Ricarica', 'menu.inspect': 'Ispeziona',
 },
 fr: {
  'tray.open': 'Ouvrir OpenGhost', 'tray.quick': 'Chat rapide', 'tray.quit': 'Quitter OpenGhost',
  'menu.openLink': 'Ouvrir le lien dans un nouvel onglet', 'menu.copyLink': 'Copier l’adresse du lien', 'menu.openImage': 'Ouvrir l’image dans un nouvel onglet', 'menu.copyImage': 'Copier l’image',
  'menu.cut': 'Couper', 'menu.copy': 'Copier', 'menu.paste': 'Coller', 'menu.selectAll': 'Tout sélectionner',
  'menu.back': 'Précédent', 'menu.forward': 'Suivant', 'menu.reload': 'Recharger', 'menu.inspect': 'Inspecter',
 },
 ru: {
  'tray.open': 'Открыть OpenGhost', 'tray.quick': 'Быстрый чат', 'tray.quit': 'Выйти из OpenGhost',
  'menu.openLink': 'Открыть ссылку в новой вкладке', 'menu.copyLink': 'Копировать адрес ссылки', 'menu.openImage': 'Открыть картинку в новой вкладке', 'menu.copyImage': 'Копировать картинку',
  'menu.cut': 'Вырезать', 'menu.copy': 'Копировать', 'menu.paste': 'Вставить', 'menu.selectAll': 'Выделить всё',
  'menu.back': 'Назад', 'menu.forward': 'Вперёд', 'menu.reload': 'Обновить', 'menu.inspect': 'Просмотреть код',
 },
};

let lang = 'en';
const file = () => path.join(app.getPath('userData'), 'lang.json');

function load() {
 try {
  const saved = JSON.parse(fs.readFileSync(file(), 'utf8')).lang;
  if (saved in STRINGS) lang = saved;
 } catch {}
}

// True when the language has changed.
function set(next) {
 if (!Object.hasOwn(STRINGS, next) || next === lang) return false;
 lang = next;
 fs.promises.writeFile(file(), JSON.stringify({ lang })).catch(() => {});
 return true;
}

const t = key => STRINGS[lang][key] ?? STRINGS.en[key] ?? key;

module.exports = { load, set, t, get lang() { return lang; } };
