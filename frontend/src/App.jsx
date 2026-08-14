import React, { useState, useEffect, useContext } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { socket } from './socket/socketClient';
import toast, { Toaster } from 'react-hot-toast';
import { AuthProvider, AuthContext } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import './App.css'; 
import ProfilePage from './pages/ProfilePage';

function GameRouter() {
  const navigate = useNavigate();
  const { user, token } = useContext(AuthContext); // Pull user from Auth Context
  const [availableRooms, setAvailableRooms] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [playingAs, setPlayingAs] = useState(null); 

  useEffect(() => {
    // If not authenticated, do not connect socket
    if (!token || !user) return; 

    // --- Pass the token to the socket connection if needed, or emit it on join ---
    socket.emit('AUTHENTICATE', token); 

    socket.on('ROOM_LIST', (rooms) => setAvailableRooms(rooms));
    
    // When joining, we no longer need to prompt for username!
    socket.on('ROOM_JOINED', ({ roomId, seatIndex }) => {
      setRoomId(roomId);
      setPlayingAs(seatIndex);
      navigate(`/room/${roomId}`); 
    });

    socket.on('STATE_UPDATE', (state) => setGameState(state));
    
    return () => {
      socket.off('ROOM_LIST'); socket.off('ROOM_JOINED'); socket.off('STATE_UPDATE');
    };
  }, [navigate, token, user]);

  // If no user is logged in, force them to the Auth Screen
  if (!user) return <AuthPage />;

  return (
    <Routes>
      {/* We pass the 'user' object into the Lobby so it can use user.username automatically */}
      <Route path="/" element={<LobbyPage availableRooms={availableRooms} user={user} />} />
      <Route path="/room/:id" element={<GamePage gameState={gameState} roomId={roomId} playingAs={playingAs} user={user} />} />
      <Route path="/profile" element={<ProfilePage/>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="theme-wrapper dark-theme">
        <Toaster position="top-center" />
        <BrowserRouter>
          <GameRouter />
        </BrowserRouter>
      </div>
    </AuthProvider>
  );
}