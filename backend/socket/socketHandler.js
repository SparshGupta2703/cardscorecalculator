const roomRepo = require('../repository/roomRepository');
const gameService = require('../services/gameService');
const ytSearch = require('yt-search');

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
    
    // ==========================================
    // MUSIC PLAYER / DJ BOOTH LOGIC
    // ==========================================

   socket.on('SEARCH_YOUTUBE', async (query) => {
      try {
        // Scrape YouTube silently on the server
        const r = await ytSearch(query);
        // Grab the top 5 video results
        const videos = r.videos.slice(0, 5).map(v => ({
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail,
          duration: v.timestamp
        }));
        
        // Send the results back ONLY to the player who searched
        socket.emit('YOUTUBE_RESULTS', videos);
      } catch (err) {
        console.error("YouTube Search Error:", err);
      }
    });

    socket.on('UPDATE_TRACK', ({ roomId, url }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      room.gameState.musicState.url = url;
      room.gameState.musicState.isPlaying = true;
      room.gameState.musicState.playedSeconds = 0;
      
      broadcastState(roomId);
    });

    socket.on('TOGGLE_PLAY', ({ roomId, isPlaying }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      room.gameState.musicState.isPlaying = isPlaying;
      broadcastState(roomId);
    });

    socket.on('SYNC_TIME', ({ roomId, playedSeconds }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      room.gameState.musicState.playedSeconds = playedSeconds;
      broadcastState(roomId);
    });

    socket.on('CREATE_ROOM',({ roomName, password, username, targetScore }) => {
      try {
        console.log(`[CREATE_ROOM] Request from: ${username}`);
        const roomId = Math.random().toString(36).substring(2, 9);
        const sessionId = Math.random().toString(36).substring(2, 15); 
        
        const newRoom = roomRepo.createRoom(roomId, {
          id: roomId, 
          name: roomName, 
          password: password, 
          gameState: gameService.createInitialGameState(password),
          gameState: gameService.createInitialGameState(password, parseInt(targetScore, 10) || 26)
        });
        
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

    // --- HANDLE UPLOADED SELFIES ---
    socket.on('USE_CUSTOM_FACES', ({ roomId, cardFaces }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      room.gameState.customFaceMap = { 
        ...room.gameState.customFaceMap, 
        ...cardFaces 
      };
      broadcastState(roomId);
    });

    socket.on('REMOVE_CUSTOM_FACES', ({ roomId }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      room.gameState.customFaceMap = {}; 
      broadcastState(roomId);
    });

    socket.on('START_GAME', async (roomId) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      
      try {
        let allAvailableFaces = [];

        if (room.gameState.customFaceMap) {
          const memoryFaces = Object.values(room.gameState.customFaceMap).filter(url => url);
          allAvailableFaces.push(...memoryFaces);
        }

        try {
          const User = require('../models/User'); 
          const seatedUsernames = room.gameState.players.map(p => p.username || p.name).filter(Boolean);
          
          if (seatedUsernames.length > 0) {
            const usersInGame = await User.find({ username: { $in: seatedUsernames } });
            const dbFaces = usersInGame.map(u => u.pfp).filter(url => url);
            allAvailableFaces.push(...dbFaces);
          }
        } catch (dbErr) {
          console.log("DB Face Fetch skipped, relying on memory:", dbErr.message);
        }

        const uniqueFaces = [...new Set(allAvailableFaces)];
        room.gameState.customFaceMap = {};

        if (uniqueFaces.length > 0) {
          for (let i = uniqueFaces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueFaces[i], uniqueFaces[j]] = [uniqueFaces[j], uniqueFaces[i]];
          }

          const ranks = [11, 12, 13, 14];
          for (let i = ranks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
          }

          for (let i = 0; i < uniqueFaces.length; i++) {
            if (i < 4) { 
              room.gameState.customFaceMap[ranks[i]] = uniqueFaces[i];
            }
          }
        }
      } catch (err) {
        console.error("Multiplayer Face Shuffle Error:", err);
      }

      room.gameState.round = 1;
      room.gameState.overtimeRound = 0;
      room.gameState.overtimeActive = false;
      room.gameState.history = [];
      room.gameState.players.forEach(p => p.score = 0);
      
      room.gameState.dealerIndex = 0;
      room.gameState.currentTurnIndex = 1; 
      gameService.dealCards(room.gameState);
      broadcastState(roomId);
    });

    socket.on('JOIN_ROOM', ({ roomId, password, username }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return socket.emit('ROOM_ERROR', 'Room not found.');
      if (room.password !== password) return socket.emit('ROOM_ERROR', 'Incorrect password.');

      const emptySeatIndex = room.gameState.players.findIndex(p => !p.socketId);
      if (emptySeatIndex === -1) return socket.emit('ROOM_ERROR', 'Room is full.');

      const sessionId = generateSessionId(); 
      
      room.gameState.players[emptySeatIndex].name = username;
      room.gameState.players[emptySeatIndex].socketId = socket.id;
      room.gameState.players[emptySeatIndex].sessionId = sessionId; 

      socket.join(roomId);
      socket.emit('ROOM_JOINED', { roomId, seatIndex: emptySeatIndex, sessionId });
      io.emit('ROOM_LIST', getPublicRooms());
      broadcastState(roomId);
    });

    socket.on('REJOIN_ROOM', ({ roomId, sessionId }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return socket.emit('REJOIN_FAILED', 'Room ended or not found.');

      const playerIndex = room.gameState.players.findIndex(p => p.sessionId === sessionId);
      if (playerIndex === -1) return socket.emit('REJOIN_FAILED', 'Invalid session.');

      room.gameState.players[playerIndex].socketId = socket.id;
      
      socket.join(roomId);
      socket.emit('ROOM_JOINED', { roomId, seatIndex: playerIndex, sessionId });
      io.emit('ROOM_LIST', getPublicRooms());
      broadcastState(roomId);
    });
   
    socket.on('NEXT_ROUND', (roomId) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;

      room.gameState.dealerIndex = (room.gameState.dealerIndex + 1) % 4;
      room.gameState.currentTurnIndex = (room.gameState.dealerIndex + 1) % 4;

      room.gameState.round += 1;
      room.gameState.players.forEach(p => {
        p.bid = null;
        p.tricksWon = 0;
        p.hand = [];
      });

      gameService.dealCards(room.gameState);
      broadcastState(roomId);
    });

