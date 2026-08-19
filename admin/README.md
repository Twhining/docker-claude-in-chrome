# Admin-Panel

Verwaltet Nutzer, deren Claude-Account-Zuordnung, Session/Container-Zuweisung
und erlaubte Ziel-Webseiten für automatisiertes Testen/Dokumentieren von
SAP-Apps. Node.js/Express-Backend, SQLite-Datenbank, einfaches
HTML/CSS/JS-Frontend ohne Framework.

## Start

```powershell
cd admin
npm install
$env:ADMIN_PASSWORD = "dein-sicheres-passwort"
npm start
```

Panel öffnen: http://localhost:4000

## Umgebungsvariablen

| Variable | Zweck | Default |
|---|---|---|
| `ADMIN_PASSWORD` | Passwort für den Panel-Login | `changeme` (unsicher – unbedingt setzen) |
| `ADMIN_SESSION_SECRET` | Secret für die Session-Cookies | zufällig pro Prozessstart (Sessions gehen bei Neustart verloren) |
| `PORT` | Port des Admin-Panels | `4000` |
| `ADMIN_DB_PATH` | Pfad zur SQLite-Datei | `admin/data/admin.sqlite` |

## Daten

Die SQLite-Datenbank liegt unter `admin/data/admin.sqlite` (per `.gitignore`
ausgeschlossen, wird beim ersten Start automatisch angelegt).

`login_status` eines Users kennt vier Werte: `not_configured`,
`chrome_pending`, `claude_code_pending`, `ready`. `GET /api/sessions` liefert
aktuell eine fest hinterlegte Platzhalter-Liste (`session-1`..`session-3`) –
das wird später durch eine echte Container-Verwaltung ersetzt.

Nutzer werden nie hart gelöscht (`DELETE /api/users/:id` setzt nur
`active = false`), damit Zuordnungshistorie erhalten bleibt.
