(() => {
'use strict';

// One sparkle for every model: a big outlined star and a small solid one circling it, in the 30…90 box of the other glyphs.
const CENTER = [55, 63];
const SMALL = [77, 41];
const SMALL_R = 8;
const BIG_PATH = 'M55 44c1.5 10.45 8.55 17.5 19 19-10.45 1.5-17.5 8.55-19 19-1.5-10.45-8.55-17.5-19-19 10.45-1.5 17.5-8.55 19-19z';
const SMALL_PATH = 'M77 33c.63 4.4 3.6 7.37 8 8-4.4.63-7.37 3.6-8 8-.63-4.4-3.6-7.37-8-8 4.4-.63 7.37-3.6 8-8z';
const ORBIT = { hover: -28, spin: 90, swell: 0.45, period: 9 };
const TWINKLE = { every: [7000, 15000], hold: 220, hop: -26, swell: 0.6, breath: 0.08 };
// An unpainted ring around the big star, wider than the small star's whole orbit, sets the orbit group's box:
// the group then turns about the big star's center wherever the small star has got to on its own orbit.
const RING = Math.ceil(Math.hypot(SMALL[0] - CENTER[0], SMALL[1] - CENTER[1]) + SMALL_R * Math.SQRT2) + 1;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const random = ([min, max]) => min + Math.random() * (max - min);

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

class ModelButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'expanded']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g class="glyph"><path class="big" d="${BIG_PATH}"/><path class="small" d="${SMALL_PATH}" fill="currentColor" stroke="none"/></g>
   </svg>`,{hint:[170,15],twinkle:[300,14]},`
   .icon.is-away{visibility:hidden}`);
  this.icon=this.shadowRoot.querySelector('.icon');
  this.big=this.shadowRoot.querySelector('.big');
  this.small=this.shadowRoot.querySelector('.small');
  this.turn=0;this.twinkleUntil=0;this.idle=0;
 }
 connectedCallback(){super.connectedCallback();this.plan()}
 disconnectedCallback(){super.disconnectedCallback();clearTimeout(this.idle)}
 // Now and then the small star twinkles on its own, the way the ghost blinks.
 plan(){
  clearTimeout(this.idle);
  this.idle=setTimeout(()=>{
   if(!this.button.disabled&&!this.expanded&&!this.hover&&!document.hidden&&!reducedMotion()){
    this.twinkleUntil=performance.now()+TWINKLE.hold;
    this.wake();
    setTimeout(()=>this.wake(),TWINKLE.hold+20);
   }
   this.plan();
  },random(TWINKLE.every));
 }
 get expanded(){return this.hasAttribute('expanded')}
 defaultLabel(){return I18n.t('model')}
 activate(e){this.dispatchEvent(new CustomEvent('model-open',{bubbles:true,composed:true,detail:{keyboard:e.detail===0}}))}
 sync(){this.button.setAttribute('aria-haspopup','dialog');this.button.setAttribute('aria-expanded',String(this.expanded))}
 // Where the glyph sits on screen, so the stage can fly it out of the button and back.
 glyphRect(){return this.icon.getBoundingClientRect()}
 away(hidden){this.icon.classList.toggle('is-away',hidden)}
 targets(hover,reduced){return {hint:reduced?0:Math.max(hover,this.expanded?1:0),twinkle:!reduced&&performance.now()<this.twinkleUntil?1:0}}
 // On hover the big star turns a quarter and the small one hops along its orbit, swelling on the way.
 render(v){
  const h=v.hint,t=v.twinkle,swell=1+ORBIT.swell*Math.sin(Math.PI*Math.min(1,Math.max(0,h)))+TWINKLE.swell*t;
  this.turn=ORBIT.hover*h+TWINKLE.hop*t;
  this.big.setAttribute('transform',`rotate(${(ORBIT.spin*h).toFixed(2)} ${CENTER[0]} ${CENTER[1]}) translate(${CENTER[0]} ${CENTER[1]}) scale(${(1-TWINKLE.breath*t).toFixed(3)}) translate(${-CENTER[0]} ${-CENTER[1]})`);
  this.small.setAttribute('transform',`rotate(${this.turn.toFixed(2)} ${CENTER[0]} ${CENTER[1]}) translate(${SMALL[0]} ${SMALL[1]}) scale(${Math.max(0,swell).toFixed(3)}) translate(${-SMALL[0]} ${-SMALL[1]})`);
 }
}
if(!customElements.get('model-button'))customElements.define('model-button',ModelButton);
window.ModelGlyph = { glyph, turnOf };
})();
