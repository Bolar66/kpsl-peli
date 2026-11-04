import { API_URL } from '../config';
import { isIos, isStandalone } from './install';

// Push-ilmoitukset: selain tilaa ilmoitukset service workerin kautta ja tilaus tallennetaan palvelimelle.
// iPhonessa ilmoitukset toimivat vain kotinäytölle lisätyssä sovelluksessa (iOS 16.4+).

export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'dev';

export function pushSupport(): PushSupport {
  if (!import.meta.env.PROD) return 'dev';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}

async function saveSubscription(token: string, subscription: PushSubscription) {
  const res = await fetch(`${API_URL}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error('Ilmoitusten tallennus epäonnistui');
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function enablePush(token: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Ilmoitukset on estetty. Salli ne puhelimen asetuksista.');
  setPushOptOut(false);
  await subscribe(token);
}

// Tilaus luodaan (tai haetaan olemassa oleva) ja tallennetaan palvelimelle. Vaatii annetun luvan.
async function subscribe(token: string): Promise<void> {
  const keyRes = await fetch(`${API_URL}/push/key`).then(r => r.json());
  if (!keyRes.publicKey) throw new Error('Ilmoitukset eivät ole vielä käytössä palvelimella');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey) });
  await saveSubscription(token, subscription);
}

export async function disablePush(token: string): Promise<void> {
  setPushOptOut(true);
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch(`${API_URL}/push/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});
  await subscription.unsubscribe();
}

// Jos laitteelle on jo annettu lupa, ilmoitukset kytketään päälle automaattisesti ja tilaus liitetään
// nykyiseen käyttäjään (sama laite, eri tunnus). Käyttäjän itse poistamaa tilausta ei palauteta.
export async function syncPushSubscription(token: string): Promise<void> {
  if (pushSupport() !== 'supported' || Notification.permission !== 'granted' || pushOptedOut()) return;
  await subscribe(token);
}

// Kertaluonteinen kysymys pelivalikossa: näytetään, jos lupaa ei ole vielä kysytty eikä kysymystä ohitettu
const PROMPT_KEY = 'bowl-push-prompted';
const OPT_OUT_KEY = 'bowl-push-off';

export function shouldPromptPush() {
  if (pushSupport() !== 'supported' || Notification.permission !== 'default') return false;
  try { return !localStorage.getItem(PROMPT_KEY); } catch { return false; }
}

export function markPushPrompted() {
  try { localStorage.setItem(PROMPT_KEY, '1'); } catch { /* yksityinen selaus */ }
}

function pushOptedOut() {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}

export function setPushOptOut(off: boolean) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch { /* yksityinen selaus */ }
}
