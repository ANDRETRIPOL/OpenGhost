(() => {
'use strict';

// The room the composer takes at the bottom of a chat, told to the chat as `--composer-space` whenever the composer
// changes height. The property does not pass down by itself (styles.css): only the few elements that stand clear of the
// composer take it, so a composer growing by a line, frame after frame, no longer has every message of a long chat
// styled anew.
const NAME = '--composer-space';

function watch(main, composer) {
 const tell = () => {
  const gap = parseFloat(getComputedStyle(main).getPropertyValue('--composer-bottom-gap')) || 0;
  main.style.setProperty(NAME, `${Math.ceil(composer.offsetHeight + gap)}px`);
  main.dispatchEvent(new Event('composer-space'));
 };
 const size = new ResizeObserver(tell);
 size.observe(composer);
 return { disconnect() { size.disconnect(); } };
}

window.ComposerSpace = { watch };
})();
