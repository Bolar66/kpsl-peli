// Jokaiselle sormelle kääntökulma asteina per käden asento.
// 0 = piirretty "auki"-asento (paperi). Positiivinen luku kiertää sormea kohti kämmentä.

export interface FingerAngles {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export const HAND_POSES: Record<string, FingerAngles> = {
  idle:     { thumb: 15,  index: 25,  middle: 25,  ring: 25,  pinky: 25 },
  rock:     { thumb: 70,  index: 130, middle: 135, ring: 130, pinky: 120 },
  paper:    { thumb: 0,   index: 0,   middle: 0,   ring: 0,   pinky: 0 },
  scissors: { thumb: 60,  index: 0,   middle: 0,   ring: 125, pinky: 115 },
  lizard:   { thumb: 40,  index: 15,  middle: 15,  ring: 100, pinky: 100 },
  spock:    { thumb: 0,   index: -6,  middle: -6,  ring: 8,   pinky: 8 },
};

export const FINGER_PIVOTS = {
  thumb:  { x: 35,  y: 214 },
  index:  { x: 108, y: 176 },
  middle: { x: 150, y: 171 },
  ring:   { x: 227, y: 193 },
  pinky:  { x: 232, y: 258 },
};