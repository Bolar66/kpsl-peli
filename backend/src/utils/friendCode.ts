import { randomInt } from 'crypto';
import { pool } from '../db/pool';

// Kaverikoodi: 6 merkkiä ilman helposti sekoittuvia merkkejä (0/O, 1/I/L). Näytetään muodossa K7M-4QX.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

// Hyväksyy muodot "K7M-4QX", "k7m4qx" jne.; palauttaa normalisoidun koodin tai null
export function normalizeFriendCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 6) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

// Antaa käyttäjälle uuden koodin (myös vaihdettaessa); yritetään uudelleen, jos koodi sattuu olemaan käytössä
export async function assignFriendCode(userId: number): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    try {
      await pool.query('UPDATE users SET friend_code = $1 WHERE id = $2', [code, userId]);
      return code;
    } catch (err: any) {
      if (err?.code !== '23505') throw err; // muu kuin uniikkiusvirhe
    }
  }
  throw new Error('Kaverikoodin luonti epäonnistui');
}
