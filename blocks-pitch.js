(() => {
// Sports widgets in the agent's replies, added to the live widgets of blocks.js.
//   pitch:   a tactics board for football, ice hockey, basketball or rugby. Both teams placed by the app from their
//            formations (or where the agent puts them, from words or a photo), phases and steps that play, players
//            dragged by hand with everything that depends on them worked out again at once: the sport's rule (offside,
//            the blue line, the ball line, a shot from beyond the arc), a pass with a man in its way, the gaps.
//   players: players compared by their numbers: a web of the ratings when they are ratings, bars otherwise.
// Every ground is in metres: x along the attack from our end (0) to theirs, y from our left side (0) to our right. It
// is drawn with our end on the left, so our left side is at the top.
const Blocks = window.Blocks;
if (!Blocks?.add) return;
const ease = k => 1 - (1 - k) ** 3;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lab = text => `<span class="bk-t">${esc(text)}</span>`;
const NS = 'http://www.w3.org/2000/svg';

const WORDS = {
 ru: { you: 'Ты', us: 'Наши', them: 'Соперник', attack: 'атака', offside: 'офсайд', cut: 'перехват', m: 'м', need: 'нужно {a}–{b}', step: 'Шаг {n} из {m}', start: 'Начало', reset: 'Сбросить', ask: 'Спросить агента', redo: 'Разобрать {f}', madeFor: 'Фазы разобраны для {f}.', against: 'против', play: 'Запустить', pause: 'Пауза', formation: 'Схема',
  moved: 'Я передвинул игроков {where} «{title}», фаза «{phase}»: {list}. Что это меняет и как теперь играть?', movedOne: '{team} {who} → x {x}, y {y}', ours: 'наш', theirs: 'их', redoAsk: 'Покажи то же самое для схемы {us} против {them}.', compare: 'Сравнить', best: 'лучше', per: 'за 90 мин',
  onPitch: 'на поле', onRink: 'на площадке', onCourt: 'на площадке', onField: 'на поле', outOfPlay: 'вне игры', ballLine: 'линия мяча', forward: 'вперёд', three: '3 очка', two: '2 очка', open: 'свободен', guarded: 'под опекой' },
 en: { you: 'You', us: 'Us', them: 'Opponent', attack: 'attack', offside: 'offside', cut: 'cut out', m: 'm', need: 'aim {a}–{b}', step: 'Step {n} of {m}', start: 'Start', reset: 'Reset', ask: 'Ask the agent', redo: 'Explain {f}', madeFor: 'The phases are for {f}.', against: 'vs', play: 'Play', pause: 'Pause', formation: 'Formation',
  moved: 'I moved players {where} “{title}”, phase “{phase}”: {list}. What does it change and how should we play now?', movedOne: '{team} {who} → x {x}, y {y}', ours: 'our', theirs: 'their', redoAsk: 'Show the same for {us} against {them}.', compare: 'Compare', best: 'better', per: 'per 90',
  onPitch: 'on the pitch', onRink: 'on the rink', onCourt: 'on the court', onField: 'on the field', outOfPlay: 'offside', ballLine: 'ball line', forward: 'forward', three: '3 pts', two: '2 pts', open: 'open', guarded: 'guarded' },
 it: { you: 'Tu', us: 'Noi', them: 'Avversari', attack: 'attacco', offside: 'fuorigioco', cut: 'intercetto', m: 'm', need: 'meglio {a}–{b}', step: 'Passo {n} di {m}', start: 'Inizio', reset: 'Azzera', ask: "Chiedi all'agente", redo: 'Spiega il {f}', madeFor: 'Le fasi sono per il {f}.', against: 'contro', play: 'Avvia', pause: 'Pausa', formation: 'Modulo',
  moved: 'Ho spostato i giocatori {where} «{title}», fase «{phase}»: {list}. Cosa cambia e come giochiamo ora?', movedOne: '{team} {who} → x {x}, y {y}', ours: 'nostro', theirs: 'loro', redoAsk: 'Mostra lo stesso per il {us} contro il {them}.', compare: 'Confronta', best: 'meglio', per: 'per 90′',
  onPitch: 'sul campo', onRink: 'sulla pista', onCourt: 'sul campo', onField: 'sul campo', outOfPlay: 'fuorigioco', ballLine: 'linea della palla', forward: 'in avanti', three: 'da 3', two: 'da 2', open: 'libero', guarded: 'marcato' },
 fr: { you: 'Toi', us: 'Nous', them: 'Adversaire', attack: 'attaque', offside: 'hors-jeu', cut: 'interception', m: 'm', need: 'idéal {a}–{b}', step: 'Étape {n} sur {m}', start: 'Début', reset: 'Réinitialiser', ask: "Demander à l'agent", redo: 'Expliquer le {f}', madeFor: 'Les phases sont pour le {f}.', against: 'contre', play: 'Lancer', pause: 'Pause', formation: 'Système',
  moved: 'J’ai déplacé des joueurs {where} « {title} », phase « {phase} » : {list}. Qu’est-ce que ça change et comment jouer maintenant ?', movedOne: '{team} {who} → x {x}, y {y}', ours: 'notre', theirs: 'leur', redoAsk: 'Montre la même chose pour le {us} contre le {them}.', compare: 'Comparer', best: 'mieux', per: 'par 90 min',
  onPitch: 'sur le terrain', onRink: 'sur la glace', onCourt: 'sur le terrain', onField: 'sur le terrain', outOfPlay: 'hors-jeu', ballLine: 'ligne du ballon', forward: 'en avant', three: '3 pts', two: '2 pts', open: 'seul', guarded: 'marqué' },
};
const lang = () => (window.I18n?.lang && WORDS[I18n.lang] ? I18n.lang : 'en');
const say = (key, vars = {}) => String(WORDS[lang()][key] ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
// A name made plain for matching: "Zone 2-3", "зона 2–3" and "zone23" are one.
const plain = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9+]/g, '');

// ── Football. The pitch is 105 × 68 m: x from our goal (0) to theirs (105), y from our left touchline (0) to our
// right (68). It is drawn with our goal on the left, so our left touchline is at the top.
// Roles, their Russian names (the ones FIFA shows in Russian), and the names read back when the agent writes them.
const RU = { GK: 'ВР', LB: 'ЛЗ', LCB: 'ЛЦЗ', CB: 'ЦЗ', RCB: 'ПЦЗ', RB: 'ПЗ', LWB: 'ЛФЗ', RWB: 'ПФЗ', CDM: 'ЦОП', LDM: 'ЛОП', RDM: 'ПОП', LCM: 'ЛЦП', CM: 'ЦП', RCM: 'ПЦП', LM: 'ЛП', RM: 'ПП', LAM: 'ЛАП', CAM: 'ЦАП', RAM: 'ПАП', LW: 'ЛВ', RW: 'ПВ', LF: 'ЛФ', RF: 'ПФ', CF: 'ЦФД', ST: 'НП', LS: 'ЛНП', RS: 'ПНП' };
const FROM_RU = Object.fromEntries(Object.entries(RU).map(([k, v]) => [v, k]));
Object.assign(FROM_RU, { ВРТ: 'GK', ЦОПЗ: 'CDM', НАП: 'ST', ЛН: 'LS', ПН: 'RS', ЛФА: 'LF', ПФА: 'RF', ЦФ: 'CF' });

// Formations, attacking to the right. A formation the table does not hold is laid out from its digits.
const F = {
 '4-4-2': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LM: [45, 9], LCM: [40, 27], RCM: [40, 41], RM: [45, 59], LS: [66, 28], RS: [66, 40] },
 '4-3-3': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LCM: [42, 22], CM: [36, 34], RCM: [42, 46], LW: [64, 10], ST: [70, 34], RW: [64, 58] },
 '4-2-3-1': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LDM: [36, 27], RDM: [36, 41], LAM: [57, 13], CAM: [55, 34], RAM: [57, 55], ST: [71, 34] },
 '4-1-2-1-2': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], CDM: [32, 34], LCM: [43, 21], RCM: [43, 47], CAM: [55, 34], LS: [68, 28], RS: [68, 40] },
 '4-1-4-1': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], CDM: [32, 34], LM: [48, 9], LCM: [45, 26], RCM: [45, 42], RM: [48, 59], ST: [69, 34] },
 '4-5-1': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LM: [46, 8], LCM: [42, 22], CM: [38, 34], RCM: [42, 46], RM: [46, 60], ST: [68, 34] },
 '4-3-2-1': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LCM: [40, 21], CM: [36, 34], RCM: [40, 47], LF: [60, 24], RF: [60, 44], ST: [71, 34] },
 '4-4-1-1': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LM: [45, 9], LCM: [40, 27], RCM: [40, 41], RM: [45, 59], CF: [59, 34], ST: [70, 34] },
 '4-2-2-2': { GK: [5, 34], LB: [24, 9], LCB: [19, 26], RCB: [19, 42], RB: [24, 59], LDM: [36, 26], RDM: [36, 42], LAM: [55, 15], RAM: [55, 53], LS: [68, 28], RS: [68, 40] },
 '3-4-1-2': { GK: [5, 34], LCB: [20, 20], CB: [17, 34], RCB: [20, 48], LM: [48, 8], LCM: [42, 26], RCM: [42, 42], RM: [48, 60], CAM: [57, 34], LS: [70, 27], RS: [70, 41] },
 '3-4-3': { GK: [5, 34], LCB: [20, 20], CB: [17, 34], RCB: [20, 48], LM: [46, 8], LCM: [40, 26], RCM: [40, 42], RM: [46, 60], LW: [64, 13], ST: [70, 34], RW: [64, 55] },
 '3-5-2': { GK: [5, 34], LCB: [20, 20], CB: [17, 34], RCB: [20, 48], LM: [48, 7], LDM: [36, 26], RDM: [36, 42], RM: [48, 61], CAM: [54, 34], LS: [68, 28], RS: [68, 40] },
 '3-4-2-1': { GK: [5, 34], LCB: [20, 20], CB: [17, 34], RCB: [20, 48], LM: [46, 8], LCM: [40, 26], RCM: [40, 42], RM: [46, 60], LF: [60, 24], RF: [60, 44], ST: [71, 34] },
 '5-3-2': { GK: [5, 34], LWB: [30, 7], LCB: [19, 21], CB: [17, 34], RCB: [19, 47], RWB: [30, 61], LCM: [42, 22], CM: [38, 34], RCM: [42, 46], LS: [66, 28], RS: [66, 40] },
 '5-4-1': { GK: [5, 34], LWB: [28, 7], LCB: [19, 21], CB: [17, 34], RCB: [19, 47], RWB: [28, 61], LM: [44, 12], LCM: [40, 28], RCM: [40, 40], RM: [44, 56], ST: [64, 34] },
 '5-2-1-2': { GK: [5, 34], LWB: [30, 7], LCB: [19, 21], CB: [17, 34], RCB: [19, 47], RWB: [30, 61], LCM: [40, 27], RCM: [40, 41], CAM: [54, 34], LS: [67, 28], RS: [67, 40] },
};
// Names of the roles of a line by how many stand in it: defenders, the middle (by its depth), forwards.
const LINE = {
 back: { 1: ['CB'], 2: ['LCB', 'RCB'], 3: ['LCB', 'CB', 'RCB'], 4: ['LB', 'LCB', 'RCB', 'RB'], 5: ['LWB', 'LCB', 'CB', 'RCB', 'RWB'], 6: ['LWB', 'LB', 'LCB', 'RCB', 'RB', 'RWB'] },
 deep: { 1: ['CDM'], 2: ['LDM', 'RDM'], 3: ['LDM', 'CDM', 'RDM'], 4: ['LM', 'LDM', 'RDM', 'RM'], 5: ['LM', 'LDM', 'CDM', 'RDM', 'RM'] },
 mid: { 1: ['CM'], 2: ['LCM', 'RCM'], 3: ['LCM', 'CM', 'RCM'], 4: ['LM', 'LCM', 'RCM', 'RM'], 5: ['LM', 'LCM', 'CM', 'RCM', 'RM'], 6: ['LWB', 'LM', 'LCM', 'RCM', 'RM', 'RWB'] },
 high: { 1: ['CAM'], 2: ['LAM', 'RAM'], 3: ['LAM', 'CAM', 'RAM'], 4: ['LW', 'LAM', 'RAM', 'RW'], 5: ['LW', 'LAM', 'CAM', 'RAM', 'RW'] },
 top: { 1: ['ST'], 2: ['LS', 'RS'], 3: ['LW', 'ST', 'RW'], 4: ['LW', 'LS', 'RS', 'RW'], 5: ['LW', 'LS', 'ST', 'RS', 'RW'], 6: ['LW', 'LF', 'LS', 'RS', 'RF', 'RW'] },
};
// "3 4 1 2", "3–4–1–2" and "3412" are all 3-4-1-2.
const formKey = text => { const s = String(text || '').replace(/[^\d]+/g, '-').replace(/^-|-$/g, ''); return /^\d{3,5}$/.test(s) ? s.split('').join('-') : s; };
function footballForm(text) {
 const key = formKey(text);
 if (F[key]) return { key, at: F[key] };
 const lines = key.split('-').map(Number).filter(n => n > 0 && n < 7);
 if (lines.length < 2 || lines.reduce((s, n) => s + n, 0) !== 10) return { key: '4-4-2', at: F['4-4-2'] };
 // Laid out by its digits: the lines from our box to the halfway line and beyond, each spread over the width.
 const at = { GK: [5, 34] }, n = lines.length;
 lines.forEach((count, k) => {
  const kind = k === 0 ? 'back' : k === n - 1 ? 'top' : n === 3 ? 'mid' : k === 1 ? 'deep' : k === n - 2 ? 'high' : 'mid';
  const x = k === 0 ? 20 : k === n - 1 ? 68 : 20 + (48 * k) / (n - 1);
  const names = (LINE[kind][count] || []).slice();
  const span = Math.min(56, (count - 1) * 15);
  for (let j = 0; j < count; j++) {
   let role = names[j] || `${kind}${j}`;
   while (at[role]) role += '2';
   at[role] = [x + (count > 3 && (j === 0 || j === count - 1) && kind !== 'top' ? 4 : 0), count === 1 ? 34 : 34 - span / 2 + (span * j) / (count - 1)];
  }
 });
 return { key, at };
}

