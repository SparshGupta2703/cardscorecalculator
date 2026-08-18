const SUITS = ['hearts', 'clubs', 'diamonds', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const SUIT_ORDER = { hearts: 1, clubs: 2, diamonds: 3, spades: 4 };

exports.createInitialGameState = (password,targetScore = 26) => {
  return {
    roomPassword: password, 
    uploadedFaces: [], 
    customFaceMap: {}, 
    players: [
      { id: 0, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 ,luck: 1.0, bags: 0 },
      { id: 1, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 ,luck: 1.0, bags: 0 },
      { id: 2, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 ,luck: 1.0, bags: 0},
      { id: 3, name: 'Waiting...', socketId: null, sessionId: null, score: 0, hand: [], bid: null, tricksWon: 0 ,luck: 1.0, bags: 0}
    ],
    phase: 'waiting', 
    
    // Seat 0 is the first dealer, so Seat 1 goes first!
    dealerIndex: 0, 
    currentTurnIndex: 1, 
    
    currentTrick: [], 
    spadesBroken: false,
    round: 1,
    overtimeRound: 0,
    overtimeActive: false,
    history: [],
    targetScore: targetScore,
    musicState: {
        url: 'https://www.youtube.com/watch?v=mxr2ZCSQVvY', 
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
  const deck = exports.generateDeck();
  
  // 1. Split the deck into Spades and Non-Spades
  let spades = deck.filter(c => c.suit === 'spades');
  let others = deck.filter(c => c.suit !== 'spades');
  
  // Shuffle both piles
  spades.sort(() => Math.random() - 0.5);
  others.sort(() => Math.random() - 0.5);

  // Clear hands
  gameState.players.forEach(p => p.hand = []);

  // 2. Distribute guaranteed Spades based on Luck
  gameState.players.forEach(p => {
    // 1.0 luck = 3 spades. 0.9 luck = 2 spades, etc.
    const guaranteedSpades = Math.floor(p.luck * 3); 
    
    for (let i = 0; i < guaranteedSpades; i++) {
      if (spades.length > 0) {
        p.hand.push(spades.pop());
      }
    }
  });

  // 3. Mix the leftover Spades back into the remaining deck
  const finalDeck = [...spades, ...others].sort(() => Math.random() - 0.5);

  // 4. Deal the rest of the cards until everyone has 13
  gameState.players.forEach(p => {
    while (p.hand.length < 13) {
      p.hand.push(finalDeck.pop());
    }
    
    // Sort their final hand by suit and rank
    p.hand.sort((a, b) => {
      if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return a.rank - b.rank; 
    });
    
    p.bid = null;
    p.tricksWon = 0;
  });

  // Advance game logic
  gameState.dealerIndex = (gameState.round - 1) % 4;
  gameState.currentTurnIndex = (gameState.dealerIndex + 1) % 4;
  gameState.phase = 'bidding';
  gameState.currentTrick = [];
  gameState.spadesBroken = false;
};;
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