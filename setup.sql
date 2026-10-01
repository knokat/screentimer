-- Screentimer – Datenbank-Setup für Supabase
-- Komplett im Supabase SQL Editor ausführen. Gefahrlos wiederholbar: Wer es schon einmal
-- ausgeführt hat, führt es nach Updates einfach nochmal aus – Daten und PIN bleiben erhalten.
-- VORHER: unten bei "st_init_pin('1234')" eure eigene 4-stellige PIN eintragen.
--
-- Alle Tabellen tragen das Präfix st_, damit sie sauber neben anderen App-Tabellen
-- im selben Supabase-Projekt liegen können.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tabellen
-- ─────────────────────────────────────────────────────────────

create table if not exists st_sessions (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null,
  ended_at    timestamptz,                         -- leer = Timer läuft
  source      text not null default 'timer' check (source in ('timer', 'manual')),
  started_by  text,                                -- vorerst leer (US8, zurückgestellt)
  ended_by    text,                                -- vorerst leer (US8, zurückgestellt)
  updated_at  timestamptz not null default now(),
  constraint st_sessions_order check (ended_at is null or ended_at > started_at)
);

-- Höchstens ein laufender Timer – auch wenn beide Eltern gleichzeitig Start drücken.
create unique index if not exists st_sessions_one_running
  on st_sessions ((true)) where ended_at is null;

create index if not exists st_sessions_started_at on st_sessions (started_at);

create table if not exists st_settings (
  id                 int primary key default 1 check (id = 1),
  weekly_budget_min  int not null default 420 check (weekly_budget_min between 0 and 10080),
  timezone           text not null default 'Europe/Vienna',
  updated_at         timestamptz not null default now()
);
insert into st_settings (id) values (1) on conflict (id) do nothing;

-- Kürzungen des Wochenbudgets (für die laufende oder die nächste Woche)
create table if not exists st_cuts (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null check (extract(isodow from week_start) = 1),  -- Montag der Woche
  minutes     int  not null check (minutes between 1 and 10080),
  reason      text check (char_length(reason) <= 80),                     -- Leander sieht den Grund
  created_at  timestamptz not null default now()
);
create index if not exists st_cuts_week on st_cuts (week_start);

-- PIN liegt in einer eigenen Tabelle, die niemand direkt lesen darf.
create table if not exists st_secret (
  id        int primary key default 1 check (id = 1),
  pin_hash  text not null
);

-- ─────────────────────────────────────────────────────────────
-- Zugriff: Lesen für alle (iPad braucht keine PIN), Schreiben nur über Funktionen
-- ─────────────────────────────────────────────────────────────

alter table st_sessions enable row level security;
alter table st_settings enable row level security;
alter table st_secret   enable row level security;
alter table st_cuts     enable row level security;

drop policy if exists st_cuts_read on st_cuts;
create policy st_cuts_read on st_cuts for select using (true);

drop policy if exists st_sessions_read on st_sessions;
create policy st_sessions_read on st_sessions for select using (true);

drop policy if exists st_settings_read on st_settings;
create policy st_settings_read on st_settings for select using (true);
-- st_secret: absichtlich keine Policy → für anon/authenticated unsichtbar.

-- ─────────────────────────────────────────────────────────────
-- Hilfsfunktion: PIN prüfen
-- ─────────────────────────────────────────────────────────────

create or replace function st_pin_ok(p_pin text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from st_secret where id = 1 and pin_hash = crypt(p_pin, pin_hash));
$$;

create or replace function st_require_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not st_pin_ok(p_pin) then
    perform pg_sleep(1);  -- bremst Durchprobieren
    raise exception 'PIN falsch' using errcode = '28000';
  end if;
end $$;

-- Erstes Setzen der PIN (nur solange noch keine gesetzt ist)
create or replace function st_init_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN muss 4 Ziffern haben'; end if;
  insert into st_secret (id, pin_hash) values (1, crypt(p_pin, gen_salt('bf')))
  on conflict (id) do nothing;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Funktionen, die die App aufruft (alle PIN-geschützt)
-- ─────────────────────────────────────────────────────────────

create or replace function st_check_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not st_pin_ok(p_pin) then perform pg_sleep(1); return false; end if;
  return true;
end $$;

create or replace function st_start(p_pin text) returns st_sessions
language plpgsql security definer set search_path = public, extensions as $$
declare r st_sessions;
begin
  perform st_require_pin(p_pin);
  select * into r from st_sessions where ended_at is null;
  if found then return r; end if;          -- läuft schon: einfach den laufenden zurückgeben
  begin
    insert into st_sessions (started_at, source) values (now(), 'timer') returning * into r;
  exception when unique_violation then
    select * into r from st_sessions where ended_at is null;  -- der andere war schneller
  end;
  return r;
