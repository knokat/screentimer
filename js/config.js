// Supabase-Zugang. Der „anon key“ ist öffentlich gedacht – geschützt wird über
// Row Level Security und die PIN-Funktionen aus setup.sql.
// Aktuell: dasselbe Supabase-Projekt wie der Workout Tracker (Tabellen mit Präfix st_).
export const SUPABASE_URL = 'https://zkqfeqtnoxgoepmykupd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprcWZlcXRub3hnb2VwbXlrdXBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDU3NzcsImV4cCI6MjA4Nzg4MTc3N30.Uz4VTfFd76SNiP8HxOr_NFl-O1GuTPMNpQ9cZXig89E';

// Ab wann die Eltern-Ansicht auf einen evtl. vergessenen Timer hinweist
export const FORGOTTEN_AFTER_MIN = 120;
