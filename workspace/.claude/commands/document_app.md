---
description: Dokumentiert eine SAP Neptune Fiori-App basierend auf einem workflow-Textfile
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

Lies dann die Datei $1 – sie enthält den Text eines aufgenommenen Workflows.

Kontext: Wir arbeiten im SAP-Umfeld mit einer Neptune DXP Fiori-App.
URL: $2

Nutze den Inhalt der Workflow-Datei NICHT als Schritt-für-Schritt-Anleitung 
zum Nachmachen, sondern als Verständnishilfe: sie zeigt dir, um welche App 
es sich handelt und wie ihre Kernfunktion grundsätzlich funktioniert. Nutze 
dieses Wissen, um die App eigenständig zu explorieren.

Prüfe direkt nach dem Öffnen der URL, ob eine Login-Maske sichtbar ist. Falls 
ja, breche sofort ab und gib zurück: "FEHLER: Login erforderlich, im 
Headless-Modus nicht möglich. Bitte manuell einloggen und wiederholen." 
Versuche NICHT, Zugangsdaten zu erraten oder einzugeben.

Ziel ist NICHT eine Dokumentation des Prozesses/der Klick-Abfolge, sondern 
eine Dokumentation der APP SELBST – ihrer Bereiche, Funktionen und UI-Elemente.

Vorgehen:
1. Öffne die App über die URL
2. Identifiziere die wichtigsten Screens/Bereiche der App (z.B. Übersicht, 
   Filteransicht, Detailansicht, Dialoge – je nachdem was die App hergibt)
3. Navigiere zu jedem relevanten Screen (nicht jeder einzelne Klick, sondern 
   jeder eigenständige, unterscheidbare Zustand/Bereich der App)
4. Mache pro Screen EINEN aussagekräftigen Screenshot

Pro Screen beschreibe:
- Zweck/Funktion dieses Bereichs innerhalb der App
- Wichtige UI-Elemente (Buttons, Filter, Aktionen)
- Bei Tabellen: alle sichtbaren Spalten einzeln auflisten mit kurzer 
  Erklärung, was die jeweilige Spalte zeigt/bedeutet
- Falls es Filter- oder Sortierfunktionen gibt: welche Optionen es gibt

Output:
- Eine HTML-Datei mit Inhaltsverzeichnis (ein Eintrag pro Screen/Bereich)
- Pro Abschnitt: Überschrift, Screenshot, strukturierte Beschreibung 
  (ggf. mit Tabelle für die Spaltenübersicht)
- Am Ende: kurze Zusammenfassung, was die App insgesamt kann (High-Level-Überblick)
- Sauberes CSS-Styling (klare Abschnitte, Screenshots mit Rahmen)

Speichere die Datei als documentation_$4.html im Ordner: $3
Falls dieser Ordner noch nicht existiert, erstelle ihn zuerst.
