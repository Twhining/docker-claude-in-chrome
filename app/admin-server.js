'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { normalizeUrl } = require('./url-utils');

const app = express();
const PORT = process.env.ADMIN_PORT || 4000;

// Bewusst ein eigenes Passwort, komplett getrennt von den normalen Usern in
// der users-Tabelle: das Admin-Panel verwaltet Zugriffsrechte, ist aber
// keiner der verwalteten Personen zugeordnet.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// Fallback-Secret: zufaellig pro Prozessstart, falls keine
// ADMIN_SESSION_SECRET gesetzt ist. Invalidiert bestehende Sessions bei
// jedem Neustart des Panels - fuer dieses interne Admin-Tool unproblematisch.
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const LOGIN_STATUS_VALUES = ['not_configured', 'chrome_pending', 'claude_code_pending', 'ready'];

// Platzhalter-Liste verfuegbarer Sessions/Container. Wird spaeter durch eine
// echte Container-Verwaltung ersetzt.
const AVAILABLE_SESSIONS = ['session-1', 'session-2', 'session-3'];

const BCRYPT_COST = 10;

app.use(express.json({ limit: '1mb' }));
app.use(
  session({
    secret: SESSION_SECRET,
    // Eigener Cookie-Name, damit sich die Admin-Session nicht mit der
    // Runner-App-Session (server.js, Cookie "runner.sid") ueberschneidet -
    // beide laufen auf localhost, nur mit unterschiedlichem Port, und
    // Cookies sind nicht portspezifisch.
    name: 'admin.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // In Produktion hinter HTTPS zusaetzlich `secure: true` setzen.
      maxAge: 24 * 60 * 60 * 1000, // 24h
    },
  })
);

// -----------------------------------------------------------------------------
// Admin-Auth
// -----------------------------------------------------------------------------

function isAuthenticated(req) {
  return !!(req.session && req.session.authenticated);
}

app.post('/admin/login', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const given = Buffer.from(password);
  const expected = Buffer.from(ADMIN_PASSWORD);
  const valid =
    given.length === expected.length && crypto.timingSafeEqual(given, expected);

  if (!valid) {
    return res.status(401).json({ success: false, error: 'Falsches Passwort.' });
  }

  // Session-ID nach Login neu erzeugen (schuetzt vor Session-Fixation).
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Login fehlgeschlagen.' });
    }
    req.session.authenticated = true;
    res.json({ success: true });
  });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('admin.sid');
    res.json({ success: true });
  });
});

app.get('/admin/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// Schuetzt alle /api/*-Routen. Ein Redirect ist fuer JSON-Fetch-Aufrufe des
// Frontends wenig hilfreich (fetch() folgt Redirects, liefert dann aber HTML
// statt JSON zurueck) - stattdessen 401 JSON zurueckgeben; das Frontend
// erkennt das und zeigt das Login-Formular wieder an. Effekt fuer den Nutzer
// ist identisch: ohne gueltige Session gelangt man nicht an die Daten.
app.use('/api', (req, res, next) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ success: false, error: 'Nicht eingeloggt.' });
  }
  next();
});

// admin.html ist komplett eigenstaendig (kein separates CSS/JS) - kein
// blanket express.static() noetig. Wichtig: server.js (Runner-App) und
// admin-server.js teilen sich den public/-Ordner, sollen aber NICHT
// gegenseitig ihre Seiten ausliefern - deshalb hier nur ein expliziter
// Pfad statt eines statischen Mounts ueber den ganzen Ordner.
app.get(['/', '/admin/login'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// -----------------------------------------------------------------------------
// Validierung
// -----------------------------------------------------------------------------

function validateNonEmptyString(raw, fieldName, maxLen = 500) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`${fieldName} darf nicht leer sein.`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLen) {
    throw new Error(`${fieldName} ist zu lang (max. ${maxLen} Zeichen).`);
  }
  return trimmed;
}

function validateEmail(raw, fieldName = 'E-Mail') {
  const trimmed = validateNonEmptyString(raw, fieldName, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error(`${fieldName} ist ungueltig.`);
  }
  return trimmed.toLowerCase();
}

function validatePassword(raw) {
  if (typeof raw !== 'string' || raw.length < 8) {
    throw new Error('Passwort muss mindestens 8 Zeichen lang sein.');
  }
  if (raw.length > 200) {
    throw new Error('Passwort ist zu lang (max. 200 Zeichen).');
  }
  return raw;
}

