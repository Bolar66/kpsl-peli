// Yhteinen äänimoottori: yksi AudioContext, erilliset väylät musiikille ja efekteille sekä
// käyttäjän äänenvoimakkuusasetukset. Selaimet sallivat äänen vasta ensimmäisen kosketuksen jälkeen.

export interface AudioSettings {
  muted: boolean;
  music: number; // 0–1
  sfx: number; // 0–1
}

const SETTINGS_KEY = 'kpsl-audio';
const DEFAULTS: AudioSettings = { muted: false, music: 0.6, sfx: 0.9 };

function readSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    // Vanha mykistysasetus siirretään uuteen muotoon
    const legacyMuted = localStorage.getItem('kpsl-muted') === '1';
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS, muted: legacyMuted };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = readSettings();
const listeners = new Set<() => void>();

export function getAudioSettings() {
  return settings;
}

export function subscribeAudioSettings(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function updateAudioSettings(change: Partial<AudioSettings>) {
  settings = { ...settings, ...change };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Tallennus ei käytössä — asetus säilyy vain tämän käynnin ajan
  }
  applyVolumes();
  listeners.forEach(l => l());
}

// ---------- Äänigraafi ----------
// musiikki → väistö (duck) → taukosuodin → musiikkivoimakkuus ┐
// efektit → efektivoimakkuus ──────────────────────────────────┴→ päävoimakkuus → kaiuttimet
let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let duckGain: GainNode;
let pauseFilter: BiquadFilterNode;
let pauseGain: GainNode;
let sfxBus: GainNode;
// Oliko sivu taustalla (esim. Safarista poistuttiin): silloin äänet rakennetaan uudelleen
let wasHidden = false;
const recreateListeners = new Set<() => void>();
// iPhone/iPad (myös iPadOS, joka esittäytyy Macina)
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Kuuloaistille tasaisempi säätö: liukusäätimen arvo potenssiin, jotta pienetkin arvot erottuvat
const curve = (v: number) => v * v;

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
  // Musiikki on taustaa: täysikin arvo jättää tilaa efekteille ja katsomolle
  musicBus.gain.setTargetAtTime(curve(settings.music) * 0.55, t, 0.05);
  sfxBus.gain.setTargetAtTime(curve(settings.sfx), t, 0.05);
}

function buildGraph() {
  ctx = new AudioContext();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  duckGain = ctx.createGain();
  pauseFilter = ctx.createBiquadFilter();
  pauseFilter.type = 'lowpass';
  pauseFilter.frequency.value = 20000;
  pauseGain = ctx.createGain();
  duckGain.connect(pauseFilter).connect(pauseGain).connect(musicBus).connect(master);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  applyVolumes();
}

// Kun Safari on ollut taustalla, iOS voi jättää äänet mykiksi vaikka ne "heräisivät".
// Varmin korjaus: vanha äänijärjestelmä suljetaan ja tilalle luodaan uusi käyttäjän kosketuksesta.
function recreate() {
  try { void ctx?.close(); } catch { /* jo suljettu */ }
  ctx = null;
  buildGraph();
  wasHidden = false;
  recreateListeners.forEach(l => l());
}

// Ilmoitus kun äänijärjestelmä on luotu uudelleen (musiikki käynnistetään uudelleen)
export function onAudioRecreated(listener: () => void) {
  recreateListeners.add(listener);
}

// Kutsutaan käyttäjän kosketuksesta: herätetään tai rakennetaan äänet uudelleen tarvittaessa
function handleGesture() {
  if (!ctx || document.hidden) return;
  if (wasHidden || ctx.state === 'closed') recreate();
  else if (ctx.state !== 'running') void ctx.resume().catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) {
    // Ei turhaa akun kulutusta taustalla
    wasHidden = true;
    void ctx.suspend().catch(() => {});
  } else if (!IS_IOS) {
    // Työpöytäselaimissa herääminen onnistuu heti. iOS:ssä "herännyt" ääni voi silti olla mykkä,
    // joten siellä seuraava kosketus rakentaa äänet aina uudelleen.
    void ctx.resume().then(() => { if (ctx?.state === 'running') wasHidden = false; }).catch(() => {});
  }
});

export function getAudioContext(): AudioContext | null {
  try {
    if (!ctx) buildGraph();
    else if (ctx.state === 'suspended' && !document.hidden && !wasHidden) void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Efektien kohde; null jos efektit on mykistetty (ei turhaa laskentaa)
export function sfxOutput(): AudioNode | null {
  if (settings.muted || settings.sfx === 0) return null;
  return getAudioContext() ? sfxBus : null;
}

// Musiikkilähteiden kohde
export function musicOutput(): AudioNode | null {
  return getAudioContext() ? duckGain : null;
}

// Musiikki väistää hetkeksi (esim. paljastus ja aplodit), palaa sitten pehmeästi
export function duckMusic(level: number, holdSeconds: number) {
  const a = getAudioContext();
  if (!a) return;
  const t = a.currentTime;
  duckGain.gain.cancelScheduledValues(t);
  duckGain.gain.setTargetAtTime(level, t, 0.08);
  duckGain.gain.setTargetAtTime(1, t + holdSeconds, 0.6);
}

// Tauolla musiikki vaimenee hieman ja kuulostaa pehmeämmältä (ei liian tukahdutetulta)
export function setMusicMuffled(muffled: boolean) {
  const a = getAudioContext();
  if (!a) return;
  pauseFilter.frequency.setTargetAtTime(muffled ? 1800 : 20000, a.currentTime, 0.25);
  pauseGain.gain.setTargetAtTime(muffled ? 0.7 : 1, a.currentTime, 0.25);
}

// iPhonen äänetön-kytkin hiljentää muuten selaimen äänet; pelin oma mykistys ohjaa ääniä
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };
try {
  const session = (navigator as NavigatorWithAudioSession).audioSession;
  if (session) session.type = 'playback';
} catch {
  // Ei tuettu (muut selaimet kuin Safari) — ei vaikutusta
}

// iOS hyväksyy äänen avauksen vasta kun sormi nostetaan (touchend/click), ei kosketuksen alussa.
// Kuunnellaan näitä koko ajan, jotta äänet heräävät myös keskeytyksen jälkeen.
const GESTURES = ['touchend', 'click', 'keydown'] as const;
GESTURES.forEach(ev => window.addEventListener(ev, handleGesture, { capture: true, passive: true }));

// Ensimmäinen kosketus avaa äänet (selainten automaattisoiton esto)
export function unlockAudioOnFirstGesture(onUnlock: () => void) {
  const handler = () => {
    if (!getAudioContext()) return;
    GESTURES.forEach(ev => window.removeEventListener(ev, handler, true));
    onUnlock();
  };
  GESTURES.forEach(ev => window.addEventListener(ev, handler, { capture: true, passive: true }));
}
