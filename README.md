# Screentimer

Leanders Screentime im Blick: Eltern starten und stoppen den Timer auf ihren Handys, Leander sieht auf dem iPad live, wie viel von seinen 7 Stunden pro Woche noch übrig ist.

## Einrichten (ca. 10 Minuten)

### 1. Datenbank (Supabase)
1. Im Supabase-Dashboard das Projekt öffnen, das auch der Workout Tracker nutzt.
2. **SQL Editor → New query**, den Inhalt von `setup.sql` einfügen.
3. In der **letzten Zeile** `st_init_pin('1234')` durch eure eigene 4-stellige PIN ersetzen.
4. **Run**. Das Skript darf man gefahrlos mehrfach ausführen.

Die Tabellen heißen alle `st_…` und berühren die Workout-Tabellen nicht. Wer lieber ein eigenes Supabase-Projekt möchte: `setup.sql` dort ausführen und URL + anon key in `js/config.js` eintragen.

### 2. Hosting (GitHub Pages)
1. Auf GitHub ein neues **öffentliches** Repository `screentimer` anlegen.
2. Alle Dateien hochladen, Ordner `js/` und `icons/` mit ihrem Inhalt.
3. **Settings → Pages → Branch: main, Ordner: / (root) → Save.**
4. Nach 1–2 Minuten läuft die App unter `https://knokat.github.io/screentimer/`.

### 3. Geräte
- **Eltern-Handys:** Link in Safari öffnen, PIN eingeben, dann Teilen → „Zum Home-Bildschirm“.
- **Leanders iPad:** `https://knokat.github.io/screentimer/kind/` in Safari öffnen, dann Teilen → „Zum Home-Bildschirm“. Das Icon öffnet immer die Kinder-Ansicht.
  Warum eine eigene Adresse statt `?kind`: iPhone und iPad lassen Parameter beim Speichern auf dem Home-Bildschirm weg, und die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari. Alte `?kind`-Links leiten automatisch auf `kind/` um.
- **Gut zu wissen:** Auch auf den Eltern-Handys fragt die Home-Bildschirm-App beim ersten Öffnen einmal nach der PIN – aus demselben Grund.

## Vorher ausprobieren (ohne Einrichtung)
Mit Beispieldaten aus den Entwürfen, nichts wird gespeichert, PIN `1234`:

| Zustand | Eltern-Handy | iPad |
| --- | --- | --- |
| Kein Timer | `?demo=ruhe` | `kind/?demo=ruhe` |
| Timer läuft | `?demo=laeuft` | `kind/?demo=laeuft` |
| Über der Stunde | `?demo=stunde` | `kind/?demo=stunde` |
| Woche fast leer | `?demo=knapp` | `kind/?demo=knapp` |
| Woche überzogen | `?demo=woche` | `kind/?demo=woche` |
| 30 min gekürzt | `?demo=gekuerzt` | `kind/?demo=gekuerzt` |
| Gekürzt, Timer läuft | `?demo=gekuerzt_laeuft` | `kind/?demo=gekuerzt_laeuft` |

## Regeln (Kurzfassung aus dem PRD)
- Wochenbudget 7 h (in den Einstellungen änderbar), Woche Mo 00:00 – So 24:00, kein Übertrag.
- **Groß:** Wochenrest + „gleich verteilt pro Tag“ (Rest ÷ Tage nach heute bis Sonntag).
- **Tagesuhr:** 60 min als Richtwert, kein Limit. Gelb = heute noch übrig, gedeckelt auf den Wochenrest zu Tagesbeginn. Darüber wächst ein roter Keil entlang der Skala 10, 20, 30.
- **Wochenstreifen:** 7 Kästchen à 1 Stunde, Überzug als rotes „+12“.
- **Kürzen:** Einträge → „− Kürzen“. Minuten für diese oder nächste Woche, optional mit Grund. Das wirksame Budget sinkt (Wochenrest, Gleichverteilung, Tagesuhr). Leander sieht „30 min gekürzt · Grund“ und gestreifte Kästchen am Ende des Wochenstreifens. Antippen in der Liste nimmt eine Kürzung zurück.
- Läuft der Timer, wird die Ansicht schwarz. Nach 2 Stunden erscheint ein Hinweis „vergessen?“.
- Die Laufzeit wird immer aus der gespeicherten Startzeit berechnet – alle Geräte zeigen dieselbe Zahl.

## Dateien
```
index.html            Eltern-Ansicht (Einstieg)
kind/                 Leanders Ansicht: eigene Adresse + eigenes Manifest
app.css               Styles für beide
js/app.js             Screens (Eltern, Leander, Einträge, Nachtragen, Einstellungen, PIN)
js/logic.js           Rechenlogik (Woche, Tagesuhr, Gleichverteilung)
js/db.js              Supabase-Anbindung + Demo-Modus
js/config.js          Supabase-URL, anon key, Hinweis-Schwelle
sw.js, manifest.webmanifest, icons/   Home-Bildschirm-App
setup.sql             Datenbank-Setup
tests/logic.test.js   Tests der Rechenlogik
```

Tests ausführen: `npm test`

## Sicherheit, ehrlich gesagt
- Die PIN ist ein Familien-Schutz, keine Hochsicherheit. Jede falsche Eingabe wird um 1 Sekunde gebremst.
- Lesen darf jeder, der den Link kennt (so braucht das iPad keine PIN). Es stehen nur Uhrzeiten drin, keine Namen.
- Schreiben geht ausschließlich über die PIN-geprüften Datenbank-Funktionen.

## Nach Änderungen
- **Neue Version mit Datenbank-Änderung** (z. B. Kürzen): `setup.sql` einfach nochmal komplett ausführen. Einträge, Einstellungen und PIN bleiben erhalten, die PIN-Zeile am Ende tut dann nichts.
- Die App holt Updates automatisch. Hängt ein Gerät doch mal: Einstellungen → „App aktualisieren“.
