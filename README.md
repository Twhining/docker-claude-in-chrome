# Claude Chrome Runner

Ein Docker-Container, der Chrome (mit der Claude-in-Chrome-Extension) headless
betreibt und über einen Web-Browser per noVNC fernsteuerbar macht. Zusätzlich
läuft im selben Container die Claude Code CLI, die sich mit dieser Chrome-
Instanz verbindet. Logins (Chrome-Extension & Claude Code) bleiben über
Docker-Volumes über Neustarts hinweg erhalten.

---

## 1. Architektur — wie alles zusammenhängt

```
┌─────────────────────────────────────────────────────────────────┐
│ Docker Container "claude-chrome-runner"                          │
│                                                                    │
│   Xvfb :99  ──────▶  virtueller X-Display (1920x1080x24)         │
│        │             (kein echter Monitor, alles im Speicher)     │
│        ├──▶ fluxbox            (Fenster-Manager auf Display :99)  │
│        └──▶ google-chrome      (rendert auf Display :99)          │
│                  │                                                 │
│                  ▼                                                 │
│             x11vnc (Port 5900)                                    │
│                  │  liest den Framebuffer von Display :99          │
│                  │  und spricht das VNC-Protokoll                  │
│                  ▼                                                 │
│             websockify (Port 6901)                                │
│                  │  übersetzt VNC ⇄ WebSocket                      │
│                  │  liefert zusätzlich die noVNC-Web-UI aus        │
│                  ▼                                                 │
│          (statische Dateien aus /usr/share/novnc)                 │
│                                                                     │
│   claude (Claude Code CLI) ──▶ verbindet sich mit der laufenden   │
│                                  Chrome-Instanz (Claude-in-Chrome-  │
│                                  Extension) über DevTools/Extension │
└─────────────────────────────────────────────────────────────────┘
        ▲
        │  Port 6901 (HTTP/WebSocket) nach außen gemappt
        │
   Dein Browser (Windows-Host)
   http://localhost:6901/vnc.html
```

**Warum diese Kette?** Chrome braucht einen echten X-Display zum Rendern —
auch "headless" im Sinne von "kein physischer Monitor" heißt hier nicht
`--headless`, sondern: ein X-Server läuft rein virtuell im RAM (Xvfb), Chrome
zeichnet ganz normal in diesen virtuellen Bildschirm, und x11vnc "fotografiert"
diesen Bildschirm laufend und schickt ihn per VNC-Protokoll raus. Damit du das
nicht mit einem nativen VNC-Client tun musst, übersetzt websockify das
VNC-Protokoll in WebSockets, die ein normaler Browser sprechen kann — das ist
noVNC.

Der Grund, warum du eine sichtbare Desktop-Oberfläche brauchst (statt Chrome
komplett unsichtbar `--headless` laufen zu lassen): Die Claude-in-Chrome-
Extension und der `claude login`-Flow erfordern einen echten, interaktiven
Login per Mausklick/Eingabe im Browser — das geht nur mit einem sichtbaren,
steuerbaren Chrome-Fenster.

---

## 2. Die Dateien im Projekt

| Datei | Zweck |
|---|---|
| `Dockerfile` | Baut das Image: Ubuntu 24.04 + Xvfb, x11vnc, fluxbox, novnc/websockify, Node.js, Google Chrome (stable), Claude Code CLI |
| `entrypoint.sh` | Startskript, das beim Containerstart alle Prozesse (Xvfb, fluxbox, Chrome, x11vnc, websockify) in der richtigen Reihenfolge hochfährt |
| `docker-compose.yml` | Definiert Build, Port-Mapping, Volumes und Umgebungsvariablen |
| `workspace/` | Lokaler Ordner, gemountet nach `/workspace` im Container — für Dateien/Reports, die Claude Code erzeugt |

### Was genau passiert beim Container-Start (`entrypoint.sh`)

1. Profil-Verzeichnisse anlegen (`~/.config/google-chrome`, `~/.claude`, `~/.vnc`), falls sie im frischen Volume noch nicht existieren.
2. VNC-Passwort aus der Umgebungsvariable `VNC_PASSWORD` in eine Passwort-Datei schreiben (`x11vnc -storepasswd`).
3. `Xvfb :99` starten — virtueller Bildschirm, Auflösung 1920x1080x24.
4. Warten (max. 15s), bis der X-Server über `xdpyinfo` erreichbar ist.
5. `fluxbox` starten — leichtgewichtiger Fenster-Manager, damit Chrome ein "normales" Fenster bekommt statt randlos über den ganzen Screen zu hängen.
6. **Verwaiste Chrome-Lock-Dateien löschen** (`SingletonLock`, `SingletonCookie`, `SingletonSocket`) — siehe Abschnitt 6 "Bekannte Stolperfallen".
7. `google-chrome --no-sandbox --disable-dev-shm-usage ...` starten.
8. `x11vnc` auf Port 5900 starten, gebunden an Display `:99`, passwortgeschützt.
9. `websockify` auf Port 6901 starten — dient die noVNC-Weboberfläche aus (`/usr/share/novnc`) und tunnelt gleichzeitig zu `localhost:5900`.
10. `tail -f /dev/null` — hält den Container am Leben (PID 1 muss laufen bleiben).

