(() => {
'use strict';

// Settings → Usage. On top, the tokens sent and written back today, over 7 and 30 days and all the time, each split by provider,
// and a column for each of the last 30 days. Below, a section for every provider in use: for the ChatGPT sign-in its plan and
// limits as ChatGPT counts them, for DeepSeek the balance on the account, and for each the tokens, the cache and the models.
const PERIODS = [['today', 1], ['week', 7], ['month', 30], ['all', 0]];
const ORDER = ['chatgpt', 'openai', 'anthropic', 'deepseek', 'opencode'];
const TONES = { chatgpt: 'turquoise', openai: 'lilac', anthropic: 'orange', deepseek: 'blue', opencode: 'green' };
const PLANS = {
 free: 'Free', go: 'Go', plus: 'Plus', prolite: 'Pro 5x', pro: 'Pro 20x', team: 'Team', business: 'Business',
 self_serve_business_usage_based: 'Business', enterprise: 'Enterprise', enterprise_cbp_usage_based: 'Enterprise', edu: 'Edu',
};
const CHART_DAYS = 30;
const REFRESH = 60000;
const COUNT_TIME = 700;
const ENTER_TIME = 1400;
const HOUR = 3600, DAY = 86400;
// The highlight on the chart moves on the sidebar's springs, so it feels the same as along the chats.
const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
const FLIP_TIME = 700;
const CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const compact = n => new Intl.NumberFormat(I18n.lang, { notation: 'compact', maximumFractionDigits: n < 1000 ? 0 : 1 }).format(n);
const full = n => new Intl.NumberFormat(I18n.lang).format(n);
const easeOut = t => 1 - (1 - t) ** 3;
const nameOf = provider => I18n.t(`usage.name.${provider}`);
const dateOf = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
const monthName = key => new Intl.DateTimeFormat(I18n.lang, { month: 'long', year: 'numeric' }).format(dateOf(`${key}-01`));

// Months written YYYY-MM from `to` back to `from`, newest first, twenty years at most.
function monthsBack(from, to) {
 const out = [];
 let [year, month] = to.split('-').map(Number);
 while (out.length < 240) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (key < from) break;
  out.push(key);
  if (--month < 1) { month = 12; year--; }
 }
 return out;
}

function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

// A limit's window named by how long it runs: 5 hours, week, month; whatever ChatGPT sends, even a length no plan has today.
function windowName(seconds) {
 if (seconds >= 27 * DAY && seconds <= 32 * DAY) return I18n.t('usage.window.month');
 if (seconds === 7 * DAY) return I18n.t('usage.window.week');
 if (seconds === DAY) return I18n.t('usage.window.day');
 if (seconds > DAY && seconds % DAY === 0) return I18n.t('usage.window.days', { n: seconds / DAY });
 if (seconds >= HOUR && seconds % HOUR === 0) return I18n.t('usage.window.hours', { n: seconds / HOUR });
 return I18n.t('usage.window.minutes', { n: Math.max(1, Math.round(seconds / 60)) });
}

// When a limit starts over: in minutes or hours while it is close, then the day and the time.
function resetText(at) {
 if (!at) return '';
 const left = at - Date.now();
 if (left < 60000) return I18n.t('usage.reset.soon');
 const minutes = Math.round(left / 60000);
 if (minutes < 60) return I18n.t('usage.reset.minutes', { m: minutes });
 if (minutes < 24 * 60) return I18n.t('usage.reset.hours', { h: Math.floor(minutes / 60), m: minutes % 60 });
 const near = left < 6 * DAY * 1000;
 const when = new Intl.DateTimeFormat(I18n.lang, near ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at);
 return I18n.t('usage.reset.at', { when });
}

// A thin bar split between the providers in their colors, each as wide as its share.
function split(totals) {
 const parts = ORDER.filter(provider => totals[provider]?.tokens);
 if (!parts.length) return '<span class="usage-split is-empty"></span>';
 return `<span class="usage-split">${parts.map(provider => `<i class="t-${TONES[provider]}" style="flex-grow:${totals[provider].tokens}"></i>`).join('')}</span>`;
}

// A limit window as a row: its name, a meter of how much is used, the share, and when it starts over.
function limitRow(span, name = windowName(span.seconds), extra = '') {
 const used = Math.round(span.used), level = used >= 100 ? ' is-full' : used >= 80 ? ' is-high' : '';
 const reset = resetText(span.resets);
 return `
  <div class="usage-limit${level}${extra}">
   <span class="usage-limit-name">${escapeHtml(name)}</span>
   <span class="usage-meter"><i style="--used:${Math.min(1, span.used / 100)}"></i></span>
   <span class="usage-limit-used">${used}%</span>
   <span class="usage-limit-reset">${escapeHtml(used >= 100 ? [I18n.t('usage.reached'), reset].filter(Boolean).join(' · ') : reset)}</span>
  </div>`;
}

class UsageSettings {
 constructor({ root, settings, dialog }) {
  this.root = root;
  this.settings = settings;
  this.dialog = dialog;
  this.limits = { state: 'idle', data: null };
  this.balance = null;
  this.visible = false;
  this.timer = 0;
  this.entering = 0;
  // The chart's highlight and its tip: where they stand, how wide the highlight is, how much they show.
  this.g = { x: [0, 0], w: [0, 0], tip: [0, 0], o: [0, 0] };
  this.pointed = -1;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  // What the chart shows: '' for the last 30 days, or a month written YYYY-MM.
  this.scope = '';
  this.flipping = 0;
  const sync = () => this.sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  Usage.onChange(() => { if (this.visible) this.render(false); });
  root.addEventListener('pointermove', event => this.point(event));
  root.addEventListener('pointerleave', () => this.point(null));
  root.addEventListener('click', event => {
   const nav = event.target.closest('.usage-nav');
   if (nav && !nav.disabled) this.step(Number(nav.dataset.step));
  });
 }

 // What the chart can show: the last 30 days, then this month and every month before it back to the first one counted.
 scopes() {
  const months = Usage.months();
  return ['', ...(months.length ? monthsBack(months[0], Usage.thisMonth) : [])];
 }

 // One step back or forward in time: the chart's days rise anew, and the numbers under it are that month's.
 step(delta) {
  const scopes = this.scopes(), next = scopes[scopes.indexOf(this.scope) + delta];
  if (next === undefined) return;
  this.scope = next;
  this.pointed = -1;
  this.g.o = [0, 0];
  this.render(false);
  if (reducedMotion()) return;
  this.root.classList.add('is-flipping');
  clearTimeout(this.flipping);
  this.flipping = setTimeout(() => this.root.classList.remove('is-flipping'), FLIP_TIME);
 }

 sync() {
  const visible = this.dialog.open && !this.root.hidden;
  if (visible === this.visible) return;
  this.visible = visible;
  clearInterval(this.timer);
  this.timer = 0;
  if (!visible) {
   this.pointed = -1;
   this.g.o = [0, 0];
   return;
  }
  Usage.ready.then(() => {
   if (!this.visible) return;
   this.scope = '';
   this.render(true);
   this.refresh();
   this.timer = setInterval(() => this.refresh(), REFRESH);
  });
 }

 connected(provider) {
  return provider === 'chatgpt' ? !!this.settings.account.connected : this.settings.connected(provider);
 }

 refresh() {
  this.loadLimits();
  this.loadBalance();
 }

 async loadLimits() {
  const auth = window.openghost?.auth;
  if (!auth?.limits || !this.settings.account.connected) {
   this.limits = { state: 'idle', data: null };
   return;
  }
  if (this.limits.state !== 'ready') this.limits = { state: 'loading', data: null };
  const reply = await auth.limits().catch(() => null);
  if (!this.visible) return;
  const fresh = this.limits.state !== 'ready';
  this.limits = reply?.limits ? { state: 'ready', data: reply.limits } : { state: 'error', data: this.limits.data };
  this.paintLimits(fresh);
 }

 async loadBalance() {
  const key = this.settings.keys.deepseek;
  if (!key) { this.balance = null; return; }
  const list = await DeepSeek.balance(key).catch(() => null);
  if (!this.visible || !list) return;
  this.balance = list;
  this.paintBalance();
 }

 render(animate) {
  const periods = PERIODS.map(([name, days]) => ({ name, totals: Usage.totals(days) }));
  const all = periods[periods.length - 1].totals;
  const providers = ORDER.filter(provider => all[provider] || this.connected(provider));
  if (!this.scopes().includes(this.scope)) this.scope = '';
  const month = this.scope ? Usage.between(`${this.scope}-01`, `${this.scope}-31`) : null;
  this.root.innerHTML = `
   <p class="settings-lead">${escapeHtml(I18n.t('usage.lead'))}</p>
   ${this.summary(periods)}
   ${providers.map(provider => month ? this.monthSection(provider, month[provider]) : this.section(provider, periods)).join('')}`;
  this.paintLimits(animate);
  this.paintBalance();
  // Drawn anew under the pointer, the chart gets its highlight and tip back where they were.
  if (this.pointed >= 0) {
   this.fillTip(this.pointed);
   this.wake();
  }
  if (!animate || reducedMotion()) return;
  this.root.classList.add('is-entering');
  clearTimeout(this.entering);
  this.entering = setTimeout(() => this.root.classList.remove('is-entering'), ENTER_TIME);
  for (const el of this.root.querySelectorAll('.usage-period-value')) this.countUp(el, Number(el.dataset.value));
 }

 summary(periods) {
  const scope = this.scope, scopes = this.scopes(), at = scopes.indexOf(scope);
  const days = scope ? Usage.month(scope) : Usage.daily(CHART_DAYS), sums = days.map(day => Object.values(day.providers).reduce((sum, n) => sum + n, 0));
  const shown = scope ? Usage.between(`${scope}-01`, `${scope}-31`) : Usage.totals(CHART_DAYS);
  const top = Math.max(1, ...sums), since = Usage.since, total = sums.reduce((sum, n) => sum + n, 0);
  // The legend names the providers of the days on the chart, each with its share of them.
  const legend = ORDER.filter(provider => shown[provider]?.tokens).map(provider => `<span class="usage-key t-${TONES[provider]}"><i></i>${escapeHtml(nameOf(provider))}<b>${escapeHtml(compact(shown[provider].tokens))}</b></span>`).join('');
  const columns = days.map((day, k) => {
   const parts = ORDER.filter(provider => day.providers[provider]).map(provider => `<i class="t-${TONES[provider]}" style="flex-grow:${day.providers[provider]}"></i>`).join('');
   const height = sums[k] ? Math.max(0.04, sums[k] / top) : 0;
   return `<span class="usage-day${sums[k] ? '' : ' is-empty'}" data-k="${k}" style="--h:${height.toFixed(3)};--k:${k}"><span class="usage-day-bar">${parts}</span></span>`;
  }).join('');
  const format = new Intl.DateTimeFormat(I18n.lang, { month: 'short', day: 'numeric' });
  const ends = scope ? [format.format(dateOf(days[0].day)), format.format(dateOf(days[days.length - 1].day))] : [format.format(dateOf(days[0].day)), I18n.t('usage.today')];
  const nav = (step, label, disabled) => `<button type="button" class="usage-nav${step < 0 ? ' is-later' : ''}" data-step="${step}" aria-label="${escapeHtml(I18n.t(label))}"${disabled ? ' disabled' : ''}>${CHEVRON}</button>`;
  this.days = days;
  this.sums = sums;
  return `
   <section class="usage-summary">
    <div class="usage-periods">
     ${periods.map(({ name, totals }, k) => {
      const total = Object.values(totals).reduce((sum, item) => sum + item.tokens, 0);
      return `
       <div class="usage-period" style="--k:${k}">
        <span class="usage-period-name">${escapeHtml(I18n.t(`usage.${name}`))}</span>
        <span class="usage-period-value" data-value="${total}" title="${escapeHtml(I18n.t('usage.tokens', { n: full(total) }))}">${compact(total)}</span>
        ${split(totals)}
       </div>`;
     }).join('')}
    </div>
    <div class="usage-range">
     <span class="usage-range-title">${escapeHtml(scope ? monthName(scope) : I18n.t('usage.last30'))}</span>
     <span class="usage-range-total" title="${escapeHtml(I18n.t('usage.tokens', { n: full(total) }))}">${escapeHtml(I18n.t('usage.tokens', { n: compact(total) }))}</span>
     <span class="usage-range-nav">${nav(1, 'usage.earlier', at >= scopes.length - 1)}${nav(-1, 'usage.later', at <= 0)}</span>
    </div>
    <div class="usage-chart" aria-hidden="true">
     <div class="usage-chart-plot"><span class="usage-chart-glide"></span>${columns}</div>
     <div class="usage-chart-axis"><span>${escapeHtml(ends[0])}</span><span>${escapeHtml(ends[1])}</span></div>
     <div class="usage-tip"></div>
    </div>
    <div class="usage-foot">
     <span class="usage-legend">${legend}</span>
     <span class="usage-since">${escapeHtml(since ? I18n.t('usage.since', { date: new Intl.DateTimeFormat(I18n.lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(since) }) : I18n.t('usage.start'))}</span>
    </div>
   </section>`;
 }

 // A provider over time: its tokens today, over 7 and 30 days and all the time, then what the whole of it was made of.
 section(provider, periods) {
  const all = periods[periods.length - 1].totals[provider];
  if (!all?.tokens) return this.frame(provider, `<p class="usage-empty">${escapeHtml(I18n.t('usage.none'))}</p>`);
  const cells = periods.map(({ name, totals }) => [I18n.t(`usage.${name}`), totals[provider]?.tokens || 0]);
  return this.frame(provider, `${this.cells(cells)}${this.details(all, [
   I18n.t('usage.input', { n: compact(all.input) }),
   ...this.cache(all),
   I18n.t('usage.output', { n: compact(all.output) }),
   I18n.t(all.requests === 1 ? 'usage.request' : 'usage.requests', { n: full(all.requests) }),
  ])}`);
 }

 // A provider in the month on the chart: its tokens, what it was sent and wrote back, its requests, the cache and the models.
 monthSection(provider, month) {
  if (!month?.tokens) return this.frame(provider, `<p class="usage-empty">${escapeHtml(I18n.t('usage.nothing', { month: monthName(this.scope) }))}</p>`);
  const cells = [[I18n.t('usage.cell.tokens'), month.tokens], [I18n.t('usage.cell.input'), month.input], [I18n.t('usage.cell.output'), month.output], [I18n.t('usage.cell.requests'), month.requests, true]];
  return this.frame(provider, `${this.cells(cells)}${this.details(month, this.cache(month))}`);
 }

 cache(totals) {
  const share = totals.input ? Math.round(totals.cached / totals.input * 100) : 0;
  return share ? [I18n.t('usage.cache', { n: share })] : [];
 }

 // Four numbers side by side; a count is shown whole, tokens in short.
 cells(cells) {
  return `<div class="usage-stats">${cells.map(([name, value, count]) => `
   <div class="usage-stat">
    <span class="usage-stat-name">${escapeHtml(name)}</span>
    <span class="usage-stat-value" title="${escapeHtml(count ? full(value) : I18n.t('usage.tokens', { n: full(value) }))}">${count ? full(value) : compact(value)}</span>
   </div>`).join('')}</div>`;
 }

 // Under the numbers: one model is named among the facts; with several, each gets a bar of its share.
 details(totals, facts) {
  // Every model used, the busiest first.
  const models = Object.entries(totals.models).sort((a, b) => b[1] - a[1]);
  const lines = [...(models.length === 1 ? [Usage.nameOf(models[0][0])] : []), ...facts];
  const list = models.length < 2 ? '' : `
   <div class="usage-models">
    ${models.map(([id, tokens]) => `
     <div class="usage-model">
      <span class="usage-model-name">${escapeHtml(Usage.nameOf(id))}</span>
      <span class="usage-model-bar"><i style="--share:${(tokens / totals.tokens).toFixed(3)}"></i></span>
      <span class="usage-model-value" title="${escapeHtml(I18n.t('usage.tokens', { n: full(tokens) }))}">${compact(tokens)}</span>
     </div>`).join('')}
   </div>`;
  return `${lines.length ? `<p class="usage-facts${list ? '' : ' is-last'}">${lines.map(line => `<span>${escapeHtml(line)}</span>`).join('')}</p>` : ''}${list}`;
 }

 frame(provider, body) {
  const on = this.connected(provider);
  return `
   <section class="provider usage-provider t-${TONES[provider]}${on ? '' : ' is-off'}" data-provider="${provider}">
    <header class="provider-head">
     <h3 class="provider-name">${escapeHtml(nameOf(provider))}</h3>
     <span class="usage-account" data-slot="account" hidden><span class="usage-account-label"></span><span class="usage-account-value"></span></span>
     ${on ? '' : `<span class="provider-state">${escapeHtml(I18n.t('usage.off'))}</span>`}
    </header>
    ${provider === 'chatgpt' && on ? '<div class="usage-limits"></div>' : ''}
    ${body}
   </section>`;
 }

 // The subscription's limits, each window as ChatGPT counts it; while they load, two quiet rows hold their place.
 paintLimits(animate) {
  const box = this.root.querySelector('.usage-limits');
  if (!box) return;
  const { state, data } = this.limits;
  if (data?.plan) this.account('chatgpt', I18n.t('usage.plan'), PLANS[data.plan] || data.plan.charAt(0).toUpperCase() + data.plan.slice(1));
  if (!data) {
   box.innerHTML = state === 'error' ? `<p class="usage-note">${escapeHtml(I18n.t('usage.limits.error'))}</p>`
    : '<div class="usage-limit is-waiting"><span></span></div><div class="usage-limit is-waiting"><span></span></div>';
   return;
  }
  const rows = [
   ...data.windows.map(span => limitRow(span)),
   ...data.models.flatMap(model => model.windows.map(span => limitRow(span, `${model.name} · ${windowName(span.seconds)}`, ' is-model'))),
  ];
  const credits = data.credits ? `<p class="usage-note">${escapeHtml(data.credits.unlimited ? I18n.t('usage.credits.unlimited') : I18n.t('usage.credits', { n: data.credits.balance }))}</p>` : '';
  box.innerHTML = (rows.length ? rows.join('') : `<p class="usage-note">${escapeHtml(I18n.t('usage.limits.none'))}</p>`) + credits;
  box.classList.toggle('is-filling', !!animate && !reducedMotion());
 }

 // DeepSeek's own figure for what is left on the account.
 paintBalance() {
  if (!this.balance?.length) return;
  const amount = this.balance.map(item => new Intl.NumberFormat(I18n.lang, { style: 'currency', currency: item.currency }).format(item.total)).join(' · ');
  this.account('deepseek', I18n.t('usage.balance'), amount);
 }

 // A fact about the account at the right of the provider's name: a quiet label and its value.
 account(provider, label, value) {
  const slot = this.root.querySelector(`.usage-provider[data-provider="${provider}"] [data-slot="account"]`);
  if (!slot) return;
  slot.querySelector('.usage-account-label').textContent = label;
  slot.querySelector('.usage-account-value').textContent = value;
  slot.hidden = false;
 }

 // The big numbers run up to their value as the page comes in.
 countUp(el, value) {
  if (!value) return;
  const start = performance.now();
  const step = now => {
   const t = Math.min(1, (now - start) / COUNT_TIME);
   el.textContent = compact(Math.round(value * easeOut(t)));
   if (t < 1 && el.isConnected) requestAnimationFrame(step);
   else el.textContent = compact(value);
  };
  requestAnimationFrame(step);
 }

 // The day under the pointer is the column nearest to it anywhere over the chart, the gaps between columns included,
 // so on its way from one day to the next the highlight never drops out.
 point(event) {
  const plot = event && this.root.querySelector('.usage-chart-plot'), count = this.days?.length || 0;
  let k = -1;
  if (plot && count) {
   const box = plot.getBoundingClientRect(), { clientX: x, clientY: y } = event;
   if (x >= box.left - 4 && x <= box.right + 4 && y >= box.top - 10 && y <= box.bottom + 24) {
    k = Math.max(0, Math.min(count - 1, Math.floor((x - box.left) / (box.width / count))));
   }
  }
  if (k === this.pointed) return;
  this.pointed = k;
  if (k >= 0) this.fillTip(k);
  this.wake();
 }

 // What each provider used that day, above the highlight.
 fillTip(k) {
  const tip = this.root.querySelector('.usage-tip'), day = this.days?.[k];
  if (!tip || !day) return;
  const rows = ORDER.filter(provider => day.providers[provider]).map(provider => `<span class="usage-tip-row t-${TONES[provider]}"><i></i>${escapeHtml(nameOf(provider))}<b>${escapeHtml(compact(day.providers[provider]))}</b></span>`).join('');
  const date = new Intl.DateTimeFormat(I18n.lang, { weekday: 'short', month: 'short', day: 'numeric' }).format(dateOf(day.day));
  tip.innerHTML = `<span class="usage-tip-head">${escapeHtml(date)}</span><span class="usage-tip-total">${escapeHtml(this.sums[k] ? I18n.t('usage.tokens', { n: full(this.sums[k]) }) : I18n.t('usage.idle'))}</span>${rows}`;
 }

 wake() {
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 // The highlight and the tip spring to the day pointed at; coming in, they appear right there and fade up instead of sliding in.
 tick(now) {
  this.raf = 0;
  const chart = this.root.querySelector('.usage-chart');
  if (!chart) return;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032), g = this.g, still = reducedMotion();
  this.last = now;
  const glide = chart.querySelector('.usage-chart-glide'), tip = chart.querySelector('.usage-tip'), plot = chart.querySelector('.usage-chart-plot');
  const column = this.pointed >= 0 ? plot.querySelectorAll('.usage-day')[this.pointed] : null;
  let moving = false;
  if (column) {
   const x = column.offsetLeft, w = column.offsetWidth + 4, width = tip.offsetWidth;
   const at = Math.max(0, Math.min(chart.clientWidth - width, plot.offsetLeft + x + column.offsetWidth / 2 - width / 2));
   if (still || g.o[0] < 0.02) { g.x = [x, 0]; g.w = [w, 0]; g.tip = [at, 0]; }
   else {
    moving = spring(g.x, x, GLIDE_SPRING, dt) || moving;
    moving = spring(g.w, w, GLIDE_SPRING, dt) || moving;
    moving = spring(g.tip, at, GLIDE_SPRING, dt) || moving;
   }
  }
  if (still) g.o = [column ? 1 : 0, 0];
  else moving = spring(g.o, column ? 1 : 0, FADE_SPRING, dt) || moving;
  const o = Math.min(1, Math.max(0, g.o[0]));
  glide.style.transform = `translateX(${g.x[0].toFixed(2)}px)`;
  glide.style.width = `${Math.max(0, g.w[0]).toFixed(2)}px`;
  glide.style.opacity = o.toFixed(3);
  tip.style.transform = `translate(${g.tip[0].toFixed(2)}px, ${((1 - o) * 4).toFixed(2)}px)`;
  tip.style.opacity = o.toFixed(3);
  tip.classList.toggle('is-shown', o >= 0.001);
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }
}

window.UsageSettings = UsageSettings;
})();
