// Pelin ääniefektit syntetisoidaan Web Audio -rajapinnalla, joten erillisiä äänitiedostoja ei tarvita.
// Selaimet sallivat äänen vasta käyttäjän ensimmäisen kosketuksen jälkeen, joten konteksti luodaan laiskasti.

const MUTE_KEY = 'kpsl-muted';
let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Tallennus ei käytössä — asetus säilyy vain tämän käynnin ajan
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Yksittäinen sävy: taajuus voi liukua (from → to), äänenvoimakkuus hiipuu pehmeästi
function tone(from: number, to: number, duration: number, { type = 'sine', volume = 0.15, delay = 0 }: {
  type?: OscillatorType; volume?: number; delay?: number;
} = {}) {
  const a = audio();
  if (!a) return;
  const start = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Lyhyt kohinapurske (esim. kortin kääntö)
function noise(duration: number, { volume = 0.12, delay = 0, filter = 1800 } = {}) {
  const a = audio();
  if (!a) return;
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
  src.connect(bp).connect(gain).connect(a.destination);
  src.start(start);
}

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
  roundStart() {
    tone(392, 587, 0.14, { type: 'triangle', volume: 0.08 });
  },
  gameWin() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.28, { type: 'triangle', volume: 0.12, delay: i * 0.11 }));
  },
};
