// Pelin ääniefektit syntetisoidaan Web Audio -rajapinnalla, joten erillisiä äänitiedostoja ei tarvita.
// Selaimet sallivat äänen vasta käyttäjän ensimmäisen kosketuksen jälkeen, joten konteksti luodaan laiskasti.

import { getAudioContext, getAudioSettings, sfxOutput, updateAudioSettings } from './audioEngine';

// Vanha mykistysrajapinta: mykistää kaikki äänet (musiikki + efektit)
export function isMuted() {
  return getAudioSettings().muted;
}

export function setMuted(value: boolean) {
  updateAudioSettings({ muted: value });
}

// Palauttaa kontekstin ja efektiväylän, tai null jos efektit eivät ole käytössä
function audio(): { a: AudioContext; out: AudioNode } | null {
  const out = sfxOutput();
  const a = getAudioContext();
  return out && a ? { a, out } : null;
}

// Yksittäinen sävy: taajuus voi liukua (from → to), äänenvoimakkuus hiipuu pehmeästi
function tone(from: number, to: number, duration: number, { type = 'sine', volume = 0.15, delay = 0 }: {
  type?: OscillatorType; volume?: number; delay?: number;
} = {}) {
  const au = audio();
  if (!au) return;
  const { a, out: sfxOut } = au;
  const start = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(sfxOut);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Lyhyt kohinapurske (esim. kortin kääntö)
function noise(duration: number, { volume = 0.12, delay = 0, filter = 1800 } = {}) {
  const au = audio();
  if (!au) return;
  const { a, out: sfxOut } = au;
  const start = a.currentTime + delay;
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filter;
  const gain = a.createGain();
  gain.gain.value = volume;
  src.connect(bp).connect(gain).connect(sfxOut);
  src.start(start);
}

// ---------- Katsomo ----------
// Oikeita äänitteitä (CC0, BigSoundBank.com), normalisoitu samaan voimakkuuteen
const CROWD_FILES = {
  cheer1: '/sfx/cheer-1.mp3',
  cheer2: '/sfx/cheer-2.mp3',
  cheer3: '/sfx/cheer-3.mp3',
  applause: '/sfx/applause-big.mp3',
};
type CrowdSound = keyof typeof CROWD_FILES;
const crowdBuffers = new Map<CrowdSound, Promise<AudioBuffer | null>>();

function loadCrowd(name: CrowdSound): Promise<AudioBuffer | null> {
  let p = crowdBuffers.get(name);
  if (!p) {
    const a = getAudioContext();
    if (!a) return Promise.resolve(null);
    p = fetch(CROWD_FILES[name]).then(r => r.arrayBuffer()).then(d => a.decodeAudioData(d)).catch(() => null);
    crowdBuffers.set(name, p);
  }
  return p;
}

// Ladataan valmiiksi kun äänet avautuvat, jotta reaktio kuuluu heti
export function preloadCrowd() {
  (Object.keys(CROWD_FILES) as CrowdSound[]).forEach(n => void loadCrowd(n));
}

async function playCrowd(name: CrowdSound, { volume = 0.8, delay = 0, rate = 1, maxSeconds = 0 } = {}) {
  const buffer = await loadCrowd(name);
  const au = audio();
  if (!buffer || !au) return;
  const { a, out } = au;
  const src = a.createBufferSource();
  src.buffer = buffer;
  // Pieni sävelkorkeuden vaihtelu: sama äänite ei kuulosta joka kerta täsmälleen samalta
  src.playbackRate.value = rate;
  const gain = a.createGain();
  const start = a.currentTime + delay;
  gain.gain.setValueAtTime(volume, start);
  src.connect(gain).connect(out);
  src.start(start);
  // Lyhennys: äänite hiipuu pois annetussa ajassa
  if (maxSeconds > 0) {
    gain.gain.setValueAtTime(volume, start + maxSeconds - 1.2);
    gain.gain.linearRampToValueAtTime(0, start + maxSeconds);
    src.stop(start + maxSeconds + 0.05);
  }
}

const CHEERS: CrowdSound[] = ['cheer1', 'cheer2', 'cheer3'];
let lastCheer: CrowdSound | null = null;
function randomCheer(): CrowdSound {
  const options = CHEERS.filter(c => c !== lastCheer);
  lastCheer = options[Math.floor(Math.random() * options.length)]!;
  return lastCheer;
}
const vary = () => 0.94 + Math.random() * 0.12;

export const sfx = {
  // Kortti lyödään pöytään
  pick() {
    tone(220, 90, 0.12, { type: 'triangle', volume: 0.22 });
    noise(0.06, { volume: 0.08, filter: 900 });
  },
  // Viimeisten sekuntien tikitys, viimeinen korkeampi
  tick(last: boolean) {
    tone(last ? 1040 : 780, last ? 1040 : 780, 0.07, { type: 'square', volume: 0.05 });
  },
  // Kortit kääntyvät
  flip() {
    noise(0.18, { volume: 0.1, filter: 2600 });
  },
  win() {
    [523, 659, 784].forEach((f, i) => tone(f, f, 0.18, { type: 'triangle', volume: 0.12, delay: i * 0.08 }));
  },
  lose() {
    tone(330, 196, 0.35, { type: 'sine', volume: 0.1 });
  },
  draw() {
    tone(440, 440, 0.12, { type: 'sine', volume: 0.08 });
    tone(440, 440, 0.12, { type: 'sine', volume: 0.08, delay: 0.14 });
  },
  // Sytkäri: rattaan rahina ja liekin suhahdus
  lighter() {
    noise(0.05, { volume: 0.2, filter: 4500 });
    noise(0.04, { volume: 0.18, filter: 3800, delay: 0.09 });
    noise(0.5, { volume: 0.12, filter: 900, delay: 0.16 });
  },
  // Pitkä, rauhallinen uloshengitys
  exhale() {
    noise(2.2, { volume: 0.16, filter: 600 });
    noise(1.8, { volume: 0.08, filter: 1400, delay: 0.15 });
  },
  // Uusi chat-viesti: pehmeä "pop"
  chat() {
    tone(660, 990, 0.08, { type: 'sine', volume: 0.07 });
  },
  roundStart() {
    tone(392, 587, 0.14, { type: 'triangle', volume: 0.08 });
  },
  gameWin() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.28, { type: 'triangle', volume: 0.12, delay: i * 0.11 }));
  },
};