end $$;

create or replace function st_stop(p_pin text) returns st_sessions
language plpgsql security definer set search_path = public, extensions as $$
declare r st_sessions;
begin
  perform st_require_pin(p_pin);
  update st_sessions
     set ended_at = greatest(now(), started_at + interval '1 second'), updated_at = now()
   where ended_at is null
  returning * into r;
  return r;   -- null, wenn nichts lief (doppeltes Stopp schadet nicht)
end $$;

-- Nachtragen (p_id leer) oder ändern (p_id gesetzt).
-- p_end leer ist nur für die gerade laufende Einheit erlaubt (Startzeit korrigieren).
create or replace function st_save_entry(p_pin text, p_id uuid, p_start timestamptz, p_end timestamptz)
returns st_sessions
language plpgsql security definer set search_path = public, extensions as $$
declare r st_sessions; running boolean;
begin
  perform st_require_pin(p_pin);
  if p_start > now() then raise exception 'Start liegt in der Zukunft'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'Ende muss nach dem Start liegen'; end if;
  if p_end is not null and p_end > now() + interval '1 minute' then raise exception 'Ende liegt in der Zukunft'; end if;

  if p_id is not null then
    select (ended_at is null) into running from st_sessions where id = p_id;
    if not found then raise exception 'Eintrag nicht gefunden'; end if;
    if p_end is null and not running then raise exception 'Ende fehlt'; end if;
  elsif p_end is null then
    raise exception 'Ende fehlt';
  end if;

  if exists (
    select 1 from st_sessions s
     where (p_id is null or s.id <> p_id)
       and tstzrange(s.started_at, coalesce(s.ended_at, now()), '[)')
        && tstzrange(p_start, coalesce(p_end, now()), '[)')
  ) then
    raise exception 'Überschneidet sich mit einem anderen Eintrag';
  end if;

  if p_id is null then
    insert into st_sessions (started_at, ended_at, source) values (p_start, p_end, 'manual') returning * into r;
  else
    update st_sessions set started_at = p_start, ended_at = p_end, updated_at = now()
     where id = p_id returning * into r;
  end if;
  return r;
end $$;

create or replace function st_delete_entry(p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform st_require_pin(p_pin);
  delete from st_sessions where id = p_id;
end $$;

create or replace function st_update_settings(p_pin text, p_budget int, p_new_pin text)
returns st_settings
language plpgsql security definer set search_path = public, extensions as $$
declare r st_settings;
begin
  perform st_require_pin(p_pin);
  if p_new_pin is not null then
    if p_new_pin !~ '^[0-9]{4}$' then raise exception 'PIN muss 4 Ziffern haben'; end if;
    update st_secret set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = 1;
  end if;
  update st_settings
     set weekly_budget_min = coalesce(p_budget, weekly_budget_min), updated_at = now()
   where id = 1 returning * into r;
  return r;
end $$;

-- Budget kürzen: nur für die laufende oder die nächste Woche (Montag als Datum)
create or replace function st_add_cut(p_pin text, p_week_start date, p_minutes int, p_reason text)
returns st_cuts
language plpgsql security definer set search_path = public, extensions as $$
declare r st_cuts; tz text; cur date;
begin
  perform st_require_pin(p_pin);
  select timezone into tz from st_settings where id = 1;
  cur := date_trunc('week', now() at time zone coalesce(tz, 'Europe/Vienna'))::date;
  if p_week_start is distinct from cur and p_week_start is distinct from cur + 7 then
    raise exception 'Kürzen geht nur für diese oder nächste Woche';
  end if;
  if p_minutes is null or p_minutes < 1 then raise exception 'Bitte mindestens 1 Minute angeben'; end if;
  insert into st_cuts (week_start, minutes, reason)
  values (p_week_start, p_minutes, nullif(left(trim(coalesce(p_reason, '')), 80), ''))
  returning * into r;
  return r;
end $$;

create or replace function st_delete_cut(p_pin text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform st_require_pin(p_pin);
  delete from st_cuts where id = p_id;
end $$;

-- Nur die Funktionen sind von außen aufrufbar, die Helfer nicht.
revoke all on function st_pin_ok(text), st_require_pin(text), st_init_pin(text) from public, anon, authenticated;
grant execute on function st_check_pin(text), st_start(text), st_stop(text),
  st_save_entry(text, uuid, timestamptz, timestamptz), st_delete_entry(text, uuid),
  st_update_settings(text, int, text),
  st_add_cut(text, date, int, text), st_delete_cut(text, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Live-Aktualisierung auf allen Geräten
-- ─────────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table st_sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table st_settings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table st_cuts;
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────
-- PIN setzen  ← HIER EURE PIN EINTRAGEN
-- ─────────────────────────────────────────────────────────────

select st_init_pin('1234');
