# OpenGhost website

This folder contains the static landing page for OpenGhost, designed and implemented by [scadavide55](https://github.com/scadavide55). It is separate from the Electron application's root `index.html` and does not change the desktop application's interface.

## Preview and edit

Open `docs/index.html` in a browser, or serve this folder with a local HTTP server. The files are ordinary HTML, CSS, JavaScript, images, and language catalogs; no dependency installation or build step is required.

The presentation layer is in `index.html` and `art-direction.css`. Theme behavior is in `theme.js`, release updates are in `release-feed.js`, and website translations are in `locales/`. Edit these files directly to maintain the site.

## Publish with GitHub Pages

After this contribution is approved and merged, a repository administrator or maintainer can configure:

1. Repository **Settings → Pages**.
2. **Source: Deploy from a branch**.
3. **Branch: main**, **Folder: /docs**.
4. Save and wait for the Pages deployment to finish.
5. Verify <https://andretripol.github.io/OpenGhost/> on desktop and phone, including the gallery, language and theme controls, and download links.

The `.nojekyll` file keeps this a plain static site. The canonical URL, sitemap, robots file, and social metadata already use the address above. If the hosting address changes, update them together. Publishing settings are not changed by this PR; the site is not live until the owner enables publishing and the deployment succeeds.

## Latest releases and fallback behavior

The website reads the newest published release from GitHub's public Releases API, including prereleases. It matches platform installer assets, updates version labels and release notes, and caches validated data in local storage for six hours. It does not use `/releases/latest`, which can fail when releases are prereleases.

A fresh cache can supply direct installer links. During a refresh, with stale data, or if the API is unavailable, installer buttons safely fall back to the repository's newest-first Releases page instead of an outdated installer. Cached notes remain visible if available; otherwise the built-in notes remain. The API needs no token, and the page makes no analytics or tracking requests.

## Packaging and security

`package.json` excludes `docs/**` from desktop installers. Keep that exclusion when adding website files. Do not replace the desktop application's root HTML with the landing page.

The page has a meta Content-Security-Policy. `_headers` contains additional headers for hosts that support that format; GitHub Pages does not apply that file as HTTP header configuration.

Do not put API keys, access tokens, private screenshots, development environments, test output, or logs in this folder. See [ASSET-NOTICES.md](ASSET-NOTICES.md) and the repository's [LICENSE](../LICENSE) for asset attribution and the separate terms for the OpenGhost brand and application design.
