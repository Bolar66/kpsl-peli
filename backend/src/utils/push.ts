import webpush from 'web-push';
import { pool } from '../db/pool';

// Push-ilmoitukset (Web Push). Avaimet ympäristömuuttujista:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (esim. mailto:osoite@esimerkki.fi)
// Ilman avaimia ilmoituksia ei lähetetä (sovellus toimii muuten normaalisti).
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
export const pushEnabled = !!(publicKey && privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey!, privateKey!);
}

export function getPublicKey() {
  return publicKey ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export async function sendPush(userId: number, payload: PushPayload): Promise<void> {
  if (!pushEnabled) return;
  const subs = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);
  await Promise.all(subs.rows.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 }
      );
    } catch (err: any) {
      // Vanhentunut tai peruttu tilaus poistetaan
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      } else {
        console.error('Push-ilmoitus epäonnistui:', err?.statusCode ?? err);
      }
    }
  }));
}