// The grounds, drawn by the widget's own scale: X and Y turn metres into the drawing, k is pixels to a metre.
function footballGround({ X, Y, k, L, H }) {
 let s = '';
 for (let i = 0; i < 10; i++) if (i % 2) s += `<rect class="pt-stripe" x="${X(i * L / 10)}" y="${Y(0)}" width="${L / 10 * k}" height="${H * k}"/>`;
 const box = (x1, y1, x2, y2) => `<rect class="pt-mark" x="${X(x1)}" y="${Y(y1)}" width="${(x2 - x1) * k}" height="${(y2 - y1) * k}"/>`;
 s += box(0, 0, L, H) + `<path class="pt-mark" d="M${X(L / 2)} ${Y(0)}V${Y(H)}"/><circle class="pt-mark" cx="${X(L / 2)}" cy="${Y(34)}" r="${9.15 * k}"/><circle class="pt-spot" cx="${X(L / 2)}" cy="${Y(34)}" r="1.5"/>`;
 s += box(0, 13.84, 16.5, 54.16) + box(0, 24.84, 5.5, 43.16) + box(L - 16.5, 13.84, L, 54.16) + box(L - 5.5, 24.84, L, 43.16);
 const a = Math.acos(5.5 / 9.15), dy = 9.15 * Math.sin(a);
 s += `<path class="pt-mark" d="M${X(16.5)} ${Y(34 - dy)}A${9.15 * k} ${9.15 * k} 0 0 1 ${X(16.5)} ${Y(34 + dy)}M${X(L - 16.5)} ${Y(34 - dy)}A${9.15 * k} ${9.15 * k} 0 0 0 ${X(L - 16.5)} ${Y(34 + dy)}"/>`;
 s += `<rect class="pt-goal is-us" x="${X(0) - 4}" y="${Y(30.34)}" width="4" height="${7.32 * k}"/><rect class="pt-goal is-them" x="${X(L)}" y="${Y(30.34)}" width="4" height="${7.32 * k}"/>`;
 return s;
}

// ── Ice hockey (IIHF): the rink is 60 × 30 m with rounded corners; the goal lines stand 4 m from the ends, the blue
// lines split it in three, and a skater may not be in their zone ahead of the puck.
const BLUE = [21.66, 38.34];
function rinkGround({ X, Y, k, L, H }) {
 const rr = 8.5, end = 4, cut = rr - Math.sqrt(rr * rr - (rr - end) ** 2);
 let s = `<rect class="pt-mark" x="${X(0)}" y="${Y(0)}" width="${L * k}" height="${H * k}" rx="${rr * k}"/>`;
 s += `<path class="pt-mark is-red is-wide" d="M${X(L / 2)} ${Y(0)}V${Y(H)}"/>`;
 for (const b of BLUE) s += `<path class="pt-mark is-blue is-wide" d="M${X(b)} ${Y(0)}V${Y(H)}"/>`;
 for (const g of [end, L - end]) s += `<path class="pt-mark is-red" d="M${X(g)} ${Y(cut)}V${Y(H - cut)}"/>`;
 s += `<circle class="pt-mark is-blue" cx="${X(L / 2)}" cy="${Y(H / 2)}" r="${4.5 * k}"/><circle class="pt-spot" cx="${X(L / 2)}" cy="${Y(H / 2)}" r="1.5"/>`;
 // The face-off circles of each end, 6 m out from the goal line and 7 m either side; the spots of the middle zone.
 for (const cx of [end + 6, L - end - 6]) for (const cy of [H / 2 - 7, H / 2 + 7]) s += `<circle class="pt-mark is-red" cx="${X(cx)}" cy="${Y(cy)}" r="${4.5 * k}"/><circle class="pt-spot is-red" cx="${X(cx)}" cy="${Y(cy)}" r="2"/>`;
 for (const cx of [BLUE[0] + 1.5, BLUE[1] - 1.5]) for (const cy of [H / 2 - 7, H / 2 + 7]) s += `<circle class="pt-spot is-red" cx="${X(cx)}" cy="${Y(cy)}" r="2"/>`;
 // The creases and the goals, 1.83 m wide, behind the goal lines.
 const cr = 1.83 * k;
 s += `<path class="pt-crease" d="M${X(end)} ${Y(H / 2) - cr}A${cr} ${cr} 0 0 1 ${X(end)} ${Y(H / 2) + cr}Z"/><path class="pt-crease" d="M${X(L - end)} ${Y(H / 2) - cr}A${cr} ${cr} 0 0 0 ${X(L - end)} ${Y(H / 2) + cr}Z"/>`;
 s += `<rect class="pt-goal is-us" x="${X(end - 1.1)}" y="${Y(H / 2 - 0.915)}" width="${1.1 * k}" height="${1.83 * k}" rx="2"/><rect class="pt-goal is-them" x="${X(L - end)}" y="${Y(H / 2 - 0.915)}" width="${1.1 * k}" height="${1.83 * k}" rx="2"/>`;
 return s;
}

// ── Basketball (FIBA): the court is 28 × 15 m, each basket 1.575 m in from its end line, the three-point line 6.75 m
// round it and 0.9 m in from the sidelines, the key 4.9 m wide to the free-throw line 5.8 m out.
const HOOP = 1.575;
function courtGround({ X, Y, k, L, H }) {
 let s = `<rect class="pt-mark" x="${X(0)}" y="${Y(0)}" width="${L * k}" height="${H * k}"/><path class="pt-mark" d="M${X(L / 2)} ${Y(0)}V${Y(H)}"/><circle class="pt-mark" cx="${X(L / 2)}" cy="${Y(H / 2)}" r="${1.8 * k}"/>`;
 const c = H / 2, arc = 6.75, side = 0.9, meet = HOOP + Math.sqrt(arc * arc - (c - side) ** 2);
 for (const flip of [false, true]) {
  const x = v => X(flip ? L - v : v), sweep = flip ? 0 : 1;
  s += `<path class="pt-key-paint" d="M${x(0)} ${Y(c - 2.45)}H${x(5.8)}V${Y(c + 2.45)}H${x(0)}Z"/>`;
  s += `<path class="pt-mark" d="M${x(0)} ${Y(c - 2.45)}H${x(5.8)}V${Y(c + 2.45)}H${x(0)}"/><circle class="pt-mark" cx="${x(5.8)}" cy="${Y(c)}" r="${1.8 * k}"/>`;
  s += `<path class="pt-mark" d="M${x(0)} ${Y(side)}H${x(meet)}A${arc * k} ${arc * k} 0 0 ${sweep} ${x(meet)} ${Y(H - side)}H${x(0)}"/>`;
  s += `<path class="pt-mark" d="M${x(HOOP)} ${Y(c - 1.25)}A${1.25 * k} ${1.25 * k} 0 0 ${sweep} ${x(HOOP)} ${Y(c + 1.25)}"/>`;
  s += `<path class="pt-board" d="M${x(1.2)} ${Y(c - 0.9)}V${Y(c + 0.9)}"/><circle class="pt-hoop ${flip ? 'is-them' : 'is-us'}" cx="${x(HOOP)}" cy="${Y(c)}" r="${Math.max(2.5, 0.225 * k)}"/>`;
 }
 return s;
}

