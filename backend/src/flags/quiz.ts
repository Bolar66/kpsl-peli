import { randomInt } from 'crypto';
import { COUNTRIES, LOOKALIKES, type Country } from './countries';

// ---------- Tasot ----------
export type QuizLevel = 'tourist' | 'backpacker' | 'globetrotter' | 'lottery';
export type AnswerKind = 'choice' | 'write' | 'flagChoice' | 'trueFalse';
export type DisplayKind = 'normal' | 'reveal' | 'piece';
export type Extra = 'flagChoice' | 'reveal' | 'piece' | 'trueFalse';

export const LEVEL_LABEL: Record<QuizLevel, string> = {
  tourist: 'Turisti',
  backpacker: 'Reppureissaaja',
  globetrotter: 'Maailmanmatkaaja',
  lottery: 'Arpajaiset',
};

interface LevelConfig {
  // Kuinka suuri osa kysymyksistä tulee kustakin tasosta (1 = tunnetuimmat … 4 = alueet)
  tierWeights: Record<1 | 2 | 3 | 4, number>;
  // Monivalinnan osuus perusvastaustavoista (loput kirjoitetaan)
  choiceShare: number;
  // Lisätavat, jotka tasolla voi olla päällä (Maailmanmatkaajassa vastaus kirjoitetaan aina)
  allowedExtras: Extra[];
}

const LEVELS: Record<QuizLevel, LevelConfig> = {
  tourist: { tierWeights: { 1: 1, 2: 0, 3: 0, 4: 0 }, choiceShare: 1, allowedExtras: ['flagChoice', 'reveal', 'piece', 'trueFalse'] },
  backpacker: { tierWeights: { 1: 0.45, 2: 0.55, 3: 0, 4: 0 }, choiceShare: 0.5, allowedExtras: ['flagChoice', 'reveal', 'piece', 'trueFalse'] },
  globetrotter: { tierWeights: { 1: 0, 2: 0.4, 3: 0.4, 4: 0.2 }, choiceShare: 0, allowedExtras: ['reveal', 'piece'] },
  lottery: { tierWeights: { 1: 0.25, 2: 0.3, 3: 0.3, 4: 0.15 }, choiceShare: 0.5, allowedExtras: ['flagChoice', 'reveal', 'piece', 'trueFalse'] },
};

export const DEFAULT_EXTRAS: Record<QuizLevel, Extra[]> = {
  tourist: [],
  backpacker: ['flagChoice', 'reveal', 'piece', 'trueFalse'],
  globetrotter: ['reveal', 'piece'],
  lottery: ['flagChoice', 'reveal', 'piece', 'trueFalse'],
};

export const DEFAULT_HINTS: Record<QuizLevel, number> = { tourist: 0, backpacker: 3, globetrotter: 3, lottery: 3 };

const TIME_MS: Record<AnswerKind, number> = { choice: 10_000, write: 20_000, flagChoice: 12_000, trueFalse: 6_000 };
const REVEAL_EXTRA_MS = 5_000;

const BY_CODE = new Map(COUNTRIES.map(c => [c.code, c]));

export function countryByCode(code: string): Country {
  const country = BY_CODE.get(code);
  if (!country) throw new Error(`Tuntematon maa ${code}`);
  return country;
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)]!;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// ---------- Vastausten tunnistus ----------

// Kirjainkoko, välimerkit, välilyönnit ja ääkköset eivät vaikuta: "Côte d’Ivoire" = "cotedivoire"
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

// Muokkausetäisyys, jossa myös vierekkäisten kirjainten vaihto (Ruotis → Ruotsi) on yksi virhe
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

function acceptedNames(country: Country): string[] {
  return [country.fi, country.en, ...(country.alt ?? [])].map(normalizeName).filter(Boolean);
}

const ALL_NAMES = COUNTRIES.map(c => ({ code: c.code, names: acceptedNames(c) }));

export type Correctness = 'full' | 'half' | 'wrong';

// Täysi osuma mihin tahansa hyväksyttyyn nimeen = täydet pisteet. Lähes oikein (lyhyissä nimissä
// yksi virhe, pitkissä kaksi) = puolet, paitsi jos vastaus on toisen maan nimi tai lähempänä sitä.
export function checkAnswer(code: string, input: string): Correctness {
  const answer = normalizeName(input);
  if (!answer) return 'wrong';
  const correct = acceptedNames(countryByCode(code));
  if (correct.includes(answer)) return 'full';

  let bestOther = Infinity;
  for (const other of ALL_NAMES) {
    if (other.code === code) continue;
    for (const name of other.names) {
      if (name === answer) return 'wrong';
      bestOther = Math.min(bestOther, editDistance(answer, name));
    }
  }

  let best = Infinity;
  let bestName = '';
  for (const name of correct) {
    const d = editDistance(answer, name);
    if (d < best) { best = d; bestName = name; }
  }
  const allowed = bestName.length < 7 ? 1 : 2;
  if (best <= allowed && best < bestOther) return 'half';
  return 'wrong';
}

// ---------- Pisteet ----------
export const FULL_POINTS = 100;
export const MAX_SPEED_BONUS = 50;

export function scoreAnswer(correctness: Correctness, elapsedMs: number, timeMs: number): number {
  if (correctness === 'wrong') return 0;
  const speed = Math.max(0, Math.min(1, 1 - elapsedMs / timeMs));
  const points = FULL_POINTS + Math.round(MAX_SPEED_BONUS * speed);
  return correctness === 'full' ? points : Math.round(points / 2);
}

