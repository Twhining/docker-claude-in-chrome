FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    DISPLAY=:99 \
    HOME=/root

# --- Basis-Pakete, Xvfb, VNC, Fenster-Manager, noVNC -----------------------
# build-essential: Fallback-Build-Toolchain fuer better-sqlite3 (natives
# npm-Modul), falls fuer diese Node-/Linux-Kombination kein vorgebautes
# Binary via prebuild-install verfuegbar sein sollte.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        wget \
        gnupg \
        locales \
        xvfb \
        x11vnc \
        fluxbox \
        dbus-x11 \
        novnc \
        websockify \
        python3 \
        x11-utils \
        build-essential \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# --- Google Chrome (stable, offizielles Repo) -------------------------------
RUN wget -q -O /usr/share/keyrings/google-chrome.pub https://dl.google.com/linux/linux_signing_key.pub \
    && gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg /usr/share/keyrings/google-chrome.pub \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# --- Node.js (LTS) + npm -----------------------------------------------------
# 22.x statt 20.x: better-sqlite3@13 verlangt node >=22 (engines-Feld). Mit
# Node 20 installiert npm es trotzdem (nur eine EBADENGINE-Warnung), aber die
# native Binary crasht dann beim ersten echten DB-Zugriff mit SIGSEGV.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# --- Claude Code CLI (global) ------------------------------------------------
RUN npm install -g @anthropic-ai/claude-code

# --- Web-App (Express): Runner-App (server.js) + Admin-Panel (admin-server.js) ---
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm install --omit=dev
COPY app/server.js app/admin-server.js app/db.js app/url-utils.js ./
COPY app/public ./public

WORKDIR /workspace

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 6901 3000 4000

ENTRYPOINT ["/entrypoint.sh"]
