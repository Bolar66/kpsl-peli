import { getAudioContext, musicOutput, onAudioRecreated, setMusicMuffled, unlockAudioOnFirstGesture } from './audioEngine';
import { preloadCrowd } from './sound';

// Taustamusiikki (CC0, OpenGameArt): valikoissa rauhallinen lo-fi, pelissä intensiivisempi lo-fi techno.
// Kappaleet on normalisoitu samaan äänenvoimakkuuteen (−20 LUFS), joten vaihto ei hyppää.
export type MusicTrack = 'menu' | 'game';

const TRACKS: Record<MusicTrack, string> = {
  menu: '/music/menu-lofi-again.mp3',
  game: '/music/game-kuia.mp3',
};
const CROSSFADE_SECONDS = 1.6;

const buffers = new Map<MusicTrack, Promise<AudioBuffer | null>>();
let wanted: MusicTrack | null = null;
let playing: { track: MusicTrack; source: AudioBufferSourceNode; gain: GainNode } | null = null;
let unlocked = false;

function load(track: MusicTrack): Promise<AudioBuffer | null> {
  let p = buffers.get(track);
  if (!p) {
    p = fetch(TRACKS[track])
      .then(r => r.arrayBuffer())
      .then(data => getAudioContext()!.decodeAudioData(data))
      .catch(() => null);
    buffers.set(track, p);
  }
  return p;
}

// MP3-tiedoston alussa ja lopussa on koodekin lisäämää hiljaisuutta: luuppi rajataan äänen kohdalle
function loopBounds(buffer: AudioBuffer): [number, number] {
  const data = buffer.getChannelData(0);
  const threshold = 0.0005;
  let start = 0;
  while (start < data.length && Math.abs(data[start]!) < threshold) start++;
  let end = data.length - 1;
  while (end > start && Math.abs(data[end]!) < threshold) end--;
  return [start / buffer.sampleRate, (end + 1) / buffer.sampleRate];
}

async function switchTo(track: MusicTrack | null) {
  const a = getAudioContext();
  const out = musicOutput();
  if (!a || !out) return;
  if (playing?.track === track) return;

  // Vanha kappale hiipuu pois
  if (playing) {
    const old = playing;
    playing = null;
    old.gain.gain.setTargetAtTime(0, a.currentTime, CROSSFADE_SECONDS / 4);
    old.source.stop(a.currentTime + CROSSFADE_SECONDS * 1.5);
  }
  if (!track) return;

  const buffer = await load(track);
  // Toive saattoi muuttua latauksen aikana
  if (!buffer || wanted !== track || playing) return;

  const source = a.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const [loopStart, loopEnd] = loopBounds(buffer);
  source.loopStart = loopStart;
  source.loopEnd = loopEnd;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, a.currentTime);
  gain.gain.setTargetAtTime(1, a.currentTime, CROSSFADE_SECONDS / 4);
  source.connect(gain).connect(out);
  source.start(a.currentTime, loopStart);
  playing = { track, source, gain };
}

// Asettaa soitettavan kappaleen. Soitto alkaa vasta kun käyttäjä on koskettanut sivua.
export function setMusic(track: MusicTrack | null) {
  wanted = track;
  if (unlocked) void switchTo(track);
}

unlockAudioOnFirstGesture(() => {
  unlocked = true;
  void switchTo(wanted);
  // Molemmat kappaleet ladataan valmiiksi taustalla, jotta vaihto pelin alkaessa on välitön
  void load('menu');
  void load('game');
  preloadCrowd();
});

// Piilotettu yllätys: musiikki hidastuu ja vaimenee hetkeksi, kuin kaikki menisi slow motioniin
export function setMusicHazy(hazy: boolean) {
  const a = getAudioContext();
  if (!a || !playing) return;
  playing.source.playbackRate.setTargetAtTime(hazy ? 0.82 : 1, a.currentTime, hazy ? 0.6 : 0.8);
  setMusicMuffled(hazy);
}

// Äänijärjestelmä luotiin uudelleen (Safarista palattiin): vanha soitin on mykkä, käynnistetään uusi
onAudioRecreated(() => {
  playing = null;
  if (unlocked) void switchTo(wanted);
});