<<<<<<< HEAD
   socket.on('SUBMIT_BID', ({ roomId, index, bid }) => {
=======
        socket.on('SUBMIT_BID', ({ roomId, index, bid }) => {
>>>>>>> 189184819e64031c084766c13ea19d9e5afad6a7
      const room = roomRepo.getRoom(roomId);
      if (!room) return;
      const gs = room.gameState;
      if (gs.phase !== 'bidding' || gs.currentTurnIndex !== index) return;
      
      // 1. Record the bid
      gs.players[index].bid = parseInt(bid, 10);
      
      // 2. Advance the turn in a circle (3 -> 0 -> 1)
      gs.currentTurnIndex = (gs.currentTurnIndex + 1) % 4;
      
      // 3. Check if everyone has placed their bid
      const allBidsIn = gs.players.every(p => p.bid !== null);
      
      if (allBidsIn) { 
        gs.phase = 'playing'; 
        // The person to the left of the dealer leads the very first card!
        gs.currentTurnIndex = (gs.dealerIndex + 1) % 4; 
      }
      
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
         
         // === ROUND IS OVER ===
         if (gs.players[0].hand.length === 0) {
           const roundRecord = { round: gs.round, playerResults: [] };
           
           gs.players.forEach(p => {
             // 1. Base Score Change (Did they make their bid?)
             let pointsChange = p.tricksWon >= p.bid ? p.bid : -p.bid;
             
             // ==========================================
             // 2. THE LUCK & BAGS SYSTEM
             // ==========================================
             let bagsTaken = p.tricksWon - p.bid;
             
             // Only count bags if they actually made their bid
             if (bagsTaken > 0 && p.tricksWon >= p.bid) {
               p.bags = (p.bags || 0) + bagsTaken;
               
               // Deduct 0.1 luck per bag
               p.luck -= (bagsTaken * 0.1);
               p.luck = parseFloat(p.luck.toFixed(1)); 
               
               if (p.luck <= 0) p.luck = 1.0; // Reset at rock bottom
             }
             // ==========================================

             p.score += pointsChange;
             roundRecord.playerResults.push({ bid: p.bid, won: p.tricksWon, change: pointsChange, totalAfter: p.score });
           });
           gs.history.push(roundRecord);

           const maxScore = Math.max(...gs.players.map(p => p.score));
           const hasTie = new Set(gs.players.map(p => p.score)).size !== gs.players.length; 

           // ==========================================
           // 3. TARGET SCORE TIE-BREAKER LOGIC
           // ==========================================
           // Uses the dynamic target score set during room creation
           if (maxScore >= gs.targetScore) {
             if (hasTie) {
               gs.overtimeRound += 1;
               gs.phase = gs.overtimeRound > 3 ? 'game_over' : 'scoring';
               gs.overtimeActive = gs.phase === 'scoring';
             } else {
                 gs.phase = 'game_over';
             }
           } else {
             gs.phase = 'scoring'; 
             gs.overtimeActive = false;
           }
         }
         broadcastState(roomId);
       }, 3000);
      }
      broadcastState(roomId);
    });
    
   
    socket.on('GET_ROOMS', () => {
      socket.emit('ROOM_LIST', getPublicRooms());
    });

    socket.on('LEAVE_ROOM', ({ roomId }) => {
      const room = roomRepo.getRoom(roomId);
      if (!room) return;

      const player = room.gameState.players.find(p => p.socketId === socket.id);
      if (player) {
        // 1. Wipe their identity, BUT KEEP THE CARDS, SCORE, AND BID!
        player.name = 'Waiting...';
        player.socketId = null;
        player.sessionId = null;
        
        // 2. Remove them from the socket channel
        socket.leave(roomId);

        // 3. Check if room is empty
        const activePlayers = room.gameState.players.filter(p => p.socketId !== null).length;
        if (activePlayers === 0) {
          roomRepo.deleteRoom(roomId);
        } else {
          broadcastState(roomId);
        }
        io.emit('ROOM_LIST', getPublicRooms());
      }
    });
    // ==========================================
    // THE REFRESH TIMEOUT FIX
    // ==========================================
    socket.on('disconnect', () => {
      const rooms = roomRepo.getAllRooms();
      for (const room of rooms) {
        const playerIndex = room.gameState.players.findIndex(p => p.socketId === socket.id);
        
        if (playerIndex !== -1) {
          const player = room.gameState.players[playerIndex];
          
          // Temporarily unbind the socket, but DO NOT delete the room yet.
          player.socketId = null;
          broadcastState(room.id);
          io.emit('ROOM_LIST', getPublicRooms());

          // Start the 5-second grace period timer
          setTimeout(() => {
            const currentRoom = roomRepo.getRoom(room.id);
            if (!currentRoom) return; 

            const currentPlayer = currentRoom.gameState.players[playerIndex];
            
            // If they still haven't reconnected, clear the seat for a new player
            if (currentPlayer.socketId === null) {
              
              // WIPE IDENTITY, KEEP THE CARDS!
              currentPlayer.name = 'Waiting...';
              currentPlayer.sessionId = null;    

              const activePlayers = currentRoom.gameState.players.filter(p => p.socketId !== null).length;
              if (activePlayers === 0) {
                roomRepo.deleteRoom(currentRoom.id);
              } else {
                broadcastState(currentRoom.id);
              }
              io.emit('ROOM_LIST', getPublicRooms());
            }
          }, 20000); // 20-second grace period for free server lag
        }
      }
    });
  });
};