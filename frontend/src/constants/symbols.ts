export type GameMode = 'classic' | 'extended';

export const SYMBOL_INFO: Record<string, { emoji: string; label: string }> = {
  rock: { emoji: '✊', label: 'Kivi' },
  paper: { emoji: '✋', label: 'Paperi' },
  scissors: { emoji: '✌️', label: 'Sakset' },
  lizard: { emoji: '🦎', label: 'Lisko' },
  spock: { emoji: '🖖', label: 'Spock' },
};

export const SYMBOLS_BY_MODE: Record<GameMode, string[]> = {
  classic: ['rock', 'paper', 'scissors'],
  extended: ['rock', 'paper', 'scissors', 'lizard', 'spock'],
};

export const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Klassinen',
  extended: 'Lisko–Spock',
};

// Kuka voittaa kenet ja millä verbillä. "object" on hävinnyt käsi lauseen objektina (oikea sijamuoto).
export const RULES: { from: string; to: string; verb: string; object: string; modes: GameMode[] }[] = [
  { from: 'rock', to: 'scissors', verb: 'murskaa', object: 'sakset', modes: ['classic', 'extended'] },
  { from: 'paper', to: 'rock', verb: 'peittää', object: 'kiven', modes: ['classic', 'extended'] },
  { from: 'scissors', to: 'paper', verb: 'leikkaavat', object: 'paperin', modes: ['classic', 'extended'] },
  { from: 'rock', to: 'lizard', verb: 'murskaa', object: 'liskon', modes: ['extended'] },
  { from: 'paper', to: 'spock', verb: 'kumoaa', object: 'Spockin', modes: ['extended'] },
  { from: 'scissors', to: 'lizard', verb: 'katkaisevat', object: 'liskon', modes: ['extended'] },
  { from: 'lizard', to: 'spock', verb: 'myrkyttää', object: 'Spockin', modes: ['extended'] },
  { from: 'lizard', to: 'paper', verb: 'syö', object: 'paperin', modes: ['extended'] },
  { from: 'spock', to: 'scissors', verb: 'hajottaa', object: 'sakset', modes: ['extended'] },
  { from: 'spock', to: 'rock', verb: 'höyrystää', object: 'kiven', modes: ['extended'] },
];

export function rulesForMode(mode: GameMode) {
  return RULES.filter(r => r.modes.includes(mode));
}

// Selittää kierroksen tuloksen: "✊ Kivi murskaa ✌️ Sakset"
export function explainWin(winningSymbol: string | null, losingSymbols: string[]): string | null {
  if (!winningSymbol) return null;
  const rule = RULES.find(r => r.from === winningSymbol && losingSymbols.includes(r.to));
  if (!rule) return null;
  return `${SYMBOL_INFO[rule.from]!.label} ${rule.verb} ${rule.object}`;
}
