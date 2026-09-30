// Datenzugriff: Supabase im Echtbetrieb, oder ein Demo-Speicher (?demo=…) zum Ausprobieren.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { weekStart } from './logic.js';

export class AppError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; } // kind: pin | offline | rule
}

function toAppError(err) {
  const msg = (err && (err.message || err.error_description || String(err))) || 'Unbekannter Fehler';
  if (err && err.code === '28000' || /PIN falsch/i.test(msg)) return new AppError('pin', 'PIN falsch');
  if (/fetch|network|load failed|offline|timeout/i.test(msg)) return new AppError('offline', 'Keine Verbindung – bitte gleich noch einmal versuchen.');
  return new AppError('rule', msg.replace(/^.*?ERROR:\s*/, ''));
}

// ───────────── Supabase ─────────────
export async function createSupabaseDb() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const rpc = async (fn, args) => {
    let res;
    try { res = await sb.rpc(fn, args); } catch (e) { throw toAppError(e); }
    if (res.error) throw toAppError(res.error);
    return res.data;
  };

  return {
    demo: false,
    now: () => new Date(),
    async load() {
      const ws = new Date(weekStart(new Date()).getTime() - 24 * 3600 * 1000).toISOString();
      try {
        const [s, st] = await Promise.all([
          sb.from('st_sessions').select('id, started_at, ended_at, source').or(`ended_at.is.null,ended_at.gte."${ws}"`).order('started_at'),
          sb.from('st_settings').select('weekly_budget_min').eq('id', 1).maybeSingle(),
        ]);
        if (s.error) throw s.error;
        if (st.error) throw st.error;
        return { sessions: s.data || [], settings: st.data || { weekly_budget_min: 420 } };
      } catch (e) { throw toAppError(e); }
    },
    subscribe(onChange) {
      const ch = sb.channel('screentimer')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'st_sessions' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'st_settings' }, onChange)
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    checkPin: (pin) => rpc('st_check_pin', { p_pin: pin }),
    start: (pin) => rpc('st_start', { p_pin: pin }),
    stop: (pin) => rpc('st_stop', { p_pin: pin }),
    saveEntry: (pin, id, start, end) => rpc('st_save_entry', { p_pin: pin, p_id: id || null, p_start: start.toISOString(), p_end: end ? end.toISOString() : null }),
    deleteEntry: (pin, id) => rpc('st_delete_entry', { p_pin: pin, p_id: id }),
    updateSettings: (pin, budget, newPin) => rpc('st_update_settings', { p_pin: pin, p_budget: budget, p_new_pin: newPin || null }),
  };
}

// ───────────── Demo ─────────────
// Beispielwoche wie in den Entwürfen; die Uhr läuft ab dem Szenario-Zeitpunkt weiter.
const DEMO = {
  ruhe:   { now: '2026-09-30T17:30:00', s: [['09-28T15:00', '09-28T16:35'], ['09-29T15:00', '09-29T16:20'], ['09-30T15:00', '09-30T15:45']] },
  laeuft: { now: '2026-09-30T17:15:41', s: [['09-28T15:00', '09-28T16:35'], ['09-29T15:00', '09-29T16:20'], ['09-30T14:00', '09-30T14:14'], ['09-30T16:52', null]] },
  stunde: { now: '2026-10-01T18:15:12', s: [['09-28T15:00', '09-28T16:35'], ['09-29T15:00', '09-29T16:20'], ['09-30T15:00', '09-30T15:45'], ['10-01T14:00', '10-01T14:45'], ['10-01T17:40', null]] },
  knapp:  { now: '2026-10-03T10:17:03', s: [['09-28T15:00', '09-28T16:35'], ['09-29T15:00', '09-29T16:20'], ['09-30T15:00', '09-30T15:45'], ['10-01T15:00', '10-01T16:20'], ['10-02T15:00', '10-02T16:30'], ['10-03T10:05', null]] },
  woche:  { now: '2026-10-03T12:00:00', s: [['09-28T15:00', '09-28T16:35'], ['09-29T15:00', '09-29T16:20'], ['09-30T15:00', '09-30T15:45'], ['10-01T15:00', '10-01T16:20'], ['10-02T15:00', '10-02T16:30'], ['10-03T10:00', '10-03T10:42']] },
};

export function createDemoDb(name) {
  const sc = DEMO[name] || DEMO.laeuft;
  const base = new Date(sc.now).getTime();
  const t0 = Date.now();
  const now = () => new Date(base + (Date.now() - t0));
  const iso = (x) => new Date('2026-' + x + ':00').toISOString();
  let n = 0;
  let sessions = sc.s.map(([a, b]) => ({ id: 'd' + (++n), started_at: iso(a), ended_at: b ? iso(b) : null, source: 'timer' }));
  let settings = { weekly_budget_min: 420 };
  let pinCode = '1234';
  const subs = new Set();
  const changed = () => setTimeout(() => subs.forEach((f) => f()), 50);
  const needPin = (p) => { if (p !== pinCode) throw new AppError('pin', 'PIN falsch'); };
  const overlaps = (id, a, b) => sessions.some((s) => s.id !== id &&
    new Date(s.started_at) < (b || now()) && (s.ended_at ? new Date(s.ended_at) : now()) > a);

  return {
    demo: true,
    now,
    async load() { return { sessions: sessions.map((s) => ({ ...s })), settings: { ...settings } }; },
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    async checkPin(p) { return p === pinCode; },
    async start(p) {
      needPin(p);
      if (!sessions.some((s) => !s.ended_at)) sessions.push({ id: 'd' + (++n), started_at: now().toISOString(), ended_at: null, source: 'timer' });
      changed();
    },
    async stop(p) {
      needPin(p);
      sessions = sessions.map((s) => (s.ended_at ? s : { ...s, ended_at: now().toISOString() }));
      changed();
    },
    async saveEntry(p, id, a, b) {
      needPin(p);
      if (a > now()) throw new AppError('rule', 'Start liegt in der Zukunft');
      if (b && b <= a) throw new AppError('rule', 'Ende muss nach dem Start liegen');
      if (b && b > new Date(now().getTime() + 60000)) throw new AppError('rule', 'Ende liegt in der Zukunft');
      if (overlaps(id, a, b)) throw new AppError('rule', 'Überschneidet sich mit einem anderen Eintrag');
      if (id) sessions = sessions.map((s) => (s.id === id ? { ...s, started_at: a.toISOString(), ended_at: b ? b.toISOString() : null } : s));
      else sessions.push({ id: 'd' + (++n), started_at: a.toISOString(), ended_at: b.toISOString(), source: 'manual' });
      changed();
    },
    async deleteEntry(p, id) { needPin(p); sessions = sessions.filter((s) => s.id !== id); changed(); },
    async updateSettings(p, budget, newPin) {
      needPin(p);
      if (newPin) { if (!/^\d{4}$/.test(newPin)) throw new AppError('rule', 'PIN muss 4 Ziffern haben'); pinCode = newPin; }
      if (budget != null) settings = { ...settings, weekly_budget_min: budget };
      changed();
    },
  };
}
