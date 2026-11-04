// Lippuvisan tasot ja lisätavat käyttöliittymää varten (säännöt ovat palvelimella: backend/src/flags/quiz.ts)

export type QuizLevel = 'tourist' | 'backpacker' | 'globetrotter' | 'lottery';
export type Extra = 'flagChoice' | 'reveal' | 'piece' | 'trueFalse';

export interface QuizSettings {
  level: QuizLevel;
  count: number;
  hints: number;
  extras: Extra[];
  choiceSeconds: number;
  writeSeconds: number;
}

export const LEVELS: { value: QuizLevel; emoji: string; label: string; text: string; extras: Extra[] }[] = [
  { value: 'tourist', emoji: '🧳', label: 'Turisti', text: 'Tunnetuimmat liput, neljä vaihtoehtoa', extras: ['flagChoice', 'reveal', 'piece', 'trueFalse'] },
  { value: 'backpacker', emoji: '🎒', label: 'Reppureissaaja', text: 'Tunnetut ja vähän vaikeammat, valitse tai kirjoita', extras: ['flagChoice', 'reveal', 'piece', 'trueFalse'] },
  { value: 'globetrotter', emoji: '🌍', label: 'Maailmanmatkaaja', text: 'Vaikeat liput ja alueet, kirjoita nimi', extras: ['reveal', 'piece'] },
  { value: 'lottery', emoji: '🎲', label: 'Arpajaiset', text: 'Kaikki liput ja kaikki tavat sekaisin', extras: ['flagChoice', 'reveal', 'piece', 'trueFalse'] },
];

export const LEVEL_BY_VALUE = Object.fromEntries(LEVELS.map(l => [l.value, l])) as Record<QuizLevel, (typeof LEVELS)[number]>;

export const EXTRAS: { value: Extra; label: string; text: string }[] = [
  { value: 'flagChoice', label: 'Valitse lippu', text: 'Maan nimi ja neljä lippua' },
  { value: 'reveal', label: 'Paljastuva lippu', text: 'Sumea lippu tarkentuu' },
  { value: 'piece', label: 'Palanen lippua', text: 'Näkymä laajenee kulmasta' },
  { value: 'trueFalse', label: 'Totta vai tarua', text: 'Onko tämä oikea lippu?' },
];

export const COUNT_OPTIONS = [10, 15, 20];
export const HINT_OPTIONS = [0, 1, 3, 5];
export const CHOICE_SECONDS = [5, 10, 15];
export const WRITE_SECONDS = [10, 20, 30];
