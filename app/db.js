'use strict';

// -----------------------------------------------------------------------------
// Gemeinsame SQLite-Anbindung fuer server.js (Runner-App) und admin-server.js
// (Admin-Panel). Beide Prozesse requiren dieselbe Datei und oeffnen damit
// eigene Connections auf dieselbe Datenbankdatei (WAL-Modus erlaubt das
// nebenlaeufig fuer diesen kleinen Anwendungsfall problemlos).
// -----------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.APP_DB_PATH || path.join(DATA_DIR, 'app.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    claude_account_email TEXT,
    session_id TEXT,
    login_status TEXT NOT NULL DEFAULT 'not_configured',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS allowed_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_allowed_urls_user_id ON allowed_urls(user_id);
`);

module.exports = db;
