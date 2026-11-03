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

// Kuka voittaa kenet ja millä verbillä
export const RULES: { from: string; to: string; verb: string; modes: GameMode[] }[] = [
  { from: 'rock', to: 'scissors', verb: 'murskaa', modes: ['classic', 'extended'] },
  { from: 'paper', to: 'rock', verb: 'peittää', modes: ['classic', 'extended'] },
  { from: 'scissors', to: 'paper', verb: 'leikkaa', modes: ['classic', 'extended'] },
  { from: 'rock', to: 'lizard', verb: 'murskaa', modes: ['extended'] },
  { from: 'paper', to: 'spock', verb: 'kumoaa', modes: ['extended'] },
  { from: 'scissors', to: 'lizard', verb: 'katkaisee', modes: ['extended'] },
  { from: 'lizard', to: 'spock', verb: 'myrkyttää', modes: ['extended'] },
  { from: 'lizard', to: 'paper', verb: 'syö', modes: ['extended'] },
  { from: 'spock', to: 'scissors', verb: 'hajottaa', modes: ['extended'] },
  { from: 'spock', to: 'rock', verb: 'höyrystää', modes: ['extended'] },
];

export function rulesForMode(mode: GameMode) {
  return RULES.filter(r => r.modes.includes(mode));
}

// Selittää kierroksen tuloksen: "✊ Kivi murskaa ✌️ Sakset"
export function explainWin(winningSymbol: string | null, losingSymbols: string[]): string | null {
  if (!winningSymbol) return null;
  const rule = RULES.find(r => r.from === winningSymbol && losingSymbols.includes(r.to));
  if (!rule) return null;
  const from = SYMBOL_INFO[rule.from]!;
  const to = SYMBOL_INFO[rule.to]!;
  return `${from.label} ${rule.verb} ${to.label.toLowerCase()}`;
}
