'use strict';
// The calendar (calendar-core.js, calendar-words.js, calendar-ics.js): days and zones, repeats as RFC 5545 has them
// (its own examples), entries' times, what words the user types mean, and calendars read from iCalendar files. Real
// source, no window and no network.
process.env.TZ = 'Europe/Paris';
const path = require('node:path');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'calendar-core.js'));
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
const day = w => `${C.dayKey(w)} ${C.pad(w.h)}:${C.pad(w.mi)}`;
const walls = (rule, start, opts) => C.expand(C.parseRule(rule, { zone: opts?.zone }), start, opts).map(day);
const at = (y, m, d, h = 0, mi = 0) => ({ y, m, d, h, mi });

// RFC 5545's own examples.
check('WKST=MO: every other week on Tuesday and Sunday', walls('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO', at(1997, 8, 5, 9)), ['1997-08-05 09:00', '1997-08-10 09:00', '1997-08-19 09:00', '1997-08-24 09:00']);
check('WKST=SU gives other days', walls('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU', at(1997, 8, 5, 9)), ['1997-08-05 09:00', '1997-08-17 09:00', '1997-08-19 09:00', '1997-08-31 09:00']);
check('30 February is no day and is not counted', walls('FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5', at(2007, 1, 15, 9)), ['2007-01-15 09:00', '2007-01-30 09:00', '2007-02-15 09:00', '2007-03-15 09:00', '2007-03-30 09:00']);
check('Every other day, ten times', walls('FREQ=DAILY;COUNT=10;INTERVAL=2', at(1997, 9, 2, 9)).length, 10);
check('The last weekday of the month', walls('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3', at(1997, 9, 30, 9)), ['1997-09-30 09:00', '1997-10-31 09:00', '1997-11-28 09:00']);
check('The first Friday of every month', walls('FREQ=MONTHLY;BYDAY=1FR;COUNT=3', at(1997, 9, 5, 9)), ['1997-09-05 09:00', '1997-10-03 09:00', '1997-11-07 09:00']);
check('The last day of every month', walls('FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3', at(2026, 1, 31, 10)), ['2026-01-31 10:00', '2026-02-28 10:00', '2026-03-31 10:00']);
check('Yearly in January on Sundays at 8:30 and 9:30, every other year', walls('FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYDAY=SU;BYHOUR=8,9;BYMINUTE=30;COUNT=4', at(1997, 1, 5, 8, 30)), ['1997-01-05 08:30', '1997-01-05 09:30', '1997-01-12 08:30', '1997-01-12 09:30']);
check('Every year on the first time\'s day', walls('FREQ=YEARLY;COUNT=3', at(2024, 2, 29, 12)), ['2024-02-29 12:00', '2028-02-29 12:00', '2032-02-29 12:00']);
check('UNTIL is the last one a repeat may fall on', walls('FREQ=DAILY;UNTIL=20261127T080000Z', at(2026, 11, 24, 9)), ['2026-11-24 09:00', '2026-11-25 09:00', '2026-11-26 09:00', '2026-11-27 09:00']);
check('The first time counts even if the rule would not give it', walls('FREQ=WEEKLY;BYDAY=MO;COUNT=2', at(2026, 11, 24, 9)), ['2026-11-24 09:00', '2026-11-30 09:00']);
check('A rule round-trips through its text', C.formatRule(C.parseRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=-1FR;COUNT=5')), 'FREQ=MONTHLY;INTERVAL=2;COUNT=5;BYDAY=-1FR');
check('A rule by the week number is not taken', C.parseRule('FREQ=YEARLY;BYWEEKNO=20'), null);

// Zones and the clock's changes (Paris: 29 March 2026 02:00 → 03:00, 25 October 2026 03:00 → 02:00).
check('Paris in winter is UTC+1, in summer UTC+2', [C.offset(Date.UTC(2026, 0, 10), 'Europe/Paris'), C.offset(Date.UTC(2026, 6, 10), 'Europe/Paris')], [60, 120]);
check('A wall time in New York as a moment', new Date(C.toMoment(at(2026, 11, 24, 9), 'America/New_York')).toISOString(), '2026-11-24T14:00:00.000Z');
check('A time the clock skips is read with the offset before the jump', new Date(C.toMoment(at(2026, 3, 29, 2, 30), 'Europe/Paris')).toISOString(), '2026-03-29T01:30:00.000Z');
check('A time the clock shows twice is the first of the two', new Date(C.toMoment(at(2026, 10, 25, 2, 30), 'Europe/Paris')).toISOString(), '2026-10-25T00:30:00.000Z');
check('A moment as a wall time in Tokyo', day(C.toWall(Date.UTC(2026, 10, 24, 15, 40), 'Asia/Tokyo')), '2026-11-25 00:40');
check('Every day at 9 stays at 9 across the change of the clock', C.occurrences({ date: '2026-03-27', time: '09:00', dur: 30, rule: { freq: 'daily' } }, Date.UTC(2026, 2, 27), Date.UTC(2026, 2, 31)).map(o => new Date(o.start).toISOString()),
 ['2026-03-27T08:00:00.000Z', '2026-03-28T08:00:00.000Z', '2026-03-29T07:00:00.000Z', '2026-03-30T07:00:00.000Z']);
const vtz = { observances: [
 { start: at(1970, 3, 29, 2), rule: C.parseRule('FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU'), from: 60, to: 120 },
 { start: at(1970, 10, 25, 3), rule: C.parseRule('FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU'), from: 120, to: 60 },
] };
check('A zone a calendar describes itself (Outlook\'s "Romance Standard Time")', [new Date(C.toMoment(at(2026, 1, 10, 9), vtz)).toISOString(), new Date(C.toMoment(at(2026, 7, 10, 9), vtz)).toISOString(), C.offset(Date.UTC(2026, 6, 10, 7), vtz)], ['2026-01-10T08:00:00.000Z', '2026-07-10T07:00:00.000Z', 120]);

// Entries' times.
const week = [Date.UTC(2026, 10, 23), Date.UTC(2026, 10, 30)];
check('A run on Monday, Wednesday and Friday at 9, this week', C.occurrences({ date: '2026-11-25', time: '09:00', dur: 60, rule: { freq: 'weekly', byday: [{ n: 0, day: 1 }, { n: 0, day: 3 }, { n: 0, day: 5 }] } }, ...week).map(o => o.key), ['2026-11-25T09:00', '2026-11-27T09:00']);
check('A day left out of a repeat', C.occurrences({ date: '2026-11-24', time: '08:00', dur: 15, rule: { freq: 'daily' }, exdates: ['2026-11-25T08:00'] }, ...week).map(o => o.key), ['2026-11-24T08:00', '2026-11-26T08:00', '2026-11-27T08:00', '2026-11-28T08:00', '2026-11-29T08:00']);
const movedOne = C.occurrences({ date: '2026-11-24', time: '08:00', dur: 15, rule: { freq: 'daily', count: 3 }, moved: { '2026-11-25T08:00': { time: '10:30' }, '2026-11-26T08:00': { cancelled: true } } }, ...week);
check('One repeat moved and one called off, the rest as they were', movedOne.map(o => [o.key, o.day, C.pad(C.toWall(o.start).h) + ':' + C.pad(C.toWall(o.start).mi)]), [['2026-11-24T08:00', '2026-11-24', '08:00'], ['2026-11-25T08:00', '2026-11-25', '10:30']]);
const whole = C.occurrences({ date: '2026-11-28', days: 2 }, ...week);
check('A two-day entry with no time', whole.map(o => [o.day, o.allDay, (o.end - o.start) / C.DAY]), [['2026-11-28', true, 2]]);
check('An entry that began before the range still shows', C.occurrences({ date: '2026-11-22', days: 3 }, ...week).length, 1);
check('A task with no date has no times', C.occurrences({ title: 'x' }, ...week), []);
check('The next time a repeat begins', C.nextStart({ date: '2026-11-02', time: '09:00', rule: { freq: 'weekly', byday: [{ n: 0, day: 1 }] } }, Date.UTC(2026, 10, 24, 12))?.key, '2026-11-30T09:00');
check('A daily repeat from years ago is quick to find', (() => { const t0 = Date.now(); const list = C.occurrences({ date: '2010-01-01', time: '07:00', rule: { freq: 'daily' } }, ...week); return [list.length, Date.now() - t0 < 200]; })(), [7, true]);

module.exports = { check, results, C, at };
// A task whose day has passed is looked up with no end (the list of overdue and later tasks): a time in a named zone
// must not reach past the last date a moment can hold.
check('An entry with a time in a zone, looked up with no end', C.occurrences({ date: '2026-11-23', time: '16:00', zone: 'Europe/Paris' }, 0, 8.64e15, { limit: 1 }).map(o => new Date(o.start).toISOString()), ['2026-11-23T15:00:00.000Z']);
if (require.main === module) {
 try { require('./calendar-words-check.cjs')(check); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
 try { require('./calendar-ics-check.cjs')(check); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
 const failed = results.filter(result => !result.pass);
 for (const result of results) console.log(`${result.pass ? 'ok  ' : 'FAIL'} ${result.name}${result.pass ? '' : `\n     got      ${JSON.stringify(result.actual)}\n     expected ${JSON.stringify(result.expected)}`}`);
 console.log(`${results.length - failed.length}/${results.length} calendar checks passed`);
 process.exit(failed.length ? 1 : 0);
}