// Katsomon reaktiot tilanteen mukaan
export const crowdFx = {
  // Kierroksen voitto: satunnainen reaktio. Omasta voitosta isompi, voittoputki kasvattaa sitä.
  roundWin(streak: number) {
    const boost = Math.min(Math.max(streak - 1, 0), 3);
    void playCrowd(randomCheer(), { volume: 0.55 + boost * 0.1, rate: vary() });
    // Kolmannesta putkivoitosta alkaen katsomo innostuu: toinen reaktio päälle
    if (streak >= 3) void playCrowd(randomCheer(), { volume: 0.4, delay: 0.35, rate: vary() });
  },
  // Joku muu voitti kierroksen: katsomo reagoi silti, hillitymmin
  otherWin() {
    void playCrowd(randomCheer(), { volume: 0.32, rate: vary(), maxSeconds: 2.6 });
  },
  // Pelin voitto: selvästi isompi reaktio kuin kierroksessa, mutta lyhyt ja hallittu
  gameWin() {
    void playCrowd('applause', { volume: 0.55, maxSeconds: 4.2 });
    void playCrowd('cheer1', { volume: 0.6, delay: 0.1 });
  },
  // Pelin häviö: lyhyet, kohteliaat aplodit voittajalle
  gameLose() {
    void playCrowd('applause', { volume: 0.28, maxSeconds: 3 });
  },
};
