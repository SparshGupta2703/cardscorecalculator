const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let gameState = {
  players: [
    { id: 0, name: 'Player 1', score: 0 },
    { id: 1, name: 'Player 2', score: 0 },
    { id: 2, name: 'Player 3', score: 0 },
    { id: 3, name: 'Player 4', score: 0 }
  ],
  currentRound: 1,
  phase: 'bidding', 
  currentBidderIndex: 0,
  currentBids: [null, null, null, null],
  roundOutcomes: [null, null, null, null], // Real-time ✓ and × tracking
  history: []
};

io.on('connection', (socket) => {
  socket.emit('STATE_UPDATE', gameState);

  socket.on('UPDATE_PLAYER_NAME', ({ index, name }) => {
    gameState.players[index].name = name;
    io.emit('STATE_UPDATE', gameState);
  });

  socket.on('SUBMIT_BID', ({ index, bid }) => {
    if (gameState.phase !== 'bidding') return;
    
    gameState.currentBids[index] = parseInt(bid, 10);
    
    if (gameState.currentBidderIndex < 3) {
      gameState.currentBidderIndex += 1;
    } else {
      gameState.phase = 'scoring';
    }
    io.emit('STATE_UPDATE', gameState);
  });

  // New Listener: Instantly sync ✓ and × clicks across all screens
  socket.on('TOGGLE_OUTCOME', ({ index, made }) => {
    if (gameState.phase !== 'scoring') return;
    gameState.roundOutcomes[index] = made;
    io.emit('STATE_UPDATE', gameState);
  });

  socket.on('COMPLETE_ROUND', () => {
    if (gameState.phase !== 'scoring' || gameState.roundOutcomes.includes(null)) return;

    const roundHistory = {
      round: gameState.currentRound,
      playerResults: []
    };

    gameState.roundOutcomes.forEach((made, i) => {
      const bid = gameState.currentBids[i];
      const change = made ? bid : -bid;
      gameState.players[i].score += change;

      roundHistory.playerResults.push({
        bid, made, change, totalAfter: gameState.players[i].score
      });
    });

    gameState.history.push(roundHistory);

    // Reset for next round
    gameState.currentRound += 1;
    gameState.phase = 'bidding';
    gameState.currentBidderIndex = 0;
    gameState.currentBids = [null, null, null, null];
    gameState.roundOutcomes = [null, null, null, null]; // Reset outcomes

    io.emit('STATE_UPDATE', gameState);
  });

  socket.on('RESET_GAME', () => {
    gameState = {
      players: gameState.players.map(p => ({ ...p, score: 0, name: p.name })),
      currentRound: 1,
      phase: 'bidding',
      currentBidderIndex: 0,
      currentBids: [null, null, null, null],
      roundOutcomes: [null, null, null, null],
      history: []
    };
    io.emit('STATE_UPDATE', gameState);
  });
});

const PORT = 4000;
server.listen(PORT, () => console.log(`Socket server listening on port ${PORT}`));