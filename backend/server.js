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

// --- ROOMS DATA STORE ---
const rooms = {};

// Generate Deck Helper
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

// Initial Game State Factory
function createInitialGameState() {
  return {
    players: [
      { id: 0, name: 'Waiting...', socketId: null, score: 0, hand: [], bid: null, tricksWon: 0 },
      { id: 1, name: 'Waiting...', socketId: null, score: 0, hand: [], bid: null, tricksWon: 0 },
      { id: 2, name: 'Waiting...', socketId: null, score: 0, hand: [], bid: null, tricksWon: 0 },
      { id: 3, name: 'Waiting...', socketId: null, score: 0, hand: [], bid: null, tricksWon: 0 }
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
}

// Anti-Cheat: Hides opponents' cards before sending to a specific player
function getMaskedState(gameState, mySeatIndex) {
  const masked = JSON.parse(JSON.stringify(gameState)); // Deep copy
  masked.players.forEach((p, index) => {
    if (index !== mySeatIndex) {
      // Replace actual cards with blank face-down placeholders
      p.hand = p.hand.map((_, i) => ({ id: `hidden-${index}-${i}`, suit: 'hidden', rank: 0 }));
    }
  });
  return masked;
}

// Push tailored updates to every specific player in a room
function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.gameState.players.forEach((p, index) => {
    if (p.socketId) {
      io.to(p.socketId).emit('STATE_UPDATE', getMaskedState(room.gameState, index));
    }
  });
}

function getPublicRooms() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    playersCount: r.gameState.players.filter(p => p.socketId).length
  }));
}

// Logic Rules
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

function dealCards(gameState) {
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
  // Send available rooms on connect
  socket.emit('ROOM_LIST', getPublicRooms());

  // --- LOBBY LOGIC ---
  socket.on('CREATE_ROOM', ({ roomName, password, username }) => {
    const roomId = Math.random().toString(36).substring(2, 9);
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      password: password,
      gameState: createInitialGameState()
    };
    
    // Creator takes Seat 0
    rooms[roomId].gameState.players[0].name = username;
    rooms[roomId].gameState.players[0].socketId = socket.id;
    
    socket.join(roomId);
    socket.emit('ROOM_JOINED', { roomId, seatIndex: 0 });
    io.emit('ROOM_LIST', getPublicRooms());
    broadcastState(roomId);
  });

  socket.on('JOIN_ROOM', ({ roomId, password, username }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('ROOM_ERROR', 'Room not found.');
    if (room.password !== password) return socket.emit('ROOM_ERROR', 'Incorrect password.');

    const emptySeatIndex = room.gameState.players.findIndex(p => !p.socketId);
    if (emptySeatIndex === -1) return socket.emit('ROOM_ERROR', 'Room is full.');

    room.gameState.players[emptySeatIndex].name = username;
    room.gameState.players[emptySeatIndex].socketId = socket.id;

    socket.join(roomId);
    socket.emit('ROOM_JOINED', { roomId, seatIndex: emptySeatIndex });
    io.emit('ROOM_LIST', getPublicRooms());
    broadcastState(roomId);
  });

  // --- GAME LOGIC ---
  socket.on('START_GAME', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    room.gameState.round = 1;
    room.gameState.overtimeRound = 0;
    room.gameState.overtimeActive = false;
    room.gameState.history = [];
    room.gameState.players.forEach(p => p.score = 0);
    dealCards(room.gameState);
    broadcastState(roomId);
  });

  socket.on('NEXT_ROUND', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    room.gameState.round += 1;
    dealCards(room.gameState);
    broadcastState(roomId);
  });

  socket.on('SUBMIT_BID', ({ roomId, index, bid }) => {
    const room = rooms[roomId];
    if (!room) return;
    const gs = room.gameState;
    
    if (gs.phase !== 'bidding' || gs.currentTurnIndex !== index) return;
    
    gs.players[index].bid = parseInt(bid, 10);
    
    if (gs.currentTurnIndex < 3) {
      gs.currentTurnIndex += 1;
    } else {
      gs.phase = 'playing';
      gs.currentTurnIndex = 0;
    }
    broadcastState(roomId);
  });

  socket.on('PLAY_CARD', ({ roomId, playerIndex, cardId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const gs = room.gameState;

    if (gs.phase !== 'playing' || gs.currentTurnIndex !== playerIndex || gs.currentTrick.length >= 4) return;

    const player = gs.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return; 

    const cardToPlay = player.hand[cardIndex];

    if (!isValidPlay(player.hand, cardToPlay, gs.currentTrick)) {
      socket.emit('INVALID_PLAY', 'You must follow the strict rules!');
      return; 
    }

    if (cardToPlay.suit === 'spades') gs.spadesBroken = true;

    player.hand.splice(cardIndex, 1);
    gs.currentTrick.push({ playerIndex, card: cardToPlay });

    if (gs.currentTrick.length < 4) {
      gs.currentTurnIndex = (gs.currentTurnIndex + 1) % 4;
    } else {
      let winningPlay = gs.currentTrick[0];
      const leadSuit = winningPlay.card.suit;

      for (let i = 1; i < 4; i++) {
        const play = gs.currentTrick[i];
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

      gs.players[winningPlay.playerIndex].tricksWon += 1;
      gs.currentTurnIndex = winningPlay.playerIndex; 

      setTimeout(() => {
        gs.currentTrick = [];
        
        if (gs.players[0].hand.length === 0) {
          const roundRecord = { round: gs.round, playerResults: [] };

          gs.players.forEach(p => {
            let pointsChange = 0;
            if (p.tricksWon >= p.bid) pointsChange = p.bid; 
            else pointsChange = -p.bid; 
            
            p.score += pointsChange;
            roundRecord.playerResults.push({ bid: p.bid, won: p.tricksWon, change: pointsChange, totalAfter: p.score });
          });

          gs.history.push(roundRecord);

          const scores = gs.players.map(p => p.score);
          const maxScore = Math.max(...scores);
          const hasTie = new Set(scores).size !== scores.length; 

          if (maxScore >= 26) {
            if (hasTie && maxScore > 15) {
              gs.overtimeRound += 1;
              if (gs.overtimeRound > 3) gs.phase = 'game_over'; 
              else { gs.phase = 'scoring'; gs.overtimeActive = true; }
            } else gs.phase = 'game_over';
          } else {
            gs.phase = 'scoring'; gs.overtimeActive = false;
          }
        }
        broadcastState(roomId);
      }, 3000); 
    }
    broadcastState(roomId);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const player = room.gameState.players.find(p => p.socketId === socket.id);
      if (player) {
        player.socketId = null;
        player.name = 'Disconnected';
        
        // Check if ANY players are left in this room
        const activePlayers = room.gameState.players.filter(p => p.socketId !== null);
        if (activePlayers.length === 0) {
          delete rooms[roomId]; // Delete room if 0 members remain!
        } else {
          broadcastState(roomId);
        }
        
        io.emit('ROOM_LIST', getPublicRooms());
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Spades Casino Engine running on port ${PORT}`));