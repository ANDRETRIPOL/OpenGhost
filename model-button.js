(() => {
'use strict';

// The sparkle that marks the chat's model in the model menu: a big outlined star and a small solid one circling it, in
// the 30…90 box of the other glyphs.
const CENTER = [55, 63];
const SMALL = [77, 41];
const SMALL_R = 8;
const BIG_PATH = 'M55 44c1.5 10.45 8.55 17.5 19 19-10.45 1.5-17.5 8.55-19 19-1.5-10.45-8.55-17.5-19-19 10.45-1.5 17.5-8.55 19-19z';
const SMALL_PATH = 'M77 33c.63 4.4 3.6 7.37 8 8-4.4.63-7.37 3.6-8 8-.63-4.4-3.6-7.37-8-8 4.4-.63 7.37-3.6 8-8z';
// How long the small star takes to circle the big one, in seconds.
const ORBIT = { period: 9 };
// An unpainted ring around the big star, wider than the small star's whole orbit, sets the orbit group's box:
// the group then turns about the big star's center wherever the small star has got to on its own orbit.
const RING = Math.ceil(Math.hypot(SMALL[0] - CENTER[0], SMALL[1] - CENTER[1]) + SMALL_R * Math.SQRT2) + 1;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The stage's copy is alive: the small star keeps circling the big one, like the ghost that never stands still.
// A flying copy holds still, its small star turned to where it stood when the glyph took off.
function glyph({ alive = false, turn = 0 } = {}) {
 const orbit = alive && !reducedMotion()
  ? `<animateTransform attributeName="transform" type="rotate" from="0 ${CENTER[0]} ${CENTER[1]}" to="360 ${CENTER[0]} ${CENTER[1]}" dur="${ORBIT.period}s" repeatCount="indefinite"/>` : '';
 return `<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="big" style="transform-box:fill-box;transform-origin:center" d="${BIG_PATH}"/><g class="orbit" style="transform-box:fill-box;transform-origin:center;transform:rotate(${turn}deg)"><circle cx="${CENTER[0]}" cy="${CENTER[1]}" r="${RING}" fill="none" stroke="none"/><g>${orbit}<path d="${SMALL_PATH}" fill="currentColor" stroke="none"/></g></g></svg>`;
}

// Where the small star stands on its orbit, in degrees: a flying copy keeps it in its style, a living one in its clock.
function turnOf(svg) {
 const orbit = svg?.querySelector('.orbit');
 if (!orbit) return 0;
 const m = new DOMMatrix(getComputedStyle(orbit).transform);
 const clock = svg.querySelector('animateTransform') ? svg.getCurrentTime() % ORBIT.period / ORBIT.period * 360 : 0;
 return Math.atan2(m.b, m.a) * 180 / Math.PI + clock;
}

// The chat's model in the composer, by its name, in the type of the mode beside it ("Ask"). The model menu
// (model-stage.js) lifts the name out of the button and flies it up into the list, where it grows into the model's
// own row, and flies the chosen one back down into the button as the menu closes. A name that changes otherwise (another
// chat opened) takes its place at once, as the rest of the chat does: a glide of the button's width showed the new name
// cut short for a moment and moved the buttons beside it.

class ModelButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'expanded']}
 constructor(){
  super(`<span class="glyph"><span class="name"></span></span>`,{},`
   :host{width:auto;min-width:0;max-width:var(--model-name-most,210px)}
   button{display:flex;align-items:center;padding:0 12px;border-radius:calc(var(--icon-button-size,34px) / 2);font:inherit;font-size:14px;font-weight:500;line-height:1;white-space:nowrap;transition:color .2s ease,background-color .2s ease}
   button:hover,button:focus-visible{background:rgba(var(--fg-rgb),.06)}
   .glyph{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;line-height:1.35;text-box:trim-both cap alphabetic;padding-block:.3em;pointer-events:none}
   .name.is-away{visibility:hidden}
   button:disabled .name{opacity:var(--icon-disabled-opacity,.3)}`);
  this.label=this.shadowRoot.querySelector('.name');
 }
 get expanded(){return this.hasAttribute('expanded')}
 defaultLabel(){return I18n.t('model')}
 activate(e){this.dispatchEvent(new CustomEvent('model-open',{bubbles:true,composed:true,detail:{keyboard:e.detail===0}}))}
 sync(){this.button.setAttribute('aria-haspopup','dialog');this.button.setAttribute('aria-expanded',String(this.expanded))}
 setName(name){
  if(this.label.textContent!==name)this.label.textContent=name;
 }
 // Where the name stands on screen and how large it is set, so the menu can fly it out of the button and back.
 labelRect(){return this.label.getBoundingClientRect()}
 // How wide the button would be with its whole name in it (as far as its most), whatever it is pressed to now.
 naturalWidth(){const most=parseFloat(getComputedStyle(this).maxWidth)||Infinity,pad=parseFloat(getComputedStyle(this.button).paddingLeft)+parseFloat(getComputedStyle(this.button).paddingRight);return Math.min(most,Math.ceil(this.label.getBoundingClientRect().width+pad))}
 // `rest`: the colour it comes to, not the one it is passing through (the button takes its colour back with a little
 // fade as the menu closes): the colour change is let go of, which the name, away while the menu is open, does not show.
 labelStyle(rest=false){if(rest){const button=this.button;button.style.transitionProperty='background-color';void getComputedStyle(this.label).color;button.style.transitionProperty=''}const style=getComputedStyle(this.label),size=parseFloat(style.fontSize);return {size,color:style.color,weight:parseFloat(style.fontWeight),spacing:(parseFloat(style.letterSpacing)||0)/size}}
 away(hidden){this.label.getAnimations().forEach(a=>a.cancel());this.label.classList.toggle('is-away',hidden)}
 // The name fades out or back in while the menu's flying copy of it crosses it, so the two hand over without a gap.
 fadeName(shown,duration,delay=0){
  const label=this.label;
  label.getAnimations().forEach(a=>a.cancel());
  label.classList.remove('is-away');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!duration){label.classList.toggle('is-away',!shown);return}
  const fade=label.animate([{opacity:shown?0:1},{opacity:shown?1:0}],{duration,delay,easing:'linear',fill:'both'});
  fade.finished.then(()=>{label.classList.toggle('is-away',!shown);fade.cancel()},()=>{});
 }
 render(v){this.glyph.style.transform=`translateY(${(v.press*1).toFixed(2)}px)`}
}
if(!customElements.get('model-button'))customElements.define('model-button',ModelButton);
window.ModelGlyph = { glyph, turnOf };
})();
