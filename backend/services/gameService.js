const SUITS = ['hearts', 'clubs', 'diamonds', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const SUIT_ORDER = { hearts: 1, clubs: 2, diamonds: 3, spades: 4 };

exports.createInitialGameState = (password) => {
  return {
    roomPassword: password, 
    uploadedFaces: [], 
    customFaceMap: {}, 
    players: [
      { id: 0, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 },
      { id: 1, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 },
      { id: 2, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 },
      { id: 3, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 }
    ],
    phase: 'waiting', 
    currentTurnIndex: 0,
    dealerIndex: 0, // <--- THIS WAS MISSING AND CRASHING YOUR ROOMS!
    currentTrick: [], 
    spadesBroken: false,
    round: 1,
    overtimeRound: 0,
    overtimeActive: false,
    history: [],
    musicState: {
        url: 'https://www.youtube.com/watch?v=LXb3EKWsInQ', 
        isPlaying: false,
        playedSeconds: 0
      }
  };
};

exports.generateDeck = () => {
  let deck = [];
  for (let suit of SUITS) {
    for (let rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

exports.dealCards = (gameState) => {
  const deck = this.generateDeck();
  gameState.players.forEach((p, i) => {
    p.hand = deck.slice(i * 13, (i + 1) * 13).sort((a, b) => {
      if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return a.rank - b.rank; 
    });
    p.bid = null;
    p.tricksWon = 0;
  });
  gameState.phase = 'bidding';
  gameState.currentTurnIndex = 0;
  gameState.currentTrick = [];
  gameState.spadesBroken = false;
};

exports.isValidPlay = (hand, cardToPlay, trick) => {
  if (trick.length === 0) return true;
  const leadSuit = trick[0].card.suit;
  const leadSuitCards = trick.filter(t => t.card.suit === leadSuit);
  const highestLeadRank = Math.max(...leadSuitCards.map(t => t.card.rank));
  const isTrumped = leadSuit !== 'spades' && trick.some(t => t.card.suit === 'spades');
  const handHasLead = hand.some(c => c.suit === leadSuit);
  const handCanBeatLead = hand.some(c => c.suit === leadSuit && c.rank > highestLeadRank);
  const handHasSpades = hand.some(c => c.suit === 'spades');

  if (!isTrumped && handCanBeatLead) return cardToPlay.suit === leadSuit && cardToPlay.rank > highestLeadRank;
  if (handHasLead) return cardToPlay.suit === leadSuit;
  if (handHasSpades) return cardToPlay.suit === 'spades';
  return true;
};

exports.getMaskedState = (gameState, mySeatIndex) => {
  const masked = JSON.parse(JSON.stringify(gameState));
  masked.players.forEach((p, index) => {
    if (index !== mySeatIndex) {
      p.hand = p.hand.map((_, i) => ({ id: `hidden-${index}-${i}`, suit: 'hidden', rank: 0 }));
    }
  });
  return masked;
};