(() => {
  'use strict';
  // Light or dark for the website. Without a saved choice it follows the device's setting;
  // the top-bar button saves an explicit choice. The head script has already set the theme
  // before the first paint, this file keeps the button and the browser's theme colour in step.
  const storageKey = 'openghost-site-theme';
  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  const themeColor = document.getElementById('theme-color-meta');
  const deviceQuery = window.matchMedia('(prefers-color-scheme: light)');

  const saved = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (error) {
      return null;
    }
  };

  const current = () => (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

  const show = theme => {
    root.setAttribute('data-theme', theme);
    if (themeColor) {
      const background = getComputedStyle(root).getPropertyValue('--bg').trim();
      themeColor.setAttribute('content', background || (theme === 'light' ? '#f5f4ee' : '#101110'));
    }
    if (!button) return;
    // The button names the mode it switches to; its icon is the mode it leads to.
    const target = theme === 'light' ? 'dark' : 'light';
    const label = target === 'light' ? 'Switch to light mode' : 'Switch to dark mode';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.querySelector('use').setAttribute('href', target === 'light' ? '#i-sun' : '#i-moon');
  };

  if (button) {
    button.hidden = false;
    button.addEventListener('click', () => {
      const next = current() === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(storageKey, next);
      } catch (error) {
        // Storage can be blocked; the switch still works for this visit.
      }
      // A short cross-fade of the whole page, as in the reference recording. Browsers without
      // View Transitions, and visitors who ask for reduced motion, get the instant switch.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !reduced) {
        document.startViewTransition(() => show(next));
      } else {
        show(next);
      }
    });
  }

  // Follow the device's setting live, unless the visitor has chosen a theme.
  deviceQuery.addEventListener('change', event => {
    if (!saved()) show(event.matches ? 'light' : 'dark');
  });

  show(saved() || (deviceQuery.matches ? 'light' : 'dark'));
})();
