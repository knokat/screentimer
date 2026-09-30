// Screentimer – App (Preact + htm, kein Build-Schritt)
import { html, render, useState, useEffect, useRef } from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
import { createSupabaseDb, createDemoDb } from './db.js';
import { FORGOTTEN_AFTER_MIN } from './config.js';
import {
  summarize, weekStart, fmtMin, fmtClock, fmtWatch, fmtTime, restRange, hourCells, wedgePath,
  groupByDay, combine, toDateInput, DAY_NAMES, DAY_NAMES_LONG,
} from './logic.js';

// ───────────── Gerät, Modus, PIN ─────────────
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privat */ } },
};
if (!DEMO) {
  if (params.has('kind')) store.set('st_mode', 'kind');   // dieses Gerät = Leanders iPad
  if (params.has('eltern')) store.set('st_mode', null);   // zurück zur Eltern-Ansicht
}
const IS_KID = params.has('kind') || (!DEMO && store.get('st_mode') === 'kind');
const PIN_KEY = 'st_pin';

// ───────────── Kleine Bausteine ─────────────
const Icon = {
  sliders: html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/></svg>`,
  list: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>`,
  play: html`<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>`,
  stop: html`<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor"/></svg>`,
  back: html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`,
  cal: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F2C12E" stroke-width="1.8" stroke-linecap="round" style="flex-shrink:0" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
};

// Tagesuhr-Skala (60 min), einmal berechnet
const TICKS = (() => {
  let major = '', minor = '';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * 2 * Math.PI, sn = Math.sin(a), co = Math.cos(a), big = i % 2 === 0;
    const r1 = big ? 112 : 119, r2 = 128;
    const seg = `M${(160 - r1 * sn).toFixed(1)} ${(160 - r1 * co).toFixed(1)}L${(160 - r2 * sn).toFixed(1)} ${(160 - r2 * co).toFixed(1)}`;
    if (big) major += seg; else minor += seg;
  }
  return { major, minor };
})();
const LABELS = [['0', 160, 22], ['10', 36, 94], ['20', 36, 238], ['30', 160, 310], ['40', 284, 238], ['50', 284, 94]];

function Dial({ s, size, cls }) {
  const over = s.red > 0;
  return html`
    <svg class=${cls || ''} width=${size} height=${size} viewBox="0 0 320 320" role="img"
      aria-label=${`Tagesuhr: heute ${fmtMin(s.today)} geschaut`}>
      <rect x="4" y="4" width="312" height="312" rx="64" style=${{ fill: 'var(--face)', stroke: over ? 'var(--red)' : 'var(--line)', strokeWidth: over ? 5 : 1.5 }}/>
      <path d=${TICKS.minor} style="fill:none;stroke:var(--muted);stroke-width:1.5;stroke-linecap:round"/>
      <path d=${TICKS.major} style="fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round"/>
      <path d=${wedgePath(s.yellow / 60, -1)} style="fill:#F2C12E"/>
      <path d=${wedgePath(Math.min(1, s.red / 60), -1)} style="fill:var(--red)"/>
      ${LABELS.map(([t, x, y]) => html`<text x=${x} y=${y} style="fill:var(--ink);font-size:18px;font-weight:800;text-anchor:middle">${t}</text>`)}
      <circle cx="160" cy="160" r="18" style="fill:var(--knob);stroke:var(--line);stroke-width:2"/>
      <rect x="16" y="282" width="72" height="24" rx="12" style="fill:#F2C12E"/>
      <text x="52" y="298.5" style="fill:#141414;font-size:12px;font-weight:800;text-anchor:middle">60 MIN</text>
    </svg>`;
}

function dialCaption(s, kid) {
  const base = `Heute ${fmtMin(s.today)} geschaut`;
  return s.red >= 1 ? `${base} · ${fmtMin(s.red)} über ${kid ? 'deiner' : 'der'} Stunde` : base;
}

function WeekCard({ s, kid }) {
  const H = kid ? 72 : 48;
  const cells = hourCells(s.week, s.budgetMin);
  const over = s.weekOver >= 1;
  return html`
    <section class="card week" aria-label="Diese Woche">
      <div class="row">
        <span style=${`font-size:${kid ? 18 : 14}px;font-weight:700`}>${kid ? 'Deine Woche' : 'Diese Woche'}</span>
        <span class=${over ? 'red' : 'muted'} style=${`font-size:${kid ? 17 : 13}px;font-weight:600`}>
          ${over ? `${fmtMin(s.weekOver)} überzogen` : `${fmtMin(s.week)} von ${fmtMin(s.budgetMin)} ${kid ? 'geschaut' : 'verbraucht'}`}
        </span>
      </div>
      <div class="cells">
        ${cells.map((u) => html`<div class="cell"><div style=${{ width: u + '%' }}></div></div>`)}
        ${over && html`<div class="over">+${Math.floor(s.weekOver)}</div>`}
      </div>
      <div class="bars">
        ${s.days.map((m, i) => {
          const future = i > s.ti, today = i === s.ti;
          const baseH = future ? (kid ? 4 : 3) : Math.max(kid ? 4 : 3, Math.round(Math.min(m, 60) / 120 * H));
          const topH = future ? 0 : Math.round(Math.max(0, Math.min(m, 120) - 60) / 120 * H);
          const r = kid ? 8 : 6;
          const color = today ? 'var(--ink)' : 'var(--muted)';
          const weight = today ? 800 : 400;
          return html`
            <div class="bar">
              <span class="num" style=${{ fontSize: kid ? 15 : 11.5, fontWeight: weight, color }}>${future ? '–' : fmtClock(m)}</span>
              <div class="barbox" style=${{ height: H }}>
                <div style=${{ height: topH, background: 'var(--red)', borderRadius: `${r}px ${r}px 0 0` }}></div>
                <div style=${{ height: baseH, background: today ? 'var(--ink)' : (future ? 'var(--line)' : 'var(--bar)'), borderRadius: topH ? `0 0 ${r}px ${r}px` : r }}></div>
                <div class="barline" style=${{ bottom: H / 2 }}></div>
              </div>
              <span style=${{ fontSize: kid ? 16 : 12, fontWeight: weight, color }}>${DAY_NAMES[i]}</span>
            </div>`;
        })}
      </div>
      <div class="legend">${kid
        ? 'Jedes Kästchen ist eine Stunde, gelb ist noch da. Die Linie zeigt eine Stunde pro Tag.'
        : 'Kästchen = 1 Stunde, gelb = noch übrig · Linie = 1 Stunde pro Tag'}</div>
    </section>`;
}

function perDayText(s) {
  return `${fmtMin(s.perDay)} pro Tag (${restRange(s.ti)})`;
}

// ───────────── Eltern: Startseite ─────────────
function ParentHome({ s, demo, busy, onStart, onStop, go }) {
  const run = !!s.running;
  const over = s.weekOver >= 1;
  const forgotten = run && s.runningSec / 60 >= FORGOTTEN_AFTER_MIN;
  return html`
    <main class="phone">
      <div class="topbar">
        ${run
          ? html`<div class="pill on"><span class="dot"></span>Läuft seit ${fmtTime(s.running.started_at)}</div>`
          : html`<div class="pill off">Kein Timer aktiv</div>`}
        <button class="iconbtn" aria-label="Einstellungen" onClick=${() => go({ name: 'settings' })}>${Icon.sliders}</button>
      </div>
      ${demo && html`<div class="card hint"><b>Demo</b><span class="muted">Beispieldaten, nichts wird gespeichert. PIN: 1234</span></div>`}
      ${forgotten && html`<div class="card hint red"><b>Läuft seit über ${Math.floor(FORGOTTEN_AFTER_MIN / 60)} Stunden – vergessen?</b></div>`}

      <div class="center" style="gap:8px">
        <${Dial} s=${s} size=${184}/>
        <div style="font-size:13px;font-weight:600" class=${s.red >= 1 ? 'red' : 'muted'}>${dialCaption(s, false)}</div>
      </div>

      ${run ? html`
        <div class="center" style="gap:4px">
          <div class="caps muted">Läuft gerade</div>
          <div class="num" style="font-size:56px;font-weight:800;line-height:1.05">${fmtWatch(s.runningSec)}</div>
          <div class=${over ? 'red' : ''} style="font-size:15px;font-weight:600">
            ${over ? `Woche ${fmtMin(s.weekOver)} überzogen` : `Noch ${fmtMin(s.rem)} diese Woche`}
          </div>
        </div>` : html`
        <div class="center" style="gap:4px">
          <div class=${'caps ' + (over ? 'red' : '')}>${over ? 'Wochenbudget überzogen' : 'Noch übrig diese Woche'}</div>
          <div class=${'num ' + (over ? 'red' : '')} style="font-size:48px;font-weight:800;line-height:1.1">${fmtMin(over ? s.weekOver : s.rem)}</div>
          <div class="muted" style="font-size:15px">
            ${over ? 'Ab Montag gibt es wieder ' + fmtMin(s.budgetMin) : s.daysLeft > 0 ? 'Gleich verteilt: ' + perDayText(s) : 'Heute ist der letzte Tag der Woche'}
          </div>
        </div>`}

      ${run && s.daysLeft > 0 && s.rem >= 1 && html`
        <div class="card hint">${Icon.cal}<span>Jetzt stoppen: noch <b style="color:#F2C12E">${fmtMin(s.perDay)} pro Tag</b> bis Sonntag</span></div>`}

      <${WeekCard} s=${s}/>

      <div class="actions">
        <button class="round" aria-label="Einträge dieser Woche" onClick=${() => go({ name: 'entries' })}>${Icon.list}</button>
        ${run
          ? html`<button class="big stop" disabled=${busy} onClick=${onStop}>${Icon.stop}Stopp</button>`
          : html`<button class="big start" disabled=${busy} onClick=${onStart}>${Icon.play}Start</button>`}
      </div>
    </main>`;
}

// ───────────── Leander: iPad ─────────────
function KidHome({ s, demo }) {
  const run = !!s.running;
  const over = s.weekOver >= 1;
  return html`
    <main class="kid">
      <div class="topbar">
        <div style="font-size:18px;font-weight:800;letter-spacing:.16em">SCREENTIMER</div>
        ${run
          ? html`<div class="pill on"><span class="dot"></span>Timer läuft seit ${fmtTime(s.running.started_at)}</div>`
          : html`<div class="pill off">Timer ist aus</div>`}
      </div>
      ${demo && html`<div class="card hint"><b>Demo</b><span class="muted">Beispieldaten</span></div>`}
      <div class="kidbody">
        <div class="kidleft">
          <${Dial} s=${s} size=${440} cls="kiddial"/>
          <div style="font-size:20px;font-weight:600" class=${s.red >= 1 ? 'red' : 'muted'}>${dialCaption(s, true)}</div>
        </div>
        <div class="kidright">
          ${run ? html`
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class="muted" style="font-size:20px;font-weight:600">Screentime läuft</div>
              <div class="num" style="font-size:clamp(64px,9vw,104px);font-weight:800;line-height:1">${fmtWatch(s.runningSec)}</div>
              <div class=${over ? 'red' : ''} style="font-size:24px;font-weight:700">
                ${over ? `Die Woche ist ${fmtMin(s.weekOver)} überzogen` : `Noch ${fmtMin(s.rem)} diese Woche`}
              </div>
            </div>` : html`
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class=${over ? 'red' : ''} style="font-size:20px;font-weight:700">${over ? 'Diese Woche überzogen' : 'Noch übrig diese Woche'}</div>
              <div class=${'num ' + (over ? 'red' : '')} style="font-size:clamp(60px,8vw,96px);font-weight:800;line-height:1">${fmtMin(over ? s.weekOver : s.rem)}</div>
              <div class="muted" style="font-size:22px">
                ${over ? 'Die Stunden dieser Woche sind aufgebraucht. Ab Montag gibt es wieder neue.'
                  : s.daysLeft > 0 ? 'Gleich verteilt sind das ' + perDayText(s) : 'Heute ist der letzte Tag der Woche'}
              </div>
            </div>`}
          ${run && s.daysLeft > 0 && s.rem >= 1 && html`
            <div class="card" style="padding:18px 22px;display:flex;flex-direction:column;gap:6px">
              <div class="muted" style="font-size:17px">Wenn du jetzt aufhörst, bleiben dir</div>
              <div style="font-size:28px;font-weight:800"><span style="color:#F2C12E">${fmtMin(s.perDay)} pro Tag</span> bis Sonntag</div>
            </div>`}
          <${WeekCard} s=${s} kid=${true}/>
        </div>
      </div>
    </main>`;
}

// ───────────── Eltern: Einträge ─────────────
function Head({ title, onBack }) {
  return html`<div class="head">
    <button class="iconbtn back" aria-label="Zurück" onClick=${onBack}>${Icon.back}</button>
    <h1>${title}</h1>
  </div>`;
}

function Entries({ sessions, s, now, go }) {
  const groups = groupByDay(sessions, now);
  return html`
    <main class="screen">
      <${Head} title="Einträge dieser Woche" onBack=${() => go({ name: 'home' })}/>
      <button class="btn primary" onClick=${() => go({ name: 'edit', entry: null })}>+ Nachtragen</button>
      ${groups.length === 0 && html`<p class="note">Diese Woche gibt es noch keine Einträge.</p>`}
      ${groups.map((g) => html`
        <section class="group">
          <h2><span>${DAY_NAMES_LONG[g.ti]}</span><span class="muted num">${fmtMin(s.days[g.ti])}</span></h2>
          ${g.items.map((e) => {
            const end = e.ended_at ? new Date(e.ended_at) : null;
            const dur = ((end || now) - new Date(e.started_at)) / 60000;
            return html`
              <button class="item" onClick=${() => go({ name: 'edit', entry: e })}>
                <span class="num" style="font-weight:600">${fmtTime(e.started_at)}–${end ? fmtTime(end) : 'läuft'}</span>
                <span style="display:flex;gap:8px;align-items:center">
                  ${e.source === 'manual' && html`<span class="tag">nachgetragen</span>`}
                  <span class="num muted">${fmtMin(dur)}</span>
                </span>
              </button>`;
          })}
        </section>`)}
    </main>`;
}

function EditEntry({ entry, now, act, go }) {
  const running = entry && !entry.ended_at;
  const [date, setDate] = useState(toDateInput(entry ? entry.started_at : now));
  const [start, setStart] = useState(entry ? fmtTime(entry.started_at) : '');
  const [end, setEnd] = useState(entry && entry.ended_at ? fmtTime(entry.ended_at) : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (ev) => {
    ev.preventDefault();
    setErr('');
    if (!date || !start || (!running && !end)) { setErr('Bitte Datum, Start und Ende ausfüllen.'); return; }
    const a = combine(date, start);
    let b = running ? null : combine(date, end);
    if (b && b <= a) b = new Date(b.getTime() + 24 * 3600 * 1000); // endet nach Mitternacht
    setBusy(true);
    const e = await act((db, pin) => db.saveEntry(pin, entry && entry.id, a, b));
    setBusy(false);
    if (e) setErr(e.message); else go({ name: 'entries' });
  };
  const del = async () => {
    if (!confirm('Eintrag wirklich löschen?')) return;
    setBusy(true);
    const e = await act((db, pin) => db.deleteEntry(pin, entry.id));
    setBusy(false);
    if (e) setErr(e.message); else go({ name: 'entries' });
  };

  return html`
    <main class="screen">
      <${Head} title=${entry ? 'Eintrag bearbeiten' : 'Nachtragen'} onBack=${() => go({ name: 'entries' })}/>
      <form style="display:flex;flex-direction:column;gap:16px" onSubmit=${save}>
        <div class="field"><label for="f-date">Datum</label>
          <input id="f-date" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} required/></div>
        <div class="field"><label for="f-start">Start</label>
          <input id="f-start" type="time" value=${start} onInput=${(e) => setStart(e.target.value)} required/></div>
        ${running
          ? html`<p class="note">Der Timer läuft noch – die Endzeit setzt der Stopp-Button. Hier kannst du die Startzeit korrigieren, z. B. wenn ihr vergessen habt zu starten.</p>`
          : html`<div class="field"><label for="f-end">Ende</label>
              <input id="f-end" type="time" value=${end} onInput=${(e) => setEnd(e.target.value)} required/></div>
            <p class="note">Endet nach Mitternacht? Einfach die Uhrzeit eintragen – sie zählt dann zum nächsten Tag.</p>`}
        ${err && html`<div class="err" role="alert">${err}</div>`}
        <button class="btn primary" type="submit" disabled=${busy}>Speichern</button>
        ${entry && html`<button class="btn danger" type="button" disabled=${busy} onClick=${del}>Löschen</button>`}
      </form>
    </main>`;
}

// ───────────── Eltern: Einstellungen ─────────────
function Settings({ settings, act, go, onForget }) {
  const [hours, setHours] = useState(String(settings.weekly_budget_min / 60).replace('.', ','));
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState({ budget: '', pin: '' });
  const [copied, setCopied] = useState(false);
  const kidLink = location.origin + location.pathname + '?kind';

  const saveBudget = async (ev) => {
    ev.preventDefault();
    const h = parseFloat(hours.replace(',', '.'));
    if (!(h >= 0 && h <= 168)) { setMsg({ ...msg, budget: 'Bitte eine Zahl zwischen 0 und 168 eingeben.' }); return; }
    const e = await act((db, pin) => db.updateSettings(pin, Math.round(h * 60), null));
    setMsg({ ...msg, budget: e ? e.message : 'Gespeichert.' });
  };
  const savePin = async (ev) => {
    ev.preventDefault();
    if (!/^\d{4}$/.test(newPin)) { setMsg({ ...msg, pin: 'Die neue PIN muss 4 Ziffern haben.' }); return; }
    const e = await act((db) => db.updateSettings(oldPin, null, newPin), { pinOverride: true });
    if (e) { setMsg({ ...msg, pin: e.kind === 'pin' ? 'Die alte PIN stimmt nicht.' : e.message }); return; }
    store.set(PIN_KEY, newPin);
    setOldPin(''); setNewPin('');
    setMsg({ ...msg, pin: 'PIN geändert. Auf dem anderen Eltern-Handy einmal neu eingeben.' });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(kidLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* manuell kopieren */ }
  };
  const refresh = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches?.keys?.() || [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* egal */ }
    location.reload();
  };

  return html`
    <main class="screen">
      <${Head} title="Einstellungen" onBack=${() => go({ name: 'home' })}/>
      <form class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px" onSubmit=${saveBudget}>
        <div class="field"><label for="f-budget">Wochenbudget in Stunden</label>
          <input id="f-budget" inputmode="decimal" value=${hours} onInput=${(e) => setHours(e.target.value)}/></div>
        ${msg.budget && html`<div class="note">${msg.budget}</div>`}
        <button class="btn primary" type="submit">Budget speichern</button>
      </form>

      <form class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px" onSubmit=${savePin}>
        <div class="field"><label for="f-old">Alte PIN</label>
          <input id="f-old" type="password" inputmode="numeric" maxlength="4" value=${oldPin} onInput=${(e) => setOldPin(e.target.value)}/></div>
        <div class="field"><label for="f-new">Neue PIN (4 Ziffern)</label>
          <input id="f-new" type="password" inputmode="numeric" maxlength="4" value=${newPin} onInput=${(e) => setNewPin(e.target.value)}/></div>
        ${msg.pin && html`<div class="note">${msg.pin}</div>`}
        <button class="btn ghost" type="submit">PIN ändern</button>
      </form>

      <section class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
        <b>Link für Leanders iPad</b>
        <div class="note" style="word-break:break-all">${kidLink}</div>
        <p class="note" style="margin:0">Auf dem iPad in Safari öffnen, dann Teilen → „Zum Home-Bildschirm“. Das iPad merkt sich danach die Kinder-Ansicht.</p>
        <button class="btn ghost" onClick=${copy}>${copied ? 'Kopiert' : 'Link kopieren'}</button>
      </section>

      <button class="btn ghost" onClick=${refresh}>App aktualisieren</button>
      <button class="btn danger" onClick=${onForget}>PIN auf diesem Handy vergessen</button>
    </main>`;
}

// ───────────── PIN-Eingabe ─────────────
function PinScreen({ db, onOk }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (ev) => {
    ev.preventDefault();
    if (!/^\d{4}$/.test(pin)) { setErr('Bitte 4 Ziffern eingeben.'); return; }
    setBusy(true); setErr('');
    try {
      const ok = await db.checkPin(pin);
      if (ok) onOk(pin); else setErr('PIN falsch.');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return html`
    <main class="pinbox">
      <div style="font-size:15px;font-weight:800;letter-spacing:.16em;text-align:center">SCREENTIMER</div>
      <p class="note" style="text-align:center;margin:0">Eltern-PIN eingeben. Das Handy merkt sich die PIN danach.</p>
      <form style="display:flex;flex-direction:column;gap:16px" onSubmit=${submit}>
        <div class="field"><label for="f-pin" style="text-align:center">PIN</label>
          <input id="f-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" value=${pin} onInput=${(e) => setPin(e.target.value)} autofocus/></div>
        ${err && html`<div class="err" role="alert" style="text-align:center">${err}</div>`}
        <button class="btn primary" type="submit" disabled=${busy}>Weiter</button>
      </form>
      <a class="note" style="text-align:center" href="?kind">Das ist Leanders Gerät</a>
    </main>`;
}

// ───────────── App ─────────────
function App({ db }) {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [now, setNow] = useState(db.now());
  const [pin, setPin] = useState(DEMO ? '1234' : store.get(PIN_KEY));
  const [route, setRoute] = useState({ name: 'home' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };

  const load = async () => {
    try { setData(await db.load()); setLoadErr(''); } catch (e) { setLoadErr(e.message); }
  };

  // Laden, Live-Updates, Neuladen beim Zurückkehren, Sicherheitsnetz alle 60 s
  useEffect(() => {
    load();
    const unsub = db.subscribe(() => load());
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    const poll = setInterval(load, 60000);
    return () => { unsub(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); clearInterval(poll); };
  }, []);

  // Sekundentakt für Stoppuhr und Uhr
  useEffect(() => { const t = setInterval(() => setNow(db.now()), 1000); return () => clearInterval(t); }, []);

  // Neue Woche → Daten neu holen
  const wk = weekStart(now).getTime();
  const wkRef = useRef(wk);
  useEffect(() => { if (wkRef.current !== wk) { wkRef.current = wk; load(); } }, [wk]);

  const s = data ? summarize(data.sessions, now, data.settings.weekly_budget_min) : null;
  const run = !!(s && s.running);

  // Dunkel, solange der Timer läuft (nur auf der Startseite)
  const dark = run && route.name === 'home' && (IS_KID || !!pin);
  useEffect(() => {
    document.documentElement.classList.toggle('run', dark);
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = dark ? '#141414' : '#F7F5EF';
  }, [dark]);

  // Führt eine PIN-geschützte Aktion aus; gibt bei Regelverstößen den Fehler zurück
  const act = async (fn, opts = {}) => {
    try { await fn(db, pin); await load(); return null; } catch (e) {
      if (e.kind === 'pin' && !opts.pinOverride) { store.set(PIN_KEY, null); setPin(null); showToast('PIN falsch – bitte neu eingeben.'); return null; }
      if (e.kind === 'offline') { showToast('Keine Verbindung – Start/Stopp gerade nicht möglich.'); return e; }
      return e;
    }
  };
  const startStop = async (stop) => {
    setBusy(true);
    const e = await act((d, p) => (stop ? d.stop(p) : d.start(p)));
    setBusy(false);
    if (e && e.kind === 'rule') showToast(e.message);
  };

  if (!data) {
    return html`<div class="loading">${loadErr ? html`<div class="center" style="gap:12px;padding:24px">
      <b>Keine Verbindung</b><span class="muted">${loadErr}</span>
      <button class="btn ghost" onClick=${load}>Nochmal versuchen</button></div>` : 'Screentimer lädt …'}</div>`;
  }

  if (IS_KID) return html`<${KidHome} s=${s} demo=${db.demo}/>`;
  if (!pin) return html`<${PinScreen} db=${db} onOk=${(p) => { store.set(PIN_KEY, p); setPin(p); }}/>`;

  const go = (r) => { setRoute(r); window.scrollTo(0, 0); };
  let view;
  if (route.name === 'entries') view = html`<${Entries} sessions=${data.sessions} s=${s} now=${now} go=${go}/>`;
  else if (route.name === 'edit') view = html`<${EditEntry} entry=${route.entry} now=${now} act=${act} go=${go}/>`;
  else if (route.name === 'settings') view = html`<${Settings} settings=${data.settings} act=${act} go=${go}
    onForget=${() => { store.set(PIN_KEY, null); setPin(null); go({ name: 'home' }); }}/>`;
  else view = html`<${ParentHome} s=${s} demo=${db.demo} busy=${busy} go=${go}
    onStart=${() => startStop(false)} onStop=${() => startStop(true)}/>`;

  return html`${view}${toast && html`<div class="toast" role="status">${toast}</div>`}`;
}

// ───────────── Start ─────────────
(async () => {
  const root = document.getElementById('app');
  try {
    const db = DEMO ? createDemoDb(DEMO) : await createSupabaseDb();
    render(html`<${App} db=${db}/>`, root);
  } catch (e) {
    root.innerHTML = '<div class="loading">Die App konnte nicht starten. Bitte Internetverbindung prüfen und neu laden.</div>';
    console.error(e);
  }
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
