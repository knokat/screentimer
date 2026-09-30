// Tests für js/logic.js – ausführen mit: TZ=Europe/Vienna node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, weekStart, fmtMin, fmtWatch, fmtClock, restRange, hourCells, secondsPerDay, groupByDay } from '../js/logic.js';

const at = (s) => new Date(s); // lokale Zeit (TZ=Europe/Vienna)
const sess = (a, b) => ({ started_at: at(a).toISOString(), ended_at: b ? at(b).toISOString() : null });

test('Woche beginnt Montag 00:00', () => {
  assert.equal(weekStart(at('2026-09-30T17:00')).toString(), at('2026-09-28T00:00').toString());
  assert.equal(weekStart(at('2026-10-04T23:59')).toString(), at('2026-09-28T00:00').toString());
  assert.equal(weekStart(at('2026-10-05T00:00')).toString(), at('2026-10-05T00:00').toString());
});

test('Zustand "Kein Timer" (Mi, 45 min heute)', () => {
  const s = [sess('2026-09-28T15:00', '2026-09-28T16:35'), sess('2026-09-29T15:00', '2026-09-29T16:20'), sess('2026-09-30T15:00', '2026-09-30T15:45')];
  const r = summarize(s, at('2026-09-30T17:30'));
  assert.equal(Math.round(r.today), 45);
  assert.equal(Math.round(r.rem), 200);
  assert.equal(Math.round(r.yellow), 15);
  assert.equal(r.red, 0);
  assert.equal(r.daysLeft, 4);
  assert.equal(fmtMin(r.perDay), '50 min');
  assert.equal(fmtMin(r.rem), '3 h 20 min');
  assert.equal(restRange(r.ti), 'Do–So');
});

test('Über der Stunde: roter Keil', () => {
  const s = [sess('2026-10-01T15:00', '2026-10-01T16:20')];
  const r = summarize(s, at('2026-10-01T18:00'));
  assert.equal(Math.round(r.red), 20);
  assert.equal(r.yellow, 0);
  assert.equal(r.weekOver, 0);
});

test('Woche fast leer: Tagesrahmen gedeckelt auf Wochenrest', () => {
  // bis Freitag 390 min
  const s = [sess('2026-09-28T10:00', '2026-09-28T16:30'), sess('2026-10-03T10:05', null)];
  const r = summarize(s, at('2026-10-03T10:17'));
  assert.equal(Math.round(r.frame), 30);
  assert.equal(Math.round(r.yellow), 18);
  assert.equal(Math.round(r.runningSec / 60), 12);
});

test('Woche überzogen', () => {
  const s = [sess('2026-09-28T10:00', '2026-09-28T16:30'), sess('2026-10-03T10:00', '2026-10-03T10:42')];
  const r = summarize(s, at('2026-10-03T12:00'));
  assert.equal(Math.round(r.weekOver), 12);
  assert.equal(Math.round(r.red), 12);
  assert.equal(r.perDay, 0);
});

test('Woche schon zu Tagesbeginn aufgebraucht → Uhr ab erster Minute rot', () => {
  const s = [sess('2026-09-28T09:00', '2026-09-28T16:10'), sess('2026-09-30T10:00', '2026-09-30T10:05')];
  const r = summarize(s, at('2026-09-30T11:00'));
  assert.equal(r.frame, 0);
  assert.equal(Math.round(r.red), 5);
});

test('Einheit über Mitternacht wird geteilt', () => {
  const d = secondsPerDay([sess('2026-09-29T23:30', '2026-09-30T00:20')], at('2026-09-30T12:00'));
  assert.equal(Math.round(d[1] / 60), 30);
  assert.equal(Math.round(d[2] / 60), 20);
});

test('Einheit über Sonntag 24:00: Rest zählt zur neuen Woche', () => {
  const s = [sess('2026-10-04T23:40', '2026-10-05T00:15')];
  const r = summarize(s, at('2026-10-05T08:00'));
  assert.equal(Math.round(r.week), 15);
  assert.equal(r.ti, 0);
});

test('Sonntag: keine Gleichverteilung', () => {
  const r = summarize([], at('2026-10-04T10:00'));
  assert.equal(r.daysLeft, 0);
  assert.equal(r.perDay, null);
  assert.equal(restRange(r.ti), '');
});

test('Sommerzeit-Umstellung (So 25.10.2026 hat 25 Stunden)', () => {
  const r = summarize([sess('2026-10-25T20:00', '2026-10-25T21:00')], at('2026-10-25T22:00'));
  assert.equal(Math.round(r.today), 60);
  assert.equal(weekStart(at('2026-10-25T22:00')).getDate(), 19);
});

test('Formatierung', () => {
  assert.equal(fmtMin(0), '0 min');
  assert.equal(fmtMin(59.9), '59 min');
  assert.equal(fmtMin(120), '2 h');
  assert.equal(fmtMin(244), '4 h 04 min');
  assert.equal(fmtWatch(1421), '23:41');
  assert.equal(fmtWatch(3733), '1:02:13');
  assert.equal(fmtClock(95), '1:35');
});

test('Stundenkästchen', () => {
  assert.deepEqual(hourCells(220).map(Math.round), [100, 100, 100, 67, 0, 0, 0]);
  assert.deepEqual(hourCells(500).map(Math.round), [100, 100, 100, 100, 100, 100, 100]);
});

test('Eintragsliste nach Tagen gruppiert, neuester Tag zuerst', () => {
  const s = [sess('2026-09-28T15:00', '2026-09-28T16:00'), sess('2026-09-30T15:00', '2026-09-30T15:45'), sess('2026-09-30T18:00', '2026-09-30T18:10')];
  const g = groupByDay(s, at('2026-09-30T20:00'));
  assert.equal(g[0].ti, 2);
  assert.equal(g[0].items.length, 2);
  assert.equal(g[1].ti, 0);
});
