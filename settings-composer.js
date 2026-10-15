(() => {
'use strict';

// Settings → Composer: what the message field does by itself. One switch for now, the predictions (predictions.js),
// and under it a small picture of them at work: the end of an answer, and the message field where the predicted words
// come in grey, the Tab key is pressed and they turn into words written. It plays over and over while the page is
// open; switched off, the field stands empty.
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ARROW = '<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M60 82V39"/><path d="M43 56 60 39 77 56"/></svg>';

class ComposerSettings {
 constructor({ root, predictions }) {
  const t = key => escapeHtml(I18n.t(key));
  root.innerHTML = `
   <p class="settings-lead">${t('settings.composer.lead')}</p>
   <section class="general-block">
    <div class="general-head memory-head">
     <span class="settings-label" id="settings-predictions-label">${t('settings.composer.predictions')}</span>
     <button type="button" class="memory-switch" role="switch" aria-labelledby="settings-predictions-label"><span class="memory-switch-knob"></span></button>
    </div>
    <div class="predict-demo" aria-hidden="true">
     <div class="predict-demo-reply">
      <span class="predict-demo-ghost">${Glyphs.ghost}</span>
      <span class="predict-demo-lines"><i></i><i></i><i></i></span>
     </div>
     <div class="predict-demo-composer">
      <div class="predict-demo-field">
       <span class="predict-demo-ask">${t('composer.placeholder')}</span>
       <span class="predict-demo-guess"><span class="predict-demo-words">${t('settings.composer.demo')}</span><i class="predict-demo-caret"></i><kbd class="composer-key predict-demo-key">Tab</kbd></span>
      </div>
      <div class="predict-demo-tools"><i class="predict-demo-plus"></i><span class="predict-demo-send">${ARROW}</span></div>
     </div>
    </div>
    <p class="settings-hint">${t('settings.composer.predictions.hint')}</p>
    <p class="settings-hint">${t('settings.composer.predictions.cost')}</p>
   </section>`;
  const toggle = root.querySelector('.memory-switch'), demo = root.querySelector('.predict-demo');
  const sync = on => {
   toggle.setAttribute('aria-checked', String(on));
   demo.classList.toggle('is-off', !on);
  };
  toggle.addEventListener('click', () => predictions.setOn(!predictions.on));
  predictions.onChange(sync);
  sync(predictions.on);
 }
}

window.ComposerSettings = ComposerSettings;
})();
