// Uudistusten esittely näytetään kerran per versio.
// Kasvata versiota, kun esittelyyn lisätään uusia asioita: jokainen näkee sen silloin kerran uudelleen.
const WHATS_NEW_VERSION = '2026-11-lippuvisa';
const STORAGE_KEY = 'bowl-whats-new';

export function hasUnseenWhatsNew() {
  try { return localStorage.getItem(STORAGE_KEY) !== WHATS_NEW_VERSION; } catch { return false; }
}

export function markWhatsNewSeen() {
  try { localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION); } catch { /* yksityinen selaus */ }
}
