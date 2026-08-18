'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;

// Persistenter, gemounteter Ordner – einzig zulässige Basis für outputPath.
const ALLOWED_BASE_PATH = '/workspace';
const RUN_TIMEOUT_MS = 20 * 60 * 1000; // 20 Minuten
const MAX_BUFFER = 20 * 1024 * 1024; // 20 MB stdout/stderr

const LOGIN_REGEX = /login|anmeldung|unauthorized/i;
const LOGIN_HINT =
  'Vermutlich nicht eingeloggt – bitte im noVNC-Fenster (localhost:6901) manuell einloggen und erneut versuchen';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Validierung / Sanitizing
//
// Hinweis: child_process.execFile() startet den Prozess OHNE Shell (kein
// execve("/bin/sh", "-c", ...)) – klassische Shell-Metazeichen ($, `, ;, |, &&
// usw.) in den Argumenten können daher grundsätzlich keinen zusätzlichen
// Befehl einschleusen. Die Validierung hier dient trotzdem als Verteidigung
// in der Tiefe: sie verhindert Pfad-Traversal (outputPath/Dateiname),
// verhindert, dass Leerzeichen/Sonderzeichen in title/url die positionelle
// $1..$4-Argument-Zerlegung des Slash-Commands (test-app.md / document_app.md)
// durcheinanderbringen, und begrenzt Eingabegrößen gegen Missbrauch.
// ---------------------------------------------------------------------------

function validateWorkflowPrompt(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('Workflow-Prompt darf nicht leer sein.');
  }
  if (raw.length > 500000) {
    throw new Error('Workflow-Prompt ist zu lang (max. 500.000 Zeichen).');
  }
  return raw;
}

function validateUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('URL darf nicht leer sein.');
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('URL ist ungültig.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL muss mit http:// oder https:// beginnen.');
  }
  return parsed.toString();
}

function validateOutputPath(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('Speicherort darf nicht leer sein.');
  }
  const normalized = path.posix.normalize(raw.trim().replace(/\\/g, '/'));
  if (!normalized.startsWith('/')) {
    throw new Error('Speicherort muss ein absoluter Pfad sein.');
  }
  if (normalized !== ALLOWED_BASE_PATH && !normalized.startsWith(ALLOWED_BASE_PATH + '/')) {
    throw new Error(`Speicherort muss innerhalb von ${ALLOWED_BASE_PATH} liegen.`);
  }
  if (normalized.split('/').includes('..')) {
    throw new Error('Speicherort enthält ungültige Pfad-Bestandteile.');
  }
  return normalized;
}

function validateTitle(raw) {
  if (typeof raw !== 'string') {
    throw new Error('Titel fehlt.');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Titel darf nicht leer sein.');
  }
  if (trimmed.length > 100) {
    throw new Error('Titel ist zu lang (max. 100 Zeichen).');
  }
  // Buchstaben (inkl. Umlaute), Zahlen, Leerzeichen, "_" und "-"
  if (!/^[\p{L}\p{N} _-]+$/u.test(trimmed)) {
    throw new Error('Titel darf nur Buchstaben, Zahlen, Leerzeichen, "_" und "-" enthalten.');
  }
  return trimmed;
}

function validateMode(raw) {
  if (raw !== 'test' && raw !== 'doc') {
    throw new Error('Ungültiger Modus (erlaubt: "test" oder "doc").');
  }
  return raw;
}

// Bettet einen Wert sicher in die $1.."$4"-Argumentliste des Slash-Commands
// ein: umschlossen von doppelten Anführungszeichen, enthaltene Backslashes
// und Anführungszeichen werden escaped. Verhindert, dass Leerzeichen im Wert
// als zusätzliche $N-Argumente interpretiert werden.
function quoteArg(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function cleanupTempFile(tempFile) {
  if (!tempFile) return;
  fs.unlink(tempFile, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`[server] Konnte temporäre Workflow-Datei nicht löschen: ${tempFile} (${err.message})`);
    }
  });
}

// Prüft, ob die von test-app.md/document_app.md vorgeschriebene Datei
// (testreport_<Titel>.html bzw. documentation_<Titel>.html) in outputPath
// existiert. Verlässt sich darauf, dass $1.."$4" dank des Dummy-Arguments in
// promptString (siehe oben) korrekt bei tempFile/url/outputPath/title
// ankommen – die Datei landet also exakt dort, wo der Command-Text es
// vorschreibt.
function findGeneratedReport(outputPath, filenamePrefix, title) {
  const name = `${filenamePrefix}${title}.html`;
  const full = path.join(outputPath, name);
  return fs.existsSync(full) ? { name, dir: outputPath } : null;
}

// ---------------------------------------------------------------------------
// POST /run – führt /test-app oder /document_app über die Claude Code CLI aus
// ---------------------------------------------------------------------------

