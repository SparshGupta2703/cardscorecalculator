const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function generateDeck() {
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
}

let gameState = {
  players: [
    { id: 0, name: 'Player 1', score: 0, hand: [], bid: null, tricksWon: 0 },
    { id: 1, name: 'Player 2', score: 0, hand: [], bid: null, tricksWon: 0 },
    { id: 2, name: 'Player 3', score: 0, hand: [], bid: null, tricksWon: 0 },
    { id: 3, name: 'Player 4', score: 0, hand: [], bid: null, tricksWon: 0 }
  ],
  phase: 'waiting', 
  currentTurnIndex: 0, 
  currentTrick: [], 
  spadesBroken: false,
  round: 1,
  overtimeRound: 0,
  overtimeActive: false,
  history: []
};

// Strict logic rules for playing a card
function isValidPlay(hand, cardToPlay, trick) {
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
}

function dealCards() {
  const deck = generateDeck();
  gameState.players.forEach((p, i) => {
    p.hand = deck.slice(i * 13, (i + 1) * 13).sort((a, b) => a.suit.localeCompare(b.suit) || a.rank - b.rank);
    p.bid = null;
    p.tricksWon = 0;
  });
  gameState.phase = 'bidding';
  gameState.currentTurnIndex = 0;
  gameState.currentTrick = [];
  gameState.spadesBroken = false;
}

io.on('connection', (socket) => {
  socket.emit('STATE_UPDATE', gameState);

  socket.on('START_GAME', () => {
    gameState.round = 1;
    gameState.overtimeRound = 0;
    gameState.overtimeActive = false;
    gameState.history = [];
    gameState.players.forEach(p => p.score = 0);
    dealCards();
    io.emit('STATE_UPDATE', gameState);
  });

  socket.on('NEXT_ROUND', () => {
    gameState.round += 1;
    dealCards();
    io.emit('STATE_UPDATE', gameState);
  });

  socket.on('SUBMIT_BID', ({ index, bid }) => {
    if (gameState.phase !== 'bidding' || gameState.currentTurnIndex !== index) return;
    
    gameState.players[index].bid = parseInt(bid, 10);
    
    if (gameState.currentTurnIndex < 3) {
      gameState.currentTurnIndex += 1;
    } else {
      gameState.phase = 'playing';
      gameState.currentTurnIndex = 0;
    }
    io.emit('STATE_UPDATE', gameState);
  });

  socket.on('PLAY_CARD', ({ playerIndex, cardId }) => {
    if (gameState.phase !== 'playing' || gameState.currentTurnIndex !== playerIndex) return;
    
    // Lock table while trick resolves
    if (gameState.currentTrick.length >= 4) return;

    const player = gameState.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return; 

    const cardToPlay = player.hand[cardIndex];

    if (!isValidPlay(player.hand, cardToPlay, gameState.currentTrick)) {
      socket.emit('INVALID_PLAY', 'You must follow the strict rules!');
      return; 
    }

    if (cardToPlay.suit === 'spades') gameState.spadesBroken = true;

    player.hand.splice(cardIndex, 1);
    gameState.currentTrick.push({ playerIndex, card: cardToPlay });

    if (gameState.currentTrick.length < 4) {
      gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % 4;
    } else {
      let winningPlay = gameState.currentTrick[0];
      const leadSuit = winningPlay.card.suit;

      for (let i = 1; i < 4; i++) {
        const play = gameState.currentTrick[i];
        const winCard = winningPlay.card;
        const playCard = play.card;

        if (playCard.suit === 'spades') {
          if (winCard.suit !== 'spades' || playCard.rank > winCard.rank) {
            winningPlay = play;
          }
        } else if (playCard.suit === leadSuit && winCard.suit === leadSuit) {
          if (playCard.rank > winCard.rank) {
            winningPlay = play;
          }
        }
      }

      gameState.players[winningPlay.playerIndex].tricksWon += 1;
      gameState.currentTurnIndex = winningPlay.playerIndex; 

      setTimeout(() => {
        gameState.currentTrick = [];
        
        if (gameState.players[0].hand.length === 0) {
          const roundRecord = { round: gameState.round, playerResults: [] };

          gameState.players.forEach(p => {
            let pointsChange = 0;
            if (p.tricksWon >= p.bid) {
              pointsChange = p.bid; 
            } else {
              pointsChange = -p.bid; 
            }
            p.score += pointsChange;

            roundRecord.playerResults.push({
              bid: p.bid, won: p.tricksWon, change: pointsChange, totalAfter: p.score
            });
          });

          gameState.history.push(roundRecord);

          const scores = gameState.players.map(p => p.score);
          const maxScore = Math.max(...scores);
          const hasTie = new Set(scores).size !== scores.length; 

          if (maxScore >= 26) {
            if (hasTie && maxScore > 15) {
              gameState.overtimeRound += 1;
              if (gameState.overtimeRound > 3) {
                gameState.phase = 'game_over'; 
              } else {
                gameState.phase = 'scoring';
                gameState.overtimeActive = true;
              }
            } else {
              gameState.phase = 'game_over';
            }
          } else {
            gameState.phase = 'scoring';
            gameState.overtimeActive = false;
          }
        }
        io.emit('STATE_UPDATE', gameState);
      }, 3000); 
    }
    
    io.emit('STATE_UPDATE', gameState);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Spades Engine listening on port ${PORT}`));
