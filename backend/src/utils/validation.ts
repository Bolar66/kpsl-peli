// Asiakkaalta tulevaan dataan ei voi luottaa: apufunktiot syötteiden tarkistamiseen.

// Numero sallitulle välille; kaikki muu (teksti, NaN, objektit) korvataan oletusarvolla
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

// Huonekoodit ovat 4 merkkiä (A–Z, 2–9). Palauttaa normalisoidun koodin tai null.
export function parseRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

// Nimimerkki: 2–20 merkkiä, kirjaimet (myös ääkköset), numerot, välilyönti, _ - .
// Estää näkymättömät ja suunnanvaihtomerkit, joilla voisi esiintyä toisena pelaajana.
export function validateUsername(value: unknown, min = 2): { ok: true; username: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Nimimerkki vaaditaan' };
  const username = value.trim().replace(/\s+/g, ' ');
  if (username.length < min || username.length > 20) {
    return { ok: false, error: `Nimimerkin pituus ${min}–20 merkkiä` };
  }
  if (!/^[\p{L}\p{N}_.\- ]+$/u.test(username)) {
    return { ok: false, error: 'Nimimerkissä saa olla vain kirjaimia, numeroita, välilyöntejä ja merkit _ - .' };
  }
  return { ok: true, username };
}

// bcrypt käyttää vain 72 ensimmäistä tavua, ja hyvin pitkät salasanat hidastavat palvelinta
export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 6) return 'Salasanan pituus vähintään 6 merkkiä';
  if (Buffer.byteLength(value) > 72) return 'Salasana on liian pitkä (enintään 72 merkkiä)';
  return null;
}