app.post('/run', async (req, res) => {
  let tempFile = null;

  try {
    const body = req.body || {};
    const workflowPrompt = validateWorkflowPrompt(body.workflowPrompt);
    const url = validateUrl(body.url);
    const outputPath = validateOutputPath(body.outputPath || ALLOWED_BASE_PATH);
    const title = validateTitle(body.title);
    const mode = validateMode(body.mode);

    fs.mkdirSync(outputPath, { recursive: true });

    // Temporäre Workflow-Datei mit eindeutigem Namen (Timestamp + PID), um
    // Namenskonflikte bei parallelen Läufen zu vermeiden.
    tempFile = path.join(outputPath, `_workflow_temp_${Date.now()}_${process.pid}.txt`);
    fs.writeFileSync(tempFile, workflowPrompt, 'utf8');

    const slashCommand = mode === 'test' ? '/test-app' : '/document_app';
    // WORKAROUND: Die Claude Code CLI verschluckt beim headless-Aufruf
    // (`claude -p "/command arg1 arg2 ..."`) nachweislich das allererste
    // Argument nach dem Command-Namen – $1 im Command-File bekommt in
    // Wirklichkeit den ZWEITEN übergebenen Wert usw. (reproduzierbar
    // getestet, unabhängig von Quoting). Ein vorangestelltes Dummy-Argument
    // "_" fängt diesen Verlust ab, sodass $1..$4 in test-app.md/document_app.md
    // wieder korrekt auf tempFile/url/outputPath/title zeigen.
    const promptString =
      `${slashCommand} _ ${quoteArg(tempFile)} ${quoteArg(url)} ${quoteArg(outputPath)} ${quoteArg(title)}`;

    const args = [
      '-p', promptString,
      // --chrome verbindet die Session mit der Claude-in-Chrome-Extension;
      // ohne diesen Flag hat die Session keinerlei Browser-Tools (mcp__claude-in-chrome__*)
      // zur Verfügung und kann die Ziel-App gar nicht öffnen/prüfen.
      '--chrome',
      '--allowedTools', 'Bash,Read,Write,Edit,mcp__claude-in-chrome',
      '--permission-mode', 'acceptEdits',
      '--output-format', 'json',
    ];

    const filenamePrefix = mode === 'test' ? 'testreport_' : 'documentation_';

    let execOk = true;
    let stdoutText = '';
    let stderrText = '';
    let execErr = null;

    try {
      const result = await execFileAsync('claude', args, {
        cwd: '/workspace',
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      stdoutText = result.stdout || '';
    } catch (err) {
      // execFileAsync (promisify) hängt stdout/stderr an das Error-Objekt.
      execOk = false;
      execErr = err;
      stdoutText = err.stdout || '';
      stderrText = err.stderr || '';
    }

    // Unabhängig vom Exit-Status IMMER zuerst im Dateisystem nachsehen: Wenn
    // die Report-Datei tatsächlich entstanden ist, zählt das als Erfolg –
    // auch wenn der Prozess mit Fehler/Timeout endete (z.B. weil die App
    // selbst hakte, der Report aber schon fertig geschrieben war).
    const generated = findGeneratedReport(outputPath, filenamePrefix, title);
    if (generated) {
      return res.json({
        success: true,
        mode,
        filename: generated.name,
        downloadUrl: `/download/${encodeURIComponent(generated.name)}?path=${encodeURIComponent(generated.dir)}`,
      });
    }

    // Kein Report gefunden -> Fehler klassifizieren.
    if (!execOk) {
      const combinedText = `${stderrText}\n${stdoutText}\n${execErr.message || ''}`;

      if (execErr.killed || execErr.signal) {
        return res.status(504).json({
          success: false,
          error: 'Zeitüberschreitung: Der Befehl hat länger als 20 Minuten gedauert und wurde abgebrochen.',
        });
      }

      if (LOGIN_REGEX.test(combinedText)) {
        return res.status(401).json({ success: false, error: LOGIN_HINT });
      }

      return res.status(500).json({
        success: false,
        error: stderrText.trim() || execErr.message || 'Unbekannter Fehler bei der Ausführung.',
        stderr: stderrText || undefined,
      });
    }

    // Prozess ist erfolgreich (Exit-Code 0) durchgelaufen, hat aber keine
    // Report-Datei erzeugt – z.B. weil die App selbst eine Login-Maske
    // gezeigt hat und /test-app bzw. /document_app das im Fließtext
    // gemeldet haben, statt mit einem Fehler-Exit-Code abzubrechen.
    let resultText = stdoutText;
    try {
      const parsed = JSON.parse(stdoutText);
      resultText = parsed.result || parsed.message || JSON.stringify(parsed);
    } catch {
      // stdout war kein JSON – Rohtext weiterverwenden.
    }

    if (LOGIN_REGEX.test(resultText)) {
      return res.status(401).json({ success: false, error: LOGIN_HINT });
    }

    return res.status(500).json({
      success: false,
      error: `Es wurde keine Report-Datei erzeugt. Antwort von Claude Code: ${String(resultText).slice(0, 2000)}`,
    });
  } catch (validationError) {
    return res.status(400).json({ success: false, error: validationError.message });
  } finally {
    cleanupTempFile(tempFile);
  }
});

// ---------------------------------------------------------------------------
// GET /download/:filename?path=<outputPath> – liefert die fertige HTML-Datei
// aus. Das outputPath-Verzeichnis wird als Query-Parameter mitgegeben, da es
// je nach Lauf unterschiedlich sein kann (Default: /workspace).
// ---------------------------------------------------------------------------

app.get('/download/:filename', (req, res) => {
  try {
    // path.basename entfernt jegliche Verzeichnis-Anteile aus dem Dateinamen
    // (verhindert Pfad-Traversal wie "../../etc/passwd").
    const filename = path.basename(req.params.filename || '');
    if (!filename || filename === '.' || filename === '..') {
      return res.status(400).json({ error: 'Ungültiger Dateiname.' });
    }

    const rawPath = typeof req.query.path === 'string' && req.query.path.trim() !== ''
      ? req.query.path
      : ALLOWED_BASE_PATH;
    const basePath = validateOutputPath(rawPath);

    const resolvedBase = path.resolve(basePath);
    const resolvedFull = path.resolve(basePath, filename);
    if (resolvedFull !== resolvedBase && !resolvedFull.startsWith(resolvedBase + path.sep)) {
      return res.status(400).json({ error: 'Ungültiger Pfad.' });
    }

    if (!fs.existsSync(resolvedFull)) {
      return res.status(404).json({ error: 'Datei nicht gefunden.' });
    }

    res.download(resolvedFull, filename);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Web-App läuft auf Port ${PORT}`);
});