// ── Rugby union: 100 m between the try lines, 70 m wide, an in-goal beyond each try line; the 22 m lines, the
// halfway line with its 10 m lines, the 5 m and 15 m lines along the touchlines, the posts 5.6 m apart.
function rugbyGround({ X, Y, k, L, H, x0, x1 }) {
 let s = `<rect class="pt-ingoal" x="${X(x0)}" y="${Y(0)}" width="${-x0 * k}" height="${H * k}"/><rect class="pt-ingoal" x="${X(L)}" y="${Y(0)}" width="${(x1 - L) * k}" height="${H * k}"/>`;
 for (let i = 0; i < 10; i++) if (i % 2) s += `<rect class="pt-stripe" x="${X(i * 10)}" y="${Y(0)}" width="${10 * k}" height="${H * k}"/>`;
 s += `<rect class="pt-mark" x="${X(x0)}" y="${Y(0)}" width="${(x1 - x0) * k}" height="${H * k}"/>`;
 for (const x of [0, L]) s += `<path class="pt-mark is-strong" d="M${X(x)} ${Y(0)}V${Y(H)}"/>`;
 for (const x of [22, L / 2, L - 22]) s += `<path class="pt-mark" d="M${X(x)} ${Y(0)}V${Y(H)}"/>`;
 for (const x of [5, 40, 60, L - 5]) s += `<path class="pt-mark is-dash" d="M${X(x)} ${Y(0)}V${Y(H)}"/>`;
 for (const y of [5, 15, H - 15, H - 5]) s += `<path class="pt-mark is-dots" d="M${X(0)} ${Y(y)}H${X(L)}"/>`;
 for (const [x, cls] of [[0, 'is-us'], [L, 'is-them']]) s += `<path class="pt-post ${cls}" d="M${X(x)} ${Y(H / 2 - 2.8)}V${Y(H / 2 + 2.8)}"/><circle class="pt-goal ${cls}" cx="${X(x)}" cy="${Y(H / 2 - 2.8)}" r="2.6"/><circle class="pt-goal ${cls}" cx="${X(x)}" cy="${Y(H / 2 + 2.8)}" r="2.6"/>`;
 return s;
}

// Each sport: its ground (L along the attack, H across, x0..x1 what is drawn), its formations (named for the chips in
// each language when they are words), its roles and their Russian names, the rule worked out live, and the sizes the
// drawing needs: the disc for a metre, how near a pass may pass a man, how far a placed opponent steps off one of ours.
const SPORTS = {
 football: { L: 105, H: 68, x0: 0, x1: 105, forms: F, def: '4-4-2', layout: footballForm, ground: footballGround, rule: 'football', where: 'onPitch', ru: RU, from: FROM_RU,
  disc: [1.9, 7.5, 10.5], lane: 1.9, nudge: 5, near: 2.6, ballOff: 1.6 },
 hockey: { L: 60, H: 30, x0: 0, x1: 60, def: '1-2-2', ground: rinkGround, rule: 'hockey', where: 'onRink',
  forms: {
   '1-2-2': { G: [4.6, 15], LD: [39.6, 9], RD: [39.6, 21], LW: [46, 7.5], RW: [46, 22.5], C: [51.5, 13] },
   '2-1-2': { G: [4.6, 15], LD: [39.6, 8.5], RD: [39.6, 21.5], LW: [52, 9], C: [45.5, 15], RW: [52, 21] },
   '1-3-1': { G: [4.6, 15], RD: [20.5, 15], LW: [29, 5.5], LD: [28, 15], RW: [29, 24.5], C: [37, 15] },
   'box+1': { G: [4.6, 15], LD: [7.4, 11.6], RD: [7.4, 18.4], LW: [13.5, 10.5], RW: [13.5, 19.5], C: [7.5, 25] },
  },
  names: { 'box+1': { ru: 'Коробка + 1', en: 'Box + 1', it: 'Box + 1', fr: 'Box + 1' } },
  alias: { box: 'box+1', коробка: 'box+1', коробка1: 'box+1', boxplus1: 'box+1', boxplusone: 'box+1' },
  ru: { G: 'ВР', LD: 'ЛЗ', RD: 'ПЗ', LW: 'ЛН', C: 'ЦН', RW: 'ПН' },
  from: { GK: 'G', ВРТ: 'G', LF: 'LW', RF: 'RW', CF: 'C', Ц: 'C', ЦЕНТР: 'C', ЦЕНТРФОРВАРД: 'C', ЛК: 'LW', ПК: 'RW' },
  disc: [0.9, 7.5, 10.5], lane: 1.0, nudge: 2.4, near: 1.5 },
 basketball: { L: 28, H: 15, x0: 0, x1: 28, def: '5-out', ground: courtGround, rule: 'basket', where: 'onCourt',
  forms: {
   '5-out': { PG: [19.2, 7.5], SG: [21.7, 12.7], SF: [21.7, 2.3], PF: [26.4, 0.8], C: [26.4, 14.2] },
   '4-out-1-in': { PG: [19.2, 7.5], SG: [21.7, 12.7], SF: [21.7, 2.3], PF: [26.4, 14.2], C: [25.6, 4.6] },
   horns: { PG: [18.6, 7.5], PF: [22.2, 4.9], C: [22.2, 10.1], SF: [26.4, 0.8], SG: [26.4, 14.2] },
   'zone-2-3': { PG: [6.6, 5.3], SG: [6.6, 9.7], SF: [3, 2.6], C: [2.5, 7.5], PF: [3, 12.4] },
   'zone-3-2': { PG: [7.8, 7.5], SG: [6.3, 2.8], SF: [6.3, 12.2], PF: [2.7, 4.7], C: [2.7, 10.3] },
   'zone-1-3-1': { PG: [8.6, 7.5], SG: [5.8, 2.6], C: [5.4, 7.5], SF: [5.8, 12.4], PF: [2.6, 7.5] },
   man: { PG: [7.9, 7.5], SG: [5.8, 3.4], SF: [5.8, 11.6], PF: [2.5, 12.6], C: [2.5, 2.4] },
  },
  names: {
   '5-out': { ru: '5 снаружи', en: '5-out', it: '5 fuori', fr: '5 dehors' },
   '4-out-1-in': { ru: '4 снаружи, 1 внутри', en: '4-out 1-in', it: '4 fuori 1 dentro', fr: '4 dehors 1 dedans' },
   horns: { ru: 'Рога', en: 'Horns', it: 'Horns', fr: 'Horns' },
   'zone-2-3': { ru: 'Зона 2-3', en: 'Zone 2-3', it: 'Zona 2-3', fr: 'Zone 2-3' },
   'zone-3-2': { ru: 'Зона 3-2', en: 'Zone 3-2', it: 'Zona 3-2', fr: 'Zone 3-2' },
   'zone-1-3-1': { ru: 'Зона 1-3-1', en: 'Zone 1-3-1', it: 'Zona 1-3-1', fr: 'Zone 1-3-1' },
   man: { ru: 'Личная опека', en: 'Man-to-man', it: 'A uomo', fr: 'Individuelle' },
  },
  alias: { 23: 'zone-2-3', 32: 'zone-3-2', 131: 'zone-1-3-1', '5out': '5-out', fiveout: '5-out', '41': '4-out-1-in', '4out': '4-out-1-in', личная: 'man', личка: 'man', персональная: 'man', mantoman: 'man', man2man: 'man', manman: 'man', individuelle: 'man', auomo: 'man' },
  ru: { PG: 'РЗ', SG: 'АЗ', SF: 'ЛФ', PF: 'ТФ', C: 'Ц' },
  from: { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C', ЦЕНТРОВОЙ: 'C', РАЗЫГРЫВАЮЩИЙ: 'PG' },
  disc: [0.42, 7.5, 10.5], lane: 0.7, nudge: 1.1, near: 0 },
 rugby: { L: 100, H: 70, x0: -8, x1: 108, def: 'attack', ground: rugbyGround, rule: 'rugby', where: 'onField', numbered: true,
  forms: {
   attack: { 1: [43.2, 29], 2: [44.4, 31], 3: [43.2, 33], 9: [42, 31], 10: [36, 24], 12: [34, 17], 13: [32, 10.5], 11: [30, 4], 7: [40, 19], 6: [39, 38], 4: [38, 42.5], 5: [38, 47], 8: [37, 52], 14: [33, 62], 15: [27, 31] },
   defence: { 11: [52, 5], 13: [53, 11], 12: [53.4, 17], 10: [53.6, 23], 7: [53.8, 28.5], 1: [54, 32.5], 3: [54, 37.5], 2: [53.8, 42], 6: [53.6, 46.5], 4: [53.4, 51], 5: [53, 55.5], 8: [52.6, 60], 14: [51, 66], 9: [51, 35], 15: [33, 35] },
   scrum: { 1: [48.9, 32.8], 2: [48.9, 35], 3: [48.9, 37.2], 4: [46.8, 33.9], 5: [46.8, 36.1], 6: [47.4, 30.8], 7: [47.4, 39.2], 8: [44.8, 35], 9: [50.2, 30.2], 10: [40, 27], 12: [37, 21], 13: [34, 15], 11: [31, 8], 14: [35, 58], 15: [27, 36] },
   lineout: { 2: [50, 0.9], 1: [49.2, 5.3], 4: [49.2, 7], 3: [49.2, 8.7], 5: [49.2, 10.4], 6: [49.2, 12.1], 8: [49.2, 13.8], 7: [49.2, 15.5], 9: [47.2, 17.2], 10: [39.5, 22], 12: [37.5, 29], 13: [35.5, 36], 14: [33.5, 45], 11: [35, 60], 15: [27, 40] },
  },
  // A lineout is on one touchline for both teams: theirs faces ours there, turned along the field only.
  flipX: new Set(['lineout']),
  names: {
   attack: { ru: 'Атака', en: 'Attack', it: 'Attacco', fr: 'Attaque' },
   defence: { ru: 'Защита', en: 'Defence', it: 'Difesa', fr: 'Défense' },
   scrum: { ru: 'Схватка', en: 'Scrum', it: 'Mischia', fr: 'Mêlée' },
   lineout: { ru: 'Коридор', en: 'Lineout', it: 'Touche', fr: 'Touche' },
  },
  alias: { defense: 'defence', лайнаут: 'lineout', аут: 'lineout', mele: 'scrum', melee: 'scrum', схватки: 'scrum', touche: 'lineout' },
  ru: {}, from: { LH: '1', LP: '1', HK: '2', HO: '2', TH: '3', TP: '3', LK: '4', FL: '6', BF: '6', OF: '7', N8: '8', SH: '9', FH: '10', IC: '12', OC: '13', LW: '11', RW: '14', FB: '15' },
  disc: [1.1, 5.5, 8], lane: 1.4, nudge: 2.6, near: 3 },
};
const SPORT_NAMES = { football: ['football', 'soccer', 'футбол', 'calcio', 'foot', 'fifa'], hockey: ['hockey', 'icehockey', 'хоккей', 'nhl', 'khl', 'кхл', 'нхл', 'hockeysurglace'], basketball: ['basketball', 'basket', 'баскетбол', 'nba', 'нба', 'pallacanestro'], rugby: ['rugby', 'регби', 'rugbyunion', 'rugbyxv'] };
const sportOf = text => { const n = plain(text); return SPORTS[Object.keys(SPORT_NAMES).find(id => SPORT_NAMES[id].includes(n)) || 'football']; };

// What a sport's widget reads the agent's words with: its formations, its roles, places on its ground.
function kit(S) {
 if (S.kit) return S.kit;
 const { L, H } = S, keys = Object.keys(S.forms);
 const codes = new Set(keys.flatMap(key => Object.keys(S.forms[key])));
 const from = { ...S.from };
 for (const [k, v] of Object.entries(S.ru || {})) from[v] = k;
 // A formation named as its key, its chip in any language, or a loose name of it; '' when none.
 const known = text => { const n = plain(text); return !n ? '' : keys.find(f => plain(f) === n || Object.values(S.names?.[f] || {}).some(v => plain(v) === n)) || S.alias?.[n] || ''; };
 const formation = S.layout || (text => { const key = plain(text) ? known(text) || S.def : ''; return { key, at: S.forms[key] || {} }; });
 // Theirs stand mirrored: their goal on the right, their left touchline at the bottom.
 const mirror = (at, key) => Object.fromEntries(Object.entries(at).map(([r, [x, y]]) => [r, [L - x, S.flipX?.has(key) ? y : H - y]]));
 // Where each role plays on average over the formations: a role the team's formation lacks (a CDM named in a
 // 3-4-1-2) is read as the player of that formation who stands nearest to it.
 const sum = {};
 for (const at of Object.values(S.forms)) for (const [r, [x, y]] of Object.entries(at)) { const t = sum[r] || (sum[r] = [0, 0, 0]); t[0] += x; t[1] += y; t[2]++; }
 const canon = Object.fromEntries(Object.entries(sum).map(([r, [x, y, n]]) => [r, [x / n, y / n]]));
 // A role as the agent wrote it: the code, or its Russian name; "ЛЦП — LCM", "LCM (левый)", "№10": the first word
 // that is a role.
 const hit = w => (codes.has(w) || S.ru?.[w] ? w : from[w] || '');
 const roleOf = text => {
  const up = String(text || '').trim().toUpperCase().replace(/Ё/g, 'Е');
  if (hit(up)) return hit(up);
  for (const word of up.split(/[^A-ZА-ЯЕ0-9]+/)) if (hit(word)) return hit(word);
  return up;
 };
 const roleName = role => (S.numbered ? `${lang() === 'ru' ? '№' : '#'}${role}` : (lang() === 'ru' ? S.ru?.[role] : null) || role);
 const label = key => S.names?.[key]?.[lang()] || S.names?.[key]?.en || key;
 const pt = v => Array.isArray(v) && v.length >= 2 && v.every(n => Number.isFinite(Number(n))) ? [clamp(Number(v[0]), S.x0, S.x1), clamp(Number(v[1]), 0, H)] : null;
 // A player as the agent wrote it: [x, y], or {at: [x, y], name, rating}.
 const place = v => Array.isArray(v) ? { at: pt(v) } : v && typeof v === 'object' ? { at: pt(v.at || v.pos || [v.x, v.y]), name: v.name, rating: v.rating } : { at: null };
 const team = obj => { const out = {}; for (const [k, v] of Object.entries(obj || {})) { const p = place(v); if (p.at || p.name || p.rating) out[roleOf(k)] = p; } return out; };
 // The ball: "LCM" (ours), "them:RM" (theirs), or [x, y].
 const ballOf = v => { if (Array.isArray(v)) return { at: pt(v) }; const s = String(v ?? ''); if (!s) return null; const m = /^(us|them|наши|их)\s*:\s*(.+)$/i.exec(s); return m ? { side: /^(them|их)$/i.test(m[1]) ? 'them' : 'us', role: roleOf(m[2]) } : { side: 'us', role: roleOf(s) }; };
 // Where a pass goes: a place, one of ours, or one of theirs ("them:RB": we close him down, drawn as a run at him).
 const target = v => { if (Array.isArray(v)) return { at: pt(v) }; const m = /^(them|их)\s*:\s*(.+)$/i.exec(String(v ?? '')); return m ? { them: roleOf(m[2]) } : { role: roleOf(v) }; };
 S.kit = { formation, known, codes, mirror, canon, roleOf, roleName, label, pt, place, team, ballOf, target, FORMS: keys };
 return S.kit;
}

// A widget whose sport the agent left out (seen on Claude Haiku): the sport its roles and formations belong to, PG or
// a zone 2-3 being basketball's and never football's; football when nothing says otherwise.
function sportFor(d) {
 if (plain(d.sport)) return sportOf(d.sport);
 const names = [], forms = [d.formation, d.against].filter(Boolean);
 const add = o => { if (o && typeof o === 'object' && !Array.isArray(o)) names.push(...Object.keys(o)); };
 add(d.us); add(d.them);
 for (const p of Array.isArray(d.phases) ? d.phases : []) { add(p?.us); add(p?.them); for (const st of p?.steps || []) { add(st?.us); add(st?.them); } }
 const foot = kit(SPORTS.football);
 let best = SPORTS.football, top = 0;
 for (const id of ['hockey', 'basketball', 'rugby']) {
  const K = kit(SPORTS[id]);
  const score = names.filter(r => K.codes.has(K.roleOf(r)) && !foot.codes.has(foot.roleOf(r))).length + forms.filter(f => K.known(f)).length * 3;
  if (score > top) { top = score; best = SPORTS[id]; }
 }
 return best;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// How far a point is from a segment, and where along it (0 to 1) its nearest point is.
function offLine(p, a, b) {
 const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy || 1;
 const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len, 0, 1);
 return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t };
}

