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
      try {
        console.log(`[CREATE_ROOM] Request from: ${username}`);
        const roomId = Math.random().toString(36).substring(2, 9);
        const sessionId = Math.random().toString(36).substring(2, 15); 
        
        const newRoom = roomRepo.createRoom(roomId, {
          id: roomId, 
          name: roomName, 
          password: password, 
          gameState: gameService.createInitialGameState(password)
        });
        
        // Fallback to "Player 1" just in case the auth context drops
        newRoom.gameState.players[0].name = username || 'Player 1';
        newRoom.gameState.players[0].socketId = socket.id;
        newRoom.gameState.players[0].sessionId = sessionId; 
        
        socket.join(roomId);
        socket.emit('ROOM_JOINED', { roomId, seatIndex: 0, sessionId });
        io.emit('ROOM_LIST', getPublicRooms());
        broadcastState(roomId);
      } catch (err) {
        console.error("Error creating room:", err);
        socket.emit('ROOM_ERROR', 'Server error: Failed to create table.');
      }
    });

    // --- NEW: HANDLE UPLOADED SELFIES ---
   // Add custom MongoDB faces to the deck
    socket.on('USE_CUSTOM_FACES', ({ roomId, cardFaces }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      // Merges the user's customized faces right into the active game's deck!
      room.gameState.customFaceMap = { 
        ...room.gameState.customFaceMap, 
        ...cardFaces 
      };
      broadcastState(roomId);
    });

    // Remove them if they uncheck the box
    socket.on('REMOVE_CUSTOM_FACES', ({ roomId }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      room.gameState.customFaceMap = {}; // Resets deck back to normal
      broadcastState(roomId);
    });
  // 1. ADD 'async' right here!
   socket.on('START_GAME', async (roomId) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      try {
        let allAvailableFaces = [];

        // 1. BACKUP: Grab any faces that were already loaded into the room memory
        if (room.gameState.customFaceMap) {
          const memoryFaces = Object.values(room.gameState.customFaceMap).filter(url => url);
          allAvailableFaces.push(...memoryFaces);
        }

        // 2. PRIMARY: Try to fetch EVERYONE'S real face from the database
        try {
          const User = require('../models/User'); // Grabs the DB model
          // Looks for 'username' or 'name' just in case your player object uses a different key
          const seatedUsernames = room.gameState.players.map(p => p.username || p.name).filter(Boolean);
          
          if (seatedUsernames.length > 0) {
            const usersInGame = await User.find({ username: { $in: seatedUsernames } });
            const dbFaces = usersInGame.map(u => u.pfp).filter(url => url);
            allAvailableFaces.push(...dbFaces);
          }
        } catch (dbErr) {
          console.log("DB Face Fetch skipped, relying on memory:", dbErr.message);
        }

        // 3. DE-DUPLICATE: This turns 4 Toucans into just 1 Toucan
        const uniqueFaces = [...new Set(allAvailableFaces)];

        // 4. Safely clear the map to prepare for 1-to-1 assignments
        room.gameState.customFaceMap = {};

        if (uniqueFaces.length > 0) {
          // Shuffle the unique faces
          for (let i = uniqueFaces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueFaces[i], uniqueFaces[j]] = [uniqueFaces[j], uniqueFaces[i]];
          }

          // Shuffle the 4 Royal Ranks (11=J, 12=Q, 13=K, 14=A)
          const ranks = [11, 12, 13, 14];
          for (let i = ranks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
          }

          // 5. THE MAGIC: Map exactly 1 unique face to 1 random card rank!
          // If you are the only one with a PFP, it only loops once.
          for (let i = 0; i < uniqueFaces.length; i++) {
            if (i < 4) { // Safety limit: Max 4 card types
              room.gameState.customFaceMap[ranks[i]] = uniqueFaces[i];
            }
          }
        }
      } catch (err) {
        console.error("Multiplayer Face Shuffle Error:", err);
      }

      // Standard Game Reset Logic
      room.gameState.round = 1;
      room.gameState.overtimeRound = 0;
      room.gameState.overtimeActive = false;
      room.gameState.history = [];
      room.gameState.players.forEach(p => p.score = 0);
      
      // Add this right before gameService.dealCards(room.gameState);
      room.gameState.dealerIndex = 0;
      room.gameState.currentTurnIndex = 1; // Player 1 starts the bidding
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

  // 1. Shift the dealer one seat to the left
  room.gameState.dealerIndex = (room.gameState.dealerIndex + 1) % 4;

  // 2. The person left of the NEW dealer starts the bidding
  room.gameState.currentTurnIndex = (room.gameState.dealerIndex + 1) % 4;

  // 3. Reset round stats
  room.gameState.round += 1;
  room.gameState.players.forEach(p => {
    p.bid = null;
    p.tricksWon = 0;
    p.hand = [];
  });

  // 4. Deal and broadcast
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