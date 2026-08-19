#!/bin/bash
set -e

export DISPLAY=:99
RESOLUTION="1920x1080x24"
VNC_PORT=5900
NOVNC_PORT=6901
VNC_PASSWORD="${VNC_PASSWORD:-claude1234}"

echo "[entrypoint] Stelle sicher, dass Profil-Verzeichnisse existieren..."
mkdir -p "$HOME/.config/google-chrome" "$HOME/.claude" "$HOME/.vnc"

echo "[entrypoint] Setze VNC-Passwort..."
x11vnc -storepasswd "$VNC_PASSWORD" "$HOME/.vnc/passwd" >/dev/null

echo "[entrypoint] Starte Xvfb auf Display $DISPLAY ($RESOLUTION)..."
Xvfb "$DISPLAY" -screen 0 "$RESOLUTION" -nolisten tcp &
XVFB_PID=$!

# Warten bis der X-Server bereit ist
for i in $(seq 1 30); do
    if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

echo "[entrypoint] Starte fluxbox (Fenster-Manager)..."
fluxbox &

sleep 1

echo "[entrypoint] Entferne verwaiste Singleton-Lock-Dateien aus dem Chrome-Profil..."
rm -f "$HOME/.config/google-chrome/SingletonLock" \
      "$HOME/.config/google-chrome/SingletonCookie" \
      "$HOME/.config/google-chrome/SingletonSocket"

echo "[entrypoint] Starte Google Chrome..."
google-chrome \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --start-maximized \
    --window-position=0,0 \
    --no-first-run \
    --no-default-browser-check \
    about:blank &

echo "[entrypoint] Starte x11vnc auf Port $VNC_PORT (passwortgeschützt)..."
x11vnc -display "$DISPLAY" -forever -shared -rfbport "$VNC_PORT" -rfbauth "$HOME/.vnc/passwd" -quiet &

echo "[entrypoint] Starte websockify/noVNC auf Port $NOVNC_PORT..."
websockify --web=/usr/share/novnc "$NOVNC_PORT" "localhost:$VNC_PORT" &

echo "[entrypoint] Starte Runner-Web-App (Express) auf Port ${PORT:-3000}..."
node /app/server.js &

echo "[entrypoint] Starte Admin-Panel (Express) auf Port ${ADMIN_PORT:-4000}..."
node /app/admin-server.js &

echo "[entrypoint] Setup abgeschlossen. noVNC: Port $NOVNC_PORT, Runner-App: Port ${PORT:-3000}, Admin-Panel: Port ${ADMIN_PORT:-4000}."

# Container am Leben halten
tail -f /dev/null
