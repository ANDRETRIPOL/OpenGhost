(() => {
  'use strict';

  const API_URL = 'https://api.github.com/repos/ANDRETRIPOL/OpenGhost/releases?per_page=1';
  const CACHE_KEY = 'openghost-site-release-feed-v1';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const REPOSITORY = 'https://github.com/ANDRETRIPOL/OpenGhost';
  const platformSuffixes = {
    mac: name => /\.dmg$/i.test(name),
    windows: name => /setup\.exe$/i.test(name),
    linux: name => /linux\.tar\.gz$/i.test(name)
  };

  const safeRelease = release => {
    if (!release || typeof release.tag_name !== 'string' || release.tag_name.length > 80 || !/^v?[\w.-]+$/.test(release.tag_name)) return null;
    let pageUrl;
    try { pageUrl = new URL(release.html_url); } catch { return null; }
    if (pageUrl.origin !== 'https://github.com' || pageUrl.pathname.indexOf('/ANDRETRIPOL/OpenGhost/releases/tag/') !== 0) return null;

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const links = {};
    for (const [platform, matches] of Object.entries(platformSuffixes)) {
      const asset = assets.find(item => item && typeof item.name === 'string' && matches(item.name));
      if (!asset || typeof asset.browser_download_url !== 'string') continue;
      try {
        const url = new URL(asset.browser_download_url);
        if (url.origin === 'https://github.com' && url.pathname.indexOf('/ANDRETRIPOL/OpenGhost/releases/download/') === 0) {
          links[platform] = url.href;
        }
      } catch { /* Keep a release-page fallback for malformed asset links. */ }
    }
    return {
      tag: release.tag_name,
      name: typeof release.name === 'string' && release.name.trim() ? release.name.trim().slice(0, 120) : release.tag_name,
      url: pageUrl.href,
      body: typeof release.body === 'string' ? release.body.slice(0, 50000) : '',
      links
    };
  };

  const readCache = () => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached || !Number.isFinite(cached.savedAt) || !cached.release || cached.savedAt > Date.now() + 60000) return null;
      const release = safeRelease({
        tag_name: cached.release.tag,
        name: cached.release.name,
        html_url: cached.release.url,
        body: cached.release.body,
        assets: Object.entries(cached.release.links || {}).map(([platform, browser_download_url]) => ({
          name: platform === 'mac' ? 'cached.dmg' : platform === 'windows' ? 'cached-Setup.exe' : 'cached-linux.tar.gz',
          browser_download_url
        }))
      });
      return release ? { release, savedAt: cached.savedAt } : null;
    } catch { return null; }
  };

  const writeCache = release => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), release })); }
    catch { /* Storage can be disabled or full; the live page still works. */ }
  };

  const appendInline = (parent, text) => {
    const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      if (match[1]) {
        const strong = document.createElement('strong');
        strong.textContent = match[1];
        parent.append(strong);
      } else if (match[2]) {
        const code = document.createElement('code');
        code.textContent = match[2];
        parent.append(code);
      } else {
        let url;
        try { url = new URL(match[4]); } catch { url = null; }
        if (url && url.protocol === 'https:') {
          const link = document.createElement('a');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = match[3];
          parent.append(link);
        } else parent.append(document.createTextNode(match[3]));
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  };

  const renderNotes = (container, markdown, releaseUrl) => {
    container.replaceChildren();
    let article = null;
    let list = null;
    let paragraph = [];
    let codeLines = null;

    const makeArticle = title => {
      article = document.createElement('article');
      article.className = 'feature-card feature-tools release-note-card';
      const heading = document.createElement('h3');
      heading.textContent = title || 'Release notes';
      article.append(heading);
      container.append(article);
    };
    const ensureArticle = () => { if (!article) makeArticle('Release notes'); };
    const closeList = () => { list = null; };
    const flushParagraph = () => {
      if (!paragraph.length) return;
      ensureArticle();
      const p = document.createElement('p');
      appendInline(p, paragraph.join(' '));
      article.append(p);
      paragraph = [];
    };
    const flushCode = () => {
      if (!codeLines) return;
      ensureArticle();
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeLines.join('\n');
      pre.append(code);
      article.append(pre);
      codeLines = null;
    };

    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith('```')) {
        flushParagraph();
        closeList();
        if (codeLines) flushCode();
        else codeLines = [];
        continue;
      }
      if (codeLines) { codeLines.push(rawLine); continue; }
      const heading = line.match(/^(#{2,4})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length;
        if (level === 2) makeArticle(heading[2]);
        else {
          ensureArticle();
          const subheading = document.createElement(level === 3 ? 'h4' : 'h5');
          subheading.textContent = heading[2];
          article.append(subheading);
        }
        continue;
      }
      const bullet = line.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        ensureArticle();
        if (!list) {
          list = document.createElement('ul');
          article.append(list);
        }
        const item = document.createElement('li');
        appendInline(item, bullet[1]);
        list.append(item);
        continue;
      }
      if (!line) {
        flushParagraph();
        closeList();
        continue;
      }
      closeList();
      paragraph.push(line);
    }
    flushParagraph();
    flushCode();
    if (!container.children.length) {
      const locale = window.OpenGhostLocaleText?.en || {};
      makeArticle(locale.releaseNotesUnavailable || 'Release notes unavailable');
      article.classList.add('release-note-empty');
      const p = document.createElement('p');
      p.append(document.createTextNode(locale.releaseBodyMissing || 'No release notes were included in this release.'));
      p.append(document.createTextNode(' '));
      const link = document.createElement('a');
      link.href = releaseUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = locale.openReleasePage || 'Open the release page';
      p.append(link);
      article.append(p);
    }
  };

  const applyRelease = (release, allowDirectDownloads = true) => {
    const version = document.getElementById('release-version');
    if (version) version.textContent = release.name;
    for (const id of ['download-version', 'download-meta-version']) {
      const node = document.getElementById(id);
      if (node) node.textContent = release.name;
    }
    const pill = document.getElementById('release-pill');
    if (pill) {
      pill.href = release.url;
      const tag = document.getElementById('release-pill-version');
      if (tag) tag.textContent = release.name;
    }
    for (const id of ['release-notes-link', 'download-release-link', 'limitations-link']) {
      const link = document.getElementById(id);
      if (link) link.href = release.url;
    }
    for (const platform of Object.keys(platformSuffixes)) {
      const button = document.querySelector(`[data-download="${platform}"]`);
      if (button) button.href = (allowDirectDownloads && release.links[platform]) || (allowDirectDownloads ? release.url : `${REPOSITORY}/releases`);
    }
    const preferred = document.querySelector('.download-card.recommended [data-download]');
    const hero = document.getElementById('hero-download');
    if (preferred && hero && hero.getAttribute('href') !== '#download') hero.href = preferred.href;

    const highlights = document.getElementById('release-highlights');
    if (highlights) {
      highlights.classList.add('release-notes-grid');
      renderNotes(highlights, release.body, release.url);
    }
    try {
      const schema = document.querySelector('script[type="application/ld+json"]');
      if (schema) {
        const data = JSON.parse(schema.textContent);
        data.softwareVersion = release.tag.replace(/^v/, '');
        data.releaseNotes = release.url;
        schema.textContent = JSON.stringify(data);
      }
    } catch { /* The static structured data remains the fallback. */ }
  };

  const findLatest = releases => {
    if (!Array.isArray(releases)) return null;
    for (const release of releases) {
      if (release && !release.draft) {
        const safe = safeRelease(release);
        if (safe) return safe;
      }
    }
    return null;
  };

  const cached = readCache();
  const cacheFresh = Boolean(cached && Date.now() - cached.savedAt < CACHE_TTL);
  if (cached) applyRelease(cached.release, cacheFresh);

  (async () => {
    if (cacheFresh) return;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const response = await fetch(API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        credentials: 'omit',
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error(`GitHub releases returned ${response.status}`);
      const latest = findLatest(await response.json());
      if (!latest) throw new Error('No public release with a valid release page was found');
      applyRelease(latest);
      writeCache(latest);
    } catch {
      // Keep the static or cached release fully usable when offline or rate-limited.
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  })();
})();
