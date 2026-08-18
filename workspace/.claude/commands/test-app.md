---
description: Testet eine SAP Neptune Fiori-App basierend auf einem workflow-Textfile
argument-hint: [workflow-datei] [url] [speicherort] [titel]
---

Schritt 0 – Browser-Verbindung sicherstellen (IMMER zuerst, vor allem anderen):
Rufe mcp__claude-in-chrome__list_connected_browsers auf. Suche in der Liste 
den Eintrag mit isLocal:true (das ist der Chrome-Browser in diesem Container) 
und wähle ihn per mcp__claude-in-chrome__select_browser aus. Frage NICHT 
nach, welcher Browser gemeint ist, und breche NICHT wegen einer Browser-Wahl 
ab – wähle isLocal:true automatisch. Falls kein Eintrag mit isLocal:true 
vorhanden ist, breche sofort ab und gib zurück: "FEHLER: Kein Chrome-Browser 
in diesem Container mit der Claude-Extension verbunden. Bitte im 
noVNC-Fenster (localhost:6901) prüfen, ob Chrome läuft und die Extension 
aktiv/eingeloggt ist."

Lies dann die Datei $1 – sie enthält den Text eines aufgenommenen Workflows 
(erstellt via Claude in Chrome "Record Workflow").

Kontext: Wir arbeiten im SAP-Umfeld mit einer Neptune DXP Fiori-App.
URL: $2

Nutze den Inhalt der Workflow-Datei als Verständnishilfe, um zu wissen, worum 
es in der App geht und wie die Kernfunktion grundsätzlich funktioniert. Das 
ist NICHT die Testliste – teste eigenständig darüber hinaus.

Prüfe direkt nach dem Öffnen der URL, ob eine Login-Maske sichtbar ist. Falls 
ja, breche sofort ab und gib zurück: "FEHLER: Login erforderlich, im 
Headless-Modus nicht möglich. Bitte manuell einloggen und wiederholen." 
Versuche NICHT, Zugangsdaten zu erraten oder einzugeben.

Ziel: Finde Bugs, UX-Probleme und unerwartetes Verhalten in der App.

Teste systematisch folgende Kategorien:

1. Funktionale Tests
   - Alle Buttons, Filter, Sortierfunktionen einzeln durchklicken – tun sie, 
     was ihr Label verspricht?
   - Falls Formulare/Eingabefelder vorhanden: gültige UND ungültige Eingaben 
     testen (leere Pflichtfelder, Sonderzeichen, zu lange Texte, falsche 
     Formate wie Buchstaben in Zahlenfeldern)
   - Filterkombinationen testen (mehrere Filter gleichzeitig setzen, dann 
     wieder zurücksetzen)

2. Fehlerverhalten
   - Was passiert bei leeren Ergebnissen (z.B. Filter, der nichts findet)?
   - Werden Fehlermeldungen sinnvoll angezeigt oder bricht die UI?
   - Browser-Konsole während der Tests im Blick behalten – JS-Fehler mitloggen

3. UI/UX-Auffälligkeiten
   - Reagiert die App bei langsamen Ladezeiten sauber (Ladeindikator vorhanden)?
   - Sind Tabellen bei vielen Einträgen noch bedienbar (Scrolling, Paging)?
   - Responsive-Verhalten falls relevant

4. Navigation
   - Zurück-Navigation (Browser-Back, App-interne Zurück-Buttons) – bleibt 
     der Zustand (z.B. gesetzte Filter) erhalten oder geht er verloren?
   - Direktes Neuladen der Seite (F5) mitten im Prozess – was passiert?

Für jeden gefundenen Bug/jedes Problem:
- Screenshot des Zustands
- Genaue Beschreibung: was hast du gemacht, was war erwartet, was ist 
  tatsächlich passiert
- Schweregrad-Einschätzung (kritisch / mittel / kosmetisch)
- Relevante Konsolen-Fehler falls vorhanden

Output:
- Eine HTML-Datei mit:
  - Kurzer Zusammenfassung oben (wie viele Tests, wie viele Bugs gefunden, 
    Verteilung nach Schweregrad)
  - Pro gefundenem Bug ein Abschnitt mit Screenshot + Beschreibung
  - Am Ende: Liste der getesteten Funktionen, die OHNE Probleme funktioniert 
    haben (kurz, ohne Screenshots)
- Sauberes CSS-Styling, kritische Bugs farblich hervorgehoben (z.B. rot)

Speichere die Datei als testreport_$4.html im Ordner: $3
Falls dieser Ordner noch nicht existiert, erstelle ihn zuerst.