// ---------- Kysymykset ----------
export interface Question {
  code: string;
  kind: AnswerKind;
  display: DisplayKind;
  // Monivalinnan vaihtoehdot (maakoodit), oikea mukana sekoitettuna
  options?: string[];
  // Totta vai tarua: kysytään "Onko tämä <claim>:n lippu?" (lippu on aina code)
  claim?: string;
  timeMs: number;
}

// Väärät vaihtoehdot: ensin samannäköiset liput, sitten saman maanosan maat, lopuksi mitä tahansa
function distractors(code: string, pool: Country[], count: number): string[] {
  const country = countryByCode(code);
  const poolCodes = new Set(pool.map(c => c.code));
  const chosen = new Set<string>();
  const add = (candidates: string[]) => {
    for (const c of shuffle(candidates)) {
      if (chosen.size >= count) return;
      if (c !== code && poolCodes.has(c)) chosen.add(c);
    }
  };
  add(LOOKALIKES.filter(group => group.includes(code)).flat());
  add(pool.filter(c => c.continent === country.continent).map(c => c.code));
  add(pool.map(c => c.code));
  return [...chosen].slice(0, count);
}

// Tasojen sekoitus: vaikeimmillakin tasoilla tunnistettavampia lippuja tulee tasaisesti väliin.
function tierSequence(level: QuizLevel, count: number): (1 | 2 | 3 | 4)[] {
  const weights = LEVELS[level].tierWeights;
  const tiers = ([1, 2, 3, 4] as const).filter(t => weights[t] > 0);
  // Jaetaan kysymykset painojen mukaan mahdollisimman tasaisesti, sitten sekoitetaan
  const total = tiers.reduce((n, t) => n + weights[t], 0);
  const counts = tiers.map(t => ({ t, n: Math.floor((weights[t] / total) * count) }));
  let missing = count - counts.reduce((n, c) => n + c.n, 0);
  for (const c of [...counts].sort((a, b) => weights[b.t] - weights[a.t])) {
    if (missing <= 0) break;
    c.n++;
    missing--;
  }
  // Vaikeat (taso 3–4) jaetaan helppojen väliin enintään kaksi kerrallaan, jos helppoja riittää
  const all = shuffle(counts.flatMap(c => Array<1 | 2 | 3 | 4>(c.n).fill(c.t)));
  const easy = all.filter(t => t <= 2);
  const hard = all.filter(t => t >= 3);
  if (easy.length === 0) return all;
  const gaps: (1 | 2 | 3 | 4)[][] = Array.from({ length: easy.length + 1 }, () => []);
  for (const t of hard) {
    const open = gaps.map((g, i) => (g.length < 2 ? i : -1)).filter(i => i >= 0);
    gaps[open.length ? pick(open) : randomInt(gaps.length)]!.push(t);
  }
  return gaps.flatMap((g, i) => (i < easy.length ? [...g, easy[i]!] : g));
}

export function generateQuestions(level: QuizLevel, count: number, extras: Extra[]): Question[] {
  const config = LEVELS[level];
  const enabled = extras.filter(e => config.allowedExtras.includes(e));
  const answerExtras = enabled.filter((e): e is 'flagChoice' | 'trueFalse' => e === 'flagChoice' || e === 'trueFalse');
  const displayExtras = enabled.filter((e): e is 'reveal' | 'piece' => e === 'reveal' || e === 'piece');
  const levelPool = COUNTRIES.filter(c => config.tierWeights[c.tier] > 0);
  // Monivalinnan väärät vaihtoehdot tulevat tason omista ja sitä helpommista lipuista
  const maxTier = Math.max(...levelPool.map(c => c.tier));
  const optionPool = COUNTRIES.filter(c => c.tier <= Math.max(maxTier, 2));

  const used = new Set<string>();
  return tierSequence(level, count).map((tier) => {
    const candidates = COUNTRIES.filter(c => c.tier === tier && !used.has(c.code));
    const country = pick(candidates.length ? candidates : levelPool.filter(c => !used.has(c.code)));
    used.add(country.code);

    let kind: AnswerKind = Math.random() < config.choiceShare ? 'choice' : 'write';
    if (answerExtras.length && Math.random() < 0.3) kind = pick(answerExtras);
    // Paljastuva lippu ja palanen lippua eivät sovi kysymykseen, jossa valitaan lippu
    const display: DisplayKind = kind !== 'flagChoice' && displayExtras.length && Math.random() < 0.3 ? pick(displayExtras) : 'normal';

    const question: Question = { code: country.code, kind, display, timeMs: TIME_MS[kind] + (display !== 'normal' ? REVEAL_EXTRA_MS : 0) };
    if (kind === 'choice' || kind === 'flagChoice') {
      question.options = shuffle([country.code, ...distractors(country.code, optionPool, 3)]);
    }
    if (kind === 'trueFalse') {
      question.claim = Math.random() < 0.5 ? country.code : (distractors(country.code, optionPool, 1)[0] ?? country.code);
    }
    return question;
  });
}

// Vinkki "alkukirjain ja pituus": M _ _ _ _ _ _ _ _ _ (välilyönnit ja väliviivat näkyvät)
export function letterHint(code: string): string {
  const name = countryByCode(code).fi;
  return name.split(' ').map((word, w) =>
    [...word].map((ch, i) => (w === 0 && i === 0) || ch === '-' ? ch : '_').join(' ')
  ).join('   ');
}

// Vinkki 50/50: kaksi väärää vaihtoehtoa poistetaan
export function fiftyFiftyHint(question: Question): string[] {
  if (!question.options) return [];
  return shuffle(question.options.filter(c => c !== question.code)).slice(0, 2);
}