Blocks.add('pitch', (card, d, x) => {
 // The sport: football unless the agent names another.
 const S = sportFor(d), K = kit(S), { L, H } = S, CANON = K.canon;
 const { formation, roleOf, roleName, team, ballOf, target, pt } = K;
 const mirror = (at, key) => K.mirror(at, key);
 const phases = (Array.isArray(d.phases) && d.phases.length ? d.phases : [{ name: '', say: d.say, ...d }]).map(p => ({
  name: String(p.name || ''), say: String(p.say || ''), us: team(p.us), them: team(p.them), ball: ballOf(p.ball),
  zone: Array.isArray(p.zone) && p.zone.length === 4 ? p.zone.map(Number) : null, hole: Array.isArray(p.hole) && p.hole.length === 4 ? p.hole.map(Number) : null,
  gaps: (p.gaps || []).filter(g => Array.isArray(g) && g.length >= 2).map(g => ({ a: roleOf(g[0]), b: roleOf(g[1]), lo: Number(g[2]), hi: Number(g[3]) })),
  passes: (p.passes || []).filter(Array.isArray).map(q => ({ from: roleOf(q[0]), to: target(q[1]), them: /^(them|их)\s*:/i.test(String(q[0])) })),
  runs: (p.runs || []).filter(Array.isArray).map(q => ({ who: roleOf(q[0]), to: pt(q[1]), them: /^(them|их)\s*:/i.test(String(q[0])) })),
  steps: (p.steps || []).map(s => ({ say: String(s.say || ''), us: team(s.us), them: team(s.them), ball: ballOf(s.ball), pass: Array.isArray(s.pass) ? { from: roleOf(s.pass[0]), to: target(s.pass[1]) } : null })),
 }));
 // Our team and theirs, from their formations, or only the players the agent put on the pitch (a photo, a situation).
 const own_ = { us: d.formation ? formation(d.formation).key : '', them: d.against ? formation(d.against).key : '' };
 const fixed = { us: team(d.us), them: team(d.them) };
 // The user's own player: "you", or the one whose name says so ("ЛЦП (ты)").
 const you = d.you ? roleOf(d.you) : Object.entries(fixed.us).find(([, v]) => /(^|[^a-zа-яё])(ты|you|toi|tu)([^a-zа-яё]|$)/i.test(String(v.name || '')))?.[0] || '';
 let form = { ...own_ }, phase = 0, step = 0, moved = { us: {}, them: {} }, play = 0, picking = '';
 const alias = { us: {}, them: {} };
 const base = side => {
  const out = {};
  if (form[side]) { const at = formation(form[side]).at; for (const [r, p] of Object.entries(side === 'us' ? at : mirror(at, form[side]))) out[r] = { at: p }; }
  // Players the agent placed itself stand where it put them, while the formation is its own. One whose role the
  // formation lacks (an LWB in a 3-5-2 written with LM) takes the place of the formation's nearest player not placed,
  // so a team placed in full is never doubled by the formation's own men.
  if (form[side] === own_[side]) {
   const placed = Object.entries(fixed[side]), taken = new Set(placed.map(([r]) => r).filter(r => out[r]));
   for (const [r, p] of placed) {
    let to = r;
    if (form[side] && !out[r] && CANON[r]) {
     const c = side === 'us' ? CANON[r] : mirror({ c: CANON[r] }, form[side]).c;
     let bd = Infinity;
     for (const [r0, v] of Object.entries(out)) { if (taken.has(r0) || fixed[side][r0]) continue; const dd = dist(c, v.at); if (dd < bd) { bd = dd; to = r0; } }
     taken.add(to);
     alias[side][r] = to;
    }
    out[to] = { ...out[to], ...p, at: p.at || out[to]?.at };
   }
  }
  return out;
 };
 const same = () => form.us === own_.us && form.them === own_.them;
 const named = f => { const t = K.label(f); return /[^\d\s+-]/.test(t) ? (lang() === 'en' ? `“${t}”` : `«${t}»`) : t; };

 const hasPicker = side => !!form[side];
 card.dataset.sport = Object.keys(SPORTS).find(id => SPORTS[id] === S);
 card.innerHTML = `
  <div class="bk-head"><div class="bk-title">${esc(d.title || '')}</div>${d.meta ? `<div class="bk-meta">${esc(d.meta)}</div>` : ''}</div>
  ${phases.length > 1 ? `<div class="bk-tabs pt-tabs"><span class="bk-tabs-pill"></span>${phases.map((p, k) => `<button class="bk-tab${k ? '' : ' is-on'}" data-tab="${k}">${lab(p.name || String(k + 1))}</button>`).join('')}</div>` : ''}
  <div class="pt-field"><svg class="pt-svg"><g class="pt-ground"></g><g class="pt-areas"></g><g class="pt-off"><path class="pt-off-line"/><text class="pt-off-t"></text></g><g class="pt-lines"></g><g class="pt-them"></g><g class="pt-us"></g><g class="pt-top"></g><circle class="pt-ball" r="4.2"/></svg></div>
  <div class="pt-key">
   <button class="pt-team is-us" data-side="us"${hasPicker('us') ? '' : ' disabled'}><i></i>${lab(say('us'))}<b class="pt-form-us">${esc(K.label(form.us))}</b>${hasPicker('us') ? '<svg viewBox="0 0 10 10"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>' : ''}</button>
   <button class="pt-team is-them" data-side="them"${hasPicker('them') ? '' : ' disabled'}><i></i>${lab(say('them'))}<b class="pt-form-them">${esc(K.label(form.them))}</b>${hasPicker('them') ? '<svg viewBox="0 0 10 10"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>' : ''}</button>
   <span class="bk-gap"></span><span class="pt-dir">${esc(say('attack'))}<svg viewBox="0 0 16 10"><path d="M1 5h13M10 1.5L14 5l-4 3.5"/></svg></span>
  </div>
  <div class="pt-forms" hidden>${K.FORMS.map(f => `<button class="pt-chip" data-form="${f}">${lab(K.label(f))}</button>`).join('')}</div>
  <div class="pt-say"></div>
  <div class="pt-steps" hidden><button class="pt-play" aria-label="${esc(say('play'))}"><span class="bk-i-play"></span></button><div class="pt-bar"></div><span class="pt-count"></span></div>
  <div class="bk-acts pt-acts" hidden><button class="bk-btn is-soft is-small" data-do="reset">${lab(say('reset'))}</button><button class="bk-btn is-main is-small" data-do="ask">${lab(say('ask'))}</button></div>
  <div class="bk-acts pt-redo" hidden><button class="bk-btn is-main is-small" data-do="redo"></button></div>`;

 const $ = s => card.querySelector(s);
 const svg = $('.pt-svg');
 let W = 0, k = 1, pad = 12, r = 9;
 const X = v => pad + (v - S.x0) * k, Y = v => pad + v * k;
 // How far the ball sits off its holder: as in football, about a disc's width, whatever the ground's scale.
 const boff = () => S.ballOff ?? (r * 0.8) / k;

 // Where everything stands at a phase and step: the formation, the phase's moves, the steps' moves up to this one,
 // then what the user dragged.
 function scene(ph = phase, st = step) {
  const p = phases[ph], mine = same();
  const home = { us: base('us'), them: base('them') };
  const out = { us: base('us'), them: base('them') }, trail = [];
  // A role as the agent wrote it, as a player of this team: itself, or the nearest to where that role plays.
  const R = (side, role, skip) => {
   if (role && !home[side][role] && home[side][alias[side][role]]) return alias[side][role];
   if (!role || home[side][role] || !form[side] || !CANON[role]) return role;
   const c = side === 'us' ? CANON[role] : mirror({ c: CANON[role] }, form[side]).c;
   let best = role, bd = Infinity;
   for (const [r0, v] of Object.entries(home[side])) { if (skip?.has(r0) || !v.at) continue; const dd = dist(c, v.at); if (dd < bd) { bd = dd; best = r0; } }
   return best;
  };
  // Moves of roles the team lacks go to the nearest player not moved already.
  const fit = (side, moves) => {
   const res = {}, taken = new Set(Object.keys(moves).filter(r0 => home[side][r0]));
   for (const [r0, v] of Object.entries(moves)) { const to = home[side][r0] ? r0 : R(side, r0, taken); taken.add(to); res[to] = v; }
   return res;
  };
  const rb = b => b && !b.at && b.role ? { ...b, role: R(b.side || 'us', b.role) } : b;
  const rp = q => q && { from: R('us', q.from), to: q.to.at ? q.to : q.to.them ? { them: R('them', q.to.them) } : { role: R('us', q.to.role) } };
  const own = new Set(form.them === own_.them ? Object.keys(fixed.them) : []);
  const apply = (side, moves) => { for (const [r0, v] of Object.entries(moves)) { if (!v.at) continue; out[side][r0] = { ...out[side][r0], ...v, at: v.at }; if (side === 'them') own.add(r0); } };
  if (mine) { apply('us', fit('us', p.us)); apply('them', fit('them', p.them)); }
  let ball = rb(p.ball), pass = null;
  for (let s = 0; s < st && mine; s++) {
   const S = p.steps[s];
   const before = { us: Object.fromEntries(Object.entries(out.us).map(([r0, v]) => [r0, v.at])), them: Object.fromEntries(Object.entries(out.them).map(([r0, v]) => [r0, v.at])) };
   const fs = { us: fit('us', S.us), them: fit('them', S.them) };
   apply('us', fs.us); apply('them', fs.them);
   if (S.pass) { pass = rp(S.pass); ball = pass.to.at ? { at: pass.to.at } : pass.to.them ? { side: 'them', role: pass.to.them } : { side: 'us', role: pass.to.role }; }
   if (S.ball) ball = rb(S.ball);
   if (s === st - 1) for (const side of ['us', 'them']) for (const r0 of Object.keys(fs[side])) { const was = before[side][r0], now = out[side][r0]?.at; if (was && now && dist(was, now) > 1) trail.push({ side, role: r0, from: was, to: now }); }
   if (s !== st - 1) pass = null;
  }
  // Theirs that only stand in their formation step off any of ours standing on the same spot, so no two discs or
  // names lie on each other; the ones the agent placed stay where it put them.
  for (const [r0, v] of Object.entries(out.them)) {
   if (own.has(r0) || !v.at) continue;
   for (const u of Object.values(out.us)) {
    if (!u.at) continue;
    const dd = dist(v.at, u.at);
    if (dd >= S.nudge) continue;
    const dx = v.at[0] - u.at[0] || 0.01, dy = v.at[1] - u.at[1] || (v.at[1] < H / 2 ? -0.01 : 0.01), n = Math.hypot(dx, dy);
    v.at = [clamp(u.at[0] + dx / n * S.nudge, S.x0, S.x1), clamp(u.at[1] + dy / n * S.nudge, 0, H)];
   }
  }
  for (const side of ['us', 'them']) for (const [r0, at] of Object.entries(moved[side])) if (out[side][r0]) out[side][r0] = { ...out[side][r0], at };
  return { ...out, ball, pass, trail, R, me: R('us', you) };
 }
 // The ball's place on the pitch: at its holder's feet, or where it was put.
 const ballAt = (S, b) => {
  if (!b) return null;
  if (b.at) return b.at;
  const h = S[b.side || 'us'][b.role];
  return h ? [h.at[0] + boff(), h.at[1] - boff()] : null;
 };

 // What is shown now, moving towards what should be shown.
 let shown = null, goal = null, anim = 0;
 const posOf = S => {
  const o = {};
  for (const side of ['us', 'them']) for (const [r0, v] of Object.entries(S[side])) if (v.at) o[`${side}:${r0}`] = v.at;
  const b = ballAt(S, S.ball);
  if (b) o.ball = b;
  return o;
 };
 function go(S, still = false) {
  goal = S;
  const to = posOf(S);
  if (still || !shown || reduced()) { shown = to; draw(); return; }
  const from = { ...shown }, t0 = performance.now(), id = ++anim, dur = 760;
  // A new formation: each player new to the pitch starts from the nearest one who left it, so the team moves as one.
  for (const side of ['us', 'them']) {
   const gone = Object.keys(from).filter(key => key.startsWith(`${side}:`) && !to[key]);
   for (const key of Object.keys(to).filter(key => key.startsWith(`${side}:`) && !from[key])) {
    let best = -1;
    gone.forEach((g, i) => { if (best < 0 || dist(from[g], to[key]) < dist(from[gone[best]], to[key])) best = i; });
    if (best >= 0) { from[key] = from[gone[best]]; gone.splice(best, 1); }
   }
  }
  const frame = now => {
   if (id !== anim || !card.isConnected) return;
   const e = ease(Math.min(1, (now - t0) / dur));
   const cur = {};
   for (const [key, p] of Object.entries(to)) { const a = from[key] || p; cur[key] = [a[0] + (p[0] - a[0]) * e, a[1] + (p[1] - a[1]) * e]; }
   shown = cur;
   draw(e < 1);
   if (e < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
 }

 // The pitch's lines, drawn again when the card's width changes.
 function ground() {
  W = Math.max(240, svg.clientWidth || card.clientWidth - 36);
  k = (W - pad * 2) / (S.x1 - S.x0);
  r = clamp(k * S.disc[0], S.disc[1], S.disc[2]);
  const h = H * k + pad * 2;
  svg.setAttribute('viewBox', `0 0 ${W} ${h}`);
  svg.style.height = `${h}px`;
  $('.pt-ball').setAttribute('r', clamp(r * 0.45, 3.2, 4.6));
  $('.pt-ground').innerHTML = S.ground({ X, Y, k, L, H, x0: S.x0, x1: S.x1 });
 }

 // The players: made once for a team as it is now, moved by their attributes after that.
 const nodes = { us: {}, them: {} };
 function cast() {
  for (const side of ['us', 'them']) {
   const g = $(`.pt-${side}`), want = goal[side];
   for (const [r0, n] of Object.entries(nodes[side])) if (!want[r0]) { n.remove(); delete nodes[side][r0]; }
   for (const [r0, v] of Object.entries(want)) {
    let n = nodes[side][r0];
    if (!n) {
     n = document.createElementNS(NS, 'g');
     n.dataset.side = side; n.dataset.role = r0;
     n.innerHTML = `<circle class="pt-halo"/><circle class="pt-disc"/><text class="pt-in" text-anchor="middle"></text><text class="pt-name" text-anchor="middle"></text><text class="pt-you" text-anchor="middle"></text>`;
     g.append(n);
     nodes[side][r0] = n;
    }
    n.setAttribute('class', `pt-p is-${side}${side === 'us' && r0 === goal.me ? ' is-me' : ''}`);
    // Rugby players are known by their numbers, worn in the disc.
    const inner = S.numbered ? r0 : v.rating ? String(v.rating) : '';
    n.querySelector('.pt-in').textContent = inner;
    // A long name is cut, so it never covers its neighbours.
    // A rugby name that starts with the number worn in the disc ("2 · бросок", "14") drops it: the disc says it.
    const own = S.numbered ? String(v.name || '').replace(new RegExp(`^\\s*(№|#|no\\.?)?\\s*${r0}(?!\\d)\\s*[·.:)\\-–—]?\\s*`, 'i'), '') : '';
    const label = S.numbered ? own : String(v.name || roleName(r0));
    n.querySelector('.pt-name').textContent = label.length > 14 ? `${label.slice(0, 13).trim()}…` : label;
    // "You" over the disc, unless the name already says it.
    n.querySelector('.pt-you').textContent = side === 'us' && r0 === goal.me && !/(^|[^a-zа-яё])(ты|you|toi|tu)([^a-zа-яё]|$)/i.test(String(v.name || '')) ? say('you') : '';
    n.classList.toggle('has-num', !!inner);
   }
  }
 }

 // Everything that follows from where the players are: offside, passes, gaps; drawn on each frame of a move or a drag.
 function draw(moving = false) {
  if (!goal) return;
  const at = key => shown[key];
  const P = phases[phase], R = goal.R;
  for (const side of ['us', 'them']) for (const [r0, n] of Object.entries(nodes[side])) {
   const p = at(`${side}:${r0}`);
   if (!p) continue;
   const cx = X(p[0]), cy = Y(p[1]), me = n.classList.contains('is-me'), rr = me ? r + 2 : r;
   for (const c of n.querySelectorAll('circle')) { c.setAttribute('cx', cx); c.setAttribute('cy', cy); }
   n.querySelector('.pt-disc').setAttribute('r', rr);
   n.querySelector('.pt-halo').setAttribute('r', rr + 5);
   const tin = n.querySelector('.pt-in'); tin.setAttribute('x', cx); tin.setAttribute('y', cy + (S.numbered ? 2.8 : 3.4));
   // The name goes under the disc, or over it when another disc stands right under.
   const under = Object.entries(shown).some(([key2, q]) => key2 !== 'ball' && key2 !== `${side}:${r0}` && Math.abs(X(q[0]) - cx) < r * 2.2 && Y(q[1]) - cy > 0 && Y(q[1]) - cy < r * 2 + 14);
   const name = n.querySelector('.pt-name'); name.setAttribute('x', cx); name.setAttribute('y', under && !me ? cy - rr - 5 : cy + rr + 11);
   const tyou = n.querySelector('.pt-you'); tyou.setAttribute('x', cx); tyou.setAttribute('y', cy - rr - 5);
  }
  // The ball, and who has it.
  const b = at('ball'), ball = $('.pt-ball');
  ball.style.display = b ? '' : 'none';
  if (b) { ball.setAttribute('cx', X(b[0])); ball.setAttribute('cy', Y(b[1])); }
  const holder = goal.ball && !goal.ball.at ? goal.ball : null;
  const attacking = holder?.side === 'them' ? 'them' : 'us', defending = attacking === 'us' ? 'them' : 'us';
  // The sport's rule, from where everyone and the ball are now. fwd: which way along x the side with the ball attacks.
  const fwd = attacking === 'us' ? 1 : -1, offWord = S.rule === 'football' ? 'offside' : 'outOfPlay';
  let line = null, lineWord = offWord;
  if (S.rule === 'football') {
   // Offside: the second-last man of the side defending, never in his own half's far side of the halfway line.
   const def = Object.keys(goal[defending]).map(r0 => at(`${defending}:${r0}`)).filter(Boolean).map(p => p[0]);
   if (def.length >= 2) {
    if (attacking === 'us') { def.sort((a, z) => z - a); line = Math.max(L / 2, def[1]); }
    else { def.sort((a, z) => a - z); line = Math.min(L / 2, def[1]); }
   }
  } else if (S.rule === 'hockey') {
   // Offside at the blue line of the zone attacked: a skater past it while the puck is still outside.
   const blue = attacking === 'us' ? BLUE[1] : BLUE[0];
   if (b && (b[0] - blue) * fwd < 0) line = blue;
  } else if (S.rule === 'rugby' && b && holder) {
   // The ball line: a player of the side with the ball ahead of it is out of play until he is back behind it.
   line = b[0]; lineWord = 'ballLine';
  }
  const isOff = p => line != null && (p[0] - line) * fwd > (S.rule === 'football' ? 0.4 : 0.3);
  // In rugby a man ahead of the ball is only out of play when he takes part: a pass or a run to him, or the user moved
  // him; the rest of the pack standing ahead of a ruck is no fault.
  const involved = new Set(Object.keys(moved[attacking]).map(r0 => `${attacking}:${r0}`));
  if (same() && step === 0) {
   for (const q of P.passes) if (q.to.role) involved.add(q.them ? `them:${R('them', q.to.role)}` : `us:${R('us', q.to.role)}`);
   for (const u of P.runs) involved.add(u.them ? `them:${R('them', u.who)}` : `us:${R('us', u.who)}`);
  } else if (same() && goal.pass?.to.role) involved.add(`us:${goal.pass.to.role}`);
  const ahead = role => { const p = at(`${attacking}:${role}`); return p && isOff(p) && !(b && dist(p, b) < S.near) && (S.rule !== 'rugby' || involved.has(`${attacking}:${role}`)); };
  for (const [r0, n] of Object.entries(nodes[attacking])) n.classList.toggle('is-off', !!ahead(r0));
  for (const [, n] of Object.entries(nodes[defending])) n.classList.remove('is-off');
  const off = $('.pt-off');
  off.classList.toggle('is-on', line != null);
  off.classList.toggle('is-soft', lineWord === 'ballLine');
  if (line != null) {
   $('.pt-off-line').setAttribute('d', `M${X(line)} ${Y(0) - 3}V${Y(H) + 3}`);
   const t = $('.pt-off-t'); t.textContent = say(lineWord);
   t.setAttribute('x', X(line) + (attacking === 'us' ? 5 : -5)); t.setAttribute('y', Y(H) - 5); t.setAttribute('text-anchor', attacking === 'us' ? 'start' : 'end');
  }
  // Zones the phase points at.
  let areas = '';
  const rect = (z, cls) => { const [x1, y1, x2, y2] = [Math.min(z[0], z[2]), Math.min(z[1], z[3]), Math.max(z[0], z[2]), Math.max(z[1], z[3])]; return `<rect class="pt-area ${cls}" x="${X(x1)}" y="${Y(y1)}" width="${(x2 - x1) * k}" height="${(y2 - y1) * k}" rx="8"/>`; };
  if (same() && P.zone) areas += rect(P.zone, 'is-zone');
  if (same() && P.hole) areas += rect(P.hole, 'is-hole');
  $('.pt-areas').innerHTML = areas;
  // Passes: numbered in the order to look for them; a pass with a man of theirs in its way is red and says who.
  let lines = '', top = '';
  const cut = new Set();
  const arrow = (a, z, cls, n = '', note = '') => {
   const ax = X(a[0]), ay = Y(a[1]), zx = X(z[0]), zy = Y(z[1]), len = Math.hypot(zx - ax, zy - ay);
   if (len < r * 2.4) return '';
   const ux = (zx - ax) / len, uy = (zy - ay) / len, s0 = r + 3, s1 = cls.includes('to-man') ? r + 4 : 3;
   const x1 = ax + ux * s0, y1 = ay + uy * s0, x2 = zx - ux * s1, y2 = zy - uy * s1, hl = 8, hw = 4.4;
   let s = `<path class="pt-arrow ${cls}" d="M${x1} ${y1}L${x2} ${y2}"/><path class="pt-head ${cls}" d="M${x2} ${y2}L${x2 - ux * hl - uy * hw} ${y2 - uy * hl + ux * hw}L${x2 - ux * hl + uy * hw} ${y2 - uy * hl - ux * hw}Z"/>`;
   const mx = x1 + (x2 - x1) * 0.42, my = y1 + (y2 - y1) * 0.42;
   if (n) top += `<circle class="pt-badge ${cls}" cx="${mx}" cy="${my}" r="8"/><text class="pt-badge-n" x="${mx}" y="${my + 3.4}" text-anchor="middle">${n}</text>`;
   if (note) top += `<text class="pt-note ${cls}" x="${mx + (n ? 12 : 0)}" y="${my - 9}" text-anchor="${n ? 'start' : 'middle'}">${esc(note)}</text>`;
   return s;
  };
  const check = (fromSide, a, z, toRole) => {
   const other = fromSide === 'us' ? 'them' : 'us';
   let who = null;
   for (const r0 of Object.keys(goal[other])) { const p = at(`${other}:${r0}`); if (!p) continue; const o = offLine(p, a, z); if (o.d < S.lane && o.t > 0.1 && o.t < 0.94 && (!who || o.t < who.t)) who = { role: r0, t: o.t }; }
   if (who) cut.add(`${other}:${who.role}`);
   const recv = toRole ? at(`${fromSide}:${toRole}`) : null;
   // Rugby: a pass may not go forward (a kick into space may; the caller says which it is).
   const ahead2 = S.rule === 'rugby' && (z[0] - a[0]) * (fromSide === 'us' ? 1 : -1) > 0.5;
   return { cut: !!who, off: fromSide === attacking && recv && isOff(recv), fwd: ahead2 };
  };
  if (same() && step === 0 && !moving) {
   const many = P.passes.length > 1;
   P.passes.forEach((q, i) => {
    // A pass of theirs: blue, and red when one of ours stands in its way.
    if (q.them) {
     const a2 = at(`them:${R('them', q.from)}`), z2 = q.to.at || at(`them:${R('them', q.to.them || q.to.role)}`);
     if (!a2 || !z2) return;
     const c2 = check('them', a2, z2, null), fw2 = c2.fwd && !q.to.at;
     lines += arrow(a2, z2, `is-pass is-them${c2.cut || fw2 ? ' is-bad' : ''}${q.to.at ? '' : ' to-man'}`, many ? String(i + 1) : '', c2.cut ? say('cut') : fw2 ? say('forward') : '');
     return;
    }
    const a = at(`us:${R('us', q.from)}`);
    if (q.to.them) { const z2 = at(`them:${R('them', q.to.them)}`); if (a && z2) lines += arrow(a, z2, `is-run is-us is-press to-man${R('us', q.from) === goal.me ? ' is-me' : ''}`, many ? String(i + 1) : ''); return; }
    let z = q.to.at || at(`us:${R('us', q.to.role)}`);
    if (!a || !z) return;
    // A pass into space is for the man running onto it: he is checked for offside where he starts.
    let runner = q.to.role && R('us', q.to.role);
    if (q.to.at) { const run = P.runs.find(u => !u.them && u.to && dist(u.to, q.to.at) < 4); runner = run && R('us', run.who); }
    const c = check('us', a, z, runner), fw = c.fwd && !!q.to.role;
    const note = c.cut ? say('cut') : fw ? say('forward') : c.off ? say(offWord) : '';
    lines += arrow(a, z, `is-pass${c.cut || c.off || fw ? ' is-bad' : ''}${q.to.role ? ' to-man' : ''}`, many ? String(i + 1) : '', note);
   });
   for (const u of P.runs) {
    const side = u.them ? 'them' : 'us', who = R(side, u.who), a = at(`${side}:${who}`);
    if (a && u.to) lines += arrow(a, u.to, `is-run is-${side}${side === 'us' && who === goal.me ? ' is-me' : ''}`);
   }
  }
  // A step being played: its pass, and the runs of who moved in it.
  if (same() && step > 0) {
   for (const t of goal.trail) lines += arrow(t.from, at(`${t.side}:${t.role}`) || t.to, `is-run is-${t.side}${t.side === 'us' && t.role === goal.me ? ' is-me' : ''} is-trail`);
   if (goal.pass) {
    const S0 = scene(phase, step - 1), a = S0.us[goal.pass.from]?.at, z = goal.pass.to.at || (goal.pass.to.them ? at(`them:${goal.pass.to.them}`) : at(`us:${goal.pass.to.role}`));
    if (a && z) { const c = moving ? { cut: false, off: false } : check('us', a, z, goal.pass.to.role), fw = c.fwd && !!goal.pass.to.role; lines += arrow(a, z, `is-pass${c.cut || fw ? ' is-bad' : ''}${goal.pass.to.role ? ' to-man' : ''}`, '', c.cut ? say('cut') : fw ? say('forward') : ''); }
   }
  }
  for (const side of ['us', 'them']) for (const [r0, n] of Object.entries(nodes[side])) n.classList.toggle('is-cut', cut.has(`${side}:${r0}`));
  // Gaps between two of ours, in metres; outside the range they should be, they say what is wanted.
  if (same()) for (const g of P.gaps) {
   const a = at(`us:${R('us', g.a)}`), z = at(`us:${R('us', g.b)}`);
   if (!a || !z) continue;
   const m = L < 40 ? Math.round(dist(a, z) * 10) / 10 : Math.round(dist(a, z)), ok = !(Number.isFinite(g.lo) && Number.isFinite(g.hi)) || (m >= g.lo && m <= g.hi);
   const ax = X(a[0]), ay = Y(a[1]), zx = X(z[0]), zy = Y(z[1]), len = Math.hypot(zx - ax, zy - ay) || 1, ux = (zx - ax) / len, uy = (zy - ay) / len;
   const s0 = r + 4;
   lines += `<path class="pt-gap${ok ? '' : ' is-bad'}" d="M${ax + ux * s0} ${ay + uy * s0}L${zx - ux * s0} ${zy - uy * s0}"/>`;
   const mx = (ax + zx) / 2, my = (ay + zy) / 2, text = `${m} ${say('m')}${ok ? '' : ` · ${say('need', { a: g.lo, b: g.hi })}`}`;
   top += `<text class="pt-gap-t${ok ? '' : ' is-bad'}" x="${mx - uy * 12}" y="${my + ux * 12 + 3.5}" text-anchor="middle">${esc(text)}</text>`;
  }
  // Basketball: from where the man with the ball stands, a shot is worth two or three, and he is open or guarded.
  if (S.rule === 'basket' && holder) {
   const hp = at(`${holder.side}:${holder.role}`), other = holder.side === 'us' ? 'them' : 'us';
   if (hp) {
    const hoop = holder.side === 'us' ? [L - HOOP, H / 2] : [HOOP, H / 2];
    const three = Math.abs(hp[1] - H / 2) > H / 2 - 0.9 || dist(hp, hoop) > 6.75;
    const near = Math.min(Infinity, ...Object.keys(goal[other]).map(r0 => at(`${other}:${r0}`)).filter(Boolean).map(q => dist(q, hp)));
    const open = near > 1.8, cx = X(hp[0]), cy = Y(hp[1]), right = cx < W - 110;
    top += `<text class="pt-shot${open ? ' is-open' : ''}" x="${right ? cx + r + 5 : cx - r - 5}" y="${cy - r - 3}" text-anchor="${right ? 'start' : 'end'}">${esc(`${say(three ? 'three' : 'two')} · ${say(open ? 'open' : 'guarded')}`)}</text>`;
   }
  }
  $('.pt-lines').innerHTML = lines;
  $('.pt-top').innerHTML = top;
 }

 // The words under the pitch, the steps, the buttons.
 function words() {
  const P = phases[phase];
  const note = same() ? (step > 0 ? P.steps[step - 1].say : P.say) : say('madeFor', { f: [own_.us, own_.them].filter(Boolean).map(f => named(f)).join(` ${say('against')} `) });
  $('.pt-say').textContent = note || '';
  $('.pt-say').hidden = !note;
  const steps = same() ? P.steps.length : 0;
  $('.pt-steps').hidden = !steps;
  if (steps) {
   $('.pt-bar').innerHTML = Array.from({ length: steps + 1 }, (_, i) => `<button class="pt-seg${i <= step ? ' is-on' : ''}" data-step="${i}" aria-label="${esc(i ? say('step', { n: i, m: steps }) : say('start'))}"></button>`).join('');
   $('.pt-count').textContent = step ? say('step', { n: step, m: steps }) : say('start');
   $('.pt-play').innerHTML = play ? '<span class="bk-i-pause"></span>' : '<span class="bk-i-play"></span>';
  }
  const dragged = Object.keys(moved.us).length + Object.keys(moved.them).length > 0;
  $('.pt-acts').hidden = !dragged;
  const redo = $('.pt-redo');
  redo.hidden = same();
  if (!same()) redo.querySelector('button').innerHTML = lab(say('redo', { f: [form.us, form.them].filter(Boolean).map(f => named(f)).join(` ${say('against')} `) }));
  $('.pt-form-us').textContent = K.label(form.us); $('.pt-form-them').textContent = K.label(form.them);
 }
 function show(still = false) { const S = scene(); goal = S; cast(); go(S, still); words(); }

 // Playing the steps: one after another, each given time to be seen.
 let timer = 0;
 const stop = () => { clearTimeout(timer); play = 0; };
 function run() {
  const n = phases[phase].steps.length;
  if (play) { stop(); words(); return; }
  moved = { us: {}, them: {} };
  play = 1;
  if (step >= n) { step = 0; show(); }
  const next = () => { if (!play || !card.isConnected) return; step++; show(); if (step < n) timer = setTimeout(next, 1700); else { play = 0; words(); } };
  timer = setTimeout(next, step === 0 ? 500 : 200);
  words();
 }
 $('.pt-play').addEventListener('click', run);
 $('.pt-bar').addEventListener('click', e => { const s = e.target.closest('.pt-seg'); if (!s) return; stop(); step = Number(s.dataset.step); show(); });
 x.tabs(n => { stop(); phase = n; step = 0; moved = { us: {}, them: {} }; show(); });

 // The formations: a row of them under the key; a pick moves the team at once.
 const forms = $('.pt-forms');
 card.querySelectorAll('.pt-team').forEach(b => b.addEventListener('click', () => {
  const side = b.dataset.side;
  if (!form[side]) return;
  picking = forms.hidden || picking !== side ? side : '';
  forms.hidden = !picking;
  card.querySelectorAll('.pt-team').forEach(t => t.classList.toggle('is-open', t.dataset.side === picking));
  forms.querySelectorAll('.pt-chip').forEach(c => c.classList.toggle('is-on', c.dataset.form === form[picking]));
  if (picking) forms.animate([{ clipPath: 'inset(0 0 100% 0 round 14px)' }, { clipPath: 'inset(0 0 0 0 round 14px)' }], { duration: 360, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
 }));
 forms.addEventListener('click', e => {
  const c = e.target.closest('.pt-chip');
  if (!c || !picking) return;
  stop();
  form[picking] = c.dataset.form;
  moved[picking] = {};
  forms.querySelectorAll('.pt-chip').forEach(o => o.classList.toggle('is-on', o === c));
  step = 0;
  show();
 });

 // Dragging a player: everything that depends on him follows at once.
 let drag = null;
 const world = e => { const b = svg.getBoundingClientRect(), sx = W / b.width; return [clamp(((e.clientX - b.left) * sx - pad) / k + S.x0, S.x0, S.x1), clamp(((e.clientY - b.top) * sx - pad) / k, 0, H)]; };
 svg.addEventListener('pointerdown', e => {
  if (!shown) return;
  const p = world(e);
  let best = null;
  for (const [key, q] of Object.entries(shown)) { if (key === 'ball') continue; const dd = dist(p, q) * k; if (dd < r + 8 && (!best || dd < best.d)) best = { key, d: dd }; }
  if (!best) return;
  e.preventDefault();
  stop(); anim++;
  const [side, role] = best.key.split(':');
  const q = shown[best.key];
  drag = { side, role, dx: q[0] - p[0], dy: q[1] - p[1], id: e.pointerId };
  svg.setPointerCapture?.(e.pointerId);
  nodes[side][role]?.classList.add('is-drag');
  svg.classList.add('is-dragging');
 });
 svg.addEventListener('pointermove', e => {
  if (!drag) { if (!shown || e.buttons) return; const p = world(e); svg.classList.toggle('is-over', Object.entries(shown).some(([key, q]) => key !== 'ball' && dist(p, q) * k < r + 8)); return; }
  const p = world(e), at = [clamp(p[0] + drag.dx, S.x0, S.x1), clamp(p[1] + drag.dy, 0, H)];
  const key = `${drag.side}:${drag.role}`, held = goal.ball && !goal.ball.at && goal.ball.side === drag.side && goal.ball.role === drag.role;
  // The ball goes with the man who has it.
  if (held && shown.ball) shown.ball = [at[0] + boff(), at[1] - boff()];
  shown[key] = at;
  moved[drag.side][drag.role] = at;
  draw();
 });
 const drop = () => {
  if (!drag) return;
  nodes[drag.side][drag.role]?.classList.remove('is-drag');
  svg.classList.remove('is-dragging');
  drag = null;
  goal = scene();
  draw();
  words();
 };
 svg.addEventListener('pointerup', drop);
 svg.addEventListener('pointercancel', drop);
 x.on('[data-do="reset"]', () => { moved = { us: {}, them: {} }; show(); });
 x.on('[data-do="ask"]', () => {
  const list = [];
  for (const side of ['us', 'them']) for (const [r0, at] of Object.entries(moved[side])) {
   const v = goal[side][r0];
   list.push(say('movedOne', { team: say(side === 'us' ? 'ours' : 'theirs'), who: v?.name && v.name !== roleName(r0) && v.name !== r0 ? `${v.name} (${roleName(r0)})` : roleName(r0), x: Math.round(at[0]), y: Math.round(at[1]) }));
  }
  x.act(say('moved', { where: say(S.where), title: d.title || '', phase: phases[phase].name || '', list: list.join('; ') }));
 });
 x.on('[data-do="redo"]', () => x.act(say('redoAsk', { us: named(form.us || own_.us), them: named(form.them || own_.them) })));

 x.relayout(() => { ground(); draw(); });
 x.after(() => { ground(); show(true); });
});

// Players compared: a web of their ratings when every number is a rating out of 100 and there are three to eight of
// them; bars, each scaled to the best in its row, otherwise. Tapping a player takes him in or out of the comparison.
const TONE = ['255, 159, 90', '92, 148, 255', '124, 214, 162', '240, 171, 252'];
Blocks.add('players', (card, d, x) => {
 const players = (d.players || []).filter(p => p && p.name).slice(0, 6);
 const names = [];
 for (const p of players) for (const key of Object.keys(p.stats || {})) if (!names.includes(key)) names.push(key);
 const low = new Set((d.lower || []).map(String));
 const units = d.units || {};
 const value = (p, key) => { const v = Number(p.stats?.[key]); return Number.isFinite(v) ? v : null; };
 // Ratings: whole numbers out of 100 in every row, each row reaching at least 40 (goals, assists or xG never do all
 // of that); the agent may also say which with chart: "web" or "bars".
 const whole = players.every(p => names.every(n => { const v = value(p, n); return v == null || (Number.isInteger(v) && v >= 0 && v <= 100); }));
 const high = names.every(n => Math.max(...players.map(p => value(p, n) ?? 0)) >= 40);
 const ratings = d.chart === 'web' || (d.chart !== 'bars' && names.length >= 3 && names.length <= 8 && whole && high);
 let on = players.map((_, i) => i < 2 || players.length <= 3);
 if (!on.some(Boolean) && players.length) on[0] = true;
 const toneOf = i => TONE[players.slice(0, i).length % TONE.length];
 card.innerHTML = `
  <div class="bk-head"><div class="bk-title">${esc(d.title || '')}</div>${d.meta ? `<div class="bk-meta">${esc(d.meta)}</div>` : ''}</div>
  <div class="pl-who">${players.map((p, i) => `<button class="pl-chip" data-i="${i}" style="--tone:${toneOf(i)}">${p.image ? `<span class="pl-face" style="background-image:url(&quot;${esc(p.image)}&quot;)"></span>` : '<i></i>'}<span class="pl-chip-text"><span class="bk-name">${esc(p.name)}</span>${p.meta || p.rating ? `<span class="bk-meta">${esc([p.rating, p.meta].filter(Boolean).join(' · '))}</span>` : ''}</span></button>`).join('')}</div>
  ${ratings ? '<div class="pl-web"><svg class="pl-web-svg"></svg></div>' : ''}
  <div class="pl-rows"></div>
  ${d.note ? `<div class="pt-say">${esc(d.note)}</div>` : ''}
  ${d.source ? `<div class="bk-src">${esc(typeof d.source === 'string' ? d.source : d.source.name || '')}</div>` : ''}`;
 const web = card.querySelector('.pl-web-svg');
 let pick = -1;
 function drawWeb() {
  if (!web) return;
  const w = Math.min(320, card.clientWidth - 36), h = w * 0.86, cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 30;
  web.setAttribute('viewBox', `0 0 ${w} ${h}`);
  web.style.width = `${w}px`; web.style.height = `${h}px`;
  const n = names.length, ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n, P = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
  let s = '';
  for (const ring of [0.25, 0.5, 0.75, 1]) s += `<path class="pl-ring" d="${names.map((_, i) => `${i ? 'L' : 'M'}${P(i, ring).join(' ')}`).join('')}Z"/>`;
  names.forEach((name, i) => {
   const [ex, ey] = P(i, 1), [lx, ly] = P(i, 1.18);
   s += `<path class="pl-spoke" d="M${cx} ${cy}L${ex} ${ey}"/><text class="pl-axis${i === pick ? ' is-on' : ''}" x="${lx}" y="${ly + 4}" text-anchor="${Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end'}">${esc(name)}</text>`;
  });
  players.forEach((p, j) => {
   if (!on[j]) return;
   const pts = names.map((name, i) => P(i, (value(p, name) ?? 0) / 100 * grow));
   s += `<path class="pl-shape" style="--tone:${toneOf(j)}" d="${pts.map((q, i) => `${i ? 'L' : 'M'}${q.join(' ')}`).join('')}Z"/>`;
   if (pick >= 0) { const q = pts[pick]; s += `<circle class="pl-dot" style="--tone:${toneOf(j)}" cx="${q[0]}" cy="${q[1]}" r="3.5"/>`; }
  });
  web.innerHTML = s;
 }
 // A new card's shapes grow out of the middle by their points, not by a scale of the layer.
 let grow = 1;
 const growUp = () => { if (!web || !card._fresh || reduced()) return; const t0 = performance.now(); const f = now => { grow = ease(Math.min(1, (now - t0) / 620)); drawWeb(); if (grow < 1 && card.isConnected) requestAnimationFrame(f); }; grow = 0; requestAnimationFrame(f); };
 function rows() {
  const live = players.map((p, i) => ({ p, i })).filter(o => on[o.i]);
  card.querySelector('.pl-rows').innerHTML = names.map((name, k) => {
   const vals = live.map(o => value(o.p, name)).filter(v => v != null);
   const top = low.has(name) ? Math.min(...vals) : Math.max(...vals), most = Math.max(...vals, 0) || 1;
   return `<div class="pl-row${k === pick ? ' is-on' : ''}" data-k="${k}"><div class="pl-row-name">${esc(name)}</div><div class="pl-bars">${live.map(o => {
    const v = value(o.p, name);
    const best = v != null && vals.length > 1 && v === top;
    return `<div class="pl-bar" style="--tone:${toneOf(o.i)}"><i style="width:${v == null ? 0 : Math.max(3, (ratings ? v / 100 : v / most) * 100)}%"></i><b class="${best ? 'is-best' : ''}">${v == null ? '—' : `${v}${units[name] || ''}`}</b></div>`;
   }).join('')}</div></div>`;
  }).join('');
 }
 const paint = (first = false) => {
  card.querySelectorAll('.pl-chip').forEach((c, i) => c.classList.toggle('is-on', on[i]));
  rows(); drawWeb(); if (first) growUp();
 };
 card.querySelector('.pl-who').addEventListener('click', e => {
  const c = e.target.closest('.pl-chip');
  if (!c) return;
  const i = Number(c.dataset.i);
  if (on[i] && on.filter(Boolean).length === 1) return;
  on[i] = !on[i];
  paint();
 });
 card.querySelector('.pl-rows').addEventListener('pointerover', e => { const row = e.target.closest('.pl-row'); const k = row ? Number(row.dataset.k) : -1; if (k !== pick) { pick = k; card.querySelectorAll('.pl-row').forEach(rw => rw.classList.toggle('is-on', Number(rw.dataset.k) === pick)); drawWeb(); } });
 card.querySelector('.pl-rows').addEventListener('pointerleave', () => { pick = -1; card.querySelectorAll('.pl-row').forEach(rw => rw.classList.remove('is-on')); drawWeb(); });
 x.relayout(() => drawWeb());
 x.after(() => paint(true));
});
// For the tests: how a formation is laid out and how a role written by the agent is read, football's and each sport's.
const FOOT = kit(SPORTS.football);
window.PitchKit = { formation: FOOT.formation, roleOf: FOOT.roleOf, FORMS: FOOT.FORMS, guess: d => Object.keys(SPORTS).find(id => SPORTS[id] === sportFor(d)), sport: text => ({ ...kit(sportOf(text)), id: Object.keys(SPORTS).find(id => SPORTS[id] === sportOf(text)), L: sportOf(text).L, H: sportOf(text).H }) };
})();
