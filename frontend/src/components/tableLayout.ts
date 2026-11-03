// Pelipöydän asettelu: puhdas laskenta, jotta sen voi testata erikseen kaikilla kenttäko'oilla.

export interface Point { x: number; y: number }
export interface SeatLayout { seat: Point; card: Point; side?: boolean }
export interface TableLayout {
  table: { left: number; top: number; width: number; height: number };
  seats: SeatLayout[];
  // Kaikkien pöydän osien (avatarit, kortit, ajastin) skaalauskerroin pienillä näytöillä
  scale: number;
}

// Osien mitat täysikokoisina (pikseleinä), skaalataan kertoimella
export const SIZES = {
  avatarHalf: 29,
  tagHeight: 34,
  tagWidth: 96,
  sideTagWidth: 78,
  cardWidth: 54,
  cardHeight: 74,
  timer: 84,
  timer4: 72,
};

// Kentän korkeus, jolla kaikki mahtuu täysikokoisena; matalammalla kenttä skaalataan
const FULL_SIZE_HEIGHT = 520;
const MIN_SCALE = 0.62;

export function layoutScale(w: number, h: number, count: number): number {
  // Neljällä pelaajalla sivupaikat vievät leveyttä, joten skaalataan myös kapealla näytöllä
  const fullWidth = count === 4 ? 400 : 340;
  return Math.max(MIN_SCALE, Math.min(1, h / FULL_SIZE_HEIGHT, w / fullWidth));
}

// Lasketaan pöytä ja paikat kentän todellisesta koosta, jotta mikään ei mene päällekkäin.
// Pöytä on pystysuuntainen "stadion" (suorat sivut, pyöreät päädyt). Pelaajat istuvat pöydän reunalla:
// oma pelaaja alhaalla, muut myötäpäivään. Kortit ovat avatarista mitatun matkan päässä pöydän keskustaa kohti.
export function computeLayout(w: number, h: number, count: number): TableLayout {
  const s = layoutScale(w, h, count);
  const avatarHalf = SIZES.avatarHalf * s;
  const side = Math.round(w * (count === 4 ? 0.12 : 0.15));
  const top = Math.round(36 * s);
  // Oman paikan alle jää tila nimilapulle
  const bottom = h - Math.round(68 * s);
  const width = w - side * 2;
  const height = Math.max(bottom - top, 0);
  const r = Math.min(width / 2, height / 2);
  const cx = w / 2;
  const center = { x: cx, y: (top + bottom) / 2 };

  const toward = (from: Point, dist: number): Point => {
    const dx = center.x - from.x;
    const dy = center.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
  };
  // Piste pöydän yläpäädyn kaarella, kulma mitattuna suoraan ylöspäin
  const onTopArc = (deg: number): Point => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: top + r - r * Math.cos(rad) };
  };

  const me: SeatLayout = { seat: { x: cx, y: bottom }, card: { x: cx, y: bottom - 75 * s } };
  // Ylhäällä olevan pelaajan nimi ja sydämet ovat avatarin alla, joten kortti on suoraan sen alapuolella
  const topSeat = (p: Point): SeatLayout => ({ seat: p, card: { x: p.x, y: p.y + 122 * s } });
  // Vinot paikat (3 pelaajaa): kortti nimilapun alla, hieman keskustaa kohti
  const diagonalSeat = (p: Point): SeatLayout => {
    const inward = toward(p, 30 * s);
    return { seat: p, card: { x: inward.x, y: p.y + 122 * s } };
  };
  const sideSeat = (x: number): SeatLayout => {
    const p = { x, y: center.y - 12 * s };
    // Kortti avatarin vieressä hieman ylempänä, ettei se osu nimilappuun
    return { seat: p, card: { x: x + Math.sign(cx - x) * (avatarHalf + 38 * s), y: p.y - 16 * s }, side: true };
  };

  let seats: SeatLayout[];
  if (count <= 1) seats = [me];
  else if (count === 2) seats = [me, topSeat(onTopArc(0))];
  else if (count === 3) seats = [me, diagonalSeat(onTopArc(-58)), diagonalSeat(onTopArc(58))];
  else seats = [me, sideSeat(side), topSeat(onTopArc(0)), sideSeat(w - side)];

  return { table: { left: side, top, width, height }, seats, scale: s };
}
