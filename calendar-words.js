(root => {
'use strict';

// What the user types into the calendar's field means: «завтра в 9 пробежка», «звонок маме в пт 18:30 #семья»,
// «по пн, ср, пт в 7 зарядка», «meeting tomorrow 10-11», «cena venerdì alle 20», «dentiste mardi à 14h30». Russian,
// English, Italian and French are read at once (people mix them). Only what is sure is taken: a word that may be part of
// the title stays in it. What was understood is shown under the field before it is kept (calendar.js), so nothing the
// app misread is ever kept unseen.
//
// read(text, { now }) → { title, kind, date, time, dur, days, allDay, rule, remind, tag, priority, spans }
//   date 'YYYY-MM-DD' or null, time 'HH:MM' or null, dur in minutes or null, rule as calendar-core.js has it or null,
//   remind in minutes before or null, tag the word after # or null, priority 0..3, spans [{ from, to, what }] — the
//   parts of the text that were read as a time, a day and so on (the field shows them marked).

const Core = root.CalendarCore || (typeof require === 'function' ? require('./calendar-core.js') : null);

const MONTHS = [
 ['январ', 'янв', 'january', 'jan', 'gennaio', 'gen', 'janvier', 'janv'],
 ['феврал', 'фев', 'february', 'feb', 'febbraio', 'febbr', 'février', 'fevrier', 'févr'],
 ['март', 'мар', 'march', 'mar', 'marzo', 'mars'],
 ['апрел', 'апр', 'april', 'apr', 'aprile', 'avril', 'avr'],
 ['ма[йя]', 'may', 'maggio', 'mag', 'mai'],
 ['июн', 'june', 'jun', 'giugno', 'giu', 'juin'],
 ['июл', 'july', 'jul', 'luglio', 'lug', 'juillet', 'juil'],
 ['август', 'авг', 'august', 'aug', 'agosto', 'ago', 'août', 'aout'],
 ['сентябр', 'сен', 'сент', 'september', 'sep', 'sept', 'settembre', 'set', 'septembre'],
 ['октябр', 'окт', 'october', 'oct', 'ottobre', 'ott', 'octobre'],
 ['ноябр', 'нояб', 'ноя', 'november', 'nov', 'novembre'],
 ['декабр', 'дек', 'december', 'dec', 'dicembre', 'dic', 'décembre', 'decembre', 'déc'],
];
// Days of the week, 0 for Sunday. Short forms only where they cannot be a word of the title.
const WEEKDAYS = [
 ['воскресень[еяю]', 'вс', 'sunday', 'sun', 'domenica', 'dimanche'],
 ['понедельник[аи]?', 'пн', 'monday', 'mon', 'lunedì', 'lunedi', 'lundi'],
 ['вторник[аи]?', 'вт', 'tuesday', 'tue', 'tues', 'martedì', 'martedi', 'mardi'],
 ['сред[аыуе]', 'ср', 'wednesday', 'wed', 'mercoledì', 'mercoledi', 'mercredi'],
 ['четверг[аи]?', 'чт', 'thursday', 'thu', 'thur', 'thurs', 'giovedì', 'giovedi', 'jeudi'],
 ['пятниц[аыуе]', 'пт', 'friday', 'fri', 'venerdì', 'venerdi', 'vendredi'],
 ['суббот[аыуе]', 'сб', 'saturday', 'sat', 'sabato', 'samedi'],
];
const PLURAL_DAYS = [
 ['воскресеньям'], ['понедельникам'], ['вторникам'], ['средам'], ['четвергам'], ['пятницам'], ['субботам'],
];
const EN_PLURAL = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
const FR_PLURAL = ['dimanches', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis'];
// Words that make an entry an event (something to be at) rather than a task (something to do).
const EVENT_WORDS = /(^|[^\p{L}])(встреч\p{L}*|созвон\p{L}*|ужин\p{L}*|обед\p{L}*|завтрак\p{L}*|свидани\p{L}*|вечеринк\p{L}*|день рождения|концерт\p{L}*|приём|прием|конференци\p{L}*|урок\p{L}*|лекци\p{L}*|рейс|поезд|meeting|call|dinner|lunch|breakfast|party|birthday|concert|appointment|conference|class|lecture|flight|riunione|cena|pranzo|festa|compleanno|appuntamento|volo|réunion|reunion|dîner|diner|déjeuner|dejeuner|fête|fete|anniversaire|rendez-vous|rdv|vol)(?=$|[^\p{L}])/iu;

const L = '\\p{L}';
const B = `(?<![${L}\\p{N}])`, E = `(?![${L}\\p{N}])`;
const alt = words => words.join('|');
const NUM_WORDS = { 'один': 1, 'одну': 1, 'одна': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'un': 1, 'una': 1, 'uno': 1, 'due': 2, 'tre': 3, 'une': 1, 'deux': 2, 'trois': 3 };
const number = text => NUM_WORDS[String(text || '').toLowerCase()] ?? (parseInt(text, 10) || 1);
const UNIT = [
 [/^(мин|минут|minute|min|minuti|minuto)/i, 1],
 [/^(час|ч|hour|hr|h|or[ae]|heure)/i, 60],
 [/^(д(е|н)|day|giorn|jour)/i, 1440],
 [/^(недел|week|settiman|semaine)/i, 10080],
];
const unitMinutes = word => (UNIT.find(([test]) => test.test(word)) || [null, 1])[1];
const UNITS = '(?:мин(?:ут[уы]?|\\.)?|минуты|час(?:а|ов)?|ч\\.?|дн(?:я|ей)|день|недел[юиь]|minutes?|mins?|hours?|hrs?|h|days?|weeks?|minut[oi]|or[ae]|giorn[oi]|settiman[ae]|heures?|jours?|semaines?)';
const NUMBER = '(\\d+|один|одну|одна|два|две|три|четыре|пять|an?|one|two|three|un[ae]?|uno|due|tre|deux|trois)';
// Parts of the day, for a day named with no time: the hour they mean.
const PARTS = [
 [/^(утр|morning|mattin|matin)/i, 9], [/^(дн[ёе]м|днем|afternoon|pomeriggio|après-midi|apres-midi)/i, 14],
 [/^(вечер|evening|tonight|sera|stasera|soir)/i, 19], [/^(ноч|night|notte)/i, 22],
];

function read(text, { now = Date.now() } = {}) {
 const source = String(text || '');
 let rest = source;
 const spans = [];
 const out = { title: '', kind: 'task', date: null, time: null, dur: null, days: null, allDay: false, rule: null, remind: null, tag: null, priority: 0, spans };
 const today = Core.toWall(now);
 const todayDay = { y: today.y, m: today.m, d: today.d };
 let part = null, relative = null, end = null, explicitKind = null;
 // Takes the first match of a pattern out of what is left, marking where it was.
 const take = (pattern, what, handle) => {
  const regex = new RegExp(pattern, 'iu');
  const match = regex.exec(rest);
  if (!match) return false;
  if (handle(match) === false) return false;
  spans.push({ from: match.index, to: match.index + match[0].length, what });
  rest = rest.slice(0, match.index) + ' '.repeat(match[0].length) + rest.slice(match.index + match[0].length);
  return true;
 };
 const dayIndex = word => WEEKDAYS.findIndex(names => new RegExp(`^(?:${alt(names)})$`, 'iu').test(word));
 const pluralIndex = word => {
  const lower = word.toLowerCase();
  let k = PLURAL_DAYS.findIndex(names => names.includes(lower));
  if (k < 0) k = EN_PLURAL.indexOf(lower);
  if (k < 0) k = FR_PLURAL.indexOf(lower);
  return k >= 0 ? k : dayIndex(word);
 };
 const weekdayWord = `(?:${WEEKDAYS.map(alt).join('|')})`;
 const pluralWord = `(?:${[...PLURAL_DAYS.flat(), ...EN_PLURAL, ...FR_PLURAL].join('|')}|${weekdayWord})`;
 const clock = (h, mi, mark) => {
  h = +h; mi = +(mi || 0);
  const lower = String(mark || '').trim().toLowerCase().replace(/\./g, '');
  if (/^(pm|вечера|дня|di sera|del pomeriggio|du soir|de l'après-midi|de l'apres-midi)$/.test(lower) && h < 12) h += 12;
  if (/^(am|утра|ночи|di mattina|du matin)$/.test(lower) && h === 12) h = 0;
  return h <= 23 && mi <= 59 ? { h, mi } : null;
 };
 const MARK = "(\\s*(?:a\\.?m\\.?|p\\.?m\\.?)|\\s+(?:утра|дня|вечера|ночи|di mattina|di sera|del pomeriggio|du matin|du soir|de l'après-midi|de l'apres-midi))?";
 const AT = "(?:в|во|к|на|at|@|alle|all'|ore|à|a|vers)";

 // Repeats: whole phrases first, so their words are not read as single days.
 take(`${B}(?:каждый|каждую|каждое|every|ogni|chaque|tous les|toutes les)\\s+(\\d+|other|second[oa]?)\\s*${UNITS}${E}`, 'repeat', match => {
  const n = /other|second/i.test(match[1]) ? 2 : number(match[1]);
  const unit = unitMinutes(match[0].replace(/^\S+\s+\S+\s*/u, ''));
  const freq = unit >= 10080 ? 'weekly' : unit >= 1440 ? 'daily' : null;
  if (!freq) return false;
  out.rule = { freq, interval: n };
 });
 take(`${B}(?:каждый день|ежедневно|every ?day|daily|ogni giorno|tutti i giorni|tous les jours|chaque jour)${E}`, 'repeat', () => { out.rule = { freq: 'daily' }; });
 take(`${B}(?:по будням|в будни|каждый будний день|on weekdays|every weekday|weekdays|nei giorni feriali|dal lunedì al venerdì|en semaine|du lundi au vendredi)${E}`, 'repeat', () => { out.rule = { freq: 'weekly', byday: [1, 2, 3, 4, 5].map(day => ({ n: 0, day })) }; });
 take(`${B}(?:по выходным|в выходные|on weekends|every weekend|weekends|nel weekend|le week-end|les week-ends)${E}`, 'repeat', () => { out.rule = { freq: 'weekly', byday: [6, 0].map(day => ({ n: 0, day })) }; });
 // «по понедельникам и средам», «каждый пн, ср и пт», «every monday and friday», «tous les lundis».
 take(`${B}(?:по|каждый|каждую|каждое|every|on|ogni|il|chaque|tous les|le)\\s+(${pluralWord}(?:\\s*(?:,|и|and|e|et|&)\\s*${pluralWord})*)${E}`, 'repeat', match => {
  const words = match[1].split(/\s*(?:,|\s+и\s+|\s+and\s+|\s+e\s+|\s+et\s+|&)\s*/iu).filter(Boolean);
  const days = [...new Set(words.map(pluralIndex))].filter(k => k >= 0);
  if (!days.length) return false;
  // «on monday» alone is a day, not a repeat; «on mondays» is a repeat.
  if (/^(on|il|le)\s/i.test(match[0]) && !words.some(word => EN_PLURAL.includes(word.toLowerCase()) || FR_PLURAL.includes(word.toLowerCase()))) return false;
  out.rule = { freq: 'weekly', byday: days.map(day => ({ n: 0, day })) };
 });
 take(`${B}(?:каждую неделю|еженедельно|every week|weekly|ogni settimana|chaque semaine|toutes les semaines)${E}`, 'repeat', () => { out.rule = { freq: 'weekly' }; });
 take(`${B}(?:каждый месяц|ежемесячно|every month|monthly|ogni mese|chaque mois|tous les mois)${E}`, 'repeat', () => { out.rule = { freq: 'monthly' }; });
 take(`${B}(?:каждый год|ежегодно|every year|yearly|annually|ogni anno|chaque année|chaque annee|tous les ans)${E}`, 'repeat', () => { out.rule = { freq: 'yearly' }; });

 // A reminder: «напомни за 15 минут», «за час», «remind me 30 min before», «avvisami 10 minuti prima».
 take(`${B}(?:(?:напомни(?:ть)?|напоминание)\\s+)?за\\s+(?:${NUMBER}\\s*)?(полчаса|${UNITS})(?:\\s+до)?${E}`, 'remind', match => {
  out.remind = /полчаса/i.test(match[2]) ? 30 : number(match[1] || '1') * unitMinutes(match[2]);
 });
 take(`${B}(?:remind(?: me)?|alert(?: me)?|avvisami|ricordami|rappelle(?:-moi)?)\\s+(?:${NUMBER}\\s*)?(half an hour|${UNITS})\\s+(?:before|earlier|prima|avant)${E}`, 'remind', match => {
  out.remind = /half/i.test(match[2]) ? 30 : number(match[1] || '1') * unitMinutes(match[2]);
 });
 take(`${B}(?:напомни(?:ть)?|remind me|avvisami|ricordami|rappelle-moi)${E}`, 'remind', () => { if (out.remind == null) out.remind = 0; });

 // A tag and how much it matters.
 take(`(?:^|\\s)#([${L}\\p{N}][${L}\\p{N}_-]*)`, 'tag', match => { out.tag = match[1]; });
 take(`(?:^|\\s)(!{1,3})(?=\\s|$)`, 'priority', match => { out.priority = match[1].length; });
 take(`${B}(?:важно|срочно|urgent|important|urgente|importante)${E}`, 'priority', () => { out.priority = Math.max(out.priority, 2); });
 take(`${B}(?:весь день|целый день|all ?day|tutto il giorno|toute la journée|toute la journee)${E}`, 'time', () => { out.allDay = true; explicitKind = 'event'; });

 // Times from … to: «с 10 до 11:30», «10-11», «from 3pm to 4pm», «dalle 9 alle 10», «de 14h à 15h».
 const T = `(\\d{1,2})(?:[:.h](\\d{2}))?h?${MARK}`;
 take(`${B}(?:с|from|dalle|de)?\\s*${T}\\s*(?:-|–|—|до|to|till|until|alle|à|a)\\s*${T}${E}`, 'time', match => {
  const a = clock(match[1], match[2], match[3] || match[6]), b = clock(match[4], match[5], match[6]);
  if (!a || !b) return false;
  // «с 10 до 11» needs no mark; a bare «10-11» could be a date range or a number: only with times of day around.
  if (!/^(с|from|dalle|de)\s/i.test(match[0].trim()) && !match[2] && !match[5] && !match[3] && !match[6] && !/\d\s*[-–—]\s*\d/.test(match[0])) return false;
  out.time = Core.timeKey(a);
  let minutes = (b.h * 60 + b.mi) - (a.h * 60 + a.mi);
  // «с 7 до 9 вечера»: the mark of the end belongs to the start too.
  if (minutes < 0 && match[6] && !match[3] && a.h + 12 <= 23) { a.h += 12; out.time = Core.timeKey(a); minutes = (b.h * 60 + b.mi) - (a.h * 60 + a.mi); }
  if (minutes <= 0) minutes += 1440;
  out.dur = minutes;
  explicitKind = 'event';
 });
 // How long: «на час», «на 30 минут», «for 2 hours», «per un'ora», «pendant 45 minutes».
 take(`${B}(?:на|for|per|pendant|durant)\\s+(?:${NUMBER}\\s*)?(полчаса|half an hour|mezz'ora|une demi-heure|${UNITS})${E}`, 'time', match => {
  const unit = match[2];
  if (/полчаса|half|mezz|demi/i.test(unit)) out.dur = 30;
  else { const minutes = number(match[1] || '1') * unitMinutes(unit); if (minutes >= 1440) return false; out.dur = minutes; }
  explicitKind = 'event';
 });
 // In a while: «через 2 часа», «через 15 минут», «in 3 days», «tra 2 ore», «dans 10 minutes».
 take(`${B}(?:через|in|tra|fra|dans)\\s+(?:${NUMBER}\\s*)?(полчаса|half an hour|mezz'ora|une demi-heure|${UNITS})${E}`, 'date', match => {
  const unit = match[2];
  const minutes = /полчаса|half|mezz|demi/i.test(unit) ? 30 : number(match[1] || '1') * unitMinutes(unit);
  relative = minutes;
 });

 // Days by date: «25.11», «25/11/2026», «2026-11-25», «25 ноября», «nov 25», «25-го», «the 25th», «il 25», «le 25».
 const monthWord = `(${MONTHS.map(names => `(?:${alt(names)})`).join('|')})\\p{L}*\\.?`;
 const monthOf = word => MONTHS.findIndex(names => new RegExp(`^(?:${alt(names)})`, 'iu').test(word)) + 1;
 const setDate = (y, m, d, yearGiven) => {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= Core.daysIn(y, m))) return false;
  // A day with no year that has passed this year is next year's.
  if (!yearGiven && Core.dayNumber(y, m, d) < Core.dayNumber(todayDay.y, todayDay.m, todayDay.d)) { y += 1; if (d > Core.daysIn(y, m)) return false; }
  out.date = Core.dayKey({ y, m, d });
 };
 take(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`, 'date', match => setDate(+match[1], +match[2], +match[3], true));
 take(`${B}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${E}`, 'date', match => {
  const year = match[3] ? (match[3].length === 2 ? 2000 + +match[3] : +match[3]) : todayDay.y;
  return setDate(year, +match[2], +match[1], !!match[3]);
 });
 take(`${B}(\\d{1,2})(?:-?(?:го|е|ое)|st|nd|rd|th|er)?\\s+${monthWord}(?:\\s+(\\d{4}))?${E}`, 'date', match => {
  const k = monthOf(match[0].replace(/^\d{1,2}\S*\s+/u, ''));
  return setDate(match[match.length - 1] ? +match[match.length - 1] : todayDay.y, k, +match[1], !!match[match.length - 1]);
 });
 take(`${B}${monthWord}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, 'date', match => {
  const k = monthOf(match[0]);
  const nums = match[0].match(/\d+/g);
  return setDate(nums[1] ? +nums[1] : todayDay.y, k, +nums[0], !!nums[1]);
 });
 take(`${B}(?:(?:the|il|le)\\s+)?(\\d{1,2})(?:-?(?:го|ое)|st|nd|rd|th|er)${E}`, 'date', match => {
  let { y, m } = todayDay;
  const d = +match[1];
  if (d < todayDay.d) { m += 1; if (m > 12) { m = 1; y += 1; } }
  return setDate(y, m, d, true);
 });

 // Days by name: «сегодня», «завтра», «послезавтра», «today», «tonight», «domani», «après-demain».
 const WORD_DAYS = [
  [`послезавтра|day after tomorrow|dopodomani|après-demain|apres-demain`, 2],
  [`завтра|tomorrow|domani|demain`, 1],
  [`сегодня|today|tonight|oggi|stasera|aujourd'hui|aujourd’hui|ce soir`, 0],
 ];
 for (const [words, shift] of WORD_DAYS) {
  if (out.date) break;
  take(`${B}(?:${words})${E}`, 'date', match => {
   out.date = Core.dayKey(Core.addDays(todayDay, shift));
   if (/tonight|stasera|ce soir/i.test(match[0])) part = 19;
  });
 }
 // «в пятницу», «on friday», «next friday», «в следующий вторник», «venerdì», «vendredi prochain».
 if (!out.date) take(`${B}(?:(?:в|во|on|this|этот|эту|в эту|в этот)\\s+)?(?:(следующ\\p{L}*|next|prossim[oa]|prochain)\\s+)?(${weekdayWord})(?:\\s+(prossim[oa]|prochain))?${E}`, 'date', match => {
  const k = dayIndex(match[2]);
  if (k < 0) return false;
  let shift = (k - weekday(todayDay) + 7) % 7;
  if (match[1] || match[3]) { const daysToSunday = (7 - weekday(todayDay)) % 7; if (shift <= daysToSunday) shift += 7; }
  out.date = Core.dayKey(Core.addDays(todayDay, shift));
  if (out.rule?.freq === 'weekly' && !out.rule.byday) out.rule.byday = [{ n: 0, day: k }];
 });

 // A time of day: «в 9», «в 9:30», «9:30», «18.30», «9am», «at 7 pm», «alle 20», «à 14h30», «9h», «в 7 вечера».
 const takeTime = () => take(`${B}${AT}\\s*(\\d{1,2})(?:[:.h](\\d{2}))?h?(?:\\s*час\\p{L}*)?${MARK}${E}`, 'time', match => {
  const time = clock(match[1], match[2], match[3]);
  if (!time) return false;
  // «на 5» is not a time; «в 2026» is a year.
  if (/^на/i.test(match[0]) && !match[2]) return false;
  out.time = Core.timeKey(time);
 }) || take(`${B}(\\d{1,2})(?:[:.](\\d{2})|h(\\d{2})?)${MARK}${E}`, 'time', match => {
  const time = clock(match[1], match[2] || match[3], match[4]);
  if (!time) return false;
  out.time = Core.timeKey(time);
 }) || take(`${B}(\\d{1,2})\\s*(a\\.?m\\.?|p\\.?m\\.?)${E}`, 'time', match => {
  const time = clock(match[1], 0, match[2]);
  if (!time) return false;
  out.time = Core.timeKey(time);
 });
 if (!out.time) takeTime();
 if (!out.time) take(`${B}(?:в\\s+)?(полдень|noon|midday|mezzogiorno|midi|полночь|midnight|mezzanotte|minuit)${E}`, 'time', match => { out.time = /пол[дн]ень|noon|midday|mezzogiorno|midi/i.test(match[1]) ? '12:00' : '00:00'; });
 // A part of the day stands for an hour only when no time was given.
 take(`${B}(?:(?:с|по|in the|di|du|le)\\s+)?(утр\\p{L}*|дн[ёе]м|днем|вечер\\p{L}*|ноч\\p{L}*|morning|afternoon|evening|night|mattin[ao]|pomeriggio|sera|notte|matin|après-midi|apres-midi|soir)${E}`, 'time', match => {
  const hour = (PARTS.find(([test]) => test.test(match[1])) || [null, null])[1];
  if (hour == null) return false;
  if (!out.time) part = hour;
 });

 // In a while: a moment from now, its day and its time.
 if (relative != null && !out.date) {
  const wall = Core.toWall(now + relative * 60000);
  out.date = Core.dayKey(wall);
  if (relative < 1440 && !out.time) out.time = Core.timeKey({ h: wall.h, mi: wall.mi });
 }
 if (!out.time && part != null && out.date) out.time = Core.timeKey({ h: part, mi: 0 });
 // No day: the first one it can be from now — today if its time is still ahead (or it has none), else the next; for a
 // repeat on days of the week, the first of those days.
 if (!out.date && (out.time || out.rule)) {
  const days = out.rule?.byday?.map(item => item.day);
  const [h, mi] = out.time ? out.time.split(':').map(Number) : [24, 0];
  for (let shift = 0; shift < 8; shift++) {
   const day = Core.addDays(todayDay, shift);
   if (days?.length && !days.includes(weekday(day))) continue;
   if (shift === 0 && out.time && h * 60 + mi <= today.h * 60 + today.mi) continue;
   out.date = Core.dayKey(day);
   break;
  }
 }
 if (out.rule) out.rule = Core.clean(out.rule);

 // The title: what is left, without the little words that went with what was taken.
 const DANGLING = /^(?:в|во|на|к|с|до|по|и|at|on|in|by|to|for|and|alle|all'|il|la|le|à|a|de|du|et|e|,|-|–|—|:)$/iu;
 let words = rest.split(/\s+/).filter(Boolean);
 while (words.length && DANGLING.test(words[0])) words.shift();
 while (words.length && DANGLING.test(words[words.length - 1])) words.pop();
 // Inner leftovers like «встреча в с Анной» lose the lone preposition that belonged to a taken time.
 words = words.filter((word, k) => !(DANGLING.test(word) && k + 1 < words.length && DANGLING.test(words[k + 1])));
 out.title = words.join(' ').replace(/\s+([,.!?;:])/g, '$1').replace(/^[,.;:\s]+|[,;:\s]+$/g, '').trim();
 if (out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);
 out.kind = explicitKind || (EVENT_WORDS.test(out.title) && out.time ? 'event' : 'task');
 if (out.kind === 'event' && out.time && out.dur == null) out.dur = 60;
 if (out.allDay) out.time = null;
 spans.sort((a, b) => a.from - b.from);
 return out;
}

function weekday(day) {
 return Core.weekday(day);
}

const CalendarWords = { read };
if (typeof module === 'object' && module.exports) module.exports = CalendarWords;
else root.CalendarWords = CalendarWords;
})(typeof window === 'undefined' ? globalThis : window);
