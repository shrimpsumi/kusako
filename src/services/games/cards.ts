export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type Rank =
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10'
  | 'A'
  | 'J'
  | 'Q'
  | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

const RANKS: Rank[] = [
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  'A',
  'J',
  'Q',
  'K',
];

const RANK_VALUES: Record<Rank, number> = {
  '02': 2,
  '03': 3,
  '04': 4,
  '05': 5,
  '06': 6,
  '07': 7,
  '08': 8,
  '09': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
};

const CARD_EMOJI_IDS: Record<string, string> = {
  clubs_02: '1548776230382346341',
  clubs_03: '1548776231804084225',
  clubs_04: '1548776233561624760',
  clubs_05: '1548776235205796001',
  clubs_06: '1548776236438790215',
  clubs_07: '1548776238179426436',
  clubs_08: '1548776239605481562',
  clubs_09: '1548776212480917525',
  clubs_10: '1548776213294747678',
  clubs_A: '1548776214079082686',
  clubs_J: '1548776215031054388',
  clubs_K: '1548776215916187839',
  clubs_Q: '1548776216859902143',
  diamonds_02: '1548776218122387487',
  diamonds_03: '1548776219036749915',
  diamonds_04: '1548776223084257411',
  diamonds_05: '1548776223642226741',
  diamonds_06: '1548776225101586442',
  diamonds_07: '1548776225990770890',
  diamonds_08: '1548776226729107566',
  diamonds_09: '1548776192490873015',
  diamonds_10: '1548776193824657509',
  diamonds_A: '1548776194797998281',
  diamonds_J: '1548776195896774687',
  diamonds_K: '1548776196836298893',
  diamonds_Q: '1548776198002442321',
  hearts_02: '1548776200539996241',
  hearts_03: '1548776209251438785',
  hearts_04: '1548776210614718544',
  hearts_05: '1548776211797381170',
  hearts_06: '1548776178704195744',
  hearts_07: '1548776179874529351',
  hearts_08: '1548776180763590666',
  hearts_09: '1548776181589868596',
  hearts_10: '1548776182642638880',
  hearts_A: '1548776184043806890',
  hearts_J: '1548776184643457085',
  hearts_K: '1548776186421842020',
  hearts_Q: '1548776187294257332',
  spades_02: '1548776191517790248',
  spades_03: '1548776166872322068',
  spades_04: '1548776168004780132',
  spades_05: '1548776168763826316',
  spades_06: '1548776169791291502',
  spades_07: '1548776171087597660',
  spades_08: '1548776171896836167',
  spades_09: '1548776172765323304',
  spades_10: '1548776173696188557',
  spades_A: '1548776174514085899',
  spades_J: '1548776175550079149',
  spades_K: '1548776176682663966',
  spades_Q: '1548776177391505519',
};

const CARD_BACK_ID = '1548776227677012118';

export function cardEmoji(card: Card): string {
  const key = `${card.suit}_${card.rank}`;
  return `<:card_${key}:${CARD_EMOJI_IDS[key]}>`;
}

export function cardBackEmoji(): string {
  return `<:card_back:${CARD_BACK_ID}>`;
}

export function handEmojis(cards: Card[]): string {
  return cards.map(cardEmoji).join(' ');
}

export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += RANK_VALUES[card.rank];
    if (card.rank === 'A') aces += 1;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards) > 21;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

export function shouldDealerHit(cards: Card[]): boolean {
  return handValue(cards) < 17;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }

  return deck;
}
