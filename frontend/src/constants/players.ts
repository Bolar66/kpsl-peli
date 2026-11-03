// Jokaiselle pelaajalle oma väri, jotta saman alkukirjaimen pelaajat erottuvat
const PLAYER_COLORS = ['#7DD3FC', '#F9A8D4', '#FDBA74', '#A7F3D0', '#C4B5FD', '#FDE68A', '#FCA5A5', '#99F6E4'];

export function playerColor(userId: number): string {
  const index = Math.abs(userId * 7 + (userId < 0 ? 3 : 0)) % PLAYER_COLORS.length;
  return PLAYER_COLORS[index]!;
}

export function initial(username: string): string {
  return username.charAt(0).toUpperCase();
}

// Lyhyt värinä puhelimessa (ei tue kaikki selaimet, esim. iPhone — silloin ei tehdä mitään)
export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ei tuettu
  }
}