---

## 3. Befehle — Cheat Sheet

Alle Befehle im Projektordner ausführen:

```powershell
cd C:\Users\leonb\docker-claude-runner
```

| Aktion | Befehl |
|---|---|
| Image bauen + Container starten (Hintergrund) | `docker compose up -d --build` |
| Container starten (ohne neu zu bauen) | `docker compose up -d` |
| Status prüfen | `docker compose ps` |
| Live-Logs ansehen | `docker compose logs -f` |
| Container stoppen (Volumes/Logins bleiben) | `docker compose down` |
| Container + Volumes löschen (**Logins weg!**) | `docker compose down -v` |
| Shell im Container öffnen | `docker exec -it claude-chrome-runner bash` |
| Container neu starten | `docker compose restart` |
| Laufende Prozesse im Container prüfen | `docker exec claude-chrome-runner bash -c "ps aux"` |

**Wichtig:** `--build` nur beim ersten Start oder nach Änderungen an
`Dockerfile`/`entrypoint.sh` nötig. Danach reicht `docker compose up -d`.

---

## 4. Ports — wohin verbinden?

| Port | Wofür | Wie erreichen |
|---|---|---|
| **6901** | noVNC Web-UI (HTTP + WebSocket) | Browser: `http://localhost:6901/vnc.html` |
| 5900 | Roher VNC-Port (x11vnc) | **nicht** nach außen gemappt — nur intern im Container, falls du mal einen nativen VNC-Client statt noVNC nutzen willst, müsstest du ihn zusätzlich in `docker-compose.yml` unter `ports:` freigeben |

Beim Öffnen von `http://localhost:6901/vnc.html` fragt noVNC nach dem
VNC-Passwort → Standard: **`claude1234`** (konfigurierbar über die
Umgebungsvariable `VNC_PASSWORD` in `docker-compose.yml`).

---

## 5. Nutzung — Schritt für Schritt

### 5.1 Erststart

```powershell
docker compose up -d --build
```

Legt zwei benannte Volumes an (`chrome-profile`, `claude-auth`) sowie den
Bind-Mount `./workspace`. Diese überleben `docker compose down` / `up` /
`restart` — nur `docker compose down -v` löscht sie.

### 5.2 Per Browser verbinden

`http://localhost:6901/vnc.html` öffnen → Passwort `claude1234` eingeben →
du siehst den fluxbox-Desktop mit einem offenen Chrome-Fenster.

### 5.3 Einmaliger Login: Claude-in-Chrome-Extension

