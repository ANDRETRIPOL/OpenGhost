'use strict';
// What typed words mean (calendar-words.js), on Tuesday 24 November 2026 at 15:40 in Paris.
const path = require('node:path');
const W = require(path.join(__dirname, '..', 'calendar-words.js'));
const now = new Date(2026, 10, 24, 15, 40).getTime();
const pick = (text, keys = ['title', 'kind', 'date', 'time', 'dur', 'rule', 'remind', 'tag', 'priority']) => { const out = W.read(text, { now }); const o = {}; for (const k of keys) if (out[k] != null && out[k] !== 0 && out[k] !== false) o[k] = out[k]; return o; };
const MWF = { freq: 'weekly', byday: [{ n: 0, day: 1 }, { n: 0, day: 3 }, { n: 0, day: 5 }] };

module.exports = check => {
 check('завтра в 9 пробежка', pick('завтра в 9 пробежка'), { title: 'Пробежка', kind: 'task', date: '2026-11-25', time: '09:00' });
 check('Пробежка завтра в 9:30', pick('Пробежка завтра в 9:30'), { title: 'Пробежка', kind: 'task', date: '2026-11-25', time: '09:30' });
 check('A time already past today is tomorrow\'s', pick('позвонить маме в 10'), { title: 'Позвонить маме', kind: 'task', date: '2026-11-25', time: '10:00' });
 check('A time still ahead is today\'s', pick('позвонить маме в 18:30'), { title: 'Позвонить маме', kind: 'task', date: '2026-11-24', time: '18:30' });
 check('в 7 вечера', pick('ужин с Пьером в 7 вечера'), { title: 'Ужин с Пьером', kind: 'event', date: '2026-11-24', time: '19:00', dur: 60 });
 check('A weekday: the coming one', pick('звонок маме в пт 18:30 #семья'), { title: 'Звонок маме', kind: 'task', date: '2026-11-27', time: '18:30', tag: 'семья' });
 check('в следующую пятницу', pick('стоматолог в следующую пятницу в 14:00'), { title: 'Стоматолог', kind: 'task', date: '2026-12-04', time: '14:00' });
 check('A range of time makes an event', pick('встреча с Анной с 10 до 11:30 в четверг'), { title: 'Встреча с Анной', kind: 'event', date: '2026-11-26', time: '10:00', dur: 90 });
 check('A date by its month', pick('день рождения Лизы 3 декабря'), { title: 'День рождения Лизы', kind: 'task', date: '2026-12-03' });
 check('A date passed this year is next year\'s', pick('отпуск 10.03'), { title: 'Отпуск', kind: 'task', date: '2027-03-10' });
 check('A repeat on days of the week', pick('по пн, ср, пт в 7 зарядка'), { title: 'Зарядка', kind: 'task', date: '2026-11-25', time: '07:00', rule: MWF });
 check('по понедельникам и средам', pick('бассейн по понедельникам и средам в 19'), { title: 'Бассейн', kind: 'task', date: '2026-11-25', time: '19:00', rule: { freq: 'weekly', byday: [{ n: 0, day: 1 }, { n: 0, day: 3 }] } });
 check('каждый день', pick('Отжимания ×100 каждый день в 8'), { title: 'Отжимания ×100', kind: 'task', date: '2026-11-25', time: '08:00', rule: { freq: 'daily' } });
 check('по будням', pick('планёрка по будням в 9:30 на 15 минут'), { title: 'Планёрка', kind: 'event', date: '2026-11-25', time: '09:30', dur: 15, rule: { freq: 'weekly', byday: [1, 2, 3, 4, 5].map(day => ({ n: 0, day })) } });
 check('A reminder before', pick('стоматолог завтра в 14:30 напомни за 30 минут'), { title: 'Стоматолог', kind: 'task', date: '2026-11-25', time: '14:30', remind: 30 });
 check('за час', pick('поезд в пятницу в 8:10 за час'), { title: 'Поезд', kind: 'event', date: '2026-11-27', time: '08:10', dur: 60, remind: 60 });
 check('через 2 часа', pick('проверить духовку через 2 часа'), { title: 'Проверить духовку', kind: 'task', date: '2026-11-24', time: '17:40' });
 check('«до пятницы» is the day it is due', pick('отчёт до пятницы !!'), { title: 'Отчёт', kind: 'task', date: '2026-11-27', priority: 2 });
 check('No day, no time: a task in the list', pick('купить корм коту'), { title: 'Купить корм коту', kind: 'task' });
 check('Numbers that are part of the title stay', pick('Отжимания ×100'), { title: 'Отжимания ×100', kind: 'task' });
 check('весь день', pick('переезд 5 декабря весь день'), { title: 'Переезд', kind: 'event', date: '2026-12-05' });
 // English.
 check('meeting tomorrow 10-11', pick('meeting tomorrow 10-11'), { title: 'Meeting', kind: 'event', date: '2026-11-25', time: '10:00', dur: 60 });
 check('Lunch with Anna on friday at 1pm', pick('Lunch with Anna on friday at 1pm'), { title: 'Lunch with Anna', kind: 'event', date: '2026-11-27', time: '13:00', dur: 60 });
 check('every monday and wednesday', pick('gym every monday and wednesday at 7pm remind me 15 min before'), { title: 'Gym', kind: 'task', date: '2026-11-25', time: '19:00', rule: { freq: 'weekly', byday: [{ n: 0, day: 1 }, { n: 0, day: 3 }] }, remind: 15 });
 check('Dec 3', pick('Pay rent Dec 3'), { title: 'Pay rent', kind: 'task', date: '2026-12-03' });
 check('tonight', pick('call mom tonight'), { title: 'Call mom', kind: 'event', date: '2026-11-24', time: '19:00', dur: 60 });
 // Italian and French.
 check('cena venerdì alle 20', pick('cena venerdì alle 20'), { title: 'Cena', kind: 'event', date: '2026-11-27', time: '20:00', dur: 60 });
 check('dentiste mardi à 14h30', pick('dentiste mardi à 14h30'), { title: 'Dentiste', kind: 'task', date: '2026-11-24', time: '14:30' });
 check('tous les jours à 7h', pick('méditation tous les jours à 7h'), { title: 'Méditation', kind: 'task', date: '2026-11-25', time: '07:00', rule: { freq: 'daily' } });
 check('domani mattina', pick('chiamare Marco domani mattina'), { title: 'Chiamare Marco', kind: 'task', date: '2026-11-25', time: '09:00' });
 // Marks for the field.
 check('Spans mark what was read', W.read('завтра в 9 пробежка', { now }).spans.map(s => s.what), ['date', 'time']);
};
