import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { socket } from './socket/socketClient';
import toast, { Toaster } from 'react-hot-toast';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import './App.css'; 

function GameRouter() {
  const navigate = useNavigate();
  const [availableRooms, setAvailableRooms] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [playingAs, setPlayingAs] = useState(null); 

  // --- 1. CHECK LOCAL STORAGE ON PAGE LOAD ---
  useEffect(() => {
    const savedSession = localStorage.getItem('spades_session');
    if (savedSession) {
      const { roomId, sessionId } = JSON.parse(savedSession);
      socket.emit('REJOIN_ROOM', { roomId, sessionId });
    }
  }, []); // Only runs once when the app first opens or refreshes

  useEffect(() => {
    socket.on('ROOM_LIST', (rooms) => setAvailableRooms(rooms));
    
    // --- 2. SAVE TO LOCAL STORAGE WHEN JOINING ---
    socket.on('ROOM_JOINED', ({ roomId, seatIndex, sessionId }) => {
      localStorage.setItem('spades_session', JSON.stringify({ roomId, sessionId }));
      setRoomId(roomId);
      setPlayingAs(seatIndex);
      toast.success('Connected to table!');
      navigate(`/room/${roomId}`); 
    });

    // --- 3. CLEAR LOCAL STORAGE IF ROOM IS DEAD ---
    socket.on('REJOIN_FAILED', (msg) => {
      localStorage.removeItem('spades_session');
      toast.error(msg);
      navigate('/');
    });

    socket.on('ROOM_ERROR', (msg) => toast.error(msg));
    socket.on('STATE_UPDATE', (state) => setGameState(state));
    socket.on('INVALID_PLAY', (msg) => toast.error(msg));

    return () => {
      socket.off('ROOM_LIST'); 
      socket.off('ROOM_JOINED'); 
      socket.off('REJOIN_FAILED');
      socket.off('ROOM_ERROR');
      socket.off('STATE_UPDATE'); 
      socket.off('INVALID_PLAY');
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<LobbyPage availableRooms={availableRooms} />} />
      <Route path="/room/:id" element={<GamePage gameState={gameState} roomId={roomId} playingAs={playingAs} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="theme-wrapper dark-theme">
      <Toaster position="top-center" />
      <BrowserRouter>
        <GameRouter />
      </BrowserRouter>
    </div>
  );
}