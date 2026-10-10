(() => {
  'use strict';
  const catalogs = window.OpenGhostLocaleText;
  const picker = document.getElementById('language-select');
  if (!catalogs || !catalogs.en || !picker) return;

  const languages = ['en', 'it', 'es', 'fr', 'ru'];
  const storageKey = 'openghost-site-language';
  const sourceKeys = new Map(Object.entries(catalogs.en).map(([key, text]) => [text, key]));
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  const attributes = ['aria-label', 'alt', 'title', 'content'];
  const observation = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes };
  let language = 'en';
  let observer;

  // Retain English sources on the existing nodes. Never replace HTML, SVGs,
  // links, commands, event handlers, or the state of the page's controls.
  const isKnownTranslation = (key, text) => languages.some(code => catalogs[code] && catalogs[code][key] === text);
  const translated = key => catalogs[language][key] || catalogs.en[key];

  const translateText = node => {
    if (!node.parentElement || node.parentElement.closest('script, style, svg')) return;
    const raw = node.nodeValue;
    const text = raw.trim();
    const key = sourceKeys.get(text);
    let source = textSources.get(node);
    if (key) {
      source = { key, before: raw.match(/^\s*/)[0], after: raw.match(/\s*$/)[0] };
      textSources.set(node, source);
    } else if (source && !isKnownTranslation(source.key, text)) {
      // Leave new, uncatalogued content alone rather than restoring stale text.
      textSources.delete(node);
      return;
    }
    if (!source) return;
    const next = source.before + translated(source.key) + source.after;
    if (raw !== next) node.nodeValue = next;
  };

  const translateAttributes = element => {
    if (element.closest('script, style, svg')) return;
    let sources = attributeSources.get(element);
    for (const attribute of attributes) {
      if (attribute === 'content' && !element.matches('meta[name="description"], meta[property="og:title"], meta[property="og:description"]')) continue;
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      const key = sourceKeys.get(current);
      let source = sources && sources.get(attribute);
      if (key) {
        if (!sources) {
          sources = new Map();
          attributeSources.set(element, sources);
        }
        sources.set(attribute, key);
        source = key;
      } else if (source && !isKnownTranslation(source, current)) {
        sources.delete(attribute);
        continue;
      }
      if (!source) continue;
      const next = translated(source);
      if (next !== current) element.setAttribute(attribute, next);
    }
  };

  const translateTree = root => {
    if (root.nodeType === Node.TEXT_NODE) {
      translateText(root);
      return;
    }
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) translateText(node);
      else translateAttributes(node);
    }
  };

  // The existing page script still owns all interactions. Translate only the
  // text and labels it changes; ignore animation, scroll, and layout attributes.
  observer = new MutationObserver(records => {
    observer.disconnect();
    try {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target);
        else if (record.type === 'attributes') translateAttributes(record.target);
        else record.addedNodes.forEach(translateTree);
      }
    } finally {
      observer.observe(document.documentElement, observation);
    }
  });

  const setLanguage = (code, remember) => {
    observer.disconnect();
    language = languages.includes(code) && catalogs[code] ? code : 'en';
    try {
      translateTree(document.documentElement);
      document.documentElement.lang = language;
      picker.value = language;
      document.getElementById('language-code').textContent = language.toUpperCase();
      if (remember) {
        try { localStorage.setItem(storageKey, language); } catch { /* Storage may be disabled. */ }
      }
    } finally {
      observer.observe(document.documentElement, observation);
    }
    // Text reflows can change the distance used by the existing progress line.
    window.dispatchEvent(new Event('resize'));
  };

  let preferred = 'en';
  try { preferred = localStorage.getItem(storageKey) || 'en'; } catch { /* English is the fallback. */ }
  for (const option of picker.options) option.disabled = !catalogs[option.value];
  picker.addEventListener('change', () => setLanguage(picker.value, true));
  setLanguage(preferred, false);
  picker.closest('.language-picker').hidden = false;
})();
