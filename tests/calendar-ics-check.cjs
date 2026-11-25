'use strict';
// Calendars read from iCalendar text (calendar-ics.js): as Google, iCloud and Outlook write them.
const path = require('node:path');
const I = require(path.join(__dirname, '..', 'calendar-ics.js'));
const C = require(path.join(__dirname, '..', 'calendar-core.js'));
const crlf = text => text.trim().split('\n').map(l => l.replace(/^\s{2}/, '')).join('\r\n');
const clockOf = ms => { const w = C.toWall(ms); return `${C.dayKey(w)} ${C.pad(w.h)}:${C.pad(w.mi)}`; };
const week = [Date.UTC(2026, 10, 23), Date.UTC(2026, 10, 30)];

const GOOGLE = crlf(String.raw`
  BEGIN:VCALENDAR
  PRODID:-//Google Inc//Google Calendar 70.9054//EN
  VERSION:2.0
  X-WR-CALNAME:Работа
  X-WR-TIMEZONE:Europe/Paris
  BEGIN:VEVENT
  DTSTART;TZID=Europe/Paris:20261102T100000
  DTEND;TZID=Europe/Paris:20261102T103000
  RRULE:FREQ=WEEKLY;BYDAY=MO,WE
  EXDATE;TZID=Europe/Paris:20261125T100000
  UID:standup@google.com
  SUMMARY:Стендап\, команда
  DESCRIPTION:Ссылка: https://meet.example/abc\nВторая строка
  BEGIN:VALARM
  ACTION:DISPLAY
  TRIGGER:-PT10M
  END:VALARM
  END:VEVENT
  BEGIN:VEVENT
  DTSTART;TZID=Europe/Paris:20261130T113000
  DTEND;TZID=Europe/Paris:20261130T120000
  RECURRENCE-ID;TZID=Europe/Paris:20261130T100000
  UID:standup@google.com
  SUMMARY:Стендап (перенесён)
  END:VEVENT
  BEGIN:VEVENT
  DTSTART:20261126T170000Z
  DTEND:20261126T180000Z
  UID:call@google.com
  SUMMARY:Call with a very long title that Google folds over several lines because it is longer than seve
   nty-five octets
  END:VEVENT
  BEGIN:VEVENT
  DTSTART;VALUE=DATE:20261128
  DTEND;VALUE=DATE:20261130
  UID:trip@google.com
  SUMMARY:Поездка в Лион
  END:VEVENT
  END:VCALENDAR`);

const OUTLOOK = crlf(String.raw`
  BEGIN:VCALENDAR
  VERSION:2.0
  BEGIN:VTIMEZONE
  TZID:Some Odd Zone
  BEGIN:STANDARD
  DTSTART:16010101T030000
  TZOFFSETFROM:+0200
  TZOFFSETTO:+0100
  RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
  END:STANDARD
  BEGIN:DAYLIGHT
  DTSTART:16010101T020000
  TZOFFSETFROM:+0100
  TZOFFSETTO:+0200
  RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
  END:DAYLIGHT
  END:VTIMEZONE
  BEGIN:VEVENT
  DTSTART;TZID=Romance Standard Time:20261124T090000
  DTEND;TZID=Romance Standard Time:20261124T100000
  UID:a@outlook
  SUMMARY:Outlook zone by its Windows name
  END:VEVENT
  BEGIN:VEVENT
  DTSTART;TZID="Some Odd Zone":20260710T090000
  DURATION:PT45M
  UID:b@outlook
  SUMMARY:Zone the calendar describes
  STATUS:CONFIRMED
  END:VEVENT
  BEGIN:VEVENT
  DTSTART;TZID=Europe/Paris:20261127T090000
  UID:c@outlook
  SUMMARY:Called off
  STATUS:CANCELLED
  END:VEVENT
  BEGIN:VTODO
  UID:t1
  SUMMARY:Сдать отчёт
  DUE;VALUE=DATE:20261127
  STATUS:NEEDS-ACTION
  END:VTODO
  END:VCALENDAR`);

module.exports = check => {
 const g = I.parse(GOOGLE);
 check('A Google calendar: its name and entries', [g.name, g.entries.length, g.skipped], ['Работа', 3, 0]);
 const standup = g.entries.find(e => e.uid === 'standup@google.com');
 check('Escaped text reads as written', [standup.title, standup.note], ['Стендап, команда', 'Ссылка: https://meet.example/abc\nВторая строка']);
 check('Its zone, length, reminder and repeat', [standup.zone, standup.dur, standup.alarms, C.formatRule(standup.rule)], ['Europe/Paris', 30, [10], 'FREQ=WEEKLY;BYDAY=MO,WE']);
 const times = C.occurrences(standup, Date.UTC(2026, 10, 23), Date.UTC(2026, 11, 3));
 check('A day left out and one time moved', times.map(t => [clockOf(t.start), t.title || '']), [['2026-11-23 10:00', ''], ['2026-11-30 11:30', 'Стендап (перенесён)'], ['2026-12-02 10:00', '']]);
 const call = g.entries.find(e => e.uid === 'call@google.com');
 check('A folded line is one line; a UTC time shows in local time', [call.title.endsWith('seventy-five octets'), clockOf(C.occurrences(call, ...week)[0].start)], [true, '2026-11-26 18:00']);
 const trip = g.entries.find(e => e.uid === 'trip@google.com');
 check('All-day: the end day is not part of it', [trip.date, trip.time, trip.days], ['2026-11-28', null, 2]);
 const o = I.parse(OUTLOOK);
 const a = o.entries.find(e => e.uid === 'a@outlook'), b = o.entries.find(e => e.uid === 'b@outlook');
 check('A Windows zone name is its zone', [a.zone, clockOf(C.occurrences(a, ...week)[0].start)], ['Europe/Paris', '2026-11-24 09:00']);
 check('A zone the calendar describes, in summer', [b.dur, new Date(C.occurrences(b, Date.UTC(2026, 6, 9), Date.UTC(2026, 6, 11))[0].start).toISOString()], [45, '2026-07-10T07:00:00.000Z']);
 check('A called-off event is not shown', o.entries.some(e => e.uid === 'c@outlook'), false);
 const todo = o.entries.find(e => e.uid === 't1');
 check('A to-do is a task on its day', [todo.kind, todo.date, todo.done], ['task', '2026-11-27', false]);
 check('webcal:// addresses are https', I.address(' webcal://p01-caldav.icloud.com/published/2/abc '), 'https://p01-caldav.icloud.com/published/2/abc');
 check('Not an address', I.address('javascript:alert(1)'), '');
 check('Garbage reads as an empty calendar', I.parse('hello\nworld').entries.length, 0);
};
