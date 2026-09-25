(() => {
'use strict';

const SYMBOLS = {
 alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
 iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ',
 varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
 Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
 infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅', varnothing: '∅', hbar: 'ℏ',
 ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', prime: '′', degree: '°', angle: '∠', triangle: '△', square: '□', checkmark: '✓',
 ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dots: '…', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋',
 lceil: '⌈', rceil: '⌉', lvert: '|', rvert: '|', vert: '|', Vert: '‖', lbrace: '{', rbrace: '}', backslash: '∖',
 quad: '\u2003', qquad: '\u2003\u2003', ',': '\u2009', ':': '\u2005', ';': '\u2005', '>': '\u2005', '!': '', ' ': ' ',
 '{': '{', '}': '}', '%': '%', $: '$', '#': '#', '&': '&amp;', _: '_', '|': '‖',
};
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda',
 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega']);
const OPENERS = new Set(['langle', 'lfloor', 'lceil', 'lbrace', '{']);

const RELATIONS = {
 times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘', bullet: '•', oplus: '⊕', otimes: '⊗',
 le: '≤', leq: '≤', ge: '≥', geq: '≥', ll: '≪', gg: '≫', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', cong: '≅', sim: '∼',
 simeq: '≃', propto: '∝', to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
 Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', mapsto: '↦', longrightarrow: '⟶', longleftarrow: '⟵',
 uparrow: '↑', downarrow: '↓', in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
 cup: '∪', cap: '∩', setminus: '∖', land: '∧', wedge: '∧', lor: '∨', vee: '∨', neg: '¬', lnot: '¬', perp: '⊥',
 parallel: '∥', mid: '∣', nmid: '∤', models: '⊨', vdash: '⊢',
};
const REL = new Set(['=', '&lt;', '&gt;', '≤', '≥', '≪', '≫', '≠', '≈', '≡', '≅', '∼', '≃', '∝', '→', '←', '↔', '⇒', '⇐', '⇔', '↦', '⟶', '⟵',
 '↑', '↓', '∈', '∉', '∋', '⊂', '⊆', '⊃', '⊇', '∥', '∣', '∤', '⊨', '⊢', ':']);
const UNARY = new Set(['+', '−', '±', '∓']);
const BIG = { sum: '∑', prod: '∏', coprod: '∐', bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂', int: '∫', iint: '∬', iiint: '∭', oint: '∮' };
const INTEGRALS = new Set(['int', 'iint', 'iiint', 'oint']);

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth',
 'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'deg', 'gcd', 'lcm', 'mod', 'bmod',
 'arg', 'argmax', 'argmin', 'dim', 'ker', 'hom', 'Pr', 'sgn', 'tr', 'rank']);
const LIMITS = new Set(['lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'argmax', 'argmin']);

const TEXT = new Set(['text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt',
 'mathcal', 'mathbb', 'mathfrak', 'operatorname', 'mbox', 'hbox', 'boldsymbol', 'bm']);
const SILENT = new Set(['big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr',
 'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'middle', 'nonumber', 'notag']);
const ACCENTS = { vec: '\u20d7', hat: '\u0302', widehat: '\u0302', bar: '\u0304', overline: '\u0305', dot: '\u0307', ddot: '\u0308', tilde: '\u0303', widetilde: '\u0303' };
const SPACING_ACCENTS = { vec: '→', hat: 'ˆ', widehat: 'ˆ', dot: '˙', ddot: '¨', tilde: '˜', widetilde: '˜' };
const OPERATORS = { '=': '=', '<': '&lt;', '>': '&gt;', '+': '+', '-': '−', '*': '∗', '±': '±', '×': '×', '÷': '÷', '≤': '≤', '≥': '≥', '≠': '≠', '≈': '≈', '→': '→' };
const DOUBLE_STRUCK = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼' };
const DELIMS = {
 '(': 'paren-l', ')': 'paren-r', '[': 'bracket-l', ']': 'bracket-r', '\\{': 'brace-l', '\\}': 'brace-r', '\\lbrace': 'brace-l', '\\rbrace': 'brace-r',
 '|': 'bar', '\\|': 'dbar', '\\vert': 'bar', '\\lvert': 'bar', '\\rvert': 'bar', '\\Vert': 'dbar', '\\lVert': 'dbar', '\\rVert': 'dbar',
 '\\langle': 'angle-l', '\\rangle': 'angle-r', '.': '',
};
const ENVIRONMENTS = { pmatrix: ['paren-l', 'paren-r'], bmatrix: ['bracket-l', 'bracket-r'], Bmatrix: ['brace-l', 'brace-r'], vmatrix: ['bar', 'bar'], Vmatrix: ['dbar', 'dbar'], cases: ['brace-l', ''] };
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const escapeHtml = text => text.replace(/[&<>"]/g, c => ENTITIES[c]);
const isLetter = c => c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z';
const at = (p, word) => p.s.startsWith(word, p.i) && !isLetter(p.s[p.i + word.length] || '');

function operator(symbol, p) {
 const unary = UNARY.has(symbol) && (p.prev === 'start' || p.prev === 'op' || p.prev === 'open');
 p.prev = 'op';
 return `<span class="mo${unary ? ' is-unary' : REL.has(symbol) ? ' is-rel' : ''}">${symbol}</span>`;
}

function delimiter(token) {
 const kind = DELIMS[token];
 if (kind === '') return '';
 if (kind) return `<span class="mdl is-${kind}"></span>`;
 const name = token.replace(/^\\/, '');
 return `<span class="mdg">${token.startsWith('\\') ? SYMBOLS[name] || escapeHtml(name) : escapeHtml(token)}</span>`;
}

function fence(open, inner, close) {
 return `<span class="mdel">${open ? `<span class="mdl is-${open}"></span>` : ''}<span class="mdel-in">${inner}</span>${close ? `<span class="mdl is-${close}"></span>` : ''}</span>`;
}

function readDelimiter(p) {
 const s = p.s;
 while (s[p.i] === ' ') p.i++;
 if (s[p.i] !== '\\') return s[p.i++] || '.';
 let j = p.i + 1;
 if (isLetter(s[j])) while (j < s.length && isLetter(s[j])) j++;
 else j++;
 const token = s.slice(p.i, j);
 p.i = j;
 return token;
}

function raw(p) {
 const s = p.s;
 while (s[p.i] === ' ') p.i++;
 if (s[p.i] !== '{') return s[p.i++] || '';
 let depth = 0, start = ++p.i;
 for (; p.i < s.length; p.i++) {
  if (s[p.i] === '{') depth++;
  else if (s[p.i] === '}' && !depth--) break;
 }
 return s.slice(start, p.i++);
}

function arg(p) {
 const s = p.s;
 while (s[p.i] === ' ') p.i++;
 if (p.i >= s.length) return '';
 if (s[p.i] === '{') { p.i++; return seq(p, '}'); }
 return atom(p);
}

function scripts(p, base) {
 let sup = null, sub = null;
 while (p.s[p.i] === '^' || p.s[p.i] === '_') {
  const up = p.s[p.i] === '^';
  if ((up ? sup : sub) !== null) break;
  p.i++;
  p.prev = 'start';
  const body = arg(p);
  if (up) sup = body;
  else sub = body;
  while (p.s[p.i] === ' ') p.i++;
 }
 p.prev = 'ord';
 if (p.display && /^<span class="(mop|mn is-lim)/.test(base) && !base.includes('is-int')) {
  const slot = (cls, body, twin) => body !== null ? `<span class="${cls}">${body}</span>` : `<span class="${cls}" style="visibility:hidden" aria-hidden="true">${twin}</span>`;
  return `<span class="mlim">${slot('mlim-t', sup, sub)}<span class="mlim-o">${base}</span>${slot('mlim-b', sub, sup)}</span>`;
 }
 if (sup !== null && sub !== null) return `${base}<span class="mss${base.includes('is-int') ? ' is-int' : ''}"><span>${sup}</span><span>${sub}</span></span>`;
 return sup !== null ? `${base}<sup>${sup}</sup>` : `${base}<sub>${sub}</sub>`;
}

function seq(p, stop, halt = null) {
 let out = '', base = '';
 p.prev = 'start';
 while (p.i < p.s.length) {
  if (p.s[p.i] === stop) { p.i++; break; }
  if (halt && halt(p)) break;
  if (p.s[p.i] === '^' || p.s[p.i] === '_') { base = scripts(p, base); continue; }
  const next = atom(p);
  if (!next) continue;
  out += base;
  base = next;
 }
 p.prev = 'ord';
 return out + base;
}

function environment(p, name) {
 if (name === 'array' || name === 'alignedat') raw(p);
 const cell = q => q.s[q.i] === '&' || q.s.startsWith('\\\\', q.i) || at(q, '\\end');
 const rows = [[]];
 while (p.i < p.s.length) {
  rows[rows.length - 1].push(seq(p, null, cell));
  if (p.s[p.i] === '&') { p.i++; continue; }
  if (p.s.startsWith('\\\\', p.i)) { p.i += 2; rows.push([]); continue; }
  if (at(p, '\\end')) { p.i += 4; raw(p); }
  break;
 }
 while (rows.length > 1 && rows[rows.length - 1].every(c => !c)) rows.pop();
 const cols = Math.max(...rows.map(r => r.length));
 const kind = name.startsWith('align') || name === 'split' || name === 'eqnarray' ? ' is-align' : name === 'cases' ? ' is-cases' : '';
 const cellHtml = (c, k) => `<span${kind === ' is-align' ? ` class="${k % 2 ? 'is-l' : 'is-r'}"` : ''}>${c}</span>`;
 const grid = `<span class="mgrid${kind}" style="--c:${cols}">${rows.map(r => [...r, ...Array(cols - r.length).fill('')].map(cellHtml).join('')).join('')}</span>`;
 p.prev = 'ord';
 const pair = ENVIRONMENTS[name];
 return pair ? fence(pair[0], grid, pair[1]) : grid;
}

function command(p) {
 const s = p.s;
 let j = ++p.i;
 if (isLetter(s[j])) while (j < s.length && isLetter(s[j])) j++;
 else j++;
 const name = s.slice(p.i, j);
 p.i = j;
 if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
  const top = arg(p), bottom = arg(p);
  p.prev = 'ord';
  return `<span class="mf"><span>${top}</span><span>${bottom}</span></span>`;
 }
 if (name === 'binom') {
  const top = arg(p), bottom = arg(p);
  p.prev = 'ord';
  return fence('paren-l', `<span class="mf is-bare"><span>${top}</span><span>${bottom}</span></span>`, 'paren-r');
 }
 if (name === 'sqrt') {
  let index = '';
  if (s[p.i] === '[') {
   const end = s.indexOf(']', p.i);
   index = render(s.slice(p.i + 1, end < 0 ? s.length : end));
   p.i = end < 0 ? s.length : end + 1;
  }
  const body = arg(p);
  p.prev = 'ord';
  return `${index ? `<sup class="mx">${index}</sup>` : ''}<span class="ms"><span class="ms-in">${body}</span></span>`;
 }
 if (name === 'left') {
  const open = readDelimiter(p);
  const inner = seq(p, null, q => at(q, '\\right'));
  let close = '.';
  if (at(p, '\\right')) { p.i += 6; close = readDelimiter(p); }
  p.prev = 'ord';
  return `<span class="mdel">${delimiter(open)}<span class="mdel-in">${inner}</span>${delimiter(close)}</span>`;
 }
 if (name === 'right') { readDelimiter(p); return ''; }
 if (TEXT.has(name)) {
  const body = raw(p);
  p.prev = 'ord';
  if (name === 'mathbb') return [...body].map(c => DOUBLE_STRUCK[c] || c).join('');
  const html = name.startsWith('text') || name === 'mbox' || name === 'hbox' ? escapeHtml(body) : render(body);
  return `<span class="mt${/bf|bold|bm/.test(name) ? ' is-bold' : ''}">${html}</span>`;
 }
 if (name === 'begin') return environment(p, raw(p));
 if (name === 'end') { raw(p); return ''; }
 if (name === '\\' || name === 'newline' || name === 'cr') { p.prev = 'start'; return '<br>'; }
 if (SILENT.has(name)) {
  if (s[p.i] === '.') p.i++;
  return '';
 }
 if (name in ACCENTS) {
  const body = arg(p);
  p.prev = 'ord';
  const one = /^<i>([^<])<\/i>$/.exec(body) || /^([^<&])$/.exec(body);
  if (one && name !== 'vec' && !name.startsWith('wide') && name !== 'overline') return one[0] === body && body.startsWith('<i>') ? `<i>${one[1]}${ACCENTS[name]}</i>` : one[1] + ACCENTS[name];
  if (name === 'bar' || name === 'overline') return `<span class="ma is-bar">${body}</span>`;
  return `<span class="ma${name === 'vec' ? ' is-vec' : ''}" data-a="${SPACING_ACCENTS[name]}">${body}</span>`;
 }
 if (name in BIG) {
  p.prev = 'op';
  return `<span class="mop${p.display ? ' is-display' : ''}${INTEGRALS.has(name) ? ' is-int' : ''}">${BIG[name]}</span>`;
 }
 if (name in RELATIONS) return operator(RELATIONS[name], p);
 if (name in SYMBOLS) {
  const symbol = SYMBOLS[name];
  if (/^[\s\u2000-\u200a]*$/.test(symbol)) return symbol;
  p.prev = OPENERS.has(name) ? 'open' : 'ord';
  return GREEK.has(name) ? `<i>${symbol}</i>` : symbol;
 }
 if (FUNCTIONS.has(name)) {
  p.prev = 'op';
  return `<span class="mn${LIMITS.has(name) ? ' is-lim' : ''}">${name}</span>`;
 }
 p.prev = 'ord';
 return escapeHtml(name);
}

function atom(p) {
 const s = p.s, c = s[p.i];
 if (c === '\\') return command(p);
 if (c === '{') { p.i++; return seq(p, '}'); }
 if (c === '}') { p.i++; return ''; }
 if (c === '^' || c === '_') return scripts(p, '');
 if (c === '&') { p.i++; p.prev = 'start'; return '<span class="mg"></span>'; }
 if (c === ' ' || c === '\n' || c === '\t' || c === '~') { p.i++; return c === '~' ? ' ' : ''; }
 if (c in OPERATORS) { p.i++; return operator(OPERATORS[c], p); }
 p.i++;
 if (isLetter(c)) { p.prev = 'ord'; return `<i>${c}</i>`; }
 if (c === "'") { p.prev = 'ord'; return '′'; }
 p.prev = c === '(' || c === '[' || c === ',' ? 'open' : c === ';' ? 'op' : 'ord';
 return escapeHtml(c);
}

function render(source, { display = false } = {}) {
 const p = { s: source, i: 0, display, prev: 'start' };
 return seq(p, null);
}

window.Tex = { render };
})();
