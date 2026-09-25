(() => {
'use strict';

const TEETH = 6;
const HOVER_TURN = 360 / TEETH;

const gearPath = (() => {
 const outer = 22, inner = 16.5, step = 2 * Math.PI / TEETH, top = step * 0.15, base = step * 0.24;
 const at = (r, a) => `${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`;
 let d = '';
 for (let i = 0; i < TEETH; i++) {
  const a = i * step - Math.PI / 2;
  d += `${i ? 'L' : 'M'}${at(inner, a - base)}L${at(outer, a - top)}A${outer} ${outer} 0 0 1 ${at(outer, a + top)}L${at(inner, a + base)}A${inner} ${inner} 0 0 1 ${at(inner, a + step - base)}`;
 }
 return d + 'Z';
})();

class SettingsButton extends IconButton {
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="gear" stroke="currentColor" stroke-linejoin="round">
      <path d="${gearPath}"/>
      <circle cx="60" cy="60" r="7"/>
     </g>
    </g>
   </svg><span class="label"><slot></slot></span>`,{turn:[170,22]},`
   :host{width:auto}
   button{display:flex;align-items:center;gap:6px;padding:0 12px 0 5px;border-radius:calc(var(--icon-button-size,32px)/2);font:inherit;font-size:var(--sidebar-font-size,14px);white-space:nowrap}
   .gear{stroke-width:var(--icon-stroke,6)}
   .label{opacity:var(--icon-opacity,.55);transition:opacity .2s ease}
   button:hover .label,button:focus-visible .label{opacity:var(--icon-hover-opacity,.85)}`);
  this.gear=this.shadowRoot.querySelector('.gear');
 }
 defaultLabel(){return I18n.t('settings')}
 activate(){this.dispatchEvent(new CustomEvent('settings-open',{bubbles:true,composed:true}))}
 targets(hover,reduced){return {turn:reduced?0:hover}}
 render(v){this.gear.setAttribute('transform',`rotate(${v.turn*HOVER_TURN} 60 60)`)}
}
if(!customElements.get('settings-button'))customElements.define('settings-button',SettingsButton);
})();
