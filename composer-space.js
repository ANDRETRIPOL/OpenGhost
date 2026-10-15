(() => {
'use strict';

// The room the composer takes at the bottom of a chat, told to the chat as `--composer-space` whenever the composer
// changes height. The property does not pass down by itself (styles.css): only the few elements that stand clear of the
// composer take it, so a composer growing by a line, frame after frame, no longer has every message of a long chat
// styled anew. A diagram's editor lies deep among the messages, out of that line, and is told directly while it is open.
const NAME = '--composer-space';

function watch(main, composer) {
 let value = '';
 const tell = () => {
  const gap = parseFloat(getComputedStyle(main).getPropertyValue('--composer-bottom-gap')) || 0;
  value = `${Math.ceil(composer.offsetHeight + gap)}px`;
  main.style.setProperty(NAME, value);
  for (const editor of main.querySelectorAll('.dg-editor:not([hidden])')) editor.style.setProperty(NAME, value);
  main.dispatchEvent(new Event('composer-space'));
 };
 const size = new ResizeObserver(tell);
 size.observe(composer);
 const opened = new MutationObserver(records => {
  for (const { target } of records) if (value && !target.hidden && target.classList.contains('dg-editor')) target.style.setProperty(NAME, value);
 });
 opened.observe(main, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
 return { disconnect() { size.disconnect(); opened.disconnect(); } };
}

window.ComposerSpace = { watch };
})();
