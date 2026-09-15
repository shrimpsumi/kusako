export type Pocket = number;

export const DOUBLE_ZERO: Pocket = 37;

const POCKETS = 38;

const STRAIGHT_PAYS = 35;

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export interface RouletteBet {
  name: string;
  pays: number;
  covers: (pocket: Pocket) => boolean;
}

function numbered(pocket: Pocket): boolean {
  return pocket >= 1 && pocket <= 36;
}

export function pocketLabel(pocket: Pocket): string {
  return pocket === DOUBLE_ZERO ? '00' : String(pocket);
}

export function pocketColor(pocket: Pocket): 'green' | 'red' | 'black' {
  if (!numbered(pocket)) return 'green';
  return RED.has(pocket) ? 'red' : 'black';
}

function outside(
  name: string,
  pays: number,
  rule: (n: number) => boolean,
): RouletteBet {
  return { name, pays, covers: (pocket) => numbered(pocket) && rule(pocket) };
}

function straight(target: Pocket): RouletteBet {
  return {
    name: pocketLabel(target),
    pays: STRAIGHT_PAYS,
    covers: (pocket) => pocket === target,
  };
}

export const OUTSIDE_BETS: RouletteBet[] = [
  outside('1-18', 1, (n) => n <= 18),
  outside('19-36', 1, (n) => n >= 19),
  outside('even', 1, (n) => n % 2 === 0),
  outside('odd', 1, (n) => n % 2 === 1),
  outside('red', 1, (n) => RED.has(n)),
  outside('black', 1, (n) => !RED.has(n)),
  outside('1st 12', 2, (n) => n <= 12),
  outside('2nd 12', 2, (n) => n >= 13 && n <= 24),
  outside('3rd 12', 2, (n) => n >= 25),
  outside('1st column', 2, (n) => n % 3 === 1),
  outside('2nd column', 2, (n) => n % 3 === 2),
  outside('3rd column', 2, (n) => n % 3 === 0),
];

export const BETS: RouletteBet[] = [
  ...OUTSIDE_BETS,
  ...Array.from({ length: POCKETS }, (_, pocket) => straight(pocket)),
];

export function parseBet(text: string): RouletteBet | null {
  const key = text.trim().toLowerCase();
  return BETS.find((bet) => bet.name === key) ?? null;
}

export function spin(): Pocket {
  return Math.floor(Math.random() * POCKETS);
}

export function payout(
  amount: number,
  bet: RouletteBet,
  pocket: Pocket,
): number {
  return bet.covers(pocket) ? amount * bet.pays : -amount;
}