function validateLoginStatus(raw) {
  if (!LOGIN_STATUS_VALUES.includes(raw)) {
    throw new Error(`login_status muss einer von ${LOGIN_STATUS_VALUES.join(', ')} sein.`);
  }
  return raw;
}

function getUserOr404(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    const err = new Error('User nicht gefunden.');
    err.statusCode = 404;
    throw err;
  }
  return user;
}

// password_hash wird NIE nach aussen gegeben, auch nicht ueber das Admin-API.
function serializeUser(user) {
  const urls = db
    .prepare('SELECT id, url, label, created_at FROM allowed_urls WHERE user_id = ? ORDER BY id')
    .all(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    claude_account_email: user.claude_account_email,
    session_id: user.session_id,
    login_status: user.login_status,
    created_at: user.created_at,
    active: !!user.active,
    allowed_urls: urls,
  };
}

// -----------------------------------------------------------------------------
// API: Users
// -----------------------------------------------------------------------------

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json(users.map(serializeUser));
});

app.post('/api/users', (req, res) => {
  try {
    const body = req.body || {};
    const name = validateNonEmptyString(body.name, 'Name', 200);
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);

    const info = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name, email, passwordHash);

    res.status(201).json(serializeUser(getUserOr404(info.lastInsertRowid)));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE/.test(err.message || '')) {
      return res.status(409).json({ success: false, error: 'Ein User mit dieser E-Mail existiert bereits.' });
    }
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// Bearbeitbar sind ausschliesslich claude_account_email, session_id,
// login_status und active - Name/E-Mail/Passwort werden hier bewusst nicht
// angefasst (E-Mail ist der Login-Name, ein Passwort-Reset waere ein eigener,
// separat abzusichernder Vorgang).
app.put('/api/users/:id', (req, res) => {
  try {
    const user = getUserOr404(req.params.id);
    const body = req.body || {};

    const updates = {};

    if (body.claude_account_email !== undefined) {
      updates.claude_account_email =
        body.claude_account_email === null || body.claude_account_email === ''
          ? null
          : validateEmail(body.claude_account_email, 'claude_account_email');
    }
    if (body.session_id !== undefined) {
      updates.session_id = body.session_id === null || body.session_id === '' ? null : String(body.session_id).trim();
    }
    if (body.login_status !== undefined) {
      updates.login_status = validateLoginStatus(body.login_status);
    }
    if (body.active !== undefined) {
      updates.active = body.active ? 1 : 0;
    }

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine aenderbaren Felder uebergeben.' });
    }

    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => updates[f]);
    db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...values, user.id);

    res.json(serializeUser(getUserOr404(user.id)));
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// Kein Hard-Delete: setzt active=false, damit Historie/Zuordnungen erhalten
// bleiben. Wirkt sich unmittelbar auf die Runner-App aus: server.js prueft
// bei jedem geschuetzten Request erneut, ob der User noch aktiv ist.
app.delete('/api/users/:id', (req, res) => {
  try {
    const user = getUserOr404(req.params.id);
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// API: erlaubte URLs
// -----------------------------------------------------------------------------

app.post('/api/users/:id/urls', (req, res) => {
  try {
    const user = getUserOr404(req.params.id);
    const body = req.body || {};
    const url = normalizeUrl(body.url);
    const label = body.label !== undefined && body.label !== null && body.label !== ''
      ? validateNonEmptyString(body.label, 'label', 200)
      : null;

    const info = db
      .prepare('INSERT INTO allowed_urls (user_id, url, label) VALUES (?, ?, ?)')
      .run(user.id, url, label);

    const created = db.prepare('SELECT id, url, label, created_at FROM allowed_urls WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message });
  }
});

app.delete('/api/urls/:id', (req, res) => {
  const info = db.prepare('DELETE FROM allowed_urls WHERE id = ?').run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ success: false, error: 'URL nicht gefunden.' });
  }
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// API: Sessions (Platzhalter)
// -----------------------------------------------------------------------------

app.get('/api/sessions', (req, res) => {
  res.json(AVAILABLE_SESSIONS);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[admin] Admin-Panel laeuft auf Port ${PORT}`);
  if (ADMIN_PASSWORD === 'changeme') {
    console.warn('[admin] WARNUNG: ADMIN_PASSWORD ist nicht gesetzt, verwende unsicheren Default "changeme".');
  }
});
