import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 10_000,
});

// Tietokannan katkeava yhteys ei saa kaataa koko palvelinta (pg heittää virheen joutilaasta yhteydestä)
pool.on('error', err => console.error('Tietokantayhteyden virhe:', err));