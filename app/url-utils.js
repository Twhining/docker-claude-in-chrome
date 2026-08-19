'use strict';

// -----------------------------------------------------------------------------
// Gemeinsame URL-Normalisierung fuer admin-server.js (beim Anlegen erlaubter
// URLs) und server.js (beim serverseitigen Abgleich, ob eine im /run-Request
// uebermittelte URL fuer den eingeloggten User erlaubt ist).
//
// Wichtig: Beide Seiten MUESSEN dieselbe Normalisierung verwenden, sonst
// vergleicht server.js Aepfel mit Birnen (z.B. fehlender/vorhandener
// Trailing-Slash) und laesst faelschlich eigentlich erlaubte URLs abblitzen -
// oder schlimmer, vergleicht nie exakt und der 403-Check waere wirkungslos.
// -----------------------------------------------------------------------------

function normalizeUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('URL darf nicht leer sein.');
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('URL ist ungueltig.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL muss mit http:// oder https:// beginnen.');
  }
  return parsed.toString();
}

module.exports = { normalizeUrl };
