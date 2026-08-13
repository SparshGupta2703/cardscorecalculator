const roomRepo = require('../repository/roomRepository');
const gameService = require('../services/gameService');

module.exports = (io) => {
  const getPublicRooms = () => roomRepo.getAllRooms().map(r => ({
    id: r.id, name: r.name, playersCount: r.gameState.players.filter(p => p.socketId).length
  }));

  const broadcastState = (roomId) => {
    const room = roomRepo.getRoom(roomId);
    if (!room) return;
    room.gameState.players.forEach((p, index) => {
      if (p.socketId) {
        io.to(p.socketId).emit('STATE_UPDATE', gameService.getMaskedState(room.gameState, index));
      }
    });
  };

  const generateSessionId = () => Math.random().toString(36).substring(2, 15);

  io.on('connection', (socket) => {
    socket.emit('ROOM_LIST', getPublicRooms());

   socket.on('CREATE_ROOM', ({ roomName, password, username }) => {
      const roomId = Math.random().toString(36).substring(2, 9);
      const sessionId = generateSessionId(); 
      
      const newRoom = roomRepo.createRoom(roomId, {
        // ADDED: Pass password into createInitialGameState
        id: roomId, name: roomName, password, gameState: gameService.createInitialGameState(password)
      });
      
      newRoom.gameState.players[0].name = username;
      newRoom.gameState.players[0].socketId = socket.id;
      newRoom.gameState.players[0].sessionId = sessionId; 
      
      socket.join(roomId);
      socket.emit('ROOM_JOINED', { roomId, seatIndex: 0, sessionId });
      io.emit('ROOM_LIST', getPublicRooms());
      broadcastState(roomId);
    });

    // --- NEW: HANDLE UPLOADED SELFIES ---
    socket.on('UPLOAD_FACE', ({ roomId, imageUrl }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      // Cap at 4 faces total
      if (room.gameState.uploadedFaces.length < 4) {
        room.gameState.uploadedFaces.push(imageUrl);
        broadcastState(roomId);
      }
    });

    socket.on('START_GAME', (roomId) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      // --- NEW: RANDOMIZE FACES ---
      const faces = [...room.gameState.uploadedFaces];
      for (let i = faces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [faces[i], faces[j]] = [faces[j], faces[i]];
      }
      
      // Map random faces to Jack (11), Queen (12), King (13), Ace (14)
      const faceRanks = [11, 12, 13, 14];
      room.gameState.customFaceMap = {};
      faces.forEach((url, i) => {
        if (faceRanks[i]) room.gameState.customFaceMap[faceRanks[i]] = url;
      });

      room.gameState.round = 1;
      room.gameState.overtimeRound = 0;
      room.gameState.overtimeActive = false;
      room.gameState.history = [];
      room.gameState.players.forEach(p => p.score = 0);
      gameService.dealCards(room.gameState);
      broadcastState(roomId);
    });
    socket.on('JOIN_ROOM', ({ roomId, password, username }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return socket.emit('ROOM_ERROR', 'Room not found.');
      if (room.password !== password) return socket.emit('ROOM_ERROR', 'Incorrect password.');

      const emptySeatIndex = room.gameState.players.findIndex(p => !p.socketId);
      if (emptySeatIndex === -1) return socket.emit('ROOM_ERROR', 'Room is full.');

      const sessionId = generateSessionId(); // Create secret token
      
      room.gameState.players[emptySeatIndex].name = username;
      room.gameState.players[emptySeatIndex].socketId = socket.id;
      room.gameState.players[emptySeatIndex].sessionId = sessionId; // Lock seat to token

      socket.join(roomId);
      // Send the token back to the joiner
      socket.emit('ROOM_JOINED', { roomId, seatIndex: emptySeatIndex, sessionId });
      io.emit('ROOM_LIST', getPublicRooms());
      broadcastState(roomId);
    });

    // --- NEW REJOIN EVENT ---
    socket.on('REJOIN_ROOM', ({ roomId, sessionId }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return socket.emit('REJOIN_FAILED', 'Room ended or not found.');

      // Find the specific seat tied to this user's secret token
      const playerIndex = room.gameState.players.findIndex(p => p.sessionId === sessionId);
      if (playerIndex === -1) return socket.emit('REJOIN_FAILED', 'Invalid session.');

      // Reclaim the seat!
      room.gameState.players[playerIndex].socketId = socket.id;
      
      socket.join(roomId);
      socket.emit('ROOM_JOINED', { roomId, seatIndex: playerIndex, sessionId });
      io.emit('ROOM_LIST', getPublicRooms());
      broadcastState(roomId);
    });
   
    socket.on('NEXT_ROUND', (roomId) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      room.gameState.round += 1;
      gameService.dealCards(room.gameState);
      broadcastState(roomId);
    });

    socket.on('SUBMIT_BID', ({ roomId, index, bid }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      const gs = room.gameState;
      if (gs.phase !== 'bidding' || gs.currentTurnIndex !== index) return;
      
      gs.players[index].bid = parseInt(bid, 10);
      if (gs.currentTurnIndex < 3) gs.currentTurnIndex += 1;
      else { gs.phase = 'playing'; gs.currentTurnIndex = 0; }
      broadcastState(roomId);
    });

    socket.on('PLAY_CARD', ({ roomId, playerIndex, cardId }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      const gs = room.gameState;

      if (gs.phase !== 'playing' || gs.currentTurnIndex !== playerIndex || gs.currentTrick.length >= 4) return;

      const player = gs.players[playerIndex];
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return; 

      const cardToPlay = player.hand[cardIndex];

      if (!gameService.isValidPlay(player.hand, cardToPlay, gs.currentTrick)) {
        return socket.emit('INVALID_PLAY', 'You must follow the strict rules!');
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
          const playCard = gs.currentTrick[i].card;
          const winCard = winningPlay.card;
          if (playCard.suit === 'spades') {
            if (winCard.suit !== 'spades' || playCard.rank > winCard.rank) winningPlay = gs.currentTrick[i];
          } else if (playCard.suit === leadSuit && winCard.suit === leadSuit) {
            if (playCard.rank > winCard.rank) winningPlay = gs.currentTrick[i];
          }
        }
        gs.players[winningPlay.playerIndex].tricksWon += 1;
        gs.currentTurnIndex = winningPlay.playerIndex; 

        setTimeout(() => {
          gs.currentTrick = [];
          if (gs.players[0].hand.length === 0) {
            const roundRecord = { round: gs.round, playerResults: [] };
            gs.players.forEach(p => {
              let pointsChange = p.tricksWon >= p.bid ? p.bid : -p.bid;
              p.score += pointsChange;
              roundRecord.playerResults.push({ bid: p.bid, won: p.tricksWon, change: pointsChange, totalAfter: p.score });
            });
            gs.history.push(roundRecord);

            const maxScore = Math.max(...gs.players.map(p => p.score));
            const hasTie = new Set(gs.players.map(p => p.score)).size !== gs.players.length; 

            if (maxScore >= 26) {
              if (hasTie && maxScore > 15) {
                gs.overtimeRound += 1;
                gs.phase = gs.overtimeRound > 3 ? 'game_over' : 'scoring';
                gs.overtimeActive = gs.phase === 'scoring';
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
      const rooms = roomRepo.getAllRooms();
      for (const room of rooms) {
        const player = room.gameState.players.find(p => p.socketId === socket.id);
        if (player) {
          player.socketId = null;
          player.name = 'Disconnected';
          if (room.gameState.players.filter(p => p.socketId !== null).length === 0) {
            roomRepo.deleteRoom(room.id);
          } else {
            broadcastState(room.id);
          }
          io.emit('ROOM_LIST', getPublicRooms());
        }
      }
    });
  });
};