1. Zugriff anfordern über [claude.com/chrome](https://claude.com/chrome) bzw. die [Help-Center-Anleitung](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome) (Feature ist an Pro/Max/Team/Enterprise gebunden).
2. Im Chrome-Fenster **innerhalb von noVNC** den Installationslink aus der Zugriffs-E-Mail öffnen.
3. Extension installieren, mit deinem Anthropic-Account einloggen.
4. Der Login landet in `/root/.config/google-chrome` → Volume `chrome-profile` → bleibt über Neustarts erhalten.

### 5.4 Einmaliger Login: Claude Code CLI

```powershell
docker exec -it claude-chrome-runner bash
claude login
```

Dem angezeigten Link/Code folgen. Die Session-Daten landen in `/root/.claude`
→ Volume `claude-auth` → bleibt über Neustarts erhalten.

**Alternative ohne interaktiven Login:** API-Key statt Login verwenden — in
`docker-compose.yml` die Zeile

```yaml
# - ANTHROPIC_API_KEY=sk-ant-...
```

einkommentieren, Key eintragen (besser: über eine `.env`-Datei statt im
Klartext), dann `docker compose up -d` neu ausführen.

### 5.5 Verbindung Claude Code ⇄ Chrome prüfen

```powershell
docker exec -it claude-chrome-runner bash
claude --chrome
```

In der interaktiven Session:

```
/chrome
```

Zeigt den Verbindungsstatus zur Chrome-Extension an.

### 5.6 Alltägliche Nutzung

Danach reicht für den täglichen Gebrauch:

```powershell
docker compose up -d      # Container starten
# ... im Browser oder per docker exec arbeiten ...
docker compose down       # Container stoppen, Logins bleiben erhalten
```

---

## 6. Bekannte Stolperfallen

### "The profile appears to be in use by another Google Chrome process"

Chrome legt beim Start eine `SingletonLock`-Datei im Profilordner an, um
Mehrfachstarts zu verhindern. Da das Profil in einem **persistenten Volume**
liegt, aber der Container bei jedem `docker compose up`/`restart` eine neue
Container-ID bekommt, denkt Chrome fälschlich, ein "anderer Computer" nutze
das Profil noch — es verweigert den Start.

**Lösung (bereits umgesetzt):** `entrypoint.sh` löscht vor jedem Chrome-Start
automatisch `SingletonLock`, `SingletonCookie` und `SingletonSocket` aus dem
Profilordner (`rm -f`, kein Fehler falls die Dateien fehlen).

### Chrome stürzt ab / "Out of memory" im Container

Ursache: zu kleiner `/dev/shm` (Standard bei Docker: 64 MB). Deshalb ist in
`docker-compose.yml` `shm_size: "2gb"` gesetzt. Zusätzlich läuft Chrome mit
`--disable-dev-shm-usage`, was `/dev/shm` weitgehend umgeht und stattdessen
`/tmp` nutzt.

### `--no-sandbox`

Chromes eigener Sandbox-Mechanismus benötigt Kernel-Rechte (u. a.
`CAP_SYS_ADMIN` / User-Namespaces), die ein Container standardmäßig nicht
gewährt. Ohne `--no-sandbox` startet Chrome im Container gar nicht. Das ist
der Standard-Workaround für Chrome-in-Docker-Setups — impliziert aber, dass
Chrome ohne seine übliche Prozess-Isolation läuft. Das ist hier akzeptabel,
weil der Container selbst schon eine Isolationsgrenze bildet und keine
nicht vertrauenswürdigen Seiten automatisiert geöffnet werden.

### Kein Ton, keine GPU-Beschleunigung

`--disable-gpu` ist gesetzt, da im virtuellen Framebuffer (Xvfb) ohnehin
keine echte GPU verfügbar ist. Für den Anwendungsfall (Extension-Steuerung,
kein Video/3D) ist das irrelevant.

### `dbus`-Fehlermeldungen im Log

Beim Start erscheinen harmlose Zeilen wie
`Failed to connect to the bus: ...`. Es läuft kein D-Bus-Session-Daemon im
Container; Chrome versucht trotzdem, sich zu verbinden (für Desktop-
Integrationen wie Benachrichtigungen), scheitert und läuft normal weiter.
Kann ignoriert werden.

---

## 7. Datenpersistenz im Detail

| Volume/Mount | Container-Pfad | Inhalt |
|---|---|---|
| `chrome-profile` (named volume) | `/root/.config/google-chrome` | Chrome-Profil: Extensions, Cookies, Login-Sessions, Bookmarks |
| `claude-auth` (named volume) | `/root/.claude` | Claude Code CLI: Auth-Token/Session |
| `./workspace` (bind mount) | `/workspace` | Arbeitsverzeichnis von Claude Code — hier landen z. B. generierte Dateien/Reports, direkt auf deinem Windows-Host unter `docker-claude-runner\workspace` einsehbar |

Volumes einsehen:

```powershell
docker volume ls | Select-String claude
docker volume inspect docker-claude-runner_chrome-profile
```

Volumes (und damit alle Logins) vollständig zurücksetzen:

```powershell
docker compose down -v
```

---

## 8. Sicherheitshinweise

- Das VNC-Passwort (`claude1234`) steht aktuell im Klartext in
  `docker-compose.yml`. Für produktiven/öffentlichen Einsatz: in eine lokale
  `.env`-Datei auslagern (nicht committen) und per `${VNC_PASSWORD}`
  referenzieren.
- Port 6901 ist nur für `localhost` gedacht. Bei Exposition ins Netz/Internet
  zusätzlich TLS (z. B. Reverse-Proxy davor) und ein starkes Passwort
  verwenden.
- Chrome läuft mit `--no-sandbox` und als `root` im Container — der Container
  selbst ist damit die einzige Isolationsgrenze. Keine nicht
  vertrauenswürdigen/unbekannten Seiten in dieser Instanz automatisiert
  öffnen lassen.
