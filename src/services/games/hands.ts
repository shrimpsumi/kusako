export interface Hand {
  guildId: string;
  userId: string;
  onTimeout: (hand: this) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

const TIMEOUT_MS = 60_000;

export function createHands<T extends Hand>() {
  const hands = new Map<string, T>();

  const key = (guildId: string, userId: string) => `${guildId}:${userId}`;

  function get(guildId: string, userId: string): T | null {
    return hands.get(key(guildId, userId)) ?? null;
  }

  function has(guildId: string, userId: string): boolean {
    return hands.has(key(guildId, userId));
  }

  function remove(guildId: string, userId: string): void {
    const k = key(guildId, userId);
    const hand = hands.get(k);
    if (hand) {
      clearTimeout(hand.timeout);
      hands.delete(k);
    }
  }

  function arm(hand: T): void {
    clearTimeout(hand.timeout);
    hand.timeout = setTimeout(() => {
      const k = key(hand.guildId, hand.userId);
      if (hands.get(k) === hand) {
        hands.delete(k);
        hand.onTimeout(hand);
      }
    }, TIMEOUT_MS);
  }

  function add(hand: T): void {
    remove(hand.guildId, hand.userId);
    hands.set(key(hand.guildId, hand.userId), hand);
    arm(hand);
  }

  return { get, has, add, remove, arm };
}
