// Screentimer – reine Rechenlogik (keine UI, kein Netzwerk). Wird in Node getestet.

export const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const DAY_NAMES_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const HOUR_MIN = 60; // Richtwert Tagesuhr

const pad = (n) => (n < 10 ? '0' : '') + n;

// Montag 00:00 (lokale Zeit) der Woche, in der `now` liegt
export function weekStart(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mo = 0 … So = 6
  d.setDate(d.getDate() - dow);
  return d;
}

// Beginn jedes der 8 Tagesgrenzen Mo 00:00 … nächster Mo 00:00 (DST-sicher über setDate)
export function dayBounds(now) {
  const ws = weekStart(now);
  const out = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(ws);
    d.setDate(ws.getDate() + i);
    out.push(d.getTime());
  }
  return out;
}

export function dayIndex(now) {
  return (new Date(now).getDay() + 6) % 7;
}

// Sekunden je Wochentag aus Einheiten; laufende Einheit zählt bis `now`
export function secondsPerDay(sessions, now) {
  const b = dayBounds(now);
  const t = new Date(now).getTime();
  const days = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) {
    const a = new Date(s.started_at).getTime();
    const e = s.ended_at ? new Date(s.ended_at).getTime() : t;
    for (let i = 0; i < 7; i++) {
      const lo = Math.max(a, b[i]);
      const hi = Math.min(e, b[i + 1], t);
      if (hi > lo) days[i] += (hi - lo) / 1000;
    }
  }
  return days;
}

// Alle Kennzahlen für die Startseite, in Minuten (mit Nachkommastellen für flüssige Anzeige)
export function summarize(sessions, now, budgetMin = 420) {
  const secs = secondsPerDay(sessions, now);
  const days = secs.map((s) => s / 60);
  const ti = dayIndex(now);
  const before = days.slice(0, ti).reduce((a, b) => a + b, 0);
  const today = days[ti];
  const week = before + today;
  // Wochenrest auf ganze Minuten, damit „noch …“ und „… verbraucht“ zusammen genau das Budget ergeben
  const rem = budgetMin - Math.floor(week + 1e-6);
  const frame = Math.max(0, Math.min(HOUR_MIN, budgetMin - before)); // Tagesrahmen
  const yellow = Math.max(0, frame - today);
  const red = Math.max(0, today - frame);
  const weekOver = Math.max(0, -rem);
  const daysLeft = 6 - ti; // Tage nach heute bis Sonntag
  const perDay = daysLeft > 0 ? Math.floor(Math.max(0, rem) / daysLeft) : null;
  const running = sessions.find((s) => !s.ended_at) || null;
  const runningSec = running ? Math.max(0, (new Date(now).getTime() - new Date(running.started_at).getTime()) / 1000) : 0;
  return { days, ti, before, today, week, rem, frame, yellow, red, weekOver, daysLeft, perDay, running, runningSec, budgetMin };
}

// „3 h 20 min“, „45 min“, „2 h“ – abgerundet auf ganze Minuten
export function fmtMin(m) {
  const t = Math.max(0, Math.floor(m + 1e-6));
  const h = Math.floor(t / 60), r = t % 60;
  if (!h) return r + ' min';
  return r ? h + ' h ' + pad(r) + ' min' : h + ' h';
}

// „1:35“ für Tagesbalken
export function fmtClock(m) {
  const t = Math.max(0, Math.floor(m + 1e-6));
  return Math.floor(t / 60) + ':' + pad(t % 60);
}

// Stoppuhr „23:41“ bzw. „1:02:13“
export function fmtWatch(sec) {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}

export function fmtTime(d) {
  const x = new Date(d);
  return pad(x.getHours()) + ':' + pad(x.getMinutes());
}

// „Do–So“ bzw. „So“
export function restRange(ti) {
  const left = 6 - ti;
  if (left <= 0) return '';
  return left > 1 ? DAY_NAMES[ti + 1] + '–So' : 'So';
}

// Füllgrad der 7 Stundenkästchen (verbraucht, 0–100 %)
export function hourCells(weekMin, budgetMin = 420) {
  const n = Math.max(1, Math.round(budgetMin / 60));
  const cells = [];
  for (let i = 0; i < n; i++) cells.push(Math.max(0, Math.min(60, weekMin - i * 60)) / 60 * 100);
  return cells;
}

// SVG-Pfad eines Keils ab 12 Uhr; dir -1 = gegen den Uhrzeigersinn
export function wedgePath(frac, dir = -1, cx = 160, cy = 160, R = 104) {
  if (frac <= 0) return '';
  if (frac >= 1) return `M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx} ${cy + R}A${R} ${R} 0 1 1 ${cx} ${cy - R}Z`;
  const a = frac * 2 * Math.PI;
  const x = (cx + dir * R * Math.sin(a)).toFixed(2);
  const y = (cy - R * Math.cos(a)).toFixed(2);
  return `M${cx} ${cy}L${cx} ${cy - R}A${R} ${R} 0 ${frac > 0.5 ? 1 : 0} ${dir > 0 ? 1 : 0} ${x} ${y}Z`;
}

// Einheiten einer Woche, nach Tag gruppiert (neueste Tage zuerst), für die Eintragsliste
export function groupByDay(sessions, now) {
  const b = dayBounds(now);
  const groups = [];
  for (let i = 6; i >= 0; i--) {
    const items = sessions
      .filter((s) => {
        const a = new Date(s.started_at).getTime();
        return a >= b[i] && a < b[i + 1];
      })
      .sort((x, y) => new Date(y.started_at) - new Date(x.started_at));
    // Einheiten, die vor Wochenbeginn starteten, landen beim Montag
    if (i === 0) {
      for (const s of sessions) if (new Date(s.started_at).getTime() < b[0]) items.push(s);
    }
    if (items.length) groups.push({ ti: i, items });
  }
  return groups;
}

// Datum + Uhrzeit (lokal) → Date; Ende vor Start heißt: über Mitternacht
export function combine(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function toDateInput(d) {
  const x = new Date(d);
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}